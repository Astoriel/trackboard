from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.exceptions import ForbiddenError, NotFoundError, StaleRevisionError
from app.core.permissions import (
    Permission,
    PlanAccess,
    require_plan_permission,
    resolve_plan_access,
)
from app.dependencies import get_current_user
from app.models import EventSchema, GlobalProperty, Property, TrackingPlan, User
from app.schemas.tracking_plan import (
    EventCreate,
    EventResponse,
    EventUpdate,
    GlobalPropertyCreate,
    GlobalPropertyResponse,
    GlobalPropertyUpdate,
    ImportPlanRequest,
    ImportPlanResponse,
    PlanBranchCreate,
    PlanCreate,
    PlanDetailResponse,
    PlanResponse,
    PlanUpdate,
    PropertyCreate,
    PropertyResponse,
    PropertyUpdate,
)
from app.services.plan_service import PlanService
from app.services.search_service import SearchService
from app.services.snapshot_service import SnapshotService

router = APIRouter(tags=["plans"])


def _serialize_global_property(
    prop: GlobalProperty,
    *,
    draft_revision: int | None = None,
) -> GlobalPropertyResponse:
    payload = GlobalPropertyResponse.model_validate(prop)
    payload.draft_revision = draft_revision
    return payload


def _serialize_property(
    prop: Property,
    *,
    draft_revision: int | None = None,
) -> PropertyResponse:
    payload = PropertyResponse.model_validate(prop)
    payload.draft_revision = draft_revision
    return payload


def _serialize_event(
    event: EventSchema,
    *,
    draft_revision: int | None = None,
) -> EventResponse:
    payload = EventResponse.model_validate(event)
    payload.properties = [
        _serialize_property(prop, draft_revision=draft_revision)
        for prop in getattr(event, "properties", []) or []
    ]
    payload.global_properties = [
        _serialize_global_property(prop, draft_revision=draft_revision)
        for prop in getattr(event, "global_properties", []) or []
    ]
    payload.draft_revision = draft_revision
    return payload


def _serialize_plan(plan: TrackingPlan) -> PlanResponse:
    payload = PlanResponse.model_validate(plan)
    payload.events_count = len(plan.events or [])
    return payload


def _serialize_plan_detail(plan: TrackingPlan) -> PlanDetailResponse:
    payload = PlanDetailResponse.model_validate(plan)
    payload.events_count = len(plan.events or [])
    payload.events = [
        _serialize_event(event, draft_revision=plan.draft_revision) for event in plan.events or []
    ]
    payload.global_properties = [
        _serialize_global_property(prop, draft_revision=plan.draft_revision)
        for prop in plan.global_properties or []
    ]
    return payload


async def _resolve_resource_plan_id(
    db: AsyncSession,
    *,
    event_id: UUID | None = None,
    property_id: UUID | None = None,
    global_property_id: UUID | None = None,
) -> UUID:
    if event_id is not None:
        result = await db.execute(select(EventSchema.plan_id).where(EventSchema.id == event_id))
        plan_id = result.scalar_one_or_none()
        if plan_id is None:
            raise NotFoundError("Event", code="event_not_found")
        return plan_id
    if property_id is not None:
        result = await db.execute(
            select(EventSchema.plan_id)
            .join(Property, Property.event_id == EventSchema.id)
            .where(Property.id == property_id)
        )
        plan_id = result.scalar_one_or_none()
        if plan_id is None:
            raise NotFoundError("Property", code="property_not_found")
        return plan_id
    if global_property_id is not None:
        result = await db.execute(
            select(GlobalProperty.plan_id).where(GlobalProperty.id == global_property_id)
        )
        plan_id = result.scalar_one_or_none()
        if plan_id is None:
            raise NotFoundError("Global property", code="global_property_not_found")
        return plan_id
    raise ValueError("A resource identifier is required.")


def _assert_min_permission(access: PlanAccess, min_permission: Permission) -> None:
    if access.permission < min_permission:
        raise ForbiddenError(
            f"This action requires {min_permission.name.lower()} access.",
        )


async def _resolve_resource_access(
    db: AsyncSession,
    *,
    user_id: UUID,
    min_permission: Permission,
    event_id: UUID | None = None,
    property_id: UUID | None = None,
    global_property_id: UUID | None = None,
) -> PlanAccess:
    plan_id = await _resolve_resource_plan_id(
        db,
        event_id=event_id,
        property_id=property_id,
        global_property_id=global_property_id,
    )
    access = await resolve_plan_access(db, user_id=user_id, plan_id=plan_id)
    _assert_min_permission(access, min_permission)
    return access


def _find_event(plan: TrackingPlan, event_id: UUID) -> EventSchema:
    for event in plan.events or []:
        if event.id == event_id:
            return event
    raise NotFoundError("Event", code="event_not_found")


def _find_property(plan: TrackingPlan, property_id: UUID) -> Property:
    for event in plan.events or []:
        for prop in event.properties or []:
            if prop.id == property_id:
                return prop
    raise NotFoundError("Property", code="property_not_found")


def _find_global_property(plan: TrackingPlan, global_property_id: UUID) -> GlobalProperty:
    for prop in plan.global_properties or []:
        if prop.id == global_property_id:
            return prop
    raise NotFoundError("Global property", code="global_property_not_found")


@router.get("/plans", response_model=list[PlanResponse])
async def list_plans(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    org_ids = [membership.org_id for membership in current_user.memberships]
    if not org_ids:
        return []

    result = await db.execute(
        select(TrackingPlan)
        .where(TrackingPlan.org_id.in_(org_ids), TrackingPlan.archived_at.is_(None))
        .order_by(TrackingPlan.updated_at.desc())
    )
    plans = list(result.scalars().all())
    return [_serialize_plan(plan) for plan in plans]


@router.post("/plans", response_model=PlanResponse, status_code=201)
async def create_plan(
    data: PlanCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    membership = None
    if current_user.memberships:
        membership = sorted(current_user.memberships, key=lambda item: item.joined_at)[0]
    if membership is None:
        raise ForbiddenError("Current user does not belong to an organization.")
    plan = await PlanService(db).create_plan(membership.org_id, data, current_user.id)
    return _serialize_plan(plan)


@router.get("/plans/{plan_id}", response_model=PlanDetailResponse)
async def get_plan(
    plan_id: UUID,
    access=Depends(require_plan_permission(Permission.VIEW)),
    db: AsyncSession = Depends(get_db),
):
    plan = await PlanService(db).get_plan(plan_id)
    return _serialize_plan_detail(plan)


@router.patch("/plans/{plan_id}", response_model=PlanDetailResponse)
async def update_plan(
    plan_id: UUID,
    data: PlanUpdate,
    access=Depends(require_plan_permission(Permission.EDIT)),
    db: AsyncSession = Depends(get_db),
):
    plan = await PlanService(db).update_plan(plan_id, data, access.user.id)
    return _serialize_plan_detail(plan)


@router.post("/plans/{plan_id}/import", response_model=ImportPlanResponse)
async def import_plan(
    plan_id: UUID,
    data: ImportPlanRequest,
    access=Depends(require_plan_permission(Permission.EDIT)),
    db: AsyncSession = Depends(get_db),
):
    result = await PlanService(db).import_plan(plan_id, data, access.user.id)
    return ImportPlanResponse(
        warnings=result["warnings"],
        imported_events=result["imported_events"],
        imported_global_properties=result["imported_global_properties"],
        draft_revision=result["draft_revision"],
        plan=_serialize_plan_detail(result["plan"]),
    )


@router.post("/plans/{plan_id}/branch", response_model=PlanDetailResponse, status_code=201)
async def create_branch(
    plan_id: UUID,
    data: PlanBranchCreate,
    access=Depends(require_plan_permission(Permission.EDIT)),
    db: AsyncSession = Depends(get_db),
):
    if access.plan.draft_revision != data.draft_revision:
        raise StaleRevisionError(access.plan.draft_revision)
    branch = await PlanService(db).create_branch(plan_id, data.branch_name, access.user.id)
    return _serialize_plan_detail(branch)


@router.get("/plans/{plan_id}/branches", response_model=list[PlanResponse])
async def list_branches(
    plan_id: UUID,
    access=Depends(require_plan_permission(Permission.VIEW)),
    db: AsyncSession = Depends(get_db),
):
    main_plan_id = access.plan.id if access.plan.is_main else access.plan.parent_plan_id
    branches = await PlanService(db).list_branches(main_plan_id)
    return [_serialize_plan(branch) for branch in branches]


@router.get("/plans/{plan_id}/search")
async def search_plan(
    plan_id: UUID,
    q: str,
    access=Depends(require_plan_permission(Permission.VIEW)),
    db: AsyncSession = Depends(get_db),
):
    return await SearchService(db).search_all(plan_id, q)


@router.get("/plans/{plan_id}/export")
async def export_plan(
    plan_id: UUID,
    access=Depends(require_plan_permission(Permission.VIEW)),
    db: AsyncSession = Depends(get_db),
):
    latest_version = await SnapshotService(db).get_latest_version(plan_id)
    if latest_version is not None:
        return latest_version.snapshot
    snapshot = await SnapshotService(db).get_plan_snapshot(plan_id)
    return snapshot


@router.get("/plans/{plan_id}/events", response_model=list[EventResponse])
async def list_events(
    plan_id: UUID,
    q: str | None = None,
    access=Depends(require_plan_permission(Permission.VIEW)),
    db: AsyncSession = Depends(get_db),
):
    events = await PlanService(db).list_events(plan_id, q=q)
    return [_serialize_event(event, draft_revision=access.plan.draft_revision) for event in events]


@router.post("/plans/{plan_id}/events", response_model=EventResponse, status_code=201)
async def create_event(
    plan_id: UUID,
    data: EventCreate,
    access=Depends(require_plan_permission(Permission.EDIT)),
    db: AsyncSession = Depends(get_db),
):
    event = await PlanService(db).create_event(plan_id, data, access.user.id)
    return _serialize_event(event, draft_revision=access.plan.draft_revision)


@router.patch("/events/{event_id}", response_model=EventResponse)
async def update_event(
    event_id: UUID,
    data: EventUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    access = await _resolve_resource_access(
        db,
        user_id=current_user.id,
        min_permission=Permission.EDIT,
        event_id=event_id,
    )
    event = await PlanService(db).update_event(event_id, data, current_user.id)
    return _serialize_event(event, draft_revision=access.plan.draft_revision)


@router.delete("/events/{event_id}", status_code=204)
async def delete_event(
    event_id: UUID,
    draft_revision: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _resolve_resource_access(
        db,
        user_id=current_user.id,
        min_permission=Permission.EDIT,
        event_id=event_id,
    )
    await PlanService(db).delete_event(
        event_id,
        draft_revision=draft_revision,
        user_id=current_user.id,
    )


@router.post("/events/{event_id}/properties", response_model=PropertyResponse, status_code=201)
async def create_property(
    event_id: UUID,
    data: PropertyCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    access = await _resolve_resource_access(
        db,
        user_id=current_user.id,
        min_permission=Permission.EDIT,
        event_id=event_id,
    )
    prop = await PlanService(db).create_property(event_id, data, current_user.id)
    return _serialize_property(prop, draft_revision=access.plan.draft_revision)


@router.patch("/properties/{property_id}", response_model=PropertyResponse)
async def update_property(
    property_id: UUID,
    data: PropertyUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    access = await _resolve_resource_access(
        db,
        user_id=current_user.id,
        min_permission=Permission.EDIT,
        property_id=property_id,
    )
    prop = await PlanService(db).update_property(property_id, data, current_user.id)
    return _serialize_property(prop, draft_revision=access.plan.draft_revision)


@router.delete("/properties/{property_id}", status_code=204)
async def delete_property(
    property_id: UUID,
    draft_revision: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _resolve_resource_access(
        db,
        user_id=current_user.id,
        min_permission=Permission.EDIT,
        property_id=property_id,
    )
    await PlanService(db).delete_property(
        property_id,
        draft_revision=draft_revision,
        user_id=current_user.id,
    )


@router.get("/plans/{plan_id}/global-properties", response_model=list[GlobalPropertyResponse])
async def list_global_properties(
    plan_id: UUID,
    access=Depends(require_plan_permission(Permission.VIEW)),
    db: AsyncSession = Depends(get_db),
):
    props = await PlanService(db).list_global_properties(plan_id)
    return [
        _serialize_global_property(prop, draft_revision=access.plan.draft_revision)
        for prop in props
    ]


@router.post(
    "/plans/{plan_id}/global-properties",
    response_model=GlobalPropertyResponse,
    status_code=201,
)
async def create_global_property(
    plan_id: UUID,
    data: GlobalPropertyCreate,
    access=Depends(require_plan_permission(Permission.EDIT)),
    db: AsyncSession = Depends(get_db),
):
    prop = await PlanService(db).create_global_property(plan_id, data, access.user.id)
    return _serialize_global_property(prop, draft_revision=access.plan.draft_revision)


@router.patch("/global-properties/{global_property_id}", response_model=GlobalPropertyResponse)
async def update_global_property(
    global_property_id: UUID,
    data: GlobalPropertyUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    access = await _resolve_resource_access(
        db,
        user_id=current_user.id,
        min_permission=Permission.EDIT,
        global_property_id=global_property_id,
    )
    prop = await PlanService(db).update_global_property(global_property_id, data, current_user.id)
    return _serialize_global_property(prop, draft_revision=access.plan.draft_revision)


@router.delete("/global-properties/{global_property_id}", status_code=204)
async def delete_global_property(
    global_property_id: UUID,
    draft_revision: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _resolve_resource_access(
        db,
        user_id=current_user.id,
        min_permission=Permission.EDIT,
        global_property_id=global_property_id,
    )
    await PlanService(db).delete_global_property(
        global_property_id,
        draft_revision=draft_revision,
        user_id=current_user.id,
    )


@router.post(
    "/events/{event_id}/global-properties/{global_property_id}",
    response_model=EventResponse,
)
async def link_global_property(
    event_id: UUID,
    global_property_id: UUID,
    draft_revision: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    access = await _resolve_resource_access(
        db,
        user_id=current_user.id,
        min_permission=Permission.EDIT,
        event_id=event_id,
    )
    event = await PlanService(db).link_global_property(
        event_id,
        global_property_id,
        draft_revision=draft_revision,
        user_id=current_user.id,
    )
    return _serialize_event(event, draft_revision=access.plan.draft_revision)


@router.delete(
    "/events/{event_id}/global-properties/{global_property_id}",
    response_model=EventResponse,
)
async def unlink_global_property(
    event_id: UUID,
    global_property_id: UUID,
    draft_revision: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    access = await _resolve_resource_access(
        db,
        user_id=current_user.id,
        min_permission=Permission.EDIT,
        event_id=event_id,
    )
    event = await PlanService(db).unlink_global_property(
        event_id,
        global_property_id,
        draft_revision=draft_revision,
        user_id=current_user.id,
    )
    return _serialize_event(event, draft_revision=access.plan.draft_revision)
