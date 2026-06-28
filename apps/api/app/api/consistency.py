from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.exceptions import NotFoundError
from app.core.permissions import Permission, require_plan_permission, resolve_plan_access
from app.dependencies import get_current_user
from app.models import EventSchema, User
from app.schemas.tracking_plan import (
    ConsistencyAuditFinding,
    ConsistencyAuditResponse,
    ConsistencyCandidateResponse,
    ConsistencyPreviewRequest,
    ConsistencyPreviewResponse,
)
from app.services.semantic_consistency import ConsistencyCandidate, SemanticConsistencyService
from app.services.merge_service import MergeService

router = APIRouter(tags=["consistency"])


def _candidate_response(candidate: ConsistencyCandidate) -> ConsistencyCandidateResponse:
    return ConsistencyCandidateResponse(
        event_id=UUID(candidate.event_id),
        event_name=candidate.event_name,
        score=candidate.score,
        label=candidate.label,
        recommendation=candidate.recommendation,
        score_breakdown=candidate.score_breakdown,
        evidence=[
            {"kind": item.kind, "detail": item.detail, "weight": item.weight}
            for item in candidate.evidence
        ],
    )


@router.post(
    "/plans/{plan_id}/consistency/preview",
    response_model=ConsistencyPreviewResponse,
)
async def preview_consistency(
    plan_id: UUID,
    payload: ConsistencyPreviewRequest,
    access=Depends(require_plan_permission(Permission.VIEW)),
    db: AsyncSession = Depends(get_db),
):
    proposed, candidates = await SemanticConsistencyService(db).preview(plan_id, payload)
    return ConsistencyPreviewResponse(
        proposed_event_name=proposed.event_name,
        candidate_count=len(candidates),
        candidates=[_candidate_response(candidate) for candidate in candidates],
    )


@router.get(
    "/plans/{plan_id}/consistency/audit",
    response_model=ConsistencyAuditResponse,
)
async def audit_consistency(
    plan_id: UUID,
    access=Depends(require_plan_permission(Permission.VIEW)),
    db: AsyncSession = Depends(get_db),
):
    findings = await SemanticConsistencyService(db).audit_plan(plan_id)
    return ConsistencyAuditResponse(
        plan_id=plan_id,
        finding_count=len(findings),
        findings=[
            ConsistencyAuditFinding(
                event_id=UUID(finding["event_id"]),
                event_name=finding["event_name"],
                candidate=_candidate_response(finding["candidate"]),
            )
            for finding in findings
        ],
    )


@router.get(
    "/merge-requests/{mr_id}/consistency",
    response_model=ConsistencyAuditResponse,
)
async def merge_request_consistency(
    mr_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    merge_request = await MergeService(db).get_merge_request(mr_id)
    await resolve_plan_access(db, user_id=current_user.id, plan_id=merge_request.main_plan_id)
    diff_summary = getattr(merge_request, "diff_summary", {}) or {}
    changed_event_names = set(diff_summary.get("added_events") or [])
    changed_event_names.update(
        event.get("event_name")
        for event in diff_summary.get("modified_events") or []
        if event.get("event_name")
    )
    findings = await SemanticConsistencyService(db).merge_request_consistency(
        main_plan_id=merge_request.main_plan_id,
        branch_plan_id=merge_request.branch_plan_id,
        changed_event_names=changed_event_names,
    )
    return ConsistencyAuditResponse(
        plan_id=merge_request.branch_plan_id,
        finding_count=len(findings),
        findings=[
            ConsistencyAuditFinding(
                event_id=UUID(finding["event_id"]),
                event_name=finding["event_name"],
                candidate=_candidate_response(finding["candidate"]),
            )
            for finding in findings
        ],
    )


@router.get(
    "/events/{event_id}/consistency",
    response_model=ConsistencyPreviewResponse,
)
async def event_consistency(
    event_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(EventSchema.plan_id).where(EventSchema.id == event_id))
    plan_id = result.scalar_one_or_none()
    if plan_id is None:
        raise NotFoundError("Event", code="event_not_found")
    await resolve_plan_access(db, user_id=current_user.id, plan_id=plan_id)
    proposed, candidates = await SemanticConsistencyService(db).event_consistency(event_id)
    return ConsistencyPreviewResponse(
        proposed_event_name=proposed.event_name,
        candidate_count=len(candidates),
        candidates=[_candidate_response(candidate) for candidate in candidates],
    )
