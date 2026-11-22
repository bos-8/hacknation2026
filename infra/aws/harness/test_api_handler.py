"""Tests for admission checks that run before any AWS model invocation."""

import importlib.util
import json
import os
import unittest
from pathlib import Path
from unittest.mock import patch


spec = importlib.util.spec_from_file_location("harness_api", Path(__file__).with_name("api_handler.py"))
api = importlib.util.module_from_spec(spec)
spec.loader.exec_module(api)


class ApiAdmissionTests(unittest.TestCase):
    def test_missing_and_wrong_key_never_invoke_aws(self):
        for headers in ({}, {"authorization": "Bearer wrong"}):
            with patch.dict(os.environ, {"API_KEY": "fixture-key"}), patch.object(api.boto3, "client") as aws:
                self.assertEqual(api.lambda_handler({"headers": headers}, None)["statusCode"], 401)
                aws.assert_not_called()

    def test_expired_window_denies_before_aws(self):
        with patch.dict(os.environ, {"API_KEY": "fixture-key", "EXPIRES_AT": "2020-01-01T00:00:00Z"}), patch.object(api.boto3, "client") as aws:
            result = api.lambda_handler({"headers":{"authorization":"Bearer fixture-key"}}, None)
            self.assertEqual(result["statusCode"], 403)
            aws.assert_not_called()

    def test_oversized_payload_denied_before_aws(self):
        with patch.dict(os.environ, {"API_KEY": "fixture-key", "EXPIRES_AT": "2099-01-01T00:00:00Z"}), patch.object(api.boto3, "client") as aws:
            result = api.lambda_handler({
                "headers":{"authorization":"Bearer fixture-key"},
                "requestContext":{"http":{"method":"POST"}}, "body": "x" * 5_000_001,
            }, None)
            self.assertEqual(result["statusCode"], 413)
            aws.assert_not_called()
