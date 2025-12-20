from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from slowapi.util import get_remote_address

from app.api.router import api_router
from app.api.ws import ws_router
from app.config import settings
from app.core.database import engine
from app.core.exceptions import TrackboardError
from app.core.redis import close_redis
from app.models import Base  # noqa: F401 – ensure models are loaded
from app.services.ws_manager import ws_manager

# ── Rate limiter singleton (accessible via request.app.state.limiter) ──
# Uses Redis backend for distributed rate limiting across multiple workers.
# Falls back to in-memory if Redis URL is not configured.
limiter = Limiter(
    key_func=get_remote_address,
    default_limits=["200/minute"],
    storage_uri=settings.redis_url,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup / shutdown lifecycle."""
    # Start Redis pub/sub listener for multi-worker WebSocket broadcast
    await ws_manager.start_pubsub()
    yield
    # Graceful shutdown
    await ws_manager.stop_pubsub()
    await close_redis()
    await engine.dispose()


def create_app() -> FastAPI:
    app = FastAPI(
        title=settings.app_name,
        description="Open-Source Tracking Plan Manager — define, version, and validate analytics events.",
        version="0.1.0",
        lifespan=lifespan,
    )

    # ── Rate limiting ──
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
    app.add_middleware(SlowAPIMiddleware)

    # ── CORS ──
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins.split(","),
        allow_origin_regex=settings.cors_origin_regex,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # ── REST routes ──
    app.include_router(api_router, prefix="/api/v1")
    # ── WebSocket routes ──
    app.include_router(ws_router, prefix="/api/v1")

    @app.exception_handler(TrackboardError)
    async def handle_trackboard_error(_: Request, exc: TrackboardError) -> JSONResponse:
        return JSONResponse(status_code=exc.status_code, content=exc.to_response())

    @app.exception_handler(HTTPException)
    async def handle_http_exception(_: Request, exc: HTTPException) -> JSONResponse:
        detail = exc.detail
        if isinstance(detail, dict):
            content = detail
        else:
            content = {"code": "http_error", "message": str(detail)}
        return JSONResponse(status_code=exc.status_code, content=content)

    return app


app = create_app()
