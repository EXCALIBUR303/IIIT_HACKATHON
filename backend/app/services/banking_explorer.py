"""Banking Explorer: a guided, sourced, India-specific journey (education only).

It stores only per-stop attempt counts and completion. It never collects
account numbers, identity details, OTPs, PINs, card data or document images;
answers are multiple choice.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.content import loader
from app.core.errors import ApiError
from app.learning import mastery
from app.models import ExplorerProgress, User
from app.rewards import rules as reward_rules

from . import rewards

EVIDENCE_WEIGHT = 0.5


def _stops() -> dict[str, dict[str, Any]]:
    return {s["key"]: s for s in loader.banking_explorer()["stops"]}


def _progress(db: Session, student: User) -> dict[str, ExplorerProgress]:
    rows = db.scalars(select(ExplorerProgress).where(ExplorerProgress.student_id == student.id))
    return {r.stop_key: r for r in rows}


def view(db: Session, student: User) -> dict[str, Any]:
    doc = loader.banking_explorer()
    progress = _progress(db, student)
    sources = doc["sources"]
    stops = []
    for s in doc["stops"]:
        p = progress.get(s["key"])
        stops.append(
            {
                "key": s["key"],
                "title": s["title"],
                "story": s["story"],
                "facts": s["facts"],
                "question": s["question"],
                "options": [{"key": o["key"], "text": o["text"]} for o in s["options"]],
                "sources": [{"id": sid, **sources[sid]} for sid in s["sources"]],
                "attempts": p.attempts if p else 0,
                "completed": bool(p and p.correct),
            }
        )
    done = sum(1 for s in stops if s["completed"])
    return {
        "title": doc["title"],
        "intro": doc["intro"],
        "last_verified": doc["last_verified"],
        "disclaimer": doc["disclaimer"],
        "stops": stops,
        "completed": done,
        "total": len(stops),
    }


def answer(db: Session, student: User, stop_key: str, selected: str) -> dict[str, Any]:
    stop = _stops().get(stop_key)
    if stop is None:
        raise ApiError(404, "not_found", "Stop not found")
    option = next((o for o in stop["options"] if o["key"] == selected), None)
    if option is None:
        raise ApiError(422, "invalid_option", "Choose one of the listed options.", "selected")
    row = db.get(ExplorerProgress, (student.id, stop_key))
    if row is None:
        row = ExplorerProgress(student_id=student.id, stop_key=stop_key, attempts=0, correct=False)
        db.add(row)
    row.attempts += 1
    first_time_correct = bool(option["correct"]) and not row.correct
    if option["correct"]:
        row.correct = True
    db.flush()
    mastery.record(
        db,
        student.id,
        [mastery.Evidence(stop["concept"], bool(option["correct"]), EVIDENCE_WEIGHT)],
    )
    issued: list[dict[str, Any]] = []
    if first_time_correct:
        issued += rewards.issue(
            db,
            student,
            [reward_rules.explorer_stop_award(stop_key, stop["concept"])],
            source_type="explorer",
            source_ref=stop_key,
        )
    progress = _progress(db, student)
    all_done = all(progress.get(k) and progress[k].correct for k in _stops())
    if all_done:
        issued += rewards.issue(
            db,
            student,
            [reward_rules.explorer_complete_award()],
            source_type="explorer",
            source_ref="complete",
        )
    correct_opt = next(o for o in stop["options"] if o["correct"])
    return {
        "correct": bool(option["correct"]),
        "explanation": option["explanation"],
        "correct_option": {"key": correct_opt["key"], "text": correct_opt["text"]},
        "journey_complete": all_done,
        "rewards": issued,
    }
