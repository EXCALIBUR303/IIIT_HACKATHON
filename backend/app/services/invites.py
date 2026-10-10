"""Organisation-bound educator invitations.

An invite is the only way to become an educator. It names one organisation, expires, and can
be used a limited number of times. The raw token is shown once; only its SHA-256 is stored.
Consuming an invite is a single conditional UPDATE, so two people racing for the last use
cannot both succeed.
"""

from __future__ import annotations

import hashlib
import secrets
from datetime import UTC, datetime, timedelta

from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.core.errors import ApiError
from app.models import EducatorInvite, Organization, User

TOKEN_PREFIX = "rri_"


def hash_token(token: str) -> str:
    return hashlib.sha256(token.strip().encode()).hexdigest()


def create(
    db: Session,
    organization_id: int,
    *,
    days_valid: int = 7,
    max_uses: int = 1,
    created_by: User | None = None,
) -> tuple[EducatorInvite, str]:
    token = TOKEN_PREFIX + secrets.token_urlsafe(24)
    invite = EducatorInvite(
        organization_id=organization_id,
        token_hash=hash_token(token),
        expires_at=datetime.now(UTC) + timedelta(days=days_valid),
        max_uses=max_uses,
        created_by=created_by.id if created_by else None,
    )
    db.add(invite)
    db.flush()
    return invite, token


def consume(db: Session, token: str) -> int:
    """Use one slot of a valid invite and return its organisation id.

    Every failure (unknown, malformed, expired, revoked, already used up) raises the same
    error, so a caller cannot tell which case they hit.
    """
    row = db.execute(
        text(
            "UPDATE educator_invites SET used_count = used_count + 1 "
            "WHERE token_hash = :h AND revoked_at IS NULL AND expires_at > :now "
            "AND used_count < max_uses RETURNING organization_id"
        ),
        {"h": hash_token(token), "now": datetime.now(UTC)},
    ).first()
    if row is None:
        raise ApiError(403, "invalid_invite", "This invitation is not valid", "invite_token")
    return int(row[0])


def status_of(invite: EducatorInvite) -> str:
    if invite.revoked_at is not None:
        return "revoked"
    if invite.expires_at <= datetime.now(UTC):
        return "expired"
    if invite.used_count >= invite.max_uses:
        return "used"
    return "active"


def create_organization(db: Session, name: str, kind: str = "ngo") -> Organization:
    """Create an organisation. Only operators do this (``python -m app.admin``), never a request."""
    name = name.strip()
    if db.scalar(select(Organization.id).where(Organization.name == name)):
        raise ValueError(f"An organisation named {name!r} already exists")
    org = Organization(name=name, kind=kind)
    db.add(org)
    db.flush()
    return org
