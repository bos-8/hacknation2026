"""Build the worker's offline choice lists from official GUS TERC, SIMC and ULIC ZIPs."""

import argparse
import csv
import hashlib
import io
import json
import os
import sqlite3
import tempfile
import zlib
from collections import defaultdict
from pathlib import Path
from zipfile import ZipFile


def build(directory, destination):
    groups = defaultdict(dict)
    sources = {}
    for table in ("TERC", "SIMC", "ULIC"):
        path = directory / (table + ".zip")
        with ZipFile(path) as archive:
            (name,) = [
                n
                for n in archive.namelist()
                if n.startswith(table + "_") and n.endswith(".csv")
            ]
            sources[name] = hashlib.sha256(path.read_bytes()).hexdigest()
            with archive.open(name) as data:
                for row in csv.DictReader(
                    io.TextIOWrapper(data, encoding="utf-8-sig"), delimiter=";"
                ):
                    woj = row["WOJ"]
                    county = woj + row["POW"]
                    municipality = (
                        county + row["GMI"] + row.get("RODZ", row.get("RODZ_GMI", ""))
                    )
                    if table == "SIMC":
                        level, parent, code, label = (
                            "locality",
                            municipality,
                            row["SYM"],
                            row["NAZWA"],
                        )
                    elif table == "ULIC":
                        level, parent, code = (
                            "street",
                            municipality + "/" + row["SYM"],
                            row["SYM_UL"],
                        )
                        label = " ".join(
                            filter(None, (row["CECHA"], row["NAZWA_2"], row["NAZWA_1"]))
                        )
                    else:
                        label = row["NAZWA"]
                        if row["GMI"]:
                            level, parent, code = "municipality", county, municipality
                            label += " (" + row["NAZWA_DOD"] + ")"
                        elif row["POW"]:
                            level, parent, code = "county", woj, county
                        else:
                            level, parent, code = "province", "", woj
                    groups[level, parent][code] = label
    with tempfile.NamedTemporaryFile(dir=destination.parent, delete=False) as tmp:
        staged = Path(tmp.name)
    try:
        db = sqlite3.connect(staged)
        try:
            db.execute(
                "CREATE TABLE choices(level TEXT, parent TEXT, payload BLOB NOT NULL, PRIMARY KEY(level,parent)) WITHOUT ROWID"
            )
            db.execute(
                "CREATE TABLE sources(name TEXT PRIMARY KEY, sha256 TEXT NOT NULL)"
            )
            db.executemany("INSERT INTO sources VALUES (?,?)", sources.items())
            for (level, parent), options in sorted(groups.items()):
                ordered = sorted(
                    options.items(), key=lambda item: (item[1].casefold(), item[0])
                )
                payload = json.dumps(
                    ordered, ensure_ascii=False, separators=(",", ":")
                ).encode()
                db.execute(
                    "INSERT INTO choices VALUES (?,?,?)",
                    (level, parent, zlib.compress(payload, 9)),
                )
            db.commit()
            if db.execute("PRAGMA integrity_check").fetchone() != ("ok",):
                raise ValueError("TERYT integrity check failed")
        finally:
            db.close()
        os.replace(staged, destination)
    finally:
        staged.unlink(missing_ok=True)
    return {
        k: sum(len(v) for (level, _), v in groups.items() if level == k)
        for k in ["province", "county", "municipality", "locality", "street"]
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "directory", type=Path, help="Directory with TERC.zip, SIMC.zip and ULIC.zip"
    )
    parser.add_argument("destination", type=Path)
    args = parser.parse_args()
    print(build(args.directory, args.destination))
