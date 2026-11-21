import json
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch
from uuid import uuid4

from fastapi.testclient import TestClient
from test_forms import png_fixture

from pyworker.coi import Block, ReadDocument
from pyworker.config import Settings
from pyworker.document_reader import normalized_box
from pyworker.main import create_app
from pyworker.pipeline import EXAMPLE, PipelineSettings


class PipelineTests(unittest.TestCase):
    def setUp(self):
        token = "fixture-" + "a" * 40
        prompt_dir = self.enterContext(TemporaryDirectory())
        self.prompt = Path(prompt_dir) / "system.txt"
        self.prompt.write_text(
            "Operator: rozpoznawaj pola i zachowaj polskie znaki.", encoding="utf-8"
        )
        self.settings = Settings.from_environment(
            {
                "PYWORKER_API_TOKEN": token,
                "PYWORKER_FORM_MODE": "pipeline",
                "PYWORKER_PIPELINE_TIMEOUT_SECONDS": "7",
                "PYWORKER_PIPELINE_PROMPT_FILE": str(self.prompt),
            }
        )
        self.client = self.enterContext(TestClient(create_app(self.settings)))
        self.headers = {"Authorization": f"Bearer {token}"}
        self.form_id = str(uuid4())
        self.meta = {
            "paid": True,
            "form_id": self.form_id,
            "sender": {"uuid": str(uuid4()), "name": "Test", "email": "test@example.test"},
            "uploaded_at": "2026-11-21T12:00:00Z",
            "submitted_at": "2026-11-21T12:01:00Z",
        }

    def submit(self, name, contents, content_type):
        return self.client.post(
            "/v1/forms/process",
            headers=self.headers,
            files={"file": (name, contents, content_type)},
            data={"metadata": json.dumps(self.meta)},
        )

    def test_image_returns_coi_and_uses_exact_ocr_regions(self):
        document = ReadDocument(
            ocr=True,
            blocks=[
                Block(
                    id=1,
                    page=1,
                    kind="text",
                    text="Imię *",
                    bbox=(0.1, 0.2, 0.3, 0.4),
                    ocr_confidence=0.87,
                ),
                Block(id=2, page=1, kind="input", text="", bbox=(0.3, 0.2, 0.9, 0.4)),
            ],
        )
        model = {
            "choices": [{"finish_reason": "stop", "message": {"content": json.dumps(EXAMPLE)}}]
        }
        with (
            patch("pyworker.pipeline.read_local_document", return_value=document) as reader,
            patch("pyworker.pipeline.request_json", return_value=model) as qwen,
        ):
            response = self.submit("Test formularza.png", png_fixture(), "image/png")
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(reader.call_args.args[2], ".png")
        self.assertEqual(qwen.call_args.args[1], self.settings.pipeline.qwen_url)
        request = qwen.call_args.kwargs["json"]
        self.assertEqual(request["messages"][0]["role"], "system")
        self.assertTrue(
            request["messages"][0]["content"].startswith(self.prompt.read_text(encoding="utf-8"))
        )
        self.assertEqual(request["messages"][-1]["role"], "user")
        self.assertEqual(request["response_format"]["type"], "json_schema")
        self.assertNotIn("test@example.test", json.dumps(request))
        self.assertEqual(json.loads(request["messages"][-1]["content"])["blocks"][1]["id"], 2)
        result = response.json()
        self.assertEqual(result["mode"], "pipeline")
        self.assertEqual(result["ocr"], "completed")
        self.assertEqual(result["schema_version"], 3)
        tab, finish = result["draft"]["tabs"]
        self.assertEqual(finish["type"], "FINISH")
        self.assertEqual(result["draft"]["flow"]["links"][0]["target"], finish["id"])
        section = tab["questions"][0]["field"]
        field = section["repeatingSectionGrid"][0]["field"]
        self.assertEqual(field["validation"], ["REQUIRED"])
        self.assertNotIn("confidence", field)
        self.assertEqual(
            result["field_confidences"],
            [
                {
                    "field_id": field["id"],
                    "confidence": 0.95,
                    "ocr_confidence": 0.87,
                }
            ],
        )
        self.assertEqual(
            result["field_locations"],
            [
                {
                    "field_id": field["id"],
                    "label": [{"page": 1, "bbox": [0.1, 0.2, 0.3, 0.4]}],
                    "input": [{"page": 1, "bbox": [0.3, 0.2, 0.9, 0.4]}],
                }
            ],
        )

    def test_text_submission_rejects_model_coordinates_with_no_source(self):
        model = {
            "choices": [{"finish_reason": "stop", "message": {"content": json.dumps(EXAMPLE)}}]
        }
        with patch("pyworker.pipeline.request_json", return_value=model):
            response = self.submit("Blank form.txt", b"Imie *", "text/plain")
        self.assertEqual(response.status_code, 502)
        self.assertEqual(response.json(), {"detail": "pipeline_invalid_json"})
        self.assertEqual(response.headers["x-form-failure-phase"], "validate_result")

    def test_unpaid_image_never_reaches_local_pipeline(self):
        self.meta["paid"] = False
        with patch("pyworker.forms.run_pipeline") as pipeline:
            response = self.submit("Test.png", png_fixture(), "image/png")
        self.assertEqual(response.status_code, 402)
        pipeline.assert_not_called()

    def test_text_includes_qwen_confidence_and_no_ocr_confidence(self):
        answer = json.loads(json.dumps(EXAMPLE))
        field = answer["tabs"][0]["sections"][0]["fields"][0]
        field["input_blocks"] = []
        model = {
            "choices": [
                {"finish_reason": "stop", "message": {"content": json.dumps(answer)}},
            ]
        }
        with patch("pyworker.pipeline.request_json", return_value=model):
            response = self.submit("Blank form.txt", b"Imie *", "text/plain")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["field_locations"], [])
        score = response.json()["field_confidences"][0]
        self.assertEqual(score["confidence"], 0.95)
        self.assertIsNone(score["ocr_confidence"])

    def test_normalization_preserves_source_origin(self):
        self.assertEqual(
            normalized_box([[20, 10], [55, 5], [60, 30]], 200, 100), (0.1, 0.05, 0.3, 0.3)
        )
        self.assertIsNone(normalized_box([0, 0, 0, 0], 200, 100))

    def test_local_pipeline_rejects_public_model_endpoint(self):
        with self.assertRaises(ValueError):
            PipelineSettings(qwen_url="https://example.com/v1/chat/completions")
