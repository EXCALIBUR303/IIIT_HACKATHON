import pytest

from app.engine.money import SimulationError
from app.learning import adaptive
from app.learning.mastery import RAPID_WEIGHT, level, smoothed
from app.learning.scoring import score_attempt
from app.models import ConceptMastery

Q = [
    {
        "slug": "q1",
        "concept": "needs_vs_wants",
        "options": [
            {"key": "a", "correct": True, "explanation": "yes"},
            {"key": "b", "misconception": "wants_as_needs", "explanation": "no"},
        ],
    },
    {
        "slug": "q2",
        "concept": "goal_setting",
        "options": [
            {"key": "a", "misconception": "goal_math_error", "explanation": "no"},
            {"key": "b", "correct": True, "explanation": "yes"},
        ],
    },
]


def test_smoothing_prevents_single_answer_mastery():
    assert smoothed(1, 1) == 0.75
    assert smoothed(0, 0) == 0.5
    assert smoothed(10, 10) > 0.95


def test_levels():
    assert level(None) == "not_started"
    row = ConceptMastery(evidence_count=1, mastery=0.9, weighted_total=1.0, weighted_correct=1.0)
    assert level(row) == "developing"  # not enough evidence for 'mastered'
    row.weighted_total = 3.0
    assert level(row) == "mastered"
    row.mastery = 0.3
    assert level(row) == "needs_practice"


def test_scoring_detects_misconceptions_and_confident_errors():
    r = score_attempt(
        Q,
        [
            {"question_slug": "q1", "option_key": "b", "confidence": "high", "response_ms": 9000},
            {"question_slug": "q2", "option_key": "b", "response_ms": 9000},
        ],
        base_weight=1.0,
    )
    assert r["correct_count"] == 1 and r["score_pct"] == 50
    assert r["misconceptions"] == ["wants_as_needs"]
    assert r["scored"][0].confident_error is True
    assert r["flagged_guessing"] is False


def test_rapid_answers_are_down_weighted_and_flagged():
    r = score_attempt(
        Q,
        [
            {"question_slug": "q1", "option_key": "a", "response_ms": 400},
            {"question_slug": "q2", "option_key": "b", "response_ms": 300},
        ],
        base_weight=1.0,
    )
    assert r["flagged_guessing"] is True
    assert all(e.weight == RAPID_WEIGHT for e in r["evidence"])


def test_retake_weight_applied():
    r = score_attempt(
        Q,
        [
            {"question_slug": "q1", "option_key": "a", "response_ms": 9000},
            {"question_slug": "q2", "option_key": "b", "response_ms": 9000},
        ],
        base_weight=1 / 3,
    )
    assert all(abs(e.weight - 1 / 3) < 1e-9 for e in r["evidence"])


@pytest.mark.parametrize(
    "responses",
    [
        [{"question_slug": "q1", "option_key": "a"}],  # incomplete
        [{"question_slug": "q1", "option_key": "a"}, {"question_slug": "q1", "option_key": "a"}],
        [{"question_slug": "q1", "option_key": "z"}, {"question_slug": "q2", "option_key": "b"}],
        [{"question_slug": "q9", "option_key": "a"}, {"question_slug": "q2", "option_key": "b"}],
    ],
)
def test_scoring_validation(responses):
    with pytest.raises(SimulationError):
        score_attempt(Q, responses, base_weight=1.0)


def snap(**kw):
    modules = [
        adaptive.ModuleProgress(
            "plan-and-budget",
            "budgeting",
            "Plan & Budget",
            1,
            ["needs_vs_wants", "budget_allocation", "goal_setting"],
            quiz_slug="quiz-plan-and-budget",
        ),
        adaptive.ModuleProgress(
            "stay-safe", "safety", "Stay Safe", 4, ["otp_pin_safety"], quiz_slug="quiz-stay-safe"
        ),
    ]
    scenarios = [
        adaptive.ScenarioInfo("budget-easy", "plan-and-budget", "Easy", 1, "meera"),
        adaptive.ScenarioInfo("budget-mid", "plan-and-budget", "Mid", 2, "lakshmi"),
        adaptive.ScenarioInfo("budget-hard", "plan-and-budget", "Hard", 3, "imran"),
        adaptive.ScenarioInfo("safety-easy", "stay-safe", "Safe", 1, None),
    ]
    base = dict(
        onboarding_completed=True,
        persona_key="meera",
        learning_level="beginner",
        initial_done=True,
        post_done=False,
        modules=modules,
        scenarios=scenarios,
        mastery={},
    )
    base.update(kw)
    return adaptive.Snapshot(**base)


def test_recommend_onboarding_then_initial():
    assert adaptive.recommend(snap(onboarding_completed=False))["kind"] == "onboarding"
    r = adaptive.recommend(snap(initial_done=False))
    assert r["kind"] == "assessment" and r["slug"] == "initial"


def test_struggling_student_gets_simpler_scenario_in_weakest_pillar():
    s = snap(
        mastery={"needs_vs_wants": (0.2, 3, "wants_as_needs"), "otp_pin_safety": (0.9, 3, None)}
    )
    r = adaptive.recommend(s)
    assert r["slug"] == "budget-easy" and r["difficulty"] == 1
    assert "treating wants as needs" in r["reason"]


def test_strong_student_gets_challenge():
    s = snap(
        mastery={
            "needs_vs_wants": (0.85, 4, None),
            "budget_allocation": (0.9, 4, None),
            "otp_pin_safety": (0.95, 4, None),
        }
    )
    r = adaptive.recommend(s)
    assert r["slug"] == "budget-hard"


def test_learning_level_used_without_evidence():
    r = adaptive.recommend(snap(learning_level="intermediate"))
    assert r["difficulty"] == 2


def test_quiz_after_simulation_then_post_assessment():
    s = snap()
    s.modules[0].completed_scenarios = {"budget-easy"}
    s.modules[1].completed_scenarios = {"safety-easy"}
    s.modules[1].quiz_best = 80
    r = adaptive.recommend(s)
    assert r["kind"] == "assessment" and r["slug"] == "quiz-plan-and-budget"
    s.modules[0].quiz_best = 40
    assert "40%" in adaptive.recommend(s)["reason"]
    s.modules[0].quiz_best = 60
    assert adaptive.recommend(s)["slug"] == "post"


def test_after_post_practise_weakest_concept():
    s = snap(
        post_done=True, mastery={"goal_setting": (0.4, 3, None), "otp_pin_safety": (0.9, 3, None)}
    )
    for m in s.modules:
        m.completed_scenarios = {"budget-easy"} if m.slug == "plan-and-budget" else {"safety-easy"}
        m.quiz_best = 90
    r = adaptive.recommend(s)
    assert r["kind"] == "scenario" and "goal setting" in r["reason"]
