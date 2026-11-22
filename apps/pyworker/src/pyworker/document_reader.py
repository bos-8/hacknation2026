"""Local document extraction in a cancellable subprocess with no incoming port."""

import json
import math
import os
import sys
from contextlib import closing
from functools import cache
from io import BytesIO
from pathlib import Path

from pyworker.coi import Block, Box, ReadDocument
from pyworker.docx import docx_source_blocks
from pyworker.ocr_image import ocr_image
from pyworker.spreadsheet import spreadsheet_blocks

MAX_PAGES = 40
MAX_EDGE = 2800
MAX_DOCUMENT_BYTES = 20 * 1024 * 1024
MAX_EXTRACTED_CHARS = 140_000


def normalized_box(coords, width: int, height: int) -> Box | None:
    if coords is None or len(coords) == 0:
        return None
    if isinstance(coords[0], (int, float)):
        if len(coords) != 4:
            return None
        x0, y0, x1, y1 = coords
    else:
        xs, ys = zip(*coords, strict=True)
        x0, y0, x1, y1 = min(xs), min(ys), max(xs), max(ys)
    if not all(math.isfinite(value) for value in (x0, y0, x1, y1)):
        return None
    box = tuple(
        round(max(0, min(1, value)), 6)
        for value in (x0 / width, y0 / height, x1 / width, y1 / height)
    )
    return box if box[0] < box[2] and box[1] < box[3] else None


def append_block(blocks, page, text, *, kind="text", bbox=None, ocr_confidence=None):
    text = text.strip()
    if text or (kind == "input" and bbox):
        blocks.append(
            Block(
                id=len(blocks) + 1,
                page=page,
                kind=kind,
                text=text,
                bbox=bbox,
                ocr_confidence=ocr_confidence,
            )
        )


@cache
def paddle_vl():
    from paddleocr import PaddleOCRVL

    return PaddleOCRVL(
        pipeline_version="v1.6",
        device=os.getenv("PYWORKER_DOCUMENT_DEVICE", "cpu"),
        use_doc_orientation_classify=False,
        use_doc_unwarping=False,
    )


@cache
def paddle_structure():
    from paddleocr import PPStructureV3

    return PPStructureV3(
        device=os.getenv("PYWORKER_DOCUMENT_DEVICE", "cpu"),
        # The static PP-StructureV3 CPU graph has operations unsupported by oneDNN.
        enable_mkldnn=False,
        use_doc_orientation_classify=False,
        use_doc_unwarping=False,
        use_textline_orientation=False,
        use_formula_recognition=False,
        use_seal_recognition=False,
        use_chart_recognition=False,
        text_recognition_model_name="latin_PP-OCRv5_mobile_rec",
    )


def paddle_result(engine, pixels, **options):
    payload = next(iter(engine.predict(pixels, **options))).json
    return payload.get("res", payload)


def blank_regions(pixels, occupied):
    import cv2

    height, width = pixels.shape[:2]
    gray = cv2.cvtColor(pixels, cv2.COLOR_BGR2GRAY)
    mask = cv2.adaptiveThreshold(
        gray,
        255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY_INV,
        31,
        12,
    )
    contours, _ = cv2.findContours(mask, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
    found = set()
    for contour in contours:
        x, y, w, h = cv2.boundingRect(contour)
        if not (12 <= w <= width * 0.95 and 12 <= h <= height * 0.30):
            continue
        if len(cv2.approxPolyDP(contour, cv2.arcLength(contour, True) * 0.025, True)) != 4:
            continue
        if cv2.contourArea(contour) < w * h * 0.78:
            continue
        inner = gray[y + 3 : y + h - 3, x + 3 : x + w - 3]
        ink = cv2.countNonZero((inner < 150).astype("uint8")) / inner.size
        if ink > 0.035:
            continue
        box = normalized_box([x, y, x + w, y + h], width, height)
        if not box:
            continue
        if any(
            box[0] < (existing[0] + existing[2]) / 2 < box[2]
            and box[1] < (existing[1] + existing[3]) / 2 < box[3]
            for existing in occupied
        ):
            continue
        if any(max(abs(a - b) for a, b in zip(box, prior, strict=True)) < 0.004 for prior in found):
            continue
        found.add(box)
    return sorted(found, key=lambda item: (item[1], item[0]))[:200]


def read_image(image, page: int, blocks: list[Block]):
    import numpy as np

    image.thumbnail((MAX_EDGE, MAX_EDGE))
    width, height = image.size
    if width < 32 or height < 32:
        raise ValueError("Image is too small for document OCR")
    pixels = np.ascontiguousarray(np.asarray(ocr_image(image))[:, :, ::-1])
    first = len(blocks)
    layout = paddle_result(paddle_vl(), pixels).get("parsing_res_list", [])
    for item in layout:
        kind = "table" if item.get("block_label") == "table" else "text"
        append_block(
            blocks,
            page,
            item.get("block_content") or "",
            kind=kind,
            bbox=normalized_box(item.get("block_bbox"), width, height),
        )

    has_table = any(block.kind == "table" for block in blocks[first:])
    if first == len(blocks) or has_table:
        structure = paddle_result(paddle_structure(), pixels, use_table_orientation_classify=False)
        ocr = structure.get("overall_ocr_res") or {}
        scores = ocr.get("rec_scores") or []
        lines = zip(ocr.get("rec_texts", []), ocr.get("rec_polys", []), strict=True)
        for index, (text, box) in enumerate(lines):
            score = scores[index] if index < len(scores) else None
            append_block(
                blocks,
                page,
                text,
                bbox=normalized_box(box, width, height),
                ocr_confidence=score,
            )
    occupied = [block.bbox for block in blocks[first:] if block.kind == "text" and block.bbox]
    for box in blank_regions(pixels, occupied):
        append_block(blocks, page, "", kind="input", bbox=box)


@cache
def docling_converter():
    from docling.datamodel.base_models import InputFormat
    from docling.datamodel.pipeline_options import PdfPipelineOptions
    from docling.document_converter import DocumentConverter, PdfFormatOption

    assets = Path(os.environ["PYWORKER_PIPELINE_ASSETS"])
    options = PdfPipelineOptions(
        artifacts_path=assets / "docling",
        do_ocr=False,
        enable_remote_services=False,
    )
    return DocumentConverter(
        allowed_formats=[InputFormat.PDF, InputFormat.DOCX],
        format_options={InputFormat.PDF: PdfFormatOption(pipeline_options=options)},
    )


def read_docling(data: bytes, extension: str, page: int | None = None):
    from docling.datamodel.base_models import DocumentStream

    source = DocumentStream(name=f"form{extension}", stream=BytesIO(data))
    limits = {"page_range": (page, page)} if page is not None else {}
    return docling_converter().convert(source, max_file_size=MAX_DOCUMENT_BYTES, **limits).document


def docling_box(bbox, size) -> Box | None:
    if bbox is None or size is None or not size.width or not size.height:
        return None
    rect = bbox.to_top_left_origin(size.height)
    return normalized_box([rect.l, rect.t, rect.r, rect.b], size.width, size.height)


def append_native_page(document, page_number: int, blocks: list[Block]) -> bool:
    from docling_core.types.doc import TableItem, TextItem

    start = len(blocks)
    for item, _level in document.iterate_items():
        if not isinstance(item, (TableItem, TextItem)):
            continue
        provenance = next(iter(item.prov), None)
        page = document.pages.get(provenance.page_no) if provenance else None
        size = page.size if page else None
        bbox = docling_box(provenance.bbox, size) if provenance else None
        if isinstance(item, TextItem):
            append_block(blocks, page_number, item.text, bbox=bbox)
            continue
        append_block(
            blocks, page_number, item.export_to_markdown(doc=document), kind="table", bbox=bbox
        )
        for cell in item.data.table_cells:
            cell_box = docling_box(cell.bbox, size)
            if cell_box:
                append_block(
                    blocks,
                    page_number,
                    cell.text,
                    bbox=cell_box,
                    kind="text" if cell.text.strip() else "input",
                )
    if any(block.text for block in blocks[start:]):
        return True
    del blocks[start:]
    return False


def read_pdf(data: bytes, blocks: list[Block], report) -> bool:
    import pypdfium2 as pdfium

    used_ocr = False
    with pdfium.PdfDocument(data) as document:
        if len(document) > MAX_PAGES:
            raise ValueError("Document exceeds the page limit")
        for index in range(len(document)):
            page_number = index + 1
            with closing(document[index]) as page:
                with closing(page.get_textpage()) as text_page:
                    native_text = text_page.get_text_bounded()
                if sum(char.isalnum() for char in native_text) >= 35:
                    report("extracting")
                    page_document = read_docling(data, ".pdf", page_number)
                    if append_native_page(page_document, page_number, blocks):
                        continue
                report("ocr")
                with closing(
                    page.render(scale=min(3, MAX_EDGE / max(page.get_size())))
                ) as rendered:
                    read_image(rendered.to_pil().copy(), page_number, blocks)
                used_ocr = True
    return used_ocr


def read_document(data: bytes, extension: str, report) -> ReadDocument:
    blocks: list[Block] = []
    used_ocr = False
    if extension == ".pdf":
        used_ocr = read_pdf(data, blocks, report)
    elif extension == ".docx":
        report("extracting")
        blocks = docx_source_blocks(BytesIO(data))
        if not blocks:
            append_block(blocks, 1, read_docling(data, extension).export_to_markdown())
    elif extension in {".jpg", ".jpeg", ".png"}:
        from PIL import Image, ImageOps

        report("ocr")
        with Image.open(BytesIO(data)) as image:
            if image.width * image.height > 45_000_000:
                raise ValueError("Image exceeds the pixel limit")
            read_image(ImageOps.exif_transpose(image), 1, blocks)
        used_ocr = True
    elif extension in {".ods", ".xlsx"}:
        report("extracting")
        blocks = spreadsheet_blocks(BytesIO(data), extension, MAX_EXTRACTED_CHARS)
    else:
        report("extracting")
        document = read_docling(data, extension)
        append_block(blocks, 1, document.export_to_markdown())
    if not any(block.text for block in blocks):
        raise ValueError("No text extracted")
    if sum(len(block.text) for block in blocks) > MAX_EXTRACTED_CHARS:
        raise ValueError("Extracted content exceeds the context limit")
    return ReadDocument(blocks=blocks, ocr=used_ocr)


def main():
    if sys.argv[1:] == ["--prepare"]:
        paddle_vl()
        paddle_structure()
        return
    (extension,) = sys.argv[1:]
    data = sys.stdin.buffer.read(MAX_DOCUMENT_BYTES + 1)
    if not data or len(data) > MAX_DOCUMENT_BYTES:
        raise ValueError("Invalid input size")

    # Native inference libraries can write to stdout. Keep the pipe for JSON only.
    sys.stdout.flush()
    with os.fdopen(os.dup(sys.stdout.fileno()), "w", encoding="utf-8") as output:
        with open(os.devnull, "wb") as sink:
            os.dup2(sink.fileno(), sys.stdout.fileno())

        def report(stage):
            print(json.dumps(stage), file=output, flush=True)

        result = read_document(data, extension, report)
        print(result.model_dump_json(), file=output, flush=True)


if __name__ == "__main__":
    main()
