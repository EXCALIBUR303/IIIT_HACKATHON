"""Achievements: motivation layer, deliberately separate from mastery.

Badges reward effort and good habits (finishing, retrying, staying calm). They
never change concept mastery scores, which come only from assessed evidence.
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Achievement, Scenario, SimulationSession, StudentAchievement, User


def award(db: Session, student: User, slugs: list[str]) -> list[str]:
    """Idempotently award achievements; returns the slugs that are new."""
    if not slugs:
        return []
    catalog = {
        a.slug: a for a in db.scalars(select(Achievement).where(Achievement.slug.in_(slugs)))
    }
    have = set(
        db.scalars(
            select(Achievement.slug)
            .join(StudentAchievement, StudentAchievement.achievement_id == Achievement.id)
            .where(StudentAchievement.student_id == student.id)
        )
    )
    new = []
    for slug in dict.fromkeys(slugs):
        if slug in catalog and slug not in have:
            db.add(StudentAchievement(student_id=student.id, achievement_id=catalog[slug].id))
            new.append(slug)
    db.flush()
    return new


def after_simulation(
    db: Session, student: User, session: SimulationSession, previous_best: int | None
) -> list[str]:
    db.flush()  # make this session's completion visible to the queries below
    result = session.result or {}
    kind = session.scenario.kind
    earned: list[str] = []
    if kind == "budget":
        earned.append("budget_builder")
        outcome = result.get("outcome", {})
        if result.get("event", {}).get("essential") and outcome.get("borrowed", 0) == 0:
            earned.append("emergency_ready")
    elif kind == "savings":
        if result.get("goal_reached"):
            earned.append("goal_getter")
        if result.get("borrowed", 0) == 0 and result.get("paid_from_emergency", 0) > 0:
            earned.append("emergency_ready")
    elif kind == "investing":
        if result.get("action") in ("hold", "rebalance"):
            earned.append("steady_hand")
        if result.get("diversification", 0) >= 0.5:
            earned.append("basket_spreader")
    elif kind == "safety":
        if result.get("total") and result.get("correct_verdicts") == result.get("total"):
            earned.append("scam_spotter")
    if previous_best is not None and session.score is not None and session.score > previous_best:
        earned.append("comeback")
    kinds_done = set(
        db.scalars(
            select(Scenario.kind)
            .join(SimulationSession, SimulationSession.scenario_id == Scenario.id)
            .where(
                SimulationSession.student_id == student.id,
                SimulationSession.status == "completed",
            )
            .distinct()
        )
    )
    if kinds_done >= {"budget", "savings", "investing", "safety"}:
        earned.append("pillar_explorer")
    return award(db, student, earned)
