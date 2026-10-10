"""security core: sessions, organisation-bound educator invites, rate limits, transfers

Additive only. Existing rows are untouched. Existing 12-hour bearer tokens stop working
(they carry no session id), so everyone signs in once after deploy.

Revision ID: 0007
Revises: 0006
Create Date: 2026-10-11 02:30:00
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0007"
down_revision: str | None = "0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("users", sa.Column("password_changed_at", sa.DateTime(timezone=True)))
    op.add_column("student_profiles", sa.Column("grade_changed_at", sa.DateTime(timezone=True)))

    op.create_table(
        "educator_invites",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "organization_id",
            sa.Integer(),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("token_hash", sa.String(64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("max_uses", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("used_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_by", sa.Uuid(), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True)),
        sa.UniqueConstraint("token_hash", name="uq_educator_invites_token_hash"),
        sa.CheckConstraint("max_uses BETWEEN 1 AND 100", name="ck_educator_invites_max_uses_range"),
        sa.CheckConstraint(
            "used_count BETWEEN 0 AND max_uses", name="ck_educator_invites_used_count_range"
        ),
    )
    op.create_index("ix_educator_invites_organization_id", "educator_invites", ["organization_id"])

    op.create_table(
        "auth_sessions",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("token_hash", sa.String(64), nullable=False),
        sa.Column("prev_token_hash", sa.String(64)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True)),
        sa.Column("revoke_reason", sa.String(30)),
    )
    op.create_index("ix_auth_sessions_user_id", "auth_sessions", ["user_id"])

    op.create_table(
        "rate_limit_counters",
        sa.Column("key", sa.String(160), nullable=False),
        sa.Column("window_start", sa.DateTime(timezone=True), nullable=False),
        sa.Column("count", sa.Integer(), nullable=False, server_default="0"),
        sa.PrimaryKeyConstraint("key", "window_start", name="pk_rate_limit_counters"),
    )
    op.create_index("ix_rate_limit_counters_window_start", "rate_limit_counters", ["window_start"])

    op.create_table(
        "organization_transfers",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("student_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column(
            "from_organization_id",
            sa.Integer(),
            sa.ForeignKey("organizations.id", ondelete="SET NULL"),
        ),
        sa.Column("cohorts_left", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index(
        "ix_organization_transfers_student_id", "organization_transfers", ["student_id"]
    )


def downgrade() -> None:
    op.drop_table("organization_transfers")
    op.drop_table("rate_limit_counters")
    op.drop_table("auth_sessions")
    op.drop_table("educator_invites")
    op.drop_column("student_profiles", "grade_changed_at")
    op.drop_column("users", "password_changed_at")
