"""Recover empty answer areas from the printed rules of a table."""

import re
from base64 import b64decode
from collections import Counter, defaultdict
from io import BytesIO
from itertools import groupby, pairwise

from PIL import Image

from pyworker.coi import MAX_SOURCE_BLOCKS, CellPosition
from pyworker.observed_answers import labelled_value
from pyworker.vision import VisualField


def line_centers(projection):
    indices = (i for i, value in enumerate(projection.tobytes()) if value >= 170)
    return [
        (line[0] + line[-1]) // 2
        for _, group in groupby(enumerate(indices), lambda item: item[1] - item[0])
        if (line := [i for _, i in group]) and line[-1] - line[0] <= 10
    ]


def markdown_tables(text):
    """Read explicit OCR table rows without collapsing blank cells."""
    tables = []
    for is_table, group in groupby(text.splitlines(), lambda line: line.strip().startswith("|")):
        if not is_table:
            continue
        lines = list(group)
        cells = [
            [
                c.strip().replace(r"\|", "|")
                for c in re.split(r"(?<!\\)\|", s.strip()[1:].removesuffix("|"))
            ]
            for s in lines
        ]
        if len(cells) < 3 or len(cells[0]) < 2:
            continue
        if not all(re.fullmatch(r":?-{3,}:?", c) for c in cells[1]):
            continue
        if any(len(row) != len(cells[0]) for row in cells) or not any(cells[0]):
            continue
        tables.append(("\n".join(lines), [cells[0], *cells[2:]]))
    return tables


def align_cells(page, encoded, spans=(), ocr_tables=()):
    tables = defaultdict(list)
    for field in page.fields:
        if field.cell:
            tables[field.section].append(field)
    with Image.open(BytesIO(b64decode(encoded))) as image:
        ink = image.convert("L").point(lambda level: 255 if level < 160 else 0)
    for cells in tables.values():
        if len(cells) >= 2:
            align_grid(ink, cells)
    for field in page.fields:
        if not field.value and field.kind != "checkbox":
            printed = text_in(field.bbox, spans)
            label = field.label.casefold().rstrip(":")
            if pair := labelled_value(printed):
                if label in {pair[0].casefold(), printed.casefold()}:
                    field.label = pair[0]
                    field.value = pair[1]
            elif printed and printed.casefold().rstrip(":") != label:
                field.value = printed
    return recover_empty_cells(page, ink, spans, ocr_tables)


def text_in(box, spans):
    left, top, right, bottom = box
    values = [
        text
        for text, (x0, y0, x1, y1) in spans
        if left - 1 <= x0 and top - 1 <= y0 and x1 <= right + 1 and y1 <= bottom + 1
    ]
    text = " ".join(" ".join(values).split())
    return text if len(text) <= 4000 and any(c.isalnum() for c in text) else ""


def horizontal_edges(ink):
    """Group horizontal rules with matching endpoints, collapsing thick strokes."""
    width, height = ink.size
    pattern = re.compile(b"\xff{%d,}" % max(22, width // 14))
    pixels = ink.tobytes()
    spans = {}
    for y in range(height):
        for run in pattern.finditer(pixels, y * width, (y + 1) * width):
            x0, x1 = run.start() - y * width, run.end() - y * width - 1
            key = (round(x0 / 4), round(x1 / 4))
            spans.setdefault(key, []).append((y, x0, x1))
    for lines in spans.values():
        edges = []
        for _, group in groupby(enumerate(lines), lambda item: item[1][0] - item[0]):
            stroke = [line for _, line in group]
            if len(stroke) <= 10:
                edges.append((stroke[0][0] + stroke[-1][0]) // 2)
        if len(edges) > 1:
            yield lines[0][1], lines[0][2], edges


def ruled_tables(ink):
    for left, right, edges in horizontal_edges(ink):
        rows = []
        for top, bottom in pairwise(edges):
            if bottom - top < 6:
                continue
            band = ink.crop((max(0, left - 2), top + 2, min(ink.width, right + 3), bottom - 1))
            borders = [
                max(0, left - 2) + x
                for x in line_centers(band.resize((band.width, 1), Image.Resampling.BOX))
            ]
            if len(borders) < 2 or abs(borders[0] - left) > 3 or abs(borders[-1] - right) > 3:
                if rows:
                    yield rows
                    rows = []
            else:
                rows.append((top, bottom, borders))
        if rows:
            yield rows


def recover_empty_cells(page, ink, spans, ocr_tables):
    width, height = ink.size

    def box(x0, top, x1, bottom):
        return (
            round(1000 * x0 / width),
            round(1000 * top / height),
            round(1000 * x1 / width),
            round(1000 * bottom / height),
        )

    grids = list(ruled_tables(ink))
    shapes = [
        (len(rows), len(rows[0][2]) - 1)
        if all(
            len(borders) == len(rows[0][2])
            and all(abs(a - b) <= 3 for a, b in zip(borders, rows[0][2], strict=True))
            for _, _, borders in rows
        )
        else None
        for rows in grids
    ]
    counts = Counter(shapes)
    by_shape = defaultdict(list)
    for source, matrix in ocr_tables:
        by_shape[len(matrix), len(matrix[0])].append((source, matrix))
    consumed = []
    for index, (rows, shape) in enumerate(zip(grids, shapes, strict=True), 1):
        matrix = None
        if counts[shape] == 1 and len(by_shape.get(shape, [])) == 1:
            source, matrix = by_shape[shape][0]
        initial_fields = len(page.fields)
        # Shared column numbers include columns covered by a merged cell in one row.
        columns = []
        for x in sorted({x for _, _, borders in rows for x in borders}):
            if not columns or x - columns[-1] > 3:
                columns.append(x)
        if len(columns) < 3 and len(rows) < 2:
            continue
        left, right = columns[0], columns[-1]
        first, last = rows[0][0], rows[-1][1]
        centers = [
            ((f.bbox[0] + f.bbox[2]) * width / 2000, (f.bbox[1] + f.bbox[3]) * height / 2000, f)
            for f in page.fields
        ]
        section = next(
            (
                f.section
                for x, y, f in centers
                if f.cell and f.section and left < x < right and first < y < last
            ),
            None,
        )
        table = box(left, first, right, last)
        headers = [
            h
            for h in page.table_headers
            if table[0] <= sum(h.bbox[::2]) / 2 <= table[2]
            and table[1] <= sum(h.bbox[1::2]) / 2 <= table[3]
        ]
        for row, (top, bottom, borders) in enumerate(rows, 1):
            for x0, x1 in pairwise(borders):
                # Narrow digit boxes are a single identifier, handled by the visual model.
                if x1 - x0 < max(13, width // 65):
                    continue
                col = min(range(len(columns)), key=lambda i: abs(columns[i] - x0)) + 1
                if matrix and (row == 1 or col > len(matrix[0])):
                    continue
                area = box(x0, top, x1, bottom)
                inside_field = next(
                    (f for x, y, f in centers if x0 <= x <= x1 and top <= y <= bottom), None
                )
                header_labels = [
                    h.text
                    for h in headers
                    if (
                        h.axis == "column"
                        and area[0] <= sum(h.bbox[::2]) / 2 <= area[2]
                        and h.bbox[3] <= area[1]
                    )
                    or (
                        h.axis == "row"
                        and area[1] <= sum(h.bbox[1::2]) / 2 <= area[3]
                        and h.bbox[2] <= area[0]
                    )
                ]
                if (
                    not header_labels
                    and row > 1
                    and not any(x0 <= x <= x1 and first <= y <= rows[0][1] for x, y, _ in centers)
                ):
                    column_text = text_in(box(x0, first, x1, rows[0][1]), spans)
                    if column_text and len(column_text) <= 120:
                        header_labels.append(column_text)
                descriptive = " · ".join(dict.fromkeys(header_labels))[:255]
                if matrix and matrix[0][col - 1]:
                    descriptive = matrix[0][col - 1][:255]
                if inside_field:
                    if descriptive and re.fullmatch(
                        r"(?:pole|field|cell|komórka|kolumna|wiersz)[\s\d,.-]*",
                        inside_field.label,
                        re.I,
                    ):
                        inside_field.label = descriptive
                    continue
                inset = min(4, (bottom - top) // 3)
                inside = ink.crop((x0 + 3, top + inset, x1 - 2, bottom - inset + 1))
                printed = text_in(area, spans)
                known_input_column = any(
                    f.cell and x0 <= x <= x1 and first < y < last for x, y, f in centers
                )
                has_ink = inside.histogram()[255] > max(3, inside.width * inside.height // 2000)
                if matrix and has_ink:
                    printed = matrix[row - 1][col - 1]
                    if not printed or len(printed) > 4000:
                        continue
                elif has_ink and not (printed and descriptive and row > 1 and known_input_column):
                    continue
                page.fields.append(
                    VisualField(
                        label=descriptive or f"Wiersz {row}, kolumna {col}",
                        section=section or f"Tabela {index}",
                        kind="text",
                        bbox=area,
                        cell=CellPosition(row=row, column=col),
                        value=printed or None,
                    )
                )
                if 2 * len(page.fields) > MAX_SOURCE_BLOCKS:
                    raise ValueError("Table exceeds document evidence limit")
        if matrix and len(page.fields) > initial_fields:
            consumed.append(source)
    return consumed


def align_grid(ink, cells):
    w, h = ink.size
    x0 = min(c.bbox[0] for c in cells) * w // 1000
    y0 = min(c.bbox[1] for c in cells) * h // 1000
    x1 = max(c.bbox[2] for c in cells) * w // 1000
    y1 = max(c.bbox[3] for c in cells) * h // 1000
    if x1 - x0 < 15 or y1 - y0 < 8:
        return
    # Project interior strips across the page. Solid borders have much more ink than text.
    dx, dy = (x1 - x0) // 10, (y1 - y0) // 8
    ys = line_centers(ink.crop((x0 + dx, 0, x1 - dx, h)).resize((1, h), Image.Resampling.BOX))
    xs = line_centers(ink.crop((0, y0 + dy, w, y1 - dy)).resize((w, 1), Image.Resampling.BOX))
    xs = [x for x in xs if x0 - w * 0.04 <= x <= x1 + w * 0.04]
    if len(xs) < 2 or len(ys) < 2:
        return

    # Reject unrelated horizontal lines unless both outer borders connect them.
    def connected(top, bottom):
        if bottom - top < 4:
            return False
        for x in (xs[0], xs[-1]):
            strip = ink.crop((max(0, x - 2), top + 1, min(w, x + 3), bottom))
            if max(strip.resize((strip.width, 1), Image.Resampling.BOX).tobytes()) < 180:
                return False
        return True

    for ok, segment in groupby(zip(ys[:-1], ys[1:], strict=True), lambda p: connected(*p)):
        if not ok:
            continue
        edges = list(segment)
        rows = [edges[0][0], *(bottom for _, bottom in edges)]
        for field in cells:
            r, c = field.cell.row, field.cell.column
            if r >= len(rows) or c >= len(xs):
                continue
            left, right = xs[c - 1 : c + 1]
            top, bottom = rows[r - 1 : r + 1]
            cx = (field.bbox[0] + field.bbox[2]) * w / 2000
            cy = (field.bbox[1] + field.bbox[3]) * h / 2000
            if left < cx < right and top - 1.5 * (bottom - top) <= cy <= bottom + 1.5 * (
                bottom - top
            ):
                field.bbox = (
                    round(1000 * left / w),
                    round(1000 * top / h),
                    round(1000 * right / w),
                    round(1000 * bottom / h),
                )
