from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends
from fastapi.responses import PlainTextResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.permissions import Permission, require_plan_permission
from app.services.codegen_service import CodegenService

router = APIRouter(tags=["codegen"])


@router.get("/plans/{plan_id}/generate/typescript")
async def generate_typescript(
    plan_id: UUID,
    access=Depends(require_plan_permission(Permission.VIEW)),
    db: AsyncSession = Depends(get_db),
):
    code = await CodegenService(db).generate_typescript(plan_id)
    return PlainTextResponse(code, media_type="text/plain")


@router.get("/plans/{plan_id}/generate/json-schema")
async def generate_json_schema(
    plan_id: UUID,
    access=Depends(require_plan_permission(Permission.VIEW)),
    db: AsyncSession = Depends(get_db),
):
    return await CodegenService(db).generate_json_schema(plan_id)
