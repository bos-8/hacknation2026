"""Run only against the disposable database owned by the Node integration test."""

import asyncio
import re

from psycopg.conninfo import conninfo_to_dict

from pyworker.connections.postgresql import DatabaseSettings, DatabaseUnavailable, PostgreSQL


async def main() -> None:
    settings = DatabaseSettings.from_environment()
    database = conninfo_to_dict(settings.url)["dbname"]
    if not re.fullmatch(r"formiq_python_test_[a-f0-9]{16}", database):
        raise RuntimeError("A disposable Python integration database is required")
    settings = DatabaseSettings(settings.url, statement_timeout_ms=100)
    async with PostgreSQL(settings) as helper:
        async with helper.transaction() as connection:
            await connection.execute("CREATE TABLE pyworker_probe (value text NOT NULL)")
            await connection.execute("INSERT INTO pyworker_probe VALUES (%s)", ("committed",))
        try:
            async with helper.transaction() as connection:
                await connection.execute("INSERT INTO pyworker_probe VALUES (%s)", ("rolled back",))
                raise ValueError("controlled rollback")
        except ValueError:
            pass
        async with helper.transaction() as connection:
            cursor = await connection.execute("SELECT value FROM pyworker_probe")
            assert await cursor.fetchall() == [("committed",)]
            injection = "'); DROP TABLE pyworker_probe; --"
            cursor = await connection.execute("SELECT %s::text", (injection,))
            assert await cursor.fetchone() == (injection,)
        try:
            async with helper.transaction() as connection:
                await connection.execute("SELECT pg_sleep(1)")
        except DatabaseUnavailable:
            pass
        else:
            raise AssertionError("Statement timeout was not enforced")
        async with helper.transaction() as connection:
            cursor = await connection.execute("SELECT count(*) FROM pyworker_probe")
            assert await cursor.fetchone() == (1,)
    print("PASS PostgreSQL commit, rollback, parameter binding, timeout and pool recovery")


if __name__ == "__main__":
    asyncio.run(main(), loop_factory=asyncio.SelectorEventLoop)
