"""Shared FastAPI dependencies: DB session, authentication, role checks."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from typing import Annotated

import jwt
from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.errors import ApiError
from app.core.security import decode_access_token
from app.models import StudentProfile, User

bearer = HTTPBearer(auto_error=False)
DB = Annotated[Session, Depends(get_db)]


def current_user(
    db: DB, credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)]
) -> User:
    if credentials is None:
        raise ApiError(401, "unauthorized", "Please log in")
    try:
        payload = decode_access_token(credentials.credentials)
        user_id = uuid.UUID(payload["sub"])
    except (jwt.PyJWTError, KeyError, ValueError) as exc:
        raise ApiError(
            401, "unauthorized", "Your session has expired. Please log in again."
        ) from exc
    user = db.get(User, user_id)
    if user is None or not user.is_active:
        raise ApiError(401, "unauthorized", "Account not found or inactive")
    now = datetime.now(UTC)
    # Throttle activity writes to once every 5 minutes.
    if user.last_active_at is None or now - user.last_active_at > timedelta(minutes=5):
        user.last_active_at = now
        db.commit()
    return user


CurrentUser = Annotated[User, Depends(current_user)]


def student_user(user: CurrentUser, db: DB) -> User:
    if user.role != "student":
        raise ApiError(403, "forbidden", "This area is for students")
    if user.profile is None:
        user.profile = StudentProfile(user_id=user.id, preferences={})
        db.commit()
    return user


def educator_user(user: CurrentUser) -> User:
    if user.role not in ("educator", "admin"):
        raise ApiError(403, "forbidden", "This area is for educators and NGO coordinators")
    if user.organization_id is None:
        raise ApiError(403, "forbidden", "Your account is not linked to an organisation")
    return user


Student = Annotated[User, Depends(student_user)]
Educator = Annotated[User, Depends(educator_user)]
