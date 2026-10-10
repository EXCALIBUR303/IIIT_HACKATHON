from __future__ import annotations

from fastapi import APIRouter

from app.api.deps import DB, Educator
from app.core.errors import not_found
from app.models import Cohort
from app.schemas import CohortCreate, CohortOut
from app.services import educator as svc

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
