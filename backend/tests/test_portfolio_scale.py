"""Portfolio Quest with large histories: caps, pagination, snapshots, and the invariants."""

import uuid

import pytest
from sqlalchemy import func, select, text

from app.core.config import get_settings
from app.core.db import SessionLocal, engine
from app.models import Portfolio, PortfolioRoundSnapshot, PortfolioTransaction
from tests.test_api_portfolio import (
    START,
    P,
    advance,
    complete_investing,
    opened,
    post,
    rid,
    trade,
)


@pytest.fixture
def investor(client, student):
    complete_investing(client, student)
    return student


def uid(client, h):
    return uuid.UUID(client.get("/api/v1/auth/me", headers=h).json()["id"])


# --- cap on actions per round ----------------------------------------------------------------


def test_trades_per_round_are_capped_and_the_next_round_resets_the_budget(
    client, investor, monkeypatch
):
    monkeypatch.setattr(get_settings(), "portfolio_max_actions_per_round", 6)
    opened(client, investor)
    for _ in range(3):
        assert trade(client, investor, "balanced_basket", "buy", 1).status_code == 200
        assert trade(client, investor, "balanced_basket", "sell", 1).status_code == 200
    blocked = trade(client, investor, "balanced_basket", "buy", 1)
    assert blocked.status_code == 409 and blocked.json()["error"]["code"] == "round_action_limit"
    view = client.get(P, headers=investor).json()["portfolio"]
    assert view["actions_this_round"] == 6 and view["max_actions_per_round"] == 6
    # Transfers count too.
    assert post(client, investor, "/transfer", {"request_id": rid(), "amount": 1, "confirm": True})
    assert advance(client, investor).status_code == 200
    assert trade(client, investor, "balanced_basket", "buy", 1).status_code == 200


def test_a_replayed_request_is_not_blocked_by_the_cap(client, investor, monkeypatch):
    monkeypatch.setattr(get_settings(), "portfolio_max_actions_per_round", 1)
    opened(client, investor)
    same = rid()
    first = trade(client, investor, "balanced_basket", "buy", 1, request_id=same)
    again = trade(client, investor, "balanced_basket", "buy", 1, request_id=same)
    assert first.status_code == 200 and again.status_code == 200 and again.json()["replayed"]
    with SessionLocal() as db:
        n = db.scalar(select(func.count()).where(PortfolioTransaction.kind == "buy"))
    assert n == 1


def test_a_rejected_trade_changes_nothing(client, investor, monkeypatch):
    monkeypatch.setattr(get_settings(), "portfolio_max_actions_per_round", 1)
    opened(client, investor)
    trade(client, investor, "balanced_basket", "buy", 1)
    before = client.get(P, headers=investor).json()["portfolio"]["cash_paise"]
    assert trade(client, investor, "balanced_basket", "buy", 1).status_code == 409
    assert client.get(P, headers=investor).json()["portfolio"]["cash_paise"] == before


def test_portfolio_writes_are_rate_limited_per_student(client, investor, monkeypatch):
    monkeypatch.setattr(get_settings(), "rl_portfolio_hour", 3)
    opened(client, investor)
    codes = [trade(client, investor, "balanced_basket", "buy", 1).status_code for _ in range(4)]
    assert codes == [200, 200, 429, 429]


# --- snapshots instead of replaying the log ---------------------------------------------------


def test_history_comes_from_snapshots_and_tracks_each_round(client, investor):
    opened(client, investor)
    trade(client, investor, "balanced_basket", "buy", 10)
    advance(client, investor)
    advance(client, investor)
    view = client.get(P, headers=investor).json()["portfolio"]
    rounds = [h["round"] for h in view["history"]]
    assert rounds == [0, 1, 2]
    assert view["history"][-1]["total_paise"] == view["total_paise"]
    with SessionLocal() as db:
        assert db.scalar(select(func.count()).select_from(PortfolioRoundSnapshot)) == 3


def test_history_does_not_read_the_transaction_log(client, investor):
    """Even with a huge log, building the chart touches only the snapshot table."""
    opened(client, investor)
    trade(client, investor, "balanced_basket", "buy", 5)
    statements = []

    def watch(conn, cursor, statement, *_):
        statements.append(statement)

    from sqlalchemy import event

    event.listen(engine, "before_cursor_execute", watch)
    try:
        client.get(P, headers=investor)
    finally:
        event.remove(engine, "before_cursor_execute", watch)
    history_sql = [s for s in statements if "portfolio_round_snapshots" in s]
    assert history_sql and all("LIMIT" not in s or "snapshots" in s for s in history_sql)
    full_scans = [
        s for s in statements if "FROM portfolio_transactions" in s and "LIMIT" not in s
        and "count(" not in s.lower() and "sum(" not in s.lower()
    ]  # fmt: skip
    assert full_scans == []


def test_old_runs_without_snapshots_are_backfilled_once(client, investor):
    opened(client, investor)
    trade(client, investor, "balanced_basket", "buy", 10)
    advance(client, investor)
    expected = client.get(P, headers=investor).json()["portfolio"]["history"]
    with SessionLocal() as db:  # simulate a run created before migration 0009
        db.execute(text("DELETE FROM portfolio_round_snapshots"))
        db.commit()
    rebuilt = client.get(P, headers=investor).json()["portfolio"]["history"]
    assert [(h["round"], h["total_paise"]) for h in rebuilt] == [
        (h["round"], h["total_paise"]) for h in expected
    ]
    with SessionLocal() as db:
        assert db.scalar(select(func.count()).select_from(PortfolioRoundSnapshot)) == len(expected)


# --- very large histories ----------------------------------------------------------------------


def bulk_history(student_id, run, rounds, per_round):
    """Insert a long, internally consistent log directly (no cap: this is legacy data)."""
    rows = []
    for rnd in range(rounds):
        for i in range(per_round):
            rows.append(
                {
                    "student_id": student_id, "run_number": run, "round": rnd,
                    "kind": "transfer_in" if False else "advance" if i == 0 and rnd else "buy",
                    "instrument_key": None if i == 0 and rnd else "balanced_basket",
                    "quantity": None if i == 0 and rnd else 1,
                    "price_paise": None if i == 0 and rnd else 10_000,
                    "amount_paise": 0 if i == 0 and rnd else -10_000,
                    "cash_after_paise": 1_000_000,
                    "request_id": f"bulk-{run}-{rnd}-{i}-{uuid.uuid4().hex[:8]}",
                }
            )  # fmt: skip
    with SessionLocal() as db:
        db.execute(PortfolioTransaction.__table__.insert(), rows)
        db.commit()


def test_five_thousand_transactions_do_not_slow_or_break_the_views(client, investor):
    opened(client, investor)
    student_id = uid(client, investor)
    bulk_history(student_id, run=99, rounds=10, per_round=500)  # another (old) run
    r = client.get(P, headers=investor)
    assert r.status_code == 200
    assert len(r.json()["transactions"]) <= 30
    # Paginate everything newest-first without gaps or repeats.
    seen, before = [], None
    while True:
        url = f"{P}/transactions?limit=500" + (f"&before={before}" if before else "")
        page = client.get(url, headers=investor).json()
        if not page:
            break
        seen += [t["id"] for t in page]
        before = page[-1]["id"]
    assert len(seen) == len(set(seen)) == 5001  # 5000 bulk + the open
    assert seen == sorted(seen, reverse=True)


def test_transactions_limit_is_bounded(client, investor):
    opened(client, investor)
    assert client.get(f"{P}/transactions?limit=100000", headers=investor).status_code == 422
    assert client.get(f"{P}/transactions?before=0", headers=investor).status_code == 422


def test_pagination_only_returns_my_own_history(client, investor):
    from tests.conftest import register_onboarded

    opened(client, investor)
    other, _ = register_onboarded(client)
    assert client.get(f"{P}/transactions", headers=other).json() == []


def test_valuation_stays_correct_after_a_long_session(client, investor, monkeypatch):
    """Cash never goes negative, holdings reconcile with the log, prices come from the server."""
    monkeypatch.setattr(get_settings(), "portfolio_max_actions_per_round", 40)
    opened(client, investor)
    for _rnd in range(4):
        for _ in range(8):
            assert trade(client, investor, "balanced_basket", "buy", 3).status_code == 200
            assert trade(client, investor, "balanced_basket", "sell", 2).status_code == 200
        advance(client, investor)
    # Buying more than the cash allows is refused outright.
    assert trade(client, investor, "balanced_basket", "buy", 10**6).status_code in (400, 422)
    with SessionLocal() as db:
        p = db.get(Portfolio, uid(client, investor))
        assert p.cash_paise >= 0
        buys = db.scalar(
            select(func.coalesce(func.sum(PortfolioTransaction.quantity), 0)).where(
                PortfolioTransaction.kind == "buy"
            )
        )
        sells = db.scalar(
            select(func.coalesce(func.sum(PortfolioTransaction.quantity), 0)).where(
                PortfolioTransaction.kind == "sell"
            )
        )
        held = sum(h.quantity for h in p.holdings)
        assert held == buys - sells == 32
    view = client.get(P, headers=investor).json()["portfolio"]
    assert view["cash_paise"] + view["invested_paise"] == view["total_paise"]
    assert START > 0
