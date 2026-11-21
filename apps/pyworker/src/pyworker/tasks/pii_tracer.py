"""Local-only inference using the pinned PII-Tracer implementation and safetensors."""

import hashlib
import importlib.util
import os
import sys
from functools import lru_cache
from pathlib import Path

CODE_SHA256 = "c43724b9ac105a9b74d44aea7565e4c43ddc9d203f519324baa342be01269869"
DEFAULT_MODEL = (
    Path(__file__).resolve().parents[3].parent.parent / ".local" / "models" / "pii-tracer"
)
LABELS = {
    "private_person": "OSOBA",
    "account_number": "KONTO",
    "private_address": "ADRES",
    "private_email": "EMAIL",
    "private_phone": "TELEFON",
}


@lru_cache(maxsize=1)
def load_model():
    configured = os.environ.get("PYWORKER_PII_MODEL_DIR")
    if not configured and not (DEFAULT_MODEL / "model.safetensors").is_file():
        return None
    directory = Path(configured) if configured else DEFAULT_MODEL
    code = directory / "modeling_pii_masking.py"
    if hashlib.sha256(code.read_bytes()).hexdigest() != CODE_SHA256:
        raise ValueError("Unexpected PII-Tracer implementation")
    import torch
    from transformers import PreTrainedTokenizerFast

    torch.set_num_threads(min(4, os.cpu_count() or 1))
    spec = importlib.util.spec_from_file_location("formiq_pii_tracer", code)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    model = module.PiiMaskingModel.from_pretrained(
        directory, local_files_only=True, use_safetensors=True
    ).eval()
    model.tokenizer = PreTrainedTokenizerFast(tokenizer_file=str(directory / "tokenizer.json"))
    return model


def model_spans(model, text):
    if model is None:
        return
    offsets = model.tokenizer(text, add_special_tokens=False, return_offsets_mapping=True)[
        "offset_mapping"
    ]
    for index in range(0, len(offsets), 480):
        start = offsets[index][0]
        end = offsets[min(index + 512, len(offsets)) - 1][1]
        window = text[start:end]
        found, _ = model.predict(window)
        for span in found:
            yield start + span.start, start + span.end, LABELS.get(span.label, "DANE")
        if end == len(text):
            break
