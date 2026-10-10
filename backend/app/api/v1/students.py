from __future__ import annotations

from fastapi import APIRouter, Response
from sqlalchemy import select

from app.api.deps import DB, Student
from app.content import loader
from app.core.errors import ApiError, conflict
from app.learning import stages
from app.models import Cohort, CohortMembership, User
from app.schemas import JoinCohort, ProfileOut, ProfileUpdate, UserOut
from app.services import achievements

router = APIRouter(prefix="/students/me", tags=["students"])


def stage_out(grade: int | None) -> dict:
    info = stages.info(stages.stage_for(grade))
    return {
        "key": info.key,
        "label": info.label,
        "grades": info.grades,
        "tagline": info.tagline,
        "portfolio_quest": info.portfolio_quest,
    }


def _profile_out(db, user: User) -> ProfileOut:
    p = user.profile
    cohorts = db.execute(
        select(Cohort.id, Cohort.name)
        .join(CohortMembership)
        .where(CohortMembership.student_id == user.id)
    )
    return ProfileOut(
        user=UserOut.model_validate(user),
        grade=p.grade,
        stage=stage_out(p.grade),
        language=p.language,
        learning_level=p.learning_level,
        persona_key=p.persona_key,
        onboarding_completed=p.onboarding_completed,
        preferences=p.preferences or {},
        cohorts=[{"id": cid, "name": name} for cid, name in cohorts],
    )


@router.get("/profile", response_model=ProfileOut)
def get_profile(user: Student, db: DB) -> ProfileOut:
    return _profile_out(db, user)


@router.put("/profile", response_model=ProfileOut)
def update_profile(body: ProfileUpdate, user: Student, db: DB) -> ProfileOut:
    p = user.profile
    data = body.model_dump(exclude_unset=True)
    if "persona_key" in data and data["persona_key"] is not None:
        if data["persona_key"] not in {x["key"] for x in loader.personas()}:
            raise ApiError(422, "invalid_persona", "Unknown persona", "persona_key")
    if "display_name" in data and data["display_name"]:
        user.display_name = data.pop("display_name").strip()
    else:
        data.pop("display_name", None)
    if "preferences" in data and data["preferences"] is not None:
        p.preferences = body.preferences.model_dump()
        data.pop("preferences")
    for key, value in data.items():
        setattr(p, key, value)
    if p.onboarding_completed:
        if not p.persona_key:
            raise ApiError(
                422, "persona_required", "Choose a persona to finish onboarding", "persona_key"
            )
        achievements.award(db, user, ["first_steps"])
    db.commit()
    return _profile_out(db, user)


@router.post("/cohorts", response_model=ProfileOut)
def join_cohort(body: JoinCohort, user: Student, db: DB) -> ProfileOut:
    cohort = db.scalar(select(Cohort).where(Cohort.join_code == body.join_code.strip().upper()))
    if cohort is None:
        raise ApiError(404, "invalid_join_code", "That class code was not found", "join_code")
    if db.get(CohortMembership, (cohort.id, user.id)):
        raise conflict("already_member", "You are already in this class")
    db.add(CohortMembership(cohort_id=cohort.id, student_id=user.id))
    if user.organization_id is None:
        user.organization_id = cohort.organization_id
    db.commit()
    return _profile_out(db, user)


@router.delete("", status_code=204)
def delete_account(user: Student, db: DB) -> Response:
    """Permanently delete the student's account and all learning data (privacy right)."""
    db.delete(user)
    db.commit()
    return Response(status_code=204)
