"""Keep native OCR off the event loop and terminate the child on timeout or shutdown."""

import asyncio
import subprocess
import sys
import tempfile
from pathlib import Path
from uuid import uuid4

from starlette.responses import Response

from .tasks.document_types import DocumentTask


async def execute_document(task: DocumentTask, source):
    boundary = uuid4().hex
    with tempfile.TemporaryDirectory() as directory, tempfile.TemporaryFile() as output:
        metadata = Path(directory) / "task.json"
        metadata.write_text(task.model_dump_json(), encoding="utf-8")
        if source is not None:
            source.seek(0)
        child = subprocess.Popen(  # noqa: ASYNC220 -- Windows selector loop cannot spawn children.
            [sys.executable, "-m", "pyworker.tasks.document", str(metadata), boundary],
            stdin=source if source is not None else subprocess.DEVNULL,
            stdout=output,
            stderr=subprocess.DEVNULL,
        )
        try:
            async with asyncio.timeout(150):
                await asyncio.to_thread(child.wait)
            if child.returncode or output.tell() > 16 * 1024 * 1024:
                raise ValueError("Document processing failed")
            output.seek(0)
            media = {
                "detect": "application/json",
                "export": "application/pdf",
                "ocr": f"multipart/form-data; boundary={boundary}",
            }
            return Response(output.read(), media_type=media[task.operation])
        finally:
            if child.poll() is None:
                child.kill()
                await asyncio.to_thread(child.wait)
