"""Value checks used by Form IR controls without a documented COI validator."""

import re
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field


class ValueCheck(BaseModel):
    validator: Literal["positive_pln", "pl_bank_account"]
    value: str = Field(max_length=128)


def valid_tax_identifier(kind: str, value: str) -> bool:
    weights = (1, 3, 7, 9, 1, 3, 7, 9, 1, 3) if kind == "pesel" else (6, 5, 7, 2, 3, 4, 5, 6, 7)
    if not re.fullmatch(r"[0-9]+", value) or len(value) != len(weights) + 1:
        return False
    subtotal = sum(w * int(n) for w, n in zip(weights, value[:-1], strict=True))
    expected = (-subtotal) % 10 if kind == "pesel" else subtotal % 11
    return expected == int(value[-1])


def pln_amount(value: object) -> Decimal | None:
    if not isinstance(value, (str, int, float)):
        return None
    text = str(value).strip()
    if len(text) > 128 or not re.fullmatch(r"[0-9]+(?:[.,][0-9]{1,2})?", text):
        return None
    return Decimal(text.replace(",", "."))


def valid_value(check: ValueCheck) -> bool:
    value = check.value.strip()
    if check.validator == "positive_pln":
        amount = pln_amount(value)
        return amount is not None and amount > 0
    nrb = value.replace(" ", "").upper().removeprefix("PL")
    if not re.fullmatch(r"[0-9]{26}", nrb):
        return False
    # Move PL and the two check digits to the end. P = 25, L = 21.
    return int(nrb[2:] + "2521" + nrb[:2]) % 97 == 1
