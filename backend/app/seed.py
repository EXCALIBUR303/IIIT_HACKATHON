"""Seed learning content (idempotent upsert by slug) and optional SAMPLE demo data.

    uv run python -m app.seed            # content only (safe in every environment)
    uv run python -m app.seed --demo     # + clearly labelled sample org, educator, students

Sample students play through real simulations and assessments via the same
services the API uses, so the educator dashboard shows computed (not invented)
numbers. Sample data is refused when RUPEERISE_ENV=production.
"""

from __future__ import annotations

import argparse
import sys

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.content import loader
from app.core.config import get_settings
from app.core.db import SessionLocal
from app.core.security import hash_password
from app.models import (
    Achievement,
    Assessment,
    Cohort,
    CohortMembership,
    LearningModule,
    Organization,
    Question,
    Scenario,
    StudentProfile,
    User,
)

DEMO_PASSWORD = "rupeerise-demo"  # local development sample accounts only
DEMO_ORG = "Sample NGO (demo data)"


def upsert(db: Session, model, slug: str, **fields):
    row = db.scalar(select(model).where(model.slug == slug))
    if row is None:
        row = model(slug=slug, **fields)
        db.add(row)
    else:
        for k, v in fields.items():
            setattr(row, k, v)
    return row


def seed_content(db: Session) -> None:
    modules = {}
    for m in loader.modules():
        modules[m["slug"]] = upsert(
            db,
            LearningModule,
            m["slug"],
            pillar=m["pillar"],
            title=m["title"],
            summary=m["summary"],
            order=m["order"],
            objectives=m["objectives"],
            concepts=m["concepts"],
        )
    db.flush()
    for s in loader.scenarios():
        upsert(
            db,
            Scenario,
            s["slug"],
            module_id=modules[s["module"]].id,
            kind=s["kind"],
            title=s["title"],
            intro=s["intro"],
            objective=s["objective"],
            difficulty=s["difficulty"],
            persona_key=s["persona"],
            config=s["config"],
        )
    for a in loader.assessments():
        assessment = upsert(
            db,
            Assessment,
            a["slug"],
            kind=a["kind"],
            module_id=modules[a["module"]].id if a["module"] else None,
            title=a["title"],
            description=a["description"],
        )
        db.flush()
        for i, q in enumerate(a["questions"]):
            upsert(
                db,
                Question,
                q["slug"],
                assessment_id=assessment.id,
                concept=q["concept"],
                difficulty=q["difficulty"],
                prompt=q["prompt"],
                options=q["options"],
                order=i,
            )
    for a in loader.achievements():
        upsert(
            db,
            Achievement,
            a["slug"],
            title=a["title"],
            description=a["description"],
            icon=a["icon"],
        )
    db.commit()


def _play(db: Session, user: User, profile: dict) -> None:
    """Drive real services for a sample student (deterministic choices)."""
    from app.services import assessments, simulations

    def take(slug: str, accuracy: float, ms: int = 9000):
        a = db.scalar(select(Assessment).where(Assessment.slug == slug))
        attempt = assessments.start(db, user, a)
        responses = []
        for i, q in enumerate(a.questions):
            correct = next(o["key"] for o in q.options if o.get("correct"))
            wrong = next(o["key"] for o in q.options if not o.get("correct"))
            ok = (i * 37 % 100) / 100 < accuracy
            responses.append(
                {"question_slug": q.slug, "option_key": correct if ok else wrong, "response_ms": ms}
            )
        assessments.submit(db, user, attempt, responses)
        db.commit()

    def run(slug: str, decisions: list[tuple[str, dict]]):
        sc = db.scalar(select(Scenario).where(Scenario.slug == slug))
        session = simulations.start(db, user, sc)
        db.commit()
        for dtype, payload in decisions:
            simulations.decide(db, user, session, dtype, payload)
            db.commit()

    take("initial", profile["initial"])
    good = profile["careful"]
    run(
        "budget-meera-pocket-money",
        [
            (
                "allocate",
                {
                    "allocations": {
                        "bus_pass": 600,
                        "lunch": 400,
                        "stationery": 200,
                        "recharge": 149,
                        "outings": 150 if good else 450,
                        "gaming": 50 if good else 200,
                        "savings": 400 if good else 0,
                    }
                },
            ),
            ("respond_event", {"response": "mix" if good else "borrow"}),
        ],
    )
    take("quiz-plan-and-budget", profile["quiz"])
    if profile["pillars"] >= 2:
        run(
            "savings-meera-calculator",
            [
                (
                    "plan",
                    {
                        "goal_saving": 400 if good else 500,
                        "emergency_saving": 150 if good else 0,
                        "account": "savings_account" if good else "piggy_bank",
                    },
                ),
                ("respond_event", {"source": "emergency_fund" if good else "goal_savings"}),
            ],
        )
        take("quiz-save-and-manage", profile["quiz"])
    if profile["pillars"] >= 3:
        run(
            "safety-inbox-basics",
            [
                (
                    "classify",
                    {
                        "message_id": "lottery",
                        "verdict": "scam",
                        "flags": ["too_good", "upfront_fee"],
                        "action": "report_block",
                    },
                ),
                (
                    "classify",
                    {
                        "message_id": "bank_otp",
                        "verdict": "genuine" if good else "scam",
                        "flags": [],
                        "action": "proceed_normally" if good else "ignore_delete",
                    },
                ),
                (
                    "classify",
                    {
                        "message_id": "kyc_block",
                        "verdict": "scam" if good else "genuine",
                        "flags": ["urgency", "suspicious_link"] if good else [],
                        "action": "verify_official" if good else "follow_link",
                    },
                ),
                (
                    "classify",
                    {
                        "message_id": "school_notice",
                        "verdict": "genuine",
                        "flags": [],
                        "action": "proceed_normally",
                    },
                ),
            ],
        )
        take("quiz-stay-safe", profile["quiz"])
    if profile["pillars"] >= 4:
        run(
            "investing-time-horizon",
            [
                (
                    "allocate",
                    {
                        "allocation": {
                            "steady_deposit": 30,
                            "balanced_basket": 40,
                            "growth_basket": 30,
                        },
                        "horizon_years": 10,
                    },
                ),
                ("respond_event", {"action": "hold"}),
            ],
        )
        take("quiz-understand-investing", profile["quiz"])
        take("post", min(1.0, profile["initial"] + 0.25))


def seed_demo(db: Session) -> None:
    if get_settings().is_production:
        sys.exit("Refusing to create sample data in production")
    org = db.scalar(select(Organization).where(Organization.name == DEMO_ORG))
    if org:
        print("Sample data already present; skipping")
        return
    org = Organization(name=DEMO_ORG, kind="ngo", city="Hyderabad")
    db.add(org)
    db.flush()
    educator = User(
        username="demo.educator",
        password_hash=hash_password(DEMO_PASSWORD),
        role="educator",
        display_name="Sample Coordinator",
        organization_id=org.id,
    )
    db.add(educator)
    db.flush()
    cohort = Cohort(
        organization_id=org.id,
        educator_id=educator.id,
        name="Sample Class 12-A",
        join_code="DEMO12",
    )
    db.add(cohort)
    db.flush()
    students = [
        ("demo.student", "Sample Student", "meera", None),
        (
            "sample.ananya",
            "Ananya (sample)",
            "meera",
            {"initial": 0.35, "quiz": 0.8, "careful": True, "pillars": 4},
        ),
        (
            "sample.kiran",
            "Kiran (sample)",
            "arjun",
            {"initial": 0.5, "quiz": 0.6, "careful": True, "pillars": 3},
        ),
        (
            "sample.farah",
            "Farah (sample)",
            "lakshmi",
            {"initial": 0.25, "quiz": 0.4, "careful": False, "pillars": 2},
        ),
        (
            "sample.ravi",
            "Ravi (sample)",
            "imran",
            {"initial": 0.6, "quiz": 0.9, "careful": True, "pillars": 4},
        ),
        (
            "sample.divya",
            "Divya (sample)",
            "lakshmi",
            {"initial": 0.3, "quiz": 0.5, "careful": False, "pillars": 1},
        ),
    ]
    for username, name, persona, profile in students:
        user = User(
            username=username,
            password_hash=hash_password(DEMO_PASSWORD),
            role="student",
            display_name=name,
            organization_id=org.id,
        )
        user.profile = StudentProfile(
            grade=12,
            language="en",
            learning_level="beginner",
            persona_key=persona,
            onboarding_completed=profile is not None,
            preferences={},
        )
        db.add(user)
        db.flush()
        db.add(CohortMembership(cohort_id=cohort.id, student_id=user.id))
        db.commit()
        if profile:
            _play(db, user, profile)
    print(f"Sample data created. Logins (password '{DEMO_PASSWORD}'): demo.student, demo.educator")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--demo", action="store_true", help="also create labelled sample data")
    args = parser.parse_args()
    with SessionLocal() as db:
        seed_content(db)
        print("Content seeded")
        if args.demo:
            seed_demo(db)


if __name__ == "__main__":
    main()
