"""Synchronous-in-request form intake. Uploaded data stays in bounded memory."""

import asyncio
from pathlib import PurePath
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.security import HTTPBearer
from pydantic import BaseModel
from starlette.datastructures import UploadFile
from starlette.formparsers import MultiPartException, MultiPartParser

UPLOAD_PATH = "/v1/forms/validate"
MAX_FILE = 20 * 1024 * 1024
MAX_BODY = MAX_FILE + 64 * 1024
FORMATS = {
    ".pdf": ("application/pdf", b"%PDF-"),
    ".png": ("image/png", b"\x89PNG\r\n\x1a\n"),
    ".jpg": ("image/jpeg", b"\xff\xd8\xff"),
    ".jpeg": ("image/jpeg", b"\xff\xd8\xff"),
}


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
    if not request.app.state.ready:
        raise HTTPException(503, "not_ready")
    slot = request.app.state.upload_slot
    if slot.locked():
        raise HTTPException(429, "busy")
    async with slot:
        parser = MemoryFormParser(
            request.headers, limited_stream(request), max_files=1, max_fields=0
        )
        try:
            async with asyncio.timeout(30):
                form = await parser.parse()
        except TimeoutError as error:
            raise HTTPException(408, "request_timeout") from error
        except MultiPartException as error:
            raise HTTPException(422, "invalid_multipart") from error
        try:
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
            fmt = FORMATS.get(PurePath(name).suffix.lower())
            if not fmt:
                raise HTTPException(415, "unsupported_format")
            mime, signature = fmt
            if file.content_type not in (mime, "application/octet-stream", None) or (
                await file.read(len(signature)) != signature
            ):
                raise HTTPException(415, "format_mismatch")
            return ValidatedFile(media_type=mime, size_bytes=file.size)
        finally:
            await form.close()
