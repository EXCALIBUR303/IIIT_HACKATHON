"""Market Lab service: scenario practice with real company names and fictional money.

Every mutation locks the student's active session row, prices come only from the
seeded engine (the client never sends a price or total), and each request carries
a client ``request_id`` so a repeated submission is applied once. Rewards follow
the ledger rules: they recognise understanding (the debrief answer), never
profit, and each scenario's reward can be earned once.
"""

from __future__ import annotations

import zlib
from datetime import datetime
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from app.core.db import advisory_lock
from app.core.errors import ApiError
from app.engine import market_lab as lab
from app.engine.money import SimulationError
from app.market.providers import market_provider
from app.models import MarketLabSession, User, utcnow
from app.rewards.rules import AMOUNTS, Award

from . import rewards
from .portfolio import access

MAX_REQUEST_IDS = 120
VOL_REFERENCE = 0.021  # the most volatile company in the universe


# --- helpers ----------------------------------------------------------------------


def _check_request_id(request_id: object) -> str:
    if not isinstance(request_id, str) or not 8 <= len(request_id) <= 64:
        raise SimulationError("request_id must be 8-64 characters", field="request_id")
    return request_id


def _require_open(db: Session, student: User) -> dict[str, Any]:
    gate = access(db, student)
    if not gate["open"]:
        raise ApiError(403, "locked", gate["reason"])
    return gate


def _active(db: Session, student: User, *, lock: bool = False) -> MarketLabSession | None:
    q = select(MarketLabSession).where(
        MarketLabSession.student_id == student.id, MarketLabSession.status == "active"
    )
    return db.scalar(q.with_for_update() if lock else q)


def _latest(db: Session, student: User) -> MarketLabSession | None:
    """The active session, else the most recently finished one (to show its debrief)."""
    return _active(db, student) or db.scalar(
        select(MarketLabSession)
        .where(MarketLabSession.student_id == student.id, MarketLabSession.status == "completed")
        .order_by(MarketLabSession.completed_at.desc())
        .limit(1)
    )


def _seen(s: MarketLabSession, request_id: str) -> bool:
    return request_id in (s.state.get("request_ids") or [])


def _remember(s: MarketLabSession, request_id: str) -> None:
    ids = [*(s.state.get("request_ids") or []), request_id]
    s.state["request_ids"] = ids[-MAX_REQUEST_IDS:]


def _paths(s: MarketLabSession) -> dict[str, list[int]]:
    return lab.price_paths(lab.scenario(s.scenario_key), s.seed, s.state.get("anchors") or {})


def _holdings(s: MarketLabSession) -> dict[str, dict[str, int]]:
    return s.state.setdefault("holdings", {})


def _total(s: MarketLabSession, paths: dict[str, list[int]], step: int) -> int:
    return s.cash_paise + sum(h["qty"] * paths[k][step] for k, h in _holdings(s).items())


def _record_value(s: MarketLabSession, paths: dict[str, list[int]]) -> None:
    values = list(s.state.get("values") or [])
    total = _total(s, paths, s.step)
    if len(values) > s.step:
        values[s.step] = total
    else:
        values.extend([total] * (s.step + 1 - len(values)))
    s.state["values"] = values


def _weight_limit(gate: dict[str, Any]) -> int:
    return lab.MAX_WEIGHT_PCT_UNLOCKED if gate["single_company_unlocked"] else lab.MAX_WEIGHT_PCT


def _pct(new: float, old: float) -> float:
    return round((new - old) / old * 100, 2) if old else 0.0


# --- reads ----------------------------------------------------------------------------


def overview(db: Session, student: User) -> dict[str, Any]:
    gate = access(db, student)
    sessions = list(
        db.scalars(
            select(MarketLabSession)
            .where(MarketLabSession.student_id == student.id)
            .order_by(MarketLabSession.created_at.desc())
            .limit(200)
        )
    )
    cards = []
    for sc in lab.SCENARIOS.values():
        mine = [s for s in sessions if s.scenario_key == sc.key]
        done = [s for s in mine if s.status == "completed"]
        results = [s.state.get("result_pct") for s in done if s.state.get("result_pct") is not None]
        cards.append(
            {
                "key": sc.key,
                "title": sc.title,
                "kicker": sc.kicker,
                "summary": sc.summary,
                "skills": list(sc.skills),
                "steps": sc.steps,
                "unit": sc.unit,
                "focus": [lab.COMPANIES[k].name for k in sc.focus if k in lab.COMPANIES],
                "attempts": len(mine),
                "completed": len(done),
                "best_result_pct": max(results) if results else None,
                "understood": any(s.debrief_correct for s in done),
                "reward": AMOUNTS["market_debrief"],
            }
        )
    latest = _latest(db, student) if gate["open"] else None
    return {
        "access": gate,
        "disclaimer": lab.DISCLAIMER,
        "starting_cash_paise": lab.STARTING_CASH_PAISE,
        "max_weight_pct": _weight_limit(gate),
        "reasons": [{"key": k, "label": v} for k, v in lab.REASONS.items()],
        "wallet_balance": rewards.balance(db, student.id),
        "scenarios": cards,
        "session": view(db, student, latest, gate) if latest else None,
    }


def view(
    db: Session, student: User, s: MarketLabSession, gate: dict[str, Any] | None = None
) -> dict[str, Any]:
    gate = gate or access(db, student)
    sc = lab.scenario(s.scenario_key)
    paths = _paths(s)
    step = s.step
    holdings = _holdings(s)
    invested = sum(h["qty"] * paths[k][step] for k, h in holdings.items())
    total = s.cash_paise + invested
    prev_step = max(step - 1, 0)

    rows = []
    for key, h in sorted(holdings.items(), key=lambda kv: -kv[1]["qty"] * paths[kv[0]][step]):
        price, before = paths[key][step], paths[key][prev_step]
        value = h["qty"] * price
        rows.append(
            {
                "key": key,
                "name": lab.COMPANIES[key].name,
                "sector": lab.COMPANIES[key].sector,
                "quantity": h["qty"],
                "avg_cost_paise": h["cost"] // h["qty"],
                "price_paise": price,
                "value_paise": value,
                "day_change_paise": h["qty"] * (price - before),
                "day_change_pct": _pct(price, before),
                "pnl_paise": value - h["cost"],
                "pnl_pct": _pct(value, h["cost"]),
                "weight_pct": round(value / total * 100, 1) if total else 0.0,
            }
        )
    day_change = sum(r["day_change_paise"] for r in rows)

    values = list(s.state.get("values") or [total])[: step + 1]
    peak, max_dd = values[0], 0.0
    for v in values:
        peak = max(peak, v)
        max_dd = min(max_dd, (v - peak) / peak * 100 if peak else 0.0)
    drawdown = (values[-1] - max(values)) / max(values) * 100 if values and max(values) else 0.0
    keys = list(lab.COMPANIES)
    series = [
        {
            "step": i,
            "label": sc.label(i),
            "total_paise": values[i] if i < len(values) else total,
            "benchmark_paise": round(
                s.starting_cash_paise * sum(paths[k][i] / paths[k][0] for k in keys) / len(keys)
            ),
        }
        for i in range(step + 1)
    ]

    sectors: dict[str, int] = {}
    for r in rows:
        sectors[r["sector"]] = sectors.get(r["sector"], 0) + r["value_paise"]
    allocation = [
        {"label": name, "pct": round(v / total * 100, 1)}
        for name, v in sorted(sectors.items(), key=lambda kv: -kv[1])
    ]
    if total:
        allocation.append({"label": "Cash", "pct": round(s.cash_paise / total * 100, 1)})

    companies = []
    for key, c in lab.COMPANIES.items():
        hist = paths[key][: step + 1]
        companies.append(
            {
                "key": key,
                "name": c.name,
                "ticker": c.ticker,
                "sector": c.sector,
                "about": c.about,
                "risk_level": c.risk_level,
                "price_paise": hist[-1],
                "change_paise": hist[-1] - hist[max(len(hist) - 2, 0)],
                "change_pct": _pct(hist[-1], hist[max(len(hist) - 2, 0)]),
                "since_start_pct": _pct(hist[-1], hist[0]),
                "history_paise": hist,
                "held": holdings.get(key, {}).get("qty", 0),
                "in_focus": key in sc.focus or "*" in sc.focus,
            }
        )

    events = [
        {
            "step": e.step,
            "label": sc.label(e.step),
            "category": e.category,
            "headline": e.headline,
            "body": e.body,
            "why": e.why,
            "impact": e.impact,
            "affected": list(lab.COMPANIES) if "*" in e.affected else list(e.affected),
            "after": e.after if (e.after and step > e.step) else None,
            "is_new": e.step == step,
        }
        for e in lab.revealed_events(sc, step)
    ]

    recap = None
    if step > 0:
        moves = {k: _pct(paths[k][step], paths[k][step - 1]) for k in keys}
        best = max(moves, key=moves.__getitem__)
        worst = min(moves, key=moves.__getitem__)
        recap = {
            "label": sc.label(step),
            "market_pct": round(sum(moves.values()) / len(moves), 2),
            "portfolio_change_paise": series[step]["total_paise"] - series[step - 1]["total_paise"],
            "best": {"key": best, "name": lab.COMPANIES[best].name, "pct": moves[best]},
            "worst": {"key": worst, "name": lab.COMPANIES[worst].name, "pct": moves[worst]},
            "headlines": [e.headline for e in sc.events if e.step == step],
        }

    risk = _risk(rows, total, invested)
    journal = [_journal_out(sc, paths, step, j) for j in reversed(s.state.get("journal") or [])]
    actions_used = int((s.state.get("actions") or {}).get(str(step), 0))
    out: dict[str, Any] = {
        "id": str(s.id),
        "status": s.status,
        "scenario": {
            "key": sc.key,
            "title": sc.title,
            "kicker": sc.kicker,
            "summary": sc.summary,
            "lesson": sc.lesson if s.status == "completed" else None,
            "steps": sc.steps,
            "unit": sc.unit,
            "labels": [sc.label(i) for i in range(sc.steps)],
            "event_steps": sorted({e.step for e in sc.events}),
        },
        "step": step,
        "step_label": sc.label(step),
        "is_last_step": step >= sc.steps - 1,
        "reference": {
            "source": s.state.get("reference_source", "demo"),
            "as_of": s.state.get("reference_as_of"),
        },
        "cash_paise": s.cash_paise,
        "starting_cash_paise": s.starting_cash_paise,
        "invested_paise": invested,
        "total_paise": total,
        "pnl_paise": total - s.starting_cash_paise,
        "pnl_pct": _pct(total, s.starting_cash_paise),
        "day_change_paise": day_change,
        "day_change_pct": _pct(total, total - day_change) if step else 0.0,
        "drawdown_pct": round(drawdown, 2),
        "max_drawdown_pct": round(max_dd, 2),
        "risk": risk,
        "allocation": allocation,
        "holdings": rows,
        "companies": companies,
        "series": series,
        "events": events,
        "recap": recap,
        "journal": journal,
        "actions_left": max(lab.MAX_ACTIONS_PER_STEP - actions_used, 0),
        "max_weight_pct": _weight_limit(gate),
        "debrief": None,
    }
    if out["is_last_step"] or s.status == "completed":
        d = sc.debrief
        out["debrief"] = {
            "prompt": d.prompt,
            "options": [{"key": k, "text": t} for k, t in _rotated(sc.key, d.options)],
            "answer": s.state.get("answer"),
            "correct": s.debrief_correct,
            "correct_key": d.correct if s.status == "completed" else None,
            "explanation": d.explanation if s.status == "completed" else None,
            "reward": s.state.get("reward"),
        }
    return out


def _rotated(key: str, options: tuple[tuple[str, str], ...]) -> list[tuple[str, str]]:
    """A stable per-scenario order, so the right answer is not always in the same place."""
    r = zlib.crc32(key.encode()) % len(options)
    return [*options[r:], *options[:r]]


def _risk(rows: list[dict[str, Any]], total: int, invested: int) -> dict[str, Any]:
    if not invested or not total:
        return {
            "score": 0,
            "level": "Low",
            "top_weight_pct": 0.0,
            "note": "All cash: nothing can fall, but nothing grows either.",
        }
    vol = sum(r["value_paise"] * lab.COMPANIES[r["key"]].vol for r in rows) / invested
    top = max(r["weight_pct"] for r in rows)
    exposure = invested / total * vol / VOL_REFERENCE
    score = round(min(100, 100 * (0.55 * exposure + 0.45 * top / 100)))
    level = "Low" if score < 30 else "Moderate" if score < 55 else "High"
    if top >= 30:
        note = f"Your largest holding is {top:.0f}% of the portfolio. One bad headline would hurt."
    elif len(rows) >= 4:
        note = f"Spread across {len(rows)} companies, so one company's news matters less."
    else:
        note = "A few holdings: each company's news still moves you noticeably."
    return {"score": score, "level": level, "top_weight_pct": top, "note": note}


def _journal_out(
    sc: lab.Scenario, paths: dict[str, list[int]], step: int, j: dict[str, Any]
) -> dict[str, Any]:
    key, then = j.get("key"), j["step"]
    out = {
        **{k: j[k] for k in ("id", "step", "action", "key", "qty", "price_paise", "reason", "at")},
        "label": sc.label(then),
        "name": lab.COMPANIES[key].name if key in lab.COMPANIES else None,
        "reason_label": lab.REASONS.get(j["reason"], j["reason"]),
        "outcome": None,
    }
    if key not in lab.COMPANIES or step <= then:
        return out
    p0, p1 = j["price_paise"], paths[key][step]
    move = p1 - p0
    effect = j["qty"] * move
    action = j["action"]
    if action == "buy":
        text = (
            f"Since you bought, {lab.COMPANIES[key].name} moved {_pct(p1, p0):+.1f}%. Those "
            f"{j['qty']} shares are worth {_rupees(abs(effect))} "
            f"{'more' if effect >= 0 else 'less'}."
        )
    elif action == "sell":
        text = f"Since you sold, the price moved {_pct(p1, p0):+.1f}%. " + (
            f"Keeping them would have added {_rupees(effect)}."
            if move > 0
            else f"Selling avoided a {_rupees(-effect)} fall."
            if move < 0
            else "Selling made no difference so far."
        )
    else:
        text = f"Since you chose to hold, the price moved {_pct(p1, p0):+.1f}%" + (
            f", changing your position by {_rupees(effect, signed=True)}." if j["qty"] else "."
        )
    causes = [e.headline for e in lab.events_between(sc, then, step, key)]
    out["outcome"] = {
        "move_pct": _pct(p1, p0),
        "effect_paise": effect if action != "sell" else -effect,
        "text": text,
        "causes": causes or ["No big news: ordinary day-to-day ups and downs."],
    }
    return out


def _rupees(paise: int, *, signed: bool = False) -> str:
    sign = ("+" if paise > 0 else "−" if paise < 0 else "") if signed else ""
    return f"{sign}₹{abs(paise) / 100:,.2f}"


def entries_by_day(db: Session, student: User, since: datetime) -> list[dict[str, Any]]:
    """Journal entries made since ``since`` (for streaks and daily habits)."""
    out = []
    for s in db.scalars(
        select(MarketLabSession)
        .where(MarketLabSession.student_id == student.id, MarketLabSession.updated_at >= since)
        .limit(200)
    ):
        out.extend(j for j in s.state.get("journal") or [] if j.get("at", "") >= since.isoformat())
    return out


# --- writes ---------------------------------------------------------------------------


def start(db: Session, student: User, scenario_key: str, request_id: str) -> dict[str, Any]:
    request_id = _check_request_id(request_id)
    _require_open(db, student)
    sc = lab.scenario(scenario_key)
    advisory_lock(db, "market-lab", student.id)
    current = _active(db, student, lock=True)
    if current is not None and _seen(current, request_id):
        return overview(db, student)
    if current is not None:
        current.status = "abandoned"
        db.flush()
    attempt = 1 + int(
        db.scalar(
            select(func.count())
            .select_from(MarketLabSession)
            .where(
                MarketLabSession.student_id == student.id,
                MarketLabSession.scenario_key == sc.key,
            )
        )
        or 0
    )
    snapshot = market_provider().snapshot()
    anchors = lab.default_anchors()
    anchors.update({q["key"]: q["price_paise"] for q in snapshot["quotes"] if q["price_paise"]})
    s = MarketLabSession(
        student_id=student.id,
        scenario_key=sc.key,
        attempt_number=attempt,
        seed=lab.make_seed(student.id, sc.key, attempt),
        step=0,
        status="active",
        cash_paise=lab.STARTING_CASH_PAISE,
        starting_cash_paise=lab.STARTING_CASH_PAISE,
        state={
            "anchors": anchors,
            "reference_source": snapshot["status"],
            "reference_as_of": snapshot["as_of"],
            "holdings": {},
            "journal": [],
            "values": [lab.STARTING_CASH_PAISE],
            "actions": {},
            "request_ids": [request_id],
        },
    )
    db.add(s)
    db.flush()
    return overview(db, student)


def _locked_active(db: Session, student: User) -> MarketLabSession:
    _require_open(db, student)
    s = _active(db, student, lock=True)
    if s is None:
        raise ApiError(409, "no_session", "Start a scenario first.")
    return s


def decide(
    db: Session,
    student: User,
    *,
    request_id: str,
    action: str,
    company_key: str,
    quantity: int,
    reason: str,
    confirm: bool,
) -> dict[str, Any]:
    """Buy, sell or deliberately hold one company, with the reason behind it."""
    request_id = _check_request_id(request_id)
    if not confirm:
        raise ApiError(400, "confirmation_required", "Confirm the practice order first.")
    gate = _require_open(db, student)
    s = _locked_active(db, student)
    if _seen(s, request_id):
        return view(db, student, s, gate)
    if action not in ("buy", "sell", "hold"):
        raise SimulationError("Choose buy, sell or hold", field="action")
    if reason not in lab.REASONS:
        raise SimulationError("Pick the reason behind this decision", field="reason")
    c = lab.company(company_key)
    sc = lab.scenario(s.scenario_key)
    actions = s.state.setdefault("actions", {})
    if int(actions.get(str(s.step), 0)) >= lab.MAX_ACTIONS_PER_STEP:
        raise ApiError(
            409,
            "step_action_limit",
            f"You have made {lab.MAX_ACTIONS_PER_STEP} decisions this "
            f"{sc.unit}. Move on to see what the market does.",
        )
    paths = _paths(s)
    price = paths[c.key][s.step]
    holdings = _holdings(s)
    held = holdings.get(c.key, {"qty": 0, "cost": 0})

    if action == "hold":
        quantity = held["qty"]
    else:
        if (
            isinstance(quantity, bool)
            or not isinstance(quantity, int)
            or not 1 <= quantity <= lab.MAX_QUANTITY
        ):
            raise SimulationError("Enter a whole number of shares, at least 1", field="quantity")
        if action == "buy":
            cost = quantity * price
            if cost > s.cash_paise:
                raise ApiError(
                    409,
                    "insufficient_cash",
                    f"That costs {_rupees(cost)}, but you have {_rupees(s.cash_paise)} of practice "
                    "cash.",
                )
            total = _total(s, paths, s.step)
            limit = _weight_limit(gate)
            if (held["qty"] + quantity) * price * 100 > total * limit:
                most = max((total * limit // 100) // price - held["qty"], 0)
                raise ApiError(
                    409,
                    "concentration_limit",
                    f"One company can be at most {limit}% of your portfolio while you practise "
                    f"diversification. You can buy up to {most} more {c.name} shares.",
                    field="quantity",
                )
            s.cash_paise -= cost
            holdings[c.key] = {"qty": held["qty"] + quantity, "cost": held["cost"] + cost}
        else:
            if quantity > held["qty"]:
                raise ApiError(
                    409,
                    "insufficient_shares",
                    f"You hold {held['qty']} {c.name} shares.",
                    field="quantity",
                )
            s.cash_paise += quantity * price
            left = held["qty"] - quantity
            if left:
                holdings[c.key] = {"qty": left, "cost": held["cost"] * left // held["qty"]}
            else:
                holdings.pop(c.key, None)

    journal = s.state.setdefault("journal", [])
    journal.append(
        {
            "id": len(journal) + 1,
            "step": s.step,
            "action": action,
            "key": c.key,
            "qty": quantity,
            "price_paise": price,
            "reason": reason,
            "at": utcnow().isoformat(),
        }
    )
    actions[str(s.step)] = int(actions.get(str(s.step), 0)) + 1
    _record_value(s, paths)
    _remember(s, request_id)
    flag_modified(s, "state")
    db.flush()
    return view(db, student, s, gate)


def advance(db: Session, student: User, *, request_id: str) -> dict[str, Any]:
    request_id = _check_request_id(request_id)
    gate = _require_open(db, student)
    s = _locked_active(db, student)
    if _seen(s, request_id):
        return view(db, student, s, gate)
    sc = lab.scenario(s.scenario_key)
    if s.step >= sc.steps - 1:
        raise ApiError(409, "last_step", "This is the last step. Answer the debrief to finish.")
    s.step += 1
    paths = _paths(s)
    _record_value(s, paths)
    _remember(s, request_id)
    flag_modified(s, "state")
    db.flush()
    return view(db, student, s, gate)


def finish(db: Session, student: User, *, request_id: str, answer: str) -> dict[str, Any]:
    request_id = _check_request_id(request_id)
    gate = _require_open(db, student)
    advisory_lock(db, "market-lab", student.id)
    s = _active(db, student, lock=True)
    if s is None:
        latest = _latest(db, student)
        if latest is not None and _seen(latest, request_id):
            return view(db, student, latest, gate)
        raise ApiError(409, "no_session", "Start a scenario first.")
    sc = lab.scenario(s.scenario_key)
    if s.step < sc.steps - 1:
        raise ApiError(409, "not_finished", f"Play through to {sc.label(sc.steps - 1)} first.")
    if answer not in {k for k, _ in sc.debrief.options}:
        raise SimulationError("Choose one of the answers", field="answer")
    correct = answer == sc.debrief.correct
    paths = _paths(s)
    s.status = "completed"
    s.completed_at = utcnow()
    s.debrief_correct = correct
    s.state["answer"] = answer
    s.state["result_pct"] = _pct(_total(s, paths, s.step), s.starting_cash_paise)
    if correct:
        issued = rewards.issue(
            db,
            student,
            [
                Award(
                    rule_key="market_debrief",
                    amount=AMOUNTS["market_debrief"],
                    idempotency_key=f"market_debrief:{sc.key}",
                    reason=f"Explained the lesson of the '{sc.title}' scenario",
                    concept=None,
                )
            ],
            source_type="market_lab",
            source_ref=str(s.id),
        )
        s.state["reward"] = issued[0]["amount"] if issued else 0
    else:
        s.state["reward"] = 0
    _remember(s, request_id)
    flag_modified(s, "state")
    db.flush()
    return view(db, student, s, gate)
