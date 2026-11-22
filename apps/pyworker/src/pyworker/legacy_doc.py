"""Read legacy binary Word documents with the bundled, size-limited Apache POI helper."""

import asyncio
import os
from pathlib import Path

from pyworker.coi import Block
from pyworker.conversion_errors import EdenFailure


def default_classpath() -> str:
    target = Path(__file__).resolve().parents[2] / "legacy-word" / "target"
    if not (target / "classes/ReadWord.class").is_file() or not (target / "dependency").is_dir():
        raise EdenFailure("pipeline_unavailable", 503, reason="missing_doc_parser")
    return os.pathsep.join(map(str, (target / "classes", target / "dependency/*")))


async def read_word_text(data: bytes, classpath: str) -> str:
    classpath = classpath or await asyncio.to_thread(default_classpath)
    env = {
        k: v
        for k, v in os.environ.items()
        if k.upper() in {"PATH", "SYSTEMROOT", "WINDIR", "TEMP", "TMP", "LD_LIBRARY_PATH"}
    }
    try:
        child = await asyncio.create_subprocess_exec(
            "java",
            "-Xmx256m",
            "-cp",
            classpath,
            "ReadWord",
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.DEVNULL,
            env=env,
        )
    except OSError as error:
        raise EdenFailure("pipeline_unavailable", 503, reason="missing_document_runtime") from error
    try:
        output, _ = await child.communicate(data)
    finally:
        if child.returncode is None:
            try:
                child.kill()
            except ProcessLookupError:
                pass
            await child.wait()
    if child.returncode or not output.strip():
        raise EdenFailure("pipeline_read_failed", 422, reason="document_reader")
    return output.decode("utf-8")


def word_page_blocks(text: str) -> list[Block]:
    pages = text.split("\f")
    if len(pages) > 40:
        raise EdenFailure("pipeline_read_failed", 422, reason="document_context")
    return [
        Block(id=n, page=n, kind="text", text=page)
        for n, page in enumerate(pages, 1)
        if page.strip()
    ]
