from __future__ import annotations

import secrets
from datetime import datetime, timezone
from uuid import UUID

from passlib.context import CryptContext
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.core.security import hash_password
from app.models import ApiKey
from app.schemas.tracking_plan import ApiKeyCreate, ApiKeyCreatedResponse
from app.services.audit_service import AuditService


class ApiKeyService:
    PREFIX = "tb_live_"

    def __init__(self, db: AsyncSession):
        self.db = db
        self._ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")
        self.audit_service = AuditService(db)

    async def create_key(
        self,
        plan_id: UUID,
        user_id: UUID,
        data: ApiKeyCreate,
    ) -> ApiKeyCreatedResponse:
        api_key, raw_key = await self._create_db_key(
            plan_id=plan_id,
            user_id=user_id,
            label=data.label,
        )
        await self.audit_service.log_action(
            plan_id=plan_id,
            user_id=user_id,
            action="api_key.created",
            resource_type="api_key",
            resource_id=api_key.id,
            changes={"label": data.label},
        )
        return self._serialize_created_key(api_key, raw_key)

    async def list_keys(self, plan_id: UUID) -> list[ApiKey]:
        result = await self.db.execute(
            select(ApiKey)
            .where(ApiKey.plan_id == plan_id)
            .order_by(ApiKey.created_at.desc())
        )
        return list(result.scalars().all())

    async def rotate_key(self, key_id: UUID, user_id: UUID) -> ApiKeyCreatedResponse:
        key = await self.get_key(key_id)
        key.is_active = False
        key.revoked_at = datetime.now(timezone.utc)

        replacement, raw_key = await self._create_db_key(
            plan_id=key.plan_id,
            user_id=user_id,
            label=f"{key.label} (rotated)",
        )
        await self.audit_service.log_action(
            plan_id=key.plan_id,
            user_id=user_id,
            action="api_key.rotated",
            resource_type="api_key",
            resource_id=key.id,
            changes={"replacement_key_id": str(replacement.id)},
        )
        return self._serialize_created_key(replacement, raw_key)

    async def revoke_key(self, key_id: UUID, user_id: UUID | None = None) -> None:
        key = await self.get_key(key_id)
        key.is_active = False
        key.revoked_at = datetime.now(timezone.utc)
        await self.audit_service.log_action(
            plan_id=key.plan_id,
            user_id=user_id,
            action="api_key.revoked",
            resource_type="api_key",
            resource_id=key.id,
            changes={},
        )

    async def get_key(self, key_id: UUID) -> ApiKey:
        result = await self.db.execute(select(ApiKey).where(ApiKey.id == key_id))
        key = result.scalar_one_or_none()
        if key is None:
            raise NotFoundError("API key", code="api_key_not_found")
        return key

    async def resolve_key(self, raw_key: str) -> ApiKey | None:
        prefix = raw_key[:12]
        result = await self.db.execute(
            select(ApiKey)
            .where(ApiKey.key_prefix == prefix, ApiKey.is_active.is_(True))
            .order_by(ApiKey.created_at.desc())
        )
        candidates = list(result.scalars().all())
        for candidate in candidates:
            if candidate.revoked_at is not None:
                continue
            if candidate.expires_at and candidate.expires_at < datetime.now(timezone.utc):
                continue
            if self._ctx.verify(raw_key, candidate.key_hash):
                return candidate
        return None

    async def touch_key(self, api_key: ApiKey) -> None:
        api_key.last_used_at = datetime.now(timezone.utc)

    async def _create_db_key(
        self,
        *,
        plan_id: UUID,
        user_id: UUID,
        label: str,
    ) -> tuple[ApiKey, str]:
        raw_key = self.PREFIX + secrets.token_urlsafe(32)
        api_key = ApiKey(
            plan_id=plan_id,
            created_by=user_id,
            key_hash=hash_password(raw_key),
            key_prefix=raw_key[:12],
            label=label,
            scope="validate",
        )
        self.db.add(api_key)
        await self.db.flush()
        return api_key, raw_key

    def _serialize_created_key(self, key: ApiKey, raw_key: str) -> ApiKeyCreatedResponse:
        return ApiKeyCreatedResponse(
            id=key.id,
            key_prefix=key.key_prefix,
            label=key.label,
            scope=key.scope,
            is_active=key.is_active,
            created_at=key.created_at,
            last_used_at=key.last_used_at,
            revoked_at=key.revoked_at,
            full_key=raw_key,
        )
