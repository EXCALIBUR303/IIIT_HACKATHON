"""market cache: provider results shared across API instances

Additive only. Holds delayed reference closes and news so a serverless instance that lives for a
single request can still serve live data, and so free-tier API quotas are spent once, not once
per cold start.

Revision ID: 0011
Revises: 0010
Create Date: 2026-10-11 10:30:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0011"
down_revision: str | None = "0010"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "market_cache",
        sa.Column("key", sa.String(length=60), nullable=False),
        sa.Column(
            "payload",
            sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), "postgresql"),
            nullable=False,
        ),
        sa.Column("fetched_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("key", name=op.f("pk_market_cache")),
    )


def downgrade() -> None:
    op.drop_table("market_cache")
