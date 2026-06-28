from __future__ import annotations

import hashlib
import json
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import DLQTriageReport, InvalidPayloadError, ValidationLog, Version
from app.services.redaction import RedactionService


SDK_METADATA_PATHS = (
    ("context.library.name", ("context", "library", "name")),
    ("context.library.version", ("context", "library", "version")),
    ("context.device.type", ("context", "device", "type")),
    ("app.version", ("app", "version")),
    ("platform", ("platform",)),
)


@dataclass(frozen=True)
class DLQViolation:
    code: str
    path: str
    property_name: str | None = None
    expected: Any | None = None
    actual: Any | None = None


@dataclass
class DLQIssueGroup:
    fingerprint: str
    fingerprint_material: dict[str, Any]
    event_name: str
    version_id: UUID | None
    count: int
    first_seen_at: datetime | None
    last_seen_at: datetime | None
    top_violation: dict[str, Any]
    source_summary: dict[str, Any]
    sample_count: int
    samples: list[dict[str, Any]] = field(default_factory=list)
    redacted_samples: list[dict[str, Any]] = field(default_factory=list)
    redaction_report: dict[str, Any] = field(default_factory=dict)
    has_triage_report: bool = False

    def summary_dict(self) -> dict[str, Any]:
        return {
            "fingerprint": self.fingerprint,
            "event_name": self.event_name,
            "version_id": self.version_id,
            "count": self.count,
            "first_seen_at": self.first_seen_at,
            "last_seen_at": self.last_seen_at,
            "top_violation": self.top_violation,
            "source_summary": self.source_summary,
            "sample_count": self.sample_count,
            "has_triage_report": self.has_triage_report,
        }

    def detail_dict(self) -> dict[str, Any]:
        payload = self.summary_dict()
        payload.update(
            {
                "fingerprint_material": self.fingerprint_material,
                "redacted_samples": self.redacted_samples,
                "redaction": self.redaction_report,
            }
        )
        return payload


class DLQGroupingService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.redaction = RedactionService()

    async def list_groups(self, plan_id: UUID) -> list[DLQIssueGroup]:
        rows = await self._load_rows(plan_id)
        groups = self._group_rows(plan_id, rows)
        await self._attach_triage_flags(plan_id, groups)
        oldest = datetime.min.replace(tzinfo=timezone.utc)
        return sorted(groups, key=lambda group: group.last_seen_at or oldest, reverse=True)

    async def get_group(self, plan_id: UUID, fingerprint: str) -> DLQIssueGroup | None:
        for group in await self.list_groups(plan_id):
            if group.fingerprint == fingerprint:
                return group
        return None

    async def _load_rows(self, plan_id: UUID) -> list[tuple[InvalidPayloadError, ValidationLog | None, Version | None]]:
        invalid_result = await self.db.execute(
            select(InvalidPayloadError)
            .where(InvalidPayloadError.plan_id == plan_id)
            .order_by(InvalidPayloadError.last_seen_at.desc(), InvalidPayloadError.created_at.desc())
            .limit(500)
        )
        invalid_rows = list(invalid_result.scalars().all())
        log_ids = [row.validation_log_id for row in invalid_rows if row.validation_log_id]
        version_ids = [row.version_id for row in invalid_rows if row.version_id]

        logs: dict[UUID, ValidationLog] = {}
        if log_ids:
            log_result = await self.db.execute(select(ValidationLog).where(ValidationLog.id.in_(log_ids)))
            logs = {log.id: log for log in log_result.scalars().all()}

        versions: dict[UUID, Version] = {}
        if version_ids:
            version_result = await self.db.execute(select(Version).where(Version.id.in_(version_ids)))
            versions = {version.id: version for version in version_result.scalars().all()}

        return [(row, logs.get(row.validation_log_id), versions.get(row.version_id)) for row in invalid_rows]

    def _group_rows(
        self,
        plan_id: UUID,
        rows: list[tuple[InvalidPayloadError, ValidationLog | None, Version | None]],
    ) -> list[DLQIssueGroup]:
        buckets: dict[str, list[tuple[InvalidPayloadError, ValidationLog | None, Version | None, DLQViolation, dict[str, Any]]]] = defaultdict(list)
        for row, log, version in rows:
            violation = self._primary_violation(row, log)
            source_metadata = self._source_metadata(row.payload or {}, log)
            expectation = self._contract_expectation(version, row.event_name, violation.property_name)
            material = self._fingerprint_material(
                plan_id=plan_id,
                row=row,
                violation=violation,
                source_metadata=source_metadata,
                expectation=expectation,
            )
            buckets[self.fingerprint_for_material(material)].append(
                (row, log, version, violation, {**material, "contract_expectation": expectation})
            )

        groups: list[DLQIssueGroup] = []
        for fingerprint, items in buckets.items():
            first_item = items[0]
            first_row, _, _, first_violation, material = first_item
            samples = [item[0].payload or {} for item in items[:3]]
            redacted_samples, redaction_report = self.redaction.redact_many(samples)
            source_summary = self._source_summary(items)
            groups.append(
                DLQIssueGroup(
                    fingerprint=fingerprint,
                    fingerprint_material=material,
                    event_name=first_row.event_name,
                    version_id=first_row.version_id,
                    count=sum(item[0].occurrence_count or 1 for item in items),
                    first_seen_at=min((item[0].first_seen_at for item in items if item[0].first_seen_at), default=None),
                    last_seen_at=max((item[0].last_seen_at for item in items if item[0].last_seen_at), default=None),
                    top_violation={
                        "code": first_violation.code,
                        "path": first_violation.path,
                        "property_name": first_violation.property_name,
                        "expected": self._safe_expected(first_violation.expected),
                        "actual": self._actual_kind(first_violation.actual),
                    },
                    source_summary=source_summary,
                    sample_count=len(samples),
                    samples=samples,
                    redacted_samples=redacted_samples,
                    redaction_report=redaction_report,
                )
            )
        return groups

    async def _attach_triage_flags(self, plan_id: UUID, groups: list[DLQIssueGroup]) -> None:
        if not groups:
            return
        fingerprints = [group.fingerprint for group in groups]
        result = await self.db.execute(
            select(DLQTriageReport.group_fingerprint)
            .where(DLQTriageReport.plan_id == plan_id)
            .where(DLQTriageReport.group_fingerprint.in_(fingerprints))
        )
        existing = set(result.scalars().all())
        for group in groups:
            group.has_triage_report = group.fingerprint in existing

    def _primary_violation(self, row: InvalidPayloadError, log: ValidationLog | None) -> DLQViolation:
        if log and log.errors:
            error = dict(log.errors[0])
            return DLQViolation(
                code=str(error.get("code") or "validation_error"),
                path=str(error.get("path") or "payload"),
                property_name=error.get("property_name"),
                expected=error.get("expected"),
                actual=error.get("actual"),
            )
        return DLQViolation(
            code="validation_error",
            path="payload",
            property_name=None,
            expected=row.error_reason,
            actual="invalid_payload",
        )

    def _fingerprint_material(
        self,
        *,
        plan_id: UUID,
        row: InvalidPayloadError,
        violation: DLQViolation,
        source_metadata: dict[str, Any],
        expectation: dict[str, Any] | None,
    ) -> dict[str, Any]:
        return {
            "plan_id": str(plan_id),
            "version_id": str(row.version_id) if row.version_id else None,
            "event_name": row.event_name,
            "code": violation.code,
            "path": violation.path,
            "property_name": violation.property_name,
            "expected_kind": self._expected_kind(violation.expected, expectation),
            "actual_kind": self._actual_kind(violation.actual),
            "source_label": source_metadata.get("source_label"),
            "context_library_name": source_metadata.get("context.library.name"),
            "context_library_version": source_metadata.get("context.library.version"),
            "context_device_type": source_metadata.get("context.device.type"),
            "app_version": source_metadata.get("app.version"),
            "platform": source_metadata.get("platform"),
        }

    def fingerprint_for_material(self, material: dict[str, Any]) -> str:
        canonical = json.dumps(material, sort_keys=True, separators=(",", ":"), default=str)
        return f"sha256:{hashlib.sha256(canonical.encode('utf-8')).hexdigest()}"

    def _source_metadata(self, payload: dict[str, Any], log: ValidationLog | None) -> dict[str, Any]:
        metadata: dict[str, Any] = {"source_label": log.source_label if log else None}
        for label, path in SDK_METADATA_PATHS:
            value = self._get_path(payload, path)
            if isinstance(value, (str, int, float, bool)):
                metadata[label] = str(value)
        return metadata

    def _source_summary(
        self,
        items: list[tuple[InvalidPayloadError, ValidationLog | None, Version | None, DLQViolation, dict[str, Any]]],
    ) -> dict[str, Any]:
        labels: Counter[str] = Counter()
        app_versions: set[str] = set()
        platforms: set[str] = set()
        libraries: set[str] = set()
        for row, log, _, _, _ in items:
            metadata = self._source_metadata(row.payload or {}, log)
            if metadata.get("source_label"):
                labels[str(metadata["source_label"])] += row.occurrence_count or 1
            if metadata.get("app.version"):
                app_versions.add(str(metadata["app.version"]))
            if metadata.get("platform"):
                platforms.add(str(metadata["platform"]))
            if metadata.get("context.library.name"):
                libraries.add(str(metadata["context.library.name"]))

        top_label = labels.most_common(1)[0][0] if labels else None
        return {
            "source_label": top_label,
            "source_labels": dict(labels),
            "app_versions": sorted(app_versions),
            "platforms": sorted(platforms),
            "libraries": sorted(libraries),
        }

    def _contract_expectation(
        self,
        version: Version | None,
        event_name: str,
        property_name: str | None,
    ) -> dict[str, Any] | None:
        if version is None or property_name is None:
            return None
        for event in (version.snapshot or {}).get("events", []):
            if event.get("event_name") != event_name:
                continue
            for prop in event.get("properties", []):
                if prop.get("name") == property_name:
                    return {
                        "property_name": property_name,
                        "type": prop.get("type"),
                        "required": prop.get("required", False),
                        "constraints": prop.get("constraints") or {},
                    }
        return None

    def _get_path(self, payload: dict[str, Any], path: tuple[str, ...]) -> Any:
        value: Any = payload
        for part in path:
            if not isinstance(value, dict):
                return None
            value = value.get(part)
        return value

    def _expected_kind(self, expected: Any, expectation: dict[str, Any] | None) -> str | None:
        if expectation and expectation.get("type"):
            constraints = expectation.get("constraints") or {}
            enum_values = constraints.get("enum_values", constraints.get("enum"))
            if enum_values is not None:
                return f"{expectation['type']}:enum"
            return str(expectation["type"])
        if isinstance(expected, str):
            return expected
        if isinstance(expected, list):
            return "enum"
        if expected is None:
            return None
        return type(expected).__name__

    def _actual_kind(self, actual: Any) -> str | None:
        if actual is None:
            return None
        if isinstance(actual, str) and actual in {"string", "integer", "float", "boolean", "array", "object"}:
            return actual
        if isinstance(actual, str):
            return "string"
        if isinstance(actual, bool):
            return "boolean"
        if isinstance(actual, int):
            return "integer"
        if isinstance(actual, float):
            return "float"
        if isinstance(actual, list):
            return "array"
        if isinstance(actual, dict):
            return "object"
        return type(actual).__name__

    def _safe_expected(self, expected: Any) -> Any:
        if isinstance(expected, (str, int, float, bool)) or expected is None:
            return expected
        if isinstance(expected, list):
            return expected[:20]
        if isinstance(expected, dict):
            return {key: expected[key] for key in sorted(expected)[:20]}
        return str(expected)
