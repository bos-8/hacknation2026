"""Authenticate internal writes and bound request bodies before JSON parsing."""

import asyncio
import hmac

from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Receive, Scope, Send

from pyworker.answer_checks import CHECK_ANSWERS
from pyworker.config import Settings
from pyworker.forms import PROCESS_PATH, SCHEMA_PATH, UPLOAD_PATH, VALUE_PATH
from pyworker.geography import ADDRESS_PATH
from pyworker.profile_api import EVALUATE, PROFILES, REVIEW

MAX_BODY_BYTES = 8192


class TaskBoundary:
    def __init__(self, app: ASGIApp, settings: Settings) -> None:
        self.app = app
        self.settings = settings

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        protected_read = scope["method"] == "GET" and scope["path"] in (
            PROCESS_PATH,
            SCHEMA_PATH,
            SCHEMA_PATH + "/catalog",
            PROFILES,
        )
        task = scope["method"] == "POST" and scope["path"] in (
            "/v1/tasks/check",
            VALUE_PATH,
            CHECK_ANSWERS,
            ADDRESS_PATH,
            REVIEW,
            EVALUATE,
            UPLOAD_PATH,
            PROCESS_PATH,
        )
        if not (protected_read or task):
            await self.app(scope, receive, send)
            return
        headers = dict(scope["headers"])
        expected = f"Bearer {self.settings.token}".encode("ascii")
        supplied = headers.get(b"authorization", b"")
        web_operation = (
            scope["method"] == "GET" and scope["path"] == PROCESS_PATH
            or scope["method"] == "POST" and scope["path"] in (UPLOAD_PATH, CHECK_ANSWERS, ADDRESS_PATH, REVIEW, EVALUATE)
        )
        forms_authorized = web_operation and self.settings.forms_token and hmac.compare_digest(
            supplied, f"Bearer {self.settings.forms_token}".encode("ascii")
        )
        if not hmac.compare_digest(supplied, expected) and not forms_authorized:
            await JSONResponse({"error": "unauthorized"}, status_code=401)(scope, receive, send)
            return
        if protected_read:
            await self.app(scope, receive, send)
            return
        upload = scope["path"] in (UPLOAD_PATH, PROCESS_PATH)
        media_type = b"multipart/form-data" if upload else b"application/json"
        if headers.get(b"content-type", b"").split(b";")[0].strip().lower() != media_type:
            await JSONResponse({"error": "unsupported_content_type"}, status_code=415)(
                scope, receive, send
            )
            return
        if upload:
            await self.app(scope, receive, send)
            return
        body = bytearray()
        limit = {REVIEW: 32 * 1024, EVALUATE: 2 * 1024 * 1024, CHECK_ANSWERS: 2 * 1024 * 1024}.get(
            scope["path"], MAX_BODY_BYTES
        )
        try:
            async with asyncio.timeout(self.settings.task_timeout):
                while True:
                    message = await receive()
                    if message["type"] == "http.disconnect":
                        return
                    chunk = message.get("body", b"")
                    if len(body) + len(chunk) > limit:
                        await JSONResponse({"error": "body_too_large"}, status_code=413)(
                            scope, receive, send
                        )
                        return
                    body.extend(chunk)
                    if not message.get("more_body", False):
                        break
        except TimeoutError:
            await JSONResponse({"error": "request_timeout"}, status_code=408)(scope, receive, send)
            return
        delivered = False

        async def replay():
            nonlocal delivered
            if not delivered:
                delivered = True
                return {"type": "http.request", "body": bytes(body), "more_body": False}
            return await receive()

        await self.app(scope, replay, send)
