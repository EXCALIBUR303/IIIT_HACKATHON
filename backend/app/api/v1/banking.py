"""Banking Explorer (education only; never collects real account or identity data)."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.api.deps import DB, Student
from app.services import banking_explorer as svc

router = APIRouter(prefix="/banking-explorer", tags=["banking-explorer"])


class AnswerIn(BaseModel):
    selected: str = Field(max_length=5)


@router.get("")
def get_journey(user: Student, db: DB) -> dict[str, Any]:
    return svc.view(db, user)


@router.post("/stops/{stop_key}/answer")
def answer_stop(stop_key: str, body: AnswerIn, user: Student, db: DB) -> dict[str, Any]:
    out = svc.answer(db, user, stop_key, body.selected)
    db.commit()
    return out
