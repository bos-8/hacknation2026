import hashlib
import json
import os
import sqlite3
import unittest
from io import BytesIO
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch
from uuid import UUID
from zipfile import ZipFile

from fastapi.testclient import TestClient
from pydantic import ValidationError

from pyworker.coi import Block, CoiForm, ExtractedField, ReadDocument, render_field, show_condition
from pyworker.config import Settings
from pyworker.document_reader import read_document
from pyworker.docx import MC, WORD, docx_text
from pyworker.forms import PROCESS_PATH
from pyworker.geography import Addresses, addresses, parcel_status
from pyworker.main import create_app
from pyworker.ocr_form import form_from_text

MATERIALS = Path(__file__).resolve().parents[3] / "materials"
PROPERTY = MATERIALS / "formularze/01-numer-nieruchomosci"


class WordReaderTests(unittest.TestCase):
    def test_text_box_once_with_boundaries_and_header_only_once(self):
        document = BytesIO()
        with ZipFile(document, "w") as archive:
            archive.writestr(
                "word/document.xml",
                f"""
                <w:document xmlns:w="{WORD[1:-1]}" xmlns:mc="{MC[1:-1]}" xmlns:r="urn:rel">
                  <w:body><w:p><w:r><w:t>Adresat</w:t></w:r>
                  <mc:AlternateContent>
                    <mc:Choice><w:txbxContent><w:p><w:r><w:t>Ulica</w:t></w:r></w:p>
                    </w:txbxContent></mc:Choice><mc:Fallback><w:t>Kopia</w:t></mc:Fallback>
                  </mc:AlternateContent><w:r><w:t>Podpis</w:t></w:r></w:p>
                  <w:sectPr><w:headerReference r:id="h"/><w:headerReference r:id="h"/></w:sectPr>
                  </w:body></w:document>""",
            )
            archive.writestr(
                "word/_rels/document.xml.rels",
                '<Relationships><Relationship Id="h" Target="header1.xml"/></Relationships>',
            )
            archive.writestr(
                "word/header1.xml",
                f'<w:hdr xmlns:w="{WORD[1:-1]}"><w:p><w:t>Urząd</w:t></w:p></w:hdr>',
            )
        local = read_document(document.getvalue(), ".docx", lambda _: None)
        self.assertEqual([b.text for b in local.blocks], ["Urząd", "Adresat\nUlica\nPodpis"])
        document.seek(0)
        self.assertEqual(docx_text(document).splitlines(), ["Urząd", "Adresat", "Ulica", "Podpis"])

    def test_content_control_cells_preserve_order_in_word_tables(self):
        document = BytesIO()
        with ZipFile(document, "w") as archive:
            archive.writestr("word/document.xml", f"""
                <w:document xmlns:w="{WORD[1:-1]}"><w:body><w:tbl><w:tr>
                <w:tc><w:p><w:t>PESEL</w:t></w:p></w:tc>
                <w:sdt><w:sdtContent><w:tc><w:p><w:t>123</w:t></w:p></w:tc>
                </w:sdtContent></w:sdt></w:tr></w:tbl></w:body></w:document>""")
        self.assertEqual(docx_text(document), "PESEL | 123")

    def test_option_names_survive_reordering_and_polish_transliteration(self):
        options = ["Łaska", "Laska", "Inna"]

        def names(items):
            field = render_field(
                ExtractedField(type="RADIO", label="Wybór", options=items),
                UUID(int=3),
                "wybor",
                1,
                0,
            ).field
            return {o.name: o.techName for o in field.options}

        first = names(options)
        self.assertEqual(first, names(options[::-1]))
        self.assertEqual(len(set(first.values())), len(options))


class GeographyTests(unittest.TestCase):
    def test_printed_province_name_resolves_to_code_for_dependent_choices(self):
        result = addresses(
            Addresses.model_validate(
                {
                    "groups": [
                        {
                            "fields": {"province": "province-field", "county": "county-field"},
                            "values": {"province": "dolnoslaskie"},
                        }
                    ]
                }
            )
        )
        self.assertEqual(result["canonical"], {"province-field": "02"})
        self.assertFalse(result["checks"])
        self.assertTrue(result["choices"]["county-field"])
        self.assertTrue(all(code.startswith("02") for code, _ in result["choices"]["county-field"]))

    def test_cascade_rejects_county_from_different_province(self):
        fields = {
            level: level for level in ("province", "county", "municipality", "locality", "street")
        }

        def lookup(values):
            return addresses(
                Addresses.model_validate({"groups": [{"fields": fields, "values": values}]})
            )

        values = {}
        for level in fields:
            result = lookup(values)
            self.assertEqual(result["checks"], [])
            if level == "province":
                self.assertEqual(len(result["choices"][level]), 16)
            if level == "street":
                break  # a rural locality may have no named streets
            values[level] = result["choices"][level][0][0]
        foreign = lookup({"province": "02", "county": "1465"})
        self.assertEqual(
            foreign["checks"],
            [{"field": "county", "status": "INVALID", "validatorId": "teryt.parent"}],
        )
        self.assertFalse(foreign["choices"]["municipality"])

    def test_cadastral_scope_and_coverage(self):
        parcel = {"number": "12/4", "precinct": "0001", "municipality": "1234562"}
        with TemporaryDirectory() as directory:
            database = Path(directory) / "parcel.sqlite"
            db = sqlite3.connect(database)
            try:
                db.executescript("""
                    CREATE TABLE precinct(id, municipality, name, complete);
                    CREATE TABLE parcel(precinct_id, number);
                    INSERT INTO precinct VALUES ('123456_2.0001','1234562','Środek',1),
                         ('123456_2.0002','1234562','Las',0);
                    INSERT INTO parcel VALUES ('123456_2.0001','12/4');
                """)
            finally:
                db.close()
            with patch.dict(os.environ, {"PYWORKER_EGIB_SQLITE": str(database)}):
                for change, expected in [
                    ({}, "VALID"),
                    ({"precinct": "środek"}, "VALID"),
                    ({"number": "120"}, "INVALID"),
                    ({"precinct": "999999_2.0001"}, "INVALID"),
                    ({"number": "x/2"}, "INVALID"),
                    ({"precinct": "0002"}, "UNVERIFIED"),
                    ({"precinct": "3456"}, "UNVERIFIED"),
                ]:
                    with self.subTest(change=change):
                        self.assertEqual(parcel_status(parcel | change), expected)
        with patch.dict(os.environ, {"PYWORKER_EGIB_SQLITE": ""}):
            self.assertEqual(parcel_status(parcel), "UNAVAILABLE")


@unittest.skipUnless(PROPERTY.is_dir(), "COI materials not installed")
class WordProfileTests(unittest.TestCase):
    def test_property_export_and_final_page(self):
        blank = next(p for p in PROPERTY.glob("*.docx") if "wizualizacja" not in p.name)
        with blank.open("rb") as source:
            text = docx_text(source)
        document = ReadDocument(
            sha256=hashlib.sha256(blank.read_bytes()).hexdigest(),
            ocr=False,
            blocks=[Block(id=1, page=1, kind="text", text=text)],
        )
        result = form_from_text(text, False, UUID(int=40), document=document)
        fields = {
            q.field.techName: q.field
            for t in result.draft.tabs
            for s in t.questions
            for q in s.field.repeatingSectionGrid
        }
        self.assertEqual(
            {o.name for o in fields["rodzaj_wnioskodawcy"].options},
            {"Osoba fizyczna", "Osoba fizyczna prowadząca JDG", "Organizacja"},
        )
        self.assertNotIn("Osobiście", {o.name for o in fields["reprezentacja_organizacji"].options})
        self.assertIn("Przez uprawnionego reprezentanta", fields["umocowanie"].states[0]["query"])
        self.assertIn("Przez pełnomocnika", fields["pelnomocnictwo"].states[0]["query"])
        self.assertNotIn("Podpis własnoręczny", fields["klauzula_informacyjna"].description)
        self.assertIn("danych", fields["klauzula_informacyjna"].description)
        form = result.draft.model_dump(mode="json")
        final = form["tabs"][-1]["questions"][0]["field"]["repeatingSectionGrid"][0]["field"]
        self.assertEqual(final["type"], "INFO_SECTION")
        for change in ({"type": "TEXT_FIELD"}, {"description": ""}):
            with self.subTest(change=change), self.assertRaises(ValidationError):
                old = final.copy()
                final.update(change)
                try:
                    CoiForm.model_validate(form)
                finally:
                    final.update(old)
        self.assertIn(
            "$repeatingSectionIndex", show_condition("A", "B", "C", "D", repeating=True)["query"]
        )

    def test_reference_word_documents_rejected_at_intake(self):
        token = "test-" + "x" * 40
        meta = {
            "paid": True,
            "form_id": str(UUID(int=17)),
            "sender": {
                "uuid": str(UUID(int=11)),
                "name": "Test User",
                "email": "user@example.test",
            },
            "uploaded_at": "2026-11-21T12:00:00Z",
            "submitted_at": "2026-11-21T12:01:00Z",
        }
        files = [*PROPERTY.glob("*wizualizacja*.docx"), *(MATERIALS / "materialy").glob("*.docx")]
        self.assertEqual(len(files), 4)
        with TestClient(
            create_app(Settings.from_environment({"PYWORKER_API_TOKEN": token}))
        ) as client:
            for path in files:
                with self.subTest(file=path.name), path.open("rb") as source:
                    response = client.post(
                        PROCESS_PATH,
                        headers={"Authorization": "Bearer " + token},
                        data={"metadata": json.dumps(meta)},
                        files={
                            "file": (
                                "sample.docx",
                                source,
                                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                            )
                        },
                    )
                    self.assertEqual(response.status_code, 422)
                    self.assertIn("reference_material_not_form", response.text)
