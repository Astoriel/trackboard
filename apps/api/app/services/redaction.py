from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any


REDACTED = "[REDACTED]"

SENSITIVE_KEYS = {
    "email",
    "phone",
    "name",
    "first_name",
    "last_name",
    "address",
    "ip",
    "token",
    "secret",
    "password",
    "authorization",
    "cookie",
    "session",
    "user_id",
    "anonymous_id",
    "device_id",
}

IDENTITY_KEY_FRAGMENTS = (
    "user",
    "anonymous",
    "device",
    "visitor",
    "customer",
    "account",
    "profile",
    "member",
)

EMAIL_RE = re.compile(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", re.IGNORECASE)
IP_RE = re.compile(
    r"\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b"
)
PHONE_RE = re.compile(r"(?<!\w)(?:\+?\d[\d\s().-]{7,}\d)(?!\w)")
JWT_RE = re.compile(r"\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b")
UUID_RE = re.compile(
    r"\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b",
    re.IGNORECASE,
)
LONG_OPAQUE_RE = re.compile(r"^[A-Za-z0-9_-]{32,}$")


@dataclass
class RedactionReport:
    payload_fields_redacted: set[str] = field(default_factory=set)
    sample_values_redacted: int = 0

    def merge(self, other: "RedactionReport") -> None:
        self.payload_fields_redacted.update(other.payload_fields_redacted)
        self.sample_values_redacted += other.sample_values_redacted

    def to_dict(self) -> dict[str, Any]:
        return {
            "payload_fields_redacted": sorted(self.payload_fields_redacted),
            "sample_values_redacted": self.sample_values_redacted,
        }


class RedactionService:
    def redact_payload(self, payload: Any) -> tuple[Any, dict[str, Any]]:
        report = RedactionReport()
        redacted = self._redact_value(payload, path="", key=None, report=report)
        return redacted, report.to_dict()

    def redact_many(self, payloads: list[Any]) -> tuple[list[Any], dict[str, Any]]:
        aggregate = RedactionReport()
        redacted_payloads = []
        for payload in payloads:
            report = RedactionReport()
            redacted_payloads.append(self._redact_value(payload, path="", key=None, report=report))
            aggregate.merge(report)
        return redacted_payloads, aggregate.to_dict()

    def _redact_value(
        self,
        value: Any,
        *,
        path: str,
        key: str | None,
        report: RedactionReport,
    ) -> Any:
        if key and self._is_sensitive_key(key):
            report.payload_fields_redacted.add(path or key)
            report.sample_values_redacted += 1
            return f"[REDACTED:{key}]"

        if isinstance(value, dict):
            redacted: dict[str, Any] = {}
            for child_key, child_value in value.items():
                child_path = f"{path}.{child_key}" if path else str(child_key)
                redacted[child_key] = self._redact_value(
                    child_value,
                    path=child_path,
                    key=str(child_key),
                    report=report,
                )
            return redacted

        if isinstance(value, list):
            return [
                self._redact_value(item, path=f"{path}[{index}]", key=key, report=report)
                for index, item in enumerate(value)
            ]

        if isinstance(value, str) and self._is_sensitive_string(value, key=key):
            if path:
                report.payload_fields_redacted.add(path)
            report.sample_values_redacted += 1
            return REDACTED

        return value

    def _is_sensitive_key(self, key: str) -> bool:
        normalized = key.lower().replace("-", "_").replace(" ", "_")
        if normalized in SENSITIVE_KEYS:
            return True
        parts = set(normalized.split("_"))
        return bool(parts & SENSITIVE_KEYS)

    def _is_sensitive_string(self, value: str, *, key: str | None) -> bool:
        stripped = value.strip()
        if not stripped:
            return False
        if EMAIL_RE.search(stripped) or IP_RE.search(stripped) or JWT_RE.search(stripped):
            return True
        if PHONE_RE.search(stripped):
            return True
        if LONG_OPAQUE_RE.match(stripped):
            return True
        if key and any(fragment in key.lower() for fragment in IDENTITY_KEY_FRAGMENTS):
            return bool(UUID_RE.search(stripped))
        return False
