from __future__ import annotations

import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Request, Response
from sqlalchemy import select

from app.api.deps import DB, CurrentUser, check_csrf
from app.core import ratelimit, sessions
from app.core.config import get_settings
from app.core.errors import ApiError, conflict
from app.core.security import hash_password, verify_password
from app.models import Cohort, CohortMembership, StudentProfile, User
from app.schemas import (
    AuthOut,
    EducatorRegister,
    LoginRequest,
    PasswordChange,
    StudentRegister,
    UserOut,
)
from app.services import invites

router = APIRouter(prefix="/auth", tags=["auth"])

# A real bcrypt hash of a throwaway string, so unknown usernames cost the same time as wrong
# passwords and login timing does not reveal which usernames exist.
_DUMMY_HASH = hash_password("not-a-real-password")


def _bearer_mode(request: Request) -> bool:
    return request.headers.get("x-auth-mode", "").lower() == "bearer"


def _issue(request: Request, response: Response, db, user: User) -> AuthOut:
    """Open a session and return it: cookies for browsers, a token for explicit bearer clients."""
    session, refresh = sessions.open_session(db, user)
    db.commit()
    if _bearer_mode(request):
        access, expires_in = sessions.create_access_token(user, session.id)
        return AuthOut(
            user=UserOut.model_validate(user),
            expires_in=expires_in,
            access_token=access,
            token_type="bearer",
        )
    _, expires_in = sessions.set_cookies(response, user, session, refresh)
    return AuthOut(
        user=UserOut.model_validate(user),
        expires_in=expires_in,
        csrf_token=sessions.csrf_token(session.id),
    )


def _ensure_username_free(db, username: str) -> None:
    if db.scalar(select(User.id).where(User.username == username.lower())):
        raise conflict("username_taken", "That username is already taken")


@router.post(
    "/register/student", response_model=AuthOut, response_model_exclude_none=True, status_code=201
)
def register_student(
    body: StudentRegister, request: Request, response: Response, db: DB
) -> AuthOut:
    """Create a student account. No email, phone or real-world ID is collected."""
    s = get_settings()
    ip = ratelimit.client_ip(request)
    ratelimit.enforce("register:ip", ip, s.rl_register_ip, ratelimit.HOUR)
    _ensure_username_free(db, body.username)
    cohort = None
    if body.join_code:
        ratelimit.enforce("join:ip", ip, s.rl_join_ip, ratelimit.HOUR)
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
    return _issue(request, response, db, user)


@router.post(
    "/register/educator", response_model=AuthOut, response_model_exclude_none=True, status_code=201
)
def register_educator(
    body: EducatorRegister, request: Request, response: Response, db: DB
) -> AuthOut:
    """Join an organisation as an educator with its invitation token.

    The organisation is taken from the invite. Nothing the caller types can choose, name or
    match an organisation, so there is no way to attach to someone else's.
    """
    s = get_settings()
    ratelimit.enforce("invite:ip", ratelimit.client_ip(request), s.rl_invite_ip, ratelimit.HOUR)
    ratelimit.enforce("invite:token", body.invite_token, s.rl_invite_token, ratelimit.HOUR)
    org_id = invites.consume(db, body.invite_token)
    try:
        _ensure_username_free(db, body.username)
    except ApiError:
        db.rollback()  # do not burn the invite on a taken username
        raise
    user = User(
        username=body.username.lower(),
        password_hash=hash_password(body.password),
        role="educator",
        display_name=body.display_name,
        organization_id=org_id,
    )
    db.add(user)
    db.flush()
    return _issue(request, response, db, user)


@router.post("/login", response_model=AuthOut, response_model_exclude_none=True)
def login(body: LoginRequest, request: Request, response: Response, db: DB) -> AuthOut:
    s = get_settings()
    ip = ratelimit.client_ip(request)
    username = body.username.lower()
    ratelimit.enforce("login:ip", ip, s.rl_login_ip, 15 * ratelimit.MINUTE)
    ratelimit.enforce("login:user", f"{ip}|{username}", s.rl_login_user, 15 * ratelimit.MINUTE)
    user = db.scalar(select(User).where(User.username == username))
    ok = verify_password(body.password, user.password_hash if user else _DUMMY_HASH)
    if user is None or not user.is_active or not ok:
        raise ApiError(401, "invalid_credentials", "Incorrect username or password")
    return _issue(request, response, db, user)


@router.post("/refresh", response_model=AuthOut, response_model_exclude_none=True)
def refresh(request: Request, response: Response, db: DB) -> AuthOut:
    """Rotate the refresh token and issue a fresh access token (cookie sessions only)."""
    token = request.cookies.get(sessions.REFRESH_COOKIE)
    parsed = sessions.parse_refresh(token)
    if parsed is None:
        raise ApiError(401, "unauthorized", "Your session has expired. Please log in again.")
    check_csrf(request, parsed[0])
    user, session, fresh = sessions.rotate(db, token)
    db.commit()
    _, expires_in = sessions.set_cookies(response, user, session, fresh)
    return AuthOut(
        user=UserOut.model_validate(user),
        expires_in=expires_in,
        csrf_token=sessions.csrf_token(session.id),
    )


@router.post("/logout", status_code=204)
def logout(request: Request, response: Response, db: DB) -> Response:
    """End this session on the server (the cookies alone are not what makes it end)."""
    session_id = None
    parsed = sessions.parse_refresh(request.cookies.get(sessions.REFRESH_COOKIE))
    if parsed:
        session_id = parsed[0]
    elif request.cookies.get(sessions.ACCESS_COOKIE):
        try:
            session_id = uuid.UUID(
                sessions.decode_access_token(request.cookies[sessions.ACCESS_COOKIE])["sid"]
            )
        except Exception:
            session_id = None
    if session_id is not None:
        check_csrf(request, session_id)
        sessions.revoke(db, session_id, "logout")
        db.commit()
    out = Response(status_code=204)
    sessions.clear_cookies(out)
    return out


@router.get("/me", response_model=UserOut)
def me(user: CurrentUser) -> UserOut:
    return UserOut.model_validate(user)


@router.post("/password", response_model=AuthOut, response_model_exclude_none=True)
def change_password(
    body: PasswordChange, request: Request, response: Response, user: CurrentUser, db: DB
) -> AuthOut:
    """Change the password. Every existing session is revoked; this device gets a new one."""
    ratelimit.enforce("password:user", user.id, get_settings().rl_password_user, ratelimit.HOUR)
    if not verify_password(body.current_password, user.password_hash):
        raise ApiError(
            403, "wrong_password", "Your current password is not correct", "current_password"
        )
    if verify_password(body.new_password, user.password_hash):
        raise ApiError(
            422, "same_password", "Choose a password you have not used just now", "new_password"
        )
    user.password_hash = hash_password(body.new_password)
    user.password_changed_at = datetime.now(UTC)
    sessions.revoke_all(db, user.id, "password_changed")
    return _issue(request, response, db, user)
