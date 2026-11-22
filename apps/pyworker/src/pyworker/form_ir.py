"""Versioned document profiles and schema-validated Form IR for a single upload."""

import json
import re
import unicodedata
from enum import StrEnum
from functools import cache
from pathlib import Path
from typing import Literal

from jsonschema import Draft202012Validator
from pydantic import BaseModel, Field, JsonValue

from pyworker.pdf_text import text_digest

RESOURCE = Path(__file__).with_name("schemas") / "v1"


@cache
def catalog():
    data = json.loads((RESOURCE / "catalog.json").read_text(encoding="utf-8"))
    data["documents"].update(
        json.loads((RESOURCE / "reviewed-spreadsheets.json").read_text(encoding="utf-8"))
    )
    return data


def catalog_enum(name, values):
    return StrEnum(name, {value: value for value in values})


DomainBlock = catalog_enum(
    "DomainBlock",
    (
        item["type"]
        for item in catalog()["componentCatalog"]
        if item["type"].endswith("_BLOCK") and not item["isLeaf"]
    ),
)
SemanticType = catalog_enum("SemanticType", (item["id"] for item in catalog()["semanticTypes"]))
SEMANTICS = {item["id"]: item for item in catalog()["semanticTypes"]}
ActorRole = catalog_enum(
    "ActorRole",
    sorted(
        {
            field["actor"]
            for document in catalog()["sourceFieldInventory"]
            for field in document["fields"]
        }
    ),
)


@cache
def form_validator() -> Draft202012Validator:
    schema = json.loads((RESOURCE / "form.schema.json").read_text(encoding="utf-8"))
    return Draft202012Validator(schema)


def normalized(text: str) -> str:
    text = unicodedata.normalize("NFKD", text.lower().replace("ł", "l"))
    return " ".join(re.findall(r"[a-z0-9]+", text.encode("ascii", "ignore").decode()))


# Match procedure-specific wording in the source; a file name never selects a profile.
PROCEDURE_TERMS = {
    "ADDRESS_NUMBER": r"ustaleni\w* numer\w* porzadkow",
    "TAX_OVERPAYMENT": r"stwierdzeni\w* nadplat\w* podatk",
    "STAMP_DUTY_REFUND": r"zwrot\w* oplat\w* skarbow",
    "WASTE_DECLARATION": r"oplat\w* za gospodarowanie odpadami",
    "ROAD_OCCUPATION": r"zajeci\w* pasa drogow",
    "AGRICULTURAL_CERTIFICATE": r"zaswiadczeni\w*.{0,120}gospodarstw\w* roln",
    "COMMUNITY_HALL": r"(?:wynaj\w*|naj\w*|uzyczeni\w*) swietlic",
    "SPORT_SCHOLARSHIP": r"stypendi\w* sportow",
    "SPORT_AWARD": r"nagrod\w* sportow",
    "COACH_DISTINCTION": r"wyroznieni\w* (?:sportow|trener)",
    "DOG_PERMIT_UNRESOLVED": r"psow ras uznawanych za agresywne|utrzymywani\w* chart",
}


class Profile(BaseModel):
    id: str
    label: str
    releaseStatus: str
    releaseGates: list[str]


class Assessment(BaseModel):
    match: Literal["reference_sha256", "reference_text", "text_candidate", "unknown"]
    status: Literal["unknown", "review", "multiple", "blocked"]
    candidates: list[Profile]
    documentId: str | None
    sourceSha256: str | None


def assess(text: str, digest: str | None) -> Assessment:
    data = catalog()
    document_id = data["documents"].get(digest)
    byte_match = bool(document_id)
    if not document_id:
        document_id = data["reviewedTextDigests"].get(text_digest(text))
    words = normalized(text)
    candidates = [
        Profile.model_validate(profile)
        for profile in data["procedureProfiles"]
        if (
            document_id in profile["sourceRefs"]
            if document_id
            else re.search(PROCEDURE_TERMS[profile["id"]], words)
        )
    ]
    status = "unknown"
    if candidates:
        status = "multiple" if len(candidates) > 1 else "review"
        if any(p.releaseStatus == "blocked_source_conflict" for p in candidates):
            status = "blocked"
    return Assessment(
        match=(
            "reference_sha256"
            if byte_match
            else "reference_text"
            if document_id
            else "text_candidate"
            if candidates
            else "unknown"
        ),
        status=status,
        candidates=candidates,
        documentId=document_id,
        sourceSha256=digest,
    )


class ReviewItem(BaseModel):
    nodeId: str
    reason: str


class Evidence(BaseModel):
    id: str
    label: str
    description: str = ""
    printedValue: str | None = None
    pages: list[int]
    blocks: list[int]
    method: Literal["source_inventory", "document_text", "ocr", "model_observation"]
    sourceKey: str | None = None
    actor: str | None = None


class ParticipantRole(BaseModel):
    role: ActorRole
    evidenceRefs: list[str]


class FormIR(BaseModel):
    schemaVersion: Literal["1.0.0"] = "1.0.0"
    procedure: Assessment
    form: dict[str, JsonValue]
    rules: list[dict[str, JsonValue]]
    review: list[ReviewItem]
    evidence: list[Evidence]
    participantRoles: list[ParticipantRole]
    sourceFields: list[dict[str, JsonValue]] = Field(default_factory=list)
    extended: dict[str, JsonValue] | None = Field(default=None, exclude_if=lambda v: v is None)


def node(key, kind, label, *, children=(), config=None, refs=(), required=False, editable=False):
    item = {
        "id": key,
        "type": kind,
        "label": label,
        "children": list(children),
        "config": config or {},
        "state": {
            "active": True,
            "visible": True,
            "enabled": bool(children) or editable,
            "required": required,
        },
        "access": {"read": ["APPLICANT", "REVIEWER"], "write": ["APPLICANT"] if editable else []},
        "provenance": {
            "kind": "source_document" if refs else "design_proposal",
            "sourceRefs": list(refs),
        },
    }
    if editable or kind in INPUT_TYPES:
        item["binding"] = {"scope": "answers" if editable else "context", "path": f"/{key}"}
    return item


INPUT_TYPES = {x["type"] for x in catalog()["componentCatalog"] if x["family"] == "input"}


def answer_is(selector: str, option: str, scope: str = "answers"):
    return {
        "op": "eq",
        "args": [
            {"op": "ref", "scope": scope, "path": f"/{selector}"},
            {"op": "literal", "value": option},
        ],
    }


def activation(target: str, expression, scope: str = "answers"):
    return {
        "id": f"active.{target}",
        "target": target,
        "property": "active",
        "expression": expression,
        "reason": "Wariant wybrany w polu sterującym",
        "sourceRefs": [],
        "evaluationScope": "item" if scope == "item" else "root",
        "unknownPolicy": "inactive_and_review",
    }


def comparisons(expression):
    """Visit each typed comparison in an activation expression."""
    if expression["op"] in {"and", "or"} and len(expression["args"]) >= 2:
        for child in expression["args"]:
            yield from comparisons(child)
    elif expression["op"] in {"eq", "ne"} and len(expression["args"]) == 2:
        yield expression["args"]
    else:
        raise ValueError("Unsupported rule projection")


def rule_choices(form, rules, evidence):
    """Validate controller references and keep root expressions for COI SHOW."""
    nodes = {}
    pending = [(form, None)]
    owners = {}
    evidence_ids = {item.id for item in evidence}
    if len(evidence_ids) != len(evidence):
        raise ValueError("Duplicate evidence id")
    while pending:
        current, owner = pending.pop()
        if current["id"] in nodes:
            raise ValueError("Duplicate Form IR node")
        if not evidence_ids.issuperset(current["provenance"]["sourceRefs"]):
            raise ValueError("Unknown source reference")
        nodes[current["id"]] = current
        owners[current["id"]] = owner
        child_owner = current["id"] if current["type"] == "ITEM" else owner
        pending.extend((child, child_owner) for child in current["children"])
    choices = {}
    targets = set()
    for component in nodes.values():
        config = component["config"]
        if "signerRefs" in config:
            parties = config["signerRefs"] + config["onBehalfOfRefs"]
            if config.get("documentRef") != form["id"] or any(
                nodes.get(ref, {}).get("type")
                not in {"PERSON_BLOCK", "ORGANIZATION_BLOCK", "REPEATER"}
                for ref in parties
            ):
                raise ValueError("Unresolved signature participant or document")
    for rule in rules:
        expression = rule["expression"]
        target = rule["target"]
        if rule["property"] != "active" or target not in nodes or target in targets:
            raise ValueError("Unresolved activation rule")
        targets.add(target)
        scope = "item" if rule["evaluationScope"] == "item" else "answers"
        for ref, literal in comparisons(expression):
            controller = nodes.get(ref.get("path", "").removeprefix("/"))
            if (
                ref.get("op") != "ref"
                or ref.get("scope") != scope
                or not controller
                or controller.get("binding") != {"scope": scope, "path": ref["path"]}
                or literal.get("op") != "literal"
            ):
                raise ValueError("Unresolved activation rule")
            options = {o["code"] for o in controller["config"].get("options", [])}
            if controller["config"].get("dictionary") == "Kraje":
                options.add("Polska")
            if literal["value"] not in options:
                raise ValueError("Unknown choice in activation rule")
            if scope == "item" and (
                not owners[target] or owners[controller["id"]] != owners[target]
            ):
                raise ValueError("Activation rule crosses a record boundary")
        choices[target] = expression
    return choices


def validated_ir(assessment, root, rules, review, evidence) -> FormIR:
    fields = next(
        (
            entry["fields"]
            for entry in catalog()["sourceFieldInventory"]
            if entry["documentId"] == assessment.documentId
        ),
        [],
    )
    roles = {}
    for source in evidence:
        if source.actor:
            roles.setdefault(source.actor, []).append(source.id)
    result = FormIR(
        procedure=assessment,
        form=root,
        rules=rules,
        review=review,
        sourceFields=fields,
        evidence=evidence,
        participantRoles=[
            ParticipantRole(role=role, evidenceRefs=refs) for role, refs in roles.items()
        ],
    )
    error = next(form_validator().iter_errors(result.model_dump(mode="json")), None)
    if error:
        raise ValueError(f"Invalid Form IR at {error.json_path}")
    return result
