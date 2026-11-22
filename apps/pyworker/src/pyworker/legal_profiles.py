"""Versioned, offline legal profiles and three-valued evaluation of their predicates."""

import json
from datetime import date
from decimal import Decimal, InvalidOperation
from functools import cache

from pyworker.field_values import ValueCheck, pln_amount, valid_tax_identifier, valid_value
from pyworker.form_ir import RESOURCE

APPLICATION = "APPLICATION"
CORRECTION = "CORRECTION"
TAX_PROFILE = "pl.tax.overpayment.local.2026.10.extended"


def active_when(field):
    if field["key"] == "bank_owner":
        return {"op": "eq", "field": "settlement_choice", "value": "BANK_REFUND_REQUEST"}
    return field["activeWhen"]


class ProfileUnavailable(ValueError):
    pass


@cache
def registry():
    records = json.loads((RESOURCE / "legal-profiles.json").read_text(encoding="utf-8"))
    for record in records:
        validate_record(record)
    return records


def validate_record(record):
    from graphlib import TopologicalSorter

    form, profile = record["form"], record["profile"]
    fields = {f["key"]: f for f in form["fields"]}
    rule_ids = {r["id"] for r in profile["legalRules"]}
    sources = {s["sourceId"] for s in profile["sourceRegistry"]}
    if len(fields) != len(form["fields"]) or any(
        not sources.issuperset(r["sources"]) for r in profile["legalRules"]
    ):
        raise ValueError("Invalid profile registry references")
    dependencies = TopologicalSorter()

    def refs(predicate):
        if predicate is None:
            return set()
        if predicate["op"] in {"all", "any"}:
            return set().union(*(refs(p) for p in predicate["args"]))
        if predicate["op"] not in {"eq", "neq", "gt"}:
            raise ValueError("Unsupported profile predicate")
        return {predicate["field"]}

    for key, f in fields.items():
        options = {o["value"] for o in f.get("options", [])}
        constraints = f.get("optionConstraints", {})
        inputs = refs(active_when(f)).union(*(refs(p) for p in constraints.values()))
        if (
            not inputs <= fields.keys() | {"procedure_path", "correction_overpayment_amount"}
            or not options.issuperset(constraints)
            or not rule_ids.issuperset(f["legalRuleIds"])
        ):
            raise ValueError("Unresolved semantic dependency: " + key)
        dependencies.add(key, *inputs)
    tuple(dependencies.static_order())


def select_profile(profile_id, as_of: date, version=None):
    matches = []
    for record in registry():
        profile = record["profile"]
        if profile["profileId"] != profile_id or version and profile["version"] != version:
            continue
        if profile["effectiveFrom"] <= as_of.isoformat() and (
            not profile["effectiveTo"] or as_of.isoformat() <= profile["effectiveTo"]
        ):
            matches.append(record)
    if len(matches) != 1:
        raise ProfileUnavailable("profile_version_unavailable")
    return matches[0]


def evaluate(predicate, lookup):
    """None is an unresolved condition. False dominates AND and true dominates OR."""
    if predicate is None:
        return True
    op = predicate["op"]
    if op in {"all", "any"}:
        results = [evaluate(item, lookup) for item in predicate["args"]]
        decisive = op == "any"
        return decisive if decisive in results else None if None in results else not decisive
    value = lookup(predicate["field"])
    if value is None or value == "" or value == []:
        return None
    expected = predicate["value"]
    if op == "eq":
        return value == expected
    if op == "neq":
        return value != expected
    if op == "gt":
        try:
            number = Decimal(str(value).replace(",", "."))
            return number > Decimal(str(expected)) if number.is_finite() else None
        except InvalidOperation:
            return None
    raise ValueError("unsupported_predicate")


def evaluate_answers(record, answers, path, *, accepted=()):
    fields = {field["key"]: field for field in record["form"]["fields"]}
    errors, unresolved, active_values = {}, set(), {}
    states = {}
    external = {"procedure_path": path, "correction_overpayment_amount": None}
    if path == CORRECTION:
        amount = answers.get("correction_overpayment_amount")
        if amount is None or amount == "":
            unresolved.add("correction_overpayment_amount")
        elif (parsed := pln_amount(amount)) is None:
            errors["correction_overpayment_amount"] = "invalid_pln"
        else:
            external["correction_overpayment_amount"] = parsed

    @cache
    def value(key):
        if key in external:
            return external[key]
        field = fields[key]
        if state(key) is not True:
            return None
        answer = answers.get(key)
        if key == "authority_name":
            return field["default"]
        if field["widget"] in {"RADIO", "SELECT"} and isinstance(answer, list) and len(answer) == 1:
            answer = answer[0]
        if answer in (None, "", []):
            return None
        if field["widget"] == "FILE_UPLOADER":
            if not isinstance(answer, list) or not all(
                isinstance(v, str) and v.strip() for v in answer
            ):
                errors[key] = "expected_file_references"
                return None
        elif field["widget"] != "NUMBER" and not isinstance(answer, str):
            errors[key] = "expected_text_or_option_code"
            return None
        if key in {"pesel", "nip"} and not valid_tax_identifier(key, answer):
            errors[key] = "invalid_tax_identifier"
            return None
        if key == "application_date":
            try:
                date.fromisoformat(answer)
            except ValueError:
                errors[key] = "invalid_date"
                return None
        if field.get("options"):
            if answer not in [o["value"] for o in field["options"]]:
                errors[key] = "unknown_option"
                return None
            allowed = evaluate(field.get("optionConstraints", {}).get(answer), value)
            if allowed is not True:
                if allowed is False:
                    errors[key] = "option_not_allowed"
                else:
                    unresolved.add(key)
                return None
        return answer

    @cache
    def state(key):
        field = fields[key]
        if field["decision"] == "REJECT" or field["decision"] == "REVIEW" and key not in accepted:
            return False
        is_correction = field["section"] == "external_correction_flow"
        if is_correction != (path == CORRECTION):
            return False
        return evaluate(active_when(field), value)

    for key, field in fields.items():
        active = state(key)
        states[key] = "UNKNOWN" if active is None else "TRUE" if active else "FALSE"
        if active is None:
            unresolved.add(key)
        if active is not True or field["widget"] == "TEXT_BLOCK":
            continue
        answer = value(key)
        if answer is None:
            if field["requiredWhen"] is True and key not in errors:
                unresolved.add(key)
            continue
        if key in {"bank_account", "overpayment_amount"}:
            validator = "pl_bank_account" if key == "bank_account" else "positive_pln"
            if (
                not isinstance(answer, (str, int, float))
                or len(str(answer)) > 128
                or not valid_value(ValueCheck(validator=validator, value=str(answer)))
            ):
                errors[key] = validator
                continue
        active_values[key] = answer
    if path == APPLICATION and value("case_role") in {"WITHHOLDING_AGENT", "COLLECTOR"}:
        if value("payer_not_withheld") == "NO":
            errors["payer_not_withheld"] = "review_eligibility_LP_001"
        elif value("payer_not_withheld") is None:
            unresolved.add("payer_not_withheld")
    return {
        "states": states,
        "activeAnswers": active_values,
        "errors": errors,
        "needsInput": sorted(unresolved),
        "submissionEnabled": False,
    }
