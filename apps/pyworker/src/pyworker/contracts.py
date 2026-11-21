"""Versioned input/output for an idempotent diagnostic task."""

from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class CheckRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    job_id: Annotated[UUID, Field(strict=False)]
    attempt: Annotated[int, Field(ge=0, le=1_000_000)]


class CheckResponse(BaseModel):
    status: Literal["ok"] = "ok"
    executor: Literal["pyworker"] = "pyworker"
    job_id: UUID
    attempt: int
    checksum: str
