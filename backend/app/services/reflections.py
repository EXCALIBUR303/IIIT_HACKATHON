"""Reflections: after a mission, the student explains *why* with a multiple-choice question.

No free text is collected. Each question is answered once per student, so it
cannot be farmed; a correct explanation earns a small one-time reward and adds
modest evidence to concept mastery.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.content import loader
from app.core.errors import ApiError, conflict, not_found
from app.learning import adaptive, mastery
from app.models import Reflection, SimulationSession, User
from app.rewards import rules as reward_rules

from . import rewards

REFLECTION_WEIGHT = 0.5


def _bank() -> dict[str, dict[str, Any]]:
    return {q["key"]: q for q in loader.reflections()}


def total_available() -> int:
    return len(loader.reflections())


def _owned_completed(db: Session, student: User, session_id: Any) -> SimulationSession:
    s = db.get(SimulationSession, session_id)
    if s is None or s.student_id != student.id:
        raise not_found("Simulation session")
    if s.status != "completed":
        raise conflict("not_completed", "Finish the mission before reflecting on it.")
    return s


def _answered_keys(db: Session, student: User) -> set[str]:
    return set(
        db.scalars(select(Reflection.question_key).where(Reflection.student_id == student.id))
    )


def prompt(db: Session, student: User, session_id: Any) -> dict[str, Any]:
    session = _owned_completed(db, student, session_id)
    kind = session.scenario.kind
    answered = _answered_keys(db, student)
    for q in loader.reflections():
        if q["kind"] == kind and q["key"] not in answered:
            return {
                "available": True,
                "question_key": q["key"],
                "prompt": q["prompt"],
                "options": [{"key": o["key"], "text": o["text"]} for o in q["options"]],
            }
    return {"available": False, "question_key": None, "prompt": None, "options": []}


def answer(
    db: Session,
    student: User,
    *,
    session_id: Any,
    question_key: str,
    selected: str,
    confidence: str | None,
) -> dict[str, Any]:
    session = _owned_completed(db, student, session_id)
    q = _bank().get(question_key)
    if q is None or q["kind"] != session.scenario.kind:
        raise ApiError(422, "invalid_question", "That question does not belong to this mission.")
    option = next((o for o in q["options"] if o["key"] == selected), None)
    if option is None:
        raise ApiError(422, "invalid_option", "Choose one of the listed options.", "selected")
    try:
        with db.begin_nested():
            db.add(
                Reflection(
                    student_id=student.id,
                    session_id=session.id,
                    question_key=question_key,
                    selected_option=selected,
                    is_correct=bool(option["correct"]),
                    concept=q["concept"],
                    confidence=confidence,
                    misconception=option.get("misconception"),
                )
            )
            db.flush()
    except IntegrityError:
        raise conflict("already_answered", "You have already answered this reflection.") from None
    mastery.record(
        db,
        student.id,
        [
            mastery.Evidence(
                q["concept"],
                bool(option["correct"]),
                REFLECTION_WEIGHT,
                option.get("misconception"),
            )
        ],
    )
    issued = []
    if option["correct"]:
        issued = rewards.issue(
            db,
            student,
            [reward_rules.reflection_award(question_key, q["concept"])],
            source_type="reflection",
            source_ref=str(session.id),
        )
    correct = next(o for o in q["options"] if o["correct"])
    return {
        "correct": bool(option["correct"]),
        "explanation": option["explanation"],
        "correct_option": {"key": correct["key"], "text": correct["text"]},
        "misconception": (
            adaptive.MISCONCEPTIONS.get(option["misconception"], option["misconception"])
            if option.get("misconception")
            else None
        ),
        "rewards": issued,
    }


def correct_concepts(db: Session, student: User) -> set[str]:
    return set(
        db.scalars(
            select(Reflection.concept).where(
                Reflection.student_id == student.id, Reflection.is_correct.is_(True)
            )
        )
    )


def correct_count(db: Session, student: User) -> int:
    return int(
        db.scalar(
            select(func.count())
            .select_from(Reflection)
            .where(Reflection.student_id == student.id, Reflection.is_correct.is_(True))
        )
        or 0
    )
