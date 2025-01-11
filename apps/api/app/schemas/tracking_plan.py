from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field

PropertyTypeValue = Literal["string", "integer", "float", "boolean", "array", "object"]
ValidationMode = Literal["warn", "block", "quarantine"]


class RevisionedRequest(BaseModel):
    draft_revision: int = Field(ge=1)


class PlanCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str | None = None


class PlanUpdate(RevisionedRequest):
    name: str | None = Field(None, min_length=1, max_length=200)
    description: str | None = None
    status: str | None = None


class PlanBranchCreate(RevisionedRequest):
    branch_name: str = Field(min_length=1, max_length=100)


class GlobalPropertyCreate(RevisionedRequest):
    name: str = Field(min_length=1, max_length=200)
    description: str | None = None
    type: PropertyTypeValue
    required: bool = False
    constraints: dict[str, Any] = Field(default_factory=dict)
    examples: list[Any] = Field(default_factory=list)


class GlobalPropertyUpdate(RevisionedRequest):
    name: str | None = Field(None, min_length=1, max_length=200)
    description: str | None = None
    type: PropertyTypeValue | None = None
    required: bool | None = None
    constraints: dict[str, Any] | None = None
    examples: list[Any] | None = None


class GlobalPropertyResponse(BaseModel):
    id: uuid.UUID
    plan_id: uuid.UUID
    name: str
    description: str | None
    type: str
    required: bool
    constraints: dict[str, Any]
    examples: list[Any]
    created_at: datetime
    draft_revision: int | None = None

    model_config = {"from_attributes": True}


class PropertyCreate(RevisionedRequest):
    name: str = Field(min_length=1, max_length=200)
    description: str | None = None
    type: PropertyTypeValue
    required: bool = False
    constraints: dict[str, Any] = Field(default_factory=dict)
    examples: list[Any] = Field(default_factory=list)


class PropertyUpdate(RevisionedRequest):
    name: str | None = Field(None, min_length=1, max_length=200)
    description: str | None = None
    type: PropertyTypeValue | None = None
    required: bool | None = None
    constraints: dict[str, Any] | None = None
    examples: list[Any] | None = None


class PropertyResponse(BaseModel):
    id: uuid.UUID
    event_id: uuid.UUID
    name: str
    description: str | None
    type: str
    required: bool
    constraints: dict[str, Any]
    examples: list[Any]
    created_at: datetime
    draft_revision: int | None = None

    model_config = {"from_attributes": True}


class EventCreate(RevisionedRequest):
    event_name: str = Field(min_length=1, max_length=200)
    description: str | None = None
    category: str | None = Field(None, max_length=100)


class EventUpdate(RevisionedRequest):
    event_name: str | None = Field(None, min_length=1, max_length=200)
    description: str | None = None
    category: str | None = None
    status: str | None = None


class EventResponse(BaseModel):
    id: uuid.UUID
    plan_id: uuid.UUID
    event_name: str
    description: str | None
    category: str | None
    status: str
    sort_order: int
    created_at: datetime
    updated_at: datetime
    properties: list[PropertyResponse] = Field(default_factory=list)
    global_properties: list[GlobalPropertyResponse] = Field(default_factory=list)
    draft_revision: int | None = None

    model_config = {"from_attributes": True}


class PlanResponse(BaseModel):
    id: uuid.UUID
    org_id: uuid.UUID
    name: str
    description: str | None
    current_version: int
    draft_revision: int
    status: str
    is_main: bool = True
    parent_plan_id: uuid.UUID | None = None
    branch_name: str | None = None
    archived_at: datetime | None = None
    created_at: datetime
    updated_at: datetime
    events_count: int = 0

    model_config = {"from_attributes": True}


class PlanDetailResponse(PlanResponse):
    events: list[EventResponse] = Field(default_factory=list)
    global_properties: list[GlobalPropertyResponse] = Field(default_factory=list)


class ImportProperty(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    type: PropertyTypeValue
    description: str | None = None
    required: bool = False
    constraints: dict[str, Any] = Field(default_factory=dict)
    examples: list[Any] = Field(default_factory=list)


class ImportGlobalProperty(ImportProperty):
    pass


class ImportEvent(BaseModel):
    event_name: str = Field(min_length=1, max_length=200)
    description: str | None = None
    category: str | None = None
    properties: list[ImportProperty] = Field(default_factory=list)
    global_properties: list[str] = Field(default_factory=list)


class ImportPlanRequest(RevisionedRequest):
    format: Literal["structured", "json", "yaml", "template"] = "structured"
    data: dict[str, Any] | list[Any] | str | None = None
    events: list[ImportEvent] = Field(default_factory=list)
    global_properties: list[ImportGlobalProperty] = Field(default_factory=list)
    template: str | None = None


class ImportPlanResponse(BaseModel):
    warnings: list[str] = Field(default_factory=list)
    imported_events: int
    imported_global_properties: int
    draft_revision: int
    plan: PlanDetailResponse


class ViolationResponse(BaseModel):
    code: str
    message: str
    path: str
    event_name: str
    property_name: str | None = None
    expected: Any | None = None
    actual: Any | None = None


class ValidateRequest(BaseModel):
    event: str
    properties: dict[str, Any] = Field(default_factory=dict)
    mode: ValidationMode = "warn"
    source: str | None = None
    request_id: uuid.UUID | None = None
    timestamp: datetime | None = None


class ValidateBatchRequest(BaseModel):
    events: list[ValidateRequest]


class ValidateResponse(BaseModel):
    valid: bool
    mode: ValidationMode
    version_id: uuid.UUID | None = None
    event: str
    violations: list[ViolationResponse] = Field(default_factory=list)
    validated_at: datetime


class FailureCount(BaseModel):
    name: str
    count: int


class ComplianceStats(BaseModel):
    total_events: int
    valid_count: int
    invalid_count: int
    compliance_rate: float
    top_failing_events: list[dict[str, Any]] = Field(default_factory=list)
    top_failing_properties: list[dict[str, Any]] = Field(default_factory=list)
    period: str


class PublishPlanRequest(RevisionedRequest):
    summary: str | None = None
    allow_breaking: bool = False


class VersionResponse(BaseModel):
    id: uuid.UUID
    version_id: uuid.UUID
    plan_id: uuid.UUID
    version_number: int
    created_by: uuid.UUID
    author_name: str | None = None
    change_summary: str | None
    compatibility_report: dict[str, Any] = Field(default_factory=dict)
    publish_kind: str
    published_from_revision: int
    restored_from_version_id: uuid.UUID | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class VersionDiffResponse(BaseModel):
    version_a: int
    version_b: int
    added_events: list[str] = Field(default_factory=list)
    removed_events: list[str] = Field(default_factory=list)
    modified_events: list[dict[str, Any]] = Field(default_factory=list)


class RestoreVersionResponse(BaseModel):
    plan_id: uuid.UUID
    draft_revision: int
    restored_from_version_id: uuid.UUID


class ApiKeyCreate(BaseModel):
    label: str = Field(min_length=1, max_length=100)


class ApiKeyResponse(BaseModel):
    id: uuid.UUID
    key_prefix: str
    label: str
    scope: str
    is_active: bool
    created_at: datetime
    last_used_at: datetime | None = None
    revoked_at: datetime | None = None

    model_config = {"from_attributes": True}


class ApiKeyCreatedResponse(ApiKeyResponse):
    full_key: str


class InvalidPayloadErrorResponse(BaseModel):
    id: uuid.UUID
    plan_id: uuid.UUID
    event_name: str
    payload: dict[str, Any]
    error_reason: str
    version_id: uuid.UUID | None = None
    validation_log_id: uuid.UUID | None = None
    first_seen_at: datetime | None = None
    last_seen_at: datetime | None = None
    occurrence_count: int = 1
    created_at: datetime

    model_config = {"from_attributes": True}


class HealthResponse(BaseModel):
    status: Literal["ok"]
