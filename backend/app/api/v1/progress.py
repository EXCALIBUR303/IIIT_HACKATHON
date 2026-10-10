from __future__ import annotations

from fastapi import APIRouter
from sqlalchemy import select

from app.api.deps import DB, Student
from app.learning import adaptive
from app.models import Achievement, StudentAchievement
from app.schemas import AchievementOut, ProgressOut, Recommendation
from app.services import progress as svc

router = APIRouter(tags=["progress"])


@router.get("/progress/me", response_model=ProgressOut)
def my_progress(user: Student, db: DB) -> dict:
    return svc.progress(db, user)


@router.get("/progress/me/recommendation", response_model=Recommendation)
def my_recommendation(user: Student, db: DB) -> dict:
    """Next activity chosen by transparent adaptive rules (see learning/adaptive.py)."""
    return adaptive.recommend(svc.snapshot(db, user))


@router.get("/achievements/me", response_model=list[AchievementOut])
def my_achievements(user: Student, db: DB) -> list[dict]:
    earned = {
        sa.achievement_id: sa.awarded_at
        for sa in db.scalars(
            select(StudentAchievement).where(StudentAchievement.student_id == user.id)
        )
    }
    return [
        {
            "slug": a.slug,
            "title": a.title,
            "description": a.description,
            "icon": a.icon,
            "earned": a.id in earned,
            "awarded_at": earned.get(a.id),
        }
        for a in db.scalars(select(Achievement).order_by(Achievement.id))
    ]
