"""Authenticate internal writes and bound request bodies before JSON parsing."""

import asyncio
import hmac

from starlette.exceptions import HTTPException
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Receive, Scope, Send

from pyworker.config import Settings

MAX_BODY_BYTES = 8192


class TaskBoundary:
    def __init__(self, app: ASGIApp, settings: Settings) -> None:
        self.app = app
        self.settings = settings

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or scope["method"] != "POST":
            await self.app(scope, receive, send)
            return
        headers = dict(scope["headers"])
        expected = f"Bearer {self.settings.token}".encode("ascii")
        if not hmac.compare_digest(headers.get(b"authorization", b""), expected):
            await JSONResponse({"error": "unauthorized"}, status_code=401)(scope, receive, send)
            return
        expected_type = (
            b"multipart/form-data" if scope["path"] == "/v1/tasks/document" else b"application/json"
        )
        if headers.get(b"content-type", b"").split(b";")[0].strip() != expected_type:
            await JSONResponse({"error": "unsupported_content_type"}, status_code=415)(
                scope, receive, send
            )
            return
        if scope["path"] == "/v1/tasks/document":
            received = 0

            async def document_part():
                nonlocal received
                message = await receive()
                received += len(message.get("body", b""))
                if received > 15 * 1024 * 1024:
                    raise HTTPException(413, "Document request too large")
                return message

            await self.app(scope, document_part, send)
            return
        body = bytearray()
        try:
            async with asyncio.timeout(self.settings.task_timeout):
                while True:
                    message = await receive()
                    if message["type"] == "http.disconnect":
                        return
                    chunk = message.get("body", b"")
                    if len(body) + len(chunk) > MAX_BODY_BYTES:
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
