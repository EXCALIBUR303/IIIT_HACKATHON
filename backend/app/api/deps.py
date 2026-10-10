"""Shared FastAPI dependencies: DB session, authentication, role checks."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from typing import Annotated
from urllib.parse import urlsplit

import jwt
from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core import sessions
from app.core.config import get_settings
from app.core.db import get_db
from app.core.errors import ApiError
from app.models import StudentProfile, User

bearer = HTTPBearer(auto_error=False)
DB = Annotated[Session, Depends(get_db)]


def _origin_allowed(request: Request) -> bool:
    """Reject a browser request that names a foreign Origin (or, failing that, Referer)."""
    allowed = {o.rstrip("/") for o in get_settings().cors_origins}
    origin = request.headers.get("origin")
    if origin is None:
        referer = request.headers.get("referer")
        if referer is None:
            return True  # no browser hint; the CSRF token below is still required
        parts = urlsplit(referer)
        origin = f"{parts.scheme}://{parts.netloc}"
    return origin.rstrip("/") in allowed


def check_csrf(request: Request, session_id: uuid.UUID | str) -> None:
    if request.method in sessions.SAFE_METHODS:
        return
    if not _origin_allowed(request) or not sessions.csrf_valid(
        session_id, request.headers.get(sessions.CSRF_HEADER)
    ):
        raise ApiError(403, "csrf_failed", "This request could not be verified. Please reload.")


def current_user(
    request: Request,
    db: DB,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
) -> User:
    via_cookie = credentials is None
    token = request.cookies.get(sessions.ACCESS_COOKIE) if via_cookie else credentials.credentials
    if not token:
        raise ApiError(401, "unauthorized", "Please log in")
    try:
        payload = sessions.decode_access_token(token)
        user_id = uuid.UUID(payload["sub"])
        session_id = uuid.UUID(payload["sid"])
    except (jwt.PyJWTError, KeyError, ValueError) as exc:
        raise ApiError(
            401, "unauthorized", "Your session has expired. Please log in again."
        ) from exc
    # The session row is what makes logout, password change and token reuse bite immediately.
    if sessions.live_session(db, session_id, user_id) is None:
        raise ApiError(401, "unauthorized", "Your session has expired. Please log in again.")
    if via_cookie:
        check_csrf(request, session_id)
    user = db.get(User, user_id)
    if user is None or not user.is_active:
        raise ApiError(401, "unauthorized", "Account not found or inactive")
    request.state.session_id = session_id
    now = datetime.now(UTC)
    # Throttle activity writes to once every 5 minutes.
    if user.last_active_at is None or now - user.last_active_at > timedelta(minutes=5):
        user.last_active_at = now
        db.commit()
    return user


CurrentUser = Annotated[User, Depends(current_user)]


def student_profile_user(user: CurrentUser, db: DB) -> User:
    """A student, whether or not they have chosen a learning stage yet (profile/onboarding)."""
    if user.role != "student":
        raise ApiError(403, "forbidden", "This area is for students")
    if user.profile is None:
        user.profile = StudentProfile(user_id=user.id, preferences={})
        db.commit()
    return user


def student_user(user: Annotated[User, Depends(student_profile_user)]) -> User:
    """A student who has chosen a learning stage. Every stage-gated route uses this."""
    if user.profile.grade is None:
        raise ApiError(
            403,
            "stage_required",
            "Choose your class to unlock your learning stage first",
            "grade",
        )
    return user


def educator_user(user: CurrentUser) -> User:
    if user.role not in ("educator", "admin"):
        raise ApiError(403, "forbidden", "This area is for educators and NGO coordinators")
    if user.organization_id is None:
        raise ApiError(403, "forbidden", "Your account is not linked to an organisation")
    return user


Student = Annotated[User, Depends(student_user)]
StudentProfileOnly = Annotated[User, Depends(student_profile_user)]
Educator = Annotated[User, Depends(educator_user)]
