"""Learning stages: how a student's grade band shapes what they are offered.

Stage is *derived* from grade (never stored), so it cannot drift, and it avoids
collecting a date of birth. Content declares which stages it suits; the
backend filters scenarios and recommendations with it.

Grade 13 means "finished Class 12 / around 18", the Investor Sandbox audience.

Grade is self-declared and never verified, so stages are age-appropriate *personalisation*
that the server enforces consistently, not proof of age. A missing grade is NOT defaulted to
an older stage: stage-gated routes answer 403 ``stage_required`` until the student chooses one.
"""

from __future__ import annotations

from dataclasses import dataclass

EXPLORER = "explorer"
BUILDER = "builder"
FUTURE_PLANNER = "future_planner"
INVESTOR_SANDBOX = "investor_sandbox"

ORDER = (EXPLORER, BUILDER, FUTURE_PLANNER, INVESTOR_SANDBOX)
DEFAULT_STAGE = FUTURE_PLANNER


@dataclass(frozen=True)
class StageInfo:
    key: str
    label: str
    grades: str
    tagline: str
    # Pillars that open at this stage. Everything earlier stays available.
    pillars: tuple[str, ...]
    portfolio_quest: bool


STAGES: dict[str, StageInfo] = {
    EXPLORER: StageInfo(
        EXPLORER,
        "Explorer",
        "Classes 7–8",
        "Short story missions about pocket money, needs and wants, and staying safe.",
        ("budgeting", "safety"),
        False,
    ),
    BUILDER: StageInfo(
        BUILDER,
        "Builder",
        "Classes 9–10",
        "Sharper choices: goals, saving, digital payments and scams.",
        ("budgeting", "saving", "safety"),
        False,
    ),
    FUTURE_PLANNER: StageInfo(
        FUTURE_PLANNER,
        "Future Planner",
        "Classes 11–12",
        "Trade-offs, compounding, inflation, risk and diversification.",
        ("budgeting", "saving", "investing", "safety"),
        True,
    ),
    INVESTOR_SANDBOX: StageInfo(
        INVESTOR_SANDBOX,
        "Investor Sandbox",
        "Age 18",
        "A calm, fictional planning sandbox with strong safety guardrails.",
        ("budgeting", "saving", "investing", "safety"),
        True,
    ),
}


def stage_for(grade: int | None) -> str:
    """Map a grade (7-13) to a stage key.

    ``None`` falls back to the youngest stage so any caller that forgets to require a grade
    fails safe (less content, no Portfolio Quest) instead of exposing older-stage material.
    """
    if grade is None:
        return EXPLORER
    if grade <= 8:
        return EXPLORER
    if grade <= 10:
        return BUILDER
    if grade <= 12:
        return FUTURE_PLANNER
    return INVESTOR_SANDBOX


def is_eligible(stage: str, content_stages: list[str] | None) -> bool:
    """Whether content tagged with ``content_stages`` is offered at ``stage``."""
    return not content_stages or stage in content_stages


def info(stage: str) -> StageInfo:
    return STAGES[stage]
