import unittest
from pathlib import Path
from uuid import UUID

from fastapi.testclient import TestClient

from pyworker.coi import Block, ReadDocument
from pyworker.config import Settings
from pyworker.docx import docx_text
from pyworker.form_ir import assess, catalog
from pyworker.forms import VALUE_PATH
from pyworker.main import create_app
from pyworker.ocr_form import form_from_text
from pyworker.tax_overpayment import (
    CREDIT,
    ORG_JOINT,
    ORG_PROXY,
    ORG_REP,
    OTHER,
    OWN,
    PERSON_PROXY,
    PRIVATE,
    TRANSFER,
)

SAMPLES = Path(__file__).resolve().parents[3] / "materials/formularze/05-nadplata-podatku"


def active(expr, answers):
    if expr["op"] in {"eq", "ne"}:
        ref, literal = expr["args"]
        value = answers.get(ref["path"])
        return value is not None and ((value == literal["value"]) == (expr["op"] == "eq"))
    values = [active(term, answers) for term in expr["args"]]
    return all(values) if expr["op"] == "and" else any(values)


class TaxProfileTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        digest = next(key for key, doc in catalog()["documents"].items() if doc == "D03")
        text = "Wniosek o stwierdzenie nadpłaty podatku\nUzasadnienie: ..."
        doc = ReadDocument(
            sha256=digest, ocr=False, blocks=[Block(id=1, page=1, kind="text", text=text)]
        )
        cls.result = form_from_text(
            text, False, UUID(int=71), document=doc, semantic_mode="STANDARD"
        )
        cls.fields = {
            c.field.techName: c.field
            for tab in cls.result.draft.tabs
            for s in tab.questions
            for c in [s, *s.field.repeatingSectionGrid]
        }
        cls.rules = {rule["target"]: rule["expression"] for rule in cls.result.form_ir.rules}

    def visible(self, **answers):
        values = {"/f." + str(self.fields[name].id): value for name, value in answers.items()}
        return {
            name
            for name, f in self.fields.items()
            if (expr := self.rules.get("f." + str(f.id))) is None or active(expr, values)
        }

    def test_taxpayer_and_signer_are_distinct(self):
        roles = [
            (OWN, PRIVATE, "pesel_podatnika", "podatnik_imie", "podpis_wlasny"),
            (OWN, OTHER, "nip_podatnika", "podatnik_imie", "podpis_wlasny"),
            (PERSON_PROXY, PRIVATE, "pesel_podatnika", "mocodawca_imie", "podpis_pelnomocnika"),
            (ORG_PROXY, PRIVATE, "nip_podatnika", "nazwa_podmiotu", "podpis_pelnomocnika"),
            (ORG_REP, PRIVATE, "nip_podatnika", "nazwa_podmiotu", "podpis_reprezentanta"),
            (ORG_JOINT, PRIVATE, "nip_podatnika", "nazwa_podmiotu", "podpis_laczny"),
        ]
        for role, status, identifier, principal, signature in roles:
            with self.subTest(role=role, status=status):
                visible = self.visible(sposob_zlozenia=role, status_osoby_fizycznej=status)
                self.assertEqual(visible & {"pesel_podatnika", "nip_podatnika"}, {identifier})
                self.assertEqual(
                    visible & {"podatnik_imie", "mocodawca_imie", "nazwa_podmiotu"}, {principal}
                )
                self.assertEqual({s for s in visible if s.startswith("podpis_")}, {signature})
                self.assertEqual("dodatkowy_reprezentant_nazwisko" in visible, role == ORG_JOINT)
                self.assertEqual("pelnomocnictwo" in visible, role in (ORG_PROXY, PERSON_PROXY))
                self.assertEqual("dokument_reprezentacji" in visible, role in (ORG_REP, ORG_JOINT))
        self.assertFalse(self.visible(sposob_zlozenia=OWN) & {"pesel_podatnika", "nip_podatnika"})

    def test_addresses_refund_and_inactive_controllers(self):
        answers = {"adres_mocodawcy_kraj": "Francja", "dolaczenie_dowodu_oplaty": "Tak"}
        foreign = self.visible(sposob_zlozenia=PERSON_PROXY, sposob_rozliczenia=TRANSFER, **answers)
        self.assertTrue(
            {"adres_mocodawcy_kod_zagraniczny", "rachunek_zwrotu", "dowod_oplaty"} <= foreign
        )
        self.assertFalse({"adres_mocodawcy_kod_pl", "przyszle_zobowiazanie"} & foreign)
        own = self.visible(
            sposob_zlozenia=OWN,
            adres_podatnika_kraj="Polska",
            sposob_rozliczenia=CREDIT,
            **answers,
        )
        self.assertTrue({"adres_podatnika_kod_pl", "przyszle_zobowiazanie"} <= own)
        self.assertFalse(
            {
                "adres_mocodawcy_kraj",
                "adres_podatnika_kod_zagraniczny",
                "rachunek_zwrotu",
                "dowod_oplaty",
            }
            & own
        )
        query = self.fields["dowod_oplaty"].states[0]["query"]
        for text in (
            'tabs["Dane"',
            'tabs["Dokumenty"',
            '"sekcja_umocowanie"',
            '"sposob_zlozenia"',
            " and ",
        ):
            self.assertIn(text, query)

    def test_printed_text_and_export_contract(self):
        self.assertEqual(
            [t.title for t in self.result.draft.tabs],
            ["Dane", "Informacje o nadpłacie", "Dokumenty", "Podsumowanie"],
        )
        self.assertEqual(
            self.fields["organ"].defaultValue,
            "Urząd Gminy Ulan-Majorat, Ulan-Majorat 57, 21-307 Ulan-Majorat",
        )
        self.assertTrue(self.fields["organ"].readOnly)
        self.assertEqual(self.fields["data_wniosku"].type, "DATEPICKER")
        self.assertEqual(self.fields["uzasadnienie"].type, "TEXTAREA")
        self.assertIn(
            "NIP wpisują pozostali podatnicy.", self.fields["status_osoby_fizycznej"].description
        )
        self.assertNotIn("CONSENT_SECTION", {f.type for f in self.fields.values()})
        for name in self.fields:
            self.assertNotRegex(name, r"_\d+_\d+")

    @unittest.skipUnless(SAMPLES.is_dir(), "Local COI samples not installed")
    def test_docx_footnote_recognizes_same_blank_but_changed_authority_does_not(self):
        with next(SAMPLES.glob("*podatku.docx")).open("rb") as source:
            text = docx_text(source)
        self.assertIn("NIP wpisują pozostali podatnicy.", text)
        self.assertEqual(assess(text, None).match, "reference_text")
        self.assertIsNone(
            assess(text.replace("Ulan-Majorat 57", "Ulan-Majorat 99"), None).documentId
        )

    def test_value_checks_via_authenticated_endpoint(self):
        token = "fixture-" + "x" * 40
        with TestClient(
            create_app(Settings.from_environment({"PYWORKER_API_TOKEN": token}))
        ) as client:
            for validator, good, bad in (
                ("positive_pln", ["0,01", "120", "120.20"], ["0", "-3", "0.001", "1e2", "NaN"]),
                (
                    "pl_bank_account",
                    ["61109010140000071219812874", "PL61 1090 1014 0000 0712 1981 2874"],
                    ["62109010140000071219812874", "PL123", "DE61109010140000071219812874"],
                ),
            ):
                for value in good + bad:
                    r = client.post(
                        VALUE_PATH,
                        json={"validator": validator, "value": value},
                        headers={"Authorization": "Bearer " + token},
                    )
                    self.assertEqual((r.status_code, r.json()), (200, {"valid": value in good}))
            self.assertEqual(client.post(VALUE_PATH, json={}).status_code, 401)
