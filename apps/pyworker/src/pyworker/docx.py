"""Read document text and table boundaries from a bounded DOCX main part."""

from typing import BinaryIO
from xml.etree import ElementTree as ET
from zipfile import ZIP_DEFLATED, ZIP_STORED, ZipFile

MAX_XML_BYTES = 8 * 1024 * 1024
WORD = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
STRICT_WORD = "{http://purl.oclc.org/ooxml/wordprocessingml/main}"


class DocumentTree(ET.TreeBuilder):
    def doctype(self, _name, _pubid, _system):
        raise ValueError("DOCTYPE is unsupported")


def read_package_xml(archive: ZipFile, name: str) -> ET.Element:
    info = archive.getinfo(name)
    if info.compress_type not in {ZIP_DEFLATED, ZIP_STORED} or info.file_size > MAX_XML_BYTES:
        raise ValueError("Unsupported XML part compression or size")
    with archive.open(info) as document:
        xml = document.read(MAX_XML_BYTES + 1)
    if len(xml) > MAX_XML_BYTES:
        raise ValueError("XML part exceeds limit")
    return ET.fromstring(xml, parser=ET.XMLParser(target=DocumentTree()))


def docx_text(source: BinaryIO) -> str:
    with ZipFile(source) as archive:
        root = read_package_xml(archive, "word/document.xml")
    prefix = STRICT_WORD if root.tag == STRICT_WORD + "document" else WORD
    body = root.find(prefix + "body")
    if body is None:
        raise ValueError("DOCX body is missing")

    def paragraph_text(paragraph: ET.Element) -> str:
        pieces = []
        for node in paragraph.iter():
            if node.tag == prefix + "t":
                pieces.append(node.text or "")
            elif node.tag == prefix + "tab":
                pieces.append("\t")
            elif node.tag in {prefix + "br", prefix + "cr"}:
                pieces.append("\n")
        return "".join(pieces).strip()

    def blocks(element: ET.Element):
        for child in element:
            if child.tag == prefix + "p":
                yield paragraph_text(child)
            elif child.tag == prefix + "tr":
                cells = (
                    " / ".join(filter(None, blocks(cell))) for cell in child.findall(prefix + "tc")
                )
                yield " | ".join(cells)
            else:
                yield from blocks(child)

    return "\n".join(filter(None, blocks(body)))
