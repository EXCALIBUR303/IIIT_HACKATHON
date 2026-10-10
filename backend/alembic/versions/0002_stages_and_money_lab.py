"""stages: widen grade to 7-13, add scenarios.stages, allow money_lab kind

Additive and reversible. Existing rows remain valid: every current scenario
defaults to the Future Planner stage (the original Class 11-12 pilot).

Revision ID: 0002
Revises: 0001
Create Date: 2026-10-10 22:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "scenarios",
        sa.Column(
            "stages",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("""'["future_planner", "investor_sandbox"]'::jsonb"""),
        ),
    )
    op.drop_constraint(op.f("ck_student_profiles_grade"), "student_profiles", type_="check")
    op.create_check_constraint(
        op.f("ck_student_profiles_grade"),
        "student_profiles",
        "grade IS NULL OR grade BETWEEN 7 AND 13",
    )
    op.drop_constraint(op.f("ck_scenarios_kind"), "scenarios", type_="check")
    op.create_check_constraint(
        op.f("ck_scenarios_kind"),
        "scenarios",
        "kind IN ('budget', 'savings', 'investing', 'safety', 'money_lab')",
    )


def downgrade() -> None:
    # Rows outside the old ranges cannot satisfy the narrower constraints, so a
    # downgrade refuses (via the constraint) rather than silently deleting data.
    op.drop_constraint(op.f("ck_scenarios_kind"), "scenarios", type_="check")
    op.create_check_constraint(
        op.f("ck_scenarios_kind"),
        "scenarios",
        "kind IN ('budget', 'savings', 'investing', 'safety')",
    )
    op.drop_constraint(op.f("ck_student_profiles_grade"), "student_profiles", type_="check")
    op.create_check_constraint(
        op.f("ck_student_profiles_grade"),
        "student_profiles",
        "grade IS NULL OR grade IN (11, 12, 13)",
    )
    op.drop_column("scenarios", "stages")
