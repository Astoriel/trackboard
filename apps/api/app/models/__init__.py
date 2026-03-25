import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    Boolean,
    Computed,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import INET, JSONB, TSVECTOR, UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


# ── Enums ──


class UserRole(str, enum.Enum):
    OWNER = "owner"
    ADMIN = "admin"
    EDITOR = "editor"
    VIEWER = "viewer"


class PlanStatus(str, enum.Enum):
    DRAFT = "draft"
    ACTIVE = "active"
    ARCHIVED = "archived"


class EventStatus(str, enum.Enum):
    ACTIVE = "active"
    DEPRECATED = "deprecated"
    PLANNED = "planned"


class PropertyType(str, enum.Enum):
    STRING = "string"
    INTEGER = "integer"
    FLOAT = "float"
    BOOLEAN = "boolean"
    ARRAY = "array"
    OBJECT = "object"


# ── Helpers ──


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _uuid() -> uuid.UUID:
    return uuid.uuid4()


# ── Models ──


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    avatar_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    # relationships
    memberships: Mapped[list["OrgMember"]] = relationship(back_populates="user", lazy="selectin")
    comments: Mapped[list["Comment"]] = relationship(back_populates="user", lazy="noload")


class Organization(Base):
    __tablename__ = "organizations"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    slug: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    settings: Mapped[dict] = mapped_column(JSONB, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    # relationships
    members: Mapped[list["OrgMember"]] = relationship(back_populates="organization", lazy="selectin")
    tracking_plans: Mapped[list["TrackingPlan"]] = relationship(
        back_populates="organization", lazy="noload"
    )


class OrgMember(Base):
    __tablename__ = "org_members"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    org_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False
    )
    role: Mapped[UserRole] = mapped_column(
        Enum(UserRole, name="user_role"), default=UserRole.EDITOR
    )
    joined_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    # relationships
    user: Mapped["User"] = relationship(back_populates="memberships", lazy="selectin")
    organization: Mapped["Organization"] = relationship(back_populates="members", lazy="selectin")

    __table_args__ = (UniqueConstraint("user_id", "org_id", name="uq_user_org"),)


class TrackingPlan(Base):
    __tablename__ = "tracking_plans"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    org_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_main: Mapped[bool] = mapped_column(Boolean, default=True)
    parent_plan_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tracking_plans.id", ondelete="CASCADE"), nullable=True
    )
    branch_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    current_version: Mapped[int] = mapped_column(Integer, default=1)
    draft_revision: Mapped[int] = mapped_column(Integer, default=1)
    status: Mapped[PlanStatus] = mapped_column(
        Enum(PlanStatus, name="plan_status"), default=PlanStatus.DRAFT
    )
    metadata_: Mapped[dict] = mapped_column("metadata", JSONB, default=dict)
    updated_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    search_vector: Mapped[str | None] = mapped_column(
        TSVECTOR,
        Computed("to_tsvector('english', name || ' ' || coalesce(description, ''))", persisted=True)
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )

    # relationships
    organization: Mapped["Organization"] = relationship(
        back_populates="tracking_plans", lazy="selectin"
    )
    events: Mapped[list["EventSchema"]] = relationship(
        back_populates="tracking_plan", lazy="selectin", cascade="all, delete-orphan"
    )
    versions: Mapped[list["Version"]] = relationship(
        back_populates="tracking_plan", lazy="noload", cascade="all, delete-orphan"
    )
    api_keys: Mapped[list["ApiKey"]] = relationship(
        back_populates="tracking_plan", lazy="noload", cascade="all, delete-orphan"
    )
    validation_logs: Mapped[list["ValidationLog"]] = relationship(
        back_populates="tracking_plan", lazy="noload", cascade="all, delete-orphan"
    )
    global_properties: Mapped[list["GlobalProperty"]] = relationship(
        back_populates="tracking_plan", lazy="selectin", cascade="all, delete-orphan"
    )
    invalid_payload_errors: Mapped[list["InvalidPayloadError"]] = relationship(
        back_populates="tracking_plan", lazy="noload", cascade="all, delete-orphan"
    )
    integrations: Mapped[list["Integration"]] = relationship(
        back_populates="tracking_plan", lazy="noload", cascade="all, delete-orphan"
    )
    webhooks: Mapped[list["Webhook"]] = relationship(
        back_populates="tracking_plan", lazy="noload", cascade="all, delete-orphan"
    )

    __table_args__ = (
        Index("idx_tracking_plans_search", "search_vector", postgresql_using="gin"),
    )


class EventSchema(Base):
    __tablename__ = "event_schemas"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    plan_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tracking_plans.id", ondelete="CASCADE"), nullable=False
    )
    event_name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    category: Mapped[str | None] = mapped_column(String(100), nullable=True)
    status: Mapped[EventStatus] = mapped_column(
        Enum(EventStatus, name="event_status"), default=EventStatus.ACTIVE
    )
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    search_vector: Mapped[str | None] = mapped_column(
        TSVECTOR,
        Computed("to_tsvector('english', event_name || ' ' || coalesce(category, '') || ' ' || coalesce(description, ''))", persisted=True)
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )

    # relationships
    tracking_plan: Mapped["TrackingPlan"] = relationship(back_populates="events", lazy="selectin")
    properties: Mapped[list["Property"]] = relationship(
        back_populates="event_schema", lazy="selectin", cascade="all, delete-orphan"
    )
    comments: Mapped[list["Comment"]] = relationship(
        back_populates="event_schema", lazy="noload", cascade="all, delete-orphan"
    )
    global_properties: Mapped[list["GlobalProperty"]] = relationship(
        secondary="event_global_properties", back_populates="events", lazy="selectin"
    )

    __table_args__ = (
        UniqueConstraint("plan_id", "event_name", name="uq_plan_event_name"),
        Index("idx_event_schemas_plan", "plan_id"),
        Index("idx_event_schemas_search", "search_vector", postgresql_using="gin"),
    )


class Property(Base):
    __tablename__ = "properties"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    event_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("event_schemas.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    type: Mapped[PropertyType] = mapped_column(
        Enum(PropertyType, name="property_type"), nullable=False
    )
    required: Mapped[bool] = mapped_column(Boolean, default=False)
    constraints: Mapped[dict] = mapped_column(JSONB, default=dict)
    examples: Mapped[list] = mapped_column(JSONB, default=list)
    search_vector: Mapped[str | None] = mapped_column(
        TSVECTOR,
        Computed("to_tsvector('english', name || ' ' || coalesce(description, ''))", persisted=True)
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    # relationships
    event_schema: Mapped["EventSchema"] = relationship(back_populates="properties", lazy="selectin")

    __table_args__ = (
        UniqueConstraint("event_id", "name", name="uq_event_property_name"),
        Index("idx_properties_event", "event_id"),
        Index("idx_properties_search", "search_vector", postgresql_using="gin"),
    )


class Version(Base):
    __tablename__ = "versions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    plan_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tracking_plans.id", ondelete="CASCADE"), nullable=False
    )
    version_number: Mapped[int] = mapped_column(Integer, nullable=False)
    created_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    change_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    snapshot: Mapped[dict] = mapped_column(JSONB, nullable=False)
    published_from_revision: Mapped[int] = mapped_column(Integer, default=1)
    compatibility_report: Mapped[dict] = mapped_column(JSONB, default=dict)
    restored_from_version_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("versions.id"), nullable=True
    )
    publish_kind: Mapped[str] = mapped_column(String(32), default="publish")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    # relationships
    tracking_plan: Mapped["TrackingPlan"] = relationship(back_populates="versions")
    author: Mapped["User"] = relationship(foreign_keys=[created_by], lazy="selectin")


class ValidationLog(Base):
    __tablename__ = "validation_logs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    plan_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tracking_plans.id", ondelete="CASCADE"), nullable=False
    )
    event_name: Mapped[str] = mapped_column(String(200), nullable=False)
    payload: Mapped[dict] = mapped_column(JSONB, nullable=False)
    is_valid: Mapped[bool] = mapped_column(Boolean, nullable=False)
    errors: Mapped[list] = mapped_column(JSONB, default=list)
    version_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("versions.id"), nullable=True
    )
    api_key_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("api_keys.id"), nullable=True
    )
    request_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    source_ip: Mapped[str | None] = mapped_column(INET, nullable=True)
    source_label: Mapped[str | None] = mapped_column(String(100), nullable=True)
    validated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    # relationships
    tracking_plan: Mapped["TrackingPlan"] = relationship(back_populates="validation_logs")

    __table_args__ = (
        Index("idx_validation_logs_plan_time", "plan_id", "validated_at"),
        Index("idx_validation_logs_valid", "plan_id", "is_valid"),
    )


class ApiKey(Base):
    __tablename__ = "api_keys"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    plan_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tracking_plans.id", ondelete="CASCADE"), nullable=False
    )
    created_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    key_hash: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    key_prefix: Mapped[str] = mapped_column(String(12), nullable=False)
    label: Mapped[str] = mapped_column(String(100), nullable=False)
    scope: Mapped[str] = mapped_column(String(32), default="validate")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # relationships
    tracking_plan: Mapped["TrackingPlan"] = relationship(back_populates="api_keys")
    creator: Mapped["User"] = relationship(lazy="selectin")


class Comment(Base):
    __tablename__ = "comments"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    event_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("event_schemas.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    body: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    # relationships
    event_schema: Mapped["EventSchema"] = relationship(back_populates="comments")
    user: Mapped["User"] = relationship(back_populates="comments", lazy="selectin")


class EventGlobalPropertyLink(Base):
    __tablename__ = "event_global_properties"

    event_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("event_schemas.id", ondelete="CASCADE"), primary_key=True
    )
    global_property_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("global_properties.id", ondelete="CASCADE"), primary_key=True
    )


class GlobalProperty(Base):
    __tablename__ = "global_properties"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    plan_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tracking_plans.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    type: Mapped[PropertyType] = mapped_column(
        Enum(PropertyType, name="property_type", create_type=False), nullable=False
    )
    required: Mapped[bool] = mapped_column(Boolean, default=False)
    constraints: Mapped[dict] = mapped_column(JSONB, default=dict)
    examples: Mapped[list] = mapped_column(JSONB, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    # relationships
    tracking_plan: Mapped["TrackingPlan"] = relationship(back_populates="global_properties", lazy="selectin")
    events: Mapped[list["EventSchema"]] = relationship(
        secondary="event_global_properties", back_populates="global_properties"
    )

    __table_args__ = (
        UniqueConstraint("plan_id", "name", name="uq_plan_global_property_name"),
        Index("idx_global_properties_plan", "plan_id"),
    )


class InvalidPayloadError(Base):
    __tablename__ = "invalid_payload_errors"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    plan_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tracking_plans.id", ondelete="CASCADE"), nullable=False
    )
    event_name: Mapped[str] = mapped_column(String(200), nullable=False)
    payload: Mapped[dict] = mapped_column(JSONB, nullable=False)
    error_reason: Mapped[str] = mapped_column(Text, nullable=False)
    version_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("versions.id"), nullable=True
    )
    validation_log_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("validation_logs.id"), nullable=True
    )
    first_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    occurrence_count: Mapped[int] = mapped_column(Integer, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    # relationships
    tracking_plan: Mapped["TrackingPlan"] = relationship(back_populates="invalid_payload_errors")


class Integration(Base):
    __tablename__ = "integrations"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    plan_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tracking_plans.id", ondelete="CASCADE"), nullable=False
    )
    provider: Mapped[str] = mapped_column(String(50), nullable=False)
    config: Mapped[dict] = mapped_column(JSONB, default=dict)
    status: Mapped[str] = mapped_column(String(50), default="active")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )

    # relationships
    tracking_plan: Mapped["TrackingPlan"] = relationship(back_populates="integrations", lazy="selectin")


class MergeRequest(Base):
    __tablename__ = "merge_requests"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    main_plan_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tracking_plans.id", ondelete="CASCADE"), nullable=False
    )
    branch_plan_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tracking_plans.id", ondelete="CASCADE"), nullable=False
    )
    author_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(50), default="open")
    base_version_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("versions.id"), nullable=True
    )
    source_revision: Mapped[int] = mapped_column(Integer, default=1)
    target_revision: Mapped[int] = mapped_column(Integer, default=1)
    merged_version_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("versions.id"), nullable=True
    )
    closed_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )

    # relationships
    main_plan: Mapped["TrackingPlan"] = relationship(foreign_keys=[main_plan_id], lazy="selectin")
    branch_plan: Mapped["TrackingPlan"] = relationship(foreign_keys=[branch_plan_id], lazy="selectin")
    author: Mapped["User"] = relationship(foreign_keys=[author_id], lazy="selectin")
    closer: Mapped["User | None"] = relationship(foreign_keys=[closed_by], lazy="selectin")


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    plan_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tracking_plans.id", ondelete="CASCADE"), nullable=True
    )
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    action: Mapped[str] = mapped_column(String(100), nullable=False)
    resource_type: Mapped[str] = mapped_column(String(100), nullable=False)
    resource_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    changes: Mapped[dict] = mapped_column(JSONB, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    # relationships
    tracking_plan: Mapped["TrackingPlan"] = relationship(lazy="noload")
    user: Mapped["User"] = relationship(lazy="selectin")


class Webhook(Base):
    __tablename__ = "webhooks"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    plan_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tracking_plans.id", ondelete="CASCADE"), nullable=False
    )
    url: Mapped[str] = mapped_column(String(500), nullable=False)
    secret: Mapped[str | None] = mapped_column(String(100), nullable=True)
    events: Mapped[list] = mapped_column(JSONB, default=list)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    # relationships
    tracking_plan: Mapped["TrackingPlan"] = relationship(back_populates="webhooks")


class WebhookDelivery(Base):
    __tablename__ = "webhook_deliveries"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    webhook_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("webhooks.id", ondelete="CASCADE"), nullable=False
    )
    payload: Mapped[dict] = mapped_column(JSONB, nullable=False)
    status_code: Mapped[int | None] = mapped_column(Integer, nullable=True)
    response_body: Mapped[str | None] = mapped_column(Text, nullable=True)
    success: Mapped[bool] = mapped_column(Boolean, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    # relationships
    webhook: Mapped["Webhook"] = relationship(lazy="noload")
