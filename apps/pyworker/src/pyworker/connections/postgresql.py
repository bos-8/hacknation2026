"""Bounded PostgreSQL pool with explicit transaction ownership and safe errors."""

import asyncio
import logging
import os
import sys
from collections.abc import AsyncIterator, Mapping
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from urllib.parse import parse_qsl, urlsplit

import psycopg
from psycopg.conninfo import conninfo_to_dict
from psycopg_pool import AsyncConnectionPool, PoolTimeout

logger = logging.getLogger("pyworker")


class _SafePoolLog(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        # Pool internals log raw server exceptions/connection reprs by default.
        record.msg = "event=database_pool level=%s"
        record.args = (record.levelname,)
        record.exc_info = None
        record.exc_text = None
        return True


_pool_log_filter = _SafePoolLog()


class DatabaseUnavailable(RuntimeError):
    """A connection or transaction failed; the operation has not been retried."""


@dataclass(frozen=True, slots=True)
class DatabaseSettings:
    url: str = field(repr=False)
    max_connections: int = 2
    timeout_seconds: int = 5
    statement_timeout_ms: int = 5000

    def __post_init__(self) -> None:
        try:
            if (
                not isinstance(self.url, str)
                or len(self.url) > 4096
                or any(character.isspace() for character in self.url)
            ):
                raise ValueError
            parsed = urlsplit(self.url)
            # Driver options cannot override our bounds, redirect through a service
            # file, or inherit a different host from the process environment.
            query = dict(parse_qsl(parsed.query, strict_parsing=True))
            if (
                parsed.scheme not in {"postgres", "postgresql"}
                or not parsed.hostname
                or not parsed.path.strip("/")
                or not parsed.username
                or not parsed.password
                or parsed.fragment
                or (parsed.port is not None and not 1 <= parsed.port <= 65535)
                or set(query) - {"sslmode", "sslrootcert"}
            ):
                raise ValueError
            if (
                parsed.hostname not in {"127.0.0.1", "localhost", "::1"}
                and query.get("sslmode") != "verify-full"
            ):
                raise ValueError
            conninfo_to_dict(self.url)
        except (ValueError, TypeError, psycopg.Error):
            raise ValueError("Invalid PYWORKER_DATABASE_URL or TLS configuration") from None
        for value, minimum, maximum in [
            (self.max_connections, 1, 8),
            (self.timeout_seconds, 1, 15),
            (self.statement_timeout_ms, 100, 15000),
        ]:
            if type(value) is not int or not minimum <= value <= maximum:
                raise ValueError("Invalid PostgreSQL connection limits")

    @classmethod
    def from_environment(cls, env: Mapping[str, str] | None = None) -> "DatabaseSettings":
        values = os.environ if env is None else env
        return cls(url=values.get("PYWORKER_DATABASE_URL", ""))


class PostgreSQL:
    """Use once per process via async with; each transaction commits or rolls back.

    Pass SQL values as parameters to connection.execute(), never interpolate them.
    Write failures (including a lost commit response) must not be blindly retried.
    """

    def __init__(self, settings: DatabaseSettings) -> None:
        logging.getLogger("psycopg.pool").addFilter(_pool_log_filter)
        self._pool = AsyncConnectionPool(
            conninfo=settings.url,
            min_size=1,
            max_size=settings.max_connections,
            max_waiting=settings.max_connections,
            timeout=settings.timeout_seconds,
            reconnect_timeout=settings.timeout_seconds,
            open=False,
            name="pyworker-postgresql",
            check=AsyncConnectionPool.check_connection,
            kwargs={
                "connect_timeout": settings.timeout_seconds,
                "application_name": "formiq-pyworker",
                "options": (
                    f"-c statement_timeout={settings.statement_timeout_ms} "
                    f"-c lock_timeout={settings.statement_timeout_ms} "
                    f"-c idle_in_transaction_session_timeout={settings.statement_timeout_ms}"
                ),
            },
        )
        self._timeout = settings.timeout_seconds
        self._open = False
        self._entered = False

    async def __aenter__(self) -> "PostgreSQL":
        if self._entered:
            raise RuntimeError("PostgreSQL helper supports one lifecycle; create a new instance")
        self._entered = True
        if sys.platform == "win32" and isinstance(
            asyncio.get_running_loop(), asyncio.ProactorEventLoop
        ):
            raise RuntimeError("PostgreSQL async requires asyncio.SelectorEventLoop on Windows")
        try:
            await self._pool.open(wait=True, timeout=self._timeout)
        except BaseException as error:
            await self._pool.close()
            if isinstance(error, (psycopg.Error, PoolTimeout)):
                raise DatabaseUnavailable("PostgreSQL connection unavailable") from None
            raise
        self._open = True
        return self

    async def __aexit__(self, *_exc: object) -> None:
        self._open = False
        await self._pool.close()

    @asynccontextmanager
    async def transaction(self) -> AsyncIterator[psycopg.AsyncConnection]:
        """Release the connection on success, failure and cancellation."""
        if not self._open:
            raise RuntimeError("Open the PostgreSQL helper before use")
        try:
            async with self._pool.connection(timeout=self._timeout) as connection:
                yield connection
        except (psycopg.Error, PoolTimeout) as error:
            logger.error("event=database_failed error_type=%s", type(error).__name__)
            raise DatabaseUnavailable(
                "PostgreSQL transaction failed; outcome may be unknown"
            ) from None
