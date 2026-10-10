"""Assessment availability, attempts and submission."""

from __future__ import annotations

import random
import secrets
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.db import advisory_lock
from app.core.errors import ApiError, conflict
from app.learning import adaptive, mastery
from app.learning.adaptive import QUIZ_PASS
from app.learning.scoring import score_attempt
from app.models import (
    Assessment,
    AssessmentAttempt,
    Question,
    QuestionResponse,
    Scenario,
    SimulationSession,
    User,
)
from app.rewards import rules as reward_rules

from . import achievements, rewards
from .progress import assessment_bests

ONE_SHOT = ("initial", "post")


def _practice_done(db: Session, student: User, assessment: Assessment) -> bool:
    """True when the student has finished at least one scenario of this quiz's module."""
    return bool(
        db.scalar(
            select(func.count())
            .select_from(SimulationSession)
            .join(Scenario, Scenario.id == SimulationSession.scenario_id)
            .where(
                SimulationSession.student_id == student.id,
                SimulationSession.status == "completed",
                Scenario.module_id == assessment.module_id,
            )
        )
    )


def cooldown_left(db: Session, student: User, assessment: Assessment) -> int:
    """Seconds before another *new* attempt of a module quiz may start (0 = go ahead).

    Only repeated failures trigger it, it grows gently, and it never blocks resuming an open
    attempt, so a slow reader or a dropped connection is never locked out of a quiz in progress.
    """
    settings = get_settings()
    if assessment.kind != "module" or settings.quiz_cooldown_seconds <= 0:
        return 0
    rows = db.execute(
        select(AssessmentAttempt.score_pct, AssessmentAttempt.submitted_at)
        .where(
            AssessmentAttempt.student_id == student.id,
            AssessmentAttempt.assessment_id == assessment.id,
            AssessmentAttempt.submitted_at.is_not(None),
        )
        .order_by(AssessmentAttempt.attempt_number.desc())
    ).all()
    failures = 0
    for score, _ in rows:  # consecutive failures, newest first
        if score is not None and score >= QUIZ_PASS:
            break
        failures += 1
    if failures < settings.quiz_cooldown_after_failures:
        return 0
    steps = failures - settings.quiz_cooldown_after_failures + 1
    wait = min(settings.quiz_cooldown_seconds * steps, 15 * 60)
    elapsed = (datetime.now(UTC) - rows[0][1]).total_seconds()
    return max(0, int(wait - elapsed))


def availability(
    db: Session, student: User, assessment: Assessment, *, new_attempt: bool = True
) -> tuple[bool, str | None]:
    bests = assessment_bests(db, student)
    if assessment.kind in ONE_SHOT and assessment.slug in bests:
        return (
            False,
            "Already completed. This check is taken once so before/after comparisons stay fair.",
        )
    if assessment.kind == "module" and not _practice_done(db, student, assessment):
        return (
            False,
            "Finish one mission in this module first. The quiz checks what you practised.",
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
    if new_attempt:
        wait = cooldown_left(db, student, assessment)
        if wait:
            return (
                False,
                f"Take a short break and re-read the explanations. You can try again in {wait}s.",
            )
    return True, None


def delivered_count(assessment: Assessment) -> int:
    """Questions per attempt: variants of one idea count once."""
    return len({q.variant_group or q.slug for q in assessment.questions})


def summary(db: Session, student: User, assessment: Assessment) -> dict[str, Any]:
    count, best = assessment_bests(db, student).get(assessment.slug, (0, None))
    available, reason = availability(db, student, assessment)
    return {
        "cooldown_seconds": cooldown_left(db, student, assessment),
        "slug": assessment.slug,
        "kind": assessment.kind,
        "title": assessment.title,
        "description": assessment.description,
        "module_slug": assessment.module.slug if assessment.module else None,
        "question_count": delivered_count(assessment),
        "attempts": count,
        "best_score": best,
        "available": available,
        "locked_reason": reason,
    }


def build_delivery(assessment: Assessment) -> dict[str, Any]:
    """Pick one item per variant group, then shuffle question and option order for this attempt."""
    rng = random.Random(secrets.randbits(64))
    groups: dict[str, list[Question]] = {}
    for q in assessment.questions:
        groups.setdefault(q.variant_group or q.slug, []).append(q)
    chosen = [rng.choice(items) for items in groups.values()]
    rng.shuffle(chosen)
    options: dict[str, list[str]] = {}
    for q in chosen:
        keys = [o["key"] for o in q.options]
        rng.shuffle(keys)
        options[q.slug] = keys
    return {
        "questions": [q.slug for q in chosen],
        "options": options,
        "served_at": datetime.now(UTC).isoformat(),
    }


def delivered_questions(assessment: Assessment, attempt: AssessmentAttempt) -> list[Question]:
    by_slug = {q.slug: q for q in assessment.questions}
    delivery = attempt.delivery or {}
    return [by_slug[s] for s in delivery.get("questions", []) if s in by_slug]


def public_questions(
    assessment: Assessment, attempt: AssessmentAttempt | None = None
) -> list[dict[str, Any]]:
    questions = (
        delivered_questions(assessment, attempt)
        if attempt is not None and attempt.delivery
        else list(assessment.questions)
    )
    order = (attempt.delivery or {}).get("options", {}) if attempt else {}
    out = []
    for q in questions:
        opts = {o["key"]: o for o in q.options}
        keys = order.get(q.slug) or [o["key"] for o in q.options]
        out.append(
            {
                "slug": q.slug,
                "concept": q.concept,
                "difficulty": q.difficulty,
                "prompt": q.prompt,
                "options": [{"key": k, "text": opts[k]["text"]} for k in keys if k in opts],
            }
        )
    return out


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
    available, reason = availability(db, student, assessment, new_attempt=False)
    if not available:
        raise conflict("assessment_locked", reason or "Not available")
    # Concurrent starts queue here; the second request then resumes the first one's attempt.
    advisory_lock(db, "attempt", student.id, assessment.id)
    for _ in range(3):
        open_attempt = _open_attempt(db, student, assessment)
        if open_attempt:
            # Resuming keeps the original start time and the same questions and order, so a
            # reader who lost connection is not penalised and cannot re-roll the questions.
            if not open_attempt.delivery:
                open_attempt.delivery = build_delivery(assessment)
            return open_attempt
        wait = cooldown_left(db, student, assessment)
        if wait:
            raise ApiError(
                429,
                "quiz_cooldown",
                f"Take a short break and re-read the explanations. You can try again in {wait}s.",
                headers={"Retry-After": str(wait)},
            )
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
            student_id=student.id,
            assessment_id=assessment.id,
            attempt_number=number,
            delivery=build_delivery(assessment),
        )
        try:
            with db.begin_nested():
                db.add(attempt)
                db.flush()
            return attempt
        except IntegrityError:
            continue  # a concurrent request created it first; resume that one
    raise conflict("busy", "Please try again in a moment")


# --- timing: the client's clock is a hint, the server's clock is the evidence ---------------

TIMING_SLACK_MS = 2_000  # network and clock jitter we always forgive


def server_timing(
    attempt: AssessmentAttempt, responses: list[dict[str, Any]]
) -> tuple[list[dict[str, Any]], int, bool]:
    """Return (responses with trustworthy ``response_ms``, elapsed_ms, client_timings_trusted).

    Elapsed time is measured on the server from when the questions were served. Claimed
    per-question times are accepted only if they are plausible: none negative or longer than the
    whole attempt, and their sum no more than the elapsed time plus slack. Otherwise they are
    discarded and each answer is credited the average server time per question. This is a weak
    anti-abuse signal, never an educational judgement, and slow readers lose nothing: more
    time only ever looks *less* like guessing.
    """
    now = datetime.now(UTC)
    started = (
        attempt.started_at if attempt.started_at.tzinfo else attempt.started_at.replace(tzinfo=UTC)
    )
    elapsed = max(0, int((now - started).total_seconds() * 1000))
    n = max(1, len(responses))
    claimed = [r.get("response_ms") for r in responses]
    plausible = (
        all(isinstance(c, int) and 0 <= c <= elapsed + TIMING_SLACK_MS for c in claimed)
        and sum(c for c in claimed if isinstance(c, int)) <= elapsed + TIMING_SLACK_MS
    )
    cleaned = []
    for r in responses:
        r = dict(r)
        r["response_ms"] = r["response_ms"] if plausible else elapsed // n
        cleaned.append(r)
    return cleaned, elapsed, plausible


def submit(
    db: Session, student: User, attempt: AssessmentAttempt, responses: list[dict[str, Any]]
) -> dict[str, Any]:
    if attempt.student_id != student.id:
        raise ApiError(404, "not_found", "Attempt not found")
    if attempt.submitted_at is not None:
        raise conflict("already_submitted", "This attempt has already been submitted")
    assessment = attempt.assessment
    delivered = delivered_questions(assessment, attempt) or list(assessment.questions)
    questions = {q.slug: q for q in delivered}
    responses, elapsed_ms, timing_trusted = server_timing(attempt, responses)
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
    attempt.elapsed_ms = elapsed_ms
    attempt.timing_trusted = timing_trusted
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
    # Only what this attempt served: variants of one idea mean not every question was shown.
    questions = delivered_questions(attempt.assessment, attempt) or attempt.assessment.questions
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
