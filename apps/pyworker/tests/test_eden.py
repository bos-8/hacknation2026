import asyncio
import io
import json
import unittest
from functools import partial
from unittest.mock import patch
from uuid import UUID
from zipfile import ZipFile

import httpx2
from starlette.datastructures import UploadFile

from pyworker.config import Settings
from pyworker.eden import DOCX, EdenFailure, EdenSettings, convert_document, parse_draft

FILE_ID = "550e8400-e29b-41d4-a716-446655440000"
DRAFT = {
    "title": "Example",
    "tabs": [{"id": "main", "title": "Main", "fields": []}],
    "flow": {"links": []},
}


class EdenTests(unittest.IsolatedAsyncioTestCase):
    async def convert(self, mime, expected_paths, draft=DRAFT, finish="stop"):
        requests = []
        replies = iter(draft) if isinstance(draft, list) else None

        async def api(request):
            requests.append(request.url.path)
            self.assertEqual(request.headers["authorization"], "Bearer fixture-key")
            if request.url.path == "/v3/upload":
                self.assertIn(b"example input", await request.aread())
                return httpx2.Response(200, json={"file_id": FILE_ID})
            body = json.loads(request.content)
            self.assertEqual(body["model"], "qwen3.8-27b")
            if body["messages"][0]["role"] == "user":
                image = body["messages"][0]["content"][1]["image_url"]["url"]
                self.assertTrue(image.startswith("data:image/jpeg;base64,"))
                choice = {"finish_reason": "stop", "message": {"content": "example OCR text"}}
                return httpx2.Response(200, json={"choices": [choice]})
            self.assertEqual(body["max_tokens"], 24_576)
            self.assertEqual(body["reasoning_effort"], "none")
            self.assertEqual(body["routing"], {"sort": "latency"})
            self.assertNotIn("response_format", body)
            self.assertIn('"flow":{"links":[]}', body["messages"][0]["content"])
            content = body["messages"][-1]["content"]
            if mime.startswith("image/") or mime == "application/pdf":
                self.assertEqual(content, [{"type": "text", "text": "example OCR text"}])
            elif mime in {"text/plain", "application/msword"}:
                self.assertEqual(content, [{"type": "text", "text": "example input"}])
            else:
                self.assertEqual(content, [{"type": "file", "file": {"file_id": FILE_ID}}])
            response = draft if replies is None else next(replies)
            if not mime.startswith("image/") and requests.count("/v3/chat/completions") == 2:
                self.assertIn("first response was invalid", body["messages"][0]["content"])
            choice = {"finish_reason": finish, "message": {"content": json.dumps(response)}}
            return httpx2.Response(200, json={"choices": [choice]})

        client = partial(httpx2.AsyncClient, transport=httpx2.MockTransport(api))
        data = io.BytesIO(b"example input")
        if mime.startswith("image/"):
            from PIL import Image
            data = io.BytesIO()
            Image.new("RGB", (16, 16)).save(data, format="PNG")
            data.seek(0)
        source = UploadFile(data, filename="document")
        try:
            with patch("pyworker.eden.httpx2.AsyncClient", client):
                return await convert_document(EdenSettings(api_key="fixture-key"), source, mime)
        finally:
            await source.close()
            self.assertEqual(requests, expected_paths)

    async def test_image_transcription_and_structured_llm(self):
        draft, ocr = await self.convert(
            "image/png", ["/v3/chat/completions"] * 2
        )
        self.assertEqual(draft.model_dump(), DRAFT)
        self.assertTrue(ocr)

    async def test_text_skips_upload_and_ocr(self):
        draft, ocr = await self.convert("text/plain", ["/v3/chat/completions"])
        self.assertEqual(draft.model_dump(), DRAFT)
        self.assertFalse(ocr)

    async def test_invalid_model_result_does_not_pass(self):
        with self.assertRaisesRegex(EdenFailure, "eden_llm_invalid_json"):
            await self.convert("text/plain", ["/v3/chat/completions"] * 2, {"title": "wrong shape"})

    async def test_invalid_draft_is_regenerated_once(self):
        draft, _ = await self.convert(
            "text/plain", ["/v3/chat/completions"] * 2, [{"title": "wrong shape"}, DRAFT]
        )
        self.assertEqual(draft.model_dump(), DRAFT)

    async def test_output_limit_does_not_retry_the_same_budget(self):
        with self.assertRaises(EdenFailure) as caught:
            await self.convert("text/plain", ["/v3/chat/completions"], finish="length")
        self.assertEqual(caught.exception.reason, "output_limit")

    def test_unclosed_json_fails_even_when_model_reports_stop(self):
        result = {
            "choices": [{"finish_reason": "stop", "message": {"content": json.dumps(DRAFT)[:-1]}}]
        }
        with self.assertRaises(EdenFailure) as caught:
            parse_draft(result)
        self.assertEqual(caught.exception.reason, "invalid_response")

    async def test_ocr_only_builds_coi_from_text_without_any_http_request(self):
        source = UploadFile(
            io.BytesIO(
                "Wnioskodawca:\n...\n(Imię i nazwisko)\nAdresat:\nUrząd gminy\n"
                "## WNIOSEK O WYDANIE ZAŚWIADCZENIA\nMiejscowość ... przy ulicy ...\n"
                "# KLAUZULA INFORMACYJNA\nInformacja o przetwarzaniu <danych>.".encode()
            ),
            filename="example.txt",
        )

        def unexpected_request(request):
            self.fail(f"Unexpected outbound call: {request.url.path}")

        client = partial(httpx2.AsyncClient, transport=httpx2.MockTransport(unexpected_request))
        with patch("pyworker.eden.httpx2.AsyncClient", client):
            result, used_ocr = await convert_document(
                EdenSettings(api_key="", ocr_only=True),
                source,
                "text/plain",
                ocr_form_id=UUID(FILE_ID),
            )
        self.assertFalse(used_ocr)
        self.assertEqual(result.draft.tabs[-1].type, "FINISH")
        self.assertEqual(len(result.draft.flow.links), len(result.draft.tabs) - 1)
        self.assertEqual(result.field_confidences, [])
        fields = [
            item.field
            for tab in result.draft.tabs
            for question in tab.questions
            for item in question.field.repeatingSectionGrid
        ]
        self.assertIn("Imię i nazwisko", [field.title for field in fields])
        self.assertIn("Ulica", [field.title for field in fields])
        self.assertTrue(
            any(field.readOnly and field.defaultValue == "Urząd gminy" for field in fields)
        )
        self.assertTrue(any("&lt;danych&gt;" in field.description for field in fields))

    async def test_eden_observations_use_the_same_coi_fragments(self):
        observed = {
            "title": "Wniosek",
            "tabs": [
                {
                    "title": "Dane",
                    "sections": [
                        {
                            "title": "Dane",
                            "fields": [
                                {"label": "PESEL", "type": "TEXT_FIELD", "required": True},
                                {"label": "Wybór", "type": "SELECT", "options": ["A", "B"]},
                            ],
                        }
                    ],
                }
            ],
        }

        def api(request):
            body = json.loads(request.content)
            self.assertIn('"sections"', body["messages"][0]["content"])
            self.assertNotIn("response_format", body)
            return httpx2.Response(
                200,
                json={
                    "choices": [
                        {
                            "finish_reason": "stop",
                            "message": {"content": json.dumps(observed)},
                        }
                    ]
                },
            )

        client = partial(httpx2.AsyncClient, transport=httpx2.MockTransport(api))
        with patch("pyworker.eden.httpx2.AsyncClient", client):
            result, _ = await convert_document(
                EdenSettings(api_key="fixture-key"),
                UploadFile(io.BytesIO(b"fixture")),
                "text/plain",
                coi_form_id=UUID(FILE_ID),
            )
        fields = result.draft.tabs[0].questions[0].field.repeatingSectionGrid
        self.assertEqual(fields[0].field.validation, ["REQUIRED", "PESEL"])
        self.assertEqual(fields[1].field.defaultValue, [])

    async def test_missing_key_does_not_call_provider(self):
        source = UploadFile(io.BytesIO(b"test"), filename="example.txt")
        try:
            with self.assertRaisesRegex(EdenFailure, "eden_not_configured"):
                await convert_document(EdenSettings(api_key=""), source, "text/plain")
        finally:
            await source.close()

    async def test_timeout_from_env_stops_conversion(self):
        env = {
            "PYWORKER_API_TOKEN": "a" * 40,
            "PYWORKER_FORM_MODE": "eden",
            "EDENAI_API_KEY": "fixture-key",
            "EDENAI_TIMEOUT_SECONDS": "1",
        }
        settings = Settings.from_environment(env).eden
        self.assertEqual(settings.timeout_seconds, 1)
        for invalid in ("0", "301", "2.5"):
            with (
                self.subTest(invalid=invalid),
                self.assertRaisesRegex(ValueError, "EDENAI_TIMEOUT_SECONDS"),
            ):
                Settings.from_environment({**env, "EDENAI_TIMEOUT_SECONDS": invalid})

        async def slow_response(_request):
            await asyncio.sleep(10)
            self.fail("The total deadline did not cancel the provider call")

        client = partial(httpx2.AsyncClient, transport=httpx2.MockTransport(slow_response))
        source = UploadFile(io.BytesIO(b"test"), filename="example.txt")
        try:
            with (
                patch("pyworker.eden.httpx2.AsyncClient", client),
                self.assertRaisesRegex(EdenFailure, "eden_timeout") as failure,
            ):
                await convert_document(settings, source, "text/plain")
            self.assertEqual(failure.exception.status, 504)
        finally:
            await source.close()

    async def test_local_qwen_does_not_receive_the_eden_key(self):
        async def api(request):
            self.assertEqual(str(request.url), "http://127.0.0.1:8000/v1/chat/completions")
            self.assertNotIn("authorization", request.headers)
            body = json.loads(request.content)
            self.assertEqual(body["model"], "Qwen/Qwen3-4B-Instruct-2507")
            choice = {"finish_reason": "stop", "message": {"content": json.dumps(DRAFT)}}
            return httpx2.Response(200, json={"choices": [choice]})

        client = partial(httpx2.AsyncClient, transport=httpx2.MockTransport(api))
        source = UploadFile(io.BytesIO(b"example input"), filename="example.txt")
        settings = EdenSettings(
            api_key="fixture-eden-key", local_llm_url="http://127.0.0.1:8000/v1/chat/completions"
        )
        try:
            with patch("pyworker.eden.httpx2.AsyncClient", client):
                draft, used_ocr = await convert_document(settings, source, "text/plain")
            self.assertFalse(used_ocr)
            self.assertEqual(draft.model_dump(), DRAFT)
        finally:
            await source.close()

    async def test_doc_sends_only_extracted_text_to_chat(self):
        with patch("pyworker.eden.read_word_text", return_value="example input") as reader:
            draft, ocr = await self.convert("application/msword", ["/v3/chat/completions"])
        reader.assert_awaited_once_with(b"example input", "")
        self.assertEqual(draft.model_dump(), DRAFT)
        self.assertFalse(ocr)

    async def test_doc_compiles_coi_without_provider(self):
        source = UploadFile(io.BytesIO(b"binary word"), filename="Blankiet.DOC")
        with patch("pyworker.eden.read_word_text", return_value="WNIOSEK\nImię: ........\nNazwisko: ........"):
            _, ocr = await convert_document(
                EdenSettings(api_key=""), source, "application/msword", coi_form_id=UUID(FILE_ID)
            )
        self.assertFalse(ocr)

    async def test_doc_keeps_fields_after_page_breaks(self):
        source = UploadFile(io.BytesIO(b"binary word"), filename="Wniosek.doc")
        text = "WNIOSEK\nImię: Anna\f\fAdres: Kraków"
        with patch("pyworker.eden.read_word_text", return_value=text):
            result, _ = await convert_document(
                EdenSettings(api_key=""), source, "application/msword", coi_form_id=UUID(FILE_ID)
            )
        exported = result.model_dump_json()
        self.assertIn("Anna", exported)
        self.assertIn("Kraków", exported)
        self.assertTrue(any(entry.pages == [3] for entry in result.form_ir.evidence))

    async def test_docx_with_spaces_uses_text_input_and_never_uploads_to_eden(self):
        document = io.BytesIO()
        with ZipFile(document, "w") as archive:
            archive.writestr(
                "word/document.xml",
                """<w:document
                xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
                <w:body><w:p><w:r><w:t>Wniosek</w:t></w:r></w:p><w:tbl><w:tr>
                <w:tc><w:p><w:r><w:t>Imię</w:t></w:r></w:p></w:tc>
                <w:tc><w:p><w:r><w:t>Nazwisko</w:t></w:r></w:p></w:tc>
                </w:tr></w:tbl></w:body></w:document>""",
            )
        stages = []

        async def api(request):
            self.assertEqual(request.url.path, "/v3/chat/completions")
            content = json.loads(request.content)["messages"][-1]["content"]
            self.assertEqual(content, [{"type": "text", "text": "Wniosek\nImię | Nazwisko"}])
            return httpx2.Response(429, json={"error": {"message": "private detail"}})

        client = partial(httpx2.AsyncClient, transport=httpx2.MockTransport(api))
        source = UploadFile(document, filename="Wniosek o wydanie zaświadczenia.docx")
        try:
            with (
                patch("pyworker.eden.httpx2.AsyncClient", client),
                self.assertRaisesRegex(EdenFailure, "eden_llm_failed") as failure,
            ):
                await convert_document(
                    EdenSettings(api_key="fixture-key"), source, DOCX, stages.append
                )
            self.assertEqual(stages, ["extracting", "llm"])
            self.assertEqual(failure.exception.reason, "http_429")
            self.assertEqual(failure.exception.phase, "llm")
        finally:
            await source.close()

    async def test_pdf_transcribes_pages_in_order(self):
        transcriptions = iter(["Page one", "Page two"])

        async def api(request):
            self.assertEqual(request.url.path, "/v3/chat/completions")
            body = json.loads(request.content)
            content = body["messages"][-1]["content"]
            if body["messages"][0]["role"] == "user":
                text = next(transcriptions)
                self.assertEqual(content[1]["image_url"]["url"], "data:image/jpeg;base64," + text)
            else:
                self.assertEqual(content, [{"type": "text", "text": "Page one\nPage two"}])
                text = json.dumps(DRAFT)
            choice = {"finish_reason": "stop", "message": {"content": text}}
            return httpx2.Response(200, json={"choices": [choice]})

        client = partial(httpx2.AsyncClient, transport=httpx2.MockTransport(api))
        source = UploadFile(io.BytesIO(b"%PDF-1.4"), filename="A sample.pdf")
        try:
            with (
                patch("pyworker.eden.httpx2.AsyncClient", client),
                patch("pyworker.eden.render_pages", return_value=[
                    ("Page one", "", []), ("Page two", "", [])
                ]),
            ):
                draft, ocr = await convert_document(
                    EdenSettings(api_key="fixture-key"), source, "application/pdf"
                )
            self.assertEqual(draft.model_dump(), DRAFT)
            self.assertTrue(ocr)
        finally:
            await source.close()
