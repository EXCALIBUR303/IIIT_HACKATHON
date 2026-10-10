from __future__ import annotations

import uuid

from fastapi import APIRouter
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.api.deps import DB, Student
from app.core.errors import not_found
from app.models import Assessment, AssessmentAttempt
from app.schemas import AssessmentSummary, AttemptResultOut, AttemptStartOut, SubmitIn
from app.services import assessments as svc

router = APIRouter(prefix="/assessments", tags=["assessments"])


def _get(db, slug: str) -> Assessment:
    a = db.scalar(
        select(Assessment)
        .options(selectinload(Assessment.questions))
        .where(Assessment.slug == slug)
    )
    if a is None:
        raise not_found("Assessment")
    return a


@router.get("", response_model=list[AssessmentSummary])
def list_assessments(user: Student, db: DB) -> list[dict]:
    order = {"initial": 0, "module": 1, "post": 2}
    items = list(db.scalars(select(Assessment).options(selectinload(Assessment.questions))))
    items.sort(key=lambda a: (order[a.kind], a.module.order if a.module else 0))
    return [svc.summary(db, user, a) for a in items]


@router.get("/{slug}", response_model=AssessmentSummary)
def get_assessment(slug: str, user: Student, db: DB) -> dict:
    return svc.summary(db, user, _get(db, slug))


@router.post("/{slug}/attempts", response_model=AttemptStartOut, status_code=201)
def start_attempt(slug: str, user: Student, db: DB) -> dict:
    assessment = _get(db, slug)
    attempt = svc.start(db, user, assessment)
    db.commit()
    return {
        "attempt_id": attempt.id,
        "assessment": svc.summary(db, user, assessment),
        "questions": svc.public_questions(assessment),
    }


@router.post("/attempts/{attempt_id}/submit", response_model=AttemptResultOut)
def submit_attempt(attempt_id: uuid.UUID, body: SubmitIn, user: Student, db: DB) -> dict:
    attempt = db.get(AssessmentAttempt, attempt_id)
    if attempt is None or attempt.student_id != user.id:
        raise not_found("Attempt")
    result = svc.submit(db, user, attempt, [r.model_dump() for r in body.responses])
    db.commit()
    return result


@router.get("/attempts/{attempt_id}", response_model=AttemptResultOut)
def get_attempt(attempt_id: uuid.UUID, user: Student, db: DB) -> dict:
    attempt = db.get(AssessmentAttempt, attempt_id)
    if attempt is None or attempt.student_id != user.id:
        raise not_found("Attempt")
    return svc.result_of(db, attempt)
