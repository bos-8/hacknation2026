"""Map document observations to the COI import format and attach OCR evidence."""

import json
import re
import unicodedata
from dataclasses import dataclass
from typing import Annotated, Literal
from uuid import UUID, uuid5

from pydantic import BaseModel, ConfigDict, Field, StrictBool, model_validator

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


class Region(Contract):
    page: int = Field(ge=1, le=40)
    bbox: Box

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
    ocr_confidence: Unit | None = None


class ReadDocument(Contract):
    blocks: list[Block] = Field(min_length=1, max_length=3000)
    ocr: bool


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
    dictionary_name: Literal["Kraje"] | None = None

    @model_validator(mode="after")
    def check_choices(self):
        if self.type in {"RADIO", "CHECKBOX", "SELECT"}:
            if self.dictionary_name and (self.type != "SELECT" or self.options):
                raise ValueError("The country dictionary supplies options to SELECT only")
            if not self.options and not self.dictionary_name:
                raise ValueError("Choice field requires visible options")
        elif self.options or self.dictionary_name:
            raise ValueError("Options and dictionaries are only supported for choices")
        return self


class ExtractedSection(Contract):
    title: str = Field(min_length=1, max_length=255)
    repeating: StrictBool = False
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
    title: str
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
                    if tab.type == "FINISH" and question.field.type not in {
                        "INFO_SECTION",
                        "TEXT_BLOCK",
                    }:
                        raise ValueError("The final tab cannot collect data")
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


class CoiResult(Contract):
    draft: CoiForm
    field_locations: list[FieldLocation]
    field_confidences: list[FieldConfidence]


@dataclass(frozen=True, slots=True)
class FieldTemplate:
    rows: int = 1
    read_only: bool = False
    choices: bool = False
    empty_list_default: bool = False
    validators: bool = True


FIELD_TEMPLATES: dict[FieldType, FieldTemplate] = {
    "TEXT_FIELD": FieldTemplate(),
    "TEXTAREA": FieldTemplate(rows=3),
    "NUMBER": FieldTemplate(),
    "DATEPICKER": FieldTemplate(),
    "CHECKBOX": FieldTemplate(choices=True),
    "RADIO": FieldTemplate(choices=True),
    "SELECT": FieldTemplate(choices=True, empty_list_default=True),
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
}

# These patterns distinguish a composite source label from an inferred procedural role.
APPLICANT_NAME = re.compile(r"\bimię\b.*\bnazwisko\b.*[/]|\bnazwisko\b.*\bimię\b.*[/]", re.I)
ENTITY_NAME = re.compile(r"\bnazw[ay]\b", re.I)
PERSON_NAME = re.compile(r"^(?:imię i nazwisko|nazwisko i imię)(?: wnioskodawcy)?$", re.I)
ADDRESS = re.compile(
    r"^adres(?: zamieszkania| siedziby| zamieszkania\s*/\s*siedziba firmy)?$", re.I
)
SIGNATURE = re.compile(r"^podpis\b", re.I)
COMBINED_CONTACT = re.compile(r"\btelefonu?\b.*[/].*\be[ -]?mail\b", re.I)


@dataclass(frozen=True, slots=True)
class PlannedField:
    source: ExtractedField
    condition: tuple[int, str] | None = None


def plan_fields(fields: list[ExtractedField]) -> list[PlannedField]:
    planned = []
    for source in fields:
        if source.type not in {"TEXT_FIELD", "TEXTAREA"} or source.read_only:
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
        elif PERSON_NAME.fullmatch(source.label):
            planned.extend(
                PlannedField(derived_field(source, label, required=source.required))
                for label in ("Imię", "Nazwisko")
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


def show_condition(tab: str, section: str, selector: str, option: str) -> dict[str, str]:
    choice, tab, section, selector = (
        json.dumps(value, ensure_ascii=False) for value in (option, tab, section, selector)
    )
    return {
        "type": "SHOW",
        "query": (
            f"({choice} in tabs[{tab} in title].questions[{section} in field.techName]"
            f".field.repeatingSectionGrid[{selector} in field.techName].field.__userAnswer)"
        ),
    }


def tech_name(label: str, key: str) -> str:
    ascii_label = unicodedata.normalize("NFKD", label.lower().replace("ł", "l"))
    ascii_label = ascii_label.encode("ascii", "ignore").decode()
    slug = re.sub(r"[^a-z0-9]+", "_", ascii_label).strip("_")[:45]
    return f"{slug or 'pole'}_{key.replace('-', '_')}"


def find_regions(ids: list[int], blocks: dict[int, Block], *, input_region: bool) -> list[Region]:
    regions = []
    for block_id in dict.fromkeys(ids):
        block = blocks.get(block_id)
        if block is None or (block.kind == "input") != input_region:
            raise ValueError("Invalid OCR block reference")
        if block.bbox is not None:
            regions.append(Region(page=block.page, bbox=block.bbox))
    return regions


def render_field(spec: ExtractedField, field_id: UUID, key: str, index: int, y: int) -> CoiQuestion:
    template = FIELD_TEMPLATES[spec.type]
    options = (
        [
            CoiOption(
                id=name,
                name=name,
                techName=tech_name(name, f"{key}-{position}"),
            )
            for position, name in enumerate(dict.fromkeys(spec.options), 1)
        ]
        if template.choices
        else []
    )
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
            techName=tech_name(spec.label, key),
            title=spec.label,
            description="" if consent else spec.description,
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


def convert_to_coi(result: Extraction, document: ReadDocument, form_id: UUID) -> CoiResult:
    blocks = {block.id: block for block in document.blocks}
    locations = []
    confidences = []
    tabs = []
    for tab_index, tab in enumerate(result.tabs, 1):
        sections = []
        row = 0
        for section_index, section in enumerate(tab.sections, 1):
            section_key = f"{tab_index}-{section_index}"
            fields = []
            field_row = 0
            for field_index, planned in enumerate(plan_fields(section.fields), 1):
                spec = planned.source
                key = f"{section_key}-{field_index}"
                field_id = uuid5(form_id, f"field-{key}")
                label = find_regions(spec.label_blocks, blocks, input_region=False)
                inputs = find_regions(spec.input_blocks, blocks, input_region=True)
                if label or inputs:
                    locations.append(FieldLocation(field_id=field_id, label=label, input=inputs))
                scores = [blocks[block_id].ocr_confidence for block_id in spec.label_blocks]
                confidence = (
                    min(score for score in scores if score is not None)
                    if scores and None not in scores
                    else None
                )
                if spec.confidence is not None:
                    confidences.append(
                        FieldConfidence(
                            field_id=field_id,
                            confidence=spec.confidence,
                            ocr_confidence=confidence,
                        )
                    )
                question = render_field(spec, field_id, key, field_index, field_row)
                if planned.condition:
                    selector, option = planned.condition
                    question.field.states.append(
                        show_condition(
                            tab.title,
                            tech_name(section.title, section_key),
                            fields[selector - 1].field.techName,
                            option,
                        )
                    )
                fields.append(question)
                field_row += question.rows
            rows = field_row + 1
            sections.append(
                CoiQuestion(
                    y=row,
                    rows=rows,
                    field=CoiField(
                        id=uuid5(form_id, f"section-{section_key}"),
                        type="REPEATING_SECTION" if section.repeating else "SECTION",
                        techName=tech_name(section.title, section_key),
                        title=section.title,
                        questionOrder=section_index,
                        repeatingSectionGrid=fields,
                    ),
                )
            )
            row += rows
        tabs.append(
            CoiTab(
                id=uuid5(form_id, f"tab-{tab_index}"),
                title=tab.title,
                type="MAIN",
                questions=sections,
            )
        )
    tabs.append(
        CoiTab(
            id=uuid5(form_id, "finish"),
            title="Podsumowanie",
            type="FINISH",
            questions=[
                CoiQuestion(
                    y=0,
                    rows=2,
                    field=CoiField(
                        id=uuid5(form_id, "finish-info"),
                        type="SECTION",
                        techName="podsumowanie",
                        title="Podsumowanie",
                        questionOrder=1,
                        repeatingSectionGrid=[
                            CoiQuestion(
                                y=0,
                                rows=1,
                                field=CoiField(
                                    id=uuid5(form_id, "finish-preview"),
                                    type="INFO_SECTION",
                                    techName="sprawdz_wniosek",
                                    title="Sprawdź wniosek",
                                    description="Sprawdź dane przed wysłaniem formularza.",
                                    questionOrder=1,
                                ),
                            )
                        ],
                    ),
                )
            ],
        )
    )
    links = [
        CoiLink(
            id=uuid5(form_id, f"link-{source.id}-{target.id}"), source=source.id, target=target.id
        )
        for source, target in zip(tabs[:-1], tabs[1:], strict=True)
    ]
    return CoiResult(
        draft=CoiForm(title=result.title, tabs=tabs, flow=CoiFlow(links=links)),
        field_locations=locations,
        field_confidences=confidences,
    )
