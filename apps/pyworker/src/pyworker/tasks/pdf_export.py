"""Build a fresh image-only PDF from upright pages and approved regions."""

import io
import sys
from contextlib import closing

import pypdfium2 as pdfium
from PIL import Image, ImageDraw, ImageFont

from .ocr import render_pages


def mask_page(image, page, variant):
    draw = ImageDraw.Draw(image)
    font = (
        ImageFont.truetype("arial.ttf" if sys.platform == "win32" else "DejaVuSans.ttf", size=24)
        if variant == "labels"
        else None
    )
    for word in page.words:
        if not word.label:
            continue
        x, y, r, b = word.box
        padded = (
            max(0, x - 2),
            max(0, y - 2),
            min(image.width, r + 2),
            min(image.height, b + 2),
        )
        draw.rectangle(padded, fill="black")
        if font is not None:
            label = f"[{word.label}]"
            # Render separately then fit inside the masked region, even for short names.
            left, top, right, bottom = font.getbbox(label)
            stamp = Image.new("RGB", (right - left, bottom - top), "black")
            ImageDraw.Draw(stamp).text((-left, -top), label, font=font, fill="white")
            stamp.thumbnail((max(1, r - x), max(1, b - y)))
            image.paste(stamp, (x, y))


def export_pdf(data, pages, variant, *, report=None):
    output = io.BytesIO()
    count = 0
    if report:
        report(0)
    with pdfium.PdfDocument.new() as document:
        for index, rendered in enumerate(render_pages(data)):
            image, size = rendered.image, rendered.size_points
            if index >= len(pages) or image.size != (pages[index].width, pages[index].height):
                raise ValueError("Source geometry changed")
            if variant != "original":
                mask_page(image, pages[index], variant)
            image.info.clear()
            with io.BytesIO() as jpeg, closing(document.new_page(*size)) as page:
                image.save(jpeg, "JPEG", quality=86)
                jpeg.seek(0)
                obj = pdfium.PdfImage.new(document)
                obj.load_jpeg(jpeg, inline=True)
                obj.set_matrix(pdfium.PdfMatrix().scale(*size))
                page.insert_obj(obj)
                page.gen_content()
            count += 1
            if report:
                report(min(99, 100 * count // len(pages)))
        if count != len(pages):
            raise ValueError("Page count changed")
        document.save(output)
    if output.tell() > 8 * 1024 * 1024:
        raise ValueError("Export exceeds catalog size limit")
    return output.getvalue()
