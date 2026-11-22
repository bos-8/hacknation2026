"""Build the catalog tree, rule AST and COI projection from the same field plan."""

from dataclasses import dataclass
from uuid import UUID, uuid5

from pyworker.coi import Extraction, PlannedField, ReadDocument, plan_fields
from pyworker.form_ir import (
    SEMANTICS,
    DomainBlock,
    Evidence,
    FormIR,
    ReviewItem,
    activation,
    answer_is,
    assess,
    catalog,
    node,
    normalized,
    validated_ir,
)
from pyworker.procedure_forms import reviewed_extraction
from pyworker.property_form import property_profile
from pyworker.tax_overpayment import PARTIES, tax_profile

INPUT_COMPONENT = {
    "TEXT_FIELD": "TEXT_FIELD",
    "TEXTAREA": "TEXTAREA",
    "NUMBER": "DECIMAL",
    "DATEPICKER": "DATE",
    "CHECKBOX": "CHECKBOX",
    "RADIO": "RADIO",
    "SELECT": "SELECT",
    "FILE_UPLOADER": "FILE_UPLOADER",
    "TEXT_BLOCK": "TEXT_BLOCK",
    "INFO_SECTION": "NOTICE",
    "CONSENT_SECTION": "CHECKBOX",
}
TYPED_LABELS = {
    "pesel": ("IDENTIFIER", "PESEL"),
    "nip": ("IDENTIFIER", "NIP"),
    "regon": ("IDENTIFIER", "REGON"),
    "numer krs": ("IDENTIFIER", "KRS"),
    "numer telefonu": ("PHONE", None),
    "adres e mail": ("EMAIL", None),
    "numer budynku": ("TEXT_FIELD", "HOUSE_NUMBER"),
    "kod pocztowy zip": ("POSTAL_CODE", "POSTCODE"),
}


def classify(field, entry):
    label = normalized(field.label)
    semantic = entry.get("proposed_semantic_type")
    if "klauzula informacyjna" in label:
        return "PRIVACY_NOTICE", None
    if label.startswith("podpis") or semantic == "SIGNATURE":
        return "SIGNATURE_EVIDENCE", "SIGNATURE_RESULT"
    if label.startswith(("pieczatka", "pieczec", "stempel")):
        return "STAMP_EVIDENCE", "STAMP_OBSERVATION"
    if semantic == "PRIVACY_NOTICE":
        return "PRIVACY_NOTICE", None
    if semantic == "PARCEL_NUMBER" or "numer ewidencyjny dzialki" in label:
        return "TEXT_FIELD", "PARCEL_NUMBER"
    if semantic == "MONEY":
        return "MONEY", "MONEY_PLN"
    if field.semantic_type:
        component = SEMANTICS[field.semantic_type]["defaultComponent"]
        if component not in DomainBlock.__members__ and component != "GROUP":
            return component, field.semantic_type.value
    if field.dictionary_name:
        return "DICTIONARY_SELECT", None
    if field.type == "TEXT_FIELD" and label in TYPED_LABELS:
        return TYPED_LABELS[label]
    return INPUT_COMPONENT[field.type], None


def domain_block(entry):
    key = entry.get("key", "")
    if key.startswith("office."):
        return "OFFICE_BLOCK"
    if "address" in key:
        return "ADDRESS_BLOCK"
    prefix = key.split(".")[0]
    return {
        "building": "PROPERTY_BLOCK",
        "applicant": "PARTY_BLOCK",
        "beneficiary": "PERSON_BLOCK",
        "contractor": "PARTY_BLOCK",
        "responsible": "PERSON_BLOCK",
        "proxy": "REPRESENTATION_BLOCK",
        "spouse": "PERSON_BLOCK",
        "contact": "CONTACT_BLOCK",
        "authority": "AUTHORITY_BLOCK",
        "refund": "PAYMENT_BLOCK",
        "attachments": "ATTACHMENTS_BLOCK",
        "signature": "SIGNATURE_BLOCK",
        "privacy": "PRIVACY_BLOCK",
        "road": "ROAD_BLOCK",
        "sports": "SPORTS_BLOCK",
        "animals": "ANIMAL_BLOCK",
        "animal": "ANIMAL_BLOCK",
    }.get(prefix)


@dataclass
class FormPlan:
    extraction: Extraction
    sections: dict[tuple[int, int], list[PlannedField]]
    ir: FormIR


def field_evidence(key, observed, entry, blocks, ocr):
    ids = list(dict.fromkeys(observed.label_blocks + observed.input_blocks))
    if any(block_id not in blocks for block_id in ids):
        raise ValueError("Unknown source block")
    method = "ocr" if ocr else "document_text"
    if observed.confidence is not None:
        method = "model_observation"
    if entry:
        method = "source_inventory"
    return Evidence(
        id="e." + key,
        label=observed.label,
        description=observed.description,
        printedValue=observed.default_value,
        blocks=ids,
        pages=entry.get("pages") or sorted({blocks[i].page for i in ids}),
        method=method,
        sourceKey=entry.get("key"),
        actor=entry.get("actor") or observed.actor_role,
    )


def field_config(field, semantic):
    config = {"semanticType": semantic} if semantic else {}
    if field.options:
        config["options"] = [{"code": name, "label": name} for name in dict.fromkeys(field.options)]
    if field.dictionary_name:
        config["dictionary"] = field.dictionary_name
    return config


def territory_dictionaries(section):
    """Bind only unambiguous levels with their parent available in this section."""
    names = ("Województwo", "Powiat", "Gmina", "Miejscowość")
    candidates = {name: [] for name in names}
    bindings = {}
    foreign = "zagranic" in normalized(section.title)
    for field in section.fields:
        if field.read_only or field.options or field.type not in {"TEXT_FIELD", "SELECT"}:
            continue
        label = normalized(field.label)
        if label in {"kraj", "kraj zamieszkania", "kraj urodzenia", "panstwo zamieszkania"}:
            bindings[id(field)] = "Kraje"
        if foreign:
            continue
        if label == "woj":
            label = "wojewodztwo"
        for name in names:
            base = normalized(name)
            if field.dictionary_name == name or label in {
                base,
                base + " zamieszkania",
                base + " siedziby",
            }:
                candidates[name].append(field)
    for name, fields in candidates.items():
        if name == "Województwo" or len(fields) == 1:
            bindings.update((id(field), name) for field in fields)
        if len(fields) != 1:
            break
    return bindings


def refund_options(field):
    """Both source alternatives must be present before linking any dependent control."""
    if field.type != "RADIO":
        return {}
    choices = {}
    for option in field.options:
        text = normalized(option)
        if "przelew" in text:
            choices["account"] = option
        if "zalicz" in text and "zobowiaz" in text:
            choices["future_tax"] = option
    return choices if len(choices) == 2 else {}


def project_field(field, kind, entry, office):
    if office:
        reason = "office_access_requires_adapter"
    elif kind in {"SIGNATURE_EVIDENCE", "STAMP_EVIDENCE"}:
        reason = "verify_document_actor_and_method"
    elif kind in {"HIDDEN_METADATA", "CALCULATED"}:
        reason = "verify_source_component"
    else:
        if kind == "PRIVACY_NOTICE":
            return field.model_copy(update={"type": "TEXT_BLOCK", "required": False}), None
        if entry and field.type == "INFO_SECTION" and kind == "NOTICE" and not field.description:
            return field, "verify_source_component"
        if field.type in {"TEXT_FIELD", "TEXTAREA", "DATEPICKER", "NUMBER"}:
            projection = {
                "IDENTIFIER": "TEXT_FIELD",
                "POSTAL_CODE": "TEXT_FIELD",
                "PHONE": "TEXT_FIELD",
                "DATE": "DATEPICKER",
                "MONEY": "NUMBER",
                "DECIMAL": "NUMBER",
                "INTEGER": "NUMBER",
            }.get(kind, field.type)
            if projection != field.type:
                field = field.model_copy(update={"type": projection})
        return field, None
    return field.model_copy(
        update={
            "type": "INFO_SECTION",
            "required": False,
            "options": [],
            "read_only": True,
            "dictionary_name": None,
        }
    ), reason


def prepare_profile(assessment, document, form_id, template):
    extraction, controls = template
    inventory = next(
        e["fields"]
        for e in catalog()["sourceFieldInventory"]
        if e["documentId"] == assessment.documentId
    )
    sources = {e["key"]: e for e in inventory}
    text_blocks = [(b.id, normalized(b.text)) for b in document.blocks if b.kind != "input"]
    sections, steps, rules, review, evidence = {}, [], [], [], []

    def activate(component, condition):
        if condition:
            rules.append(activation(component["id"], condition))
            component["state"]["active"] = False

    for ti, tab in enumerate(extraction.tabs, 1):
        section_nodes = []
        for si, section in enumerate(tab.sections, 1):
            planned, children, conditions = [], [], []
            for spec in section.fields:
                profile = controls[id(spec)]
                key = "f." + str(uuid5(form_id, "field-" + profile.name))
                quote = profile.quote or sources[profile.evidence_key]["label"]
                words = normalized(quote)
                blocks = (
                    [] if profile.reference else [i for i, text in text_blocks if words in text][:6]
                )
                source = Evidence(
                    id="e." + key,
                    label=spec.label if profile.reference else quote,
                    description=profile.reference or "",
                    printedValue=spec.default_value,
                    blocks=blocks,
                    pages=[]
                    if profile.reference
                    else sources.get(profile.evidence_key, {}).get("pages", [1]),
                    method="source_inventory" if profile.evidence_key else "document_text",
                    actor=profile.actor,
                    sourceKey=profile.evidence_key,
                )
                evidence.append(source)
                if not profile.design:
                    spec = spec.model_copy(update={"label_blocks": blocks})
                kind, semantic = classify(spec, {})
                leaf = node(
                    key,
                    kind,
                    spec.label,
                    refs=[source.id],
                    required=spec.required,
                    editable=spec.type != "TEXT_BLOCK" and not spec.read_only,
                    config=field_config(spec, semantic) | profile.config,
                )
                if profile.design:
                    leaf["provenance"]["kind"] = "design_proposal"
                if section.repeating:
                    leaf["binding"]["scope"] = "item"
                if profile.review:
                    review.append(ReviewItem(nodeId=key, reason=profile.review))
                activate(leaf, profile.when)
                if profile.when not in conditions:
                    conditions.append(profile.when)
                planned.append(PlannedField(spec, name=profile.name))
                children.append(leaf)
            sections[ti, si] = planned
            party = PARTIES.get(section.title) if assessment.documentId == "D03" else None
            if section.repeating:
                item = node("item." + party, "ITEM", section.title, children=children)
                repeat = node(
                    "party." + party,
                    "REPEATER",
                    section.title,
                    children=[item],
                    config={
                        "itemKey": "itemId",
                        "minItems": 1,
                        "maxItems": 100,
                        "limitsBasis": "Limit techniczny projektu profilu.",
                        "cardinalityBasis": "Dodatkowy reprezentant przy reprezentacji łącznej.",
                    },
                )
                repeat["binding"] = {"scope": "answers", "path": "/" + repeat["id"]}
                children = [repeat]
            elif party:
                kind = "ORGANIZATION_BLOCK" if party == "organizacja" else "PERSON_BLOCK"
                children = [node("party." + party, kind, section.title, children=children)]
            section_node = node(f"section.{ti}-{si}", "SECTION", section.title, children=children)
            if None not in conditions:
                activate(
                    section_node,
                    conditions[0] if len(conditions) == 1 else {"op": "or", "args": conditions},
                )
            section_nodes.append(section_node)
        steps.append(node(f"step.{ti}", "STEP", tab.title, children=section_nodes))
    root = node(
        "form." + str(form_id),
        "FORM",
        extraction.title,
        children=steps,
        config={"productionReady": False, "submissionEnabled": False},
    )
    return FormPlan(extraction, sections, validated_ir(assessment, root, rules, review, evidence))


def prepare_form(
    result: Extraction,
    document: ReadDocument,
    form_id: UUID,
    assessment=None,
    *,
    use_standard_tax_profile=True,
    first_section=1,
) -> FormPlan:
    assessment = assessment or assess(" ".join(b.text for b in document.blocks), document.sha256)
    if assessment.documentId == "D03" and use_standard_tax_profile:
        return prepare_profile(assessment, document, form_id, tax_profile(form_id))
    if assessment.documentId == "D04":
        return prepare_profile(assessment, document, form_id, property_profile(form_id, document))
    result, inventory = reviewed_extraction(assessment.documentId, result)
    sections = {}
    steps = []
    rules = []
    review = []
    evidence = []
    by_id = {b.id: b for b in document.blocks}
    for ti, tab in enumerate(result.tabs, 1):
        section_nodes = []
        for si, section in enumerate(tab.sections, first_section if ti == 1 else 1):
            planned = []
            children = []
            section_content = []
            section_key = f"{ti}-{si}"
            refund_controls = {}
            dictionaries = territory_dictionaries(section)
            for observed in section.fields:
                entry = inventory.get(id(observed), {})
                start = len(planned)
                bound = observed
                if (name := dictionaries.get(id(observed))) and not observed.dictionary_name:
                    bound = observed.model_copy(update={"type": "SELECT", "dictionary_name": name})
                for item in plan_fields([bound]):
                    field = item.source
                    index = len(planned) + 1
                    key = "f." + str(uuid5(form_id, f"field-{section_key}-{index}"))
                    kind, semantic = classify(field, entry)
                    condition = item.condition
                    if condition:
                        condition = (start + condition[0], condition[1])
                    if options := refund_options(field):
                        refund_controls = {k: (index, value) for k, value in options.items()}
                    elif refund_controls and (
                        entry.get("key") == "refund.account"
                        or normalized(field.label) in {"numer rachunku", "numer rachunku bankowego"}
                    ):
                        condition = refund_controls["account"]
                    elif refund_controls and entry.get("key") == "refund.future_tax":
                        condition = refund_controls["future_tax"]
                    office = (
                        entry.get("key", "").startswith("office.")
                        or section.domain == "OFFICE_BLOCK"
                    )
                    field, reason = project_field(field, kind, entry, office)
                    if reason:
                        review.append(ReviewItem(nodeId=key, reason=reason))
                    editable = (
                        field.type not in {"TEXT_BLOCK", "INFO_SECTION"} and not field.read_only
                    )
                    source = field_evidence(key, observed, entry, by_id, document.ocr)
                    evidence.append(source)
                    leaf = node(
                        key,
                        kind,
                        field.label,
                        config=field_config(field, semantic),
                        refs=[source.id],
                        editable=editable,
                        required=field.required,
                    )
                    if office:
                        leaf["access"] = {"read": ["REVIEWER"], "write": []}
                    if section.repeating and editable:
                        leaf["binding"]["scope"] = "item"
                    if item.source is not bound:
                        leaf["provenance"]["kind"] = "design_proposal"
                    if condition:
                        selector, value = condition
                        controller = children[selector - 1]
                        if value not in {o["code"] for o in controller["config"]["options"]}:
                            raise ValueError("Unknown choice in field condition")
                        scope = "item" if section.repeating else "answers"
                        rules.append(
                            activation(key, answer_is(controller["id"], value, scope), scope)
                        )
                        leaf["state"]["active"] = False
                    children.append(leaf)
                    planned.append(PlannedField(field, condition))
                items = children[start:]
                domain = domain_block(entry)
                if not domain and observed.semantic_type:
                    proposed = SEMANTICS[observed.semantic_type]["defaultComponent"]
                    if proposed in DomainBlock.__members__:
                        domain = proposed
                if domain and domain != section.domain:
                    group = node(
                        f"group.{section_key}.{start}",
                        domain,
                        observed.label,
                        children=items,
                        refs=[leaf["provenance"]["sourceRefs"][0] for leaf in items],
                    )
                    if domain == "OFFICE_BLOCK":
                        group["access"] = {"read": ["REVIEWER"], "write": []}
                    section_content.append(group)
                else:
                    section_content.extend(items)
            if section.repeating:
                review.append(
                    ReviewItem(nodeId="section." + section_key, reason="verify_repeatable_records")
                )
                item = node("item." + section_key, "ITEM", section.title, children=section_content)
                repeat = node(
                    "records." + section_key,
                    "REPEATER",
                    section.title,
                    children=[item],
                    config={
                        "itemKey": "itemId",
                        "minItems": 0,
                        "maxItems": 100,
                        "limitsBasis": (
                            "Technical draft limit; confirm cardinality during profile review."
                        ),
                    },
                )
                repeat["binding"] = {"scope": "answers", "path": "/records." + section_key}
                section_content = [repeat]
            sections[ti, si] = planned
            if section.domain and not inventory:
                wrapper = node(
                    "domain." + section_key,
                    section.domain.value,
                    section.title,
                    children=section_content,
                )
                if section.domain == "OFFICE_BLOCK":
                    wrapper["access"] = {"read": ["REVIEWER"], "write": []}
                section_content = [wrapper]
            section_node = node(
                "section." + section_key, "SECTION", section.title, children=section_content
            )
            section_nodes.append(section_node)
        steps.append(node(f"step.{ti}", "STEP", tab.title, children=section_nodes))
    root = node(
        "form." + str(form_id),
        "FORM",
        result.title,
        children=steps,
        config={"productionReady": False, "submissionEnabled": False},
    )
    return FormPlan(result, sections, validated_ir(assessment, root, rules, review, evidence))
