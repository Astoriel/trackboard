from typing import Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AuditLog


class AuditService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def log_action(
        self,
        plan_id: UUID | None,
        user_id: UUID | None,
        action: str,
        resource_type: str,
        resource_id: UUID,
        changes: dict[str, Any]
    ) -> AuditLog:
        """
        Logs an auditable action on a resource.
        `changes` should contain old/new values or delta payload.
        """
        audit_log = AuditLog(
            plan_id=plan_id,
            user_id=user_id,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            changes=changes,
        )
        self.db.add(audit_log)
        await self.db.flush()
        return audit_log
