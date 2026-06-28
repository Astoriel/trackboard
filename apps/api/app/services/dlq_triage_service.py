from __future__ import annotations

import hashlib
import json
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field, ValidationError as PydanticValidationError
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
        raw_report = await self.ai.triage_dlq_issue(input_package, org_id=org_id)
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
