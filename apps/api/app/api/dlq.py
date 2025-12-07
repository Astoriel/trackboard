from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.permissions import Permission, require_plan_permission
from app.models import InvalidPayloadError
from app.schemas.tracking_plan import InvalidPayloadErrorResponse

router = APIRouter(tags=["dlq"])


@router.get("/plans/{plan_id}/dlq", response_model=list[InvalidPayloadErrorResponse])
async def get_dlq_errors(
    plan_id: UUID,
    access=Depends(require_plan_permission(Permission.VIEW)),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(InvalidPayloadError)
        .where(InvalidPayloadError.plan_id == plan_id)
        .order_by(InvalidPayloadError.last_seen_at.desc(), InvalidPayloadError.created_at.desc())
        .limit(200)
    )
    return list(result.scalars().all())
