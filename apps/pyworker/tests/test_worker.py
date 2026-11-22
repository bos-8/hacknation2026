import asyncio
import unittest
from unittest.mock import patch
from uuid import uuid4

from fastapi.testclient import TestClient

from pyworker.config import Settings
from pyworker.main import create_app

TOKEN = "test-token-" + "a" * 48
HEADERS = {"Authorization": f"Bearer {TOKEN}"}


class WorkerTests(unittest.TestCase):
    def test_web_credential_can_validate_but_cannot_run_queue_tasks(self):
        forms_token = "test-forms-" + "f" * 48
        with TestClient(create_app(Settings(token=TOKEN, forms_token=forms_token)),
                        headers={"Authorization": f"Bearer {forms_token}"}) as client:
            self.assertEqual(client.post("/v1/forms/validate", json={}).status_code, 415)
            self.assertEqual(client.post("/v1/forms/process", json={}).status_code, 401)
            self.assertEqual(client.post("/v1/tasks/check", json=self.task).status_code, 401)

    def setUp(self):
        self.app = create_app(Settings(token=TOKEN, concurrency=1, task_timeout=1))
        self.task = {"job_id": str(uuid4()), "attempt": 0}

    def test_lifecycle_health_and_no_secrets(self):
        client = TestClient(self.app)
        self.assertEqual(client.get("/health/live").status_code, 200)
        self.assertEqual(client.get("/health/ready").status_code, 503)
        with client:
            for endpoint in ["/health", "/health/live", "/health/ready"]:
                response = client.get(endpoint)
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.json()["status"], "ok")
                self.assertEqual(response.headers["cache-control"], "no-store")
                self.assertNotIn(TOKEN, response.text)
        self.assertFalse(self.app.state.ready)

    def test_swagger_lists_current_routes_and_bearer_auth(self):
        with TestClient(self.app) as client:
            self.assertIn("SwaggerUIBundle", client.get("/docs").text)
            schema = client.get("/openapi.json").json()
            self.assertEqual(
                set(schema["paths"]),
                {
                    "/health",
                    "/health/live",
                    "/health/ready",
                    "/v1/tasks/check",
                    "/v1/forms/validate",
                    "/v1/forms/fields/validate",
                    "/v1/forms/answers/validate",
                    "/v1/forms/addresses/choices",
                    "/v1/forms/profiles",
                    "/v1/forms/profiles/evaluate",
                    "/v1/forms/profiles/review",
                    "/v1/forms/process",
                    "/v1/forms/schemas/v1",
                    "/v1/forms/schemas/v1/catalog",
                },
            )
            self.assertEqual(
                schema["paths"]["/v1/tasks/check"]["post"]["security"], [{"HTTPBearer": []}]
            )
            self.assertNotIn(TOKEN, str(schema))

    def test_authenticated_idempotent_diagnostic(self):
        with TestClient(self.app) as client:
            self.assertEqual(client.post("/v1/tasks/check", json=self.task).status_code, 401)
            self.assertEqual(
                client.post(
                    "/v1/tasks/check", json=self.task, headers={"Authorization": "Bearer wrong"}
                ).status_code,
                401,
            )
            first = client.post("/v1/tasks/check", json=self.task, headers=HEADERS)
            second = client.post("/v1/tasks/check", json=self.task, headers=HEADERS)
            self.assertEqual(first.status_code, 200)
            self.assertEqual(first.json(), second.json())
            self.assertEqual(first.json()["executor"], "pyworker")
            self.assertEqual(first.json()["job_id"], self.task["job_id"])

    def test_validation_and_body_limit_do_not_echo_inputs(self):
        with TestClient(self.app) as client:
            for body in [
                {**self.task, "attempt": "0"},
                {**self.task, "attempt": True},
                {**self.task, "attempt": -1},
                {**self.task, "job_id": "invalid"},
                {**self.task, "command": "secret input"},
            ]:
                response = client.post("/v1/tasks/check", json=body, headers=HEADERS)
                self.assertEqual(response.status_code, 422)
                self.assertEqual(response.json(), {"error": "invalid_request"})
            response = client.post(
                "/v1/tasks/check",
                content=b"x" * 9000,
                headers={**HEADERS, "Content-Type": "application/json"},
            )
            self.assertEqual(response.status_code, 413)
            self.assertEqual(
                client.post("/v1/tasks/check", content="text", headers=HEADERS).status_code, 415
            )
            self.assertEqual(
                client.post("/v1/tasks/unknown", json=self.task, headers=HEADERS).status_code, 404
            )

    def test_overload_rejects_without_hiding_health(self):
        with TestClient(self.app) as client:
            client.portal.call(self.app.state.slots.acquire)
            try:
                self.assertEqual(
                    client.post("/v1/tasks/check", json=self.task, headers=HEADERS).status_code, 503
                )
                self.assertEqual(client.get("/health/ready").status_code, 200)
            finally:
                client.portal.call(self.app.state.slots.release)
            self.assertEqual(
                client.post("/v1/tasks/check", json=self.task, headers=HEADERS).status_code, 200
            )

    def test_timeout_and_handler_failure_recover(self):
        async def slow(_task):
            await asyncio.sleep(10)

        async def failure(_task):
            raise RuntimeError("private exception details")

        with TestClient(self.app) as client:
            with patch("pyworker.main.run_check", slow):
                self.assertEqual(
                    client.post("/v1/tasks/check", json=self.task, headers=HEADERS).status_code, 504
                )
            with patch("pyworker.main.run_check", failure):
                response = client.post("/v1/tasks/check", json=self.task, headers=HEADERS)
                self.assertEqual(response.status_code, 500)
                self.assertNotIn("private", response.text)
            self.assertEqual(
                client.post("/v1/tasks/check", json=self.task, headers=HEADERS).status_code, 200
            )

    def test_configuration_errors_do_not_disclose_values(self):
        settings = Settings.from_environment({"PYWORKER_API_TOKEN": TOKEN})
        self.assertNotIn(TOKEN, repr(settings))
        for field, value in [
            ("PYWORKER_API_TOKEN", "private"),
            ("PYWORKER_PORT", "0"),
            ("PYWORKER_HOST", "0.0.0.0"),
            ("PYWORKER_MAX_CONCURRENCY", "999"),
            ("PYWORKER_TASK_TIMEOUT_SECONDS", "99"),
        ]:
            with self.assertRaises(ValueError) as error:
                Settings.from_environment({"PYWORKER_API_TOKEN": TOKEN, field: value})
            self.assertIn(field, str(error.exception))

    def test_direct_configuration_also_enforces_invariants(self):
        for overrides in [
            {"token": "short"},
            {"token": "a" * 513},
            {"token": "a" * 32 + ":"},
            {"concurrency": True},
            {"task_timeout": 0},
            {"port": 65536},
            {"host": "0.0.0.0"},
            {"log_level": "invalid"},
        ]:
            with self.subTest(overrides=overrides), self.assertRaises(ValueError):
                Settings(**{"token": TOKEN, **overrides})
        with self.assertRaisesRegex(ValueError, "Invalid PYWORKER_PORT"):
            Settings.from_environment({"PYWORKER_API_TOKEN": TOKEN, "PYWORKER_PORT": "9" * 5000})

    def test_container_network_binding_requires_explicit_opt_in(self):
        settings = Settings.from_environment(
            {
                "PYWORKER_API_TOKEN": TOKEN,
                "PYWORKER_HOST": "0.0.0.0",
                "PYWORKER_ALLOW_NETWORK_BIND": "true",
            }
        )
        self.assertEqual(settings.host, "0.0.0.0")
        self.assertTrue(settings.allow_network_bind)
        for value in ["false", "yes", "1", ""]:
            with self.assertRaises(ValueError):
                Settings.from_environment(
                    {
                        "PYWORKER_API_TOKEN": TOKEN,
                        "PYWORKER_HOST": "0.0.0.0",
                        "PYWORKER_ALLOW_NETWORK_BIND": value,
                    }
                )

    def test_handler_failure_logs_correlated_metadata_without_exception_text(self):
        async def failure(_task):
            raise RuntimeError("private SQL and credentials")

        with TestClient(self.app) as client:
            with (
                patch("pyworker.main.run_check", failure),
                self.assertLogs("pyworker", "ERROR") as logs,
            ):
                response = client.post("/v1/tasks/check", json=self.task, headers=HEADERS)
            self.assertEqual(response.status_code, 500)
            output = " ".join(logs.output)
            for value in [self.task["job_id"], response.headers["x-request-id"], "RuntimeError"]:
                self.assertIn(value, output)
            self.assertNotIn("private SQL", output)
            self.assertNotIn(TOKEN, output)
            self.assertEqual(response.json()["request_id"], response.headers["x-request-id"])


if __name__ == "__main__":
    unittest.main()
