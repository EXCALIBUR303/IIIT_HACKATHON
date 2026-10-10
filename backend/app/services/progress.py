"""Builds progress views and the adaptive snapshot from the database."""

from __future__ import annotations

from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.content import loader
from app.learning import adaptive
from app.learning.mastery import level
from app.models import (
    Assessment,
    AssessmentAttempt,
    ConceptMastery,
    LearningModule,
    Scenario,
    SimulationSession,
    User,
)


def completed_scenarios(db: Session, student: User) -> dict[str, int]:
    """slug -> best score across completed attempts."""
    rows = db.execute(
        select(Scenario.slug, func.max(SimulationSession.score))
        .join(SimulationSession, SimulationSession.scenario_id == Scenario.id)
        .where(SimulationSession.student_id == student.id, SimulationSession.status == "completed")
        .group_by(Scenario.slug)
    )
    return {slug: best for slug, best in rows}


def assessment_bests(db: Session, student: User) -> dict[str, tuple[int, int | None]]:
    """assessment slug -> (submitted attempts, best score)."""
    rows = db.execute(
        select(
            Assessment.slug, func.count(AssessmentAttempt.id), func.max(AssessmentAttempt.score_pct)
        )
        .join(AssessmentAttempt, AssessmentAttempt.assessment_id == Assessment.id)
        .where(
            AssessmentAttempt.student_id == student.id,
            AssessmentAttempt.submitted_at.is_not(None),
        )
        .group_by(Assessment.slug)
    )
    return {slug: (count, best) for slug, count, best in rows}


def snapshot(db: Session, student: User) -> adaptive.Snapshot:
    profile = student.profile
    done = completed_scenarios(db, student)
    bests = assessment_bests(db, student)
    modules_db = list(db.scalars(select(LearningModule).order_by(LearningModule.order)))
    quizzes = {
        a.module_id: a.slug
        for a in db.scalars(select(Assessment).where(Assessment.kind == "module"))
    }
    scenarios_db = list(db.scalars(select(Scenario)))
    module_slug_by_id = {m.id: m.slug for m in modules_db}
    modules = []
    for m in modules_db:
        quiz = quizzes.get(m.id)
        modules.append(
            adaptive.ModuleProgress(
                slug=m.slug,
                pillar=m.pillar,
                title=m.title,
                order=m.order,
                concepts=list(m.concepts),
                completed_scenarios={
                    s.slug for s in scenarios_db if s.module_id == m.id and s.slug in done
                },
                quiz_slug=quiz,
                quiz_best=bests.get(quiz, (0, None))[1] if quiz else None,
            )
        )
    mastery_rows = db.scalars(select(ConceptMastery).where(ConceptMastery.student_id == student.id))
    return adaptive.Snapshot(
        onboarding_completed=bool(profile and profile.onboarding_completed),
        persona_key=profile.persona_key if profile else None,
        learning_level=profile.learning_level if profile else "beginner",
        initial_done="initial" in bests,
        post_done="post" in bests,
        modules=modules,
        scenarios=[
            adaptive.ScenarioInfo(
                slug=s.slug,
                module=module_slug_by_id[s.module_id],
                title=s.title,
                difficulty=s.difficulty,
                persona=s.persona_key,
                best_score=done.get(s.slug),
            )
            for s in scenarios_db
        ],
        mastery={
            r.concept: (r.mastery, r.evidence_count, r.last_misconception) for r in mastery_rows
        },
    )


def pre_post(db: Session, student: User) -> dict[str, Any] | None:
    """Compare the starting check with the final check (only when both exist)."""
    attempts = {}
    for slug in ("initial", "post"):
        attempt = db.scalar(
            select(AssessmentAttempt)
            .join(Assessment)
            .where(
                Assessment.slug == slug,
                AssessmentAttempt.student_id == student.id,
                AssessmentAttempt.submitted_at.is_not(None),
            )
            .order_by(AssessmentAttempt.submitted_at)
        )
        attempts[slug] = attempt
    initial, post = attempts["initial"], attempts["post"]
    if initial is None:
        return None

    def by_concept(attempt: AssessmentAttempt) -> dict[str, float]:
        totals: dict[str, list[int]] = {}
        for r in attempt.responses:
            t = totals.setdefault(r.question.concept, [0, 0])
            t[0] += int(r.is_correct)
            t[1] += 1
        return {c: round(v[0] / v[1], 2) for c, v in totals.items()}

    out: dict[str, Any] = {
        "initial_score": initial.score_pct,
        "post_score": post.score_pct if post else None,
        "change": (post.score_pct - initial.score_pct) if post else None,
        "initial_flagged_guessing": initial.flagged_guessing,
        "post_flagged_guessing": post.flagged_guessing if post else False,
        "concepts": [],
        "note": "Each check has 12 questions, so treat changes as an indication rather than "
        "proof of learning. Rapid-guess attempts are flagged.",
    }
    pre_c = by_concept(initial)
    post_c = by_concept(post) if post else {}
    for concept, value in pre_c.items():
        out["concepts"].append({"concept": concept, "initial": value, "post": post_c.get(concept)})
    return out


def progress(db: Session, student: User) -> dict[str, Any]:
    snap = snapshot(db, student)
    concept_titles = loader.concept_map()
    rows = {
        r.concept: r
        for r in db.scalars(select(ConceptMastery).where(ConceptMastery.student_id == student.id))
    }
    concepts = []
    for key, meta in concept_titles.items():
        row = rows.get(key)
        concepts.append(
            {
                "concept": key,
                "title": meta["title"],
                "pillar": meta["pillar"],
                "mastery": round(row.mastery, 3) if row and row.evidence_count else None,
                "level": level(row),
                "evidence_count": row.evidence_count if row else 0,
            }
        )
    strengths = [c["title"] for c in concepts if c["level"] == "mastered"]
    practice = [c["title"] for c in concepts if c["level"] == "needs_practice"]

    recent_sessions = db.execute(
        select(SimulationSession, Scenario)
        .join(Scenario)
        .where(SimulationSession.student_id == student.id, SimulationSession.status == "completed")
        .order_by(SimulationSession.completed_at.desc())
        .limit(5)
    )
    recent = [
        {
            "type": "simulation",
            "slug": sc.slug,
            "title": sc.title,
            "score": s.score,
            "at": s.completed_at.isoformat() if s.completed_at else None,
        }
        for s, sc in recent_sessions
    ]
    recent_attempts = db.execute(
        select(AssessmentAttempt, Assessment)
        .join(Assessment)
        .where(
            AssessmentAttempt.student_id == student.id,
            AssessmentAttempt.submitted_at.is_not(None),
        )
        .order_by(AssessmentAttempt.submitted_at.desc())
        .limit(5)
    )
    recent += [
        {
            "type": "assessment",
            "slug": a.slug,
            "title": a.title,
            "score": att.score_pct,
            "at": att.submitted_at.isoformat() if att.submitted_at else None,
        }
        for att, a in recent_attempts
    ]
    recent.sort(key=lambda r: r["at"] or "", reverse=True)

    sim_count = db.scalar(
        select(func.count(SimulationSession.id)).where(
            SimulationSession.student_id == student.id, SimulationSession.status == "completed"
        )
    )
    quiz_count = db.scalar(
        select(func.count(AssessmentAttempt.id)).where(
            AssessmentAttempt.student_id == student.id,
            AssessmentAttempt.submitted_at.is_not(None),
        )
    )
    return {
        "modules": [
            {
                "slug": m.slug,
                "title": m.title,
                "pillar": m.pillar,
                "percent": m.percent,
                "simulation_done": m.simulation_done,
                "quiz_best": m.quiz_best,
                "completed": m.completed,
            }
            for m in snap.modules
        ],
        "concepts": concepts,
        "strengths": strengths,
        "practice_areas": practice,
        "pre_post": pre_post(db, student),
        "activity": {
            "simulations_completed": sim_count or 0,
            "assessments_completed": quiz_count or 0,
            "modules_completed": sum(1 for m in snap.modules if m.completed),
        },
        "recent": recent[:6],
        "recommendation": adaptive.recommend(snap),
    }
