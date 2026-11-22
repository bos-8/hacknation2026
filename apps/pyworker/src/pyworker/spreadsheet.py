"""Read visible worksheet cells from bounded XLSX and ODS packages in memory."""

import posixpath
import re
from collections.abc import Iterator
from typing import BinaryIO
from xml.etree import ElementTree as ET
from zipfile import ZipFile

from pyworker.coi import MAX_SOURCE_BLOCKS, Block
from pyworker.docx import read_package_xml
from pyworker.file_structure import ODS, OFFICE, XLSX

SHEET_FORMATS = {XLSX: ".xlsx", ODS: ".ods"}
TABLE = "{urn:oasis:names:tc:opendocument:xmlns:table:1.0}"
TEXT = "{urn:oasis:names:tc:opendocument:xmlns:text:1.0}"
STYLE = "{urn:oasis:names:tc:opendocument:xmlns:style:1.0}"
MAX_SHEETS = 40
SheetRows = Iterator[tuple[str, Iterator[str]]]

# A printed spreadsheet label often has an empty cell beside it instead of a dotted line.
CELL_LABEL = re.compile(
    r"(?:imię(?: i nazwisko)?|nazwisko(?: i imię)?|nazwa firmy|PESEL|NIP|REGON|KRS|"
    r"(?:nr|numer) (?:domu|budynku|lokalu|telefonu|rachunku(?: bankowego)?)|"
    r"adres(?: zamieszkania| siedziby| poczty elektronicznej)?|kod pocztowy|"
    r"telefon|e[- ]?mail|miejscowość|ulica|gmina|powiat|województwo|kraj|"
    r"data(?: urodzenia| uiszczenia opłaty)?|wysokość opłaty|kwota(?: nadpłaty)?|"
    r"w miejscowości|przy ulicy|w obrębie|(?:nr|numer) ewidencyjny działki)"
    r"(?:\s*\*|\d\))?",
    re.I,
)


class WorksheetTable:
    """Bind finite worksheet rows to printed column headings using actual cell indices."""

    def __init__(self):
        self.headers = {}
        self.has_records = False

    def read(self, cells):
        visible = {i: value for i, value in cells.items() if value}
        labels = {i: value.rstrip(":").strip() for i, value in visible.items()}
        known = {i for i, label in labels.items() if CELL_LABEL.fullmatch(label)}
        if len(known) >= 2 and all(
            len(label) <= 80 and "\n" not in label for label in labels.values()
        ):
            self.headers = labels
            self.has_records = False
            return ""
        if (
            self.headers
            and cells.keys() <= self.headers.keys()
            and (len(cells) >= 2 or visible and min(visible) > min(self.headers) and not known)
        ):
            self.has_records = True
            return "\n".join(f"{label}: {visible.get(i, '…')}" for i, label in self.headers.items())
        old_headers = self.headers
        self.headers = {}
        lines = list(visible.values())
        if len(visible) == 2:
            a, b = visible
            if a in known and b == a + 1 and b not in known:
                lines = [f"{labels[a]}: {visible[b]}"]
        # Preserve a header-only row, even if no record follows it.
        if old_headers and not self.has_records:
            lines[:0] = [f"{label}:" for label in old_headers.values()]
        return "\n".join(lines)


def detection_text(blocks: list[Block]) -> str:
    """Mark standalone labels for the deterministic detector, preserving raw evidence."""
    multiple = blocks[0].page != blocks[-1].page
    rows = []
    for block in blocks:
        if block.kind == "text":
            if multiple:
                rows.append(block.text)
            continue
        rows.append(
            "\n".join(
                line + ":" if CELL_LABEL.fullmatch(line.strip()) else line
                for line in block.text.splitlines()
            )
        )
    return "\n\n".join(rows)


def xlsx_rows(sheet, strings, limit):
    table = WorksheetTable()
    previous = None
    for row in sheet.iterfind("./{*}sheetData/{*}row"):
        cells = {}
        row_number = int(row.get("r", "0"))
        if previous and row_number > previous + 1:
            if tail := table.read({}):
                yield tail
        previous = row_number
        size = 0
        column = 0
        for cell in row.iterfind("{*}c"):
            ref = re.fullmatch(r"([A-Z]{1,3})[1-9]\d*", cell.get("r", ""))
            if ref:
                column = 0
                for letter in ref[1]:
                    column = 26 * column + ord(letter) - ord("A") + 1
            else:
                column += 1
            value = cell.findtext("{*}v") or ""
            if cell.get("t") == "inlineStr":
                value = rich_text(cell.find("{*}is"))
            elif cell.get("t") == "s":
                if not value.isascii() or not value.isdecimal() or int(value) >= len(strings):
                    raise ValueError("Invalid shared string index")
                value = strings[int(value)]
            if value.strip():
                size += len(value) + 1
                if size > limit:
                    raise ValueError("Worksheet row exceeds the read limit")
            if value.strip() or cell.get("s") is not None or column in table.headers:
                cells[column] = value.strip()
        if line := table.read(cells):
            yield line
    if tail := table.read({}):
        yield tail


def rich_text(node):
    if node is None:
        return ""
    return "".join(t.text or "" for t in node.findall("{*}t") + node.findall("{*}r/{*}t"))


def xlsx_sheets(archive: ZipFile, limit: int) -> SheetRows:
    workbook = read_package_xml(archive, "xl/workbook.xml")
    rels = read_package_xml(archive, "xl/_rels/workbook.xml.rels")
    paths = {}
    non_worksheets = set()
    strings = []
    consumed = 0
    for rel in rels:
        if rel.get("TargetMode") == "External":
            continue
        kind = rel.get("Type", "").rsplit("/", 1)[-1]
        if kind in {"chartsheet", "dialogsheet", "macrosheet"}:
            non_worksheets.add(rel.attrib["Id"])
        if kind not in {"worksheet", "sharedStrings"}:
            continue
        path = posixpath.normpath(posixpath.join("xl", rel.attrib["Target"])).lstrip("/")
        consumed += archive.getinfo(path).file_size
        if consumed > 32 * 1024 * 1024:
            raise ValueError("Workbook XML exceeds the read limit")
        if kind == "sharedStrings":
            strings = [rich_text(node) for node in read_package_xml(archive, path)]
        else:
            paths[rel.attrib["Id"]] = path
    parsed = set()
    for sheet in workbook.iterfind("./{*}sheets/{*}sheet"):
        if sheet.get("state", "visible") != "visible":
            continue
        rid = next((v for k, v in sheet.attrib.items() if k.endswith("}id")), None)
        if rid in non_worksheets:
            continue
        if rid not in paths:
            raise ValueError("Missing worksheet relationship")
        path = paths[rid]
        if path in parsed:
            raise ValueError("Multiple sheets refer to the same worksheet")
        parsed.add(path)
        sheet_xml = read_package_xml(archive, path)
        yield sheet.attrib["name"], xlsx_rows(sheet_xml, strings, limit)


def ods_paragraph(node: ET.Element) -> str:
    parts = [node.text or ""]
    for child in node:
        if child.tag == TEXT + "s":
            parts.append(" ")
        elif child.tag in {TEXT + "line-break", TEXT + "tab"}:
            parts.append("\n" if child.tag == TEXT + "line-break" else "\t")
        else:
            parts.append(ods_paragraph(child))
        parts.append(child.tail or "")
    return "".join(parts)


def ods_rows(sheet, limit):
    table = WorksheetTable()
    for row in sheet.iter(TABLE + "table-row"):
        cells = {}
        size = 0
        column = 1
        for cell in row:
            if cell.tag not in {TABLE + "table-cell", TABLE + "covered-table-cell"}:
                continue
            repeat = int(cell.get(TABLE + "number-columns-repeated", "1"))
            if repeat < 1:
                raise ValueError("Invalid repeated column count")
            value = "\n".join(ods_paragraph(p) for p in cell.iterfind(TEXT + "p")).strip()
            if not value:
                value = next(
                    (
                        cell.attrib[OFFICE + k]
                        for k in (
                            "string-value",
                            "date-value",
                            "time-value",
                            "boolean-value",
                            "value",
                        )
                        if OFFICE + k in cell.attrib
                    ),
                    "",
                )
            if value:
                size += (len(value) + 1) * repeat
                if repeat < 1 or size > limit:
                    raise ValueError("Worksheet row exceeds the read limit")
                cells.update((i, value) for i in range(column, column + repeat))
            elif cell.tag == TABLE + "table-cell" and table.headers and repeat <= len(table.headers):
                cells.update((i, "") for i in range(column, column + repeat) if i in table.headers)
            column += repeat
        # ODS often represents the unused tail of a sheet as a single repeated blank row.
        if not any(cells.values()) and int(row.get(TABLE + "number-rows-repeated", "1")) > 64:
            cells.clear()
        if line := table.read(cells):
            repeats = int(row.get(TABLE + "number-rows-repeated", "1"))
            if not cells:
                repeats = 1
            if repeats < 1 or repeats * len(line) > limit:
                raise ValueError("Repeated row exceeds the read limit")
            for _ in range(repeats):
                yield line
    if tail := table.read({}):
        yield tail


def spreadsheet_blocks(source: BinaryIO, extension: str, limit: int) -> list[Block]:
    result = []
    size = 0
    with ZipFile(source) as archive:
        if extension == ".xlsx":
            sheets = xlsx_sheets(archive, limit)
        elif extension == ".ods":
            content = read_package_xml(archive, "content.xml")
            hidden = {
                style.get(STYLE + "name")
                for style in content.iterfind(f"{OFFICE}automatic-styles/{STYLE}style")
                if (props := style.find(STYLE + "table-properties")) is not None
                and props.get(TABLE + "display") in {"false", "0"}
            }
            sheets = (
                (sheet.attrib[TABLE + "name"], ods_rows(sheet, limit))
                for sheet in content.iterfind(f"{OFFICE}body/{OFFICE}spreadsheet/{TABLE}table")
                if sheet.get(TABLE + "display") not in {"false", "0"}
                and sheet.get(TABLE + "style-name") not in hidden
            )
        else:
            raise ValueError("Unsupported spreadsheet type")
        for page, (name, rows) in enumerate(sheets, 1):
            if page > MAX_SHEETS:
                raise ValueError("Too many worksheets")
            first = True
            for row in rows:
                if first:
                    result.append(
                        Block(id=len(result) + 1, page=page, kind="text", text="# " + name)
                    )
                    size += len(name) + 3
                    first = False
                size += len(row) + 1
                if size > limit or len(result) >= MAX_SOURCE_BLOCKS:
                    raise ValueError("Worksheet contents exceed the read limit")
                result.append(Block(id=len(result) + 1, page=page, kind="table", text=row))
    if not result:
        raise ValueError("Workbook has no readable cells")
    return result
