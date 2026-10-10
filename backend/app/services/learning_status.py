"""Learning status: the transparent learning score and the level/unlock checklist."""

from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.learning import levels, score
from app.models import ConceptMastery, Scenario, SimulationSession, User
from app.rewards.rules import disqualifier

from . import reflections
from .progress import assessment_bests


def _mission_evidence(db: Session, student: User) -> tuple[dict, dict, dict, int, int]:
    rows = db.execute(
        select(Scenario.slug, Scenario.kind, SimulationSession.score, SimulationSession.result)
        .join(SimulationSession, SimulationSession.scenario_id == Scenario.id)
        .where(SimulationSession.student_id == student.id, SimulationSession.status == "completed")
        .order_by(SimulationSession.completed_at)
    ).all()
    best_by_scenario: dict[str, tuple[str, int, dict]] = {}
    best_kind: dict[str, int] = {}
    safe_kind: dict[str, bool] = {}
    for slug, kind, sc, result in rows:
        sc = sc or 0
        safe = disqualifier(kind, result or {}) is None
        best_kind[kind] = max(best_kind.get(kind, 0), sc)
        if sc >= levels.PASS and safe:
            safe_kind[kind] = True
        current = best_by_scenario.get(slug)
        if current is None or sc >= current[1]:
            best_by_scenario[slug] = (kind, sc, result or {})
    completed = len(best_by_scenario)
    safe_missions = sum(
        1 for kind, _sc, result in best_by_scenario.values() if disqualifier(kind, result) is None
    )
    return best_kind, safe_kind, best_by_scenario, completed, safe_missions


def status(db: Session, student: User) -> dict[str, Any]:
    best_kind, safe_kind, _best, completed, safe_missions = _mission_evidence(db, student)
    quizzes = {slug: best or 0 for slug, (_n, best) in assessment_bests(db, student).items()}
    div = db.get(ConceptMastery, (student.id, "diversification"))
    applied = {k for k, v in best_kind.items() if k == "money_lab" and v >= levels.PASS}
    level_evidence = levels.LevelEvidence(
        mission_best=best_kind,
        mission_safe=safe_kind,
        quiz_best=quizzes,
        diversification=(div.mastery, div.weighted_total) if div else (0.0, 0.0),
        reflections_correct=reflections.correct_concepts(db, student),
        applied_missions=applied,
    )
    score_evidence = score.Evidence(
        quiz_best=quizzes,
        scenario_best_by_kind={k: v for k, v in best_kind.items() if k in score.PILLAR_KINDS},
        reflections_correct=reflections.correct_count(db, student),
        reflections_total_available=reflections.total_available(),
        completed_missions=completed,
        safe_missions=safe_missions,
    )
    return {"score": score.compute(score_evidence), "level": levels.evaluate(level_evidence)}
