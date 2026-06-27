from __future__ import annotations

from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import ConflictError, NotFoundError, StaleRevisionError
from app.models import TrackingPlan, Version
from app.schemas.tracking_plan import PublishPlanRequest
from app.services.snapshot_service import SnapshotService, build_event_property_map


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

        checks: list[dict[str, Any]] = []
        previous_events = {
            event["event_name"]: event for event in previous_snapshot.get("events", [])
        }
        current_events = {
            event["event_name"]: event for event in current_snapshot.get("events", [])
        }

        for event_name in sorted(set(previous_events) - set(current_events)):
            checks.append(
                {
                    "code": "event_removed",
                    "event_name": event_name,
                    "message": f"Event '{event_name}' was removed.",
                }
            )

        for event_name in sorted(set(previous_events) & set(current_events)):
            previous_props = build_event_property_map(previous_snapshot, previous_events[event_name])
            current_props = build_event_property_map(current_snapshot, current_events[event_name])

            for prop_name in sorted(set(previous_props) - set(current_props)):
                checks.append(
                    {
                        "code": "property_removed",
                        "event_name": event_name,
                        "property_name": prop_name,
                        "message": f"Property '{prop_name}' was removed from event '{event_name}'.",
                    }
                )

            for prop_name in sorted(set(previous_props) & set(current_props)):
                previous_prop = previous_props[prop_name]
                current_prop = current_props[prop_name]
                previous_type = previous_prop.get("type")
                current_type = current_prop.get("type")
                if previous_type != current_type:
                    checks.append(
                        {
                            "code": "property_type_changed",
                            "event_name": event_name,
                            "property_name": prop_name,
                            "previous": previous_type,
                            "current": current_type,
                            "message": (
                                f"Property '{prop_name}' on event '{event_name}' changed type."
                            ),
                        }
                    )

                if not previous_prop.get("required", False) and current_prop.get("required", False):
                    checks.append(
                        {
                            "code": "property_became_required",
                            "event_name": event_name,
                            "property_name": prop_name,
                            "message": (
                                f"Property '{prop_name}' on event '{event_name}' became required."
                            ),
                        }
                    )

                removed_values = sorted(
                    set(_enum_values(previous_prop)) - set(_enum_values(current_prop))
                )
                if removed_values:
                    checks.append(
                        {
                            "code": "enum_value_removed",
                            "event_name": event_name,
                            "property_name": prop_name,
                            "removed_values": removed_values,
                            "message": (
                                f"Property '{prop_name}' on event '{event_name}' removed enum values."
                            ),
                        }
                    )

        return {"breaking": bool(checks), "checks": checks}


def _enum_values(prop: dict[str, Any]) -> list[Any]:
    constraints = prop.get("constraints") or {}
    values = constraints.get("enum_values", constraints.get("enum", []))
    return list(values or [])
