"""Improve uncertain word readings without changing page or redaction coordinates."""

import math

from PIL import Image, ImageFilter, ImageOps
from tesserocr import PSM, RIL

# Bound the additional CPU and image memory spent on noisy pages.
MAX_WORD_RETRIES = 12
MAX_CROP_PIXELS = 250_000
LOW_CONFIDENCE = 80


def sharpen_text(image):
    gray = ImageOps.autocontrast(image.convert("L"))
    return gray.filter(ImageFilter.UnsharpMask(radius=1, percent=120, threshold=3))


def map_box(box, source_size, target_size):
    """Round outwards so that changing raster size preserves every covered pixel."""
    x, y, r, b = box
    w, h = source_size
    tw, th = target_size
    return x * tw // w, y * th // h, (r * tw + w - 1) // w, (b * th + h - 1) // h


def _retry_crop(engine, source, box, scale, upside_down, word):
    w, h = (box[2] - box[0]) * scale, (box[3] - box[1]) * scale
    if (w + 20) * (h + 20) > MAX_CROP_PIXELS:
        return False
    crop = source.crop(box)
    if upside_down:
        crop = crop.transpose(Image.Transpose.ROTATE_180)
    if scale > 1:
        crop = crop.resize((w, h), Image.Resampling.LANCZOS)
    engine.SetImage(ImageOps.expand(sharpen_text(crop), border=10, fill=255))
    engine.Recognize()
    iterator = engine.GetIterator()
    if not iterator or iterator.Empty(RIL.WORD):
        return False
    text = (iterator.GetUTF8Text(RIL.WORD) or "").strip()
    confidence = iterator.Confidence(RIL.WORD)
    if (
        not text
        or len(text) > 500
        or 2 * max(len(text), len(word.text)) > 3 * min(len(text), len(word.text))
        or iterator.Next(RIL.WORD)
        or confidence < max(80, word.confidence + 8)
    ):
        return False
    word.text = text
    word.confidence = confidence
    return True


def refine_words(engine, image, words, *, upside_down, detail=None):
    candidates = sorted(
        (word for word in words if word.confidence < LOW_CONFIDENCE),
        key=lambda word: word.confidence,
    )
    if not candidates:
        return
    original_mode = engine.GetPageSegMode()
    engine.SetPageSegMode(PSM.SINGLE_WORD)
    try:
        for word in candidates[:MAX_WORD_RETRIES]:
            left, top, right, bottom = word.box
            height = bottom - top
            pad = max(1, min(4, height // 6))
            box = (
                max(0, left - pad),
                max(0, top - pad),
                min(image.width, right + pad),
                min(image.height, bottom + pad),
            )
            sources = (detail, image) if detail is not None else (image,)
            for source in sources:
                crop_box = map_box(box, image.size, source.size)
                glyph_height = height * source.height / image.height
                zoom = (
                    math.ceil(48 / glyph_height) if source is detail else round(32 / glyph_height)
                )
                scale = max(1, min(3, zoom))
                if _retry_crop(engine, source, crop_box, scale, upside_down, word):
                    break
    finally:
        engine.SetPageSegMode(original_mode)
