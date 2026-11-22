"""Prepare an in-memory copy for OCR while preserving page geometry."""

from io import BytesIO
from itertools import accumulate

from PIL import Image, ImageChops, ImageFilter, ImageOps

MAX_PIXELS = 45_000_000
MAX_UPLOAD = 20 * 1024 * 1024


def ocr_image(image: Image.Image) -> Image.Image:
    if image.has_transparency_data:
        rgba = image.convert("RGBA")
        original = Image.new("RGB", image.size, "white")
        original.paste(rgba, mask=rgba.getchannel("A"))
    else:
        original = image.convert("RGB")
    histogram = list(accumulate(original.convert("L").histogram()))
    low, high = (
        next(i for i, count in enumerate(histogram) if count >= histogram[-1] * fraction)
        for fraction in (0.01, 0.99)
    )
    if high - low <= 8:
        # A short label can occupy much less than one percent of a white page.
        low = next(i for i, count in enumerate(histogram) if count >= histogram[-1] * 0.0005)
    enhanced = original
    if 8 < high - low < 150:
        gain = min(1.6, 180 / (high - low))
        # Keep light paper light while increasing separation from faint ink.
        curve = [max(0, min(255, round(high + gain * (v - high)))) for v in range(256)]
        enhanced = original.point(curve * 3)
    return enhanced.filter(ImageFilter.UnsharpMask(radius=1, percent=80, threshold=3))


def enhanced_scan_pdf(data: bytes) -> bytes:
    """Replace simple raster scans; retain the original page boxes, text and overlays."""
    from pypdf import PdfReader, PdfWriter

    reader = PdfReader(BytesIO(data))
    if reader.is_encrypted or not 1 <= len(reader.pages) <= 40:
        return data
    writer = PdfWriter(clone_from=reader)
    changed = False
    total_pixels = 0
    processed = set()
    for page in writer.pages:
        resources = page.get("/Resources")
        objects = resources.get_object().get("/XObject") if resources else None
        if not objects or len(objects.get_object()) != 1:
            continue
        name, ref = next(iter(objects.get_object().items()))
        raster = ref.get_object()
        if raster.get("/Subtype") != "/Image" or ref in processed:
            continue
        if any(key in raster for key in ("/Mask", "/SMask", "/ImageMask", "/Decode")):
            continue
        width, height = int(raster["/Width"]), int(raster["/Height"])
        if min(width, height) < 200 or width * height > MAX_PIXELS:
            continue
        total_pixels += width * height
        if total_pixels > 2 * MAX_PIXELS:
            return data
        processed.add(ref)
        source = page.images[name]
        if source.image is None or source.image.mode not in {"L", "RGB"}:
            continue
        enhanced = ocr_image(source.image)
        if ImageChops.difference(enhanced, source.image.convert("RGB")).getbbox():
            source.replace(enhanced, quality=95)
            changed = True
    if not changed:
        return data
    buffer = BytesIO()
    writer.write(buffer)
    return buffer.getvalue() if buffer.tell() <= MAX_UPLOAD else data


def ocr_upload(data: bytes, mime: str) -> bytes:
    """Keep the original upload if the optional enhancement cannot be applied."""
    from pypdf.errors import PyPdfError

    try:
        if mime == "application/pdf":
            return enhanced_scan_pdf(data)
        with Image.open(BytesIO(data)) as image:
            if image.width * image.height > MAX_PIXELS or getattr(image, "is_animated", False):
                return data
            oriented = ImageOps.exif_transpose(image)
            enhanced = ocr_image(oriented)
            if (
                not oriented.has_transparency_data
                and not ImageChops.difference(enhanced, oriented.convert("RGB")).getbbox()
            ):
                return data
            buffer = BytesIO()
            if mime == "image/jpeg":
                enhanced.save(buffer, "JPEG", quality=95)
            else:
                enhanced.save(buffer, "PNG")
            return buffer.getvalue() if buffer.tell() <= MAX_UPLOAD else data
    except (
        OSError,
        ValueError,
        KeyError,
        TypeError,
        IndexError,
        NotImplementedError,
        Image.DecompressionBombError,
        PyPdfError,
    ):
        return data
