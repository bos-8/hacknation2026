"""Offline value checks for the populated-form editor."""

import re
import sqlite3
from datetime import date
from functools import cache
from uuid import UUID

from fastapi import APIRouter, Depends
from fastapi.security import HTTPBearer
from pydantic import BaseModel, Field

from pyworker.field_values import ValueCheck, pln_amount, valid_tax_identifier, valid_value
from pyworker.geography import parcel_status

CHECK_ANSWERS = "/v1/forms/answers/validate"
router = APIRouter(tags=["Forms"], dependencies=[Depends(HTTPBearer())])


class Check(BaseModel):
    field: UUID
    validatorId: str = Field(max_length=64)
    value: str | dict[str, str | bool]
    country: str | None = Field(default=None, max_length=80)


class Batch(BaseModel):
    checks: list[Check] = Field(max_length=5000)


@cache
def dictionaries():
    try:
        from formiq_validation import ValidatorEngine
    except ImportError:
        return None
    return ValidatorEngine()


def reported_status(result: dict) -> str:
    status = result.get("status")
    if status not in {"VALID", "INVALID", "UNAVAILABLE", "UNVERIFIED", "NOT_APPLICABLE"}:
        return "UNAVAILABLE"
    if status == "VALID":
        checks = result.get("checks", {})
        if not isinstance(checks, (dict, list)):
            return "UNAVAILABLE"
        for check in checks.values() if isinstance(checks, dict) else checks:
            if (check.get("status") if isinstance(check, dict) else check) == "INVALID":
                return "INVALID"
    return status


def pesel(value):
    if not valid_tax_identifier("pesel", value):
        return False
    yy, mm, dd = (int(value[i : i + 2]) for i in (0, 2, 4))
    centuries = (1900, 2000, 2100, 2200, 1800)
    try:
        return date(centuries[mm // 20] + yy, mm % 20, dd) <= date.today()
    except ValueError:
        return False


def builtin(check):
    """Return only the result supported by the installed data."""
    v, name = check.value, check.validatorId
    if not isinstance(v, str):
        return "UNAVAILABLE"
    v = v.strip()
    if not v:
        return "NOT_APPLICABLE"
    if name == "pl.pesel.v1":
        valid = pesel(v)
    elif name == "pl.nip.v1":
        valid = valid_tax_identifier("nip", v)
    elif name == "pl.krs_format.v1":
        valid = re.fullmatch(r"[0-9]{10}", v)
    elif name == "internet.email_basic.v1":
        valid = re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", v)
    elif name == "international.e164_format.v1":
        valid = re.fullmatch(r"\+[1-9][0-9]{1,14}", v)
    elif name == "common.iso_date.v1":
        try:
            valid = date.fromisoformat(v).isoformat() == v
        except ValueError:
            valid = False
    elif name == "common.decimal.v1":
        valid = re.fullmatch(r"[+-]?[0-9]+(?:[.,][0-9]+)?", v)
    elif name == "common.money.v1":
        amount = pln_amount(v)
        valid = amount is not None and amount > 0
    elif name in {"pl.nrb.v1", "pl.nrb_bank.nbp.v1"} or (
        name == "international.iban.v1" and v.upper().startswith("PL")
    ):
        valid = len(v) <= 128 and valid_value(ValueCheck(validator="pl_bank_account", value=v))
        if valid and name == "pl.nrb_bank.nbp.v1":
            return "UNAVAILABLE"
    elif name == "international.postal_format.v1" and check.country == "PL":
        valid = re.fullmatch(r"[0-9]{2}-[0-9]{3}", v)
    elif name == "international.iban.v1":
        iban = v.replace(" ", "").upper()
        if not re.fullmatch(r"[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}", iban):
            return "INVALID"
        digits = "".join(str(ord(c) - 55) if c.isalpha() else c for c in iban[4:] + iban[:4])
        return "UNAVAILABLE" if int(digits) % 97 == 1 else "INVALID"
    elif name == "international.country_code.v1":
        if v == "PL":
            return "VALID"
        return "UNAVAILABLE" if re.fullmatch(r"[A-Z]{2}", v) else "INVALID"
    else:
        return "UNAVAILABLE"
    return "VALID" if valid else "INVALID"


@router.post(CHECK_ANSWERS)
def check_answers(batch: Batch):
    results = []
    for check in batch.checks:
        try:
            if check.validatorId == "pl.parcel.egib" and isinstance(check.value, dict):
                status = parcel_status(check.value)
            elif (engine := dictionaries()) is None:
                status = builtin(check)
            else:
                params = {}
                if check.validatorId == "common.money.v1":
                    params = {"currency": "PLN", "minimum": "0.01", "maxScale": 2}
                elif check.validatorId == "international.postal_format.v1":
                    params = {"country": check.country}
                result = engine.validate(
                    {"validatorId": check.validatorId, "value": check.value, "parameters": params}
                )
                status = reported_status(result)
        except (OSError, ValueError, KeyError, RuntimeError, sqlite3.Error):
            status = "UNAVAILABLE"
        results.append({"field": check.field, "validatorId": check.validatorId, "status": status})
    return results
