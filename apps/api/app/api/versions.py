from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.exceptions import ConflictError
from app.core.permissions import Permission, require_plan_permission, resolve_plan_access
from app.dependencies import get_current_user
from app.models import User
from app.schemas.tracking_plan import PublishPlanRequest, RestoreVersionResponse, VersionResponse
from app.services.version_service import VersionService

router = APIRouter(tags=["versions"])


def _serialize_version(version) -> VersionResponse:
    return VersionResponse(
        id=version.id,
        version_id=version.id,
        plan_id=version.plan_id,
        version_number=version.version_number,
        created_by=version.created_by,
        author_name=version.author.name if getattr(version, "author", None) else None,
        change_summary=version.change_summary,
        compatibility_report=version.compatibility_report or {},
        publish_kind=version.publish_kind,
        published_from_revision=version.published_from_revision,
        restored_from_version_id=version.restored_from_version_id,
        created_at=version.created_at,
    )


@router.post("/plans/{plan_id}/publish", response_model=VersionResponse, status_code=201)
async def publish_plan(
    plan_id: UUID,
    data: PublishPlanRequest,
    access=Depends(require_plan_permission(Permission.EDIT)),
    db: AsyncSession = Depends(get_db),
):
    version = await VersionService(db).publish_plan(plan_id, access.user.id, data)
    return _serialize_version(version)


@router.get("/plans/{plan_id}/versions", response_model=list[VersionResponse])
async def list_versions(
    plan_id: UUID,
    access=Depends(require_plan_permission(Permission.VIEW)),
    db: AsyncSession = Depends(get_db),
):
    versions = await VersionService(db).list_versions(plan_id)
    return [_serialize_version(version) for version in versions]


@router.get("/versions/{version_a}/diff/{version_b}")
async def diff_versions(
    version_a: UUID,
    version_b: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    version_service = VersionService(db)
    source_version = await version_service.get_version(version_a)
    target_version = await version_service.get_version(version_b)
    await resolve_plan_access(db, user_id=current_user.id, plan_id=source_version.plan_id)
    await resolve_plan_access(db, user_id=current_user.id, plan_id=target_version.plan_id)
    if source_version.plan_id != target_version.plan_id:
        raise ConflictError(
            "Version diff must compare versions from the same plan.",
            code="cross_plan_version_diff",
        )
    return await version_service.diff_versions(version_a, version_b)


@router.post("/versions/{version_id}/restore", response_model=RestoreVersionResponse)
async def restore_version(
    version_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    version_service = VersionService(db)
    version = await version_service.get_version(version_id)
    await require_plan_permission(Permission.EDIT)(
        plan_id=version.plan_id,
        current_user=current_user,
        db=db,
    )
    plan = await version_service.restore_version(version_id, current_user.id)
    return RestoreVersionResponse(
        plan_id=plan.id,
        draft_revision=plan.draft_revision,
        restored_from_version_id=version_id,
    )
