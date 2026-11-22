import hashlib
import json
import unittest
from functools import partial
from io import BytesIO
from pathlib import Path
from unittest.mock import patch
from uuid import uuid4

import httpx2
from PIL import Image, ImageDraw
from pydantic import ValidationError
from starlette.datastructures import UploadFile

from pyworker.config import Settings
from pyworker.eden import convert_document
from pyworker.form_compiler import convert_to_coi
from pyworker.form_ir import form_validator
from pyworker.ocr_form import detect_items
from pyworker.table_geometry import align_cells, markdown_tables, review_batches
from pyworker.vision import VisualPage, compile_pages
from pyworker.vision_pages import page_image, render


def cell(row):
    return {
        "label": f"Ilość, pozycja {row}",
        "section": "Zamówienie",
        "kind": "number",
        "bbox": [300, row * 100, 550, row * 100 + 50],
        "cell": {"row": row, "column": 2},
        "confidence": 0.9,
    }


class VisionTests(unittest.IsolatedAsyncioTestCase):
    async def test_recovers_dotted_answer_cell_missed_on_first_pass(self):
        image = Image.new("RGB", (500, 360), "white")
        draw = ImageDraw.Draw(image)
        for x in (50, 200, 450):
            draw.line((x, 40, x, 300), fill="black", width=2)
        for y in (40, 120, 300):
            draw.line((50, y, 450, y), fill="black", width=2)
        draw.text((65, 65), "Item", fill="black")
        draw.text((220, 65), "Quantity", fill="black")
        draw.text((65, 170), "Row A", fill="black")
        for x in range(220, 420, 5):
            draw.point((x, 220), fill="black")
        buf = BytesIO()
        sheet = Image.new("RGB", (550, 720), "white")
        sheet.paste(image, (0, 0))
        sheet.paste(image, (40, 360))
        sheet.save(buf, "PNG")
        responses = [{"notes": [], "fields": []},
                     {"fields": [{"id": 0, "label": "Quantity A"}, {"id": 0, "label": "Duplicate"},
                                 {"id": 1, "label": "Quantity B"}]}]

        async def api(request):
            payload = json.loads(request.content)
            if len(responses) == 1:
                self.assertIn("Candidates:", payload["messages"][0]["content"][1]["text"])
            return httpx2.Response(200, json={"choices": [{"finish_reason": "stop", "message": {
                "content": json.dumps(responses.pop(0))}}]})

        settings = Settings.from_environment({"PYWORKER_API_TOKEN": "x" * 40,
            "PYWORKER_FORM_MODE": "vision", "EDENAI_API_KEY": "fixture"}).eden
        with patch("pyworker.eden.httpx2.AsyncClient", partial(httpx2.AsyncClient, transport=httpx2.MockTransport(api))):
            result, _ = await convert_document(settings, UploadFile(BytesIO(buf.getvalue())),
                                               "image/png", coi_form_id=uuid4())
        self.assertFalse(responses)
        regions = [loc.input[0] for loc in result.field_locations]
        self.assertEqual([(r.cell.row, r.cell.column) for r in regions], [(2, 2), (2, 2)])
        self.assertAlmostEqual(regions[0].bbox[0], 200 / 550, places=2)
        self.assertFalse(result.source_answers)

    def test_review_batch_keeps_overflow_cells_and_table_identity(self):
        area = (10, 10, 40, 20)
        groups = [(area, [(area, row, 1) for row in range(99)], "A"),
                  (area, [(area, row, 2) for row in range(3)], "B")]
        first, second = [cells for _, cells in review_batches(groups)]
        self.assertEqual([len(first), len(second)], [100, 2])
        self.assertEqual([c[1:] for c in first[-1:] + second],
                         [(0, 2, "B"), (1, 2, "B"), (2, 2, "B")])

    async def test_invalid_first_page_response_is_retried_once(self):
        from asyncio import get_running_loop
        from unittest.mock import AsyncMock

        from pyworker.eden import EdenSettings, read_visual_pages

        def response(content):
            return {"choices": [{"finish_reason": "stop", "message": {"content": content}}]}

        image = page_image(Image.new("RGB", (64, 64), "white"))
        with patch("pyworker.eden.request_json", new_callable=AsyncMock,
                   side_effect=[response("{}"), response(json.dumps({
                       "notes": ["Informacja."], "fields": [],
                   }))]) as provider:
            pages = await read_visual_pages(
                None, EdenSettings(api_key=""), {}, [(image, "", [])],
                get_running_loop().time() + 30,
            )
        self.assertEqual(provider.await_count, 2)
        self.assertEqual(pages[0][0].notes, ["Informacja."])

    def test_writing_guides_are_removed_without_altering_numbers(self):
        from pyworker.form_title import clean_writing_guides

        self.assertEqual(
            clean_writing_guides({"notes": ["Imię ........", "Kwota 12.50 zł.", "Adres . . . . ."]}),
            {"notes": ["Imię", "Kwota 12.50 zł.", "Adres"]},
        )

    def test_printed_value_and_label_use_source_rectangles(self):
        from pyworker.table_geometry import align_printed_text

        page = VisualPage(notes=[], fields=[{
            "label": "Nazwisko", "kind": "text", "value": "Nowak",
            "bbox": [100, 100, 500, 200], "label_bbox": [100, 200, 300, 250],
        }])
        align_printed_text(page, [("Nazwisko:", (50, 300, 200, 325)),
                                  ("Nowak", (220, 300, 400, 325))])
        self.assertEqual(page.fields[0].label_bbox, (50, 300, 200, 325))
        self.assertEqual(page.fields[0].bbox, (220, 300, 400, 325))
        repeated = page.model_copy(deep=True)
        repeated.fields[0].bbox = (100, 100, 500, 200)
        align_printed_text(repeated, [("Nowak", (0, 0, 10, 10)),
                                      ("Nowak", (20, 20, 30, 30))])
        self.assertEqual(repeated.fields[0].bbox, (100, 100, 500, 200))

    def test_printed_answer_returned_with_its_label_is_editable(self):
        page = VisualPage(
            notes=[],
            fields=[{"label": "Nazwisko: Nowak", "kind": "text", "bbox": [100, 100, 400, 160]}],
        )
        extraction, document = compile_pages([(page, "")], "a" * 64, 20_000)
        result = convert_to_coi(extraction, document, uuid4(), visual=True)
        field = result.draft.tabs[0].questions[0].field.repeatingSectionGrid[0].field
        self.assertEqual(
            (field.title, field.readOnly, result.source_answers[field.id]),
            ("Nazwisko", False, "Nowak"),
        )

    def test_information_page_keeps_native_text_when_model_returns_no_notes(self):
        page = VisualPage(notes=[], fields=[cell(1)])
        info = VisualPage(notes=[], fields=[])
        extraction, doc = compile_pages([(page, ""), (info, "Załącz odpis dokumentu.")],
                                        "a" * 64, 20_000)
        field = extraction.tabs[0].sections[-1].fields[0]
        self.assertIn("Załącz odpis dokumentu.", field.description)
        self.assertEqual(doc.blocks[field.label_blocks[0] - 1].page, 2)

    def test_ocr_markdown_binds_headers_and_values_to_ruled_cells(self):
        image = Image.new("RGB", (400, 240), "white")
        draw = ImageDraw.Draw(image)
        for y in (20, 80, 140, 200):
            draw.line((20, y, 380, y), fill="black", width=2)
        for x in (20, 200, 380):
            draw.line((x, 20, x, 200), fill="black", width=2)
        draw.text((30, 40), "Kod", fill="black")
        draw.text((210, 40), "Uwagi", fill="black")
        draw.text((30, 95), "001", fill="black")
        markdown = "| Kod | Uwagi |\n| --- | --- |\n| 001 | |\n| | |"
        page = VisualPage(notes=[], fields=[])
        matched = align_cells(page, page_image(image), ocr_tables=markdown_tables(markdown))
        self.assertEqual(matched, [markdown])
        self.assertEqual(
            [(f.cell.row, f.cell.column, f.label, f.value) for f in page.fields],
            [
                (2, 1, "Kod", "001"),
                (2, 2, "Uwagi", None),
                (3, 1, "Kod", None),
                (3, 2, "Uwagi", None),
            ],
        )

    def test_filled_pdf_column_uses_printed_header_and_values_by_row(self):
        from pypdf import PdfWriter
        from pypdf.generic import DecodedStreamObject, DictionaryObject, NameObject

        writer = PdfWriter()
        page = writer.add_blank_page(width=500, height=500)
        font = DictionaryObject(
            {
                NameObject("/Type"): NameObject("/Font"),
                NameObject("/Subtype"): NameObject("/Type1"),
                NameObject("/BaseFont"): NameObject("/Helvetica"),
            }
        )
        page[NameObject("/Resources")] = DictionaryObject(
            {NameObject("/Font"): DictionaryObject({NameObject("/F1"): font})}
        )
        stream = DecodedStreamObject()
        lines = [f"50 {y} m 350 {y} l S" for y in (400, 360, 320, 280, 240)]
        lines += [f"{x} 400 m {x} 240 l S" for x in (50, 200, 350)]
        lines += [
            f"BT /F1 12 Tf {x} {y} Td ({s}) Tj ET"
            for x, y, s in (
                (65, 375, "Lp."),
                (215, 375, "Nazwisko"),
                (215, 335, "Nowak"),
                (215, 295, "Kowal"),
            )
        ]
        stream.set_data("\n".join(lines).encode())
        page[NameObject("/Contents")] = writer._add_object(stream)
        pdf = BytesIO()
        writer.write(pdf)
        [(image, native, spans)] = render(pdf.getvalue(), "application/pdf", 20_000)
        model = VisualPage(
            notes=[],
            fields=[
                {
                    "label": "Pole 1",
                    "kind": "text",
                    "bbox": [402, 282, 698, 358],
                    "cell": {"row": 2, "column": 2},
                }
            ],
        )
        align_cells(model, image, spans)
        extraction, doc = compile_pages([(model, native)], "a" * 64, 20_000)
        result = convert_to_coi(extraction, doc, uuid4(), visual=True)
        labels = {
            q.field.id: q.field.title
            for t in result.draft.tabs
            for s in t.questions
            for q in s.field.repeatingSectionGrid
        }
        pairs = [
            (r.cell.row, labels[loc.field_id], result.source_answers.get(loc.field_id))
            for loc in result.field_locations
            for r in loc.input
            if r.cell.column == 2
        ]
        self.assertEqual(
            sorted(pairs),
            [(2, "Nazwisko", "Nowak"), (3, "Nazwisko", "Kowal"), (4, "Nazwisko", None)],
        )

    def test_recovers_omitted_column_and_merged_cell_without_creating_answers(self):
        image = Image.new("RGB", (1000, 1000), "white")
        draw = ImageDraw.Draw(image)
        for y in (100, 160, 220, 280):
            draw.line((100, y, 700, y), fill="black", width=2)
        for x in (100, 300, 500, 700):
            draw.line((x, 100, x, 220 if x == 500 else 280), fill="black", width=2)
        for x in (100, 300, 500):
            draw.text((x + 10, 120), "Header", fill="black")
        draw.text((110, 170), "Item A", fill="black")
        draw.text((110, 240), "Item B", fill="black")
        for reported in ([], [{**cell(2), "bbox": [300, 160, 500, 220]}]):
            layout = VisualPage(title="Zestawienie", notes=[], fields=reported)
            align_cells(layout, page_image(image))
            extraction, document = compile_pages([(layout, "")], "a" * 64, 20_000)
            result = convert_to_coi(extraction, document, uuid4(), visual=True)
            regions = [region for loc in result.field_locations for region in loc.input]
            self.assertEqual(
                sorted((r.cell.row, r.cell.column) for r in regions), [(2, 2), (2, 3), (3, 2)]
            )
            merged = next(r for r in regions if r.cell.row == 3)
            self.assertAlmostEqual(merged.bbox[2], 0.7, places=2)
            self.assertFalse(result.source_answers)

    def test_multiline_native_title_repairs_generic_visual_title(self):
        native = "WNIOSEK\no\nwynajęcie/użyczenie świetlicy wiejskiej\nProszę o wynajem…"
        expected = "WNIOSEK o wynajęcie/użyczenie świetlicy wiejskiej"
        page = VisualPage(title="WNIOSEK", notes=[], fields=[cell(1)])
        self.assertEqual(detect_items(native)[0], expected)
        extraction, _ = compile_pages([(page, native)], "a" * 64, 20_000)
        self.assertEqual(extraction.title, expected)

    async def test_scanned_pdf_sends_each_page_as_an_image_and_keeps_empty_cells(self):
        doc = BytesIO()
        Image.new("RGB", (100, 160), "white").save(
            doc, "PDF", save_all=True, append_images=[Image.new("RGB", (160, 100), "gray")]
        )
        calls = []

        async def api(request):
            self.assertEqual(request.url.path, "/v3/chat/completions")
            body = json.loads(request.content)
            self.assertEqual(body["model"], "custom-vision")
            self.assertEqual(body["reasoning_effort"], "none")
            image = body["messages"][1]["content"][0]["image_url"]["url"]
            self.assertTrue(image.startswith("data:image/jpeg;base64,"))
            calls.append(image)
            result = {"title": "Zamówienie", "notes": [], "fields": [cell(len(calls))]}
            choice = {"finish_reason": "stop", "message": {"content": json.dumps(result)}}
            return httpx2.Response(200, json={"choices": [choice]})

        settings = Settings.from_environment(
            {
                "PYWORKER_API_TOKEN": "x" * 40,
                "PYWORKER_FORM_MODE": "vision",
                "EDENAI_API_KEY": "fixture",
                "EDENAI_VISION_MODEL": "custom-vision",
            }
        ).eden
        client = partial(httpx2.AsyncClient, transport=httpx2.MockTransport(api))
        with patch("pyworker.eden.httpx2.AsyncClient", client):
            result, used_ocr = await convert_document(
                settings,
                UploadFile(BytesIO(doc.getvalue()), filename="table.pdf"),
                "application/pdf",
                ocr_form_id=uuid4(),
            )
        self.assertTrue(used_ocr)
        self.assertEqual(len(set(calls)), 2)
        regions = [loc.input[0] for loc in result.field_locations]
        self.assertEqual(
            [(r.page, r.cell.row, r.cell.column) for r in regions], [(1, 1, 2), (2, 2, 2)]
        )
        self.assertEqual(regions[1].bbox, (0.30, 0.20, 0.55, 0.25))
        self.assertEqual(result.source_answers, {})
        self.assertFalse(settings.uses_vision("application/vnd.oasis.opendocument.spreadsheet"))

    def test_reviewed_profiles_keep_rules_and_new_visual_cells(self):
        root = Path(__file__).resolve().parents[3] / "materials/formularze"
        page = VisualPage(title="Wniosek", notes=[], fields=[cell(1)])
        for name in ("01-numer-nieruchomosci", "05-nadplata-podatku"):
            pdf = next(p for p in (root / name).iterdir() if p.suffix.lower() == ".pdf")
            digest = hashlib.sha256(pdf.read_bytes()).hexdigest()
            extraction, document = compile_pages([(page, "")], digest, 200_000)
            result = convert_to_coi(extraction, document, uuid4(), visual=True)
            self.assertTrue(result.form_ir.rules)
            self.assertTrue(form_validator().is_valid(result.form_ir.model_dump(mode="json")))
            self.assertEqual(sum(bool(loc.input) for loc in result.field_locations), 1)
            self.assertEqual(result.draft.tabs[-1].type, "FINISH")

    async def test_empty_scan_observation_gets_a_transcription(self):
        from asyncio import get_running_loop
        from unittest.mock import AsyncMock

        from pyworker.eden import EdenSettings, read_visual_pages

        image = page_image(Image.new("RGB", (64, 64), "white"))
        reply = {"choices": [{"finish_reason": "stop", "message": {
            "content": '{"fields": [], "notes": []}'}}]}
        with (
            patch("pyworker.eden.request_json", return_value=reply),
            patch("pyworker.eden.transcribe_image", new_callable=AsyncMock,
                  return_value="Informacja końcowa.") as transcription,
        ):
            pages = await read_visual_pages(None, EdenSettings(api_key=""), {},
                                            [(image, "Tekst PDF", []), (image, "", [])],
                                            get_running_loop().time() + 30)
        transcription.assert_awaited_once()
        self.assertEqual(pages[1][0].notes, ["Informacja końcowa."])

    def test_final_profile_export_retains_text_from_later_pages(self):
        root = Path(__file__).resolve().parents[3] / "materials/formularze"
        pdf = next((root / "05-nadplata-podatku").glob("*.pdf"))
        pages = [
            (VisualPage(notes=[], fields=[cell(1)]), ""),
            (VisualPage(notes=["Instrukcja druga."], fields=[cell(2)]),
             "Instrukcja druga.\nWyjaśnienie dodatkowe."),
            (VisualPage(notes=["Treść ze skanu."], fields=[]), ""),
        ]
        extraction, doc = compile_pages(pages, hashlib.sha256(pdf.read_bytes()).hexdigest(), 200_000)
        result = convert_to_coi(extraction, doc, uuid4(), visual=True)
        exported = result.draft.model_dump_json()
        for text in ("Instrukcja druga.", "Wyjaśnienie dodatkowe.", "Treść ze skanu."):
            self.assertIn(text, exported)
        self.assertTrue(any(e.pages == [3] for e in result.form_ir.evidence))

    def test_empty_and_inverted_regions_rejected(self):
        for box in ([20, 30, 20, 90], [300, 100, 200, 200], [0, 0, 1001, 100]):
            with self.subTest(box=box), self.assertRaises(ValidationError):
                VisualPage(title=None, notes=[], fields=[{**cell(1), "bbox": box}])

    def test_ruled_table_snaps_answer_boxes_to_data_rows_below_printed_header(self):
        img = Image.new("RGB", (1000, 1000), "white")
        pen = ImageDraw.Draw(img)
        for x in (100, 450, 800):
            pen.line((x, 300, x, 600), fill="black", width=2)
        for y in (300, 400, 500, 600):
            pen.line((100, y, 800, y), fill="black", width=2)
        pen.text((120, 320), "Material", fill="black")
        pen.text((470, 320), "Quantity", fill="black")
        fields = [
            {
                **cell(row),
                "cell": {"row": row, "column": column},
                "bbox": [left - 10, (row + 1) * 100, right - 10, (row + 2) * 100],
            }
            for row in (2, 3)
            for column, left, right in ((1, 100, 450), (2, 450, 800))
        ]
        layout = VisualPage(title=None, notes=[], fields=fields)
        align_cells(layout, page_image(img))
        self.assertEqual(
            [field.bbox for field in layout.fields],
            [
                (100, 400, 450, 500),
                (450, 400, 800, 500),
                (100, 500, 450, 600),
                (450, 500, 800, 600),
            ],
        )
