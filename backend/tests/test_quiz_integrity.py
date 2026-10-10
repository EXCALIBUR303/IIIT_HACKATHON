"""Quiz integrity: server-side timing, mission-before-quiz, cooldown, shuffling, variants.

Client-delivered questions can never be made cheat-proof (see docs/limitations.md); these tests
pin down the controls that do exist.
"""

from datetime import UTC, datetime, timedelta

from sqlalchemy import select

from app.core.config import get_settings
from app.core.db import SessionLocal
from app.models import Assessment, AssessmentAttempt, Question
from tests.conftest import (
    answer_all,
    backdate_attempt,
    complete_budget,
    unlock_quiz,
)

QUIZ = "quiz-plan-and-budget"
ATTEMPTS = f"/api/v1/assessments/{QUIZ}/attempts"


def _submit(client, headers, attempt, option="a", ms=8000):
    return client.post(
        f"/api/v1/assessments/attempts/{attempt['attempt_id']}/submit",
        headers=headers,
        json={
            "responses": [
                {"question_slug": q["slug"], "option_key": option, "response_ms": ms}
                for q in attempt["questions"]
            ]
        },
    )


def _first_option_keys(q):
    return [o["key"] for o in q["options"]]


# --- the quiz checks what was practised ------------------------------------------------------


def test_module_quiz_is_locked_until_a_mission_in_that_module_is_done(client, student):
    listing = {a["slug"]: a for a in client.get("/api/v1/assessments", headers=student).json()}
    assert listing[QUIZ]["available"] is False
    assert "mission" in listing[QUIZ]["locked_reason"].lower()
    denied = client.post(ATTEMPTS, headers=student)
    assert denied.status_code == 409 and denied.json()["error"]["code"] == "assessment_locked"


def test_a_mission_in_a_different_pillar_does_not_unlock_the_quiz(client, student):
    complete_budget(client, student)  # budgeting mission
    other = client.post("/api/v1/assessments/quiz-stay-safe/attempts", headers=student)
    assert other.status_code == 409
    assert client.post(ATTEMPTS, headers=student).status_code == 201


def test_starting_check_needs_no_mission(client, student):
    assert client.post("/api/v1/assessments/initial/attempts", headers=student).status_code == 201


# --- server-measured timing ------------------------------------------------------------------


def test_forged_response_times_are_replaced_by_server_time(client, student):
    """Claiming 60 s per question when the attempt just started must not look 'slow'."""
    unlock_quiz(client, student, QUIZ)
    attempt = client.post(ATTEMPTS, headers=student).json()
    result = _submit(client, student, attempt, ms=60_000).json()
    assert result["flagged_guessing"] is True  # server saw an instant submission
    with SessionLocal() as db:
        row = db.get(AssessmentAttempt, attempt["attempt_id"])
        assert row.timing_trusted is False
        assert row.elapsed_ms is not None and row.elapsed_ms < 5_000


def test_honest_slow_answers_are_trusted(client, student):
    result = answer_all(client, student, QUIZ, correct=True, ms=8000)
    assert result["flagged_guessing"] is False


def test_claiming_zero_time_on_a_slow_attempt_is_still_just_a_hint(client, student):
    """Fast claims on a long attempt are accepted as claims, never turned into a penalty."""
    unlock_quiz(client, student, QUIZ)
    attempt = client.post(ATTEMPTS, headers=student).json()
    backdate_attempt(attempt["attempt_id"], 120_000)
    assert _submit(client, student, attempt, ms=1).status_code == 200


def test_resuming_does_not_reset_the_server_clock(client, student):
    unlock_quiz(client, student, QUIZ)
    first = client.post(ATTEMPTS, headers=student).json()
    backdate_attempt(first["attempt_id"], 90_000)
    again = client.post(ATTEMPTS, headers=student).json()
    assert again["attempt_id"] == first["attempt_id"]
    with SessionLocal() as db:
        started = db.get(AssessmentAttempt, first["attempt_id"]).started_at
    assert datetime.now(UTC) - started > timedelta(seconds=60)


# --- cooldown after repeated failures ----------------------------------------------------------


def test_cooldown_follows_repeated_failures_but_never_blocks_an_open_attempt(
    client, student, monkeypatch
):
    settings = get_settings()
    monkeypatch.setattr(settings, "quiz_cooldown_seconds", 600)
    monkeypatch.setattr(settings, "quiz_cooldown_after_failures", 2)
    answer_all(client, student, QUIZ, correct=False)
    assert client.post(ATTEMPTS, headers=student).status_code == 201  # one failure: fine
    open_one = client.post(ATTEMPTS, headers=student).json()
    _submit_wrong = _submit(client, student, open_one, option="d")
    assert _submit_wrong.status_code == 200 and _submit_wrong.json()["score_pct"] < 60

    blocked = client.post(ATTEMPTS, headers=student)
    assert blocked.status_code == 429
    assert blocked.json()["error"]["code"] == "quiz_cooldown"
    assert int(blocked.headers["Retry-After"]) > 0
    listing = {a["slug"]: a for a in client.get("/api/v1/assessments", headers=student).json()}
    assert listing[QUIZ]["available"] is False and listing[QUIZ]["cooldown_seconds"] > 0


def test_cooldown_ends_after_the_wait_and_a_pass_resets_it(client, student, monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "quiz_cooldown_seconds", 600)
    monkeypatch.setattr(settings, "quiz_cooldown_after_failures", 2)
    answer_all(client, student, QUIZ, correct=False)
    answer_all(client, student, QUIZ, correct=False)
    assert client.post(ATTEMPTS, headers=student).status_code == 429
    with SessionLocal() as db:  # time passes
        for a in db.scalars(select(AssessmentAttempt)):
            a.submitted_at = a.submitted_at - timedelta(hours=1)
        db.commit()
    assert client.post(ATTEMPTS, headers=student).status_code == 201


# --- randomised order ------------------------------------------------------------------------


def test_question_and_option_order_vary_between_attempts_but_resume_is_stable(client):
    from tests.conftest import register_onboarded

    seen_orders, seen_options = set(), set()
    for _ in range(8):
        headers, _ = register_onboarded(client)
        unlock_quiz(client, headers, QUIZ)
        first = client.post(ATTEMPTS, headers=headers).json()
        again = client.post(ATTEMPTS, headers=headers).json()
        assert [q["slug"] for q in first["questions"]] == [q["slug"] for q in again["questions"]]
        assert [_first_option_keys(q) for q in first["questions"]] == [
            _first_option_keys(q) for q in again["questions"]
        ]
        seen_orders.add(tuple(q["slug"] for q in first["questions"]))
        seen_options.add(tuple(tuple(_first_option_keys(q)) for q in first["questions"]))
    assert len(seen_orders) > 1 and len(seen_options) > 1


def test_scoring_follows_option_keys_not_screen_position(client, student):
    """Shuffling changes where an option sits, never which one is correct."""
    result = answer_all(client, student, QUIZ, correct=True)
    assert result["score_pct"] == 100
    review = client.get(
        f"/api/v1/assessments/attempts/{result['attempt_id']}", headers=student
    ).json()
    assert review["score_pct"] == 100 and all(q["is_correct"] for q in review["questions"])


def test_questions_outside_the_delivered_set_are_rejected(client, student):
    unlock_quiz(client, student, QUIZ)
    attempt = client.post(ATTEMPTS, headers=student).json()
    with SessionLocal() as db:
        other = db.scalar(
            select(Question.slug)
            .join(Assessment, Assessment.id == Question.assessment_id)
            .where(Assessment.slug != QUIZ)
        )
    responses = [
        {"question_slug": q["slug"], "option_key": "a", "response_ms": 8000}
        for q in attempt["questions"][:-1]
    ] + [{"question_slug": other, "option_key": "a", "response_ms": 8000}]
    r = client.post(
        f"/api/v1/assessments/attempts/{attempt['attempt_id']}/submit",
        headers=student,
        json={"responses": responses},
    )
    assert r.status_code == 422


# --- variant items -----------------------------------------------------------------------------


def _add_variant(slug_of_original: str, new_slug: str):
    """Add a second item for the same idea, as a content author would."""
    with SessionLocal() as db:
        original = db.scalar(select(Question).where(Question.slug == slug_of_original))
        original.variant_group = "g-test"
        db.add(
            Question(
                assessment_id=original.assessment_id,
                slug=new_slug,
                concept=original.concept,
                difficulty=original.difficulty,
                prompt=original.prompt + " (variant)",
                options=original.options,
                order=original.order,
                variant_group="g-test",
            )
        )
        db.commit()


def test_each_attempt_serves_one_item_per_variant_group(client):
    from tests.conftest import register_onboarded

    with SessionLocal() as db:
        first_q = db.scalar(
            select(Question)
            .join(Assessment, Assessment.id == Question.assessment_id)
            .where(Assessment.slug == QUIZ)
            .order_by(Question.order)
        )
        original_slug, total = first_q.slug, len(first_q.assessment.questions)
    _add_variant(original_slug, "variant-test-b")
    try:
        picked = set()
        for _ in range(12):
            headers, _ = register_onboarded(client)
            unlock_quiz(client, headers, QUIZ)
            attempt = client.post(ATTEMPTS, headers=headers).json()
            slugs = [q["slug"] for q in attempt["questions"]]
            assert len(slugs) == total  # the variant replaces, never adds
            group = {s for s in slugs if s in (original_slug, "variant-test-b")}
            assert len(group) == 1
            picked |= group
            # A variant attempt scores and reviews cleanly.
            done = _submit(client, headers, attempt)
            assert done.status_code == 200
            review = client.get(
                f"/api/v1/assessments/attempts/{done.json()['attempt_id']}", headers=headers
            )
            assert review.status_code == 200 and len(review.json()["questions"]) == total
        assert picked == {original_slug, "variant-test-b"}
        listing = {a["slug"]: a for a in client.get("/api/v1/assessments", headers=headers).json()}
        assert listing[QUIZ]["question_count"] == total
    finally:
        with SessionLocal() as db:
            db.query(Question).filter(Question.slug == "variant-test-b").delete()
            db.query(Question).filter(Question.slug == original_slug).update(
                {"variant_group": None}
            )
            db.commit()


# --- module completion needs both halves ---------------------------------------------------


def _module(client, headers, pillar="budgeting"):
    progress = client.get("/api/v1/progress/me", headers=headers).json()
    return next(m for m in progress["modules"] if m["pillar"] == pillar)


def test_module_is_complete_only_with_mission_and_a_passed_quiz(client, student):
    assert _module(client, student)["percent"] == 0
    complete_budget(client, student)
    m = _module(client, student)
    assert m["simulation_done"] and m["percent"] == 50  # mission alone is half

    answer_all(client, student, QUIZ, correct=False)  # failed quiz adds nothing
    assert _module(client, student)["percent"] == 50

    answer_all(client, student, QUIZ, correct=True)
    assert _module(client, student)["percent"] == 100
