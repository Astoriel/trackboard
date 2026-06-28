from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.permissions import Permission, require_plan_permission
from app.schemas.tracking_plan import ImplementationStatusResponse
from app.services.implementation_status import ImplementationStatusService

router = APIRouter(tags=["implementation-status"])


@router.get(
    "/plans/{plan_id}/implementation-status",
    response_model=ImplementationStatusResponse,
)
async def get_implementation_status(
    plan_id: UUID,
    period: str = "all",
    access=Depends(require_plan_permission(Permission.VIEW)),
    db: AsyncSession = Depends(get_db),
):
    return await ImplementationStatusService(db).get_status(plan_id, period=period)
