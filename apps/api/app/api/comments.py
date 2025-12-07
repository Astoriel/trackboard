import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.exceptions import ForbiddenError, NotFoundError
from app.core.permissions import Permission, resolve_plan_access
from app.dependencies import get_current_user
from app.models import Comment, EventSchema, OrgMember, User

router = APIRouter(tags=["comments"])


class CommentCreate(BaseModel):
    body: str


class CommentResponse(BaseModel):
    id: str
    event_id: str
    user_id: str
    user_name: str | None = None
    body: str
    created_at: str

    model_config = ConfigDict(from_attributes=True)


class OrgUpdateRequest(BaseModel):
    name: str


class OrgResponse(BaseModel):
    id: str
    name: str
    slug: str

    model_config = ConfigDict(from_attributes=True)


async def _require_event_access(
    db: AsyncSession,
    *,
    event_id: uuid.UUID,
    user_id: uuid.UUID,
    min_permission: Permission,
) -> EventSchema:
    event = await db.get(EventSchema, event_id)
    if not event:
        raise NotFoundError("Event", code="event_not_found")

    access = await resolve_plan_access(db, user_id=user_id, plan_id=event.plan_id)
    if access.permission < min_permission:
        raise ForbiddenError(f"This action requires {min_permission.name.lower()} access.")
    return event


# ── Comments ──────────────────────────────────────────────────────


@router.get("/events/{event_id}/comments", response_model=list[CommentResponse])
async def list_comments(
    event_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    await _require_event_access(
        db,
        event_id=event_id,
        user_id=current_user.id,
        min_permission=Permission.VIEW,
    )
    result = await db.execute(
        select(Comment)
        .options(selectinload(Comment.user))
        .where(Comment.event_id == event_id)
        .order_by(Comment.created_at.asc())
    )
    comments = result.scalars().all()
    return [
        CommentResponse(
            id=str(c.id),
            event_id=str(c.event_id),
            user_id=str(c.user_id),
            user_name=c.user.name if c.user else None,
            body=c.body,
            created_at=c.created_at.isoformat(),
        )
        for c in comments
    ]


@router.post("/events/{event_id}/comments", response_model=CommentResponse, status_code=201)
async def create_comment(
    event_id: uuid.UUID,
    data: CommentCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    await _require_event_access(
        db,
        event_id=event_id,
        user_id=current_user.id,
        min_permission=Permission.EDIT,
    )

    comment = Comment(
        event_id=event_id,
        user_id=current_user.id,
        body=data.body,
    )
    db.add(comment)
    await db.commit()
    await db.refresh(comment)

    return CommentResponse(
        id=str(comment.id),
        event_id=str(comment.event_id),
        user_id=str(comment.user_id),
        user_name=current_user.name,
        body=comment.body,
        created_at=comment.created_at.isoformat(),
    )


@router.delete("/comments/{comment_id}", status_code=204)
async def delete_comment(
    comment_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    comment = await db.get(Comment, comment_id)
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")
    if comment.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Cannot delete another user's comment")
    await _require_event_access(
        db,
        event_id=comment.event_id,
        user_id=current_user.id,
        min_permission=Permission.EDIT,
    )
    await db.delete(comment)
    await db.commit()


# ── Organization Settings ─────────────────────────────────────────


@router.patch("/org", response_model=OrgResponse)
async def update_organization(
    data: OrgUpdateRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    # Find user's org membership
    result = await db.execute(
        select(OrgMember)
        .options(selectinload(OrgMember.organization))
        .where(OrgMember.user_id == current_user.id)
    )
    member = result.scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=404, detail="Organization not found")
    role = member.role.value if hasattr(member.role, "value") else str(member.role)
    if role not in {"owner", "admin"}:
        raise HTTPException(
            status_code=403,
            detail="Only owners and admins can update organization settings",
        )

    org = member.organization
    org.name = data.name
    await db.commit()
    await db.refresh(org)

    return OrgResponse(id=str(org.id), name=org.name, slug=org.slug)
