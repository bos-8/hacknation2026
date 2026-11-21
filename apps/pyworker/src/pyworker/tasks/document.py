"""Isolated document handler. Read source bytes from stdin and write the result to stdout."""

import json
import sys
from pathlib import Path

from .document_types import DocumentTask
from .ocr import recognize
from .pdf_export import export_pdf


def execute(task, data, boundary, output, report=None):
    if task.operation == "export":
        output.write(export_pdf(data, task.pages, task.variant, report=report))
    elif task.operation == "ocr":
        result = recognize(data, page_index=task.page_index, report=report)
        metadata = json.dumps(result["pages"], ensure_ascii=False).encode()
        if len(metadata) > 4 * 1024 * 1024:
            raise ValueError("OCR metadata exceeds limit")
        for name, mime, value in [
            ("pages", "application/json", metadata),
            *(("preview", "image/jpeg", image) for image in result["previews"]),
        ]:
            output.write(
                (
                    f"--{boundary}\r\n"
                    + f'Content-Disposition: form-data; name="{name}"; '
                    + f'filename="{name}"\r\nContent-Type: {mime}\r\n\r\n'
                ).encode()
            )
            output.write(value)
            output.write(b"\r\n")
        output.write(f"--{boundary}--\r\n".encode())
    else:
        raise ValueError("Unsupported file operation")


if __name__ == "__main__":
    try:
        task = DocumentTask.model_validate_json(Path(sys.argv[1]).read_bytes())
        if task.ticket and task.operation in {"ocr", "export"}:
            from ..connections.progress import ocr_reporter

            with ocr_reporter(task.ticket) as report:
                execute(
                    task,
                    sys.stdin.buffer.read(8 * 1024 * 1024 + 1),
                    sys.argv[2],
                    sys.stdout.buffer,
                    report,
                )
        else:
            execute(
                task, sys.stdin.buffer.read(8 * 1024 * 1024 + 1), sys.argv[2], sys.stdout.buffer
            )
    except Exception:
        sys.exit(1)
