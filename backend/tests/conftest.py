"""Test fixtures.

API tests run against a real PostgreSQL database (default: rupeerise_test) so
constraints, JSONB and cascades behave exactly as in production. The schema is
built with the real Alembic migrations, which doubles as a migration test.
"""

from __future__ import annotations

import os

os.environ.setdefault(
    "RUPEERISE_DATABASE_URL",
    os.environ.get("TEST_DATABASE_URL", "postgresql+psycopg://localhost:5432/rupeerise_test"),
)
os.environ["RUPEERISE_BCRYPT_ROUNDS"] = "4"
os.environ["RUPEERISE_ANTHROPIC_API_KEY"] = ""
os.environ["RUPEERISE_EDUCATOR_INVITE_CODE"] = "test-invite"

import itertools  # noqa: E402

import pytest  # noqa: E402
from alembic.config import Config  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import text  # noqa: E402

from alembic import command  # noqa: E402
from app.core.db import SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.seed import seed_content  # noqa: E402

USER_TABLES = (
    "reflections, portfolio_transactions, portfolio_holdings, portfolios, reward_ledger, "
    "student_achievements, concept_mastery, question_responses, "
    "assessment_attempts, "
    "simulation_decisions, simulation_sessions, cohort_memberships, cohorts, "
    "student_profiles, users, organizations"
)


@pytest.fixture(scope="session", autouse=True)
def database():
    cfg = Config(os.path.join(os.path.dirname(__file__), "..", "alembic.ini"))
    cfg.set_main_option("script_location", os.path.join(os.path.dirname(__file__), "..", "alembic"))
    command.downgrade(cfg, "base")
    command.upgrade(cfg, "head")
    with SessionLocal() as db:
        seed_content(db)
    yield
    engine.dispose()


@pytest.fixture(autouse=True)
def clean_user_data():
    yield
    with engine.begin() as conn:
        conn.execute(text(f"TRUNCATE {USER_TABLES} RESTART IDENTITY CASCADE"))


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


_counter = itertools.count()


def register_student(client, *, join_code=None, name="Test Student"):
    n = next(_counter)
    body = {"username": f"student{n}", "password": "password123", "display_name": name}
    if join_code:
        body["join_code"] = join_code
    r = client.post("/api/v1/auth/register/student", json=body)
    assert r.status_code == 201, r.text
    data = r.json()
    return {"Authorization": f"Bearer {data['access_token']}"}, data["user"]


def register_educator(client, org="Test NGO"):
    n = next(_counter)
    r = client.post(
        "/api/v1/auth/register/educator",
        json={
            "username": f"educator{n}",
            "password": "password123",
            "display_name": "Teacher",
            "invite_code": "test-invite",
            "organization_name": org,
        },
    )
    assert r.status_code == 201, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def onboard(client, headers, persona="meera", level="beginner"):
    r = client.put(
        "/api/v1/students/me/profile",
        headers=headers,
        json={
            "grade": 12,
            "language": "en",
            "learning_level": level,
            "persona_key": persona,
            "onboarding_completed": True,
        },
    )
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture
def student(client):
    headers, user = register_student(client)
    onboard(client, headers)
    return headers


GOOD_BUDGET = {
    "bus_pass": 600,
    "lunch": 400,
    "stationery": 200,
    "recharge": 149,
    "outings": 150,
    "gaming": 50,
    "savings": 400,
}


def complete_budget(client, headers, allocations=None, response="mix"):
    s = client.post(
        "/api/v1/simulations/sessions",
        headers=headers,
        json={"scenario_slug": "budget-meera-pocket-money"},
    ).json()
    r = client.post(
        f"/api/v1/simulations/sessions/{s['id']}/decisions",
        headers=headers,
        json={"type": "allocate", "payload": {"allocations": allocations or GOOD_BUDGET}},
    )
    assert r.status_code == 200, r.text
    options = {o["key"]: o for o in r.json()["state"]["options"]}
    choice = response if options.get(response, {}).get("feasible") else "borrow"
    r = client.post(
        f"/api/v1/simulations/sessions/{s['id']}/decisions",
        headers=headers,
        json={"type": "respond_event", "payload": {"response": choice}},
    )
    assert r.status_code == 200, r.text
    return r.json()


def answer_all(client, headers, slug, correct=True, ms=8000):
    start = client.post(f"/api/v1/assessments/{slug}/attempts", headers=headers)
    assert start.status_code == 201, start.text
    data = start.json()
    from app.content import loader

    keys = {}
    for a in loader.assessments():
        for q in a["questions"]:
            ok = next(o["key"] for o in q["options"] if o.get("correct"))
            bad = next(o["key"] for o in q["options"] if not o.get("correct"))
            keys[q["slug"]] = ok if correct else bad
    responses = [
        {"question_slug": q["slug"], "option_key": keys[q["slug"]], "response_ms": ms}
        for q in data["questions"]
    ]
    r = client.post(
        f"/api/v1/assessments/attempts/{data['attempt_id']}/submit",
        headers=headers,
        json={"responses": responses},
    )
    assert r.status_code == 200, r.text
    return r.json()
