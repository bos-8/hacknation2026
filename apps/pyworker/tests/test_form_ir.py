import asyncio
import hashlib
import json
import sys
import unittest
from copy import deepcopy
from pathlib import Path
from uuid import UUID

from fastapi.testclient import TestClient
from jsonschema import Draft202012Validator
from pydantic import ValidationError

from pyworker.coi import Block, ExtractedField, Extraction, ReadDocument
from pyworker.config import Settings
from pyworker.form_compiler import convert_to_coi
from pyworker.form_ir import assess, catalog, form_validator, rule_choices
from pyworker.main import create_app
from pyworker.ocr_form import form_from_text
from pyworker.pdf_text import native_pdf_pages
from pyworker.reader_loop import with_reader_pipes

SAMPLES = Path(__file__).resolve().parents[3] / "materials/formularze"
FORM_ID = UUID(int=71)


class FormIrTests(unittest.TestCase):
    def test_full_name_uses_one_control_with_the_exact_source_answer(self):
        name = "Jan Adam Kowalski-Nowak"
        for source, expected in (
            ("Imię i nazwisko: " + name, name),
            ("Imię i nazwisko\n" + name, name),
            (name + "\n(Imię i nazwisko)", name),
            (name + ".......\n/ imię i nazwisko /", name),
            (name + "\n/ imię i nazwisko /", name),
            ("Imię i nazwisko: | " + name, name),
            ("Imię i nazwisko   " + name, name),
            ("Imię i nazwisko .... " + name + " ....", name),
            ("Imię i nazwisko: ....", None),
        ):
            with self.subTest(source=source):
                text = "Wniosek testowy\n" + source
                doc = ReadDocument(
                    ocr=False,
                    blocks=[
                        Block(id=i, page=1, kind="text", text=line)
                        for i, line in enumerate(text.splitlines(), 1)
                    ],
                )
                result = form_from_text(text, False, FORM_ID, document=doc)
                fields = [
                    q.field
                    for tab in result.draft.tabs
                    for section in tab.questions
                    for q in section.field.repeatingSectionGrid
                    if q.field.type == "TEXT_FIELD"
                ]
                self.assertEqual([f.title for f in fields], ["Imię i nazwisko"])
                self.assertEqual(result.source_answers.get(fields[0].id), expected)

    def test_adjacent_printed_labels_keep_their_own_answers(self):
        for line in ("Imię: Anna    Nazwisko: Nowak", "Imię: | Anna | Nazwisko: | Nowak"):
            with self.subTest(line=line):
                result = form_from_text(
                    "Wniosek próbny\n" + line + "\nTelefon: ...", False, FORM_ID
                )
                answers = {
                    q.field.title: result.source_answers.get(q.field.id)
                    for tab in result.draft.tabs
                    for section in tab.questions
                    for q in section.field.repeatingSectionGrid
                    if q.field.type == "TEXT_FIELD"
                }
                self.assertEqual(answers, {"Imię": "Anna", "Nazwisko": "Nowak", "Telefon": None})

    def test_generic_address_fields_export_dictionaries_and_keep_printed_answer(self):
        result = form_from_text(
            "WNIOSEK TESTOWY\nWoj.: MAZOWIECKIE\nPowiat: ....\nGmina: ....\n"
            "Miejscowość: ....\nKraj: Polska",
            False,
            FORM_ID,
        )
        fields = [
            q.field
            for tab in result.draft.tabs
            for section in tab.questions
            for q in section.field.repeatingSectionGrid
            if q.field.dictionaryName
        ]
        self.assertEqual(
            [f.dictionaryName for f in fields],
            [
                "Województwo",
                "Powiat",
                "Gmina",
                "Miejscowość",
                "Kraje",
            ],
        )
        self.assertTrue(all(f.type == "SELECT" and not f.options for f in fields))
        self.assertEqual(result.source_answers[fields[0].id], "MAZOWIECKIE")

    @unittest.skipUnless(sys.platform == "win32", "Windows DEV uses the psycopg selector loop")
    def test_reader_subprocess_works_under_the_dev_event_loop(self):
        with asyncio.Runner(loop_factory=asyncio.SelectorEventLoop) as runner:
            self.assertEqual(
                runner.run(with_reader_pipes(lambda: native_pdf_pages(b"%PDF-1.4", 256))), []
            )

    def test_model_proposals_and_repeating_scope(self):
        data = {
            "title": "Wniosek",
            "tabs": [
                {
                    "title": "Dane",
                    "sections": [
                        {
                            "title": "Uczestnicy",
                            "domain": "PARTY_BLOCK",
                            "repeating": True,
                            "fields": [
                                {
                                    "label": "Identyfikator",
                                    "semantic_type": "PESEL",
                                    "type": "NUMBER",
                                },
                                {"label": "Imię i nazwisko/nazwa", "type": "TEXT_FIELD"},
                            ],
                        }
                    ],
                }
            ],
        }
        doc = ReadDocument(ocr=False, blocks=[Block(id=1, page=1, text="Uczestnicy", kind="text")])
        result = convert_to_coi(Extraction.model_validate(data), doc, FORM_ID)
        party = result.form_ir.form["children"][0]["children"][0]["children"][0]
        repeat = party["children"][0]
        item = repeat["children"][0]
        self.assertEqual(
            (party["type"], repeat["type"], item["type"]), ("PARTY_BLOCK", "REPEATER", "ITEM")
        )
        identifier = item["children"][0]
        self.assertEqual(identifier["binding"]["scope"], "item")
        self.assertEqual(identifier["config"]["semanticType"], "PESEL")
        self.assertTrue(all(rule["evaluationScope"] == "item" for rule in result.form_ir.rules))
        projected = result.draft.tabs[0].questions[0].field.repeatingSectionGrid
        self.assertEqual(projected[0].field.type, "TEXT_FIELD")
        self.assertTrue(result.form_ir.review)
        with self.assertRaises(ValidationError):
            ExtractedField(label="Identyfikator", type="TEXT_FIELD", semantic_type="invented")

    def test_candidates_never_apply_another_documents_inventory(self):
        source = "# Wniosek o ustalenie numeru porządkowego\nNazwa ulicy: ..."
        result = form_from_text(source, False, FORM_ID)
        self.assertEqual(result.form_ir.procedure.match, "text_candidate")
        self.assertEqual(result.form_ir.procedure.candidates[0].id, "ADDRESS_NUMBER")
        self.assertEqual(result.form_ir.sourceFields, [])
        self.assertNotIn("Browarna", result.model_dump_json())
        self.assertEqual(assess("Inny blankiet", None).status, "unknown")
        self.assertFalse(result.form_ir.form["config"]["submissionEnabled"])

    def test_generated_rules_resolve_and_broken_links_and_nesting_fail(self):
        form = form_from_text("Wnioskodawca:\nImię i nazwisko/nazwa: ...", False, FORM_ID).form_ir
        self.assertEqual(len(rule_choices(form.form, form.rules, form.evidence)), 3)
        broken = deepcopy(form.rules)
        broken[0]["target"] = "absent"
        with self.assertRaisesRegex(ValueError, "Unresolved"):
            rule_choices(form.form, broken, form.evidence)
        invalid = form.model_dump()
        invalid["form"]["children"][0]["type"] = "TEXT_FIELD"
        self.assertFalse(form_validator().is_valid(invalid))
        self.assertEqual(
            form,
            form_from_text("Wnioskodawca:\nImię i nazwisko/nazwa: ...", False, FORM_ID).form_ir,
        )

    def setUp(self):
        token = "fixture-" + "x" * 40
        settings = Settings.from_environment(
            {
                "PYWORKER_API_TOKEN": token,
                "PYWORKER_FORM_MODE": "ocr",
            }
        )
        self.client = self.enterContext(TestClient(create_app(settings)))
        self.headers = {"Authorization": f"Bearer {token}"}

    def test_published_contract_and_catalog_require_the_worker_token(self):
        path = "/v1/forms/schemas/v1"
        for url in (path, path + "/catalog"):
            self.assertEqual(self.client.get(url).status_code, 401)
        schema = self.client.get(path, headers=self.headers).json()
        Draft202012Validator.check_schema(schema)
        self.assertEqual(schema, form_validator().schema)
        response = self.client.get(path + "/catalog", headers=self.headers).json()
        self.assertEqual(len(response["componentCatalog"]), 84)
        self.assertEqual(len(response["procedureProfiles"]), 11)

    @unittest.skipUnless(SAMPLES.is_dir(), "Local COI samples not installed")
    def test_audited_pdfs_via_process_endpoint(self):
        meta = {
            "paid": True,
            "form_id": str(FORM_ID),
            "uploaded_at": "2026-11-21T12:00:00Z",
            "submitted_at": "2026-11-21T12:01:00Z",
            "sender": {"uuid": str(UUID(int=2)), "name": "Test", "email": "test@example.test"},
        }
        seen = set()
        for file in SAMPLES.rglob("*"):
            if file.suffix.lower() != ".pdf":
                continue
            data = file.read_bytes()
            if hashlib.sha256(data).hexdigest() not in catalog()["documents"]:
                continue
            with self.subTest(file=file.name):
                response = self.client.post(
                    "/v1/forms/process?as_of=2026-10-01",
                    headers=self.headers,
                    data={"metadata": json.dumps(meta)},
                    files={"file": ("inna nazwa.pdf", data, "application/pdf")},
                )
                self.assertEqual(response.status_code, 200, response.text[:200])
                result = response.json()
                self.assertEqual((result["ocr"], result["llm"]), ("not_required", "bypassed"))
                model = result["form_ir"]
                self.assertTrue(form_validator().is_valid(model))
                proc = model["procedure"]
                doc = proc["documentId"]
                self.assertEqual(proc["match"], "reference_sha256")
                self.assertEqual(doc, catalog()["documents"][proc["sourceSha256"]])
                seen.add(doc)
                self.assertEqual(
                    {f["key"] for f in model["sourceFields"]},
                    {e["sourceKey"] for e in model["evidence"] if e["sourceKey"]},
                )
                fields = {
                    q["field"]["title"]: q["field"]
                    for t in result["draft"]["tabs"]
                    for section in t["questions"]
                    for q in section["field"]["repeatingSectionGrid"]
                }
                if doc == "D04":
                    self.assertTrue(fields["Nr ewidencyjny działki"])
                    self.assertEqual(fields["Klauzula informacyjna"]["type"], "TEXT_BLOCK")
                    self.assertIn("2016/679", fields["Klauzula informacyjna"]["description"])
                    self.assertNotIn("CONSENT_SECTION", [f["type"] for f in fields.values()])
                elif doc == "D03":
                    self.assertEqual(model["extended"]["asOf"], "2026-10-01")
                    earlier = self.client.post(
                        "/v1/forms/process?as_of=2026-09-30",
                        headers=self.headers,
                        data={"metadata": json.dumps(meta)},
                        files={"file": ("wniosek.pdf", data, "application/pdf")},
                    )
                    self.assertEqual(earlier.status_code, 200, earlier.text[:200])
                    previous = earlier.json()["form_ir"]
                    self.assertIsNone(previous.get("extended"))
                    self.assertIn(
                        "no_applicable_legal_profile", [r["reason"] for r in previous["review"]]
                    )
                    bank = fields["Numer rachunku bankowego"]
                    self.assertIn("BANK_REFUND_REQUEST", bank["states"][0]["query"])
                    self.assertIn(
                        "FUTURE_CREDIT_REQUEST",
                        fields["Rodzaj przyszłego zobowiązania"]["states"][0]["query"],
                    )
                elif doc == "D02":
                    self.assertEqual(proc["status"], "multiple")
                    self.assertEqual(len(proc["candidates"]), 3)
                elif doc in {"D06", "D09"}:
                    self.assertEqual(proc["status"], "blocked")
        self.assertEqual(seen, set(catalog()["documents"].values()))
