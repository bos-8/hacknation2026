"""Synchronous-in-request form intake. Uploaded data stays in bounded memory."""

import asyncio
import hashlib
import json
import logging
from collections import deque
from dataclasses import dataclass
from datetime import date, datetime
from pathlib import PurePath
from statistics import median
from time import monotonic
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.security import HTTPBearer
from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, StrictBool, ValidationError
from starlette.datastructures import UploadFile
from starlette.formparsers import MultiPartException, MultiPartParser

from pyworker.coi import CoiForm, CoiResult, FieldConfidence, FieldLocation
from pyworker.eden import EdenFailure, GeneratedDraft, convert_document
from pyworker.field_values import ValueCheck, valid_value
from pyworker.file_structure import (
    ODS,
    PACKAGES,
    XLSX,
    matches_jpeg,
    matches_package,
    matches_pdf,
    matches_png,
)
from pyworker.form_ir import FormIR, catalog, form_validator
from pyworker.pipeline import run_pipeline

UPLOAD_PATH = "/v1/forms/validate"
PROCESS_PATH = "/v1/forms/process"
SCHEMA_PATH = "/v1/forms/schemas/v1"
VALUE_PATH = "/v1/forms/fields/validate"
MAX_FILE = 20 * 1024 * 1024
MAX_BODY = MAX_FILE + 64 * 1024
DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
FORMATS = {
    ".doc": ("application/msword", bytes.fromhex("d0cf11e0a1b11ae1")),
    ".docx": (DOCX, b"PK\x03\x04"),
    ".xlsx": (XLSX, b"PK\x03\x04"),
    ".ods": (ODS, b"PK\x03\x04"),
    ".txt": ("text/plain", b""),
    ".json": ("application/json", b""),
    ".pdf": ("application/pdf", b"%PDF-"),
    ".png": ("image/png", b"\x89PNG\r\n\x1a\n"),
    ".jpg": ("image/jpeg", b"\xff\xd8\xff"),
    ".jpeg": ("image/jpeg", b"\xff\xd8\xff"),
}
STRUCTURE_CHECKS = {
    ".pdf": matches_pdf,
    ".png": matches_png,
    ".jpg": matches_jpeg,
    ".jpeg": matches_jpeg,
}


async def detect_format(file: UploadFile, extension: str) -> str:
    fmt = FORMATS.get(extension)
    if not fmt:
        raise HTTPException(415, "unsupported_format")
    mime, signature = fmt
    header = await file.read(8)
    declared = (file.content_type or "").partition(";")[0].strip().lower()
    if declared not in {"", "application/octet-stream", mime}:
        raise HTTPException(415, "format_mismatch")
    if extension in PACKAGES:
        if not header.startswith(b"PK\x03\x04") or not matches_package(file.file, extension):
            raise HTTPException(415, "format_mismatch")
    elif extension in {".txt", ".json"}:
        await file.seek(0)
        try:
            text = (await file.read()).decode("utf-8-sig")
            if "\x00" in text:
                raise ValueError
            if extension == ".json":
                json.loads(text)
            elif any(
                signature and header.startswith(signature) for _, signature in FORMATS.values()
            ):
                raise ValueError
        except (ValueError, RecursionError) as error:
            raise HTTPException(415, "format_mismatch") from error
    elif not header.startswith(signature):
        raise HTTPException(415, "format_mismatch")
    if extension in STRUCTURE_CHECKS:
        await file.seek(0)
        if not STRUCTURE_CHECKS[extension](await file.read()):
            raise HTTPException(415, "format_mismatch")
    if extension == ".doc":
        await file.seek(0)
        contents = await file.read()
        stream_name = "WordDocument".encode("utf-16-le") + b"\x00\x00"
        if not any(
            contents.startswith(stream_name, offset)
            and contents[offset + 64 : offset + 67] == bytes((len(stream_name), 0, 2))
            for offset in range(512, len(contents) - 127, 128)
        ):
            raise HTTPException(415, "format_mismatch")
    await file.seek(0)
    return mime


class MemoryFormParser(MultiPartParser):
    # The request stream rejects any chunk crossing this threshold before parsing it.
    spool_max_size = MAX_BODY


class ValidatedFile(BaseModel):
    status: Literal["validated"] = "validated"
    media_type: str
    size_bytes: int


async def limited_stream(request):
    total = 0
    async for chunk in request.stream():
        total += len(chunk)
        if total > MAX_BODY:
            raise HTTPException(413, "request_too_large")
        yield chunk


router = APIRouter(tags=["Forms"])
logger = logging.getLogger("pyworker")


@router.get(SCHEMA_PATH, dependencies=[Depends(HTTPBearer())], summary="Form IR 1.0 JSON Schema")
def form_ir_schema():
    return form_validator().schema


@router.get(
    SCHEMA_PATH + "/catalog",
    dependencies=[Depends(HTTPBearer())],
    summary="Form IR component catalog and procedure profiles",
)
def form_ir_catalog():
    return catalog()


@router.post(
    VALUE_PATH, dependencies=[Depends(HTTPBearer())], summary="Check a Form IR field value"
)
def check_field_value(check: ValueCheck) -> dict[str, bool]:
    return {"valid": valid_value(check)}


@dataclass(slots=True)
class ActiveForm:
    operation_id: UUID
    form_id: UUID
    sender_id: UUID
    stage: str = "accepted"
    started: float | None = None
    estimate_seconds: float | None = None
    timeout_seconds: int | None = None

    def update(self, stage: str) -> None:
        self.stage = stage


@router.get(
    PROCESS_PATH,
    dependencies=[Depends(HTTPBearer())],
    summary="Read progress for an active form conversion",
)
async def form_progress(request: Request, operation_id: UUID, form_id: UUID, sender_id: UUID):
    active = getattr(request.app.state, "active_form", None)
    if not active or (active.operation_id, active.form_id, active.sender_id) != (
        operation_id,
        form_id,
        sender_id,
    ):
        raise HTTPException(404, "progress_not_found")
    elapsed = monotonic() - active.started if active.started is not None else 0
    estimated = active.estimate_seconds
    return {
        "stage": active.stage,
        "remaining_ms": (
            int((estimated - elapsed) * 1000)
            if estimated is not None and estimated > elapsed
            else None
        ),
        "timeout_remaining_ms": (
            max(0, int((active.timeout_seconds - elapsed) * 1000))
            if active.timeout_seconds is not None
            else None
        ),
    }


@router.post(
    UPLOAD_PATH,
    dependencies=[Depends(HTTPBearer())],
    response_model=ValidatedFile,
    summary="Validate one form in memory",
    description="Checks filename, size, declared media type and file signature. "
    "Returns metadata in this response. No storage, queue or OCR.",
    openapi_extra={
        "requestBody": {
            "required": True,
            "content": {
                "multipart/form-data": {
                    "schema": {
                        "type": "object",
                        "required": ["file"],
                        "additionalProperties": False,
                        "properties": {"file": {"type": "string", "format": "binary"}},
                    }
                }
            },
        }
    },
    responses={
        401: {"description": "Invalid worker token"},
        408: {"description": "Upload timeout"},
        413: {"description": "File exceeds 20 MiB or request exceeds envelope limit"},
        415: {"description": "Unsupported format or mismatched signature"},
        422: {"description": "Expected one non-empty file"},
        429: {"description": "Busy"},
    },
)
async def validate_form(request: Request):
    return await handle_form(request, process=False)


class Sender(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    uuid: UUID
    name: str = Field(min_length=1, max_length=255)
    email: str = Field(max_length=254, pattern=r"^[^\s@]+@[^\s@]+\.[^\s@]+$")


class FormMetadata(BaseModel):
    model_config = ConfigDict(extra="forbid")

    paid: StrictBool
    form_id: UUID
    sender: Sender
    uploaded_at: AwareDatetime
    submitted_at: AwareDatetime


class BypassFlow(BaseModel):
    links: list[object] = Field(default_factory=list)


class BypassDraft(BaseModel):
    title: None = None
    tabs: list[object] = Field(default_factory=list)
    flow: BypassFlow = Field(default_factory=BypassFlow)


class ProcessingResult(BaseModel):
    schema_version: Literal[1] = 1
    status: Literal["processed"] = "processed"
    mode: Literal["bypass"] = "bypass"
    form_id: UUID
    processed_at: AwareDatetime
    file: ValidatedFile
    ocr: Literal["bypassed", "not_required", "deferred"]
    llm: Literal["bypassed"] = "bypassed"
    draft: BypassDraft = Field(default_factory=BypassDraft)


class EdenProcessingResult(BaseModel):
    schema_version: Literal[2] = 2
    status: Literal["processed"] = "processed"
    mode: Literal["eden"] = "eden"
    form_id: UUID
    processed_at: AwareDatetime
    file: ValidatedFile
    ocr: Literal["completed", "not_required"]
    llm: Literal["completed"] = "completed"
    draft: GeneratedDraft


from pyworker.coi import DocumentContent


class PipelineProcessingResult(BaseModel):
    document_content: DocumentContent | None = None
    source_answers: dict[UUID, str] = Field(default_factory=dict)
    schema_version: Literal[3] = 3
    status: Literal["processed"] = "processed"
    mode: Literal["pipeline"] = "pipeline"
    form_id: UUID
    processed_at: AwareDatetime
    file: ValidatedFile
    ocr: Literal["completed", "not_required"]
    llm: Literal["completed", "bypassed"] = "completed"
    draft: CoiForm
    field_locations: list[FieldLocation]
    field_confidences: list[FieldConfidence]
    form_ir: FormIR


def validate_metadata(raw: object) -> FormMetadata:
    try:
        payload = json.loads(raw) if isinstance(raw, str) else None
    except (ValueError, RecursionError) as error:
        raise HTTPException(422, "invalid_metadata") from error
    if not isinstance(payload, dict) or type(payload.get("paid")) is not bool:
        raise HTTPException(422, "invalid_metadata")
    if not payload["paid"]:
        raise HTTPException(402, "payment_required")
    try:
        return FormMetadata.model_validate(payload)
    except ValidationError as error:
        invalid_sender = any(item["loc"][:1] == ("sender",) for item in error.errors())
        field = "invalid_sender" if invalid_sender else "invalid_metadata"
        raise HTTPException(422, field) from error


@router.post(
    PROCESS_PATH,
    dependencies=[Depends(HTTPBearer())],
    response_model=ProcessingResult | EdenProcessingResult | PipelineProcessingResult,
    summary="Validate and convert a paid form",
    description="Checks the file signature and structure against its extension before conversion.",
    openapi_extra={
        "requestBody": {
            "required": True,
            "content": {
                "multipart/form-data": {
                    "schema": {
                        "type": "object",
                        "required": ["file", "metadata"],
                        "properties": {
                            "file": {"type": "string", "format": "binary"},
                            "metadata": {
                                "type": "string",
                                "description": "JSON metadata for payment, sender and dates",
                            },
                        },
                    },
                }
            },
        }
    },
    responses={
        402: {"description": "Payment required"},
        415: {"description": "Unsupported or mismatched file"},
        422: {"description": "Invalid metadata, sender or file"},
    },
)
async def process_form(
    request: Request,
    operation_id: UUID | None = None,
    semantic_mode: Literal["EXTENDED", "STANDARD"] = "EXTENDED",
    as_of: date | None = None,
):
    return await handle_form(
        request, process=True, operation_id=operation_id, semantic_mode=semantic_mode, as_of=as_of
    )


async def handle_form(
    request: Request,
    *,
    process: bool,
    operation_id: UUID | None = None,
    semantic_mode="EXTENDED",
    as_of=None,
):
    if not request.app.state.ready:
        raise HTTPException(503, "not_ready")
    slot = request.app.state.upload_slot
    if slot.locked():
        raise HTTPException(429, "busy")
    async with slot:
        parser = MemoryFormParser(
            request.headers,
            limited_stream(request),
            max_files=1,
            max_fields=int(process),
            max_part_size=8192,
        )
        try:
            async with asyncio.timeout(30):
                form = await parser.parse()
        except TimeoutError as error:
            raise HTTPException(408, "request_timeout") from error
        except MultiPartException as error:
            raise HTTPException(422, "invalid_multipart") from error
        active = None
        try:
            metadata = validate_metadata(form.get("metadata")) if process else None
            file = form.get("file")
            if not isinstance(file, UploadFile) or not file.size:
                raise HTTPException(422, "expected_nonempty_file")
            if file.size > MAX_FILE:
                raise HTTPException(413, "file_too_large")
            name = file.filename or ""
            if (
                not name
                or len(name) > 255
                or not name.isprintable()
                or any(char in name for char in ("/", "\\", ":"))
            ):
                raise HTTPException(422, "invalid_filename")
            if operation_id and metadata:
                active = ActiveForm(operation_id, metadata.form_id, metadata.sender.uuid)
                request.app.state.active_form = active
            mime = await detect_format(file, PurePath(name).suffix.lower())
            validated = ValidatedFile(media_type=mime, size_bytes=file.size)
            if metadata is None:
                return validated
            if mime == DOCX:
                digest = hashlib.sha256(await file.read()).hexdigest()
                await file.seek(0)
                if digest in catalog()["referenceOnlyDocuments"]:
                    raise HTTPException(422, "reference_material_not_form")
            if active:
                active.update("validated")
            pipeline = request.app.state.pipeline
            settings = pipeline or request.app.state.eden
            if settings is not None:
                durations = request.app.state.form_timings.setdefault(mime, deque(maxlen=12))
                started = monotonic()
                if active:
                    active.started = started
                    active.timeout_seconds = settings.timeout_seconds
                    if durations:
                        active.estimate_seconds = min(median(durations), settings.timeout_seconds)
                report = active.update if active else None
                coi = None
                try:
                    if pipeline is not None:
                        coi, used_ocr = await run_pipeline(
                            pipeline,
                            file,
                            metadata.form_id,
                            report=report,
                            semantic_mode=semantic_mode,
                            as_of=as_of,
                        )
                        draft = coi.draft
                    else:
                        extracted, used_ocr = await convert_document(
                            settings,
                            file,
                            mime,
                            report=report,
                            semantic_mode=semantic_mode,
                            as_of=as_of,
                            **(
                                {"ocr_form_id": metadata.form_id}
                                if settings.ocr_only
                                else {"coi_form_id": metadata.form_id}
                            ),
                        )
                        if isinstance(extracted, CoiResult):
                            coi = extracted
                            draft = coi.draft
                        else:
                            draft = extracted
                except EdenFailure as error:
                    headers = {}
                    if error.reason:
                        headers["X-Form-Failure-Reason"] = error.reason
                    if error.phase:
                        headers["X-Form-Failure-Phase"] = error.phase
                    if error.reason == "deadline":
                        headers["X-Form-Timeout-Seconds"] = str(settings.timeout_seconds)
                    logger.warning(
                        "event=form_conversion_failed request_id=%s code=%s phase=%s "
                        "reason=%s elapsed_ms=%d",
                        request.state.request_id,
                        error.stage,
                        error.phase,
                        error.reason,
                        (monotonic() - started) * 1000,
                    )
                    raise HTTPException(error.status, error.stage, headers=headers) from error
                durations.append(monotonic() - started)
                result = dict(
                    form_id=metadata.form_id,
                    processed_at=datetime.now().astimezone(),
                    file=validated,
                    ocr="completed" if used_ocr else "not_required",
                    draft=draft,
                )
                if coi is not None:
                    return PipelineProcessingResult(
                        **result,
                        llm="bypassed"
                        if pipeline is None and settings.ocr_only and not settings.uses_vision(mime)
                        else "completed",
                        document_content=coi.document_content,
                        field_locations=coi.field_locations,
                        source_answers=coi.source_answers,
                        field_confidences=coi.field_confidences,
                        form_ir=coi.form_ir,
                    )
                return EdenProcessingResult(**result)
            if mime.startswith("image/"):
                ocr = "bypassed"
            elif mime == "application/pdf":
                ocr = "deferred"
            else:
                ocr = "not_required"
            return ProcessingResult(
                form_id=metadata.form_id,
                processed_at=datetime.now().astimezone(),
                file=validated,
                ocr=ocr,
            )
        finally:
            if active:
                request.app.state.active_form = None
            await form.close()
