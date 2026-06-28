from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ValidationLog
from app.schemas.tracking_plan import (
    ImplementationStatusEvent,
    ImplementationStatusResponse,
)
from app.services.snapshot_service import SnapshotService

PERIODS: dict[str, timedelta | None] = {
    "all": None,
    "1h": timedelta(hours=1),
    "24h": timedelta(hours=24),
    "7d": timedelta(days=7),
    "30d": timedelta(days=30),
}


@dataclass
class _EventRollup:
    valid_count: int = 0
    invalid_count: int = 0
    last_seen_at: datetime | None = None
    last_valid_at: datetime | None = None
    last_invalid_at: datetime | None = None
    source_labels: set[str] = field(default_factory=set)
    version_ids: set[UUID] = field(default_factory=set)

    def add_log(self, log: ValidationLog) -> None:
        self.last_seen_at = _latest(self.last_seen_at, log.validated_at)
        if log.is_valid:
            self.valid_count += 1
            self.last_valid_at = _latest(self.last_valid_at, log.validated_at)
        else:
            self.invalid_count += 1
            self.last_invalid_at = _latest(self.last_invalid_at, log.validated_at)

        if log.source_label:
            self.source_labels.add(log.source_label)
        if log.version_id:
            self.version_ids.add(log.version_id)


def _latest(left: datetime | None, right: datetime | None) -> datetime | None:
    if right is None:
        return left
    if left is None or right > left:
        return right
    return left


def _status(rollup: _EventRollup) -> str:
    if rollup.valid_count == 0 and rollup.invalid_count == 0:
        return "never_seen"
    if rollup.valid_count > 0 and rollup.invalid_count > 0:
        return "mixed"
    if rollup.invalid_count > 0:
        return "seen_invalid"
    return "seen_valid"


class ImplementationStatusService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.snapshot_service = SnapshotService(db)

    async def get_status(
        self,
        plan_id: UUID,
        *,
        period: str = "all",
    ) -> ImplementationStatusResponse:
        if period not in PERIODS:
            period = "all"

        generated_at = datetime.now(timezone.utc)
        plan = await self.snapshot_service.load_plan_with_schema(plan_id)
        event_names = {event.event_name for event in plan.events or []}

        latest_version = await self.snapshot_service.get_latest_version(plan_id)
        if not event_names and latest_version is not None:
            event_names = {
                event["event_name"]
                for event in latest_version.snapshot.get("events", [])
                if event.get("event_name")
            }

        stmt = select(ValidationLog).where(ValidationLog.plan_id == plan_id)
        if PERIODS[period] is not None:
            stmt = stmt.where(ValidationLog.validated_at >= generated_at - PERIODS[period])
        stmt = stmt.order_by(ValidationLog.event_name, ValidationLog.validated_at.desc())

        result = await self.db.execute(stmt)
        rollups = {name: _EventRollup() for name in event_names}
        for log in result.scalars().all():
            if log.event_name not in event_names:
                continue
            rollups[log.event_name].add_log(log)

        return ImplementationStatusResponse(
            plan_id=plan_id,
            period=period,
            generated_at=generated_at,
            events=[
                ImplementationStatusEvent(
                    event_name=event_name,
                    status=_status(rollup),
                    valid_count=rollup.valid_count,
                    invalid_count=rollup.invalid_count,
                    last_seen_at=rollup.last_seen_at,
                    last_valid_at=rollup.last_valid_at,
                    last_invalid_at=rollup.last_invalid_at,
                    source_labels=sorted(rollup.source_labels),
                    version_ids=sorted(rollup.version_ids, key=str),
                )
                for event_name, rollup in sorted(rollups.items())
            ],
        )
