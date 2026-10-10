from __future__ import annotations

import hmac

from fastapi import APIRouter
from sqlalchemy import select

from app.api.deps import DB, CurrentUser
from app.core.config import get_settings
from app.core.errors import ApiError, conflict
from app.core.security import create_access_token, hash_password, verify_password
from app.models import Cohort, CohortMembership, Organization, StudentProfile, User
from app.schemas import EducatorRegister, LoginRequest, StudentRegister, TokenOut, UserOut

router = APIRouter(prefix="/auth", tags=["auth"])


def _token(user: User) -> TokenOut:
    token, expires = create_access_token(user.id, user.role)
    return TokenOut(access_token=token, expires_in=expires, user=UserOut.model_validate(user))


def _ensure_username_free(db, username: str) -> None:
    if db.scalar(select(User.id).where(User.username == username.lower())):
        raise conflict("username_taken", "That username is already taken")


@router.post("/register/student", response_model=TokenOut, status_code=201)
def register_student(body: StudentRegister, db: DB) -> TokenOut:
    """Create a student account. No email, phone or real-world ID is collected."""
    _ensure_username_free(db, body.username)
    cohort = None
    if body.join_code:
        cohort = db.scalar(select(Cohort).where(Cohort.join_code == body.join_code.strip().upper()))
        if cohort is None:
            raise ApiError(422, "invalid_join_code", "That class code was not found", "join_code")
    user = User(
        username=body.username.lower(),
        password_hash=hash_password(body.password),
        role="student",
        display_name=body.display_name,
        organization_id=cohort.organization_id if cohort else None,
    )
    user.profile = StudentProfile(preferences={})
    db.add(user)
    db.flush()
    if cohort:
        db.add(CohortMembership(cohort_id=cohort.id, student_id=user.id))
    db.commit()
    return _token(user)


@router.post("/register/educator", response_model=TokenOut, status_code=201)
def register_educator(body: EducatorRegister, db: DB) -> TokenOut:
    """Educators register with an invite code issued by the programme coordinator."""
    if not hmac.compare_digest(body.invite_code, get_settings().educator_invite_code):
        raise ApiError(403, "invalid_invite", "Invalid educator invite code", "invite_code")
    _ensure_username_free(db, body.username)
    org = db.scalar(select(Organization).where(Organization.name == body.organization_name.strip()))
    if org is None:
        org = Organization(name=body.organization_name.strip(), kind="ngo")
        db.add(org)
        db.flush()
    user = User(
        username=body.username.lower(),
        password_hash=hash_password(body.password),
        role="educator",
        display_name=body.display_name,
        organization_id=org.id,
    )
    db.add(user)
    db.commit()
    return _token(user)


@router.post("/login", response_model=TokenOut)
def login(body: LoginRequest, db: DB) -> TokenOut:
    user = db.scalar(select(User).where(User.username == body.username.lower()))
    if user is None or not user.is_active or not verify_password(body.password, user.password_hash):
        raise ApiError(401, "invalid_credentials", "Incorrect username or password")
    return _token(user)


@router.get("/me", response_model=UserOut)
def me(user: CurrentUser) -> UserOut:
    return UserOut.model_validate(user)
