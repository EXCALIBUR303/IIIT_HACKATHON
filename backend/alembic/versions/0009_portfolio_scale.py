"""portfolio scale: persisted round snapshots and indexes for long histories

Additive only. ``portfolio_round_snapshots`` holds one row per student, run and round, so the
value chart reads at most 11 rows instead of replaying the whole transaction log. Existing
runs are filled in lazily the first time they are viewed.

Revision ID: 0009
Revises: 0008
Create Date: 2026-10-11 05:30:00
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0009"
down_revision: str | None = "0008"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "portfolio_round_snapshots",
        sa.Column(
            "student_id",
            sa.Uuid(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("run_number", sa.Integer(), primary_key=True),
        sa.Column("round", sa.Integer(), primary_key=True),
        sa.Column("total_paise", sa.BigInteger(), nullable=False),
        sa.Column("cash_paise", sa.BigInteger(), nullable=False),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint("round BETWEEN 0 AND 10", name="ck_portfolio_snapshot_round"),
    )
    # Keyset pagination of a student's history, newest first.
    op.create_index(
        "ix_portfolio_tx_student_id_desc",
        "portfolio_transactions",
        ["student_id", sa.text("id DESC")],
    )
    # Per-round action counts and per-run transfer totals.
    op.create_index(
        "ix_portfolio_tx_student_run_round",
        "portfolio_transactions",
        ["student_id", "run_number", "round"],
    )


def downgrade() -> None:
    op.drop_index("ix_portfolio_tx_student_run_round", table_name="portfolio_transactions")
    op.drop_index("ix_portfolio_tx_student_id_desc", table_name="portfolio_transactions")
    op.drop_table("portfolio_round_snapshots")
