"""Add serious v1 governance and validation fields

Revision ID: b1c2d3e4f5a6
Revises: a86c676aa1e4
Create Date: 2026-04-09 18:30:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "b1c2d3e4f5a6"
down_revision: Union[str, None] = "a86c676aa1e4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "tracking_plans",
        sa.Column("draft_revision", sa.Integer(), nullable=False, server_default="1"),
    )
    op.add_column(
        "tracking_plans",
        sa.Column("updated_by", sa.UUID(), nullable=True),
    )
    op.add_column(
        "tracking_plans",
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_tracking_plans_updated_by_users",
        "tracking_plans",
        "users",
        ["updated_by"],
        ["id"],
    )

    op.add_column(
        "versions",
        sa.Column("published_from_revision", sa.Integer(), nullable=False, server_default="1"),
    )
    op.add_column(
        "versions",
        sa.Column(
            "compatibility_report",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
    )
    op.add_column(
        "versions",
        sa.Column("restored_from_version_id", sa.UUID(), nullable=True),
    )
    op.add_column(
        "versions",
        sa.Column("publish_kind", sa.String(length=32), nullable=False, server_default="publish"),
    )
    op.create_foreign_key(
        "fk_versions_restored_from_version_id_versions",
        "versions",
        "versions",
        ["restored_from_version_id"],
        ["id"],
    )

    op.add_column(
        "merge_requests",
        sa.Column("base_version_id", sa.UUID(), nullable=True),
    )
    op.add_column(
        "merge_requests",
        sa.Column("source_revision", sa.Integer(), nullable=False, server_default="1"),
    )
    op.add_column(
        "merge_requests",
        sa.Column("target_revision", sa.Integer(), nullable=False, server_default="1"),
    )
    op.add_column(
        "merge_requests",
        sa.Column("merged_version_id", sa.UUID(), nullable=True),
    )
    op.add_column(
        "merge_requests",
        sa.Column("closed_by", sa.UUID(), nullable=True),
    )
    op.add_column(
        "merge_requests",
        sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_merge_requests_base_version_id_versions",
        "merge_requests",
        "versions",
        ["base_version_id"],
        ["id"],
    )
    op.create_foreign_key(
        "fk_merge_requests_merged_version_id_versions",
        "merge_requests",
        "versions",
        ["merged_version_id"],
        ["id"],
    )
    op.create_foreign_key(
        "fk_merge_requests_closed_by_users",
        "merge_requests",
        "users",
        ["closed_by"],
        ["id"],
        ondelete="SET NULL",
    )

    op.add_column(
        "api_keys",
        sa.Column("scope", sa.String(length=32), nullable=False, server_default="validate"),
    )
    op.add_column(
        "api_keys",
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "api_keys",
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
    )

    op.add_column(
        "validation_logs",
        sa.Column("version_id", sa.UUID(), nullable=True),
    )
    op.add_column(
        "validation_logs",
        sa.Column("api_key_id", sa.UUID(), nullable=True),
    )
    op.add_column(
        "validation_logs",
        sa.Column("request_id", sa.UUID(), nullable=True),
    )
    op.create_foreign_key(
        "fk_validation_logs_version_id_versions",
        "validation_logs",
        "versions",
        ["version_id"],
        ["id"],
    )
    op.create_foreign_key(
        "fk_validation_logs_api_key_id_api_keys",
        "validation_logs",
        "api_keys",
        ["api_key_id"],
        ["id"],
    )

    op.add_column(
        "invalid_payload_errors",
        sa.Column("version_id", sa.UUID(), nullable=True),
    )
    op.add_column(
        "invalid_payload_errors",
        sa.Column("validation_log_id", sa.UUID(), nullable=True),
    )
    op.add_column(
        "invalid_payload_errors",
        sa.Column(
            "first_seen_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )
    op.add_column(
        "invalid_payload_errors",
        sa.Column(
            "last_seen_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )
    op.add_column(
        "invalid_payload_errors",
        sa.Column("occurrence_count", sa.Integer(), nullable=False, server_default="1"),
    )
    op.create_foreign_key(
        "fk_invalid_payload_errors_version_id_versions",
        "invalid_payload_errors",
        "versions",
        ["version_id"],
        ["id"],
    )
    op.create_foreign_key(
        "fk_invalid_payload_errors_validation_log_id_validation_logs",
        "invalid_payload_errors",
        "validation_logs",
        ["validation_log_id"],
        ["id"],
    )

    op.create_index(
        "idx_validation_logs_plan_version",
        "validation_logs",
        ["plan_id", "version_id", "validated_at"],
        unique=False,
    )
    op.create_index(
        "idx_invalid_payload_errors_plan_last_seen",
        "invalid_payload_errors",
        ["plan_id", "last_seen_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("idx_invalid_payload_errors_plan_last_seen", table_name="invalid_payload_errors")
    op.drop_index("idx_validation_logs_plan_version", table_name="validation_logs")

    op.drop_constraint(
        "fk_invalid_payload_errors_validation_log_id_validation_logs",
        "invalid_payload_errors",
        type_="foreignkey",
    )
    op.drop_constraint(
        "fk_invalid_payload_errors_version_id_versions",
        "invalid_payload_errors",
        type_="foreignkey",
    )
    op.drop_column("invalid_payload_errors", "occurrence_count")
    op.drop_column("invalid_payload_errors", "last_seen_at")
    op.drop_column("invalid_payload_errors", "first_seen_at")
    op.drop_column("invalid_payload_errors", "validation_log_id")
    op.drop_column("invalid_payload_errors", "version_id")

    op.drop_constraint("fk_validation_logs_api_key_id_api_keys", "validation_logs", type_="foreignkey")
    op.drop_constraint("fk_validation_logs_version_id_versions", "validation_logs", type_="foreignkey")
    op.drop_column("validation_logs", "request_id")
    op.drop_column("validation_logs", "api_key_id")
    op.drop_column("validation_logs", "version_id")

    op.drop_column("api_keys", "revoked_at")
    op.drop_column("api_keys", "last_used_at")
    op.drop_column("api_keys", "scope")

    op.drop_constraint("fk_merge_requests_closed_by_users", "merge_requests", type_="foreignkey")
    op.drop_constraint(
        "fk_merge_requests_merged_version_id_versions",
        "merge_requests",
        type_="foreignkey",
    )
    op.drop_constraint(
        "fk_merge_requests_base_version_id_versions",
        "merge_requests",
        type_="foreignkey",
    )
    op.drop_column("merge_requests", "closed_at")
    op.drop_column("merge_requests", "closed_by")
    op.drop_column("merge_requests", "merged_version_id")
    op.drop_column("merge_requests", "target_revision")
    op.drop_column("merge_requests", "source_revision")
    op.drop_column("merge_requests", "base_version_id")

    op.drop_constraint(
        "fk_versions_restored_from_version_id_versions",
        "versions",
        type_="foreignkey",
    )
    op.drop_column("versions", "publish_kind")
    op.drop_column("versions", "restored_from_version_id")
    op.drop_column("versions", "compatibility_report")
    op.drop_column("versions", "published_from_revision")

    op.drop_constraint(
        "fk_tracking_plans_updated_by_users",
        "tracking_plans",
        type_="foreignkey",
    )
    op.drop_column("tracking_plans", "archived_at")
    op.drop_column("tracking_plans", "updated_by")
    op.drop_column("tracking_plans", "draft_revision")
