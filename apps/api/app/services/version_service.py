from __future__ import annotations

from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import ConflictError, NotFoundError, StaleRevisionError
from app.models import TrackingPlan, Version
from app.schemas.tracking_plan import PublishPlanRequest
from app.services.contract_diff import diff_contracts
from app.services.snapshot_service import SnapshotService


class VersionService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.snapshot_service = SnapshotService(db) if db is not None else None

    async def publish_plan(
        self,
        plan_id: UUID,
        user_id: UUID,
        data: PublishPlanRequest,
    ) -> Version:
        if self.snapshot_service is None:
            raise RuntimeError("VersionService requires a database session.")

        plan = await self.snapshot_service.load_plan_with_schema(plan_id)
        if plan.draft_revision != data.draft_revision:
            raise StaleRevisionError(plan.draft_revision)

        previous = await self.snapshot_service.get_latest_version(plan_id)
        snapshot = self.snapshot_service.build_snapshot(plan)
        compatibility_report = self._build_compatibility_report(
            previous.snapshot if previous is not None else None,
            snapshot,
        )
        if compatibility_report["breaking"] and not data.allow_breaking:
            raise ConflictError(
                "Publishing would introduce breaking changes.",
                code="breaking_change_blocked",
                extra={"compatibility_report": compatibility_report},
            )

        version = Version(
            plan_id=plan.id,
            version_number=(previous.version_number + 1) if previous else 1,
            created_by=user_id,
            change_summary=data.summary,
            snapshot=snapshot,
            published_from_revision=plan.draft_revision,
            compatibility_report=compatibility_report,
            publish_kind="publish",
        )
        plan.current_version = version.version_number
        self.db.add(version)
        await self.db.flush()
        return version

    async def list_versions(self, plan_id: UUID) -> list[Version]:
        result = await self.db.execute(
            select(Version)
            .options(selectinload(Version.author))
            .where(Version.plan_id == plan_id)
            .order_by(Version.version_number.desc())
        )
        return list(result.scalars().all())

    async def get_version(self, version_id: UUID) -> Version:
        result = await self.db.execute(
            select(Version)
            .options(selectinload(Version.author))
            .where(Version.id == version_id)
        )
        version = result.scalar_one_or_none()
        if version is None:
            raise NotFoundError("Version", code="version_not_found")
        return version

    async def diff_versions(self, version_a: UUID, version_b: UUID) -> dict[str, Any]:
        if self.snapshot_service is None:
            raise RuntimeError("VersionService requires a database session.")

        source = await self.get_version(version_a)
        target = await self.get_version(version_b)
        diff = self.snapshot_service.diff_snapshots(source.snapshot, target.snapshot)
        return {
            "version_a": source.version_number,
            "version_b": target.version_number,
            **diff,
        }

    async def restore_version(self, version_id: UUID, user_id: UUID) -> TrackingPlan:
        if self.snapshot_service is None:
            raise RuntimeError("VersionService requires a database session.")

        version = await self.get_version(version_id)
        plan = await self.snapshot_service.load_plan_with_schema(version.plan_id)
        await self.snapshot_service.apply_snapshot_to_plan(plan, version.snapshot)
        plan.draft_revision += 1
        plan.updated_by = user_id
        await self.db.flush()
        return await self.snapshot_service.load_plan_with_schema(plan.id)

    def _build_compatibility_report(
        self,
        previous_snapshot: dict[str, Any] | None,
        current_snapshot: dict[str, Any],
    ) -> dict[str, Any]:
        if not previous_snapshot:
            return {"breaking": False, "checks": []}

        diff = diff_contracts(previous_snapshot, current_snapshot)
        return {
            "breaking": diff["breaking"],
            "summary": diff["summary"],
            "checks": diff["changes"],
        }
