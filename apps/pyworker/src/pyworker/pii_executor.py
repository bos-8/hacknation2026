"""Keep one CPU detector alive across documents. Only review metadata uses JSON lines."""

import asyncio
import json
import subprocess
import sys

from .tasks.document_types import Page


class PiiExecutor:
    def __init__(self):
        self.process = None

    def _start(self):
        self.process = subprocess.Popen(
            [sys.executable, "-m", "pyworker.tasks.pii"],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
        )

    def close(self):
        if self.process is None:
            return
        if self.process.poll() is None:
            self.process.kill()
        self.process.wait()
        self.process.stdin.close()
        self.process.stdout.close()
        self.process = None

    async def run(self, pages: list[Page]):
        # Document admission serializes access to this private child.
        if self.process is None or self.process.poll() is not None:
            self.close()
            self._start()
        child = self.process

        def exchange():
            payload = json.dumps([page.model_dump() for page in pages]).encode("ascii")
            child.stdin.write(payload + b"\n")
            child.stdin.flush()
            line = child.stdout.readline(16 * 1024 * 1024)
            if not line.endswith(b"\n"):
                raise ValueError("Incomplete PII response")
            result = json.loads(line)
            if not isinstance(result, dict) or "pages" not in result:
                raise ValueError("PII processing failed")
            return result

        try:
            async with asyncio.timeout(150):
                return await asyncio.to_thread(exchange)
        except (OSError, ValueError, TimeoutError, asyncio.CancelledError):
            self.close()
            raise
