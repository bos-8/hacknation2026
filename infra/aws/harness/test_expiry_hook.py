import os
import unittest
from datetime import UTC, datetime, timedelta
from unittest.mock import patch

from expiry_hook import lambda_handler


class ExpiryTests(unittest.TestCase):
    def test_boundary_before_and_at_expiry(self):
        deadline = datetime(2026, 11, 22, 19, 9, 47, tzinfo=UTC)
        env = {"EXPIRES_AT": deadline.isoformat(), "HARNESS_ARN": "test-harness"}
        event = {"harnessArn": "test-harness", "event": "before_invocation"}
        for offset, decision in ((-1, "allow"), (0, "deny"), (1, "deny")):
            with patch.dict(os.environ, env), patch("expiry_hook.datetime") as clock:
                clock.fromisoformat.side_effect = datetime.fromisoformat
                clock.now.return_value = deadline + timedelta(seconds=offset)
                self.assertEqual(lambda_handler(event, None)["decision"], decision)

    def test_missing_configuration_denies(self):
        with patch.dict(os.environ, {}, clear=True):
            self.assertEqual(lambda_handler({}, None)["decision"], "deny")
