"""market lab: scenario-driven fictional stock practice sessions

Additive only. One row per scenario attempt; a partial unique index keeps at most one active
session per student.

Revision ID: 0010
Revises: 0009
Create Date: 2026-10-11 06:30:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0010"
down_revision: str | None = "0009"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "market_lab_sessions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("student_id", sa.Uuid(), nullable=False),
        sa.Column("scenario_key", sa.String(length=40), nullable=False),
        sa.Column("attempt_number", sa.Integer(), nullable=False),
        sa.Column("seed", sa.BigInteger(), nullable=False),
        sa.Column("step", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=12), nullable=False),
        sa.Column("cash_paise", sa.BigInteger(), nullable=False),
        sa.Column("starting_cash_paise", sa.BigInteger(), nullable=False),
        sa.Column(
            "state",
            sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), "postgresql"),
            nullable=False,
        ),
        sa.Column("debrief_correct", sa.Boolean(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "status IN ('active', 'completed', 'abandoned')",
            name=op.f("ck_market_lab_sessions_status"),
        ),
        sa.CheckConstraint(
            "cash_paise >= 0", name=op.f("ck_market_lab_sessions_cash_non_negative")
        ),
        sa.CheckConstraint(
            "step >= 0 AND step <= 20", name=op.f("ck_market_lab_sessions_step_range")
        ),
        sa.ForeignKeyConstraint(
            ["student_id"],
            ["users.id"],
            name=op.f("fk_market_lab_sessions_student_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_market_lab_sessions")),
    )
    op.create_index(
        "ix_market_lab_student_created", "market_lab_sessions", ["student_id", "created_at"]
    )
    op.create_index(
        "uq_market_lab_one_active",
        "market_lab_sessions",
        ["student_id"],
        unique=True,
        postgresql_where=sa.text("status = 'active'"),
    )


def downgrade() -> None:
    op.drop_index("uq_market_lab_one_active", table_name="market_lab_sessions")
    op.drop_index("ix_market_lab_student_created", table_name="market_lab_sessions")
    op.drop_table("market_lab_sessions")
