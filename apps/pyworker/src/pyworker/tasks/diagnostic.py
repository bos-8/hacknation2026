"""Pure diagnostic: retries have no external side effects."""

import hashlib

from pyworker.contracts import CheckRequest, CheckResponse


async def run_check(task: CheckRequest) -> CheckResponse:
    digest = hashlib.sha256(f"{task.job_id}:{task.attempt}".encode("ascii")).hexdigest()
    return CheckResponse(job_id=task.job_id, attempt=task.attempt, checksum=digest)
