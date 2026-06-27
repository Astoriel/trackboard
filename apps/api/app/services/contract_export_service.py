from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, NotFoundError
from app.models import Version
from app.services.contract_core import FORMAT_VERSION, contract_hash, normalize_contract
from app.services.snapshot_service import SnapshotService


class ContractExportService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.snapshot_service = SnapshotService(db)

    async def export_published_contract(
        self,
        plan_id: UUID,
        *,
        version_number: int | None = None,
    ) -> dict[str, Any]:
        version = await self._load_version(plan_id, version_number)
        return build_contract_payload(version)

    async def _load_version(self, plan_id: UUID, version_number: int | None) -> Version:
        if version_number is None:
            version = await self.snapshot_service.get_latest_version(plan_id)
            if version is None:
                raise ConflictError(
                    "Contract export requires a published version.",
                    code="no_published_version",
                )
            return version

        result = await self.db.execute(
            select(Version).where(
                Version.plan_id == plan_id,
                Version.version_number == version_number,
            )
        )
        version = result.scalar_one_or_none()
        if version is None:
            raise NotFoundError("Version", code="version_not_found")
        return version


def build_contract_payload(version: Version) -> dict[str, Any]:
    snapshot = deepcopy(version.snapshot or {})
    contract = {
        "format_version": FORMAT_VERSION,
        "plan_id": str(version.plan_id),
        "version_id": str(version.id),
        "version_number": version.version_number,
        "name": snapshot.get("name"),
        "description": snapshot.get("description"),
        "published_at": _format_datetime(version.created_at),
        "global_properties": _sorted_properties(snapshot.get("global_properties", [])),
        "events": _sorted_events(snapshot.get("events", [])),
    }
    normalized = normalize_contract(contract)
    normalized["hash"] = contract_hash(normalized)
    return normalized


def _sorted_events(events: list[dict[str, Any]]) -> list[dict[str, Any]]:
    normalized = []
    for index, event in enumerate(events):
        normalized.append(
            {
                "event_name": event.get("event_name"),
                "status": event.get("status", "active"),
                "description": event.get("description"),
                "category": event.get("category"),
                "sort_order": event.get("sort_order", index),
                "properties": _sorted_properties(event.get("properties", [])),
                "global_properties": sorted(event.get("global_properties", [])),
            }
        )
    return sorted(normalized, key=lambda item: item["event_name"] or "")


def _sorted_properties(properties: list[dict[str, Any]]) -> list[dict[str, Any]]:
    normalized = []
    for prop in properties:
        normalized.append(
            {
                "name": prop.get("name"),
                "type": prop.get("type"),
                "required": bool(prop.get("required", False)),
                "constraints": _normalize_constraints(prop.get("constraints") or {}),
                "description": prop.get("description"),
                "examples": list(prop.get("examples") or []),
            }
        )
    return sorted(normalized, key=lambda item: item["name"] or "")


def _normalize_constraints(constraints: dict[str, Any]) -> dict[str, Any]:
    normalized = deepcopy(constraints)
    enum_values = normalized.get("enum_values", normalized.get("enum"))
    if enum_values is not None:
        normalized["enum_values"] = sorted(enum_values, key=lambda value: str(value))
        normalized.pop("enum", None)
    return dict(sorted(normalized.items()))


def _format_datetime(value: datetime | None) -> str | None:
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
