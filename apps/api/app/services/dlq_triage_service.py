from __future__ import annotations

import hashlib
import json
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field
from pydantic import ValidationError as PydanticValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import BadRequestError, NotFoundError
from app.models import DLQTriageReport, TrackingPlan
from app.services.ai_service import AIService
from app.services.dlq_grouping import DLQGroupingService, DLQIssueGroup


class DLQRecommendedAction(BaseModel):
    kind: str
    title: str
    rationale: str
    risk: str


class DLQAIReport(BaseModel):
    summary: str
    confidence: str
    likely_root_cause: str
    evidence: list[str] = Field(default_factory=list)
    recommended_actions: list[DLQRecommendedAction] = Field(default_factory=list)
    questions: list[str] = Field(default_factory=list)


class DLQTriageService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.grouping = DLQGroupingService(db)
        self.ai = AIService(db)

    async def get_cached_report(self, plan_id: UUID, fingerprint: str) -> dict[str, Any]:
        result = await self.db.execute(
            select(DLQTriageReport)
            .where(DLQTriageReport.plan_id == plan_id)
            .where(DLQTriageReport.group_fingerprint == fingerprint)
            .order_by(DLQTriageReport.created_at.desc())
            .limit(1)
        )
        report = result.scalar_one_or_none()
        if report is None:
            raise NotFoundError("DLQ triage report", code="dlq_triage_report_not_found")
        return self._report_response(report)

    async def triage_group(
        self,
        *,
        plan_id: UUID,
        fingerprint: str,
        created_by: UUID | None,
    ) -> dict[str, Any]:
        group = await self.grouping.get_group(plan_id, fingerprint)
        if group is None:
            raise NotFoundError("DLQ group", code="dlq_group_not_found")

        input_package = self._build_input_package(group)
        input_hash = self._input_hash(input_package)
        cached = await self._get_cache(plan_id, fingerprint, input_hash)
        if cached is not None:
            return self._report_response(cached)

        plan = await self.db.get(TrackingPlan, plan_id)
        org_id = plan.org_id if plan is not None else None
        try:
            raw_report = await self.ai.triage_dlq_issue(input_package, org_id=org_id)
        except BadRequestError as exc:
            if exc.code != "ai_provider_not_configured":
                raise
            return self._deterministic_report_response(group, input_package, input_hash)

        try:
            validated = DLQAIReport.model_validate(raw_report)
        except PydanticValidationError as exc:
            raise BadRequestError(
                "AI provider returned malformed DLQ triage output.",
                code="ai_malformed_response",
                extra={"errors": exc.errors()},
            ) from exc

        model_name = raw_report.get("_model") if isinstance(raw_report, dict) else None
        report_row = DLQTriageReport(
            plan_id=plan_id,
            group_fingerprint=fingerprint,
            version_id=group.version_id,
            event_name=group.event_name,
            input_hash=input_hash,
            report=validated.model_dump(mode="json"),
            redaction_report=group.redaction_report,
            model=model_name,
            created_by=created_by,
        )
        self.db.add(report_row)
        await self.db.flush()
        return self._report_response(report_row)

    async def _get_cache(
        self,
        plan_id: UUID,
        fingerprint: str,
        input_hash: str,
    ) -> DLQTriageReport | None:
        result = await self.db.execute(
            select(DLQTriageReport)
            .where(DLQTriageReport.plan_id == plan_id)
            .where(DLQTriageReport.group_fingerprint == fingerprint)
            .where(DLQTriageReport.input_hash == input_hash)
            .order_by(DLQTriageReport.created_at.desc())
            .limit(1)
        )
        return result.scalar_one_or_none()

    def _build_input_package(self, group: DLQIssueGroup) -> dict[str, Any]:
        material = dict(group.fingerprint_material)
        contract_expectation = material.pop("contract_expectation", None)
        return {
            "fingerprint": group.fingerprint,
            "event_name": group.event_name,
            "version_id": str(group.version_id) if group.version_id else None,
            "count": group.count,
            "time_window": {
                "first_seen_at": group.first_seen_at.isoformat() if group.first_seen_at else None,
                "last_seen_at": group.last_seen_at.isoformat() if group.last_seen_at else None,
            },
            "top_violation": group.top_violation,
            "source_summary": group.source_summary,
            "fingerprint_material": material,
            "contract_expectation": contract_expectation,
            "redacted_samples": group.redacted_samples,
            "redaction": group.redaction_report,
            "instructions": {
                "use_only_evidence": True,
                "do_not_infer_unseen_payload_values": True,
                "raw_payloads_removed": True,
            },
        }

    def _input_hash(self, input_package: dict[str, Any]) -> str:
        canonical = json.dumps(input_package, sort_keys=True, separators=(",", ":"), default=str)
        return f"sha256:{hashlib.sha256(canonical.encode('utf-8')).hexdigest()}"

    def _deterministic_report_response(
        self,
        group: DLQIssueGroup,
        input_package: dict[str, Any],
        input_hash: str,
    ) -> dict[str, Any]:
        violation = input_package.get("top_violation") or {}
        expectation = input_package.get("contract_expectation")
        source_summary = input_package.get("source_summary") or {}
        redaction = input_package.get("redaction") or {}

        report = {
            "fingerprint": group.fingerprint,
            "status": "deterministic_only",
            "summary": self._deterministic_summary(group, violation, expectation, source_summary),
            "confidence": self._deterministic_confidence(violation, expectation),
            "likely_root_cause": self._deterministic_root_cause(violation, expectation),
            "evidence": self._deterministic_evidence(group, violation, expectation, source_summary, redaction),
            "recommended_actions": self._deterministic_actions(violation, expectation, source_summary),
            "questions": self._deterministic_questions(violation, source_summary),
            "redaction": redaction,
            "input_hash": input_hash,
            "model": None,
            "created_at": None,
        }
        return report

    def _deterministic_summary(
        self,
        group: DLQIssueGroup,
        violation: dict[str, Any],
        expectation: dict[str, Any] | None,
        source_summary: dict[str, Any],
    ) -> str:
        path = violation.get("path") or "payload"
        property_name = violation.get("property_name") or path
        source = source_summary.get("source_label")
        source_clause = f" from {source}" if source else ""
        if expectation and expectation.get("type"):
            expected = expectation["type"]
            actual = violation.get("actual") or "unknown"
            return (
                f"{group.count} {group.event_name} event(s){source_clause} are failing at {path}: "
                f"{property_name} is {actual}, but the contract expects {expected}."
            )
        return f"{group.count} {group.event_name} event(s){source_clause} are failing validation at {path}."

    def _deterministic_confidence(
        self,
        violation: dict[str, Any],
        expectation: dict[str, Any] | None,
    ) -> str:
        if violation.get("code") and violation.get("path") and expectation:
            return "high"
        if violation.get("code") and violation.get("path"):
            return "medium"
        return "low"

    def _deterministic_root_cause(
        self,
        violation: dict[str, Any],
        expectation: dict[str, Any] | None,
    ) -> str:
        code = str(violation.get("code") or "validation_error")
        path = violation.get("path") or "payload"
        property_name = violation.get("property_name") or path
        expected_type = expectation.get("type") if expectation else violation.get("expected")
        actual = violation.get("actual") or "unknown"

        if code == "type_mismatch" and expected_type:
            return (
                f"Instrumentation is sending {property_name} as {actual}, while the published contract "
                f"expects {expected_type}."
            )
        if code in {"missing_required_property", "required_property_missing"}:
            return f"Instrumentation appears to omit required contract property {property_name}."
        if code in {"enum_violation", "invalid_enum_value"}:
            return f"Instrumentation is sending a value for {property_name} that is outside the contract constraints."
        if expected_type:
            return f"Payload shape at {path} does not match the published contract expectation for {property_name}."
        return f"Payload shape at {path} does not match the validator's recorded expectation."

    def _deterministic_evidence(
        self,
        group: DLQIssueGroup,
        violation: dict[str, Any],
        expectation: dict[str, Any] | None,
        source_summary: dict[str, Any],
        redaction: dict[str, Any],
    ) -> list[str]:
        evidence = [
            (
                f"{group.count} rejected {group.event_name} event(s) in the observed window "
                f"{self._format_time(group.first_seen_at)} to {self._format_time(group.last_seen_at)}."
            ),
            (
                f"Top violation is {violation.get('code') or 'validation_error'} at "
                f"{violation.get('path') or 'payload'}."
            ),
        ]

        if expectation:
            evidence.append(self._format_expectation(expectation))
        if source_summary:
            evidence.append(self._format_source_summary(source_summary))
        if redaction:
            evidence.append(self._format_redaction(redaction))

        return [item for item in evidence if item]

    def _deterministic_actions(
        self,
        violation: dict[str, Any],
        expectation: dict[str, Any] | None,
        source_summary: dict[str, Any],
    ) -> list[dict[str, str]]:
        path = violation.get("path") or "payload"
        property_name = violation.get("property_name") or path
        source = source_summary.get("source_label") or "the emitting source"
        actions = [
            {
                "kind": "fix_instrumentation",
                "title": f"Align {property_name} with the published contract",
                "rationale": self._instrumentation_rationale(violation, expectation),
                "risk": "low",
            },
            {
                "kind": "investigate_source",
                "title": f"Inspect {source} payload construction",
                "rationale": "The group fingerprint points to the same validation path and source metadata.",
                "risk": "low",
            },
        ]
        if expectation:
            actions.append(
                {
                    "kind": "update_contract",
                    "title": "Review whether the contract expectation is still correct",
                    "rationale": "Only change the tracking plan if the observed payload behavior is intentional.",
                    "risk": "medium",
                }
            )
        return actions

    def _deterministic_questions(
        self,
        violation: dict[str, Any],
        source_summary: dict[str, Any],
    ) -> list[str]:
        property_name = violation.get("property_name") or violation.get("path") or "this payload path"
        questions = [f"Did {property_name} intentionally change in the emitting instrumentation?"]
        app_versions = source_summary.get("app_versions") or []
        if app_versions:
            questions.append(f"Did the affected app version(s) {', '.join(map(str, app_versions[:5]))} ship a payload change?")
        else:
            questions.append("Which release or source change first introduced this validation failure?")
        return questions

    def _instrumentation_rationale(
        self,
        violation: dict[str, Any],
        expectation: dict[str, Any] | None,
    ) -> str:
        if expectation and expectation.get("type"):
            return (
                f"The validator recorded {violation.get('actual') or 'unknown'} at "
                f"{violation.get('path') or 'payload'}, while the contract type is {expectation['type']}."
            )
        return f"The validator recorded repeated failures at {violation.get('path') or 'payload'}."

    def _format_time(self, value: Any) -> str:
        return value.isoformat() if value else "unknown"

    def _format_expectation(self, expectation: dict[str, Any]) -> str:
        property_name = expectation.get("property_name") or "property"
        expected_type = expectation.get("type") or "unspecified"
        required = expectation.get("required", False)
        constraints = expectation.get("constraints") or {}
        constraint_text = self._format_constraints(constraints)
        suffix = f"; constraints: {constraint_text}" if constraint_text else ""
        return f"Contract expectation for {property_name}: type={expected_type}, required={required}{suffix}."

    def _format_constraints(self, constraints: dict[str, Any]) -> str:
        parts: list[str] = []
        for key in sorted(constraints)[:5]:
            value = constraints[key]
            if isinstance(value, list):
                parts.append(f"{key}({len(value)} value(s))")
            elif isinstance(value, dict):
                parts.append(f"{key}({len(value)} key(s))")
            else:
                parts.append(f"{key}={value}")
        return ", ".join(parts)

    def _format_source_summary(self, source_summary: dict[str, Any]) -> str:
        parts: list[str] = []
        if source_summary.get("source_label"):
            parts.append(f"source={source_summary['source_label']}")
        for key in ("app_versions", "platforms", "libraries"):
            values = source_summary.get(key) or []
            if values:
                parts.append(f"{key}={', '.join(map(str, values[:5]))}")
        if not parts and source_summary.get("source_labels"):
            labels = source_summary["source_labels"]
            parts.append(f"source_labels={', '.join(sorted(map(str, labels))[:5])}")
        return f"Source summary: {'; '.join(parts)}." if parts else ""

    def _format_redaction(self, redaction: dict[str, Any]) -> str:
        fields = redaction.get("payload_fields_redacted") or []
        count = redaction.get("sample_values_redacted") or 0
        if fields:
            return f"Redaction removed {count} sensitive sample value(s) from fields: {', '.join(map(str, fields[:8]))}."
        return f"Redaction report recorded {count} sensitive sample value(s) removed."

    def _report_response(self, report: DLQTriageReport) -> dict[str, Any]:
        payload = {
            "fingerprint": report.group_fingerprint,
            "status": "ready",
            **(report.report or {}),
            "redaction": report.redaction_report or {},
            "input_hash": report.input_hash,
            "model": report.model,
            "created_at": report.created_at,
        }
        return payload
