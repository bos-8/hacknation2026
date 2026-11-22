"""Build Pyworker resources from the local reference package. Run from any directory."""

import hashlib
import json
import sys
from pathlib import Path

from jsonschema import Draft202012Validator

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "materials/formularz-json"
DEST = ROOT / "apps/pyworker/src/pyworker/schemas/v1"


def read(name):
    return json.loads((SOURCE / name).read_text(encoding="utf-8"))


def write(name, data):
    (DEST / name).write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
        newline="\n",
    )


def main():
    package = read("formularze_pelny_przyklad.json")
    schema = read("formularze.schema.json")
    Draft202012Validator.check_schema(schema)
    Draft202012Validator(schema).validate(package)
    if package["schemaVersion"] != "1.0.0":
        raise ValueError("Review changes before upgrading the runtime contract")
    DEST.mkdir(parents=True, exist_ok=True)
    catalog = {
        key: package[key]
        for key in (
            "schemaVersion",
            "componentCatalog",
            "sources",
            "semanticTypes",
            "dictionaries",
            "procedureProfiles",
            "policies",
            "sourceFieldInventory",
            "recordContracts",
            "stampMatrix",
            "externalDictionaries",
            "runtime",
            "evidencePolicy",
            "legacyMapping",
        )
    }
    catalog["documents"] = {
        src["sha256"]: src["id"]
        for src in package["sources"]
        if src["kind"] == "uploaded_pdf"
    }
    # The supplied root validates a demonstration package. Reuse its actual node and rule
    # definitions for an individual generated form; scenarios and sample answers are fixtures.
    sys.path.insert(0, str(ROOT / "apps/pyworker/src"))
    # Check the audited bytes before accepting a native-text equivalent in another format.
    from pypdf import PdfReader

    source = next((ROOT / "materials/formularze/05-nadplata-podatku").glob("*.PDF"))
    if (
        catalog["documents"].get(hashlib.sha256(source.read_bytes()).hexdigest())
        != "D03"
    ):
        raise ValueError("Unexpected revision of the tax overpayment form")
    from pyworker.pdf_text import text_digest

    source_text = "\n".join(page.extract_text() for page in PdfReader(source).pages)
    catalog["reviewedTextDigests"] = {text_digest(source_text): "D03"}
    directory = ROOT / "materials/formularze/01-numer-nieruchomosci"
    pdf = next(directory.glob("*.pdf"))
    if catalog["documents"].get(hashlib.sha256(pdf.read_bytes()).hexdigest()) != "D04":
        raise ValueError("Unexpected revision of the property form")
    catalog["reviewedTextDigests"][
        text_digest("\n".join(p.extract_text() for p in PdfReader(pdf).pages))
    ] = "D04"
    from pyworker.docx import docx_text

    docx = pdf.with_suffix(".docx")
    if (
        hashlib.sha256(docx.read_bytes()).hexdigest()
        != "d26d86aea213ea09653381c987a5c12a3e1c20be4dfd6a3370613c8f04184c48"
    ):
        raise ValueError("Unexpected revision of the property DOCX")
    with docx.open("rb") as stream:
        catalog["reviewedTextDigests"][text_digest(docx_text(stream))] = "D04"
    revisions = json.loads((DEST / "reviewed-docx.json").read_text(encoding="utf-8"))
    catalog["referenceOnlyDocuments"] = {}
    for digest, entry in revisions.items():
        path = ROOT / "materials" / entry["file"]
        if hashlib.sha256(path.read_bytes()).hexdigest() != digest:
            raise ValueError(f"Review changed DOCX: {path.name}")
        if entry["kind"] == "form":
            catalog["documents"][digest] = entry["documentId"]
        else:
            catalog["referenceOnlyDocuments"][digest] = entry["kind"]
    write("catalog.json", catalog)
    extended = ROOT / "materials/formularz-json2"

    def extended_data(name):
        return json.loads((extended / name).read_text(encoding="utf-8-sig"))

    form = extended_data("nadplata_formir_rozszerzona.json")
    profile = extended_data("profil_prawny_nadplata_2026.json")
    audit = extended_data("nadplata_audyt_decyzji.json")
    semantic_schema = extended_data("schema_formir.json")
    Draft202012Validator.check_schema(semantic_schema)
    Draft202012Validator(semantic_schema).validate(form)
    decisions = {f["key"]: f["decision"] for f in form["fields"]}
    if (
        decisions != {f["key"]: f["decision"] for f in audit["candidates"]}
        or form["legalProfileRef"]
        != {"profileId": profile["profileId"], "version": profile["version"]}
        or catalog["documents"].get(form["sourceDocuments"][0]["sha256"]) != "D03"
    ):
        raise ValueError("Inconsistent EXTENDED reference package")
    write(
        "legal-profiles.json",
        [{"profile": profile, "form": form, "findings": audit["findings"]}],
    )
    from pyworker.form_ir import FormIR

    instance = FormIR.model_json_schema()
    instance["$schema"] = schema["$schema"]
    instance["additionalProperties"] = False
    instance["required"] = list(instance["properties"])
    instance["required"].remove("extended")
    instance["$defs"].update(
        {
            key: schema["$defs"][key]
            for key in ("option", "binding", "expression", "node", "rule")
        }
    )
    # The reference union is discriminated by op. Check recursive arguments
    # only for the matching operator, retaining every constraint on that branch.
    variants = instance["$defs"]["expression"]["oneOf"]
    operators = [v["properties"]["op"]["const"] for v in variants]
    if len(set(operators)) != len(operators):
        raise ValueError("Ambiguous reference expression operator")
    instance["$defs"]["expression"] = {
        "type": "object",
        "required": ["op"],
        "properties": {"op": {"enum": operators}},
        "allOf": [
            {"if": {"properties": {"op": {"const": op}}}, "then": variant}
            for op, variant in zip(operators, variants, strict=True)
        ],
    }
    instance["$defs"]["predicate"] = semantic_schema["$defs"]["predicate"]
    instance["$defs"]["semanticCandidate"] = semantic_schema["$defs"]["field"]
    instance["properties"]["extended"] = {
        "type": "object",
        "required": [
            "mode",
            "status",
            "profileId",
            "version",
            "asOf",
            "candidates",
            "legalRules",
            "sources",
            "publicationBlockedBy",
        ],
        "properties": {
            **semantic_schema["properties"]["legalProfileRef"]["properties"],
            "mode": {"const": "EXTENDED"},
            "status": {"const": "DRAFT_NOT_FOR_SUBMISSION"},
            "asOf": {"type": "string", "format": "date"},
            "candidates": {
                "type": "array",
                "items": {"$ref": "#/$defs/semanticCandidate"},
            },
            "publicationBlockedBy": semantic_schema["properties"][
                "publicationBlockedBy"
            ],
            "legalRules": {
                "type": "array",
                "items": {"type": "object", "required": ["id", "basis", "sources"]},
            },
            "sources": {
                "type": "array",
                "items": {"type": "object", "required": ["sourceId"]},
            },
        },
    }
    instance["properties"].update(
        {
            "form": {"$ref": "#/$defs/node", "properties": {"type": {"const": "FORM"}}},
            "rules": {"type": "array", "items": {"$ref": "#/$defs/rule"}},
            "sourceFields": schema["properties"]["sourceFieldInventory"]["items"][
                "properties"
            ]["fields"],
        }
    )
    # Form-specific signatures refer to active party nodes and the current draft.
    config = instance["$defs"]["node"]["properties"]["config"]["properties"]
    for key in ("signerRefs", "onBehalfOfRefs"):
        config[key] = {
            "type": "array",
            "items": {"type": "string"},
            "minItems": 1,
            "uniqueItems": True,
        }
    Draft202012Validator.check_schema(instance)
    write("form.schema.json", instance)


if __name__ == "__main__":
    main()
