"""Simulation sessions (persisted, scenario-driven) and stateless calculators."""

from __future__ import annotations

import uuid
from decimal import Decimal

from fastapi import APIRouter
from sqlalchemy import select

from app.api.deps import DB, CurrentUser, Student
from app.api.v1.content import require_pillar
from app.core.errors import forbidden, not_found
from app.engine import investing, savings
from app.learning import stages
from app.models import Scenario, SimulationSession
from app.schemas import (
    DecisionIn,
    HeadStartIn,
    InvestmentProjectionIn,
    SavingsProjectionIn,
    SessionCreate,
    SessionOut,
    SessionSummary,
)
from app.services import simulations

router = APIRouter(tags=["simulations"])


def session_out(s: SimulationSession, *, new_achievements=None, previous_best=None) -> SessionOut:
    return SessionOut(
        id=s.id,
        scenario_slug=s.scenario.slug,
        kind=s.scenario.kind,
        attempt_number=s.attempt_number,
        status=s.status,
        phase=s.phase,
        state=s.state,
        result=s.result,
        score=s.score,
        previous_best=previous_best,
        new_achievements=new_achievements or [],
        started_at=s.started_at,
        completed_at=s.completed_at,
    )


def _owned_session(db, user, session_id: uuid.UUID) -> SimulationSession:
    s = db.get(SimulationSession, session_id)
    if s is None or s.student_id != user.id:
        raise not_found("Simulation session")
    return s


@router.post("/simulations/sessions", response_model=SessionOut, status_code=201)
def start_session(body: SessionCreate, user: Student, db: DB) -> SessionOut:
    scenario = db.scalar(select(Scenario).where(Scenario.slug == body.scenario_slug))
    if scenario is None:
        raise not_found("Scenario")
    stage = stages.stage_for(user.profile.grade)
    if not stages.is_eligible(stage, scenario.stages):
        raise forbidden("This scenario is not part of your learning stage yet.")
    session = simulations.start(db, user, scenario)
    db.commit()
    return session_out(session)


@router.get("/simulations/sessions", response_model=list[SessionSummary])
def list_sessions(user: Student, db: DB, scenario_slug: str | None = None) -> list[SessionSummary]:
    q = (
        select(SimulationSession, Scenario)
        .join(Scenario)
        .where(SimulationSession.student_id == user.id)
        .order_by(SimulationSession.started_at.desc())
        .limit(50)
    )
    if scenario_slug:
        q = q.where(Scenario.slug == scenario_slug)
    return [
        SessionSummary(
            id=s.id,
            scenario_slug=sc.slug,
            scenario_title=sc.title,
            kind=sc.kind,
            attempt_number=s.attempt_number,
            status=s.status,
            score=s.score,
            started_at=s.started_at,
            completed_at=s.completed_at,
        )
        for s, sc in db.execute(q)
    ]


@router.get("/simulations/sessions/{session_id}", response_model=SessionOut)
def get_session(session_id: uuid.UUID, user: Student, db: DB) -> SessionOut:
    return session_out(_owned_session(db, user, session_id))


@router.post("/simulations/sessions/{session_id}/decisions", response_model=SessionOut)
def decide(session_id: uuid.UUID, body: DecisionIn, user: Student, db: DB) -> SessionOut:
    session = _owned_session(db, user, session_id)
    _, badges, previous_best = simulations.decide(db, user, session, body.type, body.payload)
    db.commit()
    return session_out(session, new_achievements=badges, previous_best=previous_best)


# --- Stateless calculators (explore freely; nothing is saved) ---------------


@router.post("/calculators/savings")
def savings_calculator(body: SavingsProjectionIn, user: CurrentUser) -> dict:
    require_pillar(user, "saving")
    return savings.compare_compounding(
        monthly_deposit=Decimal(str(body.monthly_deposit)),
        months=body.months,
        annual_rate=Decimal(str(body.annual_rate)),
        opening_balance=Decimal(str(body.opening_balance)),
    )


@router.post("/calculators/head-start")
def head_start_calculator(body: HeadStartIn, user: CurrentUser) -> dict:
    require_pillar(user, "saving")
    return savings.head_start(
        monthly_deposit=Decimal(str(body.monthly_deposit)),
        annual_rate=Decimal(str(body.annual_rate)),
        total_years=body.total_years,
        delay_years=body.delay_years,
    )


@router.post("/calculators/investment")
def investment_calculator(body: InvestmentProjectionIn, user: CurrentUser) -> dict:
    require_pillar(user, "investing")
    return investing.project_portfolio(
        amount=Decimal(str(body.amount)),
        allocation=body.allocation,
        horizon_years=body.horizon_years,
    )
