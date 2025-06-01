from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, exc
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.dependencies import get_current_user
from app.models import GlobalProperty, EventSchema, EventGlobalPropertyLink, User, TrackingPlan
from app.schemas.tracking_plan import GlobalPropertyCreate, GlobalPropertyResponse, GlobalPropertyUpdate

router = APIRouter(tags=["global_properties"])

@router.get("/api/v1/plans/{plan_id}/global-properties", response_model=list[GlobalPropertyResponse])
async def list_global_properties(
    plan_id: UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    plan = await db.get(TrackingPlan, plan_id)
    if not plan:
        raise HTTPException(404, "Plan not found")
        
    result = await db.execute(
        select(GlobalProperty).where(GlobalProperty.plan_id == plan_id).order_by(GlobalProperty.name)
    )
    return result.scalars().all()

@router.post("/api/v1/plans/{plan_id}/global-properties", response_model=GlobalPropertyResponse)
async def create_global_property(
    plan_id: UUID,
    data: GlobalPropertyCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    plan = await db.get(TrackingPlan, plan_id)
    if not plan:
        raise HTTPException(404, "Plan not found")
        
    prop = GlobalProperty(
        plan_id=plan_id,
        name=data.name,
        description=data.description,
        type=data.type,
        required=data.required,
        constraints=data.constraints,
        examples=data.examples,
    )
    try:
        db.add(prop)
        await db.commit()
        await db.refresh(prop)
        return prop
    except exc.IntegrityError:
        await db.rollback()
        raise HTTPException(400, f"Global property '{data.name}' already exists.")

@router.patch("/api/v1/global-properties/{prop_id}", response_model=GlobalPropertyResponse)
async def update_global_property(
    prop_id: UUID,
    data: GlobalPropertyUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    prop = await db.get(GlobalProperty, prop_id)
    if not prop:
        raise HTTPException(404, "Global property not found")
        
    if data.name is not None:
        prop.name = data.name
    if data.description is not None:
        prop.description = data.description
    if data.type is not None:
        prop.type = data.type
    if data.required is not None:
        prop.required = data.required
    if data.constraints is not None:
        prop.constraints = data.constraints
    if data.examples is not None:
        prop.examples = data.examples
        
    await db.commit()
    await db.refresh(prop)
    return prop

@router.delete("/api/v1/global-properties/{prop_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_global_property(
    prop_id: UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    prop = await db.get(GlobalProperty, prop_id)
    if not prop:
        raise HTTPException(404, "Global property not found")
    await db.delete(prop)
    await db.commit()
    return None

@router.post("/api/v1/events/{event_id}/global-properties/{prop_id}")
async def link_global_property(
    event_id: UUID,
    prop_id: UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    event = await db.get(EventSchema, event_id)
    prop = await db.get(GlobalProperty, prop_id)
    
    if not event or not prop:
        raise HTTPException(404, "Event or Global Property not found")
        
    if event.plan_id != prop.plan_id:
        raise HTTPException(400, "Event and Global Property must belong to same Tracking Plan")
        
    link = EventGlobalPropertyLink(event_id=event_id, global_property_id=prop_id)
    try:
        db.add(link)
        await db.commit()
        return {"status": "linked"}
    except exc.IntegrityError:
        await db.rollback()
        return {"status": "already linked"}

@router.delete("/api/v1/events/{event_id}/global-properties/{prop_id}")
async def unlink_global_property(
    event_id: UUID,
    prop_id: UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    link = await db.get(EventGlobalPropertyLink, {"event_id": event_id, "global_property_id": prop_id})
    if not link:
        raise HTTPException(404, "Link not found")
    await db.delete(link)
    await db.commit()
    return {"status": "unlinked"}
