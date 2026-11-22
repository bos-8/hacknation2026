import json
import unittest
from io import BytesIO
from pathlib import Path
from uuid import uuid4
from zipfile import ZipFile

from fastapi.testclient import TestClient

from pyworker.config import Settings
from pyworker.file_structure import ODS, OFFICE
from pyworker.forms import FORMATS, PROCESS_PATH
from pyworker.main import create_app
from pyworker.spreadsheet import TABLE, TEXT


class SpreadsheetTests(unittest.TestCase):
    def setUp(self):
        token = "fixture-" + "x" * 40
        settings = Settings.from_environment(
            {"PYWORKER_API_TOKEN": token, "PYWORKER_FORM_MODE": "ocr"}
        )
        self.client = self.enterContext(
            TestClient(create_app(settings), headers={"Authorization": f"Bearer {token}"})
        )
        self.metadata = json.dumps(
            {
                "paid": True,
                "form_id": str(uuid4()),
                "sender": {"uuid": str(uuid4()), "name": "Test", "email": "test@example.test"},
                "uploaded_at": "2026-11-21T12:00:00Z",
                "submitted_at": "2026-11-21T12:01:00Z",
            }
        )

    def process(self, data, extension):
        return self.client.post(
            PROCESS_PATH,
            data={"metadata": self.metadata},
            files={"file": ("Nazwa ze spacjami" + extension.upper(), data, FORMATS[extension][0])},
        )

    def test_office_variants_keep_all_sports_procedures_when_renamed(self):
        samples = (
            Path(__file__).resolve().parents[3] / "materials/formularze/09-swiadczenia-sportowe"
        )
        for extension in (".xlsx", ".ods"):
            with self.subTest(extension=extension):
                path = next(samples.glob("*" + extension))
                response = self.process(path.read_bytes(), extension)
                self.assertEqual(response.status_code, 200)
                result = response.json()
                self.assertEqual(result["ocr"], "not_required")
                tabs = {tab["title"]: tab for tab in result["draft"]["tabs"]}
                for title in ("I. Stypendium", "II. Nagroda", "III. Wyróżnienie"):
                    self.assertTrue(tabs[title]["questions"])
                self.assertEqual(len(result["draft"]["flow"]["links"]), len(tabs) - 1)

    def test_vision_mode_compiles_all_sample_spreadsheets_without_provider(self):
        samples = Path(__file__).resolve().parents[3] / "materials/formularze"
        paths = [path for path in samples.rglob("*")
                 if path.suffix.lower() in {".ods", ".xlsx"} and not path.name.startswith(("~$", ".~lock."))]
        self.assertEqual({path.suffix.lower() for path in paths}, {".ods", ".xlsx"})
        token = "fixture-" + "x" * 40
        settings = Settings.from_environment(
            {"PYWORKER_API_TOKEN": token, "PYWORKER_FORM_MODE": "vision"}
        )
        with TestClient(create_app(settings), headers={"Authorization": f"Bearer {token}"}) as client:
            for path in paths:
                with self.subTest(sample=path.name):
                    response = client.post(PROCESS_PATH, data={"metadata": self.metadata},
                                           files={"file": (path.name, path.read_bytes(), FORMATS[path.suffix.lower()][0])})
                    self.assertEqual(response.status_code, 200, response.text[:300])
                    result = response.json()
                    self.assertEqual(result["ocr"], "not_required")
                    self.assertTrue(result["draft"]["tabs"][0]["questions"])

    def test_unindexed_workbook_reads_final_sheet_and_rejects_oversize_repeats(self):
        def workbook(repeats):
            content = f"""<o:document-content xmlns:o="{OFFICE[1:-1]}"
                xmlns:t="{TABLE[1:-1]}" xmlns:x="{TEXT[1:-1]}">
                <o:body><o:spreadsheet><t:table t:name="Dane"><t:table-row><t:table-cell>
                <x:p>Wniosek o udział w pokazie</x:p></t:table-cell></t:table-row>
                <t:table-row><t:table-cell><x:p>Imię:</x:p></t:table-cell></t:table-row></t:table>
                <t:table t:name="Zakończenie"><t:table-row t:number-rows-repeated="{repeats}">
                <t:table-cell><x:p>Kod wydarzenia:</x:p></t:table-cell></t:table-row>
                </t:table></o:spreadsheet></o:body></o:document-content>"""
            buf = BytesIO()
            with ZipFile(buf, "w") as archive:
                archive.writestr("mimetype", ODS)
                archive.writestr("content.xml", content)
            return buf.getvalue()

        response = self.process(workbook(1), ".ods")
        self.assertEqual(response.status_code, 200)
        draft = response.json()["draft"]
        titles = {
            child["field"]["title"]
            for tab in draft["tabs"]
            for group in tab["questions"]
            for child in group["field"]["repeatingSectionGrid"]
        }
        self.assertIn("Kod wydarzenia", titles)
        self.assertIn("Imię", titles)
        self.assertEqual(self.process(workbook(100_000_000), ".ods").status_code, 422)

    def test_table_headers_remain_bound_to_values_after_an_empty_middle_cell(self):
        rows = [
            ("Wniosek o udział w pokazie",),
            ("Imię", "Nazwisko", "Telefon"),
            ("Anna", "", "001234567"),
            ("Jan", "Nowak", ""),
        ]
        body = "".join(
            "<t:table-row>"
            + "".join(f"<t:table-cell><x:p>{v}</x:p></t:table-cell>" for v in row)
            + "</t:table-row>"
            for row in rows
        )
        content = (
            f'<o:document-content xmlns:o="{OFFICE[1:-1]}" xmlns:t="{TABLE[1:-1]}" '
            f'xmlns:x="{TEXT[1:-1]}"><o:body><o:spreadsheet><t:table t:name="Dane">'
            f"{body}</t:table></o:spreadsheet></o:body></o:document-content>"
        )
        buf = BytesIO()
        with ZipFile(buf, "w") as archive:
            archive.writestr("mimetype", ODS)
            archive.writestr("content.xml", content)
        response = self.process(buf.getvalue(), ".ods")
        self.assertEqual(response.status_code, 200)
        result = response.json()
        pairs = [
            (f["title"], result["source_answers"].get(f["id"]))
            for t in result["draft"]["tabs"]
            for s in t["questions"]
            for q in s["field"]["repeatingSectionGrid"]
            if (f := q["field"])["type"] == "TEXT_FIELD"
        ]
        self.assertCountEqual(
            pairs,
            [
                ("Imię", "Anna"),
                ("Nazwisko", None),
                ("Telefon", "001234567"),
                ("Imię", "Jan"),
                ("Nazwisko", "Nowak"),
                ("Telefon", None),
            ],
        )
