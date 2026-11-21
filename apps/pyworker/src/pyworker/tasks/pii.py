"""Local Polish document recognizers. Labels remain editable before export."""

import json
import re
import sys
from bisect import bisect_right

from .document_types import Page
from .pii_tracer import load_model, model_spans

CAPITAL = r"[A-ZĄĆĘŁŃÓŚŹŻ][a-ząćęłńóśźż]+(?:-[A-ZĄĆĘŁŃÓŚŹŻ][a-ząćęłńóśźż]+)?"
NAME = re.compile(rf"\b({CAPITAL})\s+({CAPITAL})\b")
PATTERNS = {
    "EMAIL": r"[\w.+-]+@[\w.-]+\.[^\W\d_]{2,}",
    "KONTO": r"(?<!\d)(?:PL\s*)?\d{2}(?:\s?\d{4}){6}(?!\d)",
    "PESEL": r"(?<!\d)\d{11}(?!\d)",
    "NIP": r"(?<!\d)\d{3}(?:[- ]?\d{3}[- ]?\d{2}|[- ]?\d{2}[- ]?\d{3})[- ]?\d{2}(?!\d)",
    "TELEFON": r"(?<!\d)(?:\+48[ -]?)?\d{3}[ -]?\d{3}[ -]?\d{3}(?!\d)",
    "ADRES": r"\b(?:ul\.|al\.)\s+[\w-]+(?:\s+[A-ZĄĆĘŁŃÓŚŹŻ][\w-]+)*\s+\d+[\w/-]*",
}


def verified_identifier(label, value):
    digits = re.sub(r"\D", "", value)
    if label == "PESEL":
        return (
            sum(int(d) * w for d, w in zip(digits, (1, 3, 7, 9, 1, 3, 7, 9, 1, 3, 1), strict=True))
            % 10
            == 0
        )
    if label == "NIP":
        return sum(
            int(d) * w for d, w in zip(digits[:9], (6, 5, 7, 2, 3, 4, 5, 6, 7), strict=True)
        ) % 11 == int(digits[-1])
    if label == "KONTO":
        return int(digits[2:] + "2521" + digits[:2]) % 97 == 1
    return True


def detect(pages: list[Page]):
    model = load_model()
    for page in pages:
        text = " ".join(word.text for word in page.words)
        spans = list(model_spans(model, text))
        for match in NAME.finditer(text):
            spans.extend([(*match.span(1), "IMIĘ"), (*match.span(2), "NAZWISKO")])
        for label, pattern in PATTERNS.items():
            for match in re.finditer(pattern, text):
                # A failed checksum can be an OCR error. Keep a proposed mask.
                spans.append(
                    (*match.span(), label if verified_identifier(label, match[0]) else "DANE")
                )
        ends = []
        offset = 0
        for word in page.words:
            offset += len(word.text)
            ends.append(offset)
            offset += 1
        for left, right, label in spans:
            index = bisect_right(ends, left)
            while index < len(ends) and ends[index] - len(page.words[index].text) < right:
                page.words[index].label = label
                index += 1
    return {
        "pages": [page.model_dump() for page in pages],
        "detector": "pii-tracer+pl" if model else "pl-rules",
    }


if __name__ == "__main__":
    for line in sys.stdin.buffer:
        try:
            result = detect([Page.model_validate(page) for page in json.loads(line)])
        except Exception:
            result = None
        sys.stdout.buffer.write(json.dumps(result).encode("ascii") + b"\n")
        sys.stdout.buffer.flush()
