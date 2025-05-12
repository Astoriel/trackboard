from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, NotFoundError
from app.models import MergeRequest
from app.services.audit_service import AuditService
from app.services.snapshot_service import SnapshotService


class MergeService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.snapshot_service = SnapshotService(db)
        self.audit_service = AuditService(db)

    async def create_merge_request(
        self,
        *,
        main_plan_id: UUID,
        branch_plan_id: UUID,
        user_id: UUID,
        title: str,
        description: str | None,
    ) -> MergeRequest:
        main_plan = await self.snapshot_service.load_plan_with_schema(main_plan_id)
        branch_plan = await self.snapshot_service.load_plan_with_schema(branch_plan_id)
        if not main_plan.is_main:
            raise ConflictError("Merge requests must target the main workspace.", code="invalid_merge_target")
        if branch_plan.parent_plan_id != main_plan.id:
            raise ConflictError("Branch does not belong to the target plan.", code="invalid_merge_branch")

        latest_version = await self.snapshot_service.get_latest_version(main_plan.id)
        diff_summary = self.snapshot_service.diff_snapshots(
            self.snapshot_service.build_snapshot(main_plan),
            self.snapshot_service.build_snapshot(branch_plan),
        )

        merge_request = MergeRequest(
            main_plan_id=main_plan.id,
            branch_plan_id=branch_plan.id,
            author_id=user_id,
            title=title,
            description=description,
            status="open",
            base_version_id=latest_version.id if latest_version else None,
            source_revision=branch_plan.draft_revision,
            target_revision=main_plan.draft_revision,
        )
        merge_request.description = description
        self.db.add(merge_request)
        await self.db.flush()
        merge_request.__dict__["diff_summary"] = diff_summary
        await self.audit_service.log_action(
            plan_id=main_plan.id,
            user_id=user_id,
            action="merge_request.created",
            resource_type="merge_request",
            resource_id=merge_request.id,
            changes={
                "branch_plan_id": str(branch_plan.id),
                "source_revision": branch_plan.draft_revision,
                "target_revision": main_plan.draft_revision,
            },
        )
        return merge_request

    async def list_merge_requests(self, main_plan_id: UUID) -> list[MergeRequest]:
        result = await self.db.execute(
            select(MergeRequest)
            .where(MergeRequest.main_plan_id == main_plan_id)
            .order_by(MergeRequest.created_at.desc())
        )
        merge_requests = list(result.scalars().all())
        for merge_request in merge_requests:
            merge_request.__dict__["diff_summary"] = await self.get_diff_summary(merge_request)
        return merge_requests

    async def get_merge_request(self, merge_request_id: UUID) -> MergeRequest:
        result = await self.db.execute(select(MergeRequest).where(MergeRequest.id == merge_request_id))
        merge_request = result.scalar_one_or_none()
        if merge_request is None:
            raise NotFoundError("Merge request", code="merge_request_not_found")
        merge_request.__dict__["diff_summary"] = await self.get_diff_summary(merge_request)
        return merge_request

    async def merge_merge_request(self, merge_request_id: UUID, user_id: UUID) -> MergeRequest:
        merge_request = await self.get_merge_request(merge_request_id)
        if merge_request.status != "open":
            raise ConflictError("Only open merge requests can be merged.", code="merge_request_not_open")

        main_plan = await self.snapshot_service.load_plan_with_schema(merge_request.main_plan_id)
        branch_plan = await self.snapshot_service.load_plan_with_schema(merge_request.branch_plan_id)

        if main_plan.draft_revision != merge_request.target_revision:
            raise ConflictError(
                "Main workspace changed since this merge request was created.",
                code="merge_target_drifted",
                extra={"current_revision": main_plan.draft_revision},
            )
        if branch_plan.draft_revision != merge_request.source_revision:
            raise ConflictError(
                "Branch workspace changed since this merge request was created.",
                code="merge_source_drifted",
                extra={"current_revision": branch_plan.draft_revision},
            )

        branch_snapshot = self.snapshot_service.build_snapshot(branch_plan)
        await self.snapshot_service.apply_snapshot_to_plan(main_plan, branch_snapshot)
        main_plan.draft_revision += 1
        main_plan.updated_by = user_id

        merge_request.status = "merged"
        merge_request.closed_by = user_id
        merge_request.closed_at = datetime.now(timezone.utc)
        await self.audit_service.log_action(
            plan_id=main_plan.id,
            user_id=user_id,
            action="merge_request.merged",
            resource_type="merge_request",
            resource_id=merge_request.id,
            changes={"new_target_revision": main_plan.draft_revision},
        )
        await self.db.flush()
        return merge_request

    async def get_diff_summary(self, merge_request: MergeRequest) -> dict:
        main_snapshot = await self.snapshot_service.get_plan_snapshot(merge_request.main_plan_id)
        branch_snapshot = await self.snapshot_service.get_plan_snapshot(merge_request.branch_plan_id)
        return self.snapshot_service.diff_snapshots(main_snapshot, branch_snapshot)
