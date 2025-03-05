from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID, uuid4

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError
from app.models import InvalidPayloadError, ValidationLog
from app.schemas.tracking_plan import (
    ComplianceStats,
    ValidateBatchRequest,
    ValidateRequest,
    ValidateResponse,
)
from app.services.snapshot_service import SnapshotService
from app.services.validation_engine import validate_payload


class ValidationService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.snapshot_service = SnapshotService(db)

    async def validate_event(
        self,
        *,
        plan_id: UUID,
        api_key_id: UUID,
        req: ValidateRequest,
        source_ip: str | None = None,
    ) -> ValidateResponse:
        version = await self.snapshot_service.get_latest_version(plan_id)
        if version is None:
            raise ConflictError(
                "Validation requires a published version.",
                code="no_published_version",
            )

        result = validate_payload(
            version.snapshot,
            event_name=req.event,
            payload=req.properties,
            mode=req.mode,
        )
        request_id = req.request_id or uuid4()
        log = ValidationLog(
            plan_id=plan_id,
            event_name=req.event,
            payload=req.properties,
            is_valid=result["valid"],
            errors=[violation.model_dump(mode="json") for violation in result["violations"]],
            version_id=version.id,
            api_key_id=api_key_id,
            request_id=request_id,
            source_ip=source_ip,
            source_label=req.source,
        )
        self.db.add(log)
        await self.db.flush()

        if not result["valid"] and req.mode in {"block", "quarantine"}:
            await self._upsert_invalid_payload_error(
                plan_id=plan_id,
                version_id=version.id,
                validation_log_id=log.id,
                event_name=req.event,
                payload=req.properties,
                error_reason="; ".join(violation.message for violation in result["violations"]),
            )

        return ValidateResponse(
            valid=result["valid"],
            mode=req.mode,
            version_id=version.id,
            event=req.event,
            violations=result["violations"],
            validated_at=datetime.now(timezone.utc),
        )

    async def validate_batch(
        self,
        *,
        plan_id: UUID,
        api_key_id: UUID,
        req: ValidateBatchRequest,
        source_ip: str | None = None,
    ) -> list[ValidateResponse]:
        responses: list[ValidateResponse] = []
        for item in req.events:
            responses.append(
                await self.validate_event(
                    plan_id=plan_id,
                    api_key_id=api_key_id,
                    req=item,
                    source_ip=source_ip,
                )
            )
        return responses

    async def get_compliance_stats(self, plan_id: UUID, period: str = "24h") -> ComplianceStats:
        from datetime import timedelta

        period_map = {
            "24h": timedelta(hours=24),
            "7d": timedelta(days=7),
            "30d": timedelta(days=30),
        }
        since = datetime.now(timezone.utc) - period_map.get(period, timedelta(hours=24))

        result = await self.db.execute(
            select(ValidationLog)
            .where(ValidationLog.plan_id == plan_id, ValidationLog.validated_at >= since)
            .order_by(ValidationLog.validated_at.desc())
        )
        logs = list(result.scalars().all())

        total = len(logs)
        valid_count = sum(1 for log in logs if log.is_valid)
        invalid_count = total - valid_count
        rate = (valid_count / total * 100) if total else 100.0

        event_counts: dict[str, int] = {}
        property_counts: dict[str, int] = {}
        for log in logs:
            if log.is_valid:
                continue
            event_counts[log.event_name] = event_counts.get(log.event_name, 0) + 1
            for error in log.errors or []:
                property_name = error.get("property_name") or error.get("path", "unknown").split(".")[-1]
                property_counts[property_name] = property_counts.get(property_name, 0) + 1

        return ComplianceStats(
            total_events=total,
            valid_count=valid_count,
            invalid_count=invalid_count,
            compliance_rate=round(rate, 2),
            top_failing_events=[
                {"event_name": name, "count": count}
                for name, count in sorted(event_counts.items(), key=lambda item: item[1], reverse=True)[:5]
            ],
            top_failing_properties=[
                {"property_name": name, "count": count}
                for name, count in sorted(property_counts.items(), key=lambda item: item[1], reverse=True)[:5]
            ],
            period=period,
        )

    async def _upsert_invalid_payload_error(
        self,
        *,
        plan_id: UUID,
        version_id: UUID,
        validation_log_id: UUID,
        event_name: str,
        payload: dict,
        error_reason: str,
    ) -> None:
        result = await self.db.execute(
            select(InvalidPayloadError).where(
                InvalidPayloadError.plan_id == plan_id,
                InvalidPayloadError.version_id == version_id,
                InvalidPayloadError.event_name == event_name,
                InvalidPayloadError.error_reason == error_reason,
            )
        )
        invalid_payload = result.scalar_one_or_none()
        now = datetime.now(timezone.utc)

        if invalid_payload is None:
            self.db.add(
                InvalidPayloadError(
                    plan_id=plan_id,
                    version_id=version_id,
                    validation_log_id=validation_log_id,
                    event_name=event_name,
                    payload=payload,
                    error_reason=error_reason,
                    first_seen_at=now,
                    last_seen_at=now,
                    occurrence_count=1,
                )
            )
            return

        invalid_payload.payload = payload
        invalid_payload.validation_log_id = validation_log_id
        invalid_payload.last_seen_at = now
        invalid_payload.occurrence_count += 1
