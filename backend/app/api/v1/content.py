"""Read-only learning content: personas, concepts, modules, scenarios."""

from __future__ import annotations

from fastapi import APIRouter
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.api.deps import DB, CurrentUser
from app.content import loader
from app.core.errors import ApiError, forbidden, not_found
from app.engine import investing, safety
from app.learning import stages
from app.models import Assessment, LearningModule, Scenario, User
from app.schemas import (
    ConceptOut,
    ModuleOut,
    PersonaOut,
    ScenarioDetail,
    ScenarioKind,
    ScenarioSummary,
)

router = APIRouter(tags=["content"])


def stage_of(user: User) -> str | None:
    """Stage for students; educators (no profile) see all content.

    A student who has not chosen a class gets 403 ``stage_required`` rather than a default stage.
    """
    if user.role != "student":
        return None
    grade = user.profile.grade if user.profile else None
    if grade is None:
        raise ApiError(
            403, "stage_required", "Choose your class to unlock your learning stage first", "grade"
        )
    return stages.stage_for(grade)


def require_pillar(user: User, pillar: str) -> None:
    """Stop a student from reaching a pillar their stage has not opened (educators may preview)."""
    stage = stage_of(user)
    if stage is not None and pillar not in stages.info(stage).pillars:
        raise forbidden("This topic opens at a later learning stage.")


def eligible(user: User, s: Scenario) -> bool:
    stage = stage_of(user)
    return stage is None or stages.is_eligible(stage, s.stages)


def scenario_summary(s: Scenario) -> dict:
    return {
        "slug": s.slug,
        "kind": s.kind,
        "title": s.title,
        "intro": s.intro,
        "objective": s.objective,
        "difficulty": s.difficulty,
        "persona_key": s.persona_key,
        "module_slug": s.module.slug,
        "pillar": s.module.pillar,
        "stages": s.stages,
    }


@router.get("/personas", response_model=list[PersonaOut])
def personas() -> list[dict]:
    """Fictional personas students can learn alongside (public, used in onboarding)."""
    return loader.personas()


@router.get("/concepts", response_model=list[ConceptOut])
def concepts() -> list[dict]:
    return loader.concepts()


@router.get("/modules", response_model=list[ModuleOut])
def modules(db: DB, user: CurrentUser) -> list[dict]:
    quizzes = {
        a.module_id: a.slug
        for a in db.scalars(select(Assessment).where(Assessment.kind == "module"))
    }
    out = []
    for m in db.scalars(
        select(LearningModule)
        .options(selectinload(LearningModule.scenarios))
        .order_by(LearningModule.order)
    ):
        out.append(
            {
                "slug": m.slug,
                "pillar": m.pillar,
                "title": m.title,
                "summary": m.summary,
                "order": m.order,
                "objectives": m.objectives,
                "concepts": m.concepts,
                "quiz_slug": quizzes.get(m.id),
                "scenarios": [
                    scenario_summary(s)
                    for s in sorted(m.scenarios, key=lambda s: (s.difficulty, s.slug))
                    if eligible(user, s)
                ],
            }
        )
    return out


@router.get("/scenarios", response_model=list[ScenarioSummary])
def list_scenarios(db: DB, user: CurrentUser, kind: ScenarioKind | None = None) -> list[dict]:
    q = select(Scenario).order_by(Scenario.kind, Scenario.difficulty, Scenario.slug)
    if kind:
        q = q.where(Scenario.kind == kind)
    return [scenario_summary(s) for s in db.scalars(q) if eligible(user, s)]


@router.get("/scenarios/{slug}", response_model=ScenarioDetail)
def get_scenario(slug: str, db: DB, user: CurrentUser) -> dict:
    s = db.scalar(select(Scenario).where(Scenario.slug == slug))
    if s is None:
        raise not_found("Scenario")
    # Same rule as starting it, so the detail route cannot be used to read ahead.
    if not eligible(user, s):
        raise forbidden("This scenario is not part of your learning stage yet.")
    config = dict(s.config)
    if s.kind == "safety":  # never leak answers
        config = {
            "messages": [safety.public_message(m) for m in safety.scenario_from_config(s.config)]
        }
    return {**scenario_summary(s), "config": config}


@router.get("/catalog/investing")
def investing_catalog(user: CurrentUser) -> dict:
    """Fictional assets and illustrative market paths for the investment explorer."""
    require_pillar(user, "investing")
    return {
        "assets": [
            {
                "key": a.key,
                "label": a.label,
                "description": a.description,
                "risk_level": a.risk_level,
                "single_company": a.single_company,
            }
            for a in investing.ASSETS.values()
        ],
        "horizons": list(investing.HORIZONS),
        "paths": investing.market_paths(),
        "disclaimer": investing.DISCLAIMER,
    }


@router.get("/catalog/safety")
def safety_catalog(_: CurrentUser) -> dict:
    return safety.catalog()
