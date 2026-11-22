"""Offline administrative choices and cadastral checks against configured local data."""

import json
import os
import re
import sqlite3
import zlib
from contextlib import closing
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, Depends
from fastapi.security import HTTPBearer
from pydantic import BaseModel, Field

from pyworker.form_ir import normalized

ADDRESS_PATH = "/v1/forms/addresses/choices"
router = APIRouter(tags=["Forms"], dependencies=[Depends(HTTPBearer())])
LEVELS = ("province", "county", "municipality", "locality", "street")
TERYT = Path(__file__).with_name("schemas") / "v1" / "teryt.sqlite3"


class AddressGroup(BaseModel):
    fields: dict[Literal["province", "county", "municipality", "locality", "street"], str]
    values: dict[str, str] = Field(max_length=5)


class Addresses(BaseModel):
    groups: list[AddressGroup] = Field(max_length=10)


@router.post(ADDRESS_PATH)
def addresses(request: Addresses):
    choices, canonical, checks = {}, {}, []
    with closing(sqlite3.connect(TERYT.as_uri() + "?mode=ro", uri=True)) as db:
        for group in request.groups:
            parent = ""
            for level in LEVELS:
                field = group.fields.get(level)
                if field is None:
                    break
                row = (
                    db.execute(
                        "SELECT payload FROM choices WHERE level=? AND parent=?", (level, parent)
                    ).fetchone()
                    if parent is not None
                    else None
                )
                options = json.loads(zlib.decompress(row[0])) if row else []
                choices[field] = options
                value = group.values.get(level)
                code = None
                if value:
                    if any(key == value for key, _ in options):
                        code = value
                    else:
                        label = normalized(value)
                        matches = [key for key, name in options if normalized(name) == label]
                        if len(matches) == 1:
                            code = matches[0]
                valid = code is not None
                if valid:
                    canonical[field] = code
                if value and not valid:
                    checks.append(
                        {"field": field, "validatorId": "teryt.parent", "status": "INVALID"}
                    )
                if level == "locality" and valid:
                    parent = parent + "/" + code
                else:
                    parent = code
    return {"choices": choices, "checks": checks, "canonical": canonical}


def parcel_status(value):
    """A negative registry match is conclusive only inside a declared complete precinct."""
    if any(not isinstance(v, str) for v in value.values()):
        return "INVALID"
    number = value.get("number", "").strip()
    district = value.get("precinct", "").strip()
    municipality = value.get("municipality", "")
    parcel_pattern = r"(?:AR_[0-9]+\.)?[1-9][0-9]*(?:/[1-9][0-9]*)?"
    if number and not re.fullmatch(parcel_pattern, number, re.ASCII):
        return "INVALID"
    key = None
    if re.fullmatch(r"[0-9]{6}_[0-9]\.[0-9]{4}", district):
        key = district
        if municipality and key.split(".")[0].replace("_", "") != municipality:
            return "INVALID"
    elif re.fullmatch(r"[0-9]{1,4}", district):
        if re.fullmatch(r"[0-9]{7}", municipality):
            key = municipality[:6] + "_" + municipality[6] + "." + district.zfill(4)
    elif district and not any(c.isalpha() for c in district):
        return "INVALID"
    if not number or not district:
        return "UNVERIFIED"
    database = os.getenv("PYWORKER_EGIB_SQLITE")
    if not database:
        return "UNAVAILABLE"
    with closing(sqlite3.connect(Path(database).resolve().as_uri() + "?mode=ro", uri=True)) as db:
        if not key:
            if not municipality:
                return "UNVERIFIED"
            matches = [
                r[0]
                for r in db.execute(
                    "SELECT id, name FROM precinct WHERE municipality=?", (municipality,)
                )
                if r[1].casefold() == district.casefold()
            ]
            if len(matches) != 1:
                return "UNVERIFIED"
            key = matches[0]
        coverage = db.execute("SELECT complete FROM precinct WHERE id=?", (key,)).fetchone()
        if not coverage:
            return "UNVERIFIED"
        if db.execute(
            "SELECT 1 FROM parcel WHERE precinct_id=? AND number=?", (key, number)
        ).fetchone():
            return "VALID"
        return "INVALID" if coverage[0] == 1 else "UNVERIFIED"
