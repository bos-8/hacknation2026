import unittest

from pyworker.agentcore import read_design
from pyworker.conversion_errors import EdenFailure


class HarnessStreamTests(unittest.TestCase):
    def test_design_from_complete_stream(self):
        events = [
            {"contentBlockDelta": {"delta": {"text": '```json\n{"title":"Dane",'}}},
            {"contentBlockDelta": {"delta": {"text": '"sections":[],"notes":[]}\n```'}}},
            {"messageStop": {"stopReason": "end_turn"}},
        ]
        self.assertEqual(read_design(events).title, "Dane")

    def test_partial_and_failed_streams(self):
        for events in ([], [{"messageStop": {"stopReason": "max_iterations_exceeded"}}],
                       [{"runtimeClientError": {"message": "private detail"}}],
                       [{"messageStop": {"stopReason": "end_turn"}}]):
            with self.subTest(events=events), self.assertRaises(EdenFailure):
                read_design(events)


class HarnessExpiryTests(unittest.TestCase):
    def test_closed_window_never_creates_aws_session(self):
        from unittest.mock import patch
        from pyworker.agentcore import design_page
        from pyworker.eden import EdenSettings
        from pyworker.vision import VisualPage

        for expiry in ("", "invalid", "2020-01-01T00:00:00", "2020-01-01T00:00:00Z"):
            with self.subTest(expiry=expiry), patch("pyworker.agentcore.httpx2.post") as aws:
                with self.assertRaises(EdenFailure) as failure:
                    design_page(EdenSettings(api_key="", harness_expires_at=expiry),
                                VisualPage(notes=[], fields=[]), "")
                self.assertEqual(failure.exception.stage, "agentcore_expired")
                aws.assert_not_called()

    def test_aws_stopped_hook_is_an_expiry_error(self):
        with self.assertRaises(EdenFailure) as failure:
            read_design([{"messageStop": {"stopReason": "hook_stopped"}}])
        self.assertEqual(failure.exception.stage, "agentcore_expired")


class HarnessHttpsTests(unittest.TestCase):
    def test_valid_design_uses_https_without_aws_profile(self):
        import json
        import httpx2
        from unittest.mock import patch
        from pyworker.agentcore import design_page
        from pyworker.eden import EdenSettings
        from pyworker.vision import VisualPage

        events = [
            {"contentBlockDelta": {"delta": {"text": json.dumps({
                "title": "Wniosek", "sections": [], "notes": ["Instrukcja."]
            })}}},
            {"messageStop": {"stopReason": "end_turn"}},
        ]
        response = httpx2.Response(200, json={"events": events},
                                   request=httpx2.Request("POST","https://api.example.test"))
        settings = EdenSettings(api_key="", harness_api_url="https://api.example.test",
                                harness_api_key="fixture-" + "x" * 40,
                                harness_expires_at="2099-01-01T00:00:00Z")
        with patch("pyworker.agentcore.httpx2.post", return_value=response) as http:
            page, _ = design_page(settings, VisualPage(notes=[], fields=[]), "Instrukcja.")
        self.assertEqual(page.title, "Wniosek")
        self.assertEqual(http.call_args.args[0], settings.harness_api_url)
        self.assertEqual(http.call_args.kwargs["headers"]["Authorization"],
                         "Bearer " + settings.harness_api_key)
