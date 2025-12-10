from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.exceptions import ForbiddenError, NotFoundError
from app.core.secret_store import encrypt_secret
from app.core.url_safety import validate_external_http_url
from app.config import settings as app_settings
from app.dependencies import get_current_user
from app.models import OrgMember, Organization, User
from app.schemas.org_settings import AIProviderResponse, AIProviderUpdate

router = APIRouter(tags=["organization"])


def _role_value(member: OrgMember) -> str:
    return member.role.value if hasattr(member.role, "value") else str(member.role).lower()


async def _get_org_member(db: AsyncSession, user: User) -> OrgMember:
    result = await db.execute(
        select(OrgMember)
        .options(selectinload(OrgMember.organization))
        .where(OrgMember.user_id == user.id)
    )
    member = result.scalar_one_or_none()
    if member is None:
        raise NotFoundError("Organization")
    return member


def _serialize_ai_provider(org: Organization) -> AIProviderResponse:
    raw_settings = org.settings or {}
    config = raw_settings.get("ai_provider") or {}
    return AIProviderResponse(
        enabled=bool(config.get("enabled", False)),
        provider=config.get("provider") or "openai-compatible",
        base_url=config.get("base_url"),
        model=config.get("model") or "gpt-4o-mini",
        has_api_key=bool(config.get("api_key")),
    )


@router.get("/org/ai-provider", response_model=AIProviderResponse)
async def get_ai_provider(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    member = await _get_org_member(db, current_user)
    return _serialize_ai_provider(member.organization)


@router.patch("/org/ai-provider", response_model=AIProviderResponse)
async def update_ai_provider(
    data: AIProviderUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    member = await _get_org_member(db, current_user)
    if _role_value(member) not in {"owner", "admin"}:
        raise ForbiddenError("Only owners and admins can update organization AI settings")

    org = member.organization
    settings = dict(org.settings or {})
    config = dict(settings.get("ai_provider") or {})
    fields_set = data.model_fields_set

    if "enabled" in fields_set:
        config["enabled"] = data.enabled
    if "provider" in fields_set and data.provider is not None:
        config["provider"] = data.provider.strip()
    if "base_url" in fields_set:
        if data.base_url:
            config["base_url"] = validate_external_http_url(
                data.base_url,
                allow_private=app_settings.allow_private_ai_endpoints,
                field_name="AI endpoint",
            )
        else:
            config.pop("base_url", None)
    if "model" in fields_set and data.model is not None:
        config["model"] = data.model.strip()
    if data.clear_api_key:
        config.pop("api_key", None)
    elif "api_key" in fields_set and data.api_key is not None:
        config["api_key"] = encrypt_secret(data.api_key)

    settings["ai_provider"] = config
    org.settings = settings
    await db.commit()
    await db.refresh(org)

    return _serialize_ai_provider(org)
