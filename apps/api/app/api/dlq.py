from __future__ import annotations

import json
from datetime import datetime, timezone
from uuid import UUID, uuid5

from fastapi import APIRouter, Depends, Request
from pydantic import ValidationError as PydanticValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.exceptions import BadRequestError
from app.core.permissions import Permission, require_plan_permission
from app.models import InvalidPayloadError, ValidationLog
from app.schemas.tracking_plan import (
    GuardDLQImportRecord,
    GuardDLQImportResponse,
    InvalidPayloadErrorResponse,
)
from app.services.snapshot_service import SnapshotService
from app.services.validation_engine import validate_payload

router = APIRouter(tags=["dlq"])

GUARD_DLQ_IMPORT_NAMESPACE = UUID("f92c4282-7b14-4e2e-9ac1-0e6cf15f4a6c")
MAX_IMPORT_RECORDS = 1000


@router.get("/plans/{plan_id}/dlq", response_model=list[InvalidPayloadErrorResponse])
async def get_dlq_errors(
    plan_id: UUID,
    access=Depends(require_plan_permission(Permission.VIEW)),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(InvalidPayloadError)
        .where(InvalidPayloadError.plan_id == plan_id)
        .order_by(InvalidPayloadError.last_seen_at.desc(), InvalidPayloadError.created_at.desc())
        .limit(200)
    )
    return list(result.scalars().all())


@router.post("/plans/{plan_id}/dlq/import", response_model=GuardDLQImportResponse)
async def import_guard_dlq_errors(
    plan_id: UUID,
    request: Request,
    access=Depends(require_plan_permission(Permission.EDIT)),
    db: AsyncSession = Depends(get_db),
):
    del access
    records = await _parse_import_records(request)
    latest_version = await SnapshotService(db).get_latest_version(plan_id)
    version_id = latest_version.id if latest_version else None

    imported = 0
    skipped = 0
    upserted_errors = 0
    for record in records:
        request_id = uuid5(GUARD_DLQ_IMPORT_NAMESPACE, f"{plan_id}:{record.guard_dlq_id}")
        existing_log = await db.execute(
            select(ValidationLog.id).where(
                ValidationLog.plan_id == plan_id,
                ValidationLog.request_id == request_id,
            )
        )
        if existing_log.scalar_one_or_none() is not None:
            skipped += 1
            continue

        seen_at = _record_seen_at(record)
        is_valid, errors, error_reason = _revalidate_imported_record(record, latest_version.snapshot if latest_version else None)
        validation_log = ValidationLog(
            plan_id=plan_id,
            event_name=record.event_name,
            payload=record.payload,
            is_valid=is_valid,
            errors=errors,
            version_id=version_id,
            api_key_id=None,
            request_id=request_id,
            source_ip=None,
            source_label="guard-dlq-import",
            validated_at=seen_at,
        )
        db.add(validation_log)
        await db.flush()

        if not is_valid:
            await _upsert_imported_invalid_payload(
                db,
                plan_id=plan_id,
                version_id=version_id,
                validation_log_id=validation_log.id,
                event_name=record.event_name,
                payload=record.payload,
                error_reason=error_reason,
                seen_at=seen_at,
            )
            upserted_errors += 1
        imported += 1

    return GuardDLQImportResponse(
        imported=imported,
        skipped=skipped,
        upserted_errors=upserted_errors,
    )


async def _parse_import_records(request: Request) -> list[GuardDLQImportRecord]:
    body = (await request.body()).strip()
    if not body:
        raise BadRequestError("Import body is empty.", code="dlq_import_empty")

    try:
        decoded = json.loads(body)
    except json.JSONDecodeError:
        decoded = _decode_ndjson(body)

    if isinstance(decoded, dict) and "records" in decoded:
        raw_records = decoded["records"]
    elif isinstance(decoded, dict):
        raw_records = [decoded]
    else:
        raw_records = decoded

    if not isinstance(raw_records, list):
        raise BadRequestError(
            "DLQ import body must be NDJSON, a JSON array, or an object with records.",
            code="dlq_import_invalid",
        )
    if not raw_records:
        raise BadRequestError("DLQ import contains no records.", code="dlq_import_empty")
    if len(raw_records) > MAX_IMPORT_RECORDS:
        raise BadRequestError(
            f"DLQ import accepts at most {MAX_IMPORT_RECORDS} records per request.",
            code="dlq_import_too_large",
        )

    records: list[GuardDLQImportRecord] = []
    for index, raw_record in enumerate(raw_records):
        try:
            records.append(GuardDLQImportRecord.model_validate(raw_record))
        except PydanticValidationError as exc:
            raise BadRequestError(
                "DLQ import record is invalid.",
                code="dlq_import_invalid_record",
                extra={"record_index": index, "errors": exc.errors()},
            ) from exc
    return records


def _decode_ndjson(body: bytes) -> list[dict]:
    records: list[dict] = []
    for line_number, raw_line in enumerate(body.splitlines(), start=1):
        line = raw_line.strip()
        if not line:
            continue
        try:
            decoded = json.loads(line)
        except json.JSONDecodeError as exc:
            raise BadRequestError(
                "DLQ import NDJSON line is invalid JSON.",
                code="dlq_import_invalid_ndjson",
                extra={"line": line_number},
            ) from exc
        if not isinstance(decoded, dict):
            raise BadRequestError(
                "DLQ import NDJSON lines must be JSON objects.",
                code="dlq_import_invalid_ndjson",
                extra={"line": line_number},
            )
        records.append(decoded)
    return records


def _record_seen_at(record: GuardDLQImportRecord) -> datetime:
    seen_at = record.created_at or datetime.now(timezone.utc)
    if seen_at.tzinfo is None:
        return seen_at.replace(tzinfo=timezone.utc)
    return seen_at.astimezone(timezone.utc)


def _record_errors(record: GuardDLQImportRecord) -> list[dict]:
    reason_codes = record.reason_codes or ["guard_dlq_reject"]
    return [
        {
            "code": code,
            "path": "payload",
            "property_name": None,
            "message": f"Guard rejected payload: {code}",
        }
        for code in reason_codes
    ]


def _revalidate_imported_record(
    record: GuardDLQImportRecord,
    snapshot: dict | None,
) -> tuple[bool, list[dict], str]:
    if snapshot is None:
        return False, _record_errors(record), _error_reason(record)

    result = validate_payload(
        snapshot,
        event_name=record.event_name,
        payload=_record_validation_properties(record),
        mode="block",
    )
    errors = [violation.model_dump(mode="json") for violation in result["violations"]]
    error_reason = "; ".join(violation.message for violation in result["violations"])
    return bool(result["valid"]), errors, error_reason or _error_reason(record)


def _record_validation_properties(record: GuardDLQImportRecord) -> dict:
    properties = record.payload.get("properties")
    if isinstance(properties, dict):
        return properties
    return record.payload


def _error_reason(record: GuardDLQImportRecord) -> str:
    reason_codes = ", ".join(record.reason_codes or ["guard_dlq_reject"])
    return f"guard dlq rejected payload: {reason_codes}"


async def _upsert_imported_invalid_payload(
    db: AsyncSession,
    *,
    plan_id: UUID,
    version_id: UUID | None,
    validation_log_id: UUID,
    event_name: str,
    payload: dict,
    error_reason: str,
    seen_at: datetime,
) -> None:
    version_clause = (
        InvalidPayloadError.version_id == version_id
        if version_id is not None
        else InvalidPayloadError.version_id.is_(None)
    )
    result = await db.execute(
        select(InvalidPayloadError).where(
            InvalidPayloadError.plan_id == plan_id,
            version_clause,
            InvalidPayloadError.event_name == event_name,
            InvalidPayloadError.error_reason == error_reason,
        )
    )
    invalid_payload = result.scalar_one_or_none()
    if invalid_payload is None:
        db.add(
            InvalidPayloadError(
                plan_id=plan_id,
                version_id=version_id,
                validation_log_id=validation_log_id,
                event_name=event_name,
                payload=payload,
                error_reason=error_reason,
                first_seen_at=seen_at,
                last_seen_at=seen_at,
                occurrence_count=1,
            )
        )
        return

    invalid_payload.payload = payload
    invalid_payload.validation_log_id = validation_log_id
    invalid_payload.last_seen_at = max(invalid_payload.last_seen_at or seen_at, seen_at)
    if invalid_payload.first_seen_at is None or seen_at < invalid_payload.first_seen_at:
        invalid_payload.first_seen_at = seen_at
    invalid_payload.occurrence_count += 1
