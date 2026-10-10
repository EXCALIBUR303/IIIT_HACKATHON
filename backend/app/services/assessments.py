"""Assessment availability, attempts and submission."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.db import advisory_lock
from app.core.errors import ApiError, conflict
from app.learning import adaptive, mastery
from app.learning.scoring import score_attempt
from app.models import (
    Assessment,
    AssessmentAttempt,
    QuestionResponse,
    Scenario,
    SimulationSession,
    User,
)
from app.rewards import rules as reward_rules

from . import achievements, rewards
from .progress import assessment_bests

ONE_SHOT = ("initial", "post")


def availability(db: Session, student: User, assessment: Assessment) -> tuple[bool, str | None]:
    bests = assessment_bests(db, student)
    if assessment.kind in ONE_SHOT and assessment.slug in bests:
        return (
            False,
            "Already completed. This check is taken once so before/after comparisons stay fair.",
        )
    if assessment.kind == "post":
        if "initial" not in bests:
            return False, "Complete the starting point check first."
        kinds = set(
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
        missing = {"budget", "savings", "investing", "safety"} - kinds
        if missing:
            return False, "Complete at least one simulation in every pillar first."
    return True, None


def summary(db: Session, student: User, assessment: Assessment) -> dict[str, Any]:
    count, best = assessment_bests(db, student).get(assessment.slug, (0, None))
    available, reason = availability(db, student, assessment)
    return {
        "slug": assessment.slug,
        "kind": assessment.kind,
        "title": assessment.title,
        "description": assessment.description,
        "module_slug": assessment.module.slug if assessment.module else None,
        "question_count": len(assessment.questions),
        "attempts": count,
        "best_score": best,
        "available": available,
        "locked_reason": reason,
    }


def public_questions(assessment: Assessment) -> list[dict[str, Any]]:
    return [
        {
            "slug": q.slug,
            "concept": q.concept,
            "difficulty": q.difficulty,
            "prompt": q.prompt,
            "options": [{"key": o["key"], "text": o["text"]} for o in q.options],
        }
        for q in assessment.questions
    ]


def _open_attempt(db: Session, student: User, assessment: Assessment) -> AssessmentAttempt | None:
    return db.scalar(
        select(AssessmentAttempt)
        .where(
            AssessmentAttempt.student_id == student.id,
            AssessmentAttempt.assessment_id == assessment.id,
            AssessmentAttempt.submitted_at.is_(None),
        )
        .order_by(AssessmentAttempt.attempt_number.desc())
    )


def start(db: Session, student: User, assessment: Assessment) -> AssessmentAttempt:
    """Start (or resume) an attempt. Safe under concurrent requests, e.g. a double click."""
    available, reason = availability(db, student, assessment)
    if not available:
        raise conflict("assessment_locked", reason or "Not available")
    # Concurrent starts queue here; the second request then resumes the first one's attempt.
    advisory_lock(db, "attempt", student.id, assessment.id)
    for _ in range(3):
        open_attempt = _open_attempt(db, student, assessment)
        if open_attempt:
            open_attempt.started_at = datetime.now(UTC)
            return open_attempt
        number = (
            db.scalar(
                select(func.max(AssessmentAttempt.attempt_number)).where(
                    AssessmentAttempt.student_id == student.id,
                    AssessmentAttempt.assessment_id == assessment.id,
                )
            )
            or 0
        ) + 1
        attempt = AssessmentAttempt(
            student_id=student.id, assessment_id=assessment.id, attempt_number=number
        )
        try:
            with db.begin_nested():
                db.add(attempt)
                db.flush()
            return attempt
        except IntegrityError:
            continue  # a concurrent request created it first; resume that one
    raise conflict("busy", "Please try again in a moment")


def submit(
    db: Session, student: User, attempt: AssessmentAttempt, responses: list[dict[str, Any]]
) -> dict[str, Any]:
    if attempt.student_id != student.id:
        raise ApiError(404, "not_found", "Attempt not found")
    if attempt.submitted_at is not None:
        raise conflict("already_submitted", "This attempt has already been submitted")
    assessment = attempt.assessment
    questions = {q.slug: q for q in assessment.questions}
    # Retakes of module quizzes count for less, so guessing until correct can't inflate mastery.
    base_weight = 1.0 if assessment.kind in ONE_SHOT else 1.0 / attempt.attempt_number
    scored = score_attempt(
        [{"slug": q.slug, "concept": q.concept, "options": q.options} for q in questions.values()],
        responses,
        base_weight=base_weight,
    )
    for s, raw in zip(scored["scored"], responses, strict=True):
        db.add(
            QuestionResponse(
                attempt_id=attempt.id,
                question_id=questions[s.question_slug].id,
                selected_option=s.selected,
                is_correct=s.is_correct,
                confidence=raw.get("confidence"),
                response_ms=raw.get("response_ms"),
                misconception=s.misconception,
            )
        )
    attempt.submitted_at = datetime.now(UTC)
    attempt.correct_count = scored["correct_count"]
    attempt.total = scored["total"]
    attempt.score_pct = scored["score_pct"]
    attempt.flagged_guessing = scored["flagged_guessing"]
    mastery.record(db, student.id, scored["evidence"])

    badges = []
    if assessment.slug == "initial":
        badges.append("starting_line")
    if assessment.slug == "post":
        badges.append("full_circle")
    new_badges = achievements.award(db, student, badges)
    issued = rewards.issue(
        db,
        student,
        reward_rules.assessment_awards(
            assessment.slug, assessment.kind, scored["score_pct"], scored["flagged_guessing"]
        ),
        source_type="assessment",
        source_ref=str(attempt.id),
    )

    return {
        "attempt_id": attempt.id,
        "assessment_slug": assessment.slug,
        "attempt_number": attempt.attempt_number,
        "score_pct": scored["score_pct"],
        "correct_count": scored["correct_count"],
        "total": scored["total"],
        "flagged_guessing": scored["flagged_guessing"],
        "concepts": scored["concepts"],
        "misconceptions": [
            {"key": m, "label": adaptive.MISCONCEPTIONS.get(m, m.replace("_", " "))}
            for m in scored["misconceptions"]
        ],
        "questions": [
            {
                "question_slug": s.question_slug,
                "prompt": questions[s.question_slug].prompt,
                "concept": s.concept,
                "selected": s.selected,
                "correct_key": s.correct_key,
                "is_correct": s.is_correct,
                "explanation": s.explanation,
                "correct_explanation": s.correct_explanation,
                "misconception": s.misconception,
                "misconception_label": adaptive.MISCONCEPTIONS.get(s.misconception)
                if s.misconception
                else None,
                "rapid": s.rapid,
            }
            for s in scored["scored"]
        ],
        "new_achievements": new_badges,
        "rewards": issued,
        "submitted_at": attempt.submitted_at,
    }


def result_of(db: Session, attempt: AssessmentAttempt) -> dict[str, Any]:
    """Rebuild a submitted attempt's result for review."""
    if attempt.submitted_at is None:
        raise conflict("not_submitted", "This attempt has not been submitted yet")
    responses = [
        {
            "question_slug": r.question.slug,
            "option_key": r.selected_option,
            "confidence": r.confidence,
            "response_ms": r.response_ms,
        }
        for r in attempt.responses
    ]
    questions = attempt.assessment.questions
    scored = score_attempt(
        [{"slug": q.slug, "concept": q.concept, "options": q.options} for q in questions],
        responses,
        base_weight=1.0,
    )
    by_slug = {q.slug: q for q in questions}
    return {
        "attempt_id": attempt.id,
        "assessment_slug": attempt.assessment.slug,
        "attempt_number": attempt.attempt_number,
        "score_pct": attempt.score_pct,
        "correct_count": attempt.correct_count,
        "total": attempt.total,
        "flagged_guessing": attempt.flagged_guessing,
        "concepts": scored["concepts"],
        "misconceptions": [
            {"key": m, "label": adaptive.MISCONCEPTIONS.get(m, m)} for m in scored["misconceptions"]
        ],
        "questions": [
            {
                "question_slug": s.question_slug,
                "prompt": by_slug[s.question_slug].prompt,
                "concept": s.concept,
                "selected": s.selected,
                "correct_key": s.correct_key,
                "is_correct": s.is_correct,
                "explanation": s.explanation,
                "correct_explanation": s.correct_explanation,
                "misconception": s.misconception,
                "misconception_label": adaptive.MISCONCEPTIONS.get(s.misconception)
                if s.misconception
                else None,
                "rapid": s.rapid,
            }
            for s in scored["scored"]
        ],
        "new_achievements": [],
        "rewards": rewards.for_source(db, attempt.student_id, str(attempt.id)),
        "submitted_at": attempt.submitted_at,
    }
