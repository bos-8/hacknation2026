import unittest
from io import BytesIO

from PIL import Image, ImageDraw, ImageFilter
from pypdf import PdfReader

from pyworker.ocr_image import ocr_image, ocr_upload


class OcrImageTests(unittest.TestCase):
    def test_faint_small_print_keeps_its_position_and_gains_contrast(self):
        page = Image.new("L", (600, 260), 215)
        pen = ImageDraw.Draw(page)
        for y in range(10, 245, 16):
            pen.text((20, y), "1) Dane nieobowiązkowe. Numer działki.", fill=160, font_size=12)
        page = page.filter(ImageFilter.GaussianBlur(0.7))
        for fmt, mime in (("PNG", "image/png"), ("JPEG", "image/jpeg"), ("PDF", "application/pdf")):
            with self.subTest(fmt=fmt):
                source = BytesIO()
                page.save(source, fmt)
                data = source.getvalue()
                enhanced = ocr_upload(data, mime)
                self.assertNotEqual(data, enhanced)
                if fmt == "PDF":
                    original = PdfReader(BytesIO(data)).pages[0]
                    output = PdfReader(BytesIO(enhanced)).pages[0]
                    self.assertEqual(original.mediabox, output.mediabox)
                    before, after = original.images[0].image, output.images[0].image
                else:
                    before, after = Image.open(BytesIO(data)), Image.open(BytesIO(enhanced))
                self.assertEqual(before.size, after.size)
                for y in (12, 237):
                    box = (20, y, 245, y + 11)
                    low, high = before.crop(box).convert("L").getextrema()
                    low2, high2 = after.crop(box).convert("L").getextrema()
                    self.assertGreater(high2 - low2, high - low)

    def test_binary_scan_preserved_and_transparent_background_is_white(self):
        page = Image.new("1", (200, 200), 1)
        ImageDraw.Draw(page).rectangle((20, 10, 80, 50), fill=0)
        source = BytesIO()
        page.save(source, "PNG")
        self.assertEqual(ocr_upload(source.getvalue(), "image/png"), source.getvalue())
        rgba = Image.new("RGBA", (32, 32), (0, 0, 0, 0))
        self.assertEqual(ocr_image(rgba).getpixel((10, 10)), (255, 255, 255))
