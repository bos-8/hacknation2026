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
