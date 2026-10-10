from __future__ import annotations

from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Response
from sqlalchemy import select

from app.api.deps import DB, StudentProfileOnly
from app.content import loader
from app.core import ratelimit, sessions
from app.core.config import get_settings
from app.core.errors import ApiError, conflict
from app.core.security import verify_password
from app.learning import stages
from app.models import Cohort, CohortMembership, OrganizationTransfer, User
from app.schemas import JoinCohort, ProfileOut, ProfileUpdate, Reauth, UserOut
from app.services import achievements

router = APIRouter(prefix="/students/me", tags=["students"])


GRADE_LOCK_DAYS = 30


def stage_out(grade: int | None) -> dict:
    if grade is None:
        return {
            "key": "unselected",
            "label": "Choose your class",
            "grades": "Classes 7–12",
            "tagline": "Pick your class so we can show activities that fit you.",
            "portfolio_quest": False,
        }
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
def get_profile(user: StudentProfileOnly, db: DB) -> ProfileOut:
    return _profile_out(db, user)


@router.put("/profile", response_model=ProfileOut)
def update_profile(body: ProfileUpdate, user: StudentProfileOnly, db: DB) -> ProfileOut:
    p = user.profile
    data = body.model_dump(exclude_unset=True)
    now = datetime.now(UTC)
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
    was_onboarded = p.onboarding_completed
    new_grade = data.get("grade")
    if new_grade is not None and new_grade != p.grade and was_onboarded:
        # The class is self-declared, so it cannot be verified. Once onboarding is done it can
        # only change occasionally, which stops hopping stages to unlock content.
        if p.grade_changed_at and now - p.grade_changed_at < timedelta(days=GRADE_LOCK_DAYS):
            raise ApiError(
                409,
                "grade_locked",
                f"Your class can be changed once every {GRADE_LOCK_DAYS} days. "
                "Ask your teacher if it is wrong.",
                "grade",
            )
        p.grade_changed_at = now
    for key, value in data.items():
        setattr(p, key, value)
    if p.onboarding_completed:
        if p.grade is None:
            raise ApiError(422, "grade_required", "Choose your class to finish onboarding", "grade")
        if not p.persona_key:
            raise ApiError(
                422, "persona_required", "Choose a persona to finish onboarding", "persona_key"
            )
        if not was_onboarded:
            p.grade_changed_at = now
        achievements.award(db, user, ["first_steps"])
    db.commit()
    return _profile_out(db, user)


@router.post("/cohorts", response_model=ProfileOut)
def join_cohort(body: JoinCohort, user: StudentProfileOnly, db: DB) -> ProfileOut:
    """Join a class by code. A student belongs to one organisation at a time.

    A code from a different organisation is refused with the same message as an unknown code,
    so codes cannot be used to probe other organisations. Leaving an organisation is an
    explicit act (``POST /students/me/organization/leave``).
    """
    s = get_settings()
    ratelimit.enforce("join:user", user.id, s.rl_join_student, ratelimit.HOUR)
    cohort = db.scalar(select(Cohort).where(Cohort.join_code == body.join_code.strip().upper()))
    if cohort is None or (
        user.organization_id is not None and cohort.organization_id != user.organization_id
    ):
        raise ApiError(404, "invalid_join_code", "That class code was not found", "join_code")
    if db.get(CohortMembership, (cohort.id, user.id)):
        raise conflict("already_member", "You are already in this class")
    db.add(CohortMembership(cohort_id=cohort.id, student_id=user.id))
    if user.organization_id is None:
        user.organization_id = cohort.organization_id
    db.commit()
    return _profile_out(db, user)


@router.post("/organization/leave", response_model=ProfileOut)
def leave_organization(body: Reauth, user: StudentProfileOnly, db: DB) -> ProfileOut:
    """Leave your organisation and all its classes, so you could join a different one.

    Their educators lose sight of your data immediately. The move is written to an audit table.
    """
    ratelimit.enforce("password:user", user.id, get_settings().rl_password_user, ratelimit.HOUR)
    if not verify_password(body.current_password, user.password_hash):
        raise ApiError(
            403, "wrong_password", "Your current password is not correct", "current_password"
        )
    memberships = list(
        db.scalars(select(CohortMembership).where(CohortMembership.student_id == user.id))
    )
    db.add(
        OrganizationTransfer(
            student_id=user.id,
            from_organization_id=user.organization_id,
            cohorts_left=len(memberships),
        )
    )
    for m in memberships:
        db.delete(m)
    user.organization_id = None
    db.commit()
    return _profile_out(db, user)


@router.delete("", status_code=204)
def delete_account(body: Reauth, user: StudentProfileOnly, db: DB) -> Response:
    """Permanently delete the student's account and all learning data (privacy right).

    Irreversible, so it needs the current password even though the caller is signed in.
    """
    ratelimit.enforce("password:user", user.id, get_settings().rl_password_user, ratelimit.HOUR)
    if not verify_password(body.current_password, user.password_hash):
        raise ApiError(
            403, "wrong_password", "Your current password is not correct", "current_password"
        )
    db.delete(user)
    db.commit()
    out = Response(status_code=204)
    sessions.clear_cookies(out)
    return out
