from __future__ import annotations

from fastapi import APIRouter

from app import tutor
from app.api.deps import DB, Student
from app.core.errors import not_found
from app.models import SimulationSession
from app.schemas import TutorAnswer, TutorAsk

router = APIRouter(prefix="/tutor", tags=["tutor"])


@router.post("/ask", response_model=TutorAnswer)
def ask(body: TutorAsk, user: Student, db: DB) -> dict:
    session_result = None
    if body.session_id:
        session = db.get(SimulationSession, body.session_id)
        if session is None or session.student_id != user.id:
            raise not_found("Simulation session")
        session_result = session.result
    return tutor.answer(body.question, body.concept, session_result)
