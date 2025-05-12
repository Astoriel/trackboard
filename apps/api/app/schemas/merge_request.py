from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field


class MergeRequestCreate(BaseModel):
    branch_plan_id: UUID
    title: str = Field(min_length=1, max_length=200)
    description: str | None = None


class MergeRequestResponse(BaseModel):
    id: UUID
    main_plan_id: UUID
    branch_plan_id: UUID
    author_id: UUID | None
    title: str
    description: str | None
    status: str
    base_version_id: UUID | None = None
    source_revision: int
    target_revision: int
    merged_version_id: UUID | None = None
    closed_by: UUID | None = None
    closed_at: datetime | None = None
    diff_summary: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
