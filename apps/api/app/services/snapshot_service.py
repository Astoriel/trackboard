from __future__ import annotations

from copy import deepcopy
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import NotFoundError
from app.models import (
    EventGlobalPropertyLink,
    EventSchema,
    GlobalProperty,
    Property,
    TrackingPlan,
    Version,
)


def _serialize_property(prop: Property | GlobalProperty) -> dict[str, Any]:
    prop_type = prop.type.value if hasattr(prop.type, "value") else prop.type
    return {
        "name": prop.name,
        "description": prop.description,
        "type": prop_type,
        "required": prop.required,
        "constraints": deepcopy(prop.constraints or {}),
        "examples": deepcopy(prop.examples or []),
    }


def build_event_property_map(snapshot: dict[str, Any], event: dict[str, Any]) -> dict[str, dict[str, Any]]:
    property_map: dict[str, dict[str, Any]] = {}
    for prop in event.get("properties", []):
        property_map[prop["name"]] = deepcopy(prop)

    global_property_map = {
        prop["name"]: deepcopy(prop) for prop in snapshot.get("global_properties", [])
    }
    for prop_name in event.get("global_properties", []):
        if prop_name in global_property_map:
            property_map[prop_name] = deepcopy(global_property_map[prop_name])

    return property_map


class SnapshotService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def load_plan_with_schema(self, plan_id: UUID) -> TrackingPlan:
        result = await self.db.execute(
            select(TrackingPlan)
            .options(
                selectinload(TrackingPlan.events).selectinload(EventSchema.properties),
                selectinload(TrackingPlan.events).selectinload(EventSchema.global_properties),
                selectinload(TrackingPlan.global_properties),
            )
            .where(TrackingPlan.id == plan_id)
        )
        plan = result.scalar_one_or_none()
        if plan is None:
            raise NotFoundError("Plan", code="plan_not_found")
        return plan

    async def get_plan_snapshot(self, plan_id: UUID) -> dict[str, Any]:
        plan = await self.load_plan_with_schema(plan_id)
        return self.build_snapshot(plan)

    async def get_latest_version(self, plan_id: UUID) -> Version | None:
        result = await self.db.execute(
            select(Version)
            .where(Version.plan_id == plan_id)
            .order_by(Version.version_number.desc())
            .limit(1)
        )
        return result.scalar_one_or_none()

    def build_snapshot(self, plan: TrackingPlan) -> dict[str, Any]:
        events = sorted(plan.events or [], key=lambda event: (event.sort_order, event.event_name))
        global_property_map = {prop.name: prop for prop in plan.global_properties or []}

        for event in events:
            for prop in event.global_properties or []:
                global_property_map[prop.name] = prop

        global_properties = sorted(global_property_map.values(), key=lambda prop: prop.name)

        return {
            "plan_id": str(plan.id),
            "name": plan.name,
            "description": plan.description,
            "draft_revision": plan.draft_revision,
            "global_properties": [_serialize_property(prop) for prop in global_properties],
            "events": [
                {
                    "event_name": event.event_name,
                    "description": event.description,
                    "category": event.category,
                    "status": event.status.value if hasattr(event.status, "value") else event.status,
                    "sort_order": event.sort_order,
                    "properties": [
                        _serialize_property(prop)
                        for prop in sorted(event.properties or [], key=lambda prop: prop.name)
                    ],
                    "global_properties": sorted(
                        [prop.name for prop in event.global_properties or []]
                    ),
                }
                for event in events
            ],
        }

    async def apply_snapshot_to_plan(
        self,
        plan: TrackingPlan,
        snapshot: dict[str, Any],
        *,
        clear_existing: bool = True,
    ) -> None:
        if "name" in snapshot:
            plan.name = snapshot["name"]
        if "description" in snapshot:
            plan.description = snapshot["description"]

        if clear_existing:
            for event in list(plan.events or []):
                await self.db.delete(event)
            await self.db.flush()

            for global_property in list(plan.global_properties or []):
                await self.db.delete(global_property)
            await self.db.flush()

        global_property_map: dict[str, GlobalProperty] = {}
        for prop in snapshot.get("global_properties", []):
            new_prop = GlobalProperty(
                plan_id=plan.id,
                name=prop["name"],
                description=prop.get("description"),
                type=prop["type"],
                required=prop.get("required", False),
                constraints=prop.get("constraints", {}),
                examples=prop.get("examples", []),
            )
            self.db.add(new_prop)
            await self.db.flush()
            global_property_map[new_prop.name] = new_prop

        for event in snapshot.get("events", []):
            new_event = EventSchema(
                plan_id=plan.id,
                event_name=event["event_name"],
                description=event.get("description"),
                category=event.get("category"),
                status=event.get("status", "active"),
                sort_order=event.get("sort_order", 0),
            )
            self.db.add(new_event)
            await self.db.flush()

            for prop in event.get("properties", []):
                self.db.add(
                    Property(
                        event_id=new_event.id,
                        name=prop["name"],
                        description=prop.get("description"),
                        type=prop["type"],
                        required=prop.get("required", False),
                        constraints=prop.get("constraints", {}),
                        examples=prop.get("examples", []),
                    )
                )

            for global_name in event.get("global_properties", []):
                if global_name in global_property_map:
                    self.db.add(
                        EventGlobalPropertyLink(
                            event_id=new_event.id,
                            global_property_id=global_property_map[global_name].id,
                        )
                    )

        await self.db.flush()

    def diff_snapshots(self, snapshot_a: dict[str, Any], snapshot_b: dict[str, Any]) -> dict[str, Any]:
        events_a = {event["event_name"]: event for event in snapshot_a.get("events", [])}
        events_b = {event["event_name"]: event for event in snapshot_b.get("events", [])}

        added_events = sorted([name for name in events_b if name not in events_a])
        removed_events = sorted([name for name in events_a if name not in events_b])
        modified_events: list[dict[str, Any]] = []

        for event_name in sorted(set(events_a).intersection(events_b)):
            event_a = events_a[event_name]
            event_b = events_b[event_name]

            props_a = build_event_property_map(snapshot_a, event_a)
            props_b = build_event_property_map(snapshot_b, event_b)

            added_properties = sorted([name for name in props_b if name not in props_a])
            removed_properties = sorted([name for name in props_a if name not in props_b])
            changed_properties = []
            for prop_name in sorted(set(props_a).intersection(props_b)):
                if props_a[prop_name] != props_b[prop_name]:
                    changed_properties.append(
                        {
                            "name": prop_name,
                            "before": props_a[prop_name],
                            "after": props_b[prop_name],
                        }
                    )

            if (
                event_a.get("description") != event_b.get("description")
                or event_a.get("category") != event_b.get("category")
                or event_a.get("status") != event_b.get("status")
                or added_properties
                or removed_properties
                or changed_properties
            ):
                modified_events.append(
                    {
                        "event_name": event_name,
                        "added_properties": added_properties,
                        "removed_properties": removed_properties,
                        "changed_properties": changed_properties,
                    }
                )

        return {
            "added_events": added_events,
            "removed_events": removed_events,
            "modified_events": modified_events,
        }
