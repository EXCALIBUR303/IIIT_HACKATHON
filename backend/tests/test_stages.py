import os

import pytest
from alembic.config import Config
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from alembic import command
from app.core.db import SessionLocal
from app.learning import stages
from app.seed import seed_content


@pytest.mark.parametrize(
    ("grade", "stage"),
    [
        (7, "explorer"),
        (8, "explorer"),
        (9, "builder"),
        (10, "builder"),
        (11, "future_planner"),
        (12, "future_planner"),
        (13, "investor_sandbox"),
        (None, "future_planner"),
    ],
)
def test_stage_for_grade(grade, stage):
    assert stage_is_known(stages.stage_for(grade)) == stage


def stage_is_known(stage):
    assert stage in stages.STAGES
    return stage


def test_eligibility_rules():
    assert stages.is_eligible("explorer", None)
    assert stages.is_eligible("explorer", [])
    assert stages.is_eligible("builder", ["builder", "future_planner"])
    assert not stages.is_eligible("explorer", ["future_planner"])


def test_portfolio_quest_opens_at_future_planner():
    assert not stages.info("explorer").portfolio_quest
    assert not stages.info("builder").portfolio_quest
    assert stages.info("future_planner").portfolio_quest
    assert stages.info("investor_sandbox").portfolio_quest


def test_existing_scenarios_default_to_pilot_stages():
    with SessionLocal() as db:
        rows = db.execute(text("SELECT stages FROM scenarios")).scalars().all()
    assert rows, "content should be seeded"
    assert all("future_planner" in r for r in rows)


def test_grade_constraint_accepts_7_to_13_and_rejects_others(client):
    client.post(
        "/api/v1/auth/register/student",
        json={"username": "grade7", "password": "password123", "display_name": "G7"},
    )
    with SessionLocal() as db:
        db.execute(text("UPDATE student_profiles SET grade = 7"))
        db.commit()
        for bad in (6, 14):
            with pytest.raises(IntegrityError, match="grade"):
                db.execute(text("UPDATE student_profiles SET grade = :g"), {"g": bad})
            db.rollback()


def test_migration_downgrade_and_upgrade_round_trip():
    cfg = Config(os.path.join(os.path.dirname(__file__), "..", "alembic.ini"))
    cfg.set_main_option("script_location", os.path.join(os.path.dirname(__file__), "..", "alembic"))
    command.downgrade(cfg, "0001")
    command.upgrade(cfg, "head")
    with SessionLocal() as db:  # the round trip drops content; restore it for later tests
        seed_content(db)


def _register(client, username):
    r = client.post(
        "/api/v1/auth/register/student",
        json={"username": username, "password": "password123", "display_name": username},
    )
    h = {"Authorization": f"Bearer {r.json()['access_token']}"}
    return h


def test_profile_reports_stage_and_explorer_sees_fewer_scenarios(client):
    h = _register(client, "kid7")
    assert client.get("/api/v1/students/me/profile", headers=h).json()["stage"]["key"] == (
        "future_planner"
    )
    r = client.put("/api/v1/students/me/profile", headers=h, json={"grade": 7})
    assert r.status_code == 200, r.text
    assert r.json()["stage"]["key"] == "explorer"
    assert r.json()["stage"]["portfolio_quest"] is False
    slugs = {s["slug"] for s in client.get("/api/v1/scenarios", headers=h).json()}
    assert slugs == {"budget-meera-pocket-money", "safety-inbox-basics"}


def test_ineligible_scenario_cannot_be_started_but_pilot_students_unaffected(client):
    kid = _register(client, "kid8")
    client.put("/api/v1/students/me/profile", headers=kid, json={"grade": 8})
    r = client.post(
        "/api/v1/simulations/sessions",
        headers=kid,
        json={"scenario_slug": "investing-time-horizon"},
    )
    assert r.status_code == 403
    pilot = _register(client, "pilot12")
    client.put("/api/v1/students/me/profile", headers=pilot, json={"grade": 12})
    r = client.post(
        "/api/v1/simulations/sessions",
        headers=pilot,
        json={"scenario_slug": "investing-time-horizon"},
    )
    assert r.status_code == 201


def test_recommendation_only_offers_eligible_scenarios(client):
    h = _register(client, "kid9")
    client.put(
        "/api/v1/students/me/profile",
        headers=h,
        json={"grade": 9, "persona_key": "meera", "onboarding_completed": True},
    )
    elig = {s["slug"] for s in client.get("/api/v1/scenarios", headers=h).json()}
    rec = client.get("/api/v1/progress/me/recommendation", headers=h).json()
    if rec["kind"] == "scenario":
        assert rec["slug"] in elig
