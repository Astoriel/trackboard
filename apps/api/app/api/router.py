from fastapi import APIRouter

from app.api.ai import router as ai_router
from app.api.auth import router as auth_router
from app.api.codegen import router as codegen_router
from app.api.comments import router as comments_router
from app.api.dlq import router as dlq_router
from app.api.health import router as health_router
from app.api.merge_requests import router as merge_requests_router
from app.api.org_settings import router as org_settings_router
from app.api.plans import router as plans_router
from app.api.validation import router as validation_router
from app.api.versions import router as versions_router

api_router = APIRouter()

api_router.include_router(auth_router)
api_router.include_router(plans_router)
api_router.include_router(validation_router)
api_router.include_router(versions_router)
api_router.include_router(codegen_router)
api_router.include_router(ai_router)
api_router.include_router(dlq_router)
api_router.include_router(merge_requests_router)
api_router.include_router(comments_router)
api_router.include_router(org_settings_router)
api_router.include_router(health_router)
