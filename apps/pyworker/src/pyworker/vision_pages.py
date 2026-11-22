"""Rasterize pages in an isolated process. PDFium is not thread safe."""

import asyncio
import base64
import json
import math
import sys
from io import BytesIO

from PIL import Image, ImageOps

from pyworker.ocr_image import MAX_PIXELS, ocr_image
from pyworker.reader_loop import with_reader_pipes

MAX_EDGE = 2000
MAX_PAGES = 40
MAX_PAGE_DATA = 32 * 1024 * 1024


def page_image(image):
    image.thumbnail((MAX_EDGE, MAX_EDGE), Image.Resampling.LANCZOS)
    output = BytesIO()
    ocr_image(image).save(output, "JPEG", quality=92)
    return base64.b64encode(output.getvalue()).decode("ascii")


def positioned_text(page, bitmap, limit):
    """Native PDF text boxes in the same coordinate system as the rendered page."""
    spans = []
    converter = bitmap.get_posconv(page)
    textpage = page.get_textpage()
    try:
        count = textpage.count_rects()
        if count > 2500:
            return []
        size = 0
        for index in range(count):
            left, bottom, right, top = textpage.get_rect(index)
            text = textpage.get_text_bounded(left, bottom, right, top).strip()
            if not text:
                continue
            size += len(text)
            if size > limit:
                return []
            a, b = converter.to_bitmap(left, top), converter.to_bitmap(right, bottom)
            xs = sorted(max(0, min(1000, round(x * 1000 / bitmap.width))) for x in (a[0], b[0]))
            ys = sorted(max(0, min(1000, round(y * 1000 / bitmap.height))) for y in (a[1], b[1]))
            if xs[0] < xs[1] and ys[0] < ys[1]:
                spans.append((text, (xs[0], ys[0], xs[1], ys[1])))
    finally:
        textpage.close()
    return spans


def render(data, mime, char_limit):
    if mime != "application/pdf":
        with Image.open(BytesIO(data)) as image:
            if image.width * image.height > MAX_PIXELS:
                raise ValueError("Image exceeds pixel limit")
            return [(page_image(ImageOps.exif_transpose(image)), "", [])]

    import pypdfium2 as pdfium

    result = []
    size = chars = 0
    with pdfium.PdfDocument(data) as document:
        if not 1 <= len(document) <= MAX_PAGES:
            raise ValueError("Unsupported page count")
        document.init_forms()
        for index in range(len(document)):
            page = document[index]
            try:
                width, height = page.get_size()
                if not all(math.isfinite(d) and d > 0 for d in (width, height)):
                    raise ValueError("Invalid page dimensions")
                textpage = page.get_textpage()
                try:
                    native = textpage.get_text_bounded()
                finally:
                    textpage.close()
                chars += len(native)
                if chars > char_limit:
                    raise ValueError("Document text exceeds limit")
                bitmap = page.render(scale=min(3, MAX_EDGE / max(width, height)), draw_annots=True)
                try:
                    encoded = page_image(bitmap.to_pil())
                    spans = (
                        positioned_text(page, bitmap, min(2 * len(native), char_limit))
                        if native
                        else []
                    )
                finally:
                    bitmap.close()
                size += len(encoded)
                if size > MAX_PAGE_DATA:
                    raise ValueError("Rendered document exceeds limit")
                result.append((encoded, native, spans))
            finally:
                page.close()
    return result


async def render_pages(data, mime, char_limit):
    async def run():
        child = await asyncio.create_subprocess_exec(
            sys.executable,
            "-m",
            "pyworker.vision_pages",
            mime,
            str(char_limit),
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.DEVNULL,
        )
        try:
            output, _ = await child.communicate(data)
            if child.returncode:
                raise ValueError("Could not render document within limits")
            return json.loads(output)
        finally:
            if child.returncode is None:
                child.kill()
                await child.wait()

    return await with_reader_pipes(run)


if __name__ == "__main__":
    sys.stdout.buffer.write(
        json.dumps(
            render(sys.stdin.buffer.read(), sys.argv[1], int(sys.argv[2])),
            ensure_ascii=False,
            separators=(",", ":"),
        ).encode("utf-8")
    )
