"""Read native PDF pages in a cancellable child process. An empty list requests OCR."""

import asyncio
import hashlib
import json
import re
import sys
from io import BytesIO


class TextLimitExceeded(ValueError):
    pass


def text_digest(text: str) -> str:
    # The DOCX reader represents empty table cells with pipes; PDF omits that row.
    text = re.sub(r"(?m)^[ \t|]*\|[ \t|]*$", "", text)
    return hashlib.sha256(" ".join(text.split()).encode("utf-8")).hexdigest()


def read_pages(data: bytes, limit: int) -> list[str]:
    from pypdf import PdfReader

    reader = PdfReader(BytesIO(data), strict=False)
    if reader.is_encrypted or not 1 <= len(reader.pages) <= 40:
        return []
    pages = []
    size = 0
    for page in reader.pages:
        text = page.extract_text()
        has_answers = False
        # PDF widgets can hold answers separately from the visible page text.
        for ref in page.annotations or []:
            widget = ref.get_object()
            if widget.get("/Subtype") != "/Widget" or int(widget.get("/F", 0)) & 35:
                continue
            parent = widget.get("/Parent")
            parent = parent.get_object() if parent else {}
            if widget.get("/FT", parent.get("/FT")) not in {"/Tx", "/Ch"}:
                continue
            label = widget.get("/TU") or parent.get("/TU") or widget.get("/T") or parent.get("/T")
            value = widget.get("/V", parent.get("/V"))
            if isinstance(label, str) and isinstance(value, str) and 0 < len(value) <= 4000:
                text += f"\n{label}: {value}"
                has_answers = True
            if len(text) + size > limit:
                raise TextLimitExceeded("Native text exceeds input limit")
        if (not has_answers and sum(c.isalnum() for c in text) < 35) or "\ufffd" in text:
            return []
        size += len(text) + bool(pages)
        if size > limit:
            raise TextLimitExceeded("Native text exceeds input limit")
        pages.append(text)
    return pages


async def native_pdf_pages(data: bytes, limit: int) -> list[str]:
    process = await asyncio.create_subprocess_exec(
        sys.executable,
        __file__,
        str(limit),
        stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.DEVNULL,
    )
    try:
        output, _ = await process.communicate(data)
        if process.returncode == 2:
            raise ValueError("Native text exceeds input limit")
        return json.loads(output) if process.returncode == 0 else []
    finally:
        if process.returncode is None:
            process.kill()
            await process.wait()


if __name__ == "__main__":
    try:
        pages = read_pages(sys.stdin.buffer.read(), int(sys.argv[1]))
    except TextLimitExceeded:
        sys.exit(2)
    sys.stdout.buffer.write(json.dumps(pages, ensure_ascii=False).encode("utf-8"))
