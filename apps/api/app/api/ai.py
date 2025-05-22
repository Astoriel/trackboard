from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.permissions import Permission, require_plan_permission
from app.services.ai_service import AIService

router = APIRouter(tags=["ai"], prefix="/plans/{plan_id}/ai")


class GenerateSchemaRequest(BaseModel):
    json_payload: str


@router.post("/generate")
async def generate_schema(
    plan_id: UUID,
    req: GenerateSchemaRequest,
    access=Depends(require_plan_permission(Permission.EDIT)),
    db: AsyncSession = Depends(get_db),
):
    """Parses raw JSON payload into a Tracking Event schema."""
    return await AIService(db).generate_schema_from_json(req.json_payload, access.plan.org_id)


@router.get("/analyze")
async def analyze_schema(
    plan_id: UUID,
    access=Depends(require_plan_permission(Permission.VIEW)),
    db: AsyncSession = Depends(get_db),
):
    """Analyzes plan to find likely duplicate events."""
    return await AIService(db).analyze_schema_duplicates(plan_id, access.plan.org_id)
