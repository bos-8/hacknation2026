import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

from pyworker.config import Settings
from pyworker.forms import MAX_BODY, MAX_FILE, UPLOAD_PATH
from pyworker.main import create_app


class IntakeTests(unittest.TestCase):
    def setUp(self):
        token = "fixture-" + "a" * 40
        self.headers = {"Authorization": f"Bearer {token}"}
        self.client = self.enterContext(TestClient(create_app(Settings(token=token))))

    def post(self, files):
        return self.client.post(UPLOAD_PATH, files=files, headers=self.headers)

    def test_valid_formats_and_size_boundary_stay_in_memory(self):
        cases = [
            ("x.JPG", b"\xff\xd8\xff", "image/jpeg"),
            ("x.png", b"\x89PNG\r\n\x1a\n", "image/png"),
            ("x.pdf", b"%PDF-" + b"x" * (MAX_FILE - 5), "application/pdf"),
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
