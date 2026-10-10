"""Login sessions: short-lived access JWT + rotating refresh token, both in HttpOnly cookies.

* Access token: 15 minutes, carries the session id (``sid``). Every request checks that the
  session is still live, so logout, password change and reuse detection take effect at once.
* Refresh token: ``<session id>.<random secret>``, stored only as a SHA-256 hash, replaced on
  every refresh. Presenting an already-rotated token revokes the session (stolen-token replay).
* CSRF: unsafe requests authenticated by cookie must carry ``X-CSRF-Token`` = HMAC(secret,
  session id). The value is also handed to the SPA in a readable cookie. Bearer-header
  requests (scripts, tests) are not CSRF-able and skip the check.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import secrets
import uuid
from datetime import UTC, datetime, timedelta

import jwt
from fastapi import Response
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.errors import ApiError
from app.models import AuthSession, User

ALGORITHM = "HS256"
ACCESS_COOKIE = "rr_access"
REFRESH_COOKIE = "rr_refresh"
CSRF_COOKIE = "rr_csrf"
CSRF_HEADER = "X-CSRF-Token"
SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def new_refresh_token(session_id: uuid.UUID) -> str:
    return f"{session_id}.{secrets.token_urlsafe(32)}"


def csrf_token(session_id: uuid.UUID | str) -> str:
    mac = hmac.new(
        get_settings().secret_key.encode(), f"csrf:{session_id}".encode(), hashlib.sha256
    ).digest()
    return base64.urlsafe_b64encode(mac).decode().rstrip("=")


def csrf_valid(session_id: uuid.UUID | str, presented: str | None) -> bool:
    return bool(presented) and hmac.compare_digest(csrf_token(session_id), presented or "")


def create_access_token(user: User, session_id: uuid.UUID) -> tuple[str, int]:
    settings = get_settings()
    expires_in = settings.access_token_minutes * 60
    now = datetime.now(UTC)
    payload = {
        "sub": str(user.id),
        "sid": str(session_id),
        "role": user.role,
        "iat": now,
        "exp": now + timedelta(seconds=expires_in),
    }
    return jwt.encode(payload, settings.secret_key, algorithm=ALGORITHM), expires_in


def decode_access_token(token: str) -> dict:
    return jwt.decode(
        token,
        get_settings().secret_key,
        algorithms=[ALGORITHM],
        options={"require": ["sid", "exp"]},
    )


def open_session(db: Session, user: User) -> tuple[AuthSession, str]:
    settings = get_settings()
    sid = uuid.uuid4()
    refresh = new_refresh_token(sid)
    row = AuthSession(
        id=sid,
        user_id=user.id,
        token_hash=_hash(refresh),
        expires_at=datetime.now(UTC) + timedelta(days=settings.refresh_days),
    )
    db.add(row)
    db.flush()
    return row, refresh


def live_session(db: Session, session_id: uuid.UUID, user_id: uuid.UUID) -> AuthSession | None:
    row = db.get(AuthSession, session_id)
    now = datetime.now(UTC)
    if row is None or row.user_id != user_id or row.revoked_at is not None or row.expires_at <= now:
        return None
    return row


def revoke(db: Session, session_id: uuid.UUID, reason: str) -> None:
    db.execute(
        update(AuthSession)
        .where(AuthSession.id == session_id, AuthSession.revoked_at.is_(None))
        .values(revoked_at=datetime.now(UTC), revoke_reason=reason)
    )


def revoke_all(db: Session, user_id: uuid.UUID, reason: str) -> None:
    db.execute(
        update(AuthSession)
        .where(AuthSession.user_id == user_id, AuthSession.revoked_at.is_(None))
        .values(revoked_at=datetime.now(UTC), revoke_reason=reason)
    )


def parse_refresh(token: str | None) -> tuple[uuid.UUID, str] | None:
    if not token or "." not in token:
        return None
    sid, _, _ = token.partition(".")
    try:
        return uuid.UUID(sid), _hash(token)
    except ValueError:
        return None


def rotate(db: Session, refresh_token: str | None) -> tuple[User, AuthSession, str]:
    """Exchange a refresh token for a new one. Raises 401 for anything unusable."""
    bad = ApiError(401, "unauthorized", "Your session has expired. Please log in again.")
    parsed = parse_refresh(refresh_token)
    if parsed is None:
        raise bad
    sid, digest = parsed
    # Lock the row so two tabs refreshing at once cannot both win.
    row = db.scalar(select(AuthSession).where(AuthSession.id == sid).with_for_update())
    now = datetime.now(UTC)
    if row is None or row.revoked_at is not None or row.expires_at <= now:
        raise bad
    if hmac.compare_digest(row.token_hash, digest):
        pass
    elif row.prev_token_hash and hmac.compare_digest(row.prev_token_hash, digest):
        # An old token came back: someone copied it. Kill the session.
        row.revoked_at = now
        row.revoke_reason = "reuse_detected"
        db.commit()
        raise bad
    else:
        raise bad
    user = db.get(User, row.user_id)
    if user is None or not user.is_active:
        raise bad
    fresh = new_refresh_token(row.id)
    row.prev_token_hash = row.token_hash
    row.token_hash = _hash(fresh)
    row.last_used_at = now
    row.expires_at = now + timedelta(days=get_settings().refresh_days)
    db.flush()
    return user, row, fresh


def set_cookies(
    response: Response, user: User, session: AuthSession, refresh: str
) -> tuple[str, int]:
    """Attach the three session cookies. Returns (access token, seconds it lives)."""
    settings = get_settings()
    access, expires_in = create_access_token(user, session.id)
    secure = settings.secure_cookies
    response.set_cookie(
        ACCESS_COOKIE, access, max_age=expires_in, httponly=True, secure=secure,
        samesite="lax", path="/api",
    )  # fmt: skip
    response.set_cookie(
        REFRESH_COOKIE, refresh, max_age=settings.refresh_days * 86400, httponly=True,
        secure=secure, samesite="strict", path="/api/v1/auth",
    )  # fmt: skip
    # Readable on purpose: the SPA echoes it in X-CSRF-Token and uses its presence as the
    # "probably signed in" hint. It is useless without the HttpOnly cookies.
    response.set_cookie(
        CSRF_COOKIE, csrf_token(session.id), max_age=settings.refresh_days * 86400,
        httponly=False, secure=secure, samesite="lax", path="/",
    )  # fmt: skip
    return access, expires_in


def clear_cookies(response: Response) -> None:
    response.delete_cookie(ACCESS_COOKIE, path="/api")
    response.delete_cookie(REFRESH_COOKIE, path="/api/v1/auth")
    response.delete_cookie(CSRF_COOKIE, path="/")
