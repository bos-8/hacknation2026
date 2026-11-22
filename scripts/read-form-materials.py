"""Read the reviewed DOCX corpus and produce complete source extracts and per-form COI drafts."""

import argparse
import hashlib
import json
import sys
from datetime import date
from pathlib import Path
from uuid import NAMESPACE_URL, uuid5
from zipfile import ZipFile

from jsonschema import Draft202012Validator

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "apps/pyworker/src"))
from pyworker.coi import Block, ReadDocument
from pyworker.docx import docx_blocks
from pyworker.ocr_form import form_from_text


def write_json(path, value):
    path.write_text(
        json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )


def export_sports_parts(text, folder, contract, digest, as_of):
    """The reviewed DOCX lists three titles in its preamble, then prints each application."""
    lines = text.splitlines()
    variants = [
        ("stypendium", "stypendium sportowego"),
        ("nagroda", "nagrody sportowej"),
        ("wyroznienie", "wyróżnienia sportowego"),
    ]
    starts = []
    for _, phrase in variants:
        title = f"Wniosek o przyznanie {phrase} Rady Miasta Zgierza"
        matches = [index for index, line in enumerate(lines) if line.strip() == title]
        if len(matches) != 2:
            raise ValueError(f"Expected an index entry and form heading for {title}")
        starts.append(matches[1])
    if starts != sorted(starts):
        raise ValueError("Unexpected order of sports procedures")
    parts = []
    for (key, _), start, end in zip(
        variants, starts, [*starts[1:], len(lines)], strict=True
    ):
        excerpt = "\n".join(lines[start:end])
        result = form_from_text(
            excerpt, False, uuid5(NAMESPACE_URL, digest + "/" + key), as_of=as_of
        )
        draft = result.draft.model_dump(mode="json")
        contract.validate(draft)
        (folder / (key + ".txt")).write_text(excerpt + "\n", encoding="utf-8")
        write_json(folder / (key + ".coi.json"), draft)
        parts.append(
            {
                "title": lines[start],
                "file": key + ".coi.json",
                "sourceLines": [start + 1, end],
                "importSchema": "PASS",
                "status": "review",
            }
        )
    return parts


def export(output, as_of):
    materials = ROOT / "materials"
    contract = Draft202012Validator(
        json.loads((materials / "materialy/schemat.json").read_text("utf-8-sig"))
    )
    registry = json.loads(
        (ROOT / "apps/pyworker/src/pyworker/schemas/v1/reviewed-docx.json").read_text(
            "utf-8"
        )
    )
    summary = []
    paths = sorted((materials / "formularze").rglob("*.docx")) + sorted(
        (materials / "materialy").glob("*.docx")
    )
    seen = set()
    for path in paths:
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        source = registry.get(digest)
        if not source or source["file"] != path.relative_to(materials).as_posix():
            raise ValueError(
                f"Review new or changed DOCX before assigning a procedure: {path}"
            )
        seen.add(digest)
        folder = output / path.parent.name
        folder.mkdir(parents=True, exist_ok=True)
        name = path.stem if source["kind"] == "technical" else source["kind"]
        with path.open("rb") as stream:
            paragraphs = docx_blocks(stream)
        text = "\n".join(line for _, line in paragraphs)
        (folder / (name + ".txt")).write_text(text + "\n", encoding="utf-8")
        images = []
        with ZipFile(path) as archive:
            for member in archive.namelist():
                if member.startswith("word/media/") and not member.endswith("/"):
                    image = folder / (name + "-media") / Path(member).name
                    image.parent.mkdir(exist_ok=True)
                    image.write_bytes(archive.read(member))
                    images.append(image.relative_to(output).as_posix())
        entry = dict(
            source,
            sha256=digest,
            characters=len(text),
            images=images,
            textFile=(folder / (name + ".txt")).relative_to(output).as_posix(),
        )
        if source["kind"] == "form":
            document = ReadDocument(
                blocks=[
                    Block(id=i, page=1, kind=kind, text=line)
                    for i, (kind, line) in enumerate(paragraphs, 1)
                ],
                ocr=False,
                sha256=digest,
            )
            result = form_from_text(
                text,
                False,
                uuid5(NAMESPACE_URL, digest),
                document=document,
                as_of=as_of,
            )
            if result.form_ir.procedure.documentId != source["documentId"]:
                raise ValueError(f"Wrong procedure: {path}")
            draft = result.draft.model_dump(mode="json")
            contract.validate(draft)
            write_json(folder / "form.coi.json", draft)
            write_json(folder / "form.ir.json", result.form_ir.model_dump(mode="json"))
            if (
                source["documentId"] == "D02"
                and result.form_ir.procedure.status == "multiple"
            ):
                entry["procedures"] = export_sports_parts(
                    text, folder, contract, digest, as_of
                )
            entry.update(
                asOf=as_of.isoformat(),
                draftFile=(folder / "form.coi.json").relative_to(output).as_posix(),
                tabs=len(result.draft.tabs),
                importSchema="PASS",
                status=result.form_ir.procedure.status,
                controls=sum(
                    len(q.field.repeatingSectionGrid)
                    for tab in result.draft.tabs
                    for q in tab.questions
                ),
            )
        summary.append(entry)
    if seen != set(registry):
        raise ValueError("A reviewed DOCX is missing")
    write_json(output / "index.json", summary)
    print(
        f"{len(summary)} DOCX, {sum(s['kind'] == 'form' for s in summary)} forms, "
        f"{sum(len(s['images']) for s in summary)} embedded images"
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path)
    parser.add_argument(
        "--as-of",
        type=date.fromisoformat,
        default=date(2026, 11, 22),
        help="Profile evaluation date (ISO), defaults to the reviewed material date",
    )
    args = parser.parse_args()
    export(args.output, args.as_of)
