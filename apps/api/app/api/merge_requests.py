from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.permissions import Permission, require_plan_permission, resolve_plan_access
from app.dependencies import get_current_user
from app.models import User
from app.schemas.merge_request import MergeRequestCreate, MergeRequestResponse
from app.services.merge_service import MergeService

router = APIRouter(tags=["merge-requests"])


def _serialize_merge_request(merge_request) -> MergeRequestResponse:
    return MergeRequestResponse(
        id=merge_request.id,
        main_plan_id=merge_request.main_plan_id,
        branch_plan_id=merge_request.branch_plan_id,
        author_id=merge_request.author_id,
        title=merge_request.title,
        description=merge_request.description,
        status=merge_request.status,
        base_version_id=merge_request.base_version_id,
        source_revision=merge_request.source_revision,
        target_revision=merge_request.target_revision,
        merged_version_id=merge_request.merged_version_id,
        closed_by=merge_request.closed_by,
        closed_at=merge_request.closed_at,
        diff_summary=getattr(merge_request, "diff_summary", {}),
        created_at=merge_request.created_at,
        updated_at=merge_request.updated_at,
    )


@router.post(
    "/plans/{plan_id}/merge-requests",
    response_model=MergeRequestResponse,
    status_code=201,
)
async def create_merge_request(
    plan_id: UUID,
    data: MergeRequestCreate,
    access=Depends(require_plan_permission(Permission.EDIT)),
    db: AsyncSession = Depends(get_db),
):
    merge_request = await MergeService(db).create_merge_request(
        main_plan_id=plan_id,
        branch_plan_id=data.branch_plan_id,
        user_id=access.user.id,
        title=data.title,
        description=data.description,
    )
    return _serialize_merge_request(merge_request)


@router.get("/plans/{plan_id}/merge-requests", response_model=list[MergeRequestResponse])
async def list_merge_requests(
    plan_id: UUID,
    access=Depends(require_plan_permission(Permission.VIEW)),
    db: AsyncSession = Depends(get_db),
):
    merge_requests = await MergeService(db).list_merge_requests(plan_id)
    return [_serialize_merge_request(item) for item in merge_requests]


@router.get("/merge-requests/{mr_id}", response_model=MergeRequestResponse)
async def get_merge_request(
    mr_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    merge_request = await MergeService(db).get_merge_request(mr_id)
    await resolve_plan_access(db, user_id=current_user.id, plan_id=merge_request.main_plan_id)
    return _serialize_merge_request(merge_request)


@router.post("/merge-requests/{mr_id}/merge", response_model=MergeRequestResponse)
async def merge_merge_request(
    mr_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    merge_request = await MergeService(db).get_merge_request(mr_id)
    await require_plan_permission(Permission.EDIT)(
        plan_id=merge_request.main_plan_id,
        current_user=current_user,
        db=db,
    )
    merged = await MergeService(db).merge_merge_request(mr_id, current_user.id)
    return _serialize_merge_request(merged)
