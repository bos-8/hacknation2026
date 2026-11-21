import io
import json
import unittest
from contextlib import closing
from email import policy
from email.parser import BytesParser

import pypdfium2 as pdfium
import tesserocr
from fastapi.testclient import TestClient
from PIL import Image, ImageDraw, ImageFilter, ImageFont

from pyworker.config import Settings
from pyworker.main import create_app
from pyworker.tasks.document_types import Page, Word
from pyworker.tasks.ocr import TESSDATA, recognize, render_pages
from pyworker.tasks.ocr_refinement import refine_words
from pyworker.tasks.pdf_export import export_pdf
from pyworker.tasks.pii import verified_identifier


def printed_image():
    image = Image.new("RGB", (800, 160), "white")
    ImageDraw.Draw(image).text(
        (25, 45), "Jan Kowalski", fill="black", font=ImageFont.load_default(size=60)
    )
    out = io.BytesIO()
    image.save(out, "PNG")
    return out.getvalue()


def mixed_pdf():
    # Real PDF with native text above an independently scanned line.
    jpeg = io.BytesIO()
    with Image.open(io.BytesIO(printed_image())) as image:
        image.save(jpeg, "JPEG")

    def stream(content, extra=b""):
        return (
            b"<< /Length "
            + str(len(content)).encode()
            + b" "
            + extra
            + b" >>\nstream\n"
            + content
            + b"\nendstream"
        )

    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Count 1 /Kids [3 0 R] >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 200] "
        b"/Resources << /Font << /F 4 0 R >> /XObject << /I 5 0 R >> >> /Contents 6 0 R >>",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        stream(
            jpeg.getvalue(),
            b"/Type /XObject /Subtype /Image /Width 800 /Height 160 "
            b"/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode",
        ),
        stream(b"BT /F 20 Tf 20 165 Td (Invoice) Tj ET q 360 0 0 72 20 20 cm /I Do Q"),
    ]
    pdf = bytearray(b"%PDF-1.4\n")
    offsets = [0]
    for number, obj in enumerate(objects, 1):
        offsets.append(len(pdf))
        pdf.extend(f"{number} 0 obj\n".encode() + obj + b"\nendobj\n")
    start = len(pdf)
    pdf.extend(f"xref\n0 {len(offsets)}\n0000000000 65535 f \n".encode())
    for offset in offsets[1:]:
        pdf.extend(f"{offset:010} 00000 n \n".encode())
    pdf.extend(
        f"trailer << /Size {len(offsets)} /Root 1 0 R >>\nstartxref\n{start}\n%%EOF".encode()
    )
    return bytes(pdf)


class DocumentTests(unittest.TestCase):
    def test_isolated_numeric_field_survives_a_confident_partial_page(self):
        image = Image.new("L", (1100, 700), 255)
        draw = ImageDraw.Draw(image)
        for i in range(8):
            draw.text(
                (30, 25 + i * 39),
                "Document total insurance amount",
                fill=12,
                font=ImageFont.load_default(size=28),
            )
        draw.text((980, 440), "734", fill=40, font=ImageFont.load_default(size=16))
        source = io.BytesIO()
        image.save(source, "PNG")
        page = Page.model_validate(recognize(source.getvalue())["pages"][0])
        self.assertEqual(
            [w.text for w in page.words], ["Document", "total", "insurance", "amount"] * 8 + ["734"]
        )
        x, y, r, b = page.words[-1].box
        self.assertTrue(x <= 984 < r and y <= 450 < b)

    def test_a4_scan_uses_300_dpi_and_exports_with_saved_page_geometry(self):
        image = Image.new("L", (2480, 3508), 255)
        ImageDraw.Draw(image).text(
            (720, 1100), "Kowalska", fill=20, font=ImageFont.load_default(size=25)
        )
        source = io.BytesIO()
        image.save(source, "PDF", resolution=300)
        data = source.getvalue()
        with closing(render_pages(data, extract=True)) as rendered:
            self.assertEqual(next(rendered).image.size, (2481, 3508))
        page = Page.model_validate(recognize(data)["pages"][0])
        self.assertEqual((page.width, page.height), (1682, 2379))
        word = next(w for w in page.words if w.text == "Kowalska")
        word.label = "NAZWISKO"
        output = export_pdf(data, [page], "black")
        with pdfium.PdfDocument(output) as doc, closing(doc[0]) as pdf_page:
            with closing(pdf_page.render(scale=300 / 72)) as bitmap:
                covered = bitmap.to_pil().convert("L").crop((729, 1110, 797, 1117))
                self.assertLess(covered.getextrema()[1], 16)

    def test_large_photo_retry_uses_full_resolution_crop(self):
        image = Image.new("RGB", (4200, 360), "white")
        draw = ImageDraw.Draw(image)
        box = draw.textbbox((3101, 174), "Kowalska", font=ImageFont.load_default(size=26))
        draw.text((3101, 174), "Kowalska", font=ImageFont.load_default(size=26), fill="black")
        source = io.BytesIO()
        image.save(source, "PNG")
        with closing(render_pages(source.getvalue(), extract=True)) as rendered:
            page = next(rendered)
            self.assertEqual(page.detail.size, image.size)
            w, h = page.image.size
            x, y, r, b = box
            saved_box = (x * w // 4200, y * h // 360, (r * w + 4199) // 4200, (b * h + 359) // 360)
            word = Word(text="Kowalsko", confidence=15, box=saved_box)
            # Only the original still contains ink, so a thumbnail retry cannot pass.
            page.image.paste("white", (0, 0, w, h))
            with tesserocr.PyTessBaseAPI(path=str(TESSDATA), lang="pol+eng") as engine:
                refine_words(engine, page.image, [word], upside_down=False, detail=page.detail)
        self.assertEqual((word.text, word.box), ("Kowalska", saved_box))

    def test_small_print_keeps_identifier_on_its_original_line(self):
        image = Image.new("L", (350, 78), 215)
        draw = ImageDraw.Draw(image)
        font = ImageFont.load_default(size=10)
        for i, line in enumerate(["Order FV/2026/017", "Anna Kowalska", "Total 1249.50 PLN"]):
            draw.text((10 + i * 3, 4 + i * 23), line, font=font, fill=75)
        out = io.BytesIO()
        image.filter(ImageFilter.GaussianBlur(0.55)).save(out, "PNG")
        result = recognize(out.getvalue())
        page = Page.model_validate(result["pages"][0])
        self.assertEqual((page.width, page.height), image.size)
        identifier = next(word for word in page.words if word.text == "FV/2026/017")
        left, top, right, bottom = identifier.box
        self.assertTrue(35 <= left < 45 and 93 < right <= 103)
        self.assertTrue(2 <= top < bottom <= 19)

    def test_word_retry_keeps_rotated_box_and_skips_empty_crop(self):
        image = Image.new("L", (200, 64), 255)
        draw = ImageDraw.Draw(image)
        font = ImageFont.load_default(size=28)
        draw.text((12, 12), "Kowalska", font=font, fill=0)
        x, y, r, b = draw.textbbox((12, 12), "Kowalska", font=font)
        box = (200 - r, 64 - b, 200 - x, 64 - y)
        word = Word(text="Kowalsko", box=box, confidence=20)
        blank = Word(text="?", box=(2, 1, 14, 10), confidence=8)
        with tesserocr.PyTessBaseAPI(path=str(TESSDATA), lang="pol+eng") as engine:
            mode = engine.GetPageSegMode()
            refine_words(
                engine, image.transpose(Image.Transpose.ROTATE_180), [word, blank], upside_down=True
            )
            self.assertEqual(engine.GetPageSegMode(), mode)
        self.assertEqual((word.text, word.box), ("Kowalska", box))
        self.assertEqual((blank.text, blank.confidence), ("?", 8))

    def test_polish_identifier_checksums(self):
        self.assertTrue(verified_identifier("PESEL", "44051401458"))
        self.assertFalse(verified_identifier("PESEL", "44051401459"))
        self.assertTrue(verified_identifier("NIP", "5260250274"))
        self.assertFalse(verified_identifier("NIP", "5260250275"))
        self.assertTrue(verified_identifier("KONTO", "PL61109010140000071219812874"))

    def test_mixed_pdf_keeps_native_and_scanned_words_with_geometry(self):
        page = recognize(mixed_pdf())["pages"][0]
        words = {w["text"]: w for w in page["words"]}
        self.assertIsNone(words["Invoice"]["confidence"])
        self.assertIsNotNone(words["Kowalski"]["confidence"])
        self.assertLess(words["Invoice"]["box"][3], words["Kowalski"]["box"][1])

    def test_rotated_mixed_pdf_masks_the_same_printed_name_on_every_page(self):
        angles = (0, 90, 180, 270)
        source = io.BytesIO()
        with pdfium.PdfDocument(mixed_pdf()) as fixture, pdfium.PdfDocument.new() as doc:
            for angle in angles:
                doc.import_pages(fixture)
                with closing(doc[len(doc) - 1]) as page:
                    page.set_rotation(angle)
            doc.save(source)
        data = source.getvalue()
        progress = []
        pages = [Page.model_validate(p) for p in recognize(data, report=progress.append)["pages"]]
        self.assertEqual(progress, [0, 25, 50, 75, 99])
        self.assertEqual(len(pages), len(angles))
        for page in pages:
            self.assertEqual([w.text for w in page.words], ["Invoice", "Jan", "Kowalski"])
            page.words[2].label = "NAZWISKO"

        # Sample the actual surname location derived independently from the upright
        # source. Checking the OCR box against its own exported mask would miss drift.
        x, y, right, bottom = pages[0].words[2].box
        pdf_progress = []
        output = export_pdf(data, pages, "black", report=pdf_progress.append)
        self.assertEqual(pdf_progress, [0, 25, 50, 75, 99])
        with pdfium.PdfDocument(output) as doc:
            for index, angle in enumerate(angles):
                with closing(doc[index]) as page:
                    objects = [obj.type for obj in page.get_objects()]
                    self.assertEqual(objects, [pdfium.raw.FPDF_PAGEOBJ_IMAGE])
                    scale = pages[index].width / page.get_width()
                    with closing(page.render(scale=scale)) as bitmap:
                        upright = bitmap.to_pil().convert("L").rotate(angle, expand=True)
                        region = upright.crop((x + 3, y + 3, right - 3, bottom - 3))
                        self.assertLess(region.getextrema()[1], 16)

    def test_document_http_subprocess_and_binary_exports(self):
        token = "fixture-" + "x" * 40
        data = printed_image()
        headers = {"Authorization": "Bearer " + token}
        with TestClient(create_app(Settings(token=token))) as client:
            parts = {
                "source": ("page.png", data, "image/png"),
                "task": (None, json.dumps({"operation": "ocr"})),
            }
            self.assertEqual(client.post("/v1/tasks/document", files=parts).status_code, 401)
            response = client.post("/v1/tasks/document", files=parts, headers=headers)
            self.assertEqual(response.status_code, 200, response.text[:100])
            mime = BytesParser(policy=policy.default).parsebytes(
                b"Content-Type: "
                + response.headers["content-type"].encode()
                + b"\r\n\r\n"
                + response.content
            )
            metadata, preview = mime.iter_parts()
            self.assertTrue(preview.get_payload(decode=True).startswith(b"\xff\xd8"))
            page = Page.model_validate(json.loads(metadata.get_payload(decode=True))[0])
            task = json.dumps({"operation": "detect", "pages": [page.model_dump()]})

            def detect_page():
                response = client.post(
                    "/v1/tasks/document", files={"task": (None, task)}, headers=headers
                )
                self.assertEqual(response.status_code, 200)
                return response.json()["pages"][0]

            detected = detect_page()
            pid = client.app.state.pii.process.pid
            self.assertEqual(detected, detect_page())
            self.assertEqual(pid, client.app.state.pii.process.pid)
            page = Page.model_validate(detected)
        self.assertEqual(
            [(w.text, w.label) for w in page.words], [("Jan", "IMIĘ"), ("Kowalski", "NAZWISKO")]
        )
        values = {}
        for variant in ["original", "black", "labels"]:
            output = export_pdf(data, [page], variant)
            with pdfium.PdfDocument(output) as doc, closing(doc[0]) as pdf_page:
                with closing(pdf_page.get_textpage()) as text:
                    self.assertEqual(text.count_chars(), 0)
                with closing(pdf_page.render(scale=240 / 72)) as bitmap:
                    values[variant] = bitmap.to_pil().convert("L").crop(page.words[0].box)
        self.assertLess(values["black"].getextrema()[1], 16)
        self.assertGreater(values["labels"].getextrema()[1], 100)
        self.assertNotEqual(values["original"].tobytes(), values["labels"].tobytes())
