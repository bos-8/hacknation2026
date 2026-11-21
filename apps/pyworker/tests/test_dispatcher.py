import asyncio
import unittest

from pyworker.dispatcher import Dispatcher


class DispatcherTests(unittest.IsolatedAsyncioTestCase):
    async def test_waiting_handler_can_be_cancelled_while_another_completes(self):
        dispatcher = Dispatcher(2)
        entered = asyncio.Event()
        stopped = asyncio.Event()

        async def waiting():
            entered.set()
            try:
                await asyncio.Event().wait()
            finally:
                stopped.set()

        async def quick():
            return "done"

        async with asyncio.timeout(3), dispatcher.lifespan():
            first = asyncio.create_task(dispatcher.run(waiting))
            await entered.wait()
            self.assertEqual(await dispatcher.run(quick), "done")
            first.cancel()
            with self.assertRaises(asyncio.CancelledError):
                await first
            self.assertTrue(stopped.is_set())
