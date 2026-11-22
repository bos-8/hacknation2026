import unittest
from collections import Counter
from datetime import date
from uuid import uuid4

from fastapi.testclient import TestClient

from pyworker.config import Settings
from pyworker.extended_form import compile_extended
from pyworker.form_compiler import render_plan
from pyworker.form_ir import assess, catalog, form_validator
from pyworker.legal_profiles import TAX_PROFILE, evaluate_answers, select_profile
from pyworker.main import create_app
from pyworker.profile_api import EVALUATE, PROFILES, REVIEW

AS_OF = date(2026, 11, 22)


class ExtendedTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.record = select_profile(TAX_PROFILE, AS_OF)
        cls.proc = assess("", next(h for h, key in catalog()["documents"].items() if key == "D03"))
        cls.version = {
            "profileId": TAX_PROFILE,
            "version": cls.record["profile"]["version"],
            "asOf": AS_OF.isoformat(),
        }

    def check(self, **answers):
        return evaluate_answers(self.record, answers, "APPLICATION")

    def test_draft_is_compiled_from_eligible_candidates(self):
        uid = uuid4()
        result = render_plan(compile_extended(self.proc, uid, AS_OF), None, uid)
        ir = result.form_ir
        self.assertTrue(form_validator().is_valid(ir.model_dump(mode="json")))
        candidates = ir.extended["candidates"]
        self.assertEqual(
            Counter(f["decision"] for f in candidates),
            {"AUTO": 20, "CONDITIONAL": 18, "REVIEW": 8, "REJECT": 3},
        )
        actual = {
            q.field.techName
            for t in result.draft.tabs
            for s in t.questions
            for q in s.field.repeatingSectionGrid
        }
        self.assertEqual(actual, {f["key"] for f in candidates if f["included"]})
        self.assertEqual(len(actual), 37)
        self.assertNotIn("correction_written_justification", actual)
        self.assertIn("application_reason", actual)
        self.assertFalse(ir.form["config"]["submissionEnabled"])
        self.assertTrue(ir.extended["publicationBlockedBy"])

    def test_country_and_inactive_answers(self):
        self.assertEqual(self.check()["states"]["city_foreign"], "UNKNOWN")
        for country, active in [("Polska", "municipality"), ("Czechy", "city_foreign")]:
            result = self.check(country=country, city_foreign="Brno", municipality="Warszawa")
            self.assertEqual(
                result["activeAnswers"].keys() & {"city_foreign", "municipality"}, {active}
            )
        for option, expected in [
            ("FUTURE_CREDIT_REQUEST", "future_tax_name"),
            ("BANK_REFUND_REQUEST", "bank_account"),
        ]:
            result = self.check(
                settlement_choice=option,
                future_tax_name="Podatek",
                bank_account="61109010140000071219812874",
            )
            self.assertEqual(
                result["activeAnswers"].keys() & {"future_tax_name", "bank_account"}, {expected}
            )

    def test_options_and_eligibility(self):
        base = {
            "entity_kind": "PERSON",
            "person_business": "NO",
            "person_vat_registered": "NO",
            "person_is_payer": "NO",
            "tax_id_kind": "PESEL",
        }
        self.assertEqual(self.check(**base)["states"]["pesel"], "TRUE")
        for key, value in [
            ("entity_kind", "LEGAL_PERSON"),
            ("person_business", "YES"),
            ("person_vat_registered", "YES"),
            ("person_is_payer", "YES"),
        ]:
            result = self.check(**(base | {key: value}))
            self.assertEqual(result["errors"]["tax_id_kind"], "option_not_allowed")
        self.assertIn(
            "tax_id_kind", self.check(entity_kind="PERSON", tax_id_kind="PESEL")["needsInput"]
        )
        self.assertIn(
            "representation_mode",
            self.check(entity_kind="LEGAL_PERSON", representation_mode="SELF")["errors"],
        )
        for role in ["WITHHOLDING_AGENT", "COLLECTOR"]:
            self.assertIn(
                "payer_not_withheld", self.check(case_role=role, payer_not_withheld="NO")["errors"]
            )
        self.assertNotIn(
            "payer_not_withheld",
            self.check(case_role="TAXPAYER", payer_not_withheld="NO")["activeAnswers"],
        )
        for mode, document in [
            ("PROXY_GENERAL", "general_poa_registry_confirmation"),
            ("PROXY_SPECIFIC", "special_poa_document"),
        ]:
            self.assertEqual(self.check(representation_mode=mode)["states"][document], "TRUE")

    def test_validation_and_approved_account_owner_follow_active_branch(self):
        def with_owner(choice):
            return evaluate_answers(
                self.record,
                {"settlement_choice": choice, "bank_owner": "Posiadacz"},
                "APPLICATION",
                accepted={"bank_owner"},
            )

        self.assertIn("bank_owner", with_owner("BANK_REFUND_REQUEST")["activeAnswers"])
        self.assertNotIn("bank_owner", with_owner("FUTURE_CREDIT_REQUEST")["activeAnswers"])
        self.assertIn("application_date", self.check(application_date="2026-02-30")["errors"])
        identifier = {
            "entity_kind": "PERSON",
            "person_business": "NO",
            "person_vat_registered": "NO",
            "person_is_payer": "NO",
            "tax_id_kind": "PESEL",
        }
        self.assertIn("pesel", self.check(**identifier, pesel="44051401458")["activeAnswers"])
        self.assertIn("pesel", self.check(**identifier, pesel="44051401459")["errors"])
        organization = {"entity_kind": "LEGAL_PERSON", "tax_id_kind": "NIP"}
        self.assertIn("nip", self.check(**organization, nip="5260250274")["activeAnswers"])
        self.assertIn("nip", self.check(**organization, nip="5260250275")["errors"])

    def test_correction_amount_boundary_is_scoped_to_separate_procedure(self):
        for amount, state in [
            (None, "UNKNOWN"),
            ("9999.99", "FALSE"),
            ("10000.00", "FALSE"),
            ("10000,01", "TRUE"),
        ]:
            args = {"correction_overpayment_amount": amount}
            self.assertEqual(
                evaluate_answers(self.record, args, "CORRECTION")["states"][
                    "correction_written_justification"
                ],
                state,
            )
            self.assertEqual(
                self.check(**args)["states"]["correction_written_justification"], "FALSE"
            )
            self.assertEqual(self.check(**args)["states"]["application_reason"], "TRUE")
        invalid = evaluate_answers(
            self.record, {"correction_overpayment_amount": "10000.001"}, "CORRECTION"
        )
        self.assertIn("correction_overpayment_amount", invalid["errors"])
        self.assertEqual(invalid["states"]["correction_written_justification"], "UNKNOWN")

    def test_version_selection_and_review_recompile(self):
        token = "fixture-" + "s" * 40
        auth = {"Authorization": "Bearer " + token}
        with TestClient(
            create_app(Settings.from_environment({"PYWORKER_API_TOKEN": token}))
        ) as client:
            self.assertEqual(client.get(PROFILES).status_code, 401)
            params = self.version | {"path": "CORRECTION", "answers": {}}
            for version in [{"asOf": "2026-09-30"}, {"version": "absent"}]:
                self.assertEqual(
                    client.post(EVALUATE, json=params | version, headers=auth).status_code, 422
                )
            self.assertEqual(client.post(EVALUATE, json=params, headers=auth).status_code, 200)
            vote = {
                "outcome": "ACCEPT",
                "reason": "Potwierdzono cel kontaktu.",
                "actor": str(uuid4()),
                "at": "2026-11-22T12:00:00Z",
            }
            req = self.version | {
                "formId": str(uuid4()),
                "procedure": self.proc.model_dump(mode="json"),
            }
            for key in ["mandatory_rodo_consent", "rubber_stamp_upload", "delivery_only_proxy"]:
                self.assertEqual(
                    client.post(
                        REVIEW, json=req | {"resolutions": {key: vote}}, headers=auth
                    ).status_code,
                    422,
                )
            for outcome, expected in [("ACCEPT", True), ("DECLINE", False)]:
                res = client.post(
                    REVIEW,
                    json=req | {"resolutions": {"contact_phone": vote | {"outcome": outcome}}},
                    headers=auth,
                )
                self.assertEqual(res.status_code, 200)
                data = res.json()
                keys = {
                    q["field"]["techName"]
                    for t in data["draft"]["tabs"]
                    for s in t["questions"]
                    for q in s["field"]["repeatingSectionGrid"]
                }
                self.assertEqual("contact_phone" in keys, expected)
