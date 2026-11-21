"""Check the structure behind a file's signature without decoding the document."""

import re
from struct import Struct
from typing import BinaryIO
from xml.etree import ElementTree as ET
from zipfile import ZIP_STORED, BadZipFile, ZipFile
from zlib import crc32
from zlib import error as ZlibError

from pyworker.docx import STRICT_WORD, WORD, read_package_xml

CONTENT_TYPES = "{http://schemas.openxmlformats.org/package/2006/content-types}"
OFFICE = "{urn:oasis:names:tc:opendocument:xmlns:office:1.0}"
ODS = "application/vnd.oasis.opendocument.spreadsheet"
PACKAGES = {".docx": "word/document.xml", ".xlsx": "xl/workbook.xml", ".ods": "content.xml"}
SPREADSHEET = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
STRICT_SPREADSHEET = "{http://purl.oclc.org/ooxml/spreadsheetml/main}"
PNG_CHUNK = Struct(">I4s")
PNG_HEADER = Struct(">IIBBBBB")
JPEG_FRAMES = frozenset(range(0xC0, 0xD0)) - {0xC4, 0xC8, 0xCC}


def matches_package(file: BinaryIO, extension: str) -> bool:
    part = PACKAGES[extension]
    try:
        with ZipFile(file) as package:
            package.getinfo(part)
            if extension == ".ods":
                info = package.getinfo("mimetype")
                if info.compress_type != ZIP_STORED:
                    return False
                with package.open(info) as marker:
                    if marker.read(128) != ODS.encode():
                        return False
                content = read_package_xml(package, part)
                return (
                    content.tag == OFFICE + "document-content"
                    and content.find(f"{OFFICE}body/{OFFICE}spreadsheet") is not None
                )

            package.getinfo("[Content_Types].xml")
            if extension == ".docx":
                content_type = "wordprocessingml.document.main+xml"
                namespaces, root_tag, child_tag = (WORD, STRICT_WORD), "document", "body"
            else:
                content_type = "spreadsheetml.sheet.main+xml"
                namespaces, root_tag, child_tag = (
                    (SPREADSHEET, STRICT_SPREADSHEET),
                    "workbook",
                    "sheets",
                )
            media_type = f"application/vnd.openxmlformats-officedocument.{content_type}"
            types = read_package_xml(package, "[Content_Types].xml")
            if types.tag != CONTENT_TYPES + "Types" or not any(
                item.get("PartName") == f"/{part}" and item.get("ContentType") == media_type
                for item in types.findall(CONTENT_TYPES + "Override")
            ):
                return False
            root = read_package_xml(package, part)
            return any(
                root.tag == ns + root_tag and root.find(ns + child_tag) is not None
                for ns in namespaces
            )
    except (
        BadZipFile,
        ET.ParseError,
        KeyError,
        OSError,
        RuntimeError,
        ValueError,
        EOFError,
        ZlibError,
    ):
        return False


def matches_pdf(data: bytes) -> bool:
    if not re.match(rb"%PDF-(?:1\.[0-7]|2\.0)[\r\n]", data):
        return False
    trailer = re.search(rb"startxref\s+([0-9]{1,10})\s+%%EOF[\x00\s]*\Z", data[-1024:])
    if not trailer:
        return False
    offset = int(trailer[1])
    return bool(re.match(rb"(?:xref\b|[0-9]+\s+[0-9]+\s+obj\b)", data[offset : offset + 64]))


def matches_png(data: bytes) -> bool:
    view = memoryview(data)
    offset = 8  # The signature is checked before inspecting the chunks.
    image_data = False
    while offset + 12 <= len(data):
        length, kind = PNG_CHUNK.unpack_from(data, offset)
        end = offset + 8 + length
        if end + 4 > len(data):
            return False
        if crc32(view[offset + 4 : end]) != int.from_bytes(view[end : end + 4], "big"):
            return False
        if offset == 8:
            if kind != b"IHDR" or length != PNG_HEADER.size:
                return False
            width, height, _, _, compression, filtering, interlace = PNG_HEADER.unpack_from(
                data, offset + 8
            )
            if not width or not height or compression or filtering or interlace not in (0, 1):
                return False
        elif kind == b"IDAT":
            image_data |= length > 0
        elif kind == b"IEND":
            return image_data and length == 0 and end + 4 == len(data)
        offset = end + 4
    return False


def matches_jpeg(data: bytes) -> bool:
    offset = 2  # SOI is checked before inspecting the markers.
    frame_seen = False
    while offset + 4 <= len(data) and data[offset] == 0xFF:
        offset += 1
        if data[offset] == 0xFF:  # Optional marker padding.
            continue
        marker = data[offset]
        length = int.from_bytes(data[offset + 1 : offset + 3], "big")
        end = offset + 1 + length
        if length < 2 or end > len(data):
            return False
        if marker in JPEG_FRAMES:
            height = int.from_bytes(data[offset + 4 : offset + 6], "big")
            width = int.from_bytes(data[offset + 6 : offset + 8], "big")
            if length < 11 or not width or not height or length != 8 + 3 * data[offset + 8]:
                return False
            frame_seen = True
        if marker == 0xDA:  # SOS is followed by compressed image data and EOI.
            return frame_seen and length >= 8 and data.find(b"\xff\xd9", end + 1) != -1
        offset = end
    return False
