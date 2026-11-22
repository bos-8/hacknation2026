"""Time-bound admission hook. Documents and identity data are never logged."""

import os
from datetime import UTC, datetime


def lambda_handler(event, context):
    try:
        expiry = datetime.fromisoformat(os.environ["EXPIRES_AT"])
        permitted = (
            expiry.tzinfo is not None
            and datetime.now(UTC) < expiry
            and event.get("harnessArn") == os.environ["HARNESS_ARN"]
            and event.get("event") == "before_invocation"
        )
    except (KeyError, ValueError, TypeError):
        permitted = False
    return {
        "decision": "allow" if permitted else "deny",
        "reason": "Admission window open."
        if permitted
        else "Harness admission window closed.",
    }
