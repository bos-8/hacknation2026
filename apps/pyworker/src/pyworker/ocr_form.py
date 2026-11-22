"""Read visible headings, blank fields and printed text from plain OCR output."""

import re
from dataclasses import dataclass
from html import escape
from typing import Literal
from uuid import UUID

from pyworker.coi import (
    Block,
    CoiResult,
    ExtractedField,
    ExtractedSection,
    ExtractedTab,
    Extraction,
    FieldType,
    ReadDocument,
)
from pyworker.form_compiler import convert_to_coi
from pyworker.form_title import TITLE, heading_at
from pyworker.observed_answers import labelled_value, observation_lines
from pyworker.vision import compile_pages

BLANK = re.compile(r"(?:\.{3,}|…+|_{2,}|[·.]\s*[·.]\s*[·.])")
FOOTNOTE = re.compile(r"[¹²³⁴⁵⁶⁷⁸⁹⁰]+\)?")
HEADING = re.compile(r"^#{1,6}\s+")
PARTY = re.compile(r"^(?:wnioskodawc\w*|adresat|organ|dane (?:wnioskodawcy|podmiotu))$", re.I)
NOTICE = re.compile(r"^(?:klauzula informacyjna|pouczenie|informacja o przetwarzaniu)\b", re.I)
INLINE_LABEL = re.compile(r"^(?:i\s+)?(?:w|we|przy)\s+", re.I)
CHOICE = re.compile(r"(☐|□|\[\s*\]|○|◯|\(\s*\))\s*")
CONSENT = re.compile(r"^(?:wyrażam zgodę|oświadczam|potwierdzam|przyjmuję do wiadomości)\b", re.I)
CONTACT = re.compile(r"^(?:numer telefonu|nr telefonu|telefon|(?:adres )?e[ -]?mail)\b", re.I)
REPEATING = re.compile(r"\b(?:dla każd\w*|powtarzaj\w*)\b", re.I)
ATTACH = re.compile(r"^(?:dołącz|załącz)\s+", re.I)
NUMBERED = re.compile(r"^\d{1,4}[.)]\s+")
SECTION_HEADING = re.compile(
    r"^(?:\d{1,2}\.)+\s+(?P<title>(?:Dane|Wnioskodawca|Osiągnięcia|Klauzula informacyjna|"
    r"Zgod[ay]|Instrukcja wypełnienia)\b[^:;!?]{0,85})$",
    re.I,
)
ORG_START = re.compile(r"^(?:urząd (?:gminy|miasta)|starostwo powiatowe)\b", re.I)
CHOICE_HEADING = re.compile(r"\b(?:wybierz|proszę)\s*:$", re.I)
STAR_NOTE = re.compile(r"^\*\s*\w")
LABEL_FORMS = {
    "kwocie": "Kwota",
    "miejscowości": "Miejscowość",
    "ulicy": "Ulica",
    "obrębie": "Obręb",
}
INPUT_TYPES: tuple[tuple[FieldType, re.Pattern[str]], ...] = (
    ("DATEPICKER", re.compile(r"^(?:data\b|termin\b)", re.I)),
    ("NUMBER", re.compile(r"^(?:kwota\b|liczba\b|ilość\b|powierzchnia\b)", re.I)),
    ("TEXTAREA", re.compile(r"^(?:uzasadnienie|uwagi|opis|dodatkowe informacje)\b", re.I)),
    ("FILE_UPLOADER", re.compile(r"^(?:załącznik|załączniki|dołącz|załącz|plik)\b", re.I)),
)


@dataclass(frozen=True, slots=True)
class Observation:
    kind: Literal["heading", "section", "label", "choice", "text", "blank"]
    text: str
    required: bool = False
    single_choice: bool = False
    paragraph_start: bool = False
    answer: str | None = None


def detect_items(text: str) -> tuple[str, list[Observation]]:
    lines = []
    paragraph_start = True
    for raw in observation_lines(text):
        if not (raw := raw.strip()):
            paragraph_start = True
            continue
        lines.append(
            (
                bool(HEADING.match(raw)),
                HEADING.sub("", raw).replace("**", "").strip(),
                paragraph_start,
            )
        )
        paragraph_start = False
    for i, (heading, line, paragraph_start) in enumerate(lines):
        if TITLE.match(line) and not BLANK.search(line):
            printed, count = heading_at([item[1] for item in lines], i)
            lines[i : i + count] = [(heading or count > 1, printed, paragraph_start)]
            break
    title = next((line for heading, line, _ in lines if heading and TITLE.match(line)), "")
    title = title or next(
        (line for _, line, _ in lines if TITLE.match(line) and not BLANK.search(line)), "Formularz"
    )
    observations = []
    has_star_note = any(STAR_NOTE.match(line) for _, line, _ in lines)
    previous_blank = False
    numbered_choices = False
    in_notice = False
    for heading, line, paragraph_start in lines:
        section_name = line.rstrip(":")
        if not line:
            continue
        if numbered_choices and NUMBERED.match(line):
            option = BLANK.split(NUMBERED.sub("", line), maxsplit=1)[0].strip()
            if option:
                observations.append(Observation("choice", option, single_choice=True))
            continue
        numbered_choices = bool(CHOICE_HEADING.search(line))
        if numbered_section := SECTION_HEADING.fullmatch(section_name):
            name = numbered_section["title"]
            observations.append(Observation("section", name))
            in_notice = bool(NOTICE.match(name))
        elif (
            line == title
            or heading
            or PARTY.fullmatch(section_name)
            or NOTICE.fullmatch(section_name)
        ):
            observations.append(Observation("heading", section_name))
            in_notice = bool(NOTICE.match(section_name))
        elif in_notice:
            observations.append(Observation("text", line, paragraph_start=paragraph_start))
        elif previous_blank and ORG_START.match(line):
            observations.extend([Observation("heading", "Adresat"), Observation("text", line)])
        elif FOOTNOTE.match(line) or STAR_NOTE.match(line) or NUMBERED.match(line):
            observations.append(Observation("text", line, paragraph_start=paragraph_start))
        elif re.fullmatch(r"w załączeniu\s*:", line, re.I):
            observations.append(Observation("label", "Załączniki"))
        elif BLANK.fullmatch(line):
            observations.append(Observation("blank", line))
        elif not CHOICE.search(line) and (observed := labelled_value(line)):
            label, answer = observed
            observations.append(
                Observation(
                    "label",
                    label,
                    required=line.split(":", 1)[0].rstrip().endswith("*"),
                    answer=answer,
                )
            )
        elif CHOICE.search(line):
            prefix, *marked = CHOICE.split(line)
            if prefix.strip():
                observations.append(Observation("label", prefix.strip().rstrip(":")))
            for mark, option in zip(marked[::2], marked[1::2], strict=True):
                if option := option.strip(" ,;"):
                    observations.append(
                        Observation("choice", option, single_choice=mark[0] in "○◯(")
                    )
        else:
            clean = FOOTNOTE.sub("", line).strip()
            if re.fullmatch(r"\([^().]{1,80}\)", clean):
                labels = [clean[1:-1]]
            elif re.fullmatch(r"/[^/\n]{1,80}/", clean):
                labels = [clean[1:-1].strip()]
            elif BLANK.search(clean):
                labels = BLANK.split(clean)[:-1]
            elif previous_blank and re.fullmatch(r"[\w /-]{1,90}", clean):
                labels = [clean]
            else:
                labels = [clean.rstrip(":")] if clean.endswith(":") and len(clean) <= 100 else []
            labels = [
                INLINE_LABEL.sub("", label.strip().strip(" .,:;()-")).strip() for label in labels
            ]
            labels = [label for label in labels if label and not label.isdecimal()]
            if any(len(label) > 60 for label in labels):
                observations.append(Observation("text", line, paragraph_start=paragraph_start))
                labels = [label for label in labels if len(label) <= 60]
            if labels:
                observations.extend(
                    Observation(
                        "label",
                        LABEL_FORMS.get(label.casefold(), label.rstrip("* ")),
                        required=label.endswith("*") and not has_star_note,
                    )
                    for label in labels
                    if label.rstrip("* ")
                )
            elif not observations or observations[-1].text != line:
                observations.append(Observation("text", line, paragraph_start=paragraph_start))
        previous_blank = observations[-1].kind == "blank" if observations else False
    return title[:255], observations


def field(
    label: str,
    *,
    kind: FieldType = "TEXT_FIELD",
    description: str = "",
    value: str | None = None,
    required: bool = False,
    options: tuple[str, ...] = (),
) -> ExtractedField:
    return ExtractedField(
        label=label[:255],
        type=kind,
        required=required,
        confidence=None,
        description=description,
        options=[option[:255] for option in options],
        label_blocks=[],
        input_blocks=[],
        read_only=value is not None or kind == "TEXT_BLOCK",
        default_value=value,
    )


def render_prose(lines: list[Observation]) -> str:
    paragraphs: list[str] = []
    entries: list[tuple[int, str]] = []
    parts: list[str] = []

    def flush():
        if entries:
            items = "".join(f'<li value="{index}">{escape(body)}</li>' for index, body in entries)
            paragraphs.append(f"<ol>{items}</ol>")
            entries.clear()
        elif parts:
            paragraphs.append(f"<p>{escape(' '.join(parts))}</p>")
        parts.clear()

    for item in lines:
        marker = NUMBERED.match(item.text)
        if marker:
            if parts:
                flush()
            entries.append((int(marker[0].strip()[:-1]), item.text[marker.end() :]))
        elif entries and not item.paragraph_start:
            index, body = entries[-1]
            entries[-1] = (index, f"{body} {item.text}")
        else:
            if entries or item.paragraph_start:
                flush()
            parts.append(item.text)
    flush()
    return "".join(paragraphs)


def group_fields(title: str, items: list[Observation]) -> Extraction | None:
    groups: dict[str, list[ExtractedSection]] = {}
    section_title = "Dane ogólne"
    tab_title = "Dane"
    fields: list[ExtractedField] = []
    prose: list[Observation] = []
    footnotes: list[Observation] = []
    printed = False
    notice = False

    def flush_prose():
        if prose:
            if printed and not notice:
                fields.append(field("Dane adresata", value="\n".join(item.text for item in prose)))
            else:
                label = section_title if notice else "Informacje z formularza"
                fields.append(field(label, kind="TEXT_BLOCK", description=render_prose(prose)))
            prose.clear()

    def flush():
        flush_prose()
        if footnotes:
            fields.append(field("Przypisy", kind="TEXT_BLOCK", description=render_prose(footnotes)))
        if fields:
            groups.setdefault(tab_title, []).append(
                ExtractedSection(
                    title=section_title[:255],
                    repeating=bool(REPEATING.search(section_title)),
                    fields=fields[:],
                )
            )
        fields.clear()
        prose.clear()
        footnotes.clear()

    index = 0
    while index < len(items):
        item = items[index]
        index += 1
        line = item.text
        if item.kind in {"heading", "section"}:
            flush()
            section_title = line
            if item.kind == "heading":
                tab_title = (
                    "Dane sprawy"
                    if line == title
                    else ("Dane" if PARTY.fullmatch(section_title) else section_title[:255])
                )
            printed = section_title.casefold() in {"adresat", "organ"}
            notice = bool(NOTICE.match(section_title))
            continue
        if notice or printed:
            prose.append(item)
            continue
        if FOOTNOTE.match(line) or STAR_NOTE.match(line):
            footnotes.append(item)
            continue
        if item.kind == "blank":
            continue
        if item.kind in {"label", "choice"} or ATTACH.match(line):
            flush_prose()
        if CONSENT.match(line) and (item.kind == "choice" or "zgod" in section_title.casefold()):
            fields.append(
                field(
                    "Oświadczenie"
                    if line.lower().startswith("oświadczam")
                    else "Zgoda lub potwierdzenie",
                    kind="CONSENT_SECTION",
                    description=f"<p>{escape(line[:300])}</p>",
                    required=item.required,
                )
            )
            continue
        if item.kind == "choice" or (
            item.kind == "label" and index < len(items) and items[index].kind == "choice"
        ):
            choices = [item] if item.kind == "choice" else []
            while (
                index < len(items)
                and items[index].kind == "choice"
                and not CONSENT.match(items[index].text)
            ):
                choices.append(items[index])
                index += 1
            if choices:
                single = all(choice.single_choice for choice in choices)
                kind = ("SELECT" if len(choices) > 5 else "RADIO") if single else "CHECKBOX"
                label = line if item.kind == "label" else "Wybierz opcję"
                fields.append(
                    field(
                        label,
                        kind=kind,
                        required=item.required,
                        options=tuple(c.text for c in choices),
                    )
                )
                continue
        if item.kind == "label":
            label = "Data" if line.casefold().endswith(", dnia") else line
            kind = next(
                (kind for kind, pattern in INPUT_TYPES if pattern.search(label)), "TEXT_FIELD"
            )
            control = field(label, kind=kind, required=item.required)
            control.observed_value = item.answer
            fields.append(control)
        elif ATTACH.match(line):
            fields.append(field(ATTACH.sub("", line), kind="FILE_UPLOADER"))
        elif (
            item.kind == "text"
            and re.search(r"\w", line)
            and not line.startswith("![")
            and not BLANK.fullmatch(NUMBERED.sub("", line))
        ):
            prose.append(item)

    flush()
    if not groups:
        return None
    contact = []
    for group_title, sections in list(groups.items()):
        for section in sections[:]:
            if NOTICE.match(section.title):
                sections.remove(section)
                contact.append(section)
                continue
            fields = [
                f for f in section.fields if CONTACT.match(f.label) or f.type == "CONSENT_SECTION"
            ]
            if fields:
                contact.append(
                    ExtractedSection(
                        title="Dane do kontaktu"
                        if CONTACT.match(fields[0].label)
                        else section.title,
                        repeating=False,
                        fields=fields,
                    )
                )
                remaining = [f for f in section.fields if f not in fields]
                if remaining:
                    section.fields = remaining
                else:
                    sections.remove(section)
        if not sections:
            del groups[group_title]
    if contact:
        groups.setdefault("Kontakt i oświadczenia", []).extend(contact)
    if parties := groups.get("Dane"):
        parties.sort(key=lambda section: section.title.casefold() not in {"adresat", "organ"})
    return Extraction(
        title=title,
        tabs=[ExtractedTab(title=name, sections=sections) for name, sections in groups.items()],
    )


def form_from_text(
    text: str,
    ocr: bool,
    form_id: UUID,
    *,
    document: ReadDocument | None = None,
    grid_pages=(),
    char_limit=200_000,
    semantic_mode="EXTENDED",
    as_of=None,
) -> CoiResult:
    title, items = detect_items(text)
    doc = document or ReadDocument(blocks=[Block(id=1, page=1, kind="text", text=text)], ocr=ocr)
    extracted = group_fields(title, items) if items else None
    if grid_pages:
        grids, doc = compile_pages(grid_pages, doc.sha256, char_limit, base_blocks=doc.blocks)
        for n, tab in enumerate(grids.tabs, 1):
            tab.title = "Tabele" if n == 1 else f"Tabele ({n})"
        extracted = Extraction(
            title=title, tabs=[*(extracted.tabs if extracted else []), *grids.tabs]
        )
    if extracted is None:
        raise ValueError("No fields found")
    return convert_to_coi(
        extracted,
        doc,
        form_id,
        semantic_mode=semantic_mode,
        as_of=as_of,
        visual=bool(grid_pages),
    )
