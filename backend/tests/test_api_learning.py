import pytest
from sqlalchemy import func, select

from app.core.db import SessionLocal
from app.models import ConceptMastery, SimulationSession
from tests.conftest import (
    answer_all,
    complete_budget,
    delete_account,
    onboard,
    register_educator,
    register_onboarded,
    register_student,
    unlock_quiz,
)


def test_modules_and_content(client, student):
    modules = client.get("/api/v1/modules", headers=student).json()
    assert [m["pillar"] for m in modules] == ["budgeting", "saving", "investing", "safety"]
    assert all(m["quiz_slug"] and m["scenarios"] for m in modules)
    assert len(client.get("/api/v1/personas").json()) == 4


def test_onboarding_requires_persona_and_awards_badge(client):
    headers, _ = register_student(client)
    r = client.put(
        "/api/v1/students/me/profile", headers=headers, json={"onboarding_completed": True}
    )
    assert r.status_code == 422
    r = client.put("/api/v1/students/me/profile", headers=headers, json={"persona_key": "dragon"})
    assert r.status_code == 422
    profile = onboard(client, headers, persona="lakshmi")
    assert profile["persona_key"] == "lakshmi" and profile["onboarding_completed"]
    badges = client.get("/api/v1/achievements/me", headers=headers).json()
    assert any(b["slug"] == "first_steps" and b["earned"] for b in badges)


@pytest.mark.requires_private_content
def test_assessment_hides_answers_and_initial_is_one_shot(client, student):
    start = client.post("/api/v1/assessments/initial/attempts", headers=student).json()
    assert len(start["questions"]) == 12
    assert "correct" not in str(start["questions"]) and "misconception" not in str(
        start["questions"]
    )
    result = answer_all(client, student, "initial", correct=False)
    assert result["score_pct"] == 0 and result["misconceptions"]
    assert all(q["misconception_label"] for q in result["questions"])
    again = client.post("/api/v1/assessments/initial/attempts", headers=student)
    assert again.status_code == 409 and again.json()["error"]["code"] == "assessment_locked"
    review = client.get(f"/api/v1/assessments/attempts/{result['attempt_id']}", headers=student)
    assert review.json()["score_pct"] == 0


def test_incomplete_submission_rejected(client, student):
    unlock_quiz(client, student, "quiz-plan-and-budget")
    start = client.post("/api/v1/assessments/quiz-plan-and-budget/attempts", headers=student).json()
    q = start["questions"][0]
    r = client.post(
        f"/api/v1/assessments/attempts/{start['attempt_id']}/submit",
        headers=student,
        json={"responses": [{"question_slug": q["slug"], "option_key": "a"}]},
    )
    assert r.status_code == 422 and r.json()["error"]["code"] == "incomplete"


def test_quiz_retakes_count_less_toward_mastery(client, student):
    answer_all(client, student, "quiz-plan-and-budget", correct=False)
    answer_all(client, student, "quiz-plan-and-budget", correct=True)
    with SessionLocal() as db:
        row = db.scalar(select(ConceptMastery).where(ConceptMastery.concept == "needs_vs_wants"))
        # attempt 1 weight 1.0 (wrong x2), attempt 2 weight 0.5 (right x2)
        assert row.weighted_total == 3.0 and row.weighted_correct == 1.0
        assert row.mastery < 0.5


def test_rapid_guessing_flagged(client, student):
    result = answer_all(client, student, "quiz-stay-safe", correct=True, ms=300)
    assert result["flagged_guessing"] is True and all(q["rapid"] for q in result["questions"])


def test_post_assessment_locked_until_all_pillars(client, student):
    post = client.get("/api/v1/assessments/post", headers=student).json()
    assert post["available"] is False
    answer_all(client, student, "initial")
    complete_budget(client, student)
    assert client.post("/api/v1/assessments/post/attempts", headers=student).status_code == 409


def test_progress_and_recommendations_adapt(client, student):
    rec = client.get("/api/v1/progress/me/recommendation", headers=student).json()
    assert rec["slug"] == "initial"
    answer_all(client, student, "initial", correct=False)
    rec = client.get("/api/v1/progress/me/recommendation", headers=student).json()
    assert rec["kind"] == "scenario" and rec["difficulty"] == 1
    complete_budget(client, student)
    progress = client.get("/api/v1/progress/me", headers=student).json()
    budgeting = next(m for m in progress["modules"] if m["pillar"] == "budgeting")
    assert budgeting["simulation_done"] and budgeting["percent"] == 50
    assert progress["activity"]["simulations_completed"] == 1
    assert progress["practice_areas"]
    assert progress["pre_post"]["post_score"] is None


def test_full_journey_pre_post_comparison(client, student):
    answer_all(client, student, "initial", correct=False)
    sessions = "/api/v1/simulations/sessions"
    complete_budget(client, student)
    s = client.post(
        sessions, headers=student, json={"scenario_slug": "savings-meera-calculator"}
    ).json()
    client.post(
        f"{sessions}/{s['id']}/decisions",
        headers=student,
        json={
            "type": "plan",
            "payload": {"goal_saving": 400, "emergency_saving": 200, "account": "savings_account"},
        },
    )
    client.post(
        f"{sessions}/{s['id']}/decisions",
        headers=student,
        json={"type": "respond_event", "payload": {"source": "emergency_fund"}},
    )
    s = client.post(
        sessions, headers=student, json={"scenario_slug": "investing-time-horizon"}
    ).json()
    client.post(
        f"{sessions}/{s['id']}/decisions",
        headers=student,
        json={
            "type": "allocate",
            "payload": {"allocation": {"steady_deposit": 100}, "horizon_years": 1},
        },
    )
    s = client.post(sessions, headers=student, json={"scenario_slug": "safety-inbox-basics"}).json()
    for mid in ("lottery", "bank_otp", "kyc_block", "school_notice"):
        client.post(
            f"{sessions}/{s['id']}/decisions",
            headers=student,
            json={
                "type": "classify",
                "payload": {
                    "message_id": mid,
                    "verdict": "scam",
                    "flags": [],
                    "action": "report_block",
                },
            },
        )
    for slug in (
        "quiz-plan-and-budget",
        "quiz-save-and-manage",
        "quiz-understand-investing",
        "quiz-stay-safe",
    ):
        answer_all(client, student, slug)
    post = answer_all(client, student, "post")
    assert "full_circle" in post["new_achievements"]
    progress = client.get("/api/v1/progress/me", headers=student).json()
    assert progress["pre_post"]["change"] == 100
    assert progress["activity"]["modules_completed"] == 4
    assert any(
        a["slug"] == "pillar_explorer" and a["earned"]
        for a in client.get("/api/v1/achievements/me", headers=student).json()
    )


@pytest.mark.requires_private_content
def test_educator_cohort_flow_and_isolation(client):
    edu = register_educator(client, org="Hyderabad Learning Trust")
    cohort = client.post(
        "/api/v1/educator/cohorts", headers=edu, json={"name": "Class 12-B"}
    ).json()
    code = cohort["join_code"]
    s1, _ = register_student(client, join_code=code, name="Asha")
    s2, _ = register_student(client, name="Bilal")
    onboard(client, s1)
    onboard(client, s2)
    assert (
        client.post("/api/v1/students/me/cohorts", headers=s2, json={"join_code": code}).status_code
        == 200
    )
    assert (
        client.post("/api/v1/students/me/cohorts", headers=s2, json={"join_code": code}).status_code
        == 409
    )
    answer_all(client, s1, "initial", correct=False)
    complete_budget(client, s1)
    ov = client.get(f"/api/v1/educator/cohorts/{cohort['id']}/overview", headers=edu).json()
    assert ov["student_count"] == 2 and ov["participation"]["onboarded"] == 2
    assert ov["assessment"]["initial_count"] == 1 and ov["assessment"]["paired"] == 0
    assert ov["misconceptions"] and ov["support_topics"]
    names = {s["display_name"] for s in ov["students"]}
    assert names == {"Asha", "Bilal"}
    assert "username" not in str(ov["students"])  # nicknames only

    other_edu = register_educator(client, org="Another NGO")
    assert (
        client.get(
            f"/api/v1/educator/cohorts/{cohort['id']}/overview", headers=other_edu
        ).status_code
        == 404
    )
    assert client.get("/api/v1/educator/cohorts", headers=other_edu).json() == []


def test_account_deletion_removes_learning_data(client, student):
    complete_budget(client, student)
    assert delete_account(client, student).status_code == 204
    assert client.get("/api/v1/auth/me", headers=student).status_code == 401
    with SessionLocal() as db:
        assert db.scalar(select(func.count(SimulationSession.id))) == 0


@pytest.mark.requires_private_content
def test_tutor_fallback_is_grounded(client, student):
    r = client.post(
        "/api/v1/tutor/ask", headers=student, json={"question": "Why share OTP is bad?"}
    )
    body = r.json()
    assert body["source"] == "fallback" and body["concept"] == "otp_pin_safety"
    assert body["grounded_on"] and "OTP" in body["answer"]
    done = complete_budget(client, student)
    r = client.post(
        "/api/v1/tutor/ask",
        headers=student,
        json={"question": "What is an emergency fund?", "session_id": done["id"]},
    )
    assert any("score" in g for g in r.json()["grounded_on"])
    explain = client.post(
        "/api/v1/tutor/ask",
        headers=student,
        json={"question": "Can you explain my result?", "session_id": done["id"]},
    )
    body = explain.json()
    assert body["concept"] is not None and body["answer"].startswith("Your simulation score")
    other, _ = register_onboarded(client)
    r = client.post(
        "/api/v1/tutor/ask", headers=other, json={"question": "explain", "session_id": done["id"]}
    )
    assert r.status_code == 404


def test_educator_overview_has_stage_mix_reflection_gaps_and_follow_ups(client):
    from tests.conftest import (
        answer_all,
        complete_budget,
        onboard,
        register_educator,
        register_student,
    )

    edu = register_educator(client)
    code = client.post("/api/v1/educator/cohorts", headers=edu, json={"name": "Batch A"}).json()[
        "join_code"
    ]
    h, _ = register_student(client, join_code=code)
    onboard(client, h)
    answer_all(client, h, "quiz-plan-and-budget", correct=False)
    sid = complete_budget(client, h)["id"]
    q = client.get("/api/v1/reflections/prompt", headers=h, params={"session_id": sid}).json()
    client.post(
        "/api/v1/reflections",
        headers=h,
        json={"session_id": sid, "question_key": q["question_key"], "selected": "b"},
    )
    cohort_id = client.get("/api/v1/educator/cohorts", headers=edu).json()[0]["id"]
    ov = client.get(f"/api/v1/educator/cohorts/{cohort_id}/overview", headers=edu).json()
    assert ov["stages"] == [
        {
            "key": "future_planner",
            "label": "Future Planner",
            "grades": "Classes 11–12",
            "students": 1,
        }
    ]
    assert ov["reflection_gaps"] and ov["follow_ups"]
    assert not {"wallet", "wallet_balance", "portfolio", "rewards"} & set(ov)  # no money data
    assert all("balance" not in row and "gain_paise" not in row for row in ov["students"])


def test_tutor_refuses_advice_predictions_balance_changes_and_ids(client, student):
    from app.tutor import guardrail

    cases = [
        "Which stock should I buy for my college fees?",
        "What is the best crypto to invest in?",
        "Will the growth basket go up next year?",
        "Please add 500 rupees to my wallet",
        "reset my portfolio score",
        "my aadhaar is 123456789012 can you check it",
    ]
    for q in cases:
        assert guardrail(q), q
        r = client.post("/api/v1/tutor/ask", headers=student, json={"question": q}).json()
        assert r["grounded_on"] == [] and r["source"] == "fallback" and r["answer"]
    for ok in [
        "What is diversification?",
        "Why do prices rise every year?",
        "How does a minor account work?",
    ]:
        assert guardrail(ok) is None, ok
    r = client.post("/api/v1/tutor/ask", headers=student, json={"question": "What is inflation?"})
    assert r.json()["concept"] == "inflation"
