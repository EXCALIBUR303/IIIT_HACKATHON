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
# Generous limits so ordinary tests never trip them; rate-limit tests lower them explicitly.
for _name in (
    "RL_LOGIN_IP", "RL_LOGIN_USER", "RL_REGISTER_IP", "RL_INVITE_IP", "RL_INVITE_TOKEN",
    "RL_JOIN_IP", "RL_JOIN_STUDENT", "RL_TUTOR_HOUR", "RL_TUTOR_DAY", "RL_PASSWORD_USER",
    "RL_PORTFOLIO_HOUR",
):  # fmt: skip
    os.environ[f"RUPEERISE_{_name}"] = "100000"
os.environ["RUPEERISE_QUIZ_COOLDOWN_SECONDS"] = "0"

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
    "auth_sessions, educator_invites, organization_transfers, rate_limit_counters, "
    "explorer_progress, reflections, portfolio_round_snapshots, portfolio_transactions, "
    "portfolio_holdings, "
    "portfolios, reward_ledger, "
    "student_achievements, concept_mastery, question_responses, "
    "assessment_attempts, "
    "simulation_decisions, simulation_sessions, cohort_memberships, cohorts, "
    "student_profiles, users, organizations"
)


def pytest_collection_modifyitems(config, items):
    """Tests that assert real answers/explanations only run when the private bundle is installed."""
    from app.content import loader

    if not loader.keys_are_placeholders():
        return
    skip = pytest.mark.skip(reason="private answer keys not installed (placeholder keys active)")
    for item in items:
        if "requires_private_content" in item.keywords:
            item.add_marker(skip)


@pytest.fixture(scope="session", autouse=True)
def database():
    cfg = Config(os.path.join(os.path.dirname(__file__), "..", "alembic.ini"))
    cfg.set_main_option("script_location", os.path.join(os.path.dirname(__file__), "..", "alembic"))
    # Start from an empty schema so leftovers from earlier runs (e.g. kinds a downgrade would
    # refuse) cannot interfere, then build it with the real migrations.
    with engine.begin() as conn:
        conn.execute(text("DROP SCHEMA public CASCADE"))
        conn.execute(text("CREATE SCHEMA public"))
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


BEARER = {"X-Auth-Mode": "bearer"}  # script/test clients: token in the body, no cookies


def register_student(client, *, join_code=None, name="Test Student"):
    n = next(_counter)
    body = {"username": f"student{n}", "password": "password123", "display_name": name}
    if join_code:
        body["join_code"] = join_code
    r = client.post("/api/v1/auth/register/student", json=body, headers=BEARER)
    assert r.status_code == 201, r.text
    data = r.json()
    return {"Authorization": f"Bearer {data['access_token']}"}, data["user"]


def make_org(name="Test NGO", kind="ngo"):
    """Operators create organisations; there is no HTTP route for it."""
    from app.models import Organization

    with SessionLocal() as db:
        org = db.query(Organization).filter_by(name=name).one_or_none()
        if org is None:
            org = Organization(name=name, kind=kind)
            db.add(org)
            db.commit()
        return org.id


def make_invite(org_id, *, days=7, uses=1):
    from app.services import invites

    with SessionLocal() as db:
        invite, token = invites.create(db, org_id, days_valid=days, max_uses=uses)
        db.commit()
        return invite.id, token


def register_educator(client, org="Test NGO"):
    n = next(_counter)
    _, token = make_invite(make_org(org))
    r = client.post(
        "/api/v1/auth/register/educator",
        json={
            "username": f"educator{n}",
            "password": "password123",
            "display_name": "Teacher",
            "invite_token": token,
        },
        headers=BEARER,
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


def register_onboarded(client, **kw):
    """A student who has finished onboarding (stage chosen), as a real user would be."""
    headers, user = register_student(client, **kw)
    onboard(client, headers)
    return headers, user


def delete_account(client, headers, password="password123"):
    return client.request(
        "DELETE", "/api/v1/students/me", headers=headers, json={"current_password": password}
    )


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


def unlock_quiz(client, headers, quiz_slug):
    """Record a finished mission in the quiz's module, as playing one would."""
    import uuid
    from datetime import UTC, datetime

    from sqlalchemy import select

    from app.models import Assessment, Scenario, SimulationSession

    uid = uuid.UUID(client.get("/api/v1/auth/me", headers=headers).json()["id"])
    with SessionLocal() as db:
        module_id = db.scalar(select(Assessment.module_id).where(Assessment.slug == quiz_slug))
        scenario = db.scalar(select(Scenario).where(Scenario.module_id == module_id))
        n = db.query(SimulationSession).filter_by(student_id=uid, scenario_id=scenario.id).count()
        db.add(
            SimulationSession(
                student_id=uid,
                scenario_id=scenario.id,
                attempt_number=n + 1,
                status="completed",
                phase="done",
                seed=1,
                state={},
                score=70,
                completed_at=datetime.now(UTC),
            )
        )
        db.commit()


def backdate_attempt(attempt_id, ms):
    """Make an attempt look like it was started ``ms`` ago. The server times quizzes itself, so
    a test that claims slow answers has to actually let the time pass."""
    import uuid
    from datetime import UTC, datetime, timedelta

    from app.models import AssessmentAttempt

    with SessionLocal() as db:
        a = db.get(AssessmentAttempt, uuid.UUID(str(attempt_id)))
        a.started_at = datetime.now(UTC) - timedelta(milliseconds=ms)
        db.commit()


def answer_all(client, headers, slug, correct=True, ms=8000, unlock=True):
    if unlock and slug.startswith("quiz-"):
        from sqlalchemy import select

        from app.models import Assessment, Scenario, SimulationSession

        # Only add a mission if the student has not already finished one in this module.
        uid = client.get("/api/v1/auth/me", headers=headers).json()["id"]
        with SessionLocal() as db:
            mid = db.scalar(select(Assessment.module_id).where(Assessment.slug == slug))
            done = (
                db.query(SimulationSession)
                .join(Scenario, Scenario.id == SimulationSession.scenario_id)
                .filter(
                    SimulationSession.student_id == uid,
                    Scenario.module_id == mid,
                    SimulationSession.status == "completed",
                )
                .count()
            )
        if not done:
            unlock_quiz(client, headers, slug)
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
    backdate_attempt(data["attempt_id"], ms * len(responses) + 1000)
    r = client.post(
        f"/api/v1/assessments/attempts/{data['attempt_id']}/submit",
        headers=headers,
        json={"responses": responses},
    )
    assert r.status_code == 200, r.text
    return r.json()
