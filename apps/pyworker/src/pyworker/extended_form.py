"""Compile a reviewed document through the EXTENDED registry into the shared form plan."""

from datetime import date
from uuid import uuid5

from pyworker.coi import ExtractedField, ExtractedSection, ExtractedTab, Extraction, PlannedField
from pyworker.form_ir import (
    Evidence,
    ReviewItem,
    activation,
    answer_is,
    form_validator,
    node,
    normalized,
    validated_ir,
)
from pyworker.form_plan import FormPlan, classify, field_config
from pyworker.legal_profiles import TAX_PROFILE, active_when, select_profile

# These optional draft controls can be included after an editorial decision.
# Other REVIEW items need a revised procedure profile before they can be compiled safely.
EDITORIAL_FIELDS = {"contact_phone", "contact_email", "tax_period", "bank_owner"}
SEMANTICS = {
    "bank_account": "ACCOUNT_PL",
    "overpayment_amount": "MONEY_PLN",
    "application_date": "CALENDAR_DATE",
    "pesel": "PESEL",
    "nip": "NIP",
    "signature_requirement": "SIGNATURE_RESULT",
}
SOURCE_GROUPS = {
    "application_date": ("place_date", "Ulan-Majorat, dnia"),
    "person_first_name": ("applicant.identity", "Nazwisko i imię"),
    "person_last_name": ("applicant.identity", "Nazwisko i imię"),
    "organization_name": ("applicant.identity", "Nazwa firmy"),
    "postal_code": ("applicant.address", "adres zamieszkania"),
    "pesel": ("applicant.tax_id", "PESEL"),
    "nip": ("applicant.tax_id", "NIP"),
    "tax_type": ("tax.kind", "rodzaj podatku"),
    "overpayment_amount": ("tax.amount", "w kwocie"),
    "application_reason": ("reason", "Uzasadnienie"),
    "settlement_choice": ("refund.method", "Kwotę nadpłaty proszę"),
    "future_tax_name": ("refund.future_tax", "przyszłego zobowiązania podatkowego"),
    "bank_account": ("refund.account", "na wskazany rachunek"),
    "correction_document": ("attachments.correction", "korekta deklaracji"),
    "other_documents": ("attachments.other", "w załączeniu"),
    "signature_requirement": ("signature", "podpis wnioskodawcy lub osoby upoważnionej"),
}


def compile_extended(
    assessment, form_id, as_of=None, resolutions=None, document=None, *, version=None
):
    as_of = as_of or date.today()
    resolutions = resolutions or {}
    record = select_profile(TAX_PROFILE, as_of, version)
    form, profile = record["form"], record["profile"]
    candidates = {f["key"]: f for f in form["fields"]}
    tabs, sections, steps, evidence, rules, review = [], {}, [], [], [], []
    audit = []
    blocks = (
        [(b.id, normalized(b.text)) for b in document.blocks if b.kind != "input"]
        if document
        else []
    )

    def leaf_id(key):
        return "f." + str(uuid5(form_id, "field-" + key))

    def expression(predicate):
        op = predicate["op"]
        if op in {"all", "any"}:
            return {
                "op": "and" if op == "all" else "or",
                "args": [expression(p) for p in predicate["args"]],
            }
        term = answer_is(leaf_id(predicate["field"]), predicate["value"])
        if op not in {"eq", "neq"}:
            raise ValueError("Unsupported COI projection")
        term["op"] = "eq" if op == "eq" else "ne"
        source = candidates[predicate["field"]]
        guards = [expression(source["activeWhen"])] if source["activeWhen"] else []
        constraint = source.get("optionConstraints", {}).get(predicate["value"])
        if constraint and op == "eq":
            guards.append(expression(constraint))
        return {"op": "and", "args": [term, *guards]} if guards else term

    def included(f):
        return f["decision"] in {"AUTO", "CONDITIONAL"} or (
            f["key"] in EDITORIAL_FIELDS
            and resolutions.get(f["key"], {}).get("outcome") == "ACCEPT"
        )

    for key, f in candidates.items():
        audit.append(
            {
                **f,
                "semanticKey": key,
                "purpose": f.get("help") or f["label"],
                "sourceEvidence": f["evidence"],
                "resolution": resolutions.get(key),
                "canIncludeAfterReview": key in EDITORIAL_FIELDS,
                "effectiveActiveWhen": active_when(f),
                "included": included(f) and f["section"] != "external_correction_flow",
            }
        )
    for ti, tab in enumerate(form["tabs"], 1):
        groups, group_nodes = [], []
        for group in tab["sections"]:
            planned, children = [], []
            for f in candidates.values():
                if f["section"] != group["key"] or not included(f):
                    continue
                key = f["key"]
                kind = {
                    "application_date": "DATEPICKER",
                    "municipality": "TEXT_FIELD",
                    "review_document": "INFO_SECTION",
                }.get(key, f["widget"])
                label = "Gmina / miejscowość" if key == "municipality" else f["label"]
                default = f.get("default") if key == "authority_name" else None
                description = f.get("help", "")
                if key == "authority_name":
                    description = f"Ulan-Majorat 57, 21-307 Ulan-Majorat. {description}"
                codes = tuple(o["value"] for o in f.get("options", []))
                spec = ExtractedField(
                    label=label,
                    type=kind,
                    semantic_type=SEMANTICS.get(key),
                    options=[o["label"] for o in f.get("options", [])],
                    dictionary_name="Kraje" if key == "country" else None,
                    read_only=key == "authority_name",
                    default_value=default,
                    description=description,
                    required=f["requiredWhen"] is True,
                )
                field_id = leaf_id(key)
                source_key, quote = SOURCE_GROUPS.get(key, (None, ""))
                if key == "authority_name":
                    quote = "Urząd Gminy Ulan-Majorat"
                refs = [i for i, text in blocks if quote and normalized(quote) in text][:6]
                spec.label_blocks = refs
                ev = Evidence(
                    id="e." + field_id,
                    label=quote or label,
                    description=", ".join(f["evidence"]),
                    printedValue=default,
                    blocks=refs,
                    pages=[1]
                    if source_key or any(s.startswith("PDF_TAX:") for s in f["evidence"])
                    else [],
                    method="source_inventory",
                    sourceKey=source_key,
                )
                evidence.append(ev)
                component, semantic = classify(spec, {})
                config = field_config(spec, semantic)
                if codes:
                    config["options"] = [
                        {"code": o["value"], "label": o["label"]} for o in f["options"]
                    ]
                if key == "bank_account":
                    config["validator"] = "pl_bank_account"
                if key == "overpayment_amount":
                    config.update(validator="positive_pln", currency="PLN", scale=2)
                if key == "signature_requirement":
                    config.update(documentRef="form." + str(form_id), ruleBasis="LP-011")
                leaf = node(
                    field_id,
                    component,
                    label,
                    config=config,
                    refs=[ev.id],
                    required=spec.required,
                    editable=kind not in {"TEXT_BLOCK", "INFO_SECTION"} and not spec.read_only,
                )
                if f["origin"] != "DOCUMENT":
                    leaf["provenance"]["kind"] = "design_proposal"
                if condition := active_when(f):
                    rules.append(activation(field_id, expression(condition)))
                    leaf["state"]["active"] = False
                if f["requiredWhen"] == "REVIEW_LEGAL_PROFILE" or key == "municipality":
                    review.append(
                        ReviewItem(nodeId=field_id, reason="verify_requirement_or_dictionary")
                    )
                planned.append(PlannedField(spec, name=key, option_codes=codes))
                children.append(leaf)
            if planned:
                sections[ti, len(groups) + 1] = planned
                groups.append(
                    ExtractedSection(title=group["title"], fields=[p.source for p in planned])
                )
                group_nodes.append(
                    node("section." + group["key"], "SECTION", group["title"], children=children)
                )
        if groups:
            tabs.append(ExtractedTab(title=tab["key"], sections=groups))
            steps.append(node(f"step.{ti}", "STEP", tab["key"], children=group_nodes))
    result = Extraction(title="Wniosek o stwierdzenie nadpłaty podatku", tabs=tabs)
    root = node(
        "form." + str(form_id),
        "FORM",
        result.title,
        children=steps,
        config={"productionReady": False, "submissionEnabled": False},
    )
    ir = validated_ir(assessment, root, rules, review, evidence)
    ir.extended = {
        "mode": "EXTENDED",
        "profileId": profile["profileId"],
        "version": profile["version"],
        "asOf": as_of.isoformat(),
        "effectiveFrom": profile["effectiveFrom"],
        "effectiveTo": profile["effectiveTo"],
        "status": form["status"],
        "publicationBlockedBy": form["publicationBlockedBy"],
        "legalRules": profile["legalRules"],
        "sources": profile["sourceRegistry"],
        "identityModel": form["identityModel"],
        "signatureTarget": {
            "documentRef": root["id"],
            "sourceTemplateSha256": assessment.sourceSha256,
            "recordContract": "Signature",
            "representationField": "representation_mode",
            "subjectFields": [
                "entity_kind",
                "person_first_name",
                "person_last_name",
                "organization_name",
            ],
            "representativeFields": ["representative_first", "representative_last"],
            "status": "not_signed",
        },
        "specialProcedurePaths": form["specialProcedurePaths"],
        "findings": record["findings"],
        "candidates": audit,
    }
    form_validator().validate(ir.model_dump(mode="json"))
    return FormPlan(result, sections, ir)
