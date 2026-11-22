"""Reviewed source inventories can specialize an exact document revision."""

from pyworker.coi import ExtractedField, ExtractedSection, ExtractedTab
from pyworker.form_ir import catalog, normalized

SIMPLE_INPUT = {
    "TEXT": "TEXT_FIELD",
    "TEXTAREA": "TEXTAREA",
    "INTEGER": "NUMBER",
    "MONEY": "NUMBER",
    "EMAIL": "TEXT_FIELD",
    "PHONE": "TEXT_FIELD",
    "DATE": "DATEPICKER",
    "FILE": "FILE_UPLOADER",
    "FILE_SET": "FILE_UPLOADER",
    "ADDRESS": "TEXT_FIELD",
    "BANK_ACCOUNT": "TEXT_FIELD",
    "CONTACT": "TEXT_FIELD",
    "PARTY": "TEXT_FIELD",
}


def supplement(extraction, entries, provenance, observed):
    """Keep extracted controls and add reviewed inventory groups missing from the extraction."""
    additional = []
    for entry in entries.values():
        match = observed.get(normalized(entry["label"]))
        if match is not None:
            provenance[id(match)] = entry
            continue
        kind = SIMPLE_INPUT.get(entry["proposed_semantic_type"], "INFO_SECTION")
        if entry["actor"] in {"authority", "office"} or entry["key"].startswith("office."):
            kind = "INFO_SECTION"
        field = ExtractedField(label=entry["label"], type=kind)
        provenance[id(field)] = entry
        additional.append(field)
    if additional:
        section = ExtractedSection(title="Pola z audytu dokumentu", fields=additional)
        extraction = extraction.model_copy(
            update={
                "tabs": [
                    *extraction.tabs,
                    ExtractedTab(title="Zakres procedury", sections=[section]),
                ]
            }
        )
    return extraction, provenance


def reviewed_extraction(document_id, extraction):
    if not document_id:
        return extraction, {}
    inventory = next(
        row for row in catalog()["sourceFieldInventory"] if row["documentId"] == document_id
    )
    entries = {row["key"]: row for row in inventory["fields"]}
    observed = {
        normalized(f.label): f for t in extraction.tabs for s in t.sections for f in s.fields
    }
    return supplement(extraction, entries, {}, observed)
