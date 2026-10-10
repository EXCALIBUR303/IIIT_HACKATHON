"""Simulation session state machine.

Each scenario kind moves through explicit phases. A decision is accepted only
in the phase that expects it, so sessions can never reach an inconsistent
state. Engine results are recomputed from the stored raw decisions (never from
client-supplied numbers), which keeps outcomes authoritative and reproducible.

    budget:    allocate --allocate--> respond_event --respond_event--> done
    savings:   plan --plan--> respond_event --respond_event--> done
    investing: allocate --allocate--> respond_event --respond_event--> done
               (skips straight to done when no market fall fits the horizon)
    safety:    classify --classify (one per message)--> done
"""

from __future__ import annotations

import zlib
from datetime import UTC, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.db import advisory_lock
from app.core.errors import ApiError, conflict
from app.engine import budget, investing, safety, savings
from app.engine.money import SimulationError
from app.learning import mastery
from app.models import Scenario, SimulationDecision, SimulationSession, User
from app.rewards import rules as reward_rules

from . import achievements, rewards


def make_seed(student_id: Any, scenario_slug: str, attempt: int) -> int:
    """Stable, reproducible seed: same student + scenario + attempt -> same surprises."""
    return zlib.crc32(f"{student_id}:{scenario_slug}:{attempt}".encode()) & 0x7FFFFFFF


# ---------------------------------------------------------------------------
# Session start
# ---------------------------------------------------------------------------


def initial_state(scenario: Scenario) -> tuple[str, dict[str, Any]]:
    cfg = scenario.config
    if scenario.kind == "budget":
        sc = budget.scenario_from_config(cfg)
        return "allocate", {
            "income": float(sc.income),
            "goal": {
                "label": sc.goal_label,
                "amount": float(sc.goal_amount),
                "months": sc.goal_months,
                "monthly_target": float(sc.goal_monthly_target),
            },
            "categories": [
                {
                    "key": c.key,
                    "label": c.label,
                    "kind": c.kind,
                    "essential_min": float(c.essential_min),
                    "hint": c.hint,
                }
                for c in sc.categories
            ],
        }
    if scenario.kind == "savings":
        sc = savings.scenario_from_config(cfg)
        return "plan", {
            "income": float(sc.income),
            "fixed_spending": float(sc.fixed_spending),
            "capacity": float(sc.capacity),
            "months": sc.months,
            "goal": {"label": sc.goal_label, "amount": float(sc.goal_amount)},
            "accounts": [
                {
                    "key": a.key,
                    "label": a.label,
                    "annual_rate": float(a.annual_rate),
                    "compounding": a.compounding,
                    "note": a.note,
                }
                for a in sc.accounts
            ],
        }
    if scenario.kind == "investing":
        return "allocate", {
            "amount": cfg["amount"],
            "horizons": cfg["horizons"],
            "assets": [
                {
                    "key": investing.ASSETS[k].key,
                    "label": investing.ASSETS[k].label,
                    "description": investing.ASSETS[k].description,
                    "risk_level": investing.ASSETS[k].risk_level,
                    "single_company": investing.ASSETS[k].single_company,
                }
                for k in cfg["assets"]
            ],
            "disclaimer": investing.DISCLAIMER,
        }
    if scenario.kind == "safety":
        messages = safety.scenario_from_config(cfg)
        return "classify", {
            "messages": [safety.public_message(m) for m in messages],
            "answered": [],
            **safety.catalog(),
        }
    raise ApiError(500, "bad_config", f"Unsupported scenario kind {scenario.kind}")


def start(db: Session, student: User, scenario: Scenario) -> SimulationSession:
    """Start a new attempt. Retries if a concurrent request took the same attempt number."""
    phase, state = initial_state(scenario)
    # Concurrent starts (double clicks) queue here instead of racing for attempt numbers.
    advisory_lock(db, "session", student.id, scenario.id)
    for _ in range(3):
        # Starting fresh abandons any unfinished attempt at the same scenario.
        for old in db.scalars(
            select(SimulationSession).where(
                SimulationSession.student_id == student.id,
                SimulationSession.scenario_id == scenario.id,
                SimulationSession.status == "in_progress",
            )
        ):
            old.status = "abandoned"
        attempt = (
            db.scalar(
                select(func.max(SimulationSession.attempt_number)).where(
                    SimulationSession.student_id == student.id,
                    SimulationSession.scenario_id == scenario.id,
                )
            )
            or 0
        ) + 1
        session = SimulationSession(
            student_id=student.id,
            scenario_id=scenario.id,
            attempt_number=attempt,
            status="in_progress",
            phase=phase,
            seed=make_seed(student.id, scenario.slug, attempt),
            state=state,
        )
        try:
            with db.begin_nested():
                db.add(session)
                db.flush()
            return session
        except IntegrityError:
            continue
    raise conflict("busy", "Please try again in a moment")


# ---------------------------------------------------------------------------
# Decisions
# ---------------------------------------------------------------------------


def _raw_decision(session: SimulationSession, decision_type: str) -> dict[str, Any]:
    for d in session.decisions:
        if d.decision_type == decision_type:
            return d.payload
    raise ApiError(500, "corrupt_session", f"Missing '{decision_type}' decision")


def _require(session: SimulationSession, phase: str, decision_type: str, got: str) -> None:
    if session.status != "in_progress":
        raise conflict(
            "session_closed", "This simulation is already finished. Start a new attempt."
        )
    if session.phase != phase or got != decision_type:
        raise conflict(
            "invalid_transition",
            f"Expected a '{decision_type}' decision in phase '{session.phase}', got '{got}'",
        )


def _budget(session: SimulationSession, dtype: str, payload: dict) -> tuple[dict, bool]:
    sc = budget.scenario_from_config(session.scenario.config)
    if session.phase == "allocate":
        _require(session, "allocate", "allocate", dtype)
        result = budget.evaluate_allocation(sc, payload.get("allocations", {}))
        event = budget.pick_event(sc, session.seed)
        session.state = {
            **session.state,
            "allocation": result.as_dict(),
            "event": {
                "key": event.key,
                "title": event.title,
                "description": event.description,
                "amount": float(event.amount),
                "kind": event.kind,
                "essential": event.essential,
            },
            "options": [o.as_dict() for o in budget.response_options(result, event)],
        }
        session.phase = "respond_event"
        return result.as_dict(), False
    _require(session, "respond_event", "respond_event", dtype)
    allocation = budget.evaluate_allocation(sc, _raw_decision(session, "allocate")["allocations"])
    event = budget.pick_event(sc, session.seed)
    outcome = budget.apply_event(sc, allocation, event, str(payload.get("response", "")))
    final = budget.final_score(allocation, outcome)
    session.result = {
        "allocation": allocation.as_dict(),
        "event": session.state["event"],
        "outcome": outcome.as_dict(),
        "score": final,
        "concept_evidence": {**allocation.concept_evidence, **outcome.concept_evidence},
    }
    session.score = final
    return outcome.as_dict(), True


def _savings(session: SimulationSession, dtype: str, payload: dict) -> tuple[dict, bool]:
    sc = savings.scenario_from_config(session.scenario.config)
    if session.phase == "plan":
        _require(session, "plan", "plan", dtype)
        plan = savings.parse_plan(sc, payload)
        session.state = {
            **session.state,
            "plan": plan.as_dict(),
            "before_event": savings.state_before_event(sc, plan),
            "event": {
                "month": sc.event_month,
                "title": sc.event_title,
                "description": sc.event_description,
                "amount": float(sc.event_amount),
            },
            "options": savings.event_options(sc, plan),
        }
        session.phase = "respond_event"
        return {"plan": plan.as_dict()}, False
    _require(session, "respond_event", "respond_event", dtype)
    plan = savings.parse_plan(sc, _raw_decision(session, "plan"))
    outcome = savings.resolve_event(sc, plan, str(payload.get("source", "")))
    session.result = {
        "plan": plan.as_dict(),
        "event": session.state["event"],
        **outcome.as_dict(),
    }
    session.score = outcome.score
    return {"score": outcome.score}, True


def _investing(session: SimulationSession, dtype: str, payload: dict) -> tuple[dict, bool]:
    cfg = session.scenario.config
    amount = Decimal(str(cfg["amount"]))

    def parse(raw: dict) -> tuple[dict[str, float], int]:
        horizon = raw.get("horizon_years")
        if horizon not in cfg["horizons"]:
            raise SimulationError(
                f"Choose a horizon of {', '.join(map(str, cfg['horizons']))} years",
                field="horizon_years",
            )
        return investing.parse_allocation(raw.get("allocation", {}), cfg["assets"]), int(horizon)

    if session.phase == "allocate":
        _require(session, "allocate", "allocate", dtype)
        weights, horizon = parse(payload)
        path = investing.pick_path(session.seed, horizon)
        if path is None:
            result = investing.evaluate_scenario(
                amount=amount,
                weights=weights,
                horizon=horizon,
                path_key=None,
                action=None,
                seed=session.seed,
            )
            session.result = {
                "allocation": payload["allocation"],
                "horizon_years": horizon,
                **result,
            }
            session.score = result["score"]
            return {"event": None}, True
        session.state = {
            **session.state,
            "allocation": payload["allocation"],
            "horizon_years": horizon,
            "event": investing.crash_event(amount, weights, horizon, path),
        }
        session.phase = "respond_event"
        return {"event": session.state["event"]}, False
    _require(session, "respond_event", "respond_event", dtype)
    weights, horizon = parse(_raw_decision(session, "allocate"))
    action = payload.get("action")
    if action not in ("hold", "sell_all", "rebalance"):
        raise SimulationError("action must be hold, sell_all or rebalance", field="action")
    result = investing.evaluate_scenario(
        amount=amount,
        weights=weights,
        horizon=horizon,
        path_key=session.state["event"]["path"],
        action=action,
        seed=session.seed,
    )
    session.result = {
        "allocation": session.state["allocation"],
        "horizon_years": horizon,
        "action": action,
        "event": session.state["event"],
        **result,
    }
    session.score = result["score"]
    return {"score": result["score"]}, True


def _safety(session: SimulationSession, dtype: str, payload: dict) -> tuple[dict, bool]:
    _require(session, "classify", "classify", dtype)
    messages = {m.id: m for m in safety.scenario_from_config(session.scenario.config)}
    msg_id = payload.get("message_id")
    if msg_id not in messages:
        raise SimulationError("Unknown message", field="message_id")
    answered = list(session.state.get("answered", []))
    if any(a["message_id"] == msg_id for a in answered):
        raise conflict("already_answered", "You already judged this message")
    evaluation = safety.evaluate_message(messages[msg_id], payload)
    answered.append(evaluation)
    session.state = {**session.state, "answered": answered}
    if len(answered) < len(messages):
        return evaluation, False
    summary = safety.summarize(answered)
    evidence: dict[str, bool] = {}
    for a in answered:
        for concept, ok in a["concept_evidence"].items():
            evidence[concept] = evidence.get(concept, True) and ok
    session.result = {**summary, "messages": answered, "concept_evidence": evidence}
    session.score = summary["score"]
    return evaluation, True


HANDLERS = {"budget": _budget, "savings": _savings, "investing": _investing, "safety": _safety}


def decide(
    db: Session, student: User, session: SimulationSession, dtype: str, payload: dict
) -> tuple[dict, list[str], int | None]:
    """Apply a decision. Returns (step outcome, newly earned achievements, previous best)."""
    if session.status != "in_progress":
        raise conflict(
            "session_closed", "This simulation is already finished. Start a new attempt."
        )
    step = len(session.decisions) + 1
    # Record the raw decision first so multi-step handlers can re-read it.
    decision = SimulationDecision(
        session_id=session.id, step=step, decision_type=dtype, payload=payload
    )
    session.decisions.append(decision)
    try:
        outcome, done = HANDLERS[session.scenario.kind](session, dtype, payload)
    except Exception:
        session.decisions.remove(decision)
        raise
    decision.outcome = outcome

    new_badges: list[str] = []
    previous_best = None
    if done:
        session.status = "completed"
        session.phase = "done"
        session.completed_at = datetime.now(UTC)
        previous_best = db.scalar(
            select(func.max(SimulationSession.score)).where(
                SimulationSession.student_id == student.id,
                SimulationSession.scenario_id == session.scenario_id,
                SimulationSession.status == "completed",
                SimulationSession.id != session.id,
            )
        )
        evidence = (session.result or {}).get("concept_evidence", {})
        mastery.record(db, student.id, mastery.simulation_evidence(evidence))
        new_badges = achievements.after_simulation(db, student, session, previous_best)
        issued = rewards.issue(
            db,
            student,
            reward_rules.simulation_awards(
                session.scenario.slug, session.scenario.kind, session.score, session.result or {}
            ),
            source_type="simulation",
            source_ref=str(session.id),
        )
        # JSON-safe summary kept with the result so the replay screen can show it.
        session.result = {
            **(session.result or {}),
            "rewards": [
                {k: e[k] for k in ("amount", "reason", "rule_key", "concept")} for e in issued
            ],
        }
    return outcome, new_badges, previous_best
