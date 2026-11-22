"""Map document observations to the COI import format and attach OCR evidence."""

import json
import re
import unicodedata
from collections import Counter
from dataclasses import dataclass
from typing import Annotated, Literal
from uuid import NAMESPACE_URL, UUID, uuid5

from pydantic import BaseModel, ConfigDict, Field, StrictBool, model_validator

from pyworker.form_ir import ActorRole, DomainBlock, FormIR, SemanticType

Unit = Annotated[float, Field(ge=0, le=1)]
Box = tuple[Unit, Unit, Unit, Unit]
FieldType = Literal[
    "TEXT_FIELD",
    "TEXTAREA",
    "NUMBER",
    "DATEPICKER",
    "CHECKBOX",
    "RADIO",
    "SELECT",
    "FILE_UPLOADER",
    "CONSENT_SECTION",
    "TEXT_BLOCK",
    "INFO_SECTION",
]


class Contract(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class CellPosition(Contract):
    row: int = Field(ge=1)
    column: int = Field(ge=1)


class Region(Contract):
    page: int = Field(ge=1, le=40)
    bbox: Box
    cell: CellPosition | None = Field(default=None, exclude_if=lambda v: v is None)

    @model_validator(mode="after")
    def check_area(self):
        x0, y0, x1, y1 = self.bbox
        if x1 <= x0 or y1 <= y0:
            raise ValueError("Empty source region")
        return self


class Block(Contract):
    id: int = Field(gt=0)
    page: int = Field(ge=1, le=40)
    kind: Literal["text", "table", "input"]
    text: str
    bbox: Box | None = None
    cell: CellPosition | None = Field(default=None, exclude_if=lambda v: v is None)
    ocr_confidence: Unit | None = None


MAX_SOURCE_BLOCKS = 3000


class ReadDocument(Contract):
    blocks: list[Block] = Field(min_length=1, max_length=MAX_SOURCE_BLOCKS)
    ocr: bool
    sha256: str | None = Field(default=None, pattern=r"^[a-f0-9]{64}$")


class ExtractedField(Contract):
    label: str = Field(min_length=1, max_length=255)
    type: FieldType
    required: StrictBool = False
    confidence: Unit | None = None
    description: str = Field(default="", max_length=200_000)
    options: list[Annotated[str, Field(min_length=1, max_length=255)]] = Field(
        default_factory=list, max_length=100
    )
    label_blocks: list[int] = Field(default_factory=list, max_length=6)
    input_blocks: list[int] = Field(default_factory=list, max_length=6)
    read_only: bool = False
    default_value: str | None = None
    observed_value: str | None = Field(default=None, max_length=4000)
    dictionary_name: (
        Literal["Kraje", "Województwo", "Powiat", "Gmina", "Miejscowość", "Numery kierunkowe"]
        | None
    ) = None
    semantic_type: SemanticType | None = None
    actor_role: ActorRole | None = None

    @model_validator(mode="after")
    def check_choices(self):
        if self.type in {"RADIO", "CHECKBOX", "SELECT"}:
            if self.dictionary_name and (
                self.options
                or self.dictionary_name != "Numery kierunkowe"
                and self.type != "SELECT"
            ):
                raise ValueError("Invalid dictionary or inline options for choice field")
            if not self.options and not self.dictionary_name:
                raise ValueError("Choice field requires visible options")
        elif self.options or self.dictionary_name:
            raise ValueError("Options and dictionaries are only supported for choices")
        return self


class ExtractedSection(Contract):
    title: str = Field(min_length=1, max_length=255)
    repeating: StrictBool = False
    domain: DomainBlock | None = None
    fields: list[ExtractedField] = Field(min_length=1, max_length=100)


class ExtractedTab(Contract):
    title: str = Field(min_length=1, max_length=255)
    sections: list[ExtractedSection] = Field(min_length=1, max_length=40)


class Extraction(Contract):
    title: str = Field(min_length=1, max_length=255)
    tabs: list[ExtractedTab] = Field(min_length=1, max_length=24)


class CoiOption(Contract):
    id: str
    name: str
    techName: str


class CoiConsent(Contract):
    description: str
    required: bool


class CoiConsentConfig(Contract):
    consents: list[CoiConsent]
    files: list[str] = Field(default_factory=list)


class CoiField(Contract):
    id: UUID
    type: str
    techName: str
    title: str
    description: str = ""
    options: list[CoiOption] = Field(default_factory=list)
    validation: list[str] = Field(default_factory=list)
    readOnly: bool = False
    defaultValue: str | list[str] | None = Field(
        default=None, exclude_if=lambda value: value is None
    )
    defaultValueType: Literal["EXTERNAL_SYSTEM"] | None = Field(
        default=None, exclude_if=lambda value: value is None
    )
    consentSectionConfig: CoiConsentConfig | None = Field(
        default=None, exclude_if=lambda value: value is None
    )
    searchEnabled: bool | None = Field(default=None, exclude_if=lambda value: value is None)
    dictionaryName: str | None = Field(default=None, exclude_if=lambda value: value is None)
    states: list[dict[str, str]] = Field(default_factory=list)
    questionOrder: int
    tooltipMessage: str = ""
    repeatingSectionGrid: list["CoiQuestion"] = Field(default_factory=list)


class CoiQuestion(Contract):
    x: Literal[0] = 0
    y: int
    rows: int
    cols: Literal[3] = 3
    field: CoiField


class CoiTab(Contract):
    id: UUID
    title: str
    type: Literal["MAIN", "FINISH"]
    questions: list[CoiQuestion]


class CoiLink(Contract):
    id: UUID
    source: UUID
    target: UUID


class CoiFlow(Contract):
    links: list[CoiLink]


class CoiForm(Contract):
    title: str = Field(min_length=1, max_length=255)
    tabs: list[CoiTab]
    flow: CoiFlow

    @model_validator(mode="after")
    def check_layout_and_flow(self):
        if len(self.tabs) < 2 or self.tabs[-1].type != "FINISH":
            raise ValueError("A COI form needs working tabs and a final tab")
        ids = set()
        names = set()
        pages = {tab.id: set() for tab in self.tabs}
        for tab in self.tabs:
            if tab.id in ids or not tab.questions:
                raise ValueError("Duplicate or empty tab")
            ids.add(tab.id)
            if tab is not self.tabs[-1] and tab.type != "MAIN":
                raise ValueError("Only the last tab may be final")
            row = 0
            for section in tab.questions:
                if (
                    section.field.type not in {"SECTION", "REPEATING_SECTION"}
                    or not section.field.repeatingSectionGrid
                ):
                    raise ValueError("Place fields inside a nonempty section")
                if section.y < row or section.rows <= 0:
                    raise ValueError("Section overlaps the previous section")
                row = section.y + section.rows
                seen_row = 0
                for question in section.field.repeatingSectionGrid:
                    if question.y < seen_row or question.rows <= 0:
                        raise ValueError("Field overlaps the previous field")
                    seen_row = question.y + question.rows
                    if seen_row > section.rows or question.field.repeatingSectionGrid:
                        raise ValueError("Invalid field position or nesting")
                    field = question.field
                    if field.type not in FIELD_TEMPLATES:
                        raise ValueError("Unsupported leaf component")
                    if tab.type == "FINISH" and field.type != "INFO_SECTION":
                        raise ValueError("The final tab requires INFO_SECTION")
                    if field.type == "INFO_SECTION" and not field.description.strip():
                        raise ValueError("INFO_SECTION requires a description")
                    if field.dictionaryName and (
                        field.type not in {"RADIO", "CHECKBOX", "SELECT"} or field.options
                    ):
                        raise ValueError("Dictionary options must come from the dictionary")
                    if set(field.validation) - (
                        COI_VALIDATORS if field.type == "TEXT_FIELD" else {"REQUIRED"}
                    ):
                        raise ValueError("Unsupported field validator")
                for question in (section, *section.field.repeatingSectionGrid):
                    if question.field.id in ids or question.field.techName in names:
                        raise ValueError("Duplicate field identifier")
                    ids.add(question.field.id)
                    names.add(question.field.techName)
        for link in self.flow.links:
            if link.id in ids or link.source not in pages or link.target not in pages:
                raise ValueError("Invalid flow link")
            ids.add(link.id)
            pages[link.source].add(link.target)
        reachable = set()
        remaining = [self.tabs[0].id]
        while remaining:
            current = remaining.pop()
            if current not in reachable:
                reachable.add(current)
                remaining.extend(pages[current] - reachable)
        if reachable != pages.keys():
            raise ValueError("At least one tab is unreachable")
        return self


class FieldLocation(Contract):
    field_id: UUID
    label: list[Region]
    input: list[Region]


class FieldConfidence(Contract):
    field_id: UUID
    confidence: Unit
    ocr_confidence: Unit | None = None


class DocumentPage(Contract):
    page: int = Field(ge=1, le=40)
    text: str
    blocks: list[Block]


class DocumentContent(Contract):
    schema_version: Literal[1] = 1
    pages: list[DocumentPage]


class CoiResult(Contract):
    document_content: DocumentContent | None = None
    draft: CoiForm
    source_answers: dict[UUID, str] = Field(default_factory=dict)
    field_locations: list[FieldLocation]
    field_confidences: list[FieldConfidence]
    form_ir: FormIR


@dataclass(frozen=True, slots=True)
class FieldTemplate:
    rows: int = 1
    read_only: bool = False
    empty_list_default: bool = False
    validators: bool = True


FIELD_TEMPLATES: dict[FieldType, FieldTemplate] = {
    "TEXT_FIELD": FieldTemplate(),
    "TEXTAREA": FieldTemplate(rows=3),
    "NUMBER": FieldTemplate(),
    "DATEPICKER": FieldTemplate(),
    "CHECKBOX": FieldTemplate(),
    "RADIO": FieldTemplate(),
    "SELECT": FieldTemplate(empty_list_default=True),
    "FILE_UPLOADER": FieldTemplate(empty_list_default=True),
    "CONSENT_SECTION": FieldTemplate(rows=2, validators=False),
    "TEXT_BLOCK": FieldTemplate(read_only=True, validators=False),
    "INFO_SECTION": FieldTemplate(read_only=True, validators=False),
}
TEXT_VALIDATORS = {
    "pesel": "PESEL",
    "nip": "NIP",
    "regon": "REGON",
    "kod pocztowy": "ZIP_CODE",
    "e-mail": "EMAIL",
    "adres e-mail": "EMAIL",
    "adres do e-doręczeń": "ADE",
    "elektroniczna skrzynka podawcza epuap": "EPUAP",
    "seria i numer dowodu osobistego": "SERIAL_NUMBER_ID_CARD",
}
COI_VALIDATORS = {"REQUIRED", *TEXT_VALIDATORS.values()}

# These patterns distinguish a composite source label from an inferred procedural role.
APPLICANT_NAME = re.compile(r"\bimię\b.*\bnazwisko\b.*[/]|\bnazwisko\b.*\bimię\b.*[/]", re.I)
ENTITY_NAME = re.compile(r"\bnazw[ay]\b", re.I)
ADDRESS = re.compile(
    r"^adres(?: zamieszkania| siedziby| zamieszkania\s*/\s*siedziba firmy)?$", re.I
)
SIGNATURE = re.compile(r"^podpis\b", re.I)
COMBINED_CONTACT = re.compile(r"\btelefonu?\b.*[/].*\be[ -]?mail\b", re.I)


@dataclass(frozen=True, slots=True)
class PlannedField:
    source: ExtractedField
    condition: tuple[int, str] | None = None
    name: str | None = None
    option_codes: tuple[str, ...] = ()


def plan_fields(fields: list[ExtractedField]) -> list[PlannedField]:
    planned = []
    for source in fields:
        if (
            source.type not in {"TEXT_FIELD", "TEXTAREA"}
            or source.read_only
            or source.observed_value
        ):
            planned.append(PlannedField(source))
            continue
        if SIGNATURE.match(source.label):
            planned.append(
                PlannedField(
                    source.model_copy(
                        update={
                            "type": "INFO_SECTION",
                            "required": False,
                            "description": source.description
                            or "Blankiet przewiduje podpis dokumentu.",
                        }
                    )
                )
            )
        elif APPLICANT_NAME.search(source.label) and ENTITY_NAME.search(source.label):
            selector = len(planned) + 1
            person, entity = "Osoba fizyczna", "Podmiot"
            planned.append(
                PlannedField(
                    derived_field(
                        source,
                        "Rodzaj wnioskodawcy",
                        type="RADIO",
                        options=[person, entity],
                        required=source.required,
                    )
                )
            )
            planned.extend(
                PlannedField(derived_field(source, label), (selector, option))
                for label, option in [
                    ("Imię", person),
                    ("Nazwisko", person),
                    ("Nazwa podmiotu", entity),
                ]
            )
        elif ADDRESS.fullmatch(source.label):
            planned.append(
                PlannedField(derived_field(source, "Kraj", type="SELECT", dictionary_name="Kraje"))
            )
            planned.append(
                PlannedField(derived_field(source, "Miejscowość", required=source.required))
            )
            planned.extend(
                PlannedField(derived_field(source, label))
                for label in (
                    "Ulica",
                    "Numer budynku",
                    "Numer lokalu",
                    "Kod pocztowy / ZIP",
                )
            )
        elif re.fullmatch(r"PESEL\s*/\s*NIP", source.label, re.I):
            selector = len(planned) + 1
            identifiers = ["PESEL", "NIP"]
            planned.append(
                PlannedField(
                    derived_field(
                        source,
                        "Rodzaj identyfikatora",
                        type="RADIO",
                        options=identifiers,
                        required=source.required,
                    )
                )
            )
            planned.extend(
                PlannedField(derived_field(source, label), (selector, label))
                for label in identifiers
            )
        elif COMBINED_CONTACT.search(source.label):
            planned.extend(
                PlannedField(derived_field(source, label))
                for label in (
                    "Numer telefonu",
                    "Adres e-mail",
                )
            )
        else:
            planned.append(PlannedField(source))
    return planned


def derived_field(source: ExtractedField, label: str, **updates) -> ExtractedField:
    return ExtractedField(
        label=label,
        type=updates.pop("type", "TEXT_FIELD"),
        label_blocks=source.label_blocks,
        **updates,
    )


def show_condition(
    tab: str, section: str, selector: str, option: str, *, unequal=False, repeating=False
) -> dict[str, str]:
    choice, tab, section, selector = (
        json.dumps(value, ensure_ascii=False) for value in (option, tab, section, selector)
    )
    section_path = f"tabs[{tab} in title].questions[{section} in field.techName].field"
    answers = (
        f"{section_path}.__userAnswer[$repeatingSectionIndex][{selector} in fieldTechName].answers"
        if repeating
        else f"{section_path}.repeatingSectionGrid[{selector} in field.techName].field.__userAnswer"
    )
    comparison = f"({choice} in {answers})"
    if unequal:
        comparison = f"($boolean({answers}) and $not({comparison}))"
    return {"type": "SHOW", "query": comparison}


def tech_name(label: str) -> str:
    ascii_label = unicodedata.normalize("NFKD", label.lower().replace("ł", "l"))
    ascii_label = ascii_label.encode("ascii", "ignore").decode()
    slug = re.sub(r"[^a-z0-9]+", "_", ascii_label).strip("_")[:45]
    return slug or "pole_" + uuid5(NAMESPACE_URL, label).hex[:12]


def find_regions(ids: list[int], blocks: dict[int, Block], *, input_region: bool) -> list[Region]:
    regions = []
    for block_id in dict.fromkeys(ids):
        block = blocks.get(block_id)
        if block is None or (block.kind == "input") != input_region:
            raise ValueError("Invalid OCR block reference")
        if block.bbox is not None:
            regions.append(Region(page=block.page, bbox=block.bbox, cell=block.cell))
    return regions


def render_field(
    spec: ExtractedField, field_id: UUID, name: str, index: int, y: int
) -> CoiQuestion:
    template = FIELD_TEMPLATES[spec.type]
    slugs = {option: tech_name(option) for option in spec.options}
    counts = Counter(slugs.values())
    options = [
        CoiOption(
            id=option,
            name=option,
            techName=slug
            if counts[slug] == 1
            else f"{slug}_{uuid5(NAMESPACE_URL, option).hex[:12]}",
        )
        for option, slug in slugs.items()
    ]
    validation = []
    if spec.type == "TEXT_FIELD" and not spec.read_only:
        if validator := TEXT_VALIDATORS.get(spec.label.casefold()):
            validation.append(validator)
    if template.validators and spec.required:
        validation.insert(0, "REQUIRED")
    consent = None
    if spec.type == "CONSENT_SECTION":
        consent = CoiConsentConfig(
            consents=[
                CoiConsent(description=spec.description or spec.label, required=spec.required)
            ]
        )
    return CoiQuestion(
        y=y,
        rows=template.rows,
        field=CoiField(
            id=field_id,
            type=spec.type,
            techName=name,
            title=spec.label,
            description=""
            if consent
            else spec.description or (spec.label if spec.type == "INFO_SECTION" else ""),
            readOnly=template.read_only or spec.read_only,
            defaultValue=spec.default_value
            if spec.default_value is not None
            else ([] if template.empty_list_default else None),
            options=options,
            validation=list(dict.fromkeys(validation)),
            consentSectionConfig=consent,
            searchEnabled=(bool(spec.dictionary_name) or len(options) > 15)
            if spec.type == "SELECT"
            else None,
            dictionaryName=spec.dictionary_name,
            questionOrder=index,
        ),
    )
