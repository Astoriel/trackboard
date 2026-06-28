"""Add DLQ triage reports

Revision ID: c7d8e9f0a1b2
Revises: b1c2d3e4f5a6
Create Date: 2026-06-28 13:30:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "c7d8e9f0a1b2"
down_revision: Union[str, None] = "b1c2d3e4f5a6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "dlq_triage_reports",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("plan_id", sa.UUID(), nullable=False),
        sa.Column("group_fingerprint", sa.String(length=80), nullable=False),
        sa.Column("version_id", sa.UUID(), nullable=True),
        sa.Column("event_name", sa.String(length=200), nullable=False),
        sa.Column("input_hash", sa.String(length=80), nullable=False),
        sa.Column("report", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column(
            "redaction_report",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column("model", sa.String(length=100), nullable=True),
        sa.Column("created_by", sa.UUID(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"]),
        sa.ForeignKeyConstraint(["plan_id"], ["tracking_plans.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["version_id"], ["versions.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "plan_id",
            "group_fingerprint",
            "input_hash",
            name="uq_dlq_triage_reports_plan_fingerprint_input",
        ),
    )
    op.create_index(
        "idx_dlq_triage_reports_plan_fingerprint",
        "dlq_triage_reports",
        ["plan_id", "group_fingerprint"],
        unique=False,
    )
    op.create_index(
        "idx_dlq_triage_reports_plan_created",
        "dlq_triage_reports",
        ["plan_id", "created_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("idx_dlq_triage_reports_plan_created", table_name="dlq_triage_reports")
    op.drop_index("idx_dlq_triage_reports_plan_fingerprint", table_name="dlq_triage_reports")
    op.drop_table("dlq_triage_reports")
