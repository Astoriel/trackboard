from __future__ import annotations

from dataclasses import dataclass
from enum import IntEnum
from uuid import UUID

from fastapi import Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.exceptions import ForbiddenError, NotFoundError
from app.dependencies import get_current_user
from app.models import OrgMember, TrackingPlan, User


class Permission(IntEnum):
    VIEW = 1
    EDIT = 2
    ADMIN = 3
    OWNER = 4


ROLE_PERMISSIONS: dict[str, Permission] = {
    "viewer": Permission.VIEW,
    "editor": Permission.EDIT,
    "admin": Permission.ADMIN,
    "owner": Permission.OWNER,
}


@dataclass(slots=True)
class PlanAccess:
    user: User
    plan: TrackingPlan
    permission: Permission


def _normalize_role(role: object) -> str | None:
    if role is None:
        return None
    if hasattr(role, "value"):
        return str(getattr(role, "value"))
    return str(role).lower()


async def resolve_plan_access(
    db: AsyncSession,
    *,
    user_id: UUID,
    plan_id: UUID,
) -> PlanAccess:
    plan = await db.get(TrackingPlan, plan_id)
    if plan is None:
        raise NotFoundError("Plan", code="plan_not_found")

    result = await db.execute(
        select(OrgMember.role).where(
            OrgMember.user_id == user_id,
            OrgMember.org_id == plan.org_id,
        )
    )
    role = _normalize_role(result.scalar_one_or_none())
    permission = ROLE_PERMISSIONS.get(role or "")
    if permission is None:
        raise ForbiddenError("You do not have access to this plan.")

    user = await db.get(User, user_id)
    if user is None:
        raise ForbiddenError("You do not have access to this plan.")

    return PlanAccess(user=user, plan=plan, permission=permission)


def require_plan_permission(min_permission: Permission):
    async def dependency(
        plan_id: UUID,
        current_user: User = Depends(get_current_user),
        db: AsyncSession = Depends(get_db),
    ) -> PlanAccess:
        access = await resolve_plan_access(db, user_id=current_user.id, plan_id=plan_id)
        if access.permission < min_permission:
            raise ForbiddenError(
                f"This action requires {min_permission.name.lower()} access.",
            )
        return access

    return dependency
