from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import ConflictError, NotFoundError, StaleRevisionError
from app.models import (
    EventGlobalPropertyLink,
    EventSchema,
    GlobalProperty,
    Property,
    TrackingPlan,
)
from app.schemas.tracking_plan import (
    EventCreate,
    EventUpdate,
    GlobalPropertyCreate,
    GlobalPropertyUpdate,
    ImportPlanRequest,
    PlanCreate,
    PlanUpdate,
    PropertyCreate,
    PropertyUpdate,
)
from app.services.import_service import ImportService
from app.services.snapshot_service import SnapshotService


class PlanService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.snapshot_service = SnapshotService(db)

    async def list_plans(self, org_id: UUID) -> list[TrackingPlan]:
        result = await self.db.execute(
            select(TrackingPlan)
            .options(selectinload(TrackingPlan.events))
            .where(TrackingPlan.org_id == org_id, TrackingPlan.archived_at.is_(None))
            .order_by(TrackingPlan.updated_at.desc())
        )
        return list(result.scalars().all())

    async def create_plan(
        self,
        org_id: UUID,
        data: PlanCreate,
        user_id: UUID | None = None,
    ) -> TrackingPlan:
        plan = TrackingPlan(
            org_id=org_id,
            name=data.name,
            description=data.description,
            updated_by=user_id,
        )
        self.db.add(plan)
        await self.db.flush()
        return plan

    async def get_plan(self, plan_id: UUID) -> TrackingPlan:
        return await self.snapshot_service.load_plan_with_schema(plan_id)

    async def update_plan(
        self,
        plan_id: UUID,
        data: PlanUpdate,
        user_id: UUID | None = None,
    ) -> TrackingPlan:
        plan = await self.get_plan(plan_id)
        self._assert_revision(plan, getattr(data, "draft_revision", None))

        updates = data.model_dump(exclude_unset=True)
        updates.pop("draft_revision", None)
        for field, value in updates.items():
            setattr(plan, field, value)

        self._touch(plan, user_id)
        await self.db.flush()
        return plan

    async def delete_plan(self, plan_id: UUID) -> None:
        plan = await self.get_plan(plan_id)
        plan.archived_at = datetime.now(timezone.utc)
        await self.db.flush()

    async def import_plan(
        self,
        plan_id: UUID,
        data: ImportPlanRequest,
        user_id: UUID | None = None,
    ) -> dict[str, Any]:
        plan = await self.get_plan(plan_id)
        self._assert_revision(plan, data.draft_revision)

        normalized = ImportService().normalize(data)
        snapshot = {
            "name": plan.name,
            "description": plan.description,
            "global_properties": normalized["global_properties"],
            "events": [
                {**event, "status": "active", "sort_order": index}
                for index, event in enumerate(normalized["events"])
            ],
        }
        await self.snapshot_service.apply_snapshot_to_plan(plan, snapshot)
        self._touch(plan, user_id)
        await self.db.flush()
        plan = await self.get_plan(plan.id)
        return {
            "warnings": normalized["warnings"],
            "imported_events": len(normalized["events"]),
            "imported_global_properties": len(normalized["global_properties"]),
            "draft_revision": plan.draft_revision,
            "plan": plan,
        }

    async def create_branch(
        self,
        plan_id: UUID,
        branch_name: str,
        user_id: UUID | None = None,
    ) -> TrackingPlan:
        source_plan = await self.get_plan(plan_id)
        if not source_plan.is_main:
            raise ConflictError("Branches can only be created from a main plan.", code="invalid_branch_source")

        branch = TrackingPlan(
            org_id=source_plan.org_id,
            name=source_plan.name,
            description=source_plan.description,
            is_main=False,
            parent_plan_id=source_plan.id,
            branch_name=branch_name,
            current_version=source_plan.current_version,
            draft_revision=source_plan.draft_revision,
            status=source_plan.status,
            metadata_=dict(source_plan.metadata_ or {}),
            updated_by=user_id,
        )
        self.db.add(branch)
        await self.db.flush()
        await self.snapshot_service.apply_snapshot_to_plan(
            branch,
            self.snapshot_service.build_snapshot(source_plan),
        )
        await self.db.flush()
        return await self.get_plan(branch.id)

    async def list_branches(self, main_plan_id: UUID) -> list[TrackingPlan]:
        result = await self.db.execute(
            select(TrackingPlan)
            .options(selectinload(TrackingPlan.events))
            .where(TrackingPlan.parent_plan_id == main_plan_id)
            .order_by(TrackingPlan.created_at.desc())
        )
        return list(result.scalars().all())

    async def list_events(self, plan_id: UUID, q: str | None = None) -> list[EventSchema]:
        stmt = (
            select(EventSchema)
            .options(
                selectinload(EventSchema.properties),
                selectinload(EventSchema.global_properties),
            )
            .where(EventSchema.plan_id == plan_id)
            .order_by(EventSchema.sort_order, EventSchema.event_name)
        )
        if q:
            stmt = stmt.where(EventSchema.event_name.ilike(f"%{q}%"))
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def create_event(
        self,
        plan_id: UUID,
        data: EventCreate,
        user_id: UUID | None = None,
    ) -> EventSchema:
        plan = await self.get_plan(plan_id)
        self._assert_revision(plan, data.draft_revision)
        self._ensure_unique_event(plan, data.event_name)

        event = EventSchema(
            plan_id=plan.id,
            event_name=data.event_name,
            description=data.description,
            category=data.category,
            sort_order=len(plan.events or []),
        )
        self.db.add(event)
        self._touch(plan, user_id)
        await self.db.flush()
        return await self.get_event(event.id)

    async def get_event(self, event_id: UUID) -> EventSchema:
        result = await self.db.execute(
            select(EventSchema)
            .options(
                selectinload(EventSchema.properties),
                selectinload(EventSchema.global_properties),
            )
            .where(EventSchema.id == event_id)
        )
        event = result.scalar_one_or_none()
        if event is None:
            raise NotFoundError("Event", code="event_not_found")
        return event

    async def update_event(
        self,
        event_id: UUID,
        data: EventUpdate,
        user_id: UUID | None = None,
    ) -> EventSchema:
        event = await self.get_event(event_id)
        plan = await self.get_plan(event.plan_id)
        self._assert_revision(plan, data.draft_revision)
        if data.event_name is not None and data.event_name != event.event_name:
            self._ensure_unique_event(plan, data.event_name)

        updates = data.model_dump(exclude_unset=True)
        updates.pop("draft_revision", None)
        for field, value in updates.items():
            setattr(event, field, value)

        self._touch(plan, user_id)
        await self.db.flush()
        return await self.get_event(event.id)

    async def delete_event(
        self,
        event_id: UUID,
        *,
        draft_revision: int | None = None,
        user_id: UUID | None = None,
    ) -> None:
        event = await self.get_event(event_id)
        plan = await self.get_plan(event.plan_id)
        self._assert_revision(plan, draft_revision)
        await self.db.delete(event)
        self._touch(plan, user_id)
        await self.db.flush()

    async def create_property(
        self,
        event_id: UUID,
        data: PropertyCreate,
        user_id: UUID | None = None,
    ) -> Property:
        event = await self.get_event(event_id)
        plan = await self.get_plan(event.plan_id)
        self._assert_revision(plan, data.draft_revision)
        self._ensure_unique_property(event, data.name)

        prop = Property(
            event_id=event.id,
            name=data.name,
            description=data.description,
            type=data.type,
            required=data.required,
            constraints=data.constraints,
            examples=data.examples,
        )
        self.db.add(prop)
        self._touch(plan, user_id)
        await self.db.flush()
        return prop

    async def update_property(
        self,
        property_id: UUID,
        data: PropertyUpdate,
        user_id: UUID | None = None,
    ) -> Property:
        prop = await self._get_property(property_id)
        event = await self.get_event(prop.event_id)
        plan = await self.get_plan(event.plan_id)
        self._assert_revision(plan, data.draft_revision)
        if data.name is not None and data.name != prop.name:
            self._ensure_unique_property(event, data.name)

        updates = data.model_dump(exclude_unset=True)
        updates.pop("draft_revision", None)
        for field, value in updates.items():
            setattr(prop, field, value)

        self._touch(plan, user_id)
        await self.db.flush()
        return prop

    async def delete_property(
        self,
        property_id: UUID,
        *,
        draft_revision: int | None = None,
        user_id: UUID | None = None,
    ) -> None:
        prop = await self._get_property(property_id)
        event = await self.get_event(prop.event_id)
        plan = await self.get_plan(event.plan_id)
        self._assert_revision(plan, draft_revision)
        await self.db.delete(prop)
        self._touch(plan, user_id)
        await self.db.flush()

    async def list_global_properties(self, plan_id: UUID) -> list[GlobalProperty]:
        result = await self.db.execute(
            select(GlobalProperty)
            .where(GlobalProperty.plan_id == plan_id)
            .order_by(GlobalProperty.name)
        )
        return list(result.scalars().all())

    async def create_global_property(
        self,
        plan_id: UUID,
        data: GlobalPropertyCreate,
        user_id: UUID | None = None,
    ) -> GlobalProperty:
        plan = await self.get_plan(plan_id)
        self._assert_revision(plan, data.draft_revision)
        self._ensure_unique_global_property(plan, data.name)

        prop = GlobalProperty(
            plan_id=plan.id,
            name=data.name,
            description=data.description,
            type=data.type,
            required=data.required,
            constraints=data.constraints,
            examples=data.examples,
        )
        self.db.add(prop)
        self._touch(plan, user_id)
        await self.db.flush()
        return prop

    async def update_global_property(
        self,
        global_property_id: UUID,
        data: GlobalPropertyUpdate,
        user_id: UUID | None = None,
    ) -> GlobalProperty:
        prop = await self._get_global_property(global_property_id)
        plan = await self.get_plan(prop.plan_id)
        self._assert_revision(plan, data.draft_revision)
        if data.name is not None and data.name != prop.name:
            self._ensure_unique_global_property(plan, data.name)

        updates = data.model_dump(exclude_unset=True)
        updates.pop("draft_revision", None)
        for field, value in updates.items():
            setattr(prop, field, value)

        self._touch(plan, user_id)
        await self.db.flush()
        return prop

    async def delete_global_property(
        self,
        global_property_id: UUID,
        *,
        draft_revision: int | None = None,
        user_id: UUID | None = None,
    ) -> None:
        prop = await self._get_global_property(global_property_id)
        plan = await self.get_plan(prop.plan_id)
        self._assert_revision(plan, draft_revision)
        await self.db.delete(prop)
        self._touch(plan, user_id)
        await self.db.flush()

    async def link_global_property(
        self,
        event_id: UUID,
        global_property_id: UUID,
        *,
        draft_revision: int | None = None,
        user_id: UUID | None = None,
    ) -> EventSchema:
        event = await self.get_event(event_id)
        prop = await self._get_global_property(global_property_id)
        if prop.plan_id != event.plan_id:
            raise ConflictError("Global property belongs to another plan.", code="global_property_plan_mismatch")
        plan = await self.get_plan(event.plan_id)
        self._assert_revision(plan, draft_revision)

        if all(linked.id != prop.id for linked in event.global_properties or []):
            self.db.add(EventGlobalPropertyLink(event_id=event.id, global_property_id=prop.id))
            self._touch(plan, user_id)
            await self.db.flush()
        return await self.get_event(event.id)

    async def unlink_global_property(
        self,
        event_id: UUID,
        global_property_id: UUID,
        *,
        draft_revision: int | None = None,
        user_id: UUID | None = None,
    ) -> EventSchema:
        event = await self.get_event(event_id)
        prop = await self._get_global_property(global_property_id)
        plan = await self.get_plan(event.plan_id)
        self._assert_revision(plan, draft_revision)
        await self.db.execute(
            delete(EventGlobalPropertyLink).where(
                EventGlobalPropertyLink.event_id == event.id,
                EventGlobalPropertyLink.global_property_id == prop.id,
            )
        )
        self._touch(plan, user_id)
        await self.db.flush()
        return await self.get_event(event.id)

    async def _get_property(self, property_id: UUID) -> Property:
        prop = await self.db.get(Property, property_id)
        if prop is None:
            raise NotFoundError("Property", code="property_not_found")
        return prop

    async def _get_global_property(self, global_property_id: UUID) -> GlobalProperty:
        prop = await self.db.get(GlobalProperty, global_property_id)
        if prop is None:
            raise NotFoundError("Global property", code="global_property_not_found")
        return prop

    def _assert_revision(self, plan: TrackingPlan, draft_revision: int | None) -> None:
        if draft_revision is not None and plan.draft_revision != draft_revision:
            raise StaleRevisionError(plan.draft_revision)

    def _touch(self, plan: TrackingPlan, user_id: UUID | None) -> None:
        plan.draft_revision += 1
        plan.updated_by = user_id

    def _ensure_unique_event(self, plan: TrackingPlan, event_name: str) -> None:
        if any(event.event_name == event_name for event in plan.events or []):
            raise ConflictError("Event name already exists in this plan.", code="event_name_exists")

    def _ensure_unique_property(self, event: EventSchema, name: str) -> None:
        if any(prop.name == name for prop in event.properties or []):
            raise ConflictError("Property name already exists on this event.", code="property_name_exists")

    def _ensure_unique_global_property(self, plan: TrackingPlan, name: str) -> None:
        if any(prop.name == name for prop in plan.global_properties or []):
            raise ConflictError(
                "Global property name already exists in this plan.",
                code="global_property_name_exists",
            )
