import unittest
from io import BytesIO
from unittest.mock import patch
from uuid import UUID

from fastapi.testclient import TestClient
from pypdf import PdfWriter
from pypdf.generic import ArrayObject, DictionaryObject, NameObject, NumberObject, TextStringObject

from pyworker.answer_checks import CHECK_ANSWERS, reported_status
from pyworker.config import Settings
from pyworker.main import create_app
from pyworker.ocr_form import form_from_text
from pyworker.pdf_text import read_pages

FORM_ID = UUID(int=35)


class AnswerTests(unittest.TestCase):
    def test_answers_from_labels_table_and_next_line_are_kept_outside_coi(self):
        result = form_from_text(
            "# Wniosek testowy\nPESEL:\n44051401459\n| E-mail | brak-malpy |\n"
            "NIP: ..........\nUwaga: treść instrukcji",
            False,
            FORM_ID,
        )
        self.assertCountEqual(result.source_answers.values(), ["44051401459", "brak-malpy"])
        for value in result.source_answers.values():
            self.assertNotIn(value, result.draft.model_dump_json())

    def test_read_only_widget_answers_and_hidden_widgets(self):
        writer = PdfWriter()
        page = writer.add_blank_page(320, 200)
        annotations = ArrayObject()
        for label, value, flags in [("NIP", "123", 0), ("PESEL", "hidden-value", 2)]:
            entry = DictionaryObject(
                {
                    NameObject("/Subtype"): NameObject("/Widget"),
                    NameObject("/FT"): NameObject("/Tx"),
                    NameObject("/T"): TextStringObject(label),
                    NameObject("/V"): TextStringObject(value),
                    NameObject("/F"): NumberObject(flags),
                }
            )
            annotations.append(writer._add_object(entry))
        page[NameObject("/Annots")] = annotations
        data = BytesIO()
        writer.write(data)
        self.assertEqual([p.strip() for p in read_pages(data.getvalue(), 4000)], ["NIP: 123"])

    def test_offline_batch_and_bearer_boundary(self):
        token = "test-token-" + "b" * 48
        app = create_app(Settings(token=token, concurrency=1, task_timeout=1))
        cases = [
            ("pl.pesel.v1", "44051401459", "INVALID"),
            ("pl.pesel.v1", "44051401458", "VALID"),
            ("pl.pesel.v1", "99023100000", "INVALID"),
            ("internet.email_basic.v1", "brak-malpy", "INVALID"),
            ("internet.email_basic.v1", "test@example.invalid", "VALID"),
            ("common.money.v1", "999.999", "INVALID"),
            ("common.money.v1", "99,99", "VALID"),
            ("common.iso_date.v1", "2026-02-29", "INVALID"),
            ("international.postal_format.v1", "", "NOT_APPLICABLE"),
            ("international.country_code.v1", "PL", "VALID"),
            ("international.iban.v1", "DE89370400440532013001", "INVALID"),
            ("international.iban.v1", "DE89370400440532013000", "UNAVAILABLE"),
            ("pl.address.prg.v1", {"countryCode": "PL", "buildingNumber": "4"}, "UNAVAILABLE"),
        ]
        body = {
            "checks": [
                {"field": str(UUID(int=i)), "validatorId": name, "value": value}
                for i, (name, value, _) in enumerate(cases)
            ]
        }
        with (
            TestClient(app) as client,
            patch("pyworker.answer_checks.dictionaries", return_value=None),
        ):
            self.assertEqual(client.post(CHECK_ANSWERS, json=body).status_code, 401)
            response = client.post(
                CHECK_ANSWERS, json=body, headers={"Authorization": f"Bearer {token}"}
            )
            self.assertEqual(response.status_code, 200)
            self.assertEqual([r["status"] for r in response.json()], [s for _, _, s in cases])
            self.assertNotIn("44051401459", response.text)

    def test_conflicting_registry_result_never_approves_answer(self):
        result = {"status": "VALID", "checks": {"format": "VALID", "checksum": "INVALID"}}
        self.assertEqual(reported_status(result), "INVALID")
        self.assertEqual(reported_status({"status": "UNVERIFIED"}), "UNVERIFIED")
