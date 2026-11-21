"""Validated process configuration without credentials in diagnostics."""

import os
import re
from collections.abc import Mapping
from dataclasses import dataclass, field


@dataclass(frozen=True, slots=True)
class Settings:
    token: str = field(repr=False)
    host: str = "127.0.0.1"
    port: int = 8010
    concurrency: int = 4
    task_timeout: int = 5
    log_level: str = "info"
    allow_network_bind: bool = False

    def __post_init__(self) -> None:
        if (
            not isinstance(self.token, str)
            or not re.fullmatch(r"[A-Za-z0-9_-]{32,512}", self.token)
            or "CHANGE_ME" in self.token
        ):
            raise ValueError("PYWORKER_API_TOKEN must be configured")
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
        return cls(
            token=token,
            host=host,
            port=integer("PYWORKER_PORT", 8010, 1024, 65535),
            concurrency=integer("PYWORKER_MAX_CONCURRENCY", 4, 1, 16),
            task_timeout=integer("PYWORKER_TASK_TIMEOUT_SECONDS", 5, 1, 15),
            log_level=level,
            allow_network_bind=network == "true",
        )
