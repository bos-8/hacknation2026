"""Read text, tables and referenced notes from bounded DOCX parts."""

import posixpath
from typing import BinaryIO
from xml.etree import ElementTree as ET
from zipfile import ZIP_DEFLATED, ZIP_STORED, ZipFile

MAX_XML_BYTES = 8 * 1024 * 1024
WORD = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
STRICT_WORD = "{http://purl.oclc.org/ooxml/wordprocessingml/main}"
MC = "{http://schemas.openxmlformats.org/markup-compatibility/2006}"


def alternate(node):
    """Word stores the same drawing twice in Choice and Fallback."""
    selected = node.find(MC + "Choice")
    return selected if selected is not None else node.find(MC + "Fallback")


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


def docx_blocks(source: BinaryIO) -> list[tuple[str, str]]:
    with ZipFile(source) as archive:
        root = read_package_xml(archive, "word/document.xml")
        prefix = STRICT_WORD if root.tag == STRICT_WORD + "document" else WORD
        body = root.find(prefix + "body")
        if body is None:
            raise ValueError("DOCX body is missing")
        parts = [body]
        rels = "word/_rels/document.xml.rels"
        if rels in archive.namelist():
            relationships = {r.get("Id"): r for r in read_package_xml(archive, rels)}
            used = set()
            for ref in body.iter():
                if ref.tag not in {prefix + "headerReference", prefix + "footerReference"}:
                    continue
                rid = next((v for k, v in ref.attrib.items() if k.endswith("}id")), None)
                rel = relationships.get(rid)
                if rel is None or rel.get("TargetMode") == "External":
                    continue
                target = posixpath.normpath(posixpath.join("word", rel.get("Target", "")))
                if not target.startswith(("word/header", "word/footer")) or target in used:
                    continue
                used.add(target)
                if (
                    len(used) > 32
                    or sum(archive.getinfo(n).file_size for n in used) > MAX_XML_BYTES
                ):
                    raise ValueError("Header and footer parts exceed limit")
                section = read_package_xml(archive, target)
                if ref.tag == prefix + "headerReference":
                    parts.insert(0, section)
                else:
                    parts.append(section)
        for kind in ("footnote", "endnote"):
            ids = dict.fromkeys(
                ref.get(prefix + "id") for ref in body.iter(prefix + kind + "Reference")
            )
            part = "word/" + kind + "s.xml"
            if ids and part in archive.namelist():
                notes = {
                    note.get(prefix + "id"): note
                    for note in read_package_xml(archive, part)
                    if note.tag == prefix + kind and note.get(prefix + "type", "normal") == "normal"
                }
                parts.extend(notes[i] for i in ids if i in notes)

    def paragraph_text(paragraph: ET.Element) -> str:
        pieces = []

        def visit(node):
            nested_paragraph = node is not paragraph and node.tag == prefix + "p"
            if nested_paragraph:
                pieces.append("\n")
            if node.tag == prefix + "t":
                pieces.append(node.text or "")
            elif node.tag == prefix + "tab":
                pieces.append("\t")
            elif node.tag in {prefix + "br", prefix + "cr"}:
                pieces.append("\n")
            elif node.tag == MC + "AlternateContent":
                selected = alternate(node)
                if selected is not None:
                    visit(selected)
            else:
                for child in node:
                    visit(child)
            if nested_paragraph:
                pieces.append("\n")

        visit(paragraph)
        return "".join(pieces).strip()

    def blocks(element: ET.Element):
        for child in element:
            if child.tag == MC + "AlternateContent":
                selected = alternate(child)
                if selected is not None:
                    yield from blocks(selected)
            elif child.tag == prefix + "p":
                yield "text", paragraph_text(child)
            elif child.tag == prefix + "tr":
                cells = (
                    " / ".join(text for _, text in blocks(cell) if text)
                    for cell in child.findall(prefix + "tc")
                )
                yield "table", " | ".join(cells)
            else:
                yield from blocks(child)

    return [(kind, line) for part in parts for kind, line in blocks(part) if line]


def docx_text(source: BinaryIO) -> str:
    return "\n".join(line for _, line in docx_blocks(source))


def docx_source_blocks(source: BinaryIO):
    """Group very long documents within the model's block limit without dropping text."""
    from pyworker.coi import MAX_SOURCE_BLOCKS, Block

    parts = docx_blocks(source)
    if len(parts) > MAX_SOURCE_BLOCKS:
        parts = [("text", "\n".join(line for _, line in parts))]
    return [Block(id=i, page=1, kind=kind, text=line) for i, (kind, line) in enumerate(parts, 1)]
