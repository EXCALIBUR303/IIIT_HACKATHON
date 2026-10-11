"""Reward ledger: rules, exactly-once issuance, wallet reads and isolation."""

import threading

from sqlalchemy import func, select

from app.core.db import SessionLocal
from app.models import RewardLedgerEntry, User
from app.rewards import rules
from app.services import rewards as reward_service
from tests.conftest import (
    GOOD_BUDGET,
    answer_all,
    complete_budget,
    delete_account,
    register_educator,
    register_onboarded,
)

WALLET = "/api/v1/wallet"


# --- pure rules -------------------------------------------------------------


def test_pass_and_strong_tiers_are_separate_one_time_keys():
    keys = [a.idempotency_key for a in rules.simulation_awards("s", "budget", 90, {})]
    assert keys == ["sim:s:pass", "sim:s:strong"]
    assert [a.idempotency_key for a in rules.simulation_awards("s", "budget", 70, {})] == [
        "sim:s:pass"
    ]
    assert rules.simulation_awards("s", "budget", 59, {}) == []
    assert rules.simulation_awards("s", "budget", None, {}) == []


def test_dangerous_choices_are_never_rewarded():
    assert rules.simulation_awards("s", "budget", 95, {"outcome": {"borrowed": 100}}) == []
    assert rules.simulation_awards("s", "savings", 95, {"borrowed": 5}) == []
    assert rules.simulation_awards("s", "investing", 95, {"components": {"concentration": 0}}) == []
    unsafe = {"messages": [{"action_safe": False}], "total": 1, "correct_verdicts": 1}
    assert rules.simulation_awards("s", "safety", 95, unsafe) == []
    weak = {"messages": [{"action_safe": True}] * 4, "total": 4, "correct_verdicts": 2}
    assert rules.simulation_awards("s", "safety", 95, weak) == []


def test_guessing_earns_nothing_and_starting_check_pays_for_honesty_not_score():
    assert rules.assessment_awards("quiz-x", "module", 100, flagged_guessing=True) == []
    zero = rules.assessment_awards("initial", "initial", 0, flagged_guessing=False)
    full = rules.assessment_awards("initial", "initial", 100, flagged_guessing=False)
    assert [a.amount for a in zero] == [a.amount for a in full] == [rules.AMOUNTS["check_done"]]


def test_amounts_are_positive_whole_rupees():
    assert all(isinstance(v, int) and v > 0 for v in rules.AMOUNTS.values())


# --- API behaviour ----------------------------------------------------------


def test_new_student_has_empty_wallet(client, student):
    w = client.get(WALLET, headers=student).json()
    assert w["balance"] == 0 and w["history"] == [] and "Fictional" in w["notice"]


def test_completing_a_mission_issues_a_ledgered_reward_and_wallet_matches(client, student):
    done = complete_budget(client, student)
    issued = done["result"]["rewards"]
    assert issued and all(r["amount"] > 0 for r in issued)
    wallet = client.get(WALLET, headers=student).json()
    assert wallet["balance"] == sum(r["amount"] for r in issued) == wallet["total_earned"]
    entry = wallet["history"][0]
    assert (
        entry["entry_type"] == "reward"
        and entry["reason"]
        and entry["source_type"] == ("simulation")
    )
    assert entry["source_ref"] == done["id"] and entry["concept"] == "needs_vs_wants"


def test_replaying_the_same_mission_does_not_farm_rewards(client, student):
    complete_budget(client, student)
    before = client.get(WALLET, headers=student).json()["balance"]
    again = complete_budget(client, student)
    assert again["result"]["rewards"] == []
    assert client.get(WALLET, headers=student).json()["balance"] == before


def test_borrowing_to_cover_a_surprise_earns_no_reward(client, student):
    # Spend everything on needs/wants so only borrowing can cover the surprise.
    spend_all = {"bus_pass": 600, "lunch": 400, "stationery": 200, "recharge": 149, "outings": 650}
    done = complete_budget(client, student, allocations=spend_all, response="borrow")
    assert done["result"]["outcome"]["borrowed"] > 0
    assert done["result"]["rewards"] == []
    assert client.get(WALLET, headers=student).json()["balance"] == 0


def test_quiz_reward_is_once_per_tier_and_retakes_pay_nothing_more(client, student):
    first = answer_all(client, student, "quiz-plan-and-budget", correct=True)
    assert {r["rule_key"] for r in first["rewards"]} == {"quiz_pass", "quiz_strong"}
    balance = client.get(WALLET, headers=student).json()["balance"]
    second = answer_all(client, student, "quiz-plan-and-budget", correct=True)
    assert second["rewards"] == []
    assert client.get(WALLET, headers=student).json()["balance"] == balance
    review = client.get(
        f"/api/v1/assessments/attempts/{first['attempt_id']}", headers=student
    ).json()
    assert {r["rule_key"] for r in review["rewards"]} == {"quiz_pass", "quiz_strong"}


def test_rapid_guessed_quiz_pays_nothing(client, student):
    result = answer_all(client, student, "quiz-stay-safe", correct=True, ms=300)
    assert result["flagged_guessing"] and result["rewards"] == []


def test_failed_quiz_pays_nothing_but_starting_check_pays_participation(client, student):
    assert answer_all(client, student, "quiz-plan-and-budget", correct=False)["rewards"] == []
    check = answer_all(client, student, "initial", correct=False)
    assert [r["amount"] for r in check["rewards"]] == [rules.AMOUNTS["check_done"]]


def test_wallet_is_private_and_read_only(client, student):
    complete_budget(client, student)
    other, _ = register_onboarded(client)
    assert client.get(WALLET, headers=other).json()["balance"] == 0
    assert client.get(WALLET).status_code == 401
    assert client.get(WALLET, headers=register_educator(client)).status_code == 403
    for method in ("POST", "PUT", "PATCH", "DELETE"):
        r = client.request(method, WALLET, headers=student, json={"balance": 99999})
        assert r.status_code in (404, 405)


def test_rewards_do_not_change_mastery(client, student):
    before = client.get("/api/v1/progress/me", headers=student).json()["concepts"]
    # Retrieving the wallet / rewards must not alter learning data.
    client.get(WALLET, headers=student)
    after = client.get("/api/v1/progress/me", headers=student).json()["concepts"]
    assert before == after


def test_deleting_account_erases_the_ledger(client, student):
    complete_budget(client, student)
    me = client.get("/api/v1/auth/me", headers=student).json()
    assert delete_account(client, student).status_code == 204
    with SessionLocal() as db:
        assert db.scalar(select(func.count()).select_from(RewardLedgerEntry)) == 0
        assert db.get(User, me["id"]) is None


# --- exactly-once under concurrency ------------------------------------------


def test_concurrent_duplicate_issuance_creates_one_entry(client, student):
    me = client.get("/api/v1/auth/me", headers=student).json()
    award = rules.Award("quiz_pass", 25, "quiz:race:pass", "race test")
    errors: list[Exception] = []
    created: list[int] = []
    barrier = threading.Barrier(8)

    def worker():
        try:
            with SessionLocal() as db:
                user = db.get(User, me["id"])
                barrier.wait(timeout=5)
                made = reward_service.issue(
                    db, user, [award], source_type="assessment", source_ref="race"
                )
                db.commit()
                created.append(len(made))
        except Exception as exc:  # pragma: no cover - failure path
            errors.append(exc)

    threads = [threading.Thread(target=worker) for _ in range(8)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert not errors, errors
    assert sum(created) == 1
    with SessionLocal() as db:
        assert reward_service.balance(db, me["id"]) == 25


def test_ledger_rejects_zero_and_wrongly_signed_amounts(client, student):
    me = client.get("/api/v1/auth/me", headers=student).json()
    import pytest
    from sqlalchemy.exc import IntegrityError

    for entry_type, amount in (("reward", 0), ("reward", -5), ("transfer_out", 5)):
        with SessionLocal() as db, pytest.raises(IntegrityError):
            db.add(
                RewardLedgerEntry(
                    student_id=me["id"],
                    entry_type=entry_type,
                    amount=amount,
                    rule_key="x",
                    source_type="t",
                    reason="r",
                    idempotency_key=f"k{amount}{entry_type}",
                )
            )
            db.commit()


def test_good_budget_constant_is_still_valid():
    assert sum(GOOD_BUDGET.values()) == 1949


def test_wallet_lists_the_real_reward_rules_and_never_profit(client, student):
    body = client.get(WALLET, headers=student).json()
    rules = {r["key"]: r for r in body["rules"]}
    from app.rewards.rules import AMOUNTS

    assert {k: r["amount"] for k, r in rules.items()} == {k: AMOUNTS[k] for k in rules}
    assert "market_debrief" in rules and "sim_pass" in rules
    assert not any(
        "profit" in r["label"].lower() or "gain" in r["label"].lower() for r in rules.values()
    )


def test_level_is_derived_from_understanding_and_practice_never_from_profit():
    from app.services import levels

    assert levels.level_for(0)["title"] == "Saver" and levels.level_for(0)["level"] == 1
    mid = levels.level_for(160)
    assert mid["level"] == 3 and mid["xp_into_level"] == 10 and mid["xp_for_level"] == 150
    assert mid["next_title"] == "Investor in training"
    top = levels.level_for(5000)
    assert top["max_level"] and top["next_title"] is None and top["xp_for_level"] == 0
    assert levels.xp(100, 4) == 120 and levels.xp(-5, -1) == 0


def test_wallet_reports_a_level(client, student):
    body = client.get(WALLET, headers=student).json()
    assert body["level"]["level"] == 1 and body["level"]["xp"] == body["total_earned"]
    assert "profit" not in body["level"]["sources"].lower()
