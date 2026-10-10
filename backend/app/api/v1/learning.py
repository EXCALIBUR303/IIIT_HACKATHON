"""Learning score, level unlocks and post-mission reflections."""

from __future__ import annotations

import uuid
from typing import Any, Literal

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.api.deps import DB, Student
from app.services import learning_status, reflections

router = APIRouter(tags=["learning"])


class ReflectionIn(BaseModel):
    session_id: uuid.UUID
    question_key: str = Field(max_length=60)
    selected: str = Field(max_length=5)
    confidence: Literal["low", "medium", "high"] | None = None


@router.get("/learning/status")
def get_status(user: Student, db: DB) -> dict[str, Any]:
    """Transparent 0-100 learning score and level unlocks (never uses money or rewards)."""
    return learning_status.status(db, user)


@router.get("/reflections/prompt")
def reflection_prompt(session_id: uuid.UUID, user: Student, db: DB) -> dict[str, Any]:
    return reflections.prompt(db, user, session_id)


@router.post("/reflections")
def answer_reflection(body: ReflectionIn, user: Student, db: DB) -> dict[str, Any]:
    out = reflections.answer(
        db,
        user,
        session_id=body.session_id,
        question_key=body.question_key,
        selected=body.selected,
        confidence=body.confidence,
    )
    db.commit()
    return out
