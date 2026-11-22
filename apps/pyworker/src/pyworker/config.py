"""Validated process configuration without credentials in diagnostics."""

import os
import re
from collections.abc import Mapping
from dataclasses import dataclass, field
from pathlib import Path

from pyworker.eden import EdenSettings
from pyworker.pipeline import EDEN_CHAT, PipelineSettings
from pyworker.vision import MODEL as VISION_MODEL


@dataclass(frozen=True, slots=True)
class Settings:
    token: str = field(repr=False)
    host: str = "127.0.0.1"
    port: int = 8010
    concurrency: int = 4
    task_timeout: int = 5
    log_level: str = "info"
    allow_network_bind: bool = False
    eden: EdenSettings | None = None
    pipeline: PipelineSettings | None = None

    forms_token: str = field(default="", repr=False)

    def __post_init__(self) -> None:
        if (
            not isinstance(self.token, str)
            or not re.fullmatch(r"[A-Za-z0-9_-]{32,512}", self.token)
            or "CHANGE_ME" in self.token
        ):
            raise ValueError("PYWORKER_API_TOKEN must be configured")
        if self.forms_token and (
            not re.fullmatch(r"[A-Za-z0-9_-]{32,512}", self.forms_token)
            or "CHANGE_ME" in self.forms_token
            or self.forms_token == self.token
        ):
            raise ValueError("Invalid PYWORKER_FORMS_TOKEN")
        if type(self.allow_network_bind) is not bool:
            raise ValueError("Invalid PYWORKER_ALLOW_NETWORK_BIND")
        if self.host not in {"127.0.0.1", "::1"} and not (
            self.allow_network_bind and self.host == "0.0.0.0"
        ):
            raise ValueError(
                "PYWORKER_HOST requires loopback or an explicit private-network opt-in"
            )
        for key, value, minimum, maximum in [
            ("PYWORKER_PORT", self.port, 1024, 65535),
            ("PYWORKER_MAX_CONCURRENCY", self.concurrency, 1, 16),
            ("PYWORKER_TASK_TIMEOUT_SECONDS", self.task_timeout, 1, 15),
        ]:
            if type(value) is not int or not minimum <= value <= maximum:
                raise ValueError(f"Invalid {key}")
        if self.log_level not in {"error", "warning", "info", "debug"}:
            raise ValueError("Invalid PYWORKER_LOG_LEVEL")

    @classmethod
    def from_environment(cls, env: Mapping[str, str] | None = None) -> "Settings":
        values = os.environ if env is None else env

        def integer(key: str, default: int, minimum: int, maximum: int) -> int:
            value = values.get(key, str(default))
            if len(value) > 6 or not value.isascii() or not value.isdecimal():
                raise ValueError(f"Invalid {key}")
            if not minimum <= int(value) <= maximum:
                raise ValueError(f"Invalid {key}")
            return int(value)

        token = values.get("PYWORKER_API_TOKEN", "")
        host = values.get("PYWORKER_HOST", "127.0.0.1")
        level = values.get("PYWORKER_LOG_LEVEL", "info")
        network = values.get("PYWORKER_ALLOW_NETWORK_BIND", "false")
        if network not in {"true", "false"}:
            raise ValueError("Invalid PYWORKER_ALLOW_NETWORK_BIND")
        form_mode = values.get("PYWORKER_FORM_MODE", "bypass")
        if form_mode not in {"bypass", "eden", "ocr", "vision", "pipeline", "hybrid", "agentcore"}:
            raise ValueError("Invalid PYWORKER_FORM_MODE")
        eden = None
        pipeline = None
        if form_mode in {"eden", "ocr", "vision", "agentcore"}:
            harness = ""
            if form_mode == "agentcore":
                from urllib.parse import urlsplit

                url = urlsplit(values.get("PYWORKER_HARNESS_API_URL", ""))
                if url.scheme != "https" or not url.hostname or url.username or url.password or url.query or url.fragment:
                    raise ValueError("Set PYWORKER_HARNESS_API_URL to the HTTPS API endpoint")
                if len(values.get("PYWORKER_HARNESS_API_KEY", "")) < 32:
                    raise ValueError("Set PYWORKER_HARNESS_API_KEY")
                harness = "https-api"
            if harness:
                from datetime import datetime

                try:
                    expiry = datetime.fromisoformat(values["PYWORKER_HARNESS_EXPIRES_AT"])
                    if expiry.tzinfo is None:
                        raise ValueError
                except (KeyError, ValueError):
                    raise ValueError("Set PYWORKER_HARNESS_EXPIRES_AT to a timezone-aware timestamp") from None
            defaults = EdenSettings(api_key="")
            eden = EdenSettings(
                doc_classpath=values.get("PYWORKER_DOC_CLASSPATH", ""),
                api_key=(values.get("EDENAI_API_KEY") or values.get("PYWORKER_HARNESS_API_KEY", "")).strip(),
                harness_expires_at=values.get("PYWORKER_HARNESS_EXPIRES_AT", ""),
                harness_api_url=values.get("PYWORKER_HARNESS_API_URL", ""),
                harness_api_key=values.get("PYWORKER_HARNESS_API_KEY", ""),
                ocr_only=form_mode == "ocr",
                transcription_model=values.get("EDENAI_VISION_MODEL") or VISION_MODEL,
                vision_model=(values.get("EDENAI_VISION_MODEL") or VISION_MODEL)
                if form_mode in {"vision", "agentcore"}
                else "",
                upload_url=values.get("EDENAI_UPLOAD_URL") or defaults.upload_url,
                llm_url=values.get("EDENAI_LLM_URL") or (values.get("PYWORKER_HARNESS_API_URL") if harness else None) or defaults.llm_url,
                llm_model=values.get("EDENAI_LLM_MODEL") or defaults.llm_model,
                local_llm_url=""
                if form_mode in {"vision", "agentcore"}
                else values.get("PYWORKER_LOCAL_LLM_URL", "").strip(),
                local_llm_model=values.get("PYWORKER_LOCAL_LLM_MODEL") or defaults.local_llm_model,
                timeout_seconds=integer("EDENAI_TIMEOUT_SECONDS", defaults.timeout_seconds, 1, 300),
                max_input_chars=integer(
                    "EDENAI_MAX_INPUT_CHARS", defaults.max_input_chars, 1, 500_000
                ),
                max_output_tokens=integer(
                    "EDENAI_MAX_OUTPUT_TOKENS", defaults.max_output_tokens, 1, 32_768
                ),
            )
        if form_mode in {"pipeline", "hybrid"}:
            defaults = PipelineSettings()
            hosted = form_mode == "hybrid"
            key = values.get("EDENAI_API_KEY", "").strip() if hosted else ""
            if hosted and key in {"", "CHANGE_ME"}:
                raise ValueError("Hybrid mode requires EDENAI_API_KEY")
            pipeline = PipelineSettings(
                eden_key=key,
                qwen_url=EDEN_CHAT
                if hosted
                else values.get("PYWORKER_LOCAL_LLM_URL") or defaults.qwen_url,
                qwen_model=(values.get("EDENAI_LLM_MODEL") or VISION_MODEL)
                if hosted
                else (values.get("PYWORKER_LOCAL_LLM_MODEL") or defaults.qwen_model),
                timeout_seconds=integer("PYWORKER_PIPELINE_TIMEOUT_SECONDS", 300, 1, 300),
                document_python=values.get("PYWORKER_DOCUMENT_PYTHON") or defaults.document_python,
                assets=Path(values.get("PYWORKER_PIPELINE_ASSETS") or defaults.assets),
                device=values.get("PYWORKER_DOCUMENT_DEVICE") or defaults.device,
                doc_classpath=values.get("PYWORKER_DOC_CLASSPATH", ""),
                prompt_file=Path(
                    values.get("PYWORKER_PIPELINE_PROMPT_FILE") or defaults.prompt_file
                ),
            )
        return cls(
            token=token,
            forms_token=values.get("PYWORKER_FORMS_TOKEN", ""),
            eden=eden,
            pipeline=pipeline,
            host=host,
            port=integer("PYWORKER_PORT", 8010, 1024, 65535),
            concurrency=integer("PYWORKER_MAX_CONCURRENCY", 4, 1, 16),
            task_timeout=integer("PYWORKER_TASK_TIMEOUT_SECONDS", 5, 1, 15),
            log_level=level,
            allow_network_bind=network == "true",
        )
