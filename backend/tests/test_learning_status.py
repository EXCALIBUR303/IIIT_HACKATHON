"""Learning score, level unlock rules and reflections."""

import dataclasses

from app.learning import levels, score
from app.services.reflections import total_available
from tests.conftest import answer_all, complete_budget, register_educator, register_student

STATUS = "/api/v1/learning/status"
REFLECTIONS = "/api/v1/reflections"


# --- pure score ------------------------------------------------------------------


def _evidence(**kw):
    base = dict(
        quiz_best={},
        scenario_best_by_kind={},
        reflections_correct=0,
        reflections_total_available=12,
        completed_missions=0,
        safe_missions=0,
    )
    base.update(kw)
    return score.Evidence(**base)


def test_weights_are_a_hundred_and_empty_evidence_scores_zero():
    assert sum(score.WEIGHTS.values()) == 100
    out = score.compute(_evidence())
    assert out["total"] == 0 and len(out["components"]) == 4


def test_full_evidence_scores_one_hundred_with_a_breakdown():
    out = score.compute(
        _evidence(
            quiz_best={s: 100 for s in score.QUIZ_SLUGS},
            scenario_best_by_kind={k: 100 for k in score.PILLAR_KINDS},
            reflections_correct=12,
            completed_missions=4,
            safe_missions=4,
        )
    )
    assert out["total"] == 100
    assert {c["key"]: c["points"] for c in out["components"]} == {
        "assessments": 40.0,
        "decisions": 30.0,
        "reflection": 20.0,
        "safe_behavior": 10.0,
    }
    assert all(c["explanation"] and c["recovery"] for c in out["components"])


def test_partial_evidence_is_weighted_correctly():
    out = score.compute(
        _evidence(
            quiz_best={"quiz-plan-and-budget": 80},  # 80 / 4 quizzes = 20 -> 8 points
            scenario_best_by_kind={"budget": 100},  # 100 / 4 = 25 -> 7.5 points
            reflections_correct=6,  # 50 -> 10 points
            completed_missions=2,
            safe_missions=2,  # 100 * coverage 0.5 = 50 -> 5 points
        )
    )
    points = {c["key"]: c["points"] for c in out["components"]}
    assert points == {
        "assessments": 8.0,
        "decisions": 7.5,
        "reflection": 10.0,
        "safe_behavior": 5.0,
    }
    assert out["total"] == 30  # 8 + 7.5 + 10 + 5 = 30.5 -> rounds to 30


def test_unsafe_choices_lower_safe_behaviour_but_not_the_other_components():
    safe = score.compute(_evidence(completed_missions=4, safe_missions=4))
    risky = score.compute(_evidence(completed_missions=4, safe_missions=1))
    pts = lambda out, key: next(c["points"] for c in out["components"] if c["key"] == key)  # noqa: E731
    assert pts(risky, "safe_behavior") < pts(safe, "safe_behavior")


def test_score_inputs_contain_no_money_or_trading_fields():
    names = {f.name for f in dataclasses.fields(score.Evidence)}
    assert not names & {"portfolio", "wallet", "balance", "gain", "trades", "rewards", "cash"}
    assert "reward money" in score.compute(_evidence())["note"]


# --- pure levels ---------------------------------------------------------------------


def _all_evidence():
    return levels.LevelEvidence(
        mission_best={"budget": 80, "savings": 80, "investing": 80, "safety": 90},
        mission_safe={"investing": True, "safety": True},
        quiz_best={
            "quiz-plan-and-budget": 80,
            "quiz-save-and-manage": 80,
            "quiz-understand-investing": 80,
            "quiz-stay-safe": 80,
        },
        diversification=(0.7, 3.0),
        reflections_correct={"diversification"},
        applied_missions={"money_lab"},
    )


def test_no_evidence_means_level_zero_and_a_next_step():
    out = levels.evaluate(levels.LevelEvidence())
    assert out["current"] == 0 and out["next"]["level"] == 1
    assert all(not r["met"] for r in out["next"]["requirements"])


def test_full_evidence_reaches_level_five():
    out = levels.evaluate(_all_evidence())
    assert out["current"] == 5 and out["next"] is None


def test_levels_cannot_be_skipped():
    e = _all_evidence()
    e = dataclasses.replace(e, mission_best={**e.mission_best, "budget": 10})
    out = levels.evaluate(e)
    assert out["current"] == 0  # level 1 unmet blocks every later level
    assert [lv["unlocked"] for lv in out["levels"]] == [False] * 5


def test_diversification_needs_mastery_and_a_correct_reflection_and_safe_investing():
    base = _all_evidence()
    for change in (
        {"diversification": (0.4, 3.0)},
        {"diversification": (0.9, 1.0)},  # not enough evidence weight
        {"reflections_correct": set()},
        {"mission_safe": {"investing": False, "safety": True}},
    ):
        out = levels.evaluate(dataclasses.replace(base, **change))
        assert out["current"] == 3, change


def test_final_level_needs_the_applied_money_lab():
    e = dataclasses.replace(_all_evidence(), applied_missions=set())
    out = levels.evaluate(e)
    assert out["current"] == 4
    assert any(
        r["key"] == "applied_money_lab" and not r["met"] for r in out["next"]["requirements"]
    )


# --- API -------------------------------------------------------------------------------


def test_new_student_status_is_empty_but_explained(client, student):
    s = client.get(STATUS, headers=student).json()
    assert s["score"]["total"] == 0 and s["level"]["current"] == 0
    assert s["level"]["next"]["requirements"] and "reward money" in s["score"]["note"]


def test_completing_level_one_requirements_unlocks_it(client, student):
    complete_budget(client, student)
    answer_all(client, student, "quiz-plan-and-budget", correct=True)
    s = client.get(STATUS, headers=student).json()
    assert s["level"]["current"] == 1 and s["level"]["current_title"] == "Money basics"
    assert s["score"]["total"] > 0
    assert s["level"]["next"]["level"] == 2


def test_status_is_private_and_student_only(client, student):
    assert client.get(STATUS).status_code == 401
    assert client.get(STATUS, headers=register_educator(client)).status_code == 403


def test_wallet_and_rewards_never_change_score_or_level(client, student):
    complete_budget(client, student)
    before = client.get(STATUS, headers=student).json()
    wallet = client.get("/api/v1/wallet", headers=student).json()
    assert wallet["balance"] > 0
    assert client.get(STATUS, headers=student).json() == before


# --- reflections -------------------------------------------------------------------------


def finished_budget_session(client, h):
    return complete_budget(client, h)["id"]


def prompt(client, h, sid):
    return client.get(f"{REFLECTIONS}/prompt", headers=h, params={"session_id": sid})


def answer(client, h, sid, key, option, confidence="medium"):
    return client.post(
        REFLECTIONS,
        headers=h,
        json={"session_id": sid, "question_key": key, "selected": option, "confidence": confidence},
    )


def test_prompt_hides_the_answer_and_matches_the_mission_kind(client, student):
    sid = finished_budget_session(client, student)
    p = prompt(client, student, sid).json()
    assert p["available"] and p["question_key"].startswith("refl-budget")
    assert "correct" not in str(p) and "misconception" not in str(p)
    assert len(p["options"]) == 3


def test_cannot_reflect_before_finishing_or_on_someone_elses_mission(client, student):
    started = client.post(
        "/api/v1/simulations/sessions",
        headers=student,
        json={"scenario_slug": "budget-meera-pocket-money"},
    ).json()
    assert prompt(client, student, started["id"]).status_code == 409
    sid = finished_budget_session(client, student)
    other, _ = register_student(client)
    assert prompt(client, other, sid).status_code == 404
    key = prompt(client, student, sid).json()["question_key"]
    assert answer(client, other, sid, key, "a").status_code == 404


def test_correct_reflection_pays_once_and_adds_evidence(client, student):
    sid = finished_budget_session(client, student)
    p = prompt(client, student, sid).json()
    wallet_before = client.get("/api/v1/wallet", headers=student).json()["balance"]
    r = answer(client, student, sid, p["question_key"], "a").json()
    assert r["correct"] is True and r["explanation"] and r["misconception"] is None
    assert [x["amount"] for x in r["rewards"]] == [10]
    assert client.get("/api/v1/wallet", headers=student).json()["balance"] == wallet_before + 10
    again = answer(client, student, sid, p["question_key"], "a")
    assert again.status_code == 409 and again.json()["error"]["code"] == "already_answered"
    assert client.get("/api/v1/wallet", headers=student).json()["balance"] == wallet_before + 10
    s = client.get(STATUS, headers=student).json()
    refl = next(c for c in s["score"]["components"] if c["key"] == "reflection")
    assert refl["score"] == round(100 * 1 / total_available())


def test_wrong_reflection_names_the_misconception_and_pays_nothing(client, student):
    sid = finished_budget_session(client, student)
    p = prompt(client, student, sid).json()
    before = client.get("/api/v1/wallet", headers=student).json()["balance"]
    r = answer(client, student, sid, p["question_key"], "b").json()
    assert r["correct"] is False and r["misconception"] and r["rewards"] == []
    assert r["correct_option"]["key"] == "a"
    assert client.get("/api/v1/wallet", headers=student).json()["balance"] == before


def test_invalid_option_and_wrong_kind_question_rejected(client, student):
    sid = finished_budget_session(client, student)
    key = prompt(client, student, sid).json()["question_key"]
    assert answer(client, student, sid, key, "z").status_code == 422
    assert answer(client, student, sid, "refl-investing-diversify", "a").status_code == 422
    assert answer(client, student, sid, "no-such-question", "a").status_code == 422
    r = client.post(
        REFLECTIONS,
        headers=student,
        json={"session_id": sid, "question_key": key, "selected": "a", "confidence": "sure"},
    )
    assert r.status_code == 422


def test_prompts_move_through_the_bank_then_run_out(client, student):
    sid = finished_budget_session(client, student)
    seen = []
    for _ in range(3):
        p = prompt(client, student, sid).json()
        seen.append(p["question_key"])
        assert answer(client, student, sid, p["question_key"], "a").status_code == 200
    assert len(set(seen)) == 3
    assert prompt(client, student, sid).json()["available"] is False


def test_money_lab_has_its_own_reflection_bank(client, student):
    s = client.post(
        "/api/v1/simulations/sessions", headers=student, json={"scenario_slug": "money-lab-500"}
    ).json()
    sid = s["id"]
    client.post(
        f"/api/v1/simulations/sessions/{sid}/decisions",
        headers=student,
        json={"type": "plan", "payload": {"spend": 100, "ready": 150, "deposit": 250, "growth": 0}},
    )
    client.post(
        f"/api/v1/simulations/sessions/{sid}/decisions",
        headers=student,
        json={"type": "respond_event", "payload": {"source": "ready"}},
    )
    p = prompt(client, student, sid).json()
    assert p["available"] and p["question_key"].startswith("refl-lab")
