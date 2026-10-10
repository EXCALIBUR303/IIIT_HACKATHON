import pytest

from tests.conftest import (
    GOOD_BUDGET,
    complete_budget,
    register_onboarded,
    register_student,
    unlock_quiz,
)

SESSIONS = "/api/v1/simulations/sessions"


def decide(client, headers, sid, dtype, payload):
    return client.post(
        f"{SESSIONS}/{sid}/decisions", headers=headers, json={"type": dtype, "payload": payload}
    )


def test_budget_flow_persists_and_scores(client, student):
    done = complete_budget(client, student)
    assert done["status"] == "completed" and done["phase"] == "done"
    assert 0 <= done["score"] <= 100
    assert "budget_builder" in done["new_achievements"]
    stored = client.get(f"{SESSIONS}/{done['id']}", headers=student).json()
    assert stored["result"]["allocation"]["total_allocated"] == 1949.0
    assert stored["result"]["outcome"]["event_key"] == stored["result"]["event"]["key"]
    history = client.get(
        SESSIONS, headers=student, params={"scenario_slug": "budget-meera-pocket-money"}
    )
    assert len(history.json()) == 1


def test_over_budget_returns_422_and_session_unchanged(client, student):
    s = client.post(
        SESSIONS, headers=student, json={"scenario_slug": "budget-meera-pocket-money"}
    ).json()
    r = decide(
        client, student, s["id"], "allocate", {"allocations": {**GOOD_BUDGET, "gaming": 999}}
    )
    assert r.status_code == 422 and r.json()["error"]["code"] == "over_budget"
    again = client.get(f"{SESSIONS}/{s['id']}", headers=student).json()
    assert again["phase"] == "allocate"
    assert (
        decide(client, student, s["id"], "allocate", {"allocations": GOOD_BUDGET}).status_code
        == 200
    )


def test_invalid_transitions_rejected(client, student):
    s = client.post(
        SESSIONS, headers=student, json={"scenario_slug": "budget-meera-pocket-money"}
    ).json()
    r = decide(client, student, s["id"], "respond_event", {"response": "mix"})
    assert r.status_code == 409 and r.json()["error"]["code"] == "invalid_transition"
    done = complete_budget(client, student)
    r = decide(client, student, done["id"], "allocate", {"allocations": GOOD_BUDGET})
    assert r.status_code == 409 and r.json()["error"]["code"] == "session_closed"


def test_retry_increments_attempt_and_abandons_open_session(client, student):
    first = client.post(
        SESSIONS, headers=student, json={"scenario_slug": "budget-meera-pocket-money"}
    ).json()
    second = client.post(
        SESSIONS, headers=student, json={"scenario_slug": "budget-meera-pocket-money"}
    ).json()
    assert second["attempt_number"] == 2
    assert client.get(f"{SESSIONS}/{first['id']}", headers=student).json()["status"] == "abandoned"


def test_improved_retry_earns_comeback(client, student):
    weak = {**GOOD_BUDGET, "savings": 0, "outings": 300, "gaming": 150}
    complete_budget(client, student, allocations=weak, response="borrow")
    better = complete_budget(client, student)
    assert better["previous_best"] is not None and better["score"] > better["previous_best"]
    assert "comeback" in better["new_achievements"]


def test_sessions_are_private(client, student):
    s = client.post(
        SESSIONS, headers=student, json={"scenario_slug": "budget-meera-pocket-money"}
    ).json()
    other, _ = register_onboarded(client)
    assert client.get(f"{SESSIONS}/{s['id']}", headers=other).status_code == 404
    assert (
        decide(client, other, s["id"], "allocate", {"allocations": GOOD_BUDGET}).status_code == 404
    )


def test_savings_flow(client, student):
    s = client.post(
        SESSIONS, headers=student, json={"scenario_slug": "savings-meera-calculator"}
    ).json()
    assert s["phase"] == "plan" and s["state"]["capacity"] == 600
    r = decide(
        client,
        student,
        s["id"],
        "plan",
        {"goal_saving": 400, "emergency_saving": 200, "account": "savings_account"},
    )
    assert r.json()["phase"] == "respond_event"
    r = decide(client, student, s["id"], "respond_event", {"source": "emergency_fund"})
    body = r.json()
    assert body["status"] == "completed" and body["result"]["goal_reached"] is True
    assert {"goal_getter", "emergency_ready"} <= set(body["new_achievements"])


def test_investing_flow_with_market_fall(client, student):
    s = client.post(
        SESSIONS, headers=student, json={"scenario_slug": "investing-time-horizon"}
    ).json()
    bad = decide(
        client,
        student,
        s["id"],
        "allocate",
        {"allocation": {"zippy_gadgets": 100}, "horizon_years": 10},
    )
    assert bad.status_code == 422  # asset not offered in this scenario
    r = decide(
        client,
        student,
        s["id"],
        "allocate",
        {
            "allocation": {"steady_deposit": 30, "balanced_basket": 40, "growth_basket": 30},
            "horizon_years": 10,
        },
    )
    assert r.json()["phase"] == "respond_event"
    event = r.json()["state"]["event"]
    assert event["year_change_pct"] < 0 and event["market_change_pct"] < 0
    r = decide(client, student, s["id"], "respond_event", {"action": "hold"})
    result = r.json()["result"]
    assert set(result["path_result"]["outcome_by_action"]) == {"hold", "sell_all", "rebalance"}
    assert "steady_hand" in r.json()["new_achievements"]
    assert result["disclaimer"]


def test_investing_one_year_horizon_completes_without_event(client, student):
    s = client.post(
        SESSIONS, headers=student, json={"scenario_slug": "investing-time-horizon"}
    ).json()
    r = decide(
        client,
        student,
        s["id"],
        "allocate",
        {"allocation": {"steady_deposit": 100}, "horizon_years": 1},
    )
    assert r.json()["status"] == "completed" and r.json()["result"]["path_result"] is None


@pytest.mark.requires_private_content
def test_safety_flow_and_no_answer_leak(client, student):
    detail = client.get("/api/v1/scenarios/safety-inbox-basics", headers=student).json()
    assert "verdict" not in str(detail["config"])
    s = client.post(SESSIONS, headers=student, json={"scenario_slug": "safety-inbox-basics"}).json()
    answers = {
        "lottery": ("scam", ["too_good", "upfront_fee", "urgency"], "report_block"),
        "bank_otp": ("genuine", [], "proceed_normally"),
        "kyc_block": ("scam", ["urgency", "suspicious_link", "impersonation"], "verify_official"),
        "school_notice": ("genuine", [], "proceed_normally"),
    }
    for i, (mid, (verdict, flags, action)) in enumerate(answers.items()):
        r = decide(
            client,
            student,
            s["id"],
            "classify",
            {"message_id": mid, "verdict": verdict, "flags": flags, "action": action},
        )
        assert r.status_code == 200
        if i == 0:
            dup = decide(
                client,
                student,
                s["id"],
                "classify",
                {"message_id": mid, "verdict": verdict, "flags": flags, "action": action},
            )
            assert dup.status_code == 409
    final = r.json()
    assert final["status"] == "completed" and final["score"] == 100
    assert "scam_spotter" in final["new_achievements"]


def test_calculators(client, student):
    r = client.post(
        "/api/v1/calculators/savings",
        headers=student,
        json={"monthly_deposit": 500, "months": 24, "annual_rate": 0.06},
    )
    assert r.json()["compounding_advantage"] > 0
    r = client.post(
        "/api/v1/calculators/investment",
        headers=student,
        json={"amount": 10000, "allocation": {"growth_basket": 100}, "horizon_years": 5},
    )
    assert len(r.json()["paths"]) == 5
    r = client.post(
        "/api/v1/calculators/investment",
        headers=student,
        json={"amount": 10000, "allocation": {"growth_basket": 60}, "horizon_years": 5},
    )
    assert r.status_code == 422
    r = client.post(
        "/api/v1/calculators/head-start",
        headers=student,
        json={"monthly_deposit": 500, "annual_rate": 0.08, "total_years": 20, "delay_years": 10},
    )
    assert r.json()["difference"] > 0


def test_unknown_scenario(client, student):
    assert client.post(SESSIONS, headers=student, json={"scenario_slug": "nope"}).status_code == 404


def test_concurrent_starts_do_not_error(client, student):
    """Double clicks / StrictMode double effects must not surface as 500s."""
    from concurrent.futures import ThreadPoolExecutor

    def start(_):
        return client.post(
            SESSIONS, headers=student, json={"scenario_slug": "budget-meera-pocket-money"}
        )

    with ThreadPoolExecutor(max_workers=8) as pool:
        codes = [r.status_code for r in pool.map(start, range(8))]
    assert all(c == 201 for c in codes), codes

    unlock_quiz(client, student, "quiz-stay-safe")

    def attempt(_):
        return client.post("/api/v1/assessments/quiz-stay-safe/attempts", headers=student)

    with ThreadPoolExecutor(max_workers=8) as pool:
        results = list(pool.map(attempt, range(8)))
    assert all(r.status_code == 201 for r in results), [r.status_code for r in results]
    assert len({r.json()["attempt_id"] for r in results}) == 1  # all resume the same attempt


def test_money_lab_flow_scores_rewards_and_hides_future(client, student):
    s = client.post(SESSIONS, headers=student, json={"scenario_slug": "money-lab-500"}).json()
    assert s["kind"] == "money_lab" and s["phase"] == "plan"
    assert s["state"]["assumptions"]["limitations"] and "growth_paths" not in str(s["state"])
    bad = decide(
        client,
        student,
        s["id"],
        "plan",
        {"spend": 100, "ready": 100, "deposit": 100, "growth": 100},
    )
    assert bad.status_code == 422 and bad.json()["error"]["code"] == "allocation_total"
    r = decide(
        client, student, s["id"], "plan", {"spend": 100, "ready": 150, "deposit": 250, "growth": 0}
    )
    assert r.status_code == 200 and r.json()["phase"] == "respond_event"
    assert {o["key"] for o in r.json()["state"]["options"]} == {
        "ready",
        "deposit",
        "growth",
        "borrow",
    }
    r = decide(client, student, s["id"], "respond_event", {"source": "ready"})
    assert r.status_code == 200 and r.json()["status"] == "completed"
    result = r.json()["result"]
    assert result["goal_reached"] and result["score"] >= 80 and result["assumptions"]["months"] == 6
    assert "lab_finisher" in r.json()["new_achievements"]
    assert result["rewards"] and client.get("/api/v1/wallet", headers=student).json()["balance"] > 0
    status = client.get("/api/v1/learning/status", headers=student).json()
    assert status["score"]["total"] > 0


def test_money_lab_is_not_offered_to_explorers(client):
    h, _ = register_student(client)
    client.put("/api/v1/students/me/profile", headers=h, json={"grade": 7})
    r = client.post(SESSIONS, headers=h, json={"scenario_slug": "money-lab-500"})
    assert r.status_code == 403
