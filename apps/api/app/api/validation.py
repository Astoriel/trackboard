from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.exceptions import AuthenticationError
from app.core.permissions import Permission, require_plan_permission
from app.dependencies import get_current_user
from app.models import User
from app.schemas.tracking_plan import (
    ApiKeyCreate,
    ApiKeyCreatedResponse,
    ApiKeyResponse,
    ComplianceStats,
    ValidateBatchRequest,
    ValidateRequest,
    ValidateResponse,
)
from app.services.apikey_service import ApiKeyService
from app.services.validation_service import ValidationService

router = APIRouter(tags=["validation"])


async def _resolve_api_key(request: Request, db: AsyncSession):
    raw_key = request.headers.get("X-API-Key", "")
    if not raw_key:
        raise AuthenticationError("API key required (X-API-Key header).", code="api_key_required")

    api_key = await ApiKeyService(db).resolve_key(raw_key)
    if api_key is None:
        raise AuthenticationError("Invalid or revoked API key.", code="invalid_api_key")

    await ApiKeyService(db).touch_key(api_key)
    return api_key


@router.post("/validate", response_model=ValidateResponse)
async def validate_event(
    req: ValidateRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    api_key = await _resolve_api_key(request, db)
    source_ip = request.client.host if request.client else None
    return await ValidationService(db).validate_event(
        plan_id=api_key.plan_id,
        api_key_id=api_key.id,
        req=req,
        source_ip=source_ip,
    )


@router.post("/validate/batch", response_model=list[ValidateResponse])
async def validate_batch(
    req: ValidateBatchRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    api_key = await _resolve_api_key(request, db)
    source_ip = request.client.host if request.client else None
    return await ValidationService(db).validate_batch(
        plan_id=api_key.plan_id,
        api_key_id=api_key.id,
        req=req,
        source_ip=source_ip,
    )


@router.get("/plans/{plan_id}/validate/stats", response_model=ComplianceStats)
async def validation_stats(
    plan_id: UUID,
    period: str = "24h",
    access=Depends(require_plan_permission(Permission.VIEW)),
    db: AsyncSession = Depends(get_db),
):
    return await ValidationService(db).get_compliance_stats(plan_id, period)


@router.get("/plans/{plan_id}/keys", response_model=list[ApiKeyResponse])
async def list_api_keys(
    plan_id: UUID,
    access=Depends(require_plan_permission(Permission.ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    keys = await ApiKeyService(db).list_keys(plan_id)
    return [ApiKeyResponse.model_validate(key) for key in keys]


@router.post("/plans/{plan_id}/keys", response_model=ApiKeyCreatedResponse, status_code=201)
async def create_api_key(
    plan_id: UUID,
    data: ApiKeyCreate,
    access=Depends(require_plan_permission(Permission.ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    return await ApiKeyService(db).create_key(plan_id, access.user.id, data)


@router.post("/keys/{key_id}/rotate", response_model=ApiKeyCreatedResponse)
async def rotate_api_key(
    key_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    key = await ApiKeyService(db).get_key(key_id)
    await require_plan_permission(Permission.ADMIN)(
        plan_id=key.plan_id,
        current_user=current_user,
        db=db,
    )
    return await ApiKeyService(db).rotate_key(key_id, current_user.id)


@router.delete("/keys/{key_id}", status_code=204)
async def revoke_api_key(
    key_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    key = await ApiKeyService(db).get_key(key_id)
    await require_plan_permission(Permission.ADMIN)(
        plan_id=key.plan_id,
        current_user=current_user,
        db=db,
    )
    await ApiKeyService(db).revoke_key(key_id, current_user.id)
