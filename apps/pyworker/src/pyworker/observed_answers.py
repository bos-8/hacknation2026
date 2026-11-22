"""Match printed answers to their labels without guessing missing values."""

import re
from itertools import groupby

FULL_NAME = r"(?:imię\s+i\s+nazwisko|nazwisko\s+i\s+imię)(?:\s+wnioskodawcy)?"
UNDER_CAPTION = re.compile(rf"/\s*({FULL_NAME}|adres|PESEL|nr telefonu)\s*/", re.I)
NEXT_LINE_LABEL = re.compile(
    rf"(?:{FULL_NAME}|PESEL|NIP|REGON|KRS|imię|nazwisko|e[- ]?mail|adres e[- ]?mail|telefon|"
    r"nr telefonu|numer telefonu|kod pocztowy|numer rachunku(?: bankowego)?|"
    r"kwota(?: nadpłaty)?|data)\s*\*?:",
    re.I,
)


def split_labelled_row(line):
    """Separate adjacent explicit labels in a printed row, retaining empty answers."""
    cells = [part.strip() for part in line.strip("|").split("|")]
    if len(cells) > 1 and any(NEXT_LINE_LABEL.fullmatch(cell) for cell in cells):
        # DOCX table cells can alternate a printed label and its answer.
        if all(NEXT_LINE_LABEL.fullmatch(cell) for cell in cells[::2]) and not any(
            NEXT_LINE_LABEL.search(cell) for cell in cells[1::2]
        ):
            return [
                (cells[i] + " " + (cells[i + 1] if i + 1 < len(cells) else "")).strip()
                for i in range(0, len(cells), 2)
            ]
    matches = [
        m for m in NEXT_LINE_LABEL.finditer(line) if m.start() == 0 or line[m.start() - 1].isspace()
    ]
    if len(matches) > 1 and matches[0].start() == 0:
        starts = [m.start() for m in matches] + [len(line)]
        return [line[a:b].strip(" \t|") for a, b in zip(starts[:-1], starts[1:], strict=True)]
    return [line]


def looks_like_name(line):
    words = line.split()
    return (
        2 <= len(words) <= 6
        and all(word.istitle() and all(c.isalpha() or c in "-'’" for c in word) for word in words)
        and not re.match(
            r"(?:Dane|Adres|Urząd|Wniosek|Formularz|Informacje|Podpis|Imię|Nazwisko)\b", line, re.I
        )
    )


def observation_lines(text):
    # OCR can put the caption below a filled line and the next answer beside it.
    text = re.sub(
        r"([.·…_])\r?\n[ \t]*(?=/\s*(?:imię|nazwisko|adres|PESEL|nr telefonu)\b)",
        r"\1 ",
        text,
        flags=re.I,
    )
    expanded = []
    for raw in text.splitlines():
        parts = UNDER_CAPTION.split(raw)
        if (
            len(parts) > 1
            and not parts[0].strip()
            and re.fullmatch(FULL_NAME, parts[1], re.I)
            and expanded
        ):
            previous = expanded[-1].strip()
            if looks_like_name(previous):
                parts[0] = expanded.pop()
        for i in range(1, len(parts), 2):
            label = parts[i]
            value = parts[i - 1].strip().rstrip(".·…_ ").strip()
            if len(value) > 255:
                expanded.append(parts[i - 1])
                value = ""
            expanded.append(f"{label[:1].upper()}{label[1:]}: {value or '...'}")
        expanded.append(parts[-1])
    lines = [part for line in expanded for part in split_labelled_row(line.strip())]
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        i += 1
        same_row = re.fullmatch(
            rf"({FULL_NAME})(?:[ \t]{{2,}}|\t|\s*(?:\.{{3,}}|…+|_{{2,}})\s*)([^\W\d_].*)",
            line,
            re.I,
        )
        if same_row:
            line = f"{same_row[1]}: {same_row[2]}"
        if i < len(lines) and re.fullmatch(rf"\(\s*({FULL_NAME})\s*\)", lines[i], re.I):
            # Filled signature lines can carry the printed caption below the answer.
            if looks_like_name(line):
                yield f"{lines[i].strip('() ')}: {line}"
                i += 1
                continue
        if re.fullmatch(FULL_NAME, line, re.I):
            line += ":"
        if NEXT_LINE_LABEL.fullmatch(line) and i < len(lines):
            following = lines[i].strip()
            if (
                following
                and len(following) <= 100
                and not NEXT_LINE_LABEL.fullmatch(following.rstrip(":") + ":")
                and not re.fullmatch(
                    r"(?:dane|adres|podpis|miejsce|informacje)\b.*", following, re.I
                )
                and not re.search(r"[:|#☐□…]|\.{3,}|_{2,}", following)
            ):
                line += " " + following
                i += 1
        yield line


def labelled_value(line: str):
    line = line.strip().strip("|").strip()
    match = re.fullmatch(r"([^:|\n]{1,90})\s*[:|]\s*([^|\n]{1,4000})", line)
    if not match:
        return None
    label, value = (s.strip() for s in match.groups())
    if re.fullmatch(FULL_NAME, label, re.I):
        value = re.sub(r"^(?:\.{2,}|…+|_+)\s*|\s*(?:\.{2,}|…+|_+)$", "", value).strip()
        if value.casefold() == label.casefold():
            return None
    if not label or not label[0].isalpha() or not value:
        return None
    if value.startswith("//") or re.fullmatch(r"[.·…_\s-]+", value):
        return None
    if re.match(r"^(?:uwaga|informacja|przykład|podstawa prawna|pouczenie)\b", label, re.I):
        return None
    return label.rstrip(" *"), value


def answer_index(document):
    by_label = {}
    blocks = document.blocks if document else []
    for (_, kind), group in groupby(blocks, key=lambda block: (block.page, block.kind)):
        texts = (block.text for block in group)
        # DOCX often stores the label and answer in consecutive paragraphs.
        chunks = ["\n".join(texts)] if kind == "text" else texts
        for line in (line for chunk in chunks for line in observation_lines(chunk)):
            if pair := labelled_value(line):
                label, value = pair
                by_label.setdefault(label.casefold(), set()).add(value)
    return by_label
