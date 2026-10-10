from __future__ import annotations

from fastapi import APIRouter, Response
from sqlalchemy import select

from app.api.deps import DB, Educator
from app.core.errors import not_found
from app.models import Cohort, EducatorInvite
from app.schemas import CohortCreate, CohortOut, InviteCreate, InviteOut
from app.services import educator as svc
from app.services import invites

router = APIRouter(prefix="/educator", tags=["educator"])


def _cohort(db, user, cohort_id: int) -> Cohort:
    cohort = db.get(Cohort, cohort_id)
    # Same 404 for "missing" and "other organisation" so cohort ids can't be probed.
    if cohort is None or cohort.organization_id != user.organization_id:
        raise not_found("Cohort")
    return cohort


@router.get("/cohorts", response_model=list[CohortOut])
def list_cohorts(user: Educator, db: DB) -> list[dict]:
    return svc.cohort_summaries(db, user)


@router.post("/cohorts", response_model=CohortOut, status_code=201)
def create_cohort(body: CohortCreate, user: Educator, db: DB) -> dict:
    cohort = Cohort(
        organization_id=user.organization_id,
        educator_id=user.id,
        name=body.name.strip(),
        join_code=svc.new_join_code(db),
    )
    db.add(cohort)
    db.commit()
    return {
        "id": cohort.id,
        "name": cohort.name,
        "join_code": cohort.join_code,
        "student_count": 0,
        "created_at": cohort.created_at,
    }


@router.get("/cohorts/{cohort_id}/overview")
def cohort_overview(cohort_id: int, user: Educator, db: DB) -> dict:
    """Aggregated, privacy-conscious cohort analytics (nicknames only, no PII)."""
    return svc.overview(db, _cohort(db, user, cohort_id))


def _invite_out(invite: EducatorInvite, token: str | None = None) -> dict:
    return {
        "id": invite.id,
        "expires_at": invite.expires_at,
        "max_uses": invite.max_uses,
        "used_count": invite.used_count,
        "created_at": invite.created_at,
        "revoked_at": invite.revoked_at,
        "status": invites.status_of(invite),
        "token": token,
    }


@router.post("/invites", response_model=InviteOut, status_code=201)
def create_invite(body: InviteCreate, user: Educator, db: DB) -> dict:
    """Invite a colleague into *your own* organisation. The token is returned once."""
    invite, token = invites.create(
        db,
        user.organization_id,
        days_valid=body.days_valid,
        max_uses=body.max_uses,
        created_by=user,
    )
    db.commit()
    return _invite_out(invite, token)


@router.get("/invites", response_model=list[InviteOut])
def list_invites(user: Educator, db: DB) -> list[dict]:
    rows = db.scalars(
        select(EducatorInvite)
        .where(EducatorInvite.organization_id == user.organization_id)
        .order_by(EducatorInvite.created_at.desc())
        .limit(50)
    )
    return [_invite_out(i) for i in rows]


@router.delete("/invites/{invite_id}", status_code=204)
def revoke_invite(invite_id: int, user: Educator, db: DB) -> Response:
    invite = db.get(EducatorInvite, invite_id)
    if invite is None or invite.organization_id != user.organization_id:
        raise not_found("Invitation")
    if invite.revoked_at is None:
        from datetime import UTC, datetime

        invite.revoked_at = datetime.now(UTC)
        db.commit()
    return Response(status_code=204)
