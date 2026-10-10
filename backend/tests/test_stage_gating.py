"""Stage gating is enforced by the server on every route, and never claims to be verified."""

import pytest

from app.learning import stages
from tests.conftest import register_educator, register_student

PROFILE = "/api/v1/students/me/profile"
INVESTING = "investing-time-horizon"
CATALOG = "/api/v1/catalog/investing"
CALC = "/api/v1/calculators"
SIM = {"amount": 1000, "allocation": {"steady_deposit": 100}, "horizon_years": 5}
SAVINGS = {"monthly_deposit": 100, "months": 12, "annual_rate": 0.06, "opening_balance": 0}
HEAD = {"monthly_deposit": 100, "annual_rate": 0.08, "total_years": 20, "delay_years": 5}


def at_grade(client, grade):
    headers, _ = register_student(client)
    body = {"grade": grade, "persona_key": "meera", "onboarding_completed": True}
    assert client.put(PROFILE, headers=headers, json=body).status_code == 200
    return headers


def code(r):
    return r.json()["error"]["code"]


# --- a student with no class gets nothing stage-specific --------------------------------------


def test_a_missing_grade_never_defaults_to_an_older_stage():
    assert stages.stage_for(None) == stages.EXPLORER


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("get", "/api/v1/scenarios"),
        ("get", f"/api/v1/scenarios/{INVESTING}"),
        ("get", "/api/v1/modules"),
        ("get", CATALOG),
        ("get", "/api/v1/assessments"),
        ("get", "/api/v1/progress/me"),
        ("get", "/api/v1/portfolio"),
        ("get", "/api/v1/wallet"),
    ],
)
def test_ungraded_student_is_refused_on_stage_gated_routes(client, method, path):
    headers, _ = register_student(client)
    r = getattr(client, method)(path, headers=headers)
    assert r.status_code == 403 and code(r) == "stage_required", (path, r.text)


def test_ungraded_student_can_still_reach_profile_to_choose_a_class(client):
    headers, _ = register_student(client)
    assert client.get(PROFILE, headers=headers).status_code == 200
    assert client.put(PROFILE, headers=headers, json={"grade": 9}).status_code == 200


def test_cannot_finish_onboarding_without_a_class(client):
    headers, _ = register_student(client)
    r = client.put(
        PROFILE, headers=headers, json={"persona_key": "meera", "onboarding_completed": True}
    )
    assert r.status_code == 422 and code(r) == "grade_required"


# --- younger stages cannot reach older material, by list, detail or API -----------------------


@pytest.mark.parametrize("grade", [7, 8, 9, 10])
def test_pre_investing_stages_cannot_open_investing_by_any_route(client, grade):
    h = at_grade(client, grade)
    assert INVESTING not in {s["slug"] for s in client.get("/api/v1/scenarios", headers=h).json()}
    detail = client.get(f"/api/v1/scenarios/{INVESTING}", headers=h)
    assert detail.status_code == 403
    start = client.post(
        "/api/v1/simulations/sessions", headers=h, json={"scenario_slug": INVESTING}
    )
    assert start.status_code == 403
    assert client.get(CATALOG, headers=h).status_code == 403
    assert client.post(f"{CALC}/investment", headers=h, json=SIM).status_code == 403
    assert client.get("/api/v1/portfolio", headers=h).json()["access"]["open"] is False


@pytest.mark.parametrize("grade", [7, 8])
def test_explorer_cannot_use_saving_calculators(client, grade):
    h = at_grade(client, grade)
    assert client.post(f"{CALC}/savings", headers=h, json=SAVINGS).status_code == 403
    assert client.post(f"{CALC}/head-start", headers=h, json=HEAD).status_code == 403


@pytest.mark.parametrize("grade", [9, 10])
def test_builder_can_use_saving_calculators_but_not_investing(client, grade):
    h = at_grade(client, grade)
    assert client.post(f"{CALC}/savings", headers=h, json=SAVINGS).status_code == 200
    assert client.post(f"{CALC}/head-start", headers=h, json=HEAD).status_code == 200
    assert client.post(f"{CALC}/investment", headers=h, json=SIM).status_code == 403


@pytest.mark.parametrize("grade", [11, 12, 13])
def test_older_stages_reach_investing_content(client, grade):
    h = at_grade(client, grade)
    assert client.get(f"/api/v1/scenarios/{INVESTING}", headers=h).status_code == 200
    assert client.get(CATALOG, headers=h).status_code == 200
    assert client.post(f"{CALC}/investment", headers=h, json=SIM).status_code == 200


def test_portfolio_trades_are_refused_below_future_planner(client):
    h = at_grade(client, 10)
    r = client.post("/api/v1/portfolio/open", headers=h, json={"request_id": "stage-gate-test-1"})
    assert r.status_code in (403, 409), r.text


def test_educators_may_preview_all_content(client):
    headers = register_educator(client)
    assert client.get(CATALOG, headers=headers).status_code == 200
    assert client.get(f"/api/v1/scenarios/{INVESTING}", headers=headers).status_code == 200


# --- the class is self-declared: it can't be flipped back and forth to unlock content --------


def test_class_changes_are_locked_after_onboarding(client):
    h = at_grade(client, 8)
    r = client.put(PROFILE, headers=h, json={"grade": 12})
    assert r.status_code == 409 and code(r) == "grade_locked"
    assert client.get(CATALOG, headers=h).status_code == 403  # still Explorer
    # Re-sending the same class is harmless.
    assert client.put(PROFILE, headers=h, json={"grade": 8}).status_code == 200


def test_profile_says_the_class_is_self_declared(client):
    h = at_grade(client, 11)
    stage = client.get(PROFILE, headers=h).json()["stage"]
    assert stage["key"] == "future_planner"
    assert "verified" not in (stage.get("tagline") or "").lower().replace("not verified", "")
