"""Measure Polish/English OCR on 24 synthetic pages. Run with the worker virtualenv."""

import argparse
import io
import os
import time
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont
from pyworker.tasks import ocr

# Four layouts use the same six print sizes, contrasts and blur levels across runs.
DOCUMENTS = [
    (
        "arial.ttf",
        ["Numer faktury FV/2026/017", "Odbiorca Anna Król", "Kwota 1 249,50 PLN"],
    ),
    (
        "times.ttf",
        ["Zgłoszenie 764/2026", "Miejsce Łódź ul. Leśna 14", "Termin 28.05.2026"],
    ),
    ("calibri.ttf", ["Przesyłka AB-61039", "Nadawca Paweł Górski", "Waga 12,75 kg"]),
    ("cour.ttf", ["Pozycja Nr 0085", "Część zamienna P-37/12", "Liczba sztuk 149"]),
]
CONDITIONS = [
    (26, 0, 10, 255),
    (11, 0, 30, 240),
    (13, 0.65, 135, 200),
    (17, 1.25, 30, 230),
    (12, 0.85, 85, 210),
    (10, 0.6, 145, 205),
]


def edit_distance(actual, reference):
    previous = list(range(len(reference) + 1))
    for row, current in enumerate(actual, 1):
        costs = [row]
        for column, expected in enumerate(reference, 1):
            costs.append(
                min(
                    costs[-1] + 1,
                    previous[column] + 1,
                    previous[column - 1] + (current != expected),
                )
            )
        previous = costs
    return previous[-1]


def sample_pages(font_dir):
    for font_name, lines in DOCUMENTS:
        for size, blur, ink, background in CONDITIONS:
            image = Image.new("L", (size * 24, size * 6), background)
            draw = ImageDraw.Draw(image)
            font = ImageFont.truetype(str(font_dir / font_name), size)
            for i, line in enumerate(lines):
                draw.text((size, size // 2 + i * size * 1.6), line, fill=ink, font=font)
            if blur:
                image = image.filter(ImageFilter.GaussianBlur(blur))
            data = io.BytesIO()
            image.save(data, "PNG")
            yield " ".join(lines), data.getvalue()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--font-dir", type=Path, default=Path(os.getenv("WINDIR", ".")) / "Fonts"
    )
    parser.add_argument(
        "--tessdata", type=Path, help="Optional directory with eng and pol models"
    )
    args = parser.parse_args()
    if args.tessdata:
        ocr.TESSDATA = args.tessdata
    corpus = list(sample_pages(args.font_dir))
    char_errors = word_errors = chars = words = 0
    started = time.perf_counter()
    for reference, data in corpus:
        page = ocr.recognize(data)["pages"][0]
        actual = " ".join(word["text"] for word in page["words"])
        char_errors += edit_distance(actual, reference)
        word_errors += edit_distance(actual.split(), reference.split())
        chars += len(reference)
        words += len(reference.split())
    elapsed = time.perf_counter() - started
    print(
        f"{len(corpus)} pages, CER {char_errors}/{chars}, WER {word_errors}/{words}, {elapsed:.2f} s"
    )


if __name__ == "__main__":
    main()
