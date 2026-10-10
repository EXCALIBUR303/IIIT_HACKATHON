"""Portfolio Quest API: gates, accounting, idempotency, concurrency, isolation."""

import uuid
from concurrent.futures import ThreadPoolExecutor

from sqlalchemy import func, select

from app.core.db import SessionLocal
from app.models import Portfolio, PortfolioHolding, PortfolioTransaction, RewardLedgerEntry
from tests.conftest import (
    answer_all,
    complete_budget,
    delete_account,
    register_educator,
    register_onboarded,
    register_student,
)

P = "/api/v1/portfolio"
SESSIONS = "/api/v1/simulations/sessions"
START = 10_000 * 100


def rid():
    return uuid.uuid4().hex


def post(client, h, path, body):
    return client.post(f"{P}{path}", headers=h, json=body)


def complete_investing(client, h):
    s = client.post(SESSIONS, headers=h, json={"scenario_slug": "investing-time-horizon"}).json()
    r = client.post(
        f"{SESSIONS}/{s['id']}/decisions",
        headers=h,
        json={
            "type": "allocate",
            "payload": {
                "allocation": {"steady_deposit": 30, "balanced_basket": 40, "growth_basket": 30},
                "horizon_years": 10,
            },
        },
    )
    assert r.status_code == 200, r.text
    if r.json()["phase"] == "respond_event":
        r = client.post(
            f"{SESSIONS}/{s['id']}/decisions",
            headers=h,
            json={"type": "respond_event", "payload": {"action": "hold"}},
        )
        assert r.status_code == 200, r.text


def opened(client, h):
    r = post(client, h, "/open", {"request_id": rid()})
    assert r.status_code == 200, r.text
    return r.json()


def trade(client, h, key, side, qty, confirm=True, request_id=None):
    return post(
        client,
        h,
        "/trades",
        {
            "request_id": request_id or rid(),
            "instrument_key": key,
            "side": side,
            "quantity": qty,
            "confirm": confirm,
        },
    )


def advance(client, h, request_id=None):
    return post(client, h, "/advance", {"request_id": request_id or rid(), "confirm": True})


import pytest  # noqa: E402


@pytest.fixture
def investor(client, student):
    complete_investing(client, student)
    return student


# --- gates -------------------------------------------------------------------


def test_locked_until_an_investing_mission_is_done(client, student):
    view = client.get(P, headers=student).json()
    assert view["access"]["open"] is False and "investing mission" in view["access"]["reason"]
    assert view["portfolio"] is None
    r = post(client, student, "/open", {"request_id": rid()})
    assert r.status_code == 403 and r.json()["error"]["code"] == "locked"


def test_explorer_and_builder_stages_cannot_open_portfolio_quest(client):
    h, _ = register_student(client)
    client.put("/api/v1/students/me/profile", headers=h, json={"grade": 8})
    view = client.get(P, headers=h).json()
    assert view["access"]["open"] is False and "Future Planner" in view["access"]["reason"]
    assert post(client, h, "/open", {"request_id": rid()}).status_code == 403


def test_single_company_instruments_need_demonstrated_diversification(client, investor):
    opened(client, investor)
    view = client.get(P, headers=investor).json()
    locked = {i["key"] for i in view["instruments"] if i["locked"]}
    assert locked == {"zippy_gadgets", "sunrise_solar"}
    r = trade(client, investor, "zippy_gadgets", "buy", 1)
    assert r.status_code == 403 and r.json()["error"]["code"] == "locked"
    answer_all(client, investor, "quiz-understand-investing", correct=True)
    answer_all(client, investor, "initial", correct=True)
    unlocked = client.get(P, headers=investor).json()["access"]["single_company_unlocked"]
    assert unlocked
    assert trade(client, investor, "zippy_gadgets", "buy", 1).status_code == 200


# --- opening and accounting ----------------------------------------------------


def test_open_creates_default_cash_and_is_idempotent(client, investor):
    first = opened(client, investor)["portfolio"]
    assert first["cash_paise"] == START and first["round"] == 0 and first["run_number"] == 1
    assert first["invested_paise"] == 0 and first["gain_paise"] == 0
    second = opened(client, investor)["portfolio"]
    assert second["cash_paise"] == START
    with SessionLocal() as db:
        assert db.scalar(select(func.count()).select_from(Portfolio)) == 1


def test_buy_updates_cash_holdings_and_logs_a_transaction(client, investor):
    opened(client, investor)
    v = trade(client, investor, "balanced_basket", "buy", 10).json()["portfolio"]
    assert v["cash_paise"] == START - 10 * 10_000
    row = v["holdings"][0]
    assert row["instrument_key"] == "balanced_basket" and row["quantity"] == 10
    assert row["cost_paise"] == 100_000 and row["value_paise"] == 100_000 and row["gain_paise"] == 0
    tx = client.get(f"{P}/transactions", headers=investor).json()[0]
    assert tx["kind"] == "buy" and tx["amount_paise"] == -100_000
    assert tx["cash_after_paise"] == v["cash_paise"] and tx["quantity"] == 10


def test_sell_returns_cash_and_clears_the_holding(client, investor):
    opened(client, investor)
    trade(client, investor, "steady_deposit", "buy", 5)
    v = trade(client, investor, "steady_deposit", "sell", 5).json()["portfolio"]
    assert v["cash_paise"] == START and v["holdings"] == []
    with SessionLocal() as db:
        assert db.scalar(select(func.count()).select_from(PortfolioHolding)) == 0


@pytest.mark.parametrize("qty", [0, -3, 1.5, "2", None])
def test_invalid_quantity_is_rejected_without_changing_state(client, investor, qty):
    opened(client, investor)
    r = trade(client, investor, "steady_deposit", "buy", qty)
    assert r.status_code == 422
    assert client.get(P, headers=investor).json()["portfolio"]["cash_paise"] == START


def test_insufficient_funds_rejected_and_cash_never_negative(client, investor):
    opened(client, investor)
    r = trade(client, investor, "steady_deposit", "buy", 101)  # 101 x ₹100 > ₹10,000
    assert r.status_code == 422 and r.json()["error"]["code"] == "insufficient_funds"
    assert client.get(P, headers=investor).json()["portfolio"]["cash_paise"] == START
    assert trade(client, investor, "steady_deposit", "buy", 100).status_code == 200  # exact cash


def test_overselling_and_selling_unowned_are_rejected(client, investor):
    opened(client, investor)
    trade(client, investor, "steady_deposit", "buy", 2)
    r = trade(client, investor, "steady_deposit", "sell", 3)
    assert r.status_code == 422 and r.json()["error"]["code"] == "insufficient_holdings"
    assert trade(client, investor, "growth_basket", "sell", 1).status_code == 422


def test_unknown_instrument_and_missing_confirmation_rejected(client, investor):
    opened(client, investor)
    assert trade(client, investor, "real_company", "buy", 1).status_code == 422
    r = trade(client, investor, "steady_deposit", "buy", 1, confirm=False)
    assert r.status_code == 422 and r.json()["error"]["code"] == "confirmation_required"
    assert client.get(P, headers=investor).json()["portfolio"]["cash_paise"] == START


def test_client_cannot_supply_prices_or_totals(client, investor):
    opened(client, investor)
    r = post(
        client,
        investor,
        "/trades",
        {
            "request_id": rid(),
            "instrument_key": "steady_deposit",
            "side": "buy",
            "quantity": 1,
            "confirm": True,
            "price_paise": 1,
            "cash_paise": 99999999,
        },
    )
    assert r.status_code == 200
    assert r.json()["portfolio"]["cash_paise"] == START - 10_000


def test_quote_matches_the_trade_and_warns_about_concentration(client, investor):
    opened(client, investor)
    q = post(
        client,
        investor,
        "/quote",
        {"instrument_key": "growth_basket", "side": "buy", "quantity": 3},
    ).json()
    assert q["total_paise"] == 30_000 and q["cash_after_paise"] == START - 30_000
    v = trade(client, investor, "growth_basket", "buy", 3).json()["portfolio"]
    assert v["cash_paise"] == q["cash_after_paise"]
    assert "not investment advice" in q["disclaimer"].lower()


# --- idempotency ---------------------------------------------------------------


def test_replayed_request_is_applied_once(client, investor):
    opened(client, investor)
    key = rid()
    first = trade(client, investor, "steady_deposit", "buy", 4, request_id=key)
    again = trade(client, investor, "steady_deposit", "buy", 4, request_id=key)
    assert first.status_code == again.status_code == 200 and again.json()["replayed"] is True
    v = client.get(P, headers=investor).json()["portfolio"]
    assert v["cash_paise"] == START - 40_000 and v["holdings"][0]["quantity"] == 4


def test_request_id_cannot_be_reused_for_a_different_action(client, investor):
    opened(client, investor)
    key = rid()
    trade(client, investor, "steady_deposit", "buy", 1, request_id=key)
    r = trade(client, investor, "steady_deposit", "sell", 1, request_id=key)
    assert r.status_code == 409 and r.json()["error"]["code"] == "request_id_reused"


def test_concurrent_trades_cannot_overspend(client, investor):
    opened(client, investor)

    def buy(_):
        return trade(client, investor, "steady_deposit", "buy", 40)  # ₹4,000 each, ₹10,000 total

    with ThreadPoolExecutor(max_workers=8) as pool:
        codes = sorted(r.status_code for r in pool.map(buy, range(8)))
    assert codes.count(200) == 2 and all(c in (200, 422) for c in codes), codes
    with SessionLocal() as db:
        p = db.get(Portfolio, db.scalar(select(Portfolio.student_id)))
        assert p.cash_paise == START - 2 * 400_000 and p.cash_paise >= 0
        assert db.scalar(select(PortfolioHolding.quantity)) == 80


# --- time, valuation, reflection ----------------------------------------------------


def test_advance_reprices_deterministically_and_reveals_no_future(client, investor):
    opened(client, investor)
    trade(client, investor, "growth_basket", "buy", 10)
    v0 = client.get(P, headers=investor).json()
    assert all(len(i["price_history_paise"]) == 1 for i in v0["instruments"])
    r = advance(client, investor).json()
    assert r["portfolio"]["round"] == 1
    assert all(len(i["price_history_paise"]) == 2 for i in r["instruments"])
    event = r["event"]
    assert event["round"] == 1 and event["headline"] and event["reflection"]
    holding = r["portfolio"]["holdings"][0]
    growth = next(i for i in r["instruments"] if i["key"] == "growth_basket")
    assert holding["value_paise"] == 10 * growth["price_paise"]
    assert holding["gain_paise"] == holding["value_paise"] - 100_000
    assert r["portfolio"]["gain_paise"] == holding["gain_paise"]
    assert "path" not in str(r).lower().replace("practice", "")


def test_run_ends_after_ten_years_and_history_tracks_each_round(client, investor):
    opened(client, investor)
    trade(client, investor, "balanced_basket", "buy", 20)
    for _ in range(10):
        assert advance(client, investor).status_code == 200
    r = advance(client, investor)
    assert r.status_code == 409 and r.json()["error"]["code"] == "run_complete"
    v = client.get(P, headers=investor).json()["portfolio"]
    assert v["complete"] is True and [h["round"] for h in v["history"]] == list(range(11))


def test_advance_requires_confirmation(client, investor):
    opened(client, investor)
    r = post(client, investor, "/advance", {"request_id": rid(), "confirm": False})
    assert r.status_code == 422 and r.json()["error"]["code"] == "confirmation_required"


# --- wallet transfers -----------------------------------------------------------------


def earn_wallet(client, h):
    complete_budget(client, h)
    return client.get("/api/v1/wallet", headers=h).json()["balance"]


def transfer(client, h, amount, request_id=None, confirm=True):
    return post(
        client,
        h,
        "/transfer",
        {"request_id": request_id or rid(), "amount": amount, "confirm": confirm},
    )


def test_transfer_moves_wallet_money_one_way_and_is_logged(client, investor):
    balance = earn_wallet(client, investor)
    assert balance >= 50
    opened(client, investor)
    r = transfer(client, investor, 50)
    assert r.status_code == 200, r.text
    assert r.json()["portfolio"]["cash_paise"] == START + 5_000
    assert r.json()["wallet_balance"] == balance - 50
    wallet = client.get("/api/v1/wallet", headers=investor).json()
    assert wallet["balance"] == balance - 50 and wallet["history"][0]["entry_type"] == (
        "transfer_out"
    )
    assert wallet["history"][0]["amount"] == -50
    assert wallet["total_earned"] == balance  # transfers are not "earnings"
    tx = client.get(f"{P}/transactions", headers=investor).json()[0]
    assert tx["kind"] == "transfer_in" and tx["amount_paise"] == 5_000


def test_transfer_rejects_overdraft_bad_amounts_and_missing_confirmation(client, investor):
    balance = earn_wallet(client, investor)
    opened(client, investor)
    r = transfer(client, investor, balance + 1)
    assert r.status_code == 422 and r.json()["error"]["code"] == "insufficient_wallet"
    for bad in (0, -5):
        assert transfer(client, investor, bad).status_code == 422
    assert transfer(client, investor, 10, confirm=False).status_code == 422
    assert client.get("/api/v1/wallet", headers=investor).json()["balance"] == balance


def test_transfer_is_idempotent_and_serialised(client, investor):
    balance = earn_wallet(client, investor)
    opened(client, investor)
    key = rid()
    assert transfer(client, investor, 10, request_id=key).status_code == 200
    again = transfer(client, investor, 10, request_id=key)
    assert again.status_code == 200 and again.json()["replayed"] is True
    assert client.get("/api/v1/wallet", headers=investor).json()["balance"] == balance - 10

    left = balance - 10
    amount = left // 2 + 1  # any two of these together would overdraw

    def go(_):
        return transfer(client, investor, amount)

    with ThreadPoolExecutor(max_workers=6) as pool:
        codes = sorted(r.status_code for r in pool.map(go, range(6)))
    assert codes.count(200) == 1, codes
    assert client.get("/api/v1/wallet", headers=investor).json()["balance"] >= 0


def test_transfer_cap_per_run(client, investor):
    opened(client, investor)
    with SessionLocal() as db:  # seed a large fictional wallet balance directly via the ledger
        from app.models import User

        me = db.scalar(select(User).where(User.role == "student"))
        db.add(
            RewardLedgerEntry(
                student_id=me.id,
                entry_type="reward",
                amount=9_000,
                rule_key="test",
                source_type="test",
                reason="test funds",
                idempotency_key="test:big",
            )
        )
        db.commit()
    assert transfer(client, investor, 5_000).status_code == 200
    r = transfer(client, investor, 1)
    assert r.status_code == 422 and r.json()["error"]["code"] == "transfer_cap"


# --- reset ---------------------------------------------------------------------------


def test_reset_starts_a_new_practice_run_without_refunding_transfers(client, investor):
    balance = earn_wallet(client, investor)
    opened(client, investor)
    transfer(client, investor, 25)
    trade(client, investor, "steady_deposit", "buy", 5)
    advance(client, investor)
    r = post(client, investor, "/reset", {"request_id": rid(), "confirm": True}).json()
    p = r["portfolio"]
    assert p["run_number"] == 2 and p["round"] == 0 and p["holdings"] == []
    assert p["cash_paise"] == START and p["transferred_paise"] == 0
    assert r["wallet_balance"] == balance - 25  # not refunded
    kinds = [t["kind"] for t in client.get(f"{P}/transactions", headers=investor).json()]
    assert "reset" in kinds and "buy" in kinds  # history preserved
    bad = post(client, investor, "/reset", {"request_id": rid(), "confirm": False})
    assert bad.status_code == 422


# --- separation from learning -------------------------------------------------------


def test_portfolio_profit_never_changes_rewards_or_learning(client, investor):
    complete_budget(client, investor)
    wallet_before = client.get("/api/v1/wallet", headers=investor).json()["balance"]
    progress_before = client.get("/api/v1/progress/me", headers=investor).json()["concepts"]
    opened(client, investor)
    trade(client, investor, "growth_basket", "buy", 50)
    for _ in range(10):
        advance(client, investor)
    gain = client.get(P, headers=investor).json()["portfolio"]["gain_paise"]
    assert gain != 0
    assert client.get("/api/v1/wallet", headers=investor).json()["balance"] == wallet_before
    assert client.get("/api/v1/progress/me", headers=investor).json()["concepts"] == (
        progress_before
    )


# --- authorization and data isolation ------------------------------------------------


def test_portfolios_are_private_and_role_restricted(client, investor):
    opened(client, investor)
    trade(client, investor, "steady_deposit", "buy", 3)
    other, _ = register_onboarded(client)
    complete_investing(client, other)
    view = client.get(P, headers=other).json()
    assert view["portfolio"] is None  # the other student's portfolio is not visible
    assert client.get(f"{P}/transactions", headers=other).json() == []
    assert client.get(P).status_code == 401
    educator = register_educator(client)
    assert client.get(P, headers=educator).status_code == 403
    assert post(client, educator, "/open", {"request_id": rid()}).status_code == 403
    # selling someone else's holdings is impossible: the other student owns nothing
    opened(client, other)
    assert trade(client, other, "steady_deposit", "sell", 3).status_code == 422


def test_deleting_the_account_erases_portfolio_data(client, investor):
    opened(client, investor)
    trade(client, investor, "steady_deposit", "buy", 3)
    assert delete_account(client, investor).status_code == 204
    with SessionLocal() as db:
        for model in (Portfolio, PortfolioHolding, PortfolioTransaction):
            assert db.scalar(select(func.count()).select_from(model)) == 0
