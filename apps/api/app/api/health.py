from __future__ import annotations

import os

from fastapi import APIRouter

from app.schemas.tracking_plan import HealthResponse

router = APIRouter(tags=["health"])

RELEASE_MARKER = "serious-v1-preview-global-detail-2026-04-13"


@router.get("/health/live", response_model=HealthResponse)
async def health_live():
    return HealthResponse(status="ok")


@router.get("/health/ready", response_model=HealthResponse)
async def health_ready():
    return HealthResponse(status="ok")


@router.get("/health/version")
async def health_version():
    return {
        "status": "ok",
        "release_marker": RELEASE_MARKER,
        "render_git_commit": os.getenv("RENDER_GIT_COMMIT"),
        "render_service_name": os.getenv("RENDER_SERVICE_NAME"),
    }
