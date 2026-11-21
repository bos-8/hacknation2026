"""Synchronous-in-request form intake. Uploaded data stays in bounded memory."""

import asyncio
import json
from pathlib import PurePath
from typing import Literal
from zipfile import BadZipFile, ZipFile

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.security import HTTPBearer
from pydantic import BaseModel
from starlette.datastructures import UploadFile
from starlette.formparsers import MultiPartException, MultiPartParser

UPLOAD_PATH = "/v1/forms/validate"
MAX_FILE = 20 * 1024 * 1024
MAX_BODY = MAX_FILE + 64 * 1024
DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
ODS = "application/vnd.oasis.opendocument.spreadsheet"
PACKAGES = {".docx": "word/document.xml", ".xlsx": "xl/workbook.xml", ".ods": "content.xml"}
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


def matches_package(file, extension):
    try:
        with ZipFile(file) as package:
            package.getinfo(PACKAGES[extension])
            if extension == ".ods":
                with package.open("mimetype") as marker:
                    return marker.read(128) == ODS.encode()
            package.getinfo("[Content_Types].xml")
            return True
    except (BadZipFile, KeyError, OSError, RuntimeError, ValueError, EOFError):
        return False


async def detect_format(file: UploadFile, extension: str) -> str:
    fmt = FORMATS.get(extension)
    if not fmt:
        raise HTTPException(415, "unsupported_format")
    mime, signature = fmt
    header = await file.read(8)
    # One supplied .DOC blank is a Word Open XML package.
    package_type = ".docx" if extension == ".doc" and header.startswith(b"PK") else extension
    detected = FORMATS[package_type][0]
    declared = (file.content_type or "").partition(";")[0].strip().lower()
    if declared not in {"", "application/octet-stream", mime, detected}:
        raise HTTPException(415, "format_mismatch")
    if package_type in PACKAGES:
        if not header.startswith(b"PK\x03\x04") or not matches_package(file.file, package_type):
            raise HTTPException(415, "format_mismatch")
    elif extension in {".txt", ".json"}:
        await file.seek(0)
        try:
            text = (await file.read()).decode("utf-8-sig")
            if "\x00" in text:
                raise ValueError
            if extension == ".json":
                json.loads(text)
        except (ValueError, RecursionError) as error:
            raise HTTPException(415, "format_mismatch") from error
    elif not header.startswith(signature):
        raise HTTPException(415, "format_mismatch")
    return detected


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
            mime = await detect_format(file, PurePath(name).suffix.lower())
            return ValidatedFile(media_type=mime, size_bytes=file.size)
        finally:
            await form.close()
