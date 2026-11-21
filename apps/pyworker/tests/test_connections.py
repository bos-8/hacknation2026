import asyncio
import json
import socket
import time
import unittest
from contextlib import asynccontextmanager
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import httpx2
import psycopg
from psycopg_pool import PoolTimeout

from pyworker.connections.postgresql import DatabaseSettings, DatabaseUnavailable, PostgreSQL
from pyworker.connections.queue import QueueClient, QueueSettings, QueueUnavailable

TOKEN = "fixture-" + "a" * 40
URL = "postgresql://fixture:private@127.0.0.1:5432/disposable"


class ConnectionSettingsTests(unittest.TestCase):
    def test_real_pool_startup_failure_is_bounded_and_logs_are_redacted(self):
        async def check(port):
            settings = DatabaseSettings(
                f"postgresql://fixture:private-fixture-password@127.0.0.1:{port}/disposable",
                max_connections=1,
                timeout_seconds=1,
            )
            helper = PostgreSQL(settings)
            started = time.monotonic()
            with self.assertLogs("psycopg.pool", "WARNING") as logs:
                with self.assertRaises(DatabaseUnavailable) as error:
                    async with helper:
                        self.fail("Reserved non-listening port must not connect")
            self.assertLess(time.monotonic() - started, 4)
            self.assertNotIn("private-fixture", str(error.exception) + " ".join(logs.output))
            self.assertTrue(helper._pool.closed)

        # Reserve a port without listening; no real service or credentials are used.
        with socket.socket() as reserved:
            reserved.bind(("127.0.0.1", 0))
            asyncio.run(check(reserved.getsockname()[1]), loop_factory=asyncio.SelectorEventLoop)

    def test_postgresql_rejects_unsafe_targets_and_hidden_options(self):
        self.assertNotIn("private", repr(DatabaseSettings(URL)))
        for url in [
            "",
            "mysql://user:private@127.0.0.1/db",
            "postgresql://user:private@/db",
            URL + "?schema=public",
            URL + "?options=-c%20statement_timeout=0",
            URL + "?host=external",
            "postgresql://user:private@example.test/db",
        ]:
            with self.subTest(url=url), self.assertRaises(ValueError) as error:
                DatabaseSettings(url)
            self.assertNotIn("private", str(error.exception))
        DatabaseSettings("postgresql://user:private@example.test/db?sslmode=verify-full")
        with self.assertRaises(ValueError):
            DatabaseSettings(URL, max_connections=True)

    def test_queue_rejects_published_template_secret(self):
        with self.assertRaises(ValueError):
            QueueSettings("http://127.0.0.1:8011", "demosecret" * 4)

    def test_no_fallback_to_application_or_queue_database_credentials(self):
        with self.assertRaises(ValueError):
            DatabaseSettings.from_environment({"DATABASE_URL": URL, "QUEUE_DATABASE_URL": URL})
        self.assertEqual(DatabaseSettings.from_environment({"PYWORKER_DATABASE_URL": URL}).url, URL)

    def test_queue_rejects_unsafe_urls_and_tokens(self):
        for url in [
            "",
            "http://example.test",
            "http://private@127.0.0.1",
            "http://127.0.0.1/path",
            "http://127.0.0.1?token=private",
            "http://127.0.0.1:99999",
        ]:
            with self.subTest(url=url), self.assertRaises(ValueError):
                QueueSettings(url, TOKEN)
        self.assertNotIn(TOKEN, repr(QueueSettings("http://127.0.0.1:8011", TOKEN)))


class QueueClientTests(unittest.IsolatedAsyncioTestCase):
    async def test_submission_and_status_contract(self):
        job_id = uuid4()
        calls = []

        async def handler(request):
            calls.append(request)
            self.assertEqual(request.headers["authorization"], "Bearer " + TOKEN)
            if request.method == "POST":
                self.assertEqual(json.loads(request.content), {"executor": "python", "failures": 0})
                return httpx2.Response(201, json={"id": str(job_id)})
            return httpx2.Response(
                200,
                json={"id": str(job_id), "state": "completed", "executor": "python", "attempt": 1},
            )

        async with QueueClient(
            QueueSettings("http://127.0.0.1:8011", TOKEN), transport=httpx2.MockTransport(handler)
        ) as client:
            self.assertEqual(await client.enqueue_diagnostic(), job_id)
            self.assertEqual((await client.get_job(job_id)).state, "completed")
            with self.assertRaises(ValueError):
                await client.enqueue_diagnostic(failures=True)
        self.assertEqual(len(calls), 2)

    async def test_redirect_invalid_response_and_http_failure_are_not_retried(self):
        for status, content in [
            (302, b"private"),
            (503, b"private"),
            (200, b"x" * 9000),
            (200, b"[]"),
            (201, b'{"id":"invalid-private"}'),
        ]:
            calls = []

            def handler(request, calls=calls, status=status, content=content):
                calls.append(request)
                return httpx2.Response(
                    status, content=content, headers={"location": "http://external.test"}
                )

            async with QueueClient(
                QueueSettings("http://127.0.0.1:8011", TOKEN),
                transport=httpx2.MockTransport(handler),
            ) as client:
                with self.assertRaises(QueueUnavailable) as error:
                    await client.enqueue_diagnostic()
                self.assertNotIn("private", str(error.exception))
            self.assertEqual(len(calls), 1)

    async def test_mismatched_job_and_transport_errors_are_safe(self):
        for response in [
            httpx2.Response(
                200,
                json={"id": str(uuid4()), "state": "completed", "executor": "python", "attempt": 0},
            ),
            httpx2.ConnectError("private connection details"),
        ]:

            def handler(_request, response=response):
                if isinstance(response, Exception):
                    raise response
                return response

            async with QueueClient(
                QueueSettings("http://127.0.0.1:8011", TOKEN),
                transport=httpx2.MockTransport(handler),
            ) as client:
                with self.assertRaises(QueueUnavailable) as error:
                    await client.get_job(uuid4())
                self.assertNotIn("private", str(error.exception))


class PostgreSQLTests(unittest.IsolatedAsyncioTestCase):
    async def test_pool_bounds_transaction_release_and_safe_failure(self):
        events = []

        @asynccontextmanager
        async def connection(**_kwargs):
            events.append("acquire")
            try:
                yield "connection"
            finally:
                events.append("release")

        with patch("pyworker.connections.postgresql.AsyncConnectionPool") as factory:
            pool = factory.return_value
            pool.open = AsyncMock()
            pool.close = AsyncMock()
            pool.connection = connection
            helper = PostgreSQL(DatabaseSettings(URL))
            # No I/O during construction.
            pool.open.assert_not_called()
            self.assertEqual(factory.call_args.kwargs["max_waiting"], 2)
            self.assertFalse(factory.call_args.kwargs["open"])
            with patch("pyworker.connections.postgresql.sys.platform", "linux"):
                async with helper:
                    async with helper.transaction() as conn:
                        self.assertEqual(conn, "connection")
                    with self.assertRaises(DatabaseUnavailable) as error:
                        async with helper.transaction():
                            raise psycopg.OperationalError("private credentials")
                    self.assertNotIn("private", str(error.exception))
                    with self.assertRaises(asyncio.CancelledError):
                        async with helper.transaction():
                            raise asyncio.CancelledError
            self.assertEqual(events, ["acquire", "release"] * 3)
            pool.close.assert_awaited_once()
            with self.assertRaises(RuntimeError):
                async with helper.transaction():
                    pass

    async def test_failed_open_closes_pool_and_does_not_echo_driver_errors(self):
        with patch("pyworker.connections.postgresql.AsyncConnectionPool") as factory:
            pool = factory.return_value
            pool.open = AsyncMock(side_effect=PoolTimeout("private connection details"))
            pool.close = AsyncMock()
            with patch("pyworker.connections.postgresql.sys.platform", "linux"):
                with self.assertRaises(DatabaseUnavailable) as error:
                    async with PostgreSQL(DatabaseSettings(URL)):
                        self.fail("Pool must not open")
            self.assertNotIn("private", str(error.exception))
            pool.close.assert_awaited_once()
