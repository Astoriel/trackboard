from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.exceptions import ConflictError, NotFoundError
from app.dependencies import get_current_user
from app.models import User
from app.schemas.tracking_plan import (
    EventCreate,
    EventResponse,
    EventUpdate,
    EventUpdate,
    PlanUpdate,
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

router = APIRouter(tags=["tracking-plans"])


# ── Plans ──


@router.get("/plans", response_model=list[PlanResponse])
async def list_plans(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    svc = PlanService(db)
    org_id = user.memberships[0].org_id if user.memberships else None
    if org_id is None:
        return []
    plans = await svc.list_plans(org_id)
    result = []
    for p in plans:
        resp = PlanResponse.model_validate(p)
        resp.events_count = len(p.events) if p.events else 0
        result.append(resp)
    return result


@router.post("/plans", response_model=PlanResponse, status_code=201)
async def create_plan(
    data: PlanCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    org_id = user.memberships[0].org_id
    plan = await PlanService(db).create_plan(org_id, data)
    return PlanResponse.model_validate(plan)


@router.get("/plans/{plan_id}", response_model=PlanDetailResponse)
async def get_plan(
    plan_id: UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        plan = await PlanService(db).get_plan(plan_id)
        resp = PlanDetailResponse.model_validate(plan)
        resp.events_count = len(plan.events) if plan.events else 0
        resp.events = [EventResponse.model_validate(e) for e in plan.events]
        return resp
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=e.message)


@router.get("/plans/{plan_id}/search")
async def search_plan(
    plan_id: UUID,
    q: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from app.services.search_service import SearchService
    return await SearchService(db).search_all(plan_id, q)


@router.post("/plans/{plan_id}/branch", response_model=PlanDetailResponse, status_code=201)
async def create_branch(
    plan_id: UUID,
    data: PlanBranchCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        plan = await PlanService(db).create_branch(plan_id, data.branch_name, user.id)
        resp = PlanDetailResponse.model_validate(plan)
        resp.events_count = len(plan.events) if plan.events else 0
        resp.events = [EventResponse.model_validate(e) for e in plan.events]
        return resp
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=e.message)


@router.get("/plans/{plan_id}/branches", response_model=list[PlanResponse])
async def list_branches(
    plan_id: UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from sqlalchemy import select
    from app.models import TrackingPlan
    
    result = await db.execute(
        select(TrackingPlan).where(TrackingPlan.parent_plan_id == plan_id).order_by(TrackingPlan.created_at.desc())
    )
    branches = result.scalars().all()
    
    result_list = []
    for p in branches:
        resp = PlanResponse.model_validate(p)
        result_list.append(resp)
    return result_list


@router.patch("/plans/{plan_id}", response_model=PlanResponse)
async def update_plan(
    plan_id: UUID,
    data: PlanUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        plan = await PlanService(db).update_plan(plan_id, data)
        return PlanResponse.model_validate(plan)
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=e.message)


@router.delete("/plans/{plan_id}", status_code=204)
async def delete_plan(
    plan_id: UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        await PlanService(db).delete_plan(plan_id)
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=e.message)


@router.get("/plans/{plan_id}/export")
async def export_plan(
    plan_id: UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        plan = await PlanService(db).get_plan(plan_id)
        resp = PlanDetailResponse.model_validate(plan)
        resp.events_count = len(plan.events) if plan.events else 0
        resp.events = [EventResponse.model_validate(e) for e in plan.events]
        return resp.model_dump(mode="json")
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=e.message)


from pydantic import BaseModel
class ImportProperty(BaseModel):
    name: str
    type: str
    description: str | None = None
    required: bool = False
    constraints: dict | None = None

class ImportEvent(BaseModel):
    event_name: str
    description: str | None = None
    category: str | None = None
    properties: list[ImportProperty] = []

class ImportPlanRequest(BaseModel):
    events: list[ImportEvent]

@router.post("/plans/{plan_id}/import", response_model=PlanDetailResponse)
async def import_plan_events(
    plan_id: UUID,
    data: ImportPlanRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    svc = PlanService(db)
    try:
        await svc.get_plan(plan_id) # Verify exists
        for ev in data.events:
            try:
                event = await svc.create_event(plan_id, EventCreate(
                    event_name=ev.event_name,
                    description=ev.description,
                    category=ev.category
                ))
            except ConflictError:
                # If event already exists, we might skip or find it. For simplicity, skip.
                continue
            for p in ev.properties:
                await svc.create_property(event.id, PropertyCreate(
                    name=p.name,
                    type=p.type,
                    description=p.description,
                    required=p.required,
                    constraints=p.constraints
                ))
        return await get_plan(plan_id, user, db)
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=e.message)


# ── Events ──


@router.get("/plans/{plan_id}/events", response_model=list[EventResponse])
async def list_events(
    plan_id: UUID,
    q: str | None = None,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    events = await PlanService(db).list_events(plan_id, q=q)
    return [EventResponse.model_validate(e) for e in events]


@router.post("/plans/{plan_id}/events", response_model=EventResponse, status_code=201)
async def create_event(
    plan_id: UUID,
    data: EventCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        event = await PlanService(db).create_event(plan_id, data)
        return EventResponse.model_validate(event)
    except ConflictError as e:
        raise HTTPException(status_code=409, detail=e.message)


@router.get("/events/{event_id}", response_model=EventResponse)
async def get_event(
    event_id: UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        event = await PlanService(db).get_event(event_id)
        return EventResponse.model_validate(event)
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=e.message)


@router.patch("/events/{event_id}", response_model=EventResponse)
async def update_event(
    event_id: UUID,
    data: EventUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        event = await PlanService(db).update_event(event_id, data)
        return EventResponse.model_validate(event)
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=e.message)


@router.delete("/events/{event_id}", status_code=204)
async def delete_event(
    event_id: UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        await PlanService(db).delete_event(event_id)
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=e.message)


# ── Properties ──


@router.post("/events/{event_id}/properties", response_model=PropertyResponse, status_code=201)
async def create_property(
    event_id: UUID,
    data: PropertyCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    prop = await PlanService(db).create_property(event_id, data)
    return PropertyResponse.model_validate(prop)


@router.patch("/properties/{prop_id}", response_model=PropertyResponse)
async def update_property(
    prop_id: UUID,
    data: PropertyUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        prop = await PlanService(db).update_property(prop_id, data)
        return PropertyResponse.model_validate(prop)
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=e.message)


@router.delete("/properties/{prop_id}", status_code=204)
async def delete_property(
    prop_id: UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        await PlanService(db).delete_property(prop_id)
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=e.message)
