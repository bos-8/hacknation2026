"""Authenticated client for the Node-owned pg-boss bridge; never edits queue SQL."""

import asyncio
import json
import os
import re
from collections.abc import Mapping
from dataclasses import dataclass, field
from typing import Literal
from urllib.parse import urlsplit
from uuid import UUID

import httpx2
from pydantic import BaseModel, ConfigDict, Field, ValidationError


class QueueUnavailable(RuntimeError):
    """Bridge unavailable or invalid; submissions are never automatically retried."""


@dataclass(frozen=True, slots=True)
class QueueSettings:
    url: str
    token: str = field(repr=False)

    def __post_init__(self) -> None:
        try:
            if (
                not isinstance(self.url, str)
                or len(self.url) > 2048
                or any(character.isspace() for character in self.url)
            ):
                raise ValueError
            parsed = urlsplit(self.url)
            if (
                parsed.scheme not in {"http", "https"}
                or not parsed.hostname
                or parsed.username is not None
                or parsed.password is not None
                or parsed.path not in {"", "/"}
                or parsed.query
                or parsed.fragment
                or (parsed.port is not None and not 1 <= parsed.port <= 65535)
                or (
                    parsed.scheme == "http"
                    and parsed.hostname not in {"127.0.0.1", "localhost", "::1"}
                )
            ):
                raise ValueError
        except (ValueError, TypeError):
            raise ValueError("Invalid PYWORKER_QUEUE_URL") from None
        if (
            not isinstance(self.token, str)
            or not re.fullmatch(r"[A-Za-z0-9_-]{32,512}", self.token)
            or "CHANGE_ME" in self.token
            or re.fullmatch(r"([A-Za-z]{4}secret)\1{3}", self.token)
        ):
            raise ValueError("Invalid PYWORKER_QUEUE_TOKEN")

    @classmethod
    def from_environment(cls, env: Mapping[str, str] | None = None) -> "QueueSettings":
        values = os.environ if env is None else env
        return cls(
            url=values.get("PYWORKER_QUEUE_URL", ""),
            token=values.get("PYWORKER_QUEUE_TOKEN", ""),
        )


class JobReceipt(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: UUID


class JobStatus(JobReceipt):
    state: Literal["created", "retry", "active", "completed", "cancelled", "failed"]
    executor: Literal["node", "python"]
    attempt: int = Field(strict=True, ge=0, le=1_000_000)


class QueueClient:
    """Own a bounded HTTP pool via async with; no pg-boss claiming or retries here."""

    def __init__(
        self, settings: QueueSettings, *, transport: httpx2.AsyncBaseTransport | None = None
    ) -> None:
        self._client = httpx2.AsyncClient(
            base_url=settings.url,
            headers={"Authorization": f"Bearer {settings.token}"},
            timeout=15,
            follow_redirects=False,
            trust_env=False,
            limits=httpx2.Limits(max_connections=2, max_keepalive_connections=2),
            transport=transport,
        )

    async def __aenter__(self) -> "QueueClient":
        await self._client.__aenter__()
        return self

    async def __aexit__(self, *_exc: object) -> None:
        await self._client.aclose()

    async def _request(self, method: str, path: str, body: dict | None = None) -> dict:
        try:
            # A total deadline also covers a response trickled below the read timeout.
            async with asyncio.timeout(15):
                async with self._client.stream(method, path, json=body) as response:
                    if response.status_code not in {200, 201}:
                        raise QueueUnavailable(f"Queue bridge failed ({response.status_code})")
                    content = bytearray()
                    async for chunk in response.aiter_bytes():
                        if len(content) + len(chunk) > 8192:
                            raise QueueUnavailable("Queue bridge response too large")
                        content.extend(chunk)
                    result = json.loads(content)
                    if not isinstance(result, dict):
                        raise QueueUnavailable("Invalid queue bridge response")
                    return result
        except (httpx2.HTTPError, TimeoutError, ValueError, RecursionError):
            raise QueueUnavailable("Queue bridge unavailable or response invalid") from None

    async def enqueue_diagnostic(
        self, *, executor: Literal["node", "python"] = "python", failures: int = 0
    ) -> UUID:
        """Submit once as SYSTEM. A lost response may mean the job was accepted."""
        if (
            executor not in {"node", "python"}
            or type(failures) is not int
            or not 0 <= failures <= 4
        ):
            raise ValueError("Invalid diagnostic task")
        data = await self._request(
            "POST", "/v1/queue/diagnostics", {"executor": executor, "failures": failures}
        )
        try:
            return JobReceipt.model_validate(data).id
        except ValidationError:
            raise QueueUnavailable("Invalid queue submission receipt") from None

    async def get_job(self, job_id: UUID) -> JobStatus:
        if not isinstance(job_id, UUID):
            raise ValueError("A job UUID is required")
        data = await self._request("GET", f"/v1/queue/jobs/{job_id}")
        try:
            status = JobStatus.model_validate(data)
            if status.id != job_id:
                raise ValueError
            return status
        except (ValidationError, ValueError):
            raise QueueUnavailable("Invalid queue job response") from None
