"""Portfolio Quest service: persisted fictional portfolio with transactional accounting.

Every mutation runs inside the request's DB transaction with the portfolio row
locked (``SELECT ... FOR UPDATE``), prices are computed here from the seeded
engine (client-sent prices/totals are never accepted), and each request carries
a client ``request_id`` so a repeated submission is applied at most once.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.db import advisory_lock
from app.core.errors import ApiError, conflict
from app.engine import investing
from app.engine import portfolio as engine
from app.engine.money import SimulationError
from app.learning import stages
from app.models import (
    ConceptMastery,
    Portfolio,
    PortfolioHolding,
    PortfolioRoundSnapshot,
    PortfolioTransaction,
    Scenario,
    SimulationSession,
    User,
)

from . import rewards

DIVERSIFICATION_THRESHOLD = 0.6


# --- learning gates -----------------------------------------------------------


def access(db: Session, student: User) -> dict[str, Any]:
    """Whether Portfolio Quest (and single-company instruments) are unlocked, and why not."""
    stage = stages.stage_for(student.profile.grade if student.profile else None)
    info = stages.info(stage)
    investing_done = bool(
        db.scalar(
            select(func.count())
            .select_from(SimulationSession)
            .join(Scenario, Scenario.id == SimulationSession.scenario_id)
            .where(
                SimulationSession.student_id == student.id,
                SimulationSession.status == "completed",
                Scenario.kind == "investing",
            )
        )
    )
    row = db.get(ConceptMastery, (student.id, "diversification"))
    diversified = bool(row and row.mastery >= DIVERSIFICATION_THRESHOLD and row.weighted_total >= 2)
    if not info.portfolio_quest:
        reason = "Portfolio Quest opens in the Future Planner stage (Classes 11–12)."
    elif not investing_done:
        reason = "Finish one investing mission first so you know what risk and time horizon mean."
    else:
        reason = None
    return {
        "open": reason is None,
        "reason": reason,
        "single_company_unlocked": reason is None and diversified,
        "single_company_reason": None
        if diversified
        else "Show you understand diversification (investing quiz or missions) to unlock "
        "single-company instruments, which are much riskier.",
        "stage": stage,
    }


# --- state helpers -----------------------------------------------------------


def _get_locked(db: Session, student: User) -> Portfolio | None:
    return db.scalar(select(Portfolio).where(Portfolio.student_id == student.id).with_for_update())


def _holdings(p: Portfolio) -> dict[str, engine.Position]:
    return {h.instrument_key: engine.Position(h.quantity, h.cost_paise) for h in p.holdings}


def _log(
    db: Session,
    p: Portfolio,
    kind: str,
    request_id: str,
    amount: int = 0,
    instrument_key: str | None = None,
    quantity: int | None = None,
    price: int | None = None,
    note: str | None = None,
) -> PortfolioTransaction:
    tx = PortfolioTransaction(
        student_id=p.student_id,
        run_number=p.run_number,
        round=p.round,
        kind=kind,
        instrument_key=instrument_key,
        quantity=quantity,
        price_paise=price,
        amount_paise=amount,
        cash_after_paise=p.cash_paise,
        request_id=request_id,
        note=note,
    )
    db.add(tx)
    db.flush()
    return tx


def _tx_out(t: PortfolioTransaction) -> dict[str, Any]:
    return {
        "id": t.id,
        "run_number": t.run_number,
        "round": t.round,
        "kind": t.kind,
        "instrument_key": t.instrument_key,
        "quantity": t.quantity,
        "price_paise": t.price_paise,
        "amount_paise": t.amount_paise,
        "cash_after_paise": t.cash_after_paise,
        "note": t.note,
        "created_at": t.created_at,
    }


def _check_request_id(request_id: object) -> str:
    if not isinstance(request_id, str) or not 8 <= len(request_id) <= 64:
        raise SimulationError("request_id must be 8-64 characters", field="request_id")
    return request_id


def _already_processed(db: Session, student: User, request_id: str, kind: str) -> bool:
    existing = db.scalar(
        select(PortfolioTransaction).where(
            PortfolioTransaction.student_id == student.id,
            PortfolioTransaction.request_id == request_id,
        )
    )
    if existing is None:
        return False
    if existing.kind != kind:
        raise conflict("request_id_reused", "This request id was already used for another action.")
    return True


def _require_open(db: Session, student: User) -> dict[str, Any]:
    gate = access(db, student)
    if not gate["open"]:
        raise ApiError(403, "locked", gate["reason"])
    return gate


# --- reads ------------------------------------------------------------------


def view(db: Session, student: User, *, extra: dict[str, Any] | None = None) -> dict[str, Any]:
    gate = access(db, student)
    p = db.get(Portfolio, student.id)
    out: dict[str, Any] = {
        "access": gate,
        "disclaimer": engine.DISCLAIMER,
        "wallet_balance": rewards.balance(db, student.id),
        "transfer_cap_rupees": engine.MAX_TRANSFER_RUPEES_PER_RUN,
        "portfolio": None,
        "instruments": [],
        "transactions": [],
    }
    if p is None:
        out["instruments"] = _instruments(gate, None)
        return {**out, **(extra or {})}
    path = engine.path_for(p.seed)
    prices = engine.prices_at(path, p.round)
    val = engine.valuation(p.cash_paise, _holdings(p), prices, p.contributed_paise)
    transferred = _transferred_this_run(db, student, p.run_number)
    history = _value_history(db, student, p)
    out["portfolio"] = {
        "run_number": p.run_number,
        "round": p.round,
        "max_round": engine.MAX_ROUND,
        "complete": p.round >= engine.MAX_ROUND,
        "starting_cash_paise": p.starting_cash_paise,
        "transferred_paise": transferred,
        "transfer_remaining_rupees": max(
            engine.MAX_TRANSFER_RUPEES_PER_RUN - transferred // engine.PAISE_PER_RUPEE, 0
        ),
        "actions_this_round": _actions_this_round(db, student, p),
        "max_actions_per_round": get_settings().portfolio_max_actions_per_round,
        **val,
        "history": history,
        "years": _year_summaries(gate, p, path, val, history),
    }
    out["instruments"] = _instruments(gate, {k: v for k, v in prices.items()}, path, p.round)
    out["transactions"] = [
        _tx_out(t)
        for t in db.scalars(
            select(PortfolioTransaction)
            .where(PortfolioTransaction.student_id == student.id)
            .order_by(PortfolioTransaction.id.desc())
            .limit(30)
        )
    ]
    return {**out, **(extra or {})}


def _year_summaries(
    gate: dict[str, Any],
    p: Portfolio,
    path: str,
    current: dict[str, Any],
    history: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """What each completed year looked like (never a future year), from the stored snapshots."""
    accessible = [
        k
        for k, a in investing.ASSETS.items()
        if not a.single_company or gate["single_company_unlocked"]
    ]
    totals: dict[int, int] = {h["round"]: h["total_paise"] for h in history}
    totals[p.round] = int(current["total_paise"])
    out = []
    for rnd in range(1, p.round + 1):
        before = totals.get(rnd - 1, p.starting_cash_paise)
        after = totals.get(rnd, before)
        out.append(engine.year_summary(path, rnd, before, after, accessible))
    return out


def _transferred_this_run(db: Session, student: User, run_number: int) -> int:
    return int(
        db.scalar(
            select(func.coalesce(func.sum(PortfolioTransaction.amount_paise), 0)).where(
                PortfolioTransaction.student_id == student.id,
                PortfolioTransaction.run_number == run_number,
                PortfolioTransaction.kind == "transfer_in",
            )
        )
        or 0
    )


def _value_history(db: Session, student: User, p: Portfolio) -> list[dict[str, Any]]:
    """Total value at the end of each round reached: at most 11 persisted rows per run."""
    rows = _snapshot_rows(db, student, p)
    if not rows and p.round >= 0:
        _backfill_snapshots(db, student, p)  # a run from before snapshots existed
        rows = _snapshot_rows(db, student, p)
    return [{"round": r.round, "total_paise": r.total_paise} for r in rows]


def _snapshot_rows(db: Session, student: User, p: Portfolio) -> list[PortfolioRoundSnapshot]:
    return list(
        db.scalars(
            select(PortfolioRoundSnapshot)
            .where(
                PortfolioRoundSnapshot.student_id == student.id,
                PortfolioRoundSnapshot.run_number == p.run_number,
            )
            .order_by(PortfolioRoundSnapshot.round)
        )
    )


def _record_snapshot(db: Session, p: Portfolio) -> None:
    """Remember the portfolio's total value for the current round (latest action wins)."""
    prices = engine.prices_at(engine.path_for(p.seed), p.round)
    total = int(
        engine.valuation(p.cash_paise, _holdings(p), prices, p.contributed_paise)["total_paise"]
    )  # type: ignore[call-overload]
    stmt = pg_insert(PortfolioRoundSnapshot).values(
        student_id=p.student_id,
        run_number=p.run_number,
        round=p.round,
        total_paise=total,
        cash_paise=p.cash_paise,
    )
    db.execute(
        stmt.on_conflict_do_update(
            index_elements=["student_id", "run_number", "round"],
            set_={"total_paise": stmt.excluded.total_paise, "cash_paise": stmt.excluded.cash_paise},
        )
    )


def _backfill_snapshots(db: Session, student: User, p: Portfolio) -> None:
    """One-off: rebuild a pre-snapshot run from its log (bounded), then never again."""
    path = engine.path_for(p.seed)
    txs = db.scalars(
        select(PortfolioTransaction)
        .where(
            PortfolioTransaction.student_id == student.id,
            PortfolioTransaction.run_number == p.run_number,
        )
        .order_by(PortfolioTransaction.id)
        .limit(5000)
    )
    holdings: dict[str, int] = {}
    snapshots: dict[int, tuple[int, int]] = {}
    for t in txs:
        cash = t.cash_after_paise
        if t.kind == "buy" and t.instrument_key:
            holdings[t.instrument_key] = holdings.get(t.instrument_key, 0) + (t.quantity or 0)
        elif t.kind == "sell" and t.instrument_key:
            holdings[t.instrument_key] = holdings.get(t.instrument_key, 0) - (t.quantity or 0)
        prices = engine.prices_at(path, t.round)
        snapshots[t.round] = (cash + sum(q * prices[k] for k, q in holdings.items()), cash)
    for rnd, (total, cash) in snapshots.items():
        stmt = pg_insert(PortfolioRoundSnapshot).values(
            student_id=student.id, run_number=p.run_number, round=rnd, total_paise=total,
            cash_paise=cash,
        )  # fmt: skip
        db.execute(stmt.on_conflict_do_nothing())


def _actions_this_round(db: Session, student: User, p: Portfolio) -> int:
    """Buys, sells and wallet transfers made in the current fictional year of this run."""
    return int(
        db.scalar(
            select(func.count())
            .select_from(PortfolioTransaction)
            .where(
                PortfolioTransaction.student_id == student.id,
                PortfolioTransaction.run_number == p.run_number,
                PortfolioTransaction.round == p.round,
                PortfolioTransaction.kind.in_(("buy", "sell", "transfer_in")),
            )
        )
        or 0
    )


def _require_action_budget(db: Session, student: User, p: Portfolio) -> None:
    """Cap how many trades fit in one year, so a run's history stays small and meaningful."""
    cap = get_settings().portfolio_max_actions_per_round
    if _actions_this_round(db, student, p) >= cap:
        raise ApiError(
            409,
            "round_action_limit",
            f"You have made {cap} changes this year, which is the most allowed. "
            "Move to the next year to keep going.",
        )


def _instruments(
    gate: dict[str, Any],
    prices: dict[str, int] | None,
    path: str | None = None,
    round_no: int = 0,
) -> list[dict[str, Any]]:
    out = []
    for key, asset in investing.ASSETS.items():
        locked = asset.single_company and not gate["single_company_unlocked"]
        entry: dict[str, Any] = {
            "key": key,
            "label": asset.label,
            "description": asset.description,
            "risk_level": asset.risk_level,
            "single_company": asset.single_company,
            "locked": locked,
            "lock_reason": gate["single_company_reason"] if locked else None,
            "price_paise": prices[key] if prices else engine.BASE_PRICE_PAISE,
        }
        if prices and path:
            # Only the prices already "lived through": the future is never revealed.
            entry["price_history_paise"] = engine.price_series(key, path)[: round_no + 1]
        out.append(entry)
    return out


def transactions(
    db: Session, student: User, limit: int = 100, before_id: int | None = None
) -> list[dict[str, Any]]:
    """Newest first. Pass the last id you received as ``before_id`` to get the next page."""
    query = select(PortfolioTransaction).where(PortfolioTransaction.student_id == student.id)
    if before_id is not None:
        query = query.where(PortfolioTransaction.id < before_id)
    return [
        _tx_out(t)
        for t in db.scalars(query.order_by(PortfolioTransaction.id.desc()).limit(min(limit, 500)))
    ]


# --- writes -----------------------------------------------------------------


def open_portfolio(db: Session, student: User, request_id: str) -> dict[str, Any]:
    request_id = _check_request_id(request_id)
    advisory_lock(db, "portfolio-open", student.id)
    _require_open(db, student)
    if db.get(Portfolio, student.id) is not None:
        return view(db, student)
    cash = get_settings().portfolio_starting_cash_rupees * engine.PAISE_PER_RUPEE
    p = Portfolio(
        student_id=student.id,
        cash_paise=cash,
        starting_cash_paise=cash,
        contributed_paise=cash,
        run_number=1,
        seed=engine.make_seed(student.id, 1),
        round=0,
    )
    db.add(p)
    db.flush()
    _log(db, p, "open", request_id, amount=cash, note="Practice cash provided to start the run")
    _record_snapshot(db, p)
    return view(db, student)


def _locked_portfolio(db: Session, student: User) -> Portfolio:
    _require_open(db, student)
    p = _get_locked(db, student)
    if p is None:
        raise ApiError(409, "not_opened", "Open Portfolio Quest first.")
    return p


def quote(
    db: Session, student: User, instrument_key: str, side: str, quantity: object
) -> dict[str, Any]:
    gate = _require_open(db, student)
    p = db.get(Portfolio, student.id)
    if p is None:
        raise ApiError(409, "not_opened", "Open Portfolio Quest first.")
    qty = engine.parse_quantity(quantity)
    asset = _asset(instrument_key)
    price = engine.price_at(instrument_key, engine.path_for(p.seed), p.round)
    holdings = _holdings(p)
    total = price * qty
    warnings: list[str] = []
    if side == "buy":
        engine.check_buy(p.cash_paise, price, qty)
        if asset.single_company:
            _require_single_company(gate)
            warnings.append(
                "This is a single fictional company. It can swing 40% or more in a year."
            )
        cash_after = p.cash_paise - total
        prices = engine.prices_at(engine.path_for(p.seed), p.round)
        projected = dict(holdings)
        projected[instrument_key] = engine.apply_buy(holdings.get(instrument_key), qty, total)
        rows = engine.valuation(cash_after, projected, prices, p.contributed_paise)["holdings"]
        if engine.single_company_share(rows) > 0.5:  # type: ignore[arg-type]
            warnings.append(
                "After this, over half your invested money would be in single companies."
            )
    elif side == "sell":
        engine.check_sell(holdings.get(instrument_key), qty)
        cash_after = p.cash_paise + total
    else:
        raise SimulationError("side must be buy or sell", field="side")
    return {
        "instrument_key": instrument_key,
        "label": asset.label,
        "side": side,
        "quantity": qty,
        "price_paise": price,
        "total_paise": total,
        "cash_after_paise": cash_after,
        "warnings": warnings,
        "disclaimer": engine.DISCLAIMER,
    }


def _asset(key: str) -> investing.Asset:
    if key not in investing.ASSETS:
        raise SimulationError("Unknown instrument", field="instrument_key")
    return investing.ASSETS[key]


def _require_single_company(gate: dict[str, Any]) -> None:
    if not gate["single_company_unlocked"]:
        raise ApiError(403, "locked", gate["single_company_reason"])


def trade(
    db: Session,
    student: User,
    *,
    request_id: str,
    instrument_key: str,
    side: str,
    quantity: object,
    confirm: bool,
) -> dict[str, Any]:
    request_id = _check_request_id(request_id)
    if confirm is not True:
        raise SimulationError("Please confirm the trade first.", code="confirmation_required")
    if side not in ("buy", "sell"):
        raise SimulationError("side must be buy or sell", field="side")
    gate = _require_open(db, student)
    p = _locked_portfolio(db, student)
    if _already_processed(db, student, request_id, side):
        return view(db, student, extra={"replayed": True})
    _require_action_budget(db, student, p)
    qty = engine.parse_quantity(quantity)
    asset = _asset(instrument_key)
    price = engine.price_at(instrument_key, engine.path_for(p.seed), p.round)
    holdings = {h.instrument_key: h for h in p.holdings}
    if side == "buy":
        if asset.single_company:
            _require_single_company(gate)
        cost = engine.check_buy(p.cash_paise, price, qty)
        pos = engine.apply_buy(_as_pos(holdings.get(instrument_key)), qty, cost)
        p.cash_paise -= cost
        _upsert_holding(db, p, holdings.get(instrument_key), instrument_key, pos)
        _log(db, p, "buy", request_id, -cost, instrument_key, qty, price)
    else:
        current = _as_pos(holdings.get(instrument_key))
        engine.check_sell(current, qty)
        assert current is not None
        remaining, _released = engine.apply_sell(current, qty)
        proceeds = price * qty
        p.cash_paise += proceeds
        _upsert_holding(db, p, holdings.get(instrument_key), instrument_key, remaining)
        _log(db, p, "sell", request_id, proceeds, instrument_key, qty, price)
    db.flush()
    db.refresh(p)
    _record_snapshot(db, p)
    return view(db, student)


def _as_pos(h: PortfolioHolding | None) -> engine.Position | None:
    return engine.Position(h.quantity, h.cost_paise) if h else None


def _upsert_holding(
    db: Session,
    p: Portfolio,
    existing: PortfolioHolding | None,
    key: str,
    pos: engine.Position | None,
) -> None:
    if pos is None:
        if existing is not None:
            db.delete(existing)
        return
    if existing is None:
        db.add(
            PortfolioHolding(
                student_id=p.student_id,
                instrument_key=key,
                quantity=pos.quantity,
                cost_paise=pos.cost_paise,
            )
        )
    else:
        existing.quantity = pos.quantity
        existing.cost_paise = pos.cost_paise


def advance(db: Session, student: User, *, request_id: str, confirm: bool) -> dict[str, Any]:
    request_id = _check_request_id(request_id)
    if confirm is not True:
        raise SimulationError(
            "Please confirm moving to the next year.", code="confirmation_required"
        )
    p = _locked_portfolio(db, student)
    if _already_processed(db, student, request_id, "advance"):
        return view(db, student, extra={"replayed": True})
    if p.round >= engine.MAX_ROUND:
        raise conflict("run_complete", "This run has finished. Reset to practise again.")
    path = engine.path_for(p.seed)
    before = engine.valuation(
        p.cash_paise, _holdings(p), engine.prices_at(path, p.round), p.contributed_paise
    )
    p.round += 1
    after = engine.valuation(
        p.cash_paise, _holdings(p), engine.prices_at(path, p.round), p.contributed_paise
    )
    event = engine.year_event(path, p.round)
    _log(db, p, "advance", request_id, 0, note=str(event["headline"])[:200])
    db.flush()
    _record_snapshot(db, p)
    return view(
        db,
        student,
        extra={"event": {**event, "reflection": engine.reflection_lines(before, after, event)}},
    )


def reset(db: Session, student: User, *, request_id: str, confirm: bool) -> dict[str, Any]:
    request_id = _check_request_id(request_id)
    if confirm is not True:
        raise SimulationError("Please confirm the reset.", code="confirmation_required")
    p = _locked_portfolio(db, student)
    if _already_processed(db, student, request_id, "reset"):
        return view(db, student, extra={"replayed": True})
    for h in list(p.holdings):
        db.delete(h)
    p.run_number += 1
    p.seed = engine.make_seed(student.id, p.run_number)
    p.round = 0
    p.cash_paise = p.starting_cash_paise
    p.contributed_paise = p.starting_cash_paise
    db.flush()
    _log(
        db,
        p,
        "reset",
        request_id,
        p.cash_paise,
        note="Practice reset: a new market run. Earlier transfers are not refunded.",
    )
    db.refresh(p)
    _record_snapshot(db, p)
    return view(db, student)


def transfer_in(
    db: Session, student: User, *, request_id: str, amount: object, confirm: bool
) -> dict[str, Any]:
    request_id = _check_request_id(request_id)
    if confirm is not True:
        raise SimulationError("Please confirm the transfer.", code="confirmation_required")
    p = _locked_portfolio(db, student)
    if _already_processed(db, student, request_id, "transfer_in"):
        return view(db, student, extra={"replayed": True})
    _require_action_budget(db, student, p)
    if isinstance(amount, bool) or not isinstance(amount, int) or amount < 1:
        raise SimulationError("Amount must be a whole number of rupees", field="amount")
    used = _transferred_this_run(db, student, p.run_number) // engine.PAISE_PER_RUPEE
    if used + amount > engine.MAX_TRANSFER_RUPEES_PER_RUN:
        raise SimulationError(
            f"You can move at most ₹{engine.MAX_TRANSFER_RUPEES_PER_RUN:,} per run "
            f"(₹{engine.MAX_TRANSFER_RUPEES_PER_RUN - used:,} left).",
            code="transfer_cap",
            field="amount",
        )
    rewards.debit_transfer(db, student, amount, request_id=request_id, run_number=p.run_number)
    paise = amount * engine.PAISE_PER_RUPEE
    p.cash_paise += paise
    p.contributed_paise += paise
    _log(db, p, "transfer_in", request_id, paise, note="From learning wallet (one-way)")
    db.flush()
    _record_snapshot(db, p)
    return view(db, student)
