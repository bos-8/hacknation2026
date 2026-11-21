"""Provision pinned local weights. Inference itself runs offline."""

import argparse
import hashlib
import os
import tempfile
import urllib.request
from pathlib import Path

REVISION = "d25c16f2e57e321f6d2527715c01df9112f956f5"
FILES = {
    "LICENSE": "7fbf88e9c951fe53eb614a46772d0b48ada6d50b351e5e11dcb64b4dc3fb8eb2",
    "config.json": "7162c30da7009cfb9c9af6204782177ef6f5d88e2653fd87d6514308d97dcaa7",
    "modeling_pii_masking.py": "c43724b9ac105a9b74d44aea7565e4c43ddc9d203f519324baa342be01269869",
    "tokenizer.json": "cae14d1c8dda080f23792355b0692b826bf1f1da3c86ebc1b37548a391cf6526",
    "tokenizer_config.json": "aa9c1b0a1c9b48c2f70bacdf64f7dab25194be4ffea0c6a6e4da262360a91d0a",
    "model.safetensors": "f6204155ec540c9323f706e284110ee848b462f0325dc1ece5c7263fc517bbd0",
}


def provision(directory):
    directory.mkdir(parents=True, exist_ok=True)
    for name, expected in FILES.items():
        destination = directory / name
        if destination.is_file():
            with destination.open("rb") as file:
                if hashlib.file_digest(file, "sha256").hexdigest() == expected:
                    continue
        url = f"https://huggingface.co/perplexity-ai/PII-Tracer/resolve/{REVISION}/{name}"
        with tempfile.NamedTemporaryFile(dir=directory, delete=False) as output:
            temp = Path(output.name)
        try:
            digest = hashlib.sha256()
            with urllib.request.urlopen(url, timeout=60) as response, temp.open("wb") as output:
                while chunk := response.read(1024 * 1024):
                    digest.update(chunk)
                    output.write(chunk)
            if digest.hexdigest() != expected:
                raise ValueError(f"Checksum mismatch for {name}")
            os.replace(temp, destination)
        finally:
            temp.unlink(missing_ok=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "directory",
        nargs="?",
        type=Path,
        default=Path(__file__).resolve().parents[2] / ".local/models/pii-tracer",
    )
    provision(parser.parse_args().directory)
