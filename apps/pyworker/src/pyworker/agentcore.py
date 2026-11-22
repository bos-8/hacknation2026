"""Design one form page with the configured AgentCore Harness; coordinates stay local."""

import logging
import re
from datetime import UTC, datetime

import httpx2
from pydantic import BaseModel, Field, StrictInt, ValidationError

from pyworker.conversion_errors import EdenFailure


class PageSection(BaseModel, extra="forbid"):
    title: str = Field(min_length=1, max_length=255)
    fields: list[StrictInt] = Field(max_length=400)


class PageDesign(BaseModel, extra="forbid"):
    title: str | None = Field(max_length=255)
    sections: list[PageSection] = Field(max_length=400)
    notes: list[str] = Field(max_length=100)


def ensure_available(settings):
    try:
        expiry = datetime.fromisoformat(settings.harness_expires_at)
        open_window = expiry.tzinfo is not None and datetime.now(UTC) < expiry
    except (ValueError, TypeError):
        open_window = False
    if not open_window:
        raise EdenFailure("agentcore_expired", 503)


def design_page(settings, page, native):
    ensure_available(settings)
    source = {"text": native, "observations": page.model_dump(exclude_none=True)}
    try:
        response = httpx2.post(
            settings.harness_api_url,
            headers={"Authorization": "Bearer " + settings.harness_api_key},
            json=source, timeout=settings.timeout_seconds, follow_redirects=False,
        )
        if response.status_code == 403:
            raise EdenFailure("agentcore_expired", 503)
        response.raise_for_status()
        if len(response.content) > 700_000:
            raise EdenFailure("agentcore_invalid_json", reason="response_too_large")
        design = read_design(response.json()["events"])
    except (httpx2.HTTPError, ValueError, KeyError, TypeError) as error:
        raise EdenFailure("agentcore_failed", 502) from error

    assigned = set()
    for section in design.sections:
        for index in section.fields:
            if index not in range(len(page.fields)) or index in assigned:
                continue
            assigned.add(index)
            page.fields[index].section = section.title
    page.title = page.title or design.title
    text = " ".join((" ".join(page.notes) + " " + native).split())
    for note in design.notes:
        if note.strip() and " ".join(note.split()) in text and note not in page.notes:
            page.notes.append(note)
    return page, native


def read_design(events):
    parts = []
    size = 0
    stop = None
    for event in events:
        if any(key.endswith(("Error", "Exception")) for key in event):
            raise EdenFailure("agentcore_failed", 502)
        if "contentBlockDelta" in event:
            chunk = event["contentBlockDelta"]["delta"].get("text", "")
            size += len(chunk)
            if size > 500_000:
                raise EdenFailure("agentcore_invalid_json", reason="response_too_large")
            parts.append(chunk)
        if "messageStop" in event:
            stop = event["messageStop"]["stopReason"]
    if stop == "hook_stopped":
        raise EdenFailure("agentcore_expired", 503)
    if stop != "end_turn":
        raise EdenFailure(
            "agentcore_failed",
            reason="output_limit" if stop == "max_tokens" else "invalid_response",
        )
    try:
        content = "".join(parts).strip()
        fenced = re.fullmatch(r"```(?:json)?\s*(.*?)\s*```", content, re.DOTALL | re.IGNORECASE)
        return PageDesign.model_validate_json(fenced[1] if fenced else content)
    except ValidationError as error:
        logging.getLogger(__name__).warning(
            "event=harness_invalid_design types=%s",
            [e["type"] for e in error.errors(include_input=False)][:6],
        )
        raise EdenFailure("agentcore_invalid_json", reason="invalid_response") from error
