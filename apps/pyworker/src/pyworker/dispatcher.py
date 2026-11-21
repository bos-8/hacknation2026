"""Single event-loop reader for admitted calls. Durable delivery belongs to pg-boss."""

import asyncio
from collections.abc import Awaitable, Callable
from contextlib import asynccontextmanager


class Dispatcher:
    def __init__(self, capacity: int):
        self._pending: asyncio.Queue[tuple[Callable[[], None], asyncio.Future]] = asyncio.Queue(
            capacity
        )
        self._running: set[asyncio.Task] = set()

    async def _read(self):
        while True:
            start, _ = await self._pending.get()
            start()

    @asynccontextmanager
    async def lifespan(self):
        reader = asyncio.create_task(self._read())
        try:
            yield
        finally:
            reader.cancel()
            await asyncio.gather(reader, return_exceptions=True)
            # Wake submitters still waiting for an execution handle.
            while not self._pending.empty():
                _, started = self._pending.get_nowait()
                started.cancel()
            active = list(self._running)
            for task in active:
                task.cancel()
            await asyncio.gather(*active, return_exceptions=True)

    async def run[T](self, handler: Callable[[], Awaitable[T]]) -> T:
        """Keep the caller's deadline and cancellation attached to the handler."""
        started = asyncio.get_running_loop().create_future()

        async def execute():
            return await handler()

        def start():
            if started.cancelled():
                return
            task = asyncio.create_task(execute())
            self._running.add(task)
            task.add_done_callback(self._running.discard)
            started.set_result(task)

        await self._pending.put((start, started))
        try:
            task = await started
            return await task
        finally:
            if started.done() and not started.cancelled():
                task = started.result()
                if not task.done():
                    task.cancel()
                await asyncio.gather(task, return_exceptions=True)
