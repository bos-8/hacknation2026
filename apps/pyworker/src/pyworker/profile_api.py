"""Authenticated draft evaluation and recompilation. These operations do not store answers."""

from datetime import date
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPBearer
from pydantic import AwareDatetime, BaseModel, ConfigDict, Field

from pyworker.coi import CoiResult
from pyworker.extended_form import EDITORIAL_FIELDS, compile_extended
from pyworker.form_compiler import render_plan
from pyworker.form_ir import Assessment
from pyworker.legal_profiles import TAX_PROFILE, evaluate_answers, registry, select_profile

PROFILES = "/v1/forms/profiles"
EVALUATE = PROFILES + "/evaluate"
REVIEW = PROFILES + "/review"
router = APIRouter(tags=["Forms"], dependencies=[Depends(HTTPBearer())])


class VersionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    profileId: str
    version: str
    asOf: date


class EvaluationRequest(VersionRequest):
    path: Literal["APPLICATION", "CORRECTION"]
    answers: dict[str, str | int | float | bool | list[str] | None] = Field(max_length=75)
    acceptedEditorialFields: list[str] = Field(default_factory=list, max_length=4)


class Resolution(BaseModel):
    outcome: Literal["ACCEPT", "DECLINE"]
    reason: Annotated[str, Field(min_length=3, max_length=500)]
    actor: UUID
    at: AwareDatetime


class ReviewRequest(VersionRequest):
    formId: UUID
    procedure: Assessment
    resolutions: dict[str, Resolution] = Field(max_length=20)


def version(request):
    try:
        return select_profile(request.profileId, request.asOf, request.version)
    except ValueError as error:
        raise HTTPException(422, str(error)) from error


@router.get(PROFILES)
def profiles():
    return [record["profile"] for record in registry()]


@router.post(EVALUATE)
def evaluate_form(request: EvaluationRequest):
    if not EDITORIAL_FIELDS.issuperset(request.acceptedEditorialFields):
        raise HTTPException(422, "unsupported_editorial_field")
    return evaluate_answers(
        version(request), request.answers, request.path, accepted=request.acceptedEditorialFields
    )


@router.post(REVIEW, response_model=CoiResult)
def review_form(request: ReviewRequest):
    record = version(request)
    if (
        request.profileId != TAX_PROFILE
        or request.procedure.documentId != "D03"
        or request.procedure.match not in {"reference_sha256", "reference_text"}
    ):
        raise HTTPException(422, "profile_mismatch")
    permitted = {f["key"] for f in record["form"]["fields"] if f["decision"] == "REVIEW"}
    if not permitted.issuperset(request.resolutions):
        raise HTTPException(422, "candidate_not_in_review")
    decisions = {k: r.model_dump(mode="json") for k, r in request.resolutions.items()}
    plan = compile_extended(
        request.procedure, request.formId, request.asOf, decisions, version=request.version
    )
    return render_plan(plan, None, request.formId)
