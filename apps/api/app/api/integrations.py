import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.api.auth import get_current_user
from app.models import Integration, TrackingPlan, User
from app.schemas.integration import IntegrationCreate, IntegrationResponse, IntegrationUpdate

router = APIRouter(tags=["integrations"])

@router.get("/plans/{plan_id}/integrations", response_model=list[IntegrationResponse])
async def list_integrations(
    plan_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    plan = await db.get(TrackingPlan, plan_id)
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
        
    stmt = select(Integration).where(Integration.plan_id == plan_id)
    result = await db.execute(stmt)
    return result.scalars().all()

@router.post("/plans/{plan_id}/integrations", response_model=IntegrationResponse)
async def create_integration(
    plan_id: uuid.UUID,
    data: IntegrationCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    plan = await db.get(TrackingPlan, plan_id)
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
        
    integration = Integration(
        plan_id=plan_id,
        provider=data.provider,
        config=data.config,
        status=data.status
    )
    db.add(integration)
    await db.commit()
    await db.refresh(integration)
    return integration

@router.patch("/integrations/{integration_id}", response_model=IntegrationResponse)
async def update_integration(
    integration_id: uuid.UUID,
    data: IntegrationUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    integration = await db.get(Integration, integration_id)
    if not integration:
        raise HTTPException(status_code=404, detail="Integration not found")
        
    if data.config is not None:
        integration.config = data.config
    if data.status is not None:
        integration.status = data.status
        
    await db.commit()
    await db.refresh(integration)
    return integration

@router.delete("/integrations/{integration_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_integration(
    integration_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    integration = await db.get(Integration, integration_id)
    if not integration:
        raise HTTPException(status_code=404, detail="Integration not found")
        
    await db.delete(integration)
    await db.commit()
