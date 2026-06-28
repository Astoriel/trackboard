from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.exceptions import NotFoundError
from app.core.permissions import Permission, PlanAccess, require_plan_permission
from app.schemas.tracking_plan import (
    DLQGroupDetailResponse,
    DLQGroupListResponse,
    DLQGroupResponse,
    DLQTriageResponse,
)
from app.services.dlq_grouping import DLQGroupingService
from app.services.dlq_triage_service import DLQTriageService

router = APIRouter(tags=["dlq"])


@router.get("/plans/{plan_id}/dlq/groups", response_model=DLQGroupListResponse)
async def list_dlq_groups(
    plan_id: UUID,
    access: PlanAccess = Depends(require_plan_permission(Permission.VIEW)),
    db: AsyncSession = Depends(get_db),
):
    del access
    groups = await DLQGroupingService(db).list_groups(plan_id)
    return DLQGroupListResponse(groups=[DLQGroupResponse.model_validate(group.summary_dict()) for group in groups])


@router.get("/plans/{plan_id}/dlq/groups/{fingerprint}", response_model=DLQGroupDetailResponse)
async def get_dlq_group(
    plan_id: UUID,
    fingerprint: str,
    access: PlanAccess = Depends(require_plan_permission(Permission.VIEW)),
    db: AsyncSession = Depends(get_db),
):
    del access
    group = await DLQGroupingService(db).get_group(plan_id, fingerprint)
    if group is None:
        raise NotFoundError("DLQ group", code="dlq_group_not_found")
    return DLQGroupDetailResponse.model_validate(group.detail_dict())


@router.post("/plans/{plan_id}/dlq/groups/{fingerprint}/triage", response_model=DLQTriageResponse)
async def triage_dlq_group(
    plan_id: UUID,
    fingerprint: str,
    access: PlanAccess = Depends(require_plan_permission(Permission.VIEW)),
    db: AsyncSession = Depends(get_db),
):
    return await DLQTriageService(db).triage_group(
        plan_id=plan_id,
        fingerprint=fingerprint,
        created_by=access.user.id,
    )


@router.get("/plans/{plan_id}/dlq/groups/{fingerprint}/triage", response_model=DLQTriageResponse)
async def get_dlq_triage_report(
    plan_id: UUID,
    fingerprint: str,
    access: PlanAccess = Depends(require_plan_permission(Permission.VIEW)),
    db: AsyncSession = Depends(get_db),
):
    del access
    return await DLQTriageService(db).get_cached_report(plan_id, fingerprint)
