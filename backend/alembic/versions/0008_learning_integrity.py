"""learning integrity: server-side quiz delivery state, timing, variant groups

Additive and nullable, so existing attempts and questions keep working.

Revision ID: 0008
Revises: 0007
Create Date: 2026-10-11 04:10:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0008"
down_revision: str | None = "0007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("questions", sa.Column("variant_group", sa.String(40)))
    op.add_column(
        "assessment_attempts",
        sa.Column("delivery", sa.JSON().with_variant(postgresql.JSONB(), "postgresql")),
    )
    op.add_column("assessment_attempts", sa.Column("elapsed_ms", sa.Integer()))
    op.add_column("assessment_attempts", sa.Column("timing_trusted", sa.Boolean()))


def downgrade() -> None:
    op.drop_column("assessment_attempts", "timing_trusted")
    op.drop_column("assessment_attempts", "elapsed_ms")
    op.drop_column("assessment_attempts", "delivery")
    op.drop_column("questions", "variant_group")
