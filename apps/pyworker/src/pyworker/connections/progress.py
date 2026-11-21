"""Report bounded page progress through the queue worker that owns database writes."""

import os
from contextlib import contextmanager
from uuid import UUID

import httpx2

from .queue import QueueSettings


@contextmanager
def ocr_reporter(ticket: UUID):
    if os.environ.get("PYWORKER_PROGRESS_NETWORK") == "private":
        url = "http://queue:8011"
        token = os.environ["PYWORKER_API_TOKEN"]
    elif os.environ.get("PYWORKER_QUEUE_URL") or os.environ.get("PYWORKER_QUEUE_TOKEN"):
        settings = QueueSettings.from_environment()
        url, token = settings.url, settings.token
    else:
        url, token = "http://127.0.0.1:8011", os.environ["PYWORKER_API_TOKEN"]

    with httpx2.Client(
        base_url=url, headers={"Authorization": f"Bearer {token}"}, timeout=3, trust_env=False
    ) as client:

        def report(percent):
            response = client.post(
                f"/v1/queue/documents/{ticket}/progress", json={"percent": percent}
            )
            response.raise_for_status()

        yield report
