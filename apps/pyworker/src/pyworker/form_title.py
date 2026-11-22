"""Read a printed Polish form heading across adjacent lines."""

import re

TITLE = re.compile(r"^(?:wniosek|formularz|deklaracja|zgłoszenie|oświadczenie|podanie)\b", re.I)
CONTINUATION = re.compile(r"^(?:o|na|za|w sprawie|w celu|dotycząc\w*|w zakresie)\b", re.I)
BODY = re.compile(
    r"^(?:wnoszę|proszę|zgodnie|na podstawie|podstawa|wnioskodawca|dane|adresat|instrukcja)\b", re.I
)


def heading_at(lines, start):
    parts = [lines[start]]
    for line in lines[start + 1 : start + 6]:
        if not line or BODY.match(line) or re.search(r"[:_…]|\.{3}|^\d+[.)]", line):
            break
        if not (CONTINUATION.match(line) or parts[-1].casefold() in {"o", "na", "za"}):
            break
        if len(" ".join([*parts, line])) > 255:
            break
        parts.append(line)
    return " ".join(parts), len(parts)


def visual_title(model_title, native):
    lines = [" ".join(line.split()) for line in native.splitlines() if line.strip()]
    for index, line in enumerate(lines):
        if TITLE.match(line):
            printed, _ = heading_at(lines, index)
            if not model_title or printed.casefold().startswith(model_title.casefold()):
                return printed[:255]
    return model_title
