import asyncio
import json
import unittest
from concurrent.futures import ThreadPoolExecutor
from io import BytesIO
from struct import pack
from threading import Event
from unittest.mock import patch
from uuid import uuid4
from zipfile import ZipFile
from zlib import compress, crc32

from fastapi.testclient import TestClient

from pyworker.config import Settings
from pyworker.eden import EdenFailure, EdenSettings
from pyworker.forms import MAX_BODY, MAX_FILE, PROCESS_PATH, UPLOAD_PATH
from pyworker.main import create_app


def png_fixture():
    def chunk(kind, data):
        return pack(">I", len(data)) + kind + data + pack(">I", crc32(kind + data))

    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", pack(">IIBBBBB", 1, 1, 8, 0, 0, 0, 0))
        + chunk(b"IDAT", compress(b"\x00\xff"))
        + chunk(b"IEND", b"")
    )


def pdf_fixture(size: int) -> bytes:
    header = b"%PDF-1.7\n"
    xref = b"xref\n0 1\n0000000000 65535 f \ntrailer\n<< /Size 1 >>\n"
    trailer = b"startxref\n0000000000\n%%EOF\n"
    offset = size - len(xref) - len(trailer)
    return (
        header
        + b"\n" * (offset - len(header))
        + xref
        + trailer.replace(b"0000000000", f"{offset:010d}".encode())
    )


class IntakeTests(unittest.TestCase):
    def setUp(self):
        token = "fixture-" + "a" * 40
        self.headers = {"Authorization": f"Bearer {token}"}
        self.client = self.enterContext(TestClient(create_app(Settings(token=token))))

    def post(self, files):
        return self.client.post(UPLOAD_PATH, files=files, headers=self.headers)

    def test_valid_formats_and_size_boundary_stay_in_memory(self):
        cases = [
            ("x.PNG", png_fixture(), "image/png"),
            ("x.pdf", pdf_fixture(MAX_FILE), "application/pdf"),
        ]
        with patch("tempfile.SpooledTemporaryFile.rollover", side_effect=AssertionError("disk")):
            for name, data, mime in cases:
                response = self.post({"file": (name, data, mime)})
                self.assertEqual(response.status_code, 200)
                self.assertEqual(
                    response.json(),
                    {"status": "validated", "media_type": mime, "size_bytes": len(data)},
                )
                self.assertIn("X-Request-ID", response.headers)
            self.assertEqual(
                self.post({"file": ("x.pdf", cases[-1][1] + b"x", "application/pdf")}).status_code,
                413,
            )
            self.assertEqual(
                self.post({"file": ("x.pdf", b"x" * MAX_BODY, "application/pdf")}).status_code, 413
            )

    def test_invalid_inputs_and_auth(self):
        valid = ("file", ("x.pdf", b"%PDF-1.4", "application/pdf"))
        self.assertEqual(self.client.post(UPLOAD_PATH, files=[valid]).status_code, 401)
        self.assertEqual(
            self.client.post(
                UPLOAD_PATH, headers={"Authorization": "Bearer wrong"}, files=[valid]
            ).status_code,
            401,
        )
        self.assertEqual(
            self.client.post(UPLOAD_PATH, headers=self.headers, json={}).status_code, 415
        )
        for parts, status in [
            ([valid, valid], 422),
            ([valid, ("extra", (None, "x"))], 422),
            ([("other", valid[1])], 422),
            ([("file", ("x.pdf", b"", "application/pdf"))], 422),
            ([("file", ("../x.pdf", b"%PDF-", "application/pdf"))], 422),
            ([("file", ("x.pdf", b"not PDF", "application/pdf"))], 415),
            ([("file", ("x.pdf", b"%PDF-", "image/png"))], 415),
        ]:
            with self.subTest(parts=parts):
                self.assertEqual(self.post(parts).status_code, status)

    def test_processing_checks_payment_then_sender_then_content(self):
        form_id = str(uuid4())
        metadata = {
            "paid": True,
            "form_id": form_id,
            "sender": {"uuid": str(uuid4()), "name": "Test User", "email": "user@example.test"},
            "uploaded_at": "2026-11-21T12:00:00Z",
            "submitted_at": "2026-11-21T12:01:00Z",
        }

        def process(values, content, headers=None, *, name="form.png", mime="image/png"):
            return self.client.post(
                PROCESS_PATH,
                files={"file": (name, content, mime)},
                data={"metadata": json.dumps(values)},
                headers=self.headers if headers is None else headers,
            )

        self.assertEqual(process(metadata, b"wrong", {}).status_code, 401)
        for values, status, error in [
            ({**metadata, "paid": False, "sender": None}, 402, "payment_required"),
            ({**metadata, "paid": "true"}, 422, "invalid_metadata"),
            ({**metadata, "sender": None}, 422, "invalid_sender"),
            (metadata, 415, "format_mismatch"),
        ]:
            response = process(values, b"%PDF-")
            self.assertEqual(response.status_code, status)
            self.assertEqual(response.json()["detail"], error)
        fake_docx = BytesIO()
        with ZipFile(fake_docx, "w") as archive:
            archive.writestr("[Content_Types].xml", "<Types/>")
            archive.writestr("word/document.xml", "<workbook/>")
        for name, mime, contents in [
            ("truncated.pdf", "application/pdf", b"%PDF-1.7\n"),
            ("renamed.pdf", "application/pdf", png_fixture()),
            ("truncated.png", "image/png", png_fixture()[:-12]),
            ("truncated.jpeg", "image/jpeg", b"\xff\xd8\xff\xd9"),
            ("fake.docx", "application/octet-stream", fake_docx.getvalue()),
            ("renamed.doc", "application/msword", fake_docx.getvalue()),
        ]:
            with self.subTest(name=name):
                validation = self.post({"file": (name, contents, mime)})
                self.assertEqual(validation.status_code, 415)
                self.assertEqual(validation.json()["detail"], "format_mismatch")
                response = process(metadata, contents, name=name, mime=mime)
                self.assertEqual(response.status_code, 415)
                self.assertEqual(response.json()["detail"], "format_mismatch")
        response = process(metadata, png_fixture())
        self.assertEqual(response.status_code, 200)
        result = response.json()
        self.assertEqual(result["form_id"], form_id)
        self.assertEqual(result["mode"], "bypass")
        self.assertEqual(result["ocr"], "bypassed")
        self.assertEqual(result["llm"], "bypassed")
        self.assertEqual(result["draft"], {"title": None, "tabs": [], "flow": {"links": []}})
        self.assertNotIn(metadata["sender"]["email"], response.text)

    def test_progress_is_bound_to_the_active_sender_and_has_safe_timeout_details(self):
        token = "fixture-" + "a" * 40
        worker = self.enterContext(
            TestClient(
                create_app(
                    Settings(
                        token=token,
                        eden=EdenSettings(api_key="fixture-key", timeout_seconds=15),
                    )
                )
            )
        )
        ready, finish = Event(), Event()
        operation, form_id, sender = map(str, (uuid4(), uuid4(), uuid4()))
        progress = {"operation_id": operation, "form_id": form_id, "sender_id": sender}
        metadata = {
            "paid": True,
            "form_id": form_id,
            "sender": {"uuid": sender, "name": "Fixture", "email": "user@example.test"},
            "uploaded_at": "2026-11-21T12:00:00Z",
            "submitted_at": "2026-11-21T12:01:00Z",
        }

        async def timed_out(_settings, _file, _mime, report, *, coi_form_id):
            report("llm")
            ready.set()
            await asyncio.to_thread(finish.wait, 4)
            failure = EdenFailure("eden_timeout", 504, reason="deadline")
            failure.phase = "llm"
            raise failure

        with patch("pyworker.forms.convert_document", timed_out), ThreadPoolExecutor() as threads:
            result = threads.submit(
                worker.post,
                PROCESS_PATH,
                headers=self.headers,
                params={"operation_id": operation},
                files={"file": ("blank form.txt", b"test document", "text/plain")},
                data={"metadata": json.dumps(metadata)},
            )
            try:
                self.assertTrue(ready.wait(4))
                self.assertEqual(worker.get(PROCESS_PATH, params=progress).status_code, 401)
                self.assertEqual(
                    worker.get(
                        PROCESS_PATH,
                        params={**progress, "sender_id": str(uuid4())},
                        headers=self.headers,
                    ).status_code,
                    404,
                )
                current = worker.get(PROCESS_PATH, params=progress, headers=self.headers).json()
                self.assertEqual(current["stage"], "llm")
                self.assertIsNone(current["remaining_ms"])
                self.assertGreater(current["timeout_remaining_ms"], 0)
            finally:
                finish.set()
            response = result.result(timeout=4)
        self.assertEqual(response.status_code, 504)
        self.assertEqual(response.json(), {"detail": "eden_timeout"})
        self.assertEqual(response.headers["x-form-failure-reason"], "deadline")
        self.assertEqual(response.headers["x-form-failure-phase"], "llm")
        self.assertEqual(response.headers["x-form-timeout-seconds"], "15")
        self.assertEqual(
            worker.get(PROCESS_PATH, params=progress, headers=self.headers).status_code, 404
        )
