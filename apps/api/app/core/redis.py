"""Async Redis client for Trackboard.

Used for: WebSocket pub/sub, session cache, rate limiting.
"""
from __future__ import annotations

import redis.asyncio as aioredis

from app.config import settings

# Lazy singleton
_redis: aioredis.Redis | None = None


async def get_redis() -> aioredis.Redis:
    """Get or create the global async Redis connection."""
    global _redis
    if settings.redis_url.startswith("memory://"):
        raise RuntimeError("Redis is disabled; using in-process fallback mode.")
    if _redis is None:
        _redis = aioredis.from_url(
            settings.redis_url,
            encoding="utf-8",
            decode_responses=True,
        )
    return _redis


async def close_redis() -> None:
    """Close the Redis connection on app shutdown."""
    global _redis
    if _redis is not None:
        await _redis.aclose()
        _redis = None
