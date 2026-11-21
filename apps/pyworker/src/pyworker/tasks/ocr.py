"""Extract page-aligned words from images and PDFs using local language data."""

import io
import math
from contextlib import closing
from dataclasses import dataclass, field
from pathlib import Path
from statistics import median

import pypdfium2 as pdfium
import tesserocr
from PIL import Image, ImageDraw, ImageOps

from .document_types import Page, Word
from .ocr_refinement import map_box, refine_words, sharpen_text

MAX_PIXELS = 4_000_000
PDF_OCR_PIXELS = 9_000_000
TESSDATA = Path(__file__).resolve().parents[3] / "resources" / "tessdata"


@dataclass
class RenderedPage:
    image: Image.Image
    coordinate_size: tuple[int, int]
    size_points: tuple[float, float]
    native: list[Word] = field(default_factory=list)
    needs_ocr: bool = False
    detail: Image.Image | None = None


def _pdf_scale(width, height, pixel_budget):
    return min(300 / 72, math.sqrt(pixel_budget / (width * height)), 12000 / max(width, height))


def _native_words(page, bitmap):
    words = []
    converter = bitmap.get_posconv(page)
    with closing(page.get_textpage()) as text:
        count = text.count_chars()
        if count > 64000:
            raise ValueError("Text limit exceeded")
        chars = []
        boxes = []
        for index in range(count + 1):
            char = text.get_text_range(index, 1) if index < count else " "
            if not char or char.isspace():
                if chars and boxes:
                    x, y, right, bottom = zip(*boxes, strict=True)
                    region = (
                        max(0, min(x)),
                        max(0, min(y)),
                        min(bitmap.width, max(right)),
                        min(bitmap.height, max(bottom)),
                    )
                    if region[0] < region[2] and region[1] < region[3]:
                        words.append(Word(text="".join(chars), box=region))
                chars, boxes = [], []
            else:
                lft, low, rgt, high = text.get_charbox(index)
                x, y = converter.to_bitmap(lft, low)
                r, b = converter.to_bitmap(rgt, high)
                chars.append(char)
                boxes.append((min(x, r), min(y, b), max(x, r), max(y, b)))
    return words


def render_pages(data, *, extract=False, page_index=None, on_count=None):
    if data.startswith(b"%PDF-"):
        with pdfium.PdfDocument(data) as document:
            if not 1 <= len(document) <= 12:
                raise ValueError("PDF page limit exceeded")
            indices = range(len(document)) if page_index is None else [page_index]
            if on_count:
                on_count(len(indices))
            for index in indices:
                with closing(document[index]) as page:
                    width, height = page.get_size()
                    if min(width, height) <= 0:
                        raise ValueError("Invalid page")
                    export_scale = _pdf_scale(width, height, MAX_PIXELS)
                    coordinate_size = (
                        math.ceil(width * export_scale),
                        math.ceil(height * export_scale),
                    )
                    scale = _pdf_scale(width, height, PDF_OCR_PIXELS) if extract else export_scale
                    with closing(page.render(scale=scale, draw_annots=True)) as bitmap:
                        native = _native_words(page, bitmap) if extract else []
                        needs_ocr = extract and (
                            not native
                            or any(
                                obj.type != pdfium.raw.FPDF_PAGEOBJ_TEXT
                                for obj in page.get_objects()
                            )
                        )
                        yield RenderedPage(
                            bitmap.to_pil().convert("RGB"),
                            coordinate_size,
                            (width, height),
                            native,
                            needs_ocr,
                        )
        return
    with Image.open(io.BytesIO(data), formats=("JPEG", "PNG")) as image:
        if image.width * image.height > 24_000_000 or getattr(image, "n_frames", 1) != 1:
            raise ValueError("Image dimensions exceed limit")
        if on_count:
            on_count(1)
        oriented = ImageOps.exif_transpose(image).convert("RGBA")
        result = Image.new("RGB", oriented.size, "white")
        result.paste(oriented, mask=oriented.getchannel("A"))
        oriented.close()
        detail = None
        if max(result.size) > 3000:
            if extract:
                detail = result
                result = result.copy()
            result.thumbnail((3000, 3000))
        if page_index not in (0, None):
            raise ValueError("Invalid image page")
        yield RenderedPage(
            result,
            result.size,
            (result.width * 72 / 240, result.height * 72 / 240),
            needs_ocr=extract,
            detail=detail,
        )


def same_region(a, b):
    x, y, r, s = a
    left, t, u, v = b
    overlap = max(0, min(r, u) - max(x, left)) * max(0, min(s, v) - max(y, t))
    return overlap > 0.5 * min((r - x) * (s - y), (u - left) * (v - t))


def _scan_words(engine, image, native, *, upside_down=False, scale=1):
    engine.SetImage(image)
    engine.Recognize()
    iterator = engine.GetIterator()
    words = []
    if iterator:
        for item in tesserocr.iterate_level(iterator, tesserocr.RIL.WORD):
            box = item.BoundingBox(tesserocr.RIL.WORD)
            if not box:
                continue
            if upside_down:
                x, y, right, bottom = box
                box = (
                    image.width - right,
                    image.height - bottom,
                    image.width - x,
                    image.height - y,
                )
            if scale != 1:
                x, y, right, bottom = box
                box = (x // scale, y // scale, math.ceil(right / scale), math.ceil(bottom / scale))
            if any(same_region(box, word.box) for word in native):
                continue
            text = (item.GetUTF8Text(tesserocr.RIL.WORD) or "").strip()
            if text:
                words.append(
                    Word(text=text, box=box, confidence=max(0, item.Confidence(tesserocr.RIL.WORD)))
                )
    return words


def _scan_quality(words):
    # Weight by length so a confident punctuation mark cannot decide the orientation.
    length = sum(len(word.text) for word in words)
    return sum(len(word.text) * word.confidence for word in words) / length if length else 0


def _rescan_small_print(engine, image, native, words, upside_down):
    scale = min(3, math.isqrt(MAX_PIXELS // (image.width * image.height)), 12000 // max(image.size))
    if scale < 1:
        return words
    if words and (
        scale == 1
        or len(words) > 250
        or _scan_quality(words) >= 92
        or median(w.box[3] - w.box[1] for w in words) > 16
    ):
        return words
    mode = engine.GetPageSegMode()
    try:
        if not words:
            engine.SetPageSegMode(tesserocr.PSM.SPARSE_TEXT)
        prepared = image.resize(
            (image.width * scale, image.height * scale), Image.Resampling.LANCZOS
        )
        if upside_down:
            prepared = prepared.transpose(Image.Transpose.ROTATE_180)
        with sharpen_text(prepared) as enhanced:
            alternate = _scan_words(engine, enhanced, native, upside_down=upside_down, scale=scale)
    finally:
        engine.SetPageSegMode(mode)
    if not words:
        return [word for word in alternate if word.confidence >= 60]
    if _scan_quality(alternate) < _scan_quality(words) + 3:
        return words
    # A high-confidence partial transcript must not drop a previously detected field.
    if all(any(same_region(old.box, new.box) for new in alternate) for old in words):
        return alternate
    return words


def _insert_by_position(words, new_word, upside_down):
    """Preserve the first pass's reading order and insert into the nearest matching line."""
    x, top, r, bottom = new_word.box
    cx, cy = (x + r) / 2, (top + bottom) / 2
    direction = -1 if upside_down else 1
    same_line = []
    following = []
    for i, word in enumerate(words):
        left, t, right, b = word.box
        dx = direction * ((left + right) / 2 - cx)
        dy = direction * ((t + b) / 2 - cy)
        if min(bottom, b) - max(top, t) >= min(b - t, bottom - top) / 2:
            same_line.append((abs(dx), i if dx >= 0 else i + 1))
        elif dy > 0:
            following.append((dy, direction * (left + right), i))
    if same_line:
        index = min(same_line)[1]
    elif following:
        index = min(following)[2]
    else:
        index = len(words)
    words.insert(index, new_word)


def _recover_fields(engine, image, words, upside_down):
    # Hide known fields so a confident header cannot dominate segmentation again.
    residual = image.convert("L")
    draw = ImageDraw.Draw(residual)
    for word in words:
        x, y, r, b = word.box
        draw.rectangle((x - 1, y - 1, r, b), fill=255)
    bounds = residual.point([255] * 224 + [0] * 32).getbbox()
    if not bounds:
        return
    left, top, right, bottom = bounds
    left, top = max(0, left - 10), max(0, top - 10)
    crop = residual.crop((left, top, min(image.width, right + 10), min(image.height, bottom + 10)))
    if upside_down:
        crop = crop.transpose(Image.Transpose.ROTATE_180)
    mode = engine.GetPageSegMode()
    try:
        engine.SetPageSegMode(tesserocr.PSM.SPARSE_TEXT)
        extra = _scan_words(engine, crop, [], upside_down=upside_down)
    finally:
        engine.SetPageSegMode(mode)
    for word in extra:
        if word.confidence < 60 or not any(c.isalnum() for c in word.text):
            continue
        x, y, r, b = word.box
        word.box = (x + left, y + top, r + left, b + top)
        if not any(same_region(word.box, old.box) for old in words):
            _insert_by_position(words, word, upside_down)


def recognize(data, *, page_index=None, report=None):
    pages = []
    previews = []
    total = 1

    def page_count(count):
        nonlocal total
        total = count
        if report:
            report(0)

    with tesserocr.PyTessBaseAPI(path=str(TESSDATA), lang="pol+eng") as engine:
        for rendered in render_pages(
            data, extract=True, page_index=page_index, on_count=page_count
        ):
            image = rendered.image
            words = list(rendered.native)
            if rendered.needs_ocr:
                scanned = _scan_words(engine, image, rendered.native)
                upside_down = False
                quality = _scan_quality(scanned)
                if quality < 55:
                    with image.transpose(Image.Transpose.ROTATE_180) as rotated:
                        alternate = _scan_words(engine, rotated, rendered.native, upside_down=True)
                    if _scan_quality(alternate) > quality:
                        scanned = alternate
                        upside_down = True
                scanned = _rescan_small_print(engine, image, rendered.native, scanned, upside_down)
                words.extend(scanned)
                _recover_fields(engine, image, words, upside_down)
                refine_words(
                    engine,
                    image,
                    [w for w in words if w.confidence is not None],
                    upside_down=upside_down,
                    detail=rendered.detail,
                )
            width, height = rendered.coordinate_size
            if image.size != rendered.coordinate_size:
                for word in words:
                    word.box = map_box(word.box, image.size, rendered.coordinate_size)
            page = Page(width=width, height=height, words=words)
            pages.append(page.model_dump())
            image.thumbnail((900, 1100))
            preview = io.BytesIO()
            image.save(preview, "JPEG", quality=68)
            previews.append(preview.getvalue())
            if report:
                report(min(99, 100 * len(pages) // total))
    return {"pages": pages, "previews": previews}
