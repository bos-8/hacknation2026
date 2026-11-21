"""Authenticate internal writes and bound request bodies before JSON parsing."""

import asyncio
import hmac

from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Receive, Scope, Send

from pyworker.config import Settings
from pyworker.forms import UPLOAD_PATH

MAX_BODY_BYTES = 8192


class TaskBoundary:
    def __init__(self, app: ASGIApp, settings: Settings) -> None:
        self.app = app
        self.settings = settings

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if (
            scope["type"] != "http"
            or scope["method"] != "POST"
            or scope["path"] not in ("/v1/tasks/check", UPLOAD_PATH)
        ):
            await self.app(scope, receive, send)
            return
        headers = dict(scope["headers"])
        expected = f"Bearer {self.settings.token}".encode("ascii")
        if not hmac.compare_digest(headers.get(b"authorization", b""), expected):
            await JSONResponse({"error": "unauthorized"}, status_code=401)(scope, receive, send)
            return
        upload = scope["path"] == UPLOAD_PATH
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
