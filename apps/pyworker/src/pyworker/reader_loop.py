"""Run cancellable reader subprocesses alongside the Windows psycopg selector loop."""

import asyncio
import sys
from collections.abc import Awaitable, Callable
from concurrent.futures import Future


async def with_reader_pipes[T](operation: Callable[[], Awaitable[T]]) -> T:
    if sys.platform != "win32" or not isinstance(
        asyncio.get_running_loop(), asyncio.SelectorEventLoop
    ):
        return await operation()

    started = Future()

    def run():
        async def reader():
            started.set_result((asyncio.get_running_loop(), asyncio.current_task()))
            return await operation()

        with asyncio.Runner(loop_factory=asyncio.ProactorEventLoop) as runner:
            return runner.run(reader())

    worker = asyncio.create_task(asyncio.to_thread(run))
    try:
        return await asyncio.shield(worker)
    except asyncio.CancelledError:
        if not worker.done():
            loop, reader = await asyncio.wrap_future(started)
            try:
                loop.call_soon_threadsafe(reader.cancel)
            except RuntimeError:
                pass  # Reader already finished and closed its loop.
        await asyncio.gather(worker, return_exceptions=True)
        raise
