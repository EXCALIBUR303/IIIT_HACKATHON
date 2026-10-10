"""Read-only learning content: personas, concepts, modules, scenarios."""

from __future__ import annotations

from fastapi import APIRouter
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.api.deps import DB, CurrentUser
from app.content import loader
from app.core.errors import not_found
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
    """Stage for students; educators (no profile) see all content."""
    if user.role != "student":
        return None
    return stages.stage_for(user.profile.grade if user.profile else None)


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
def list_scenarios(
    db: DB, user: CurrentUser, kind: ScenarioKind | None = None
) -> list[dict]:
    q = select(Scenario).order_by(Scenario.kind, Scenario.difficulty, Scenario.slug)
    if kind:
        q = q.where(Scenario.kind == kind)
    return [scenario_summary(s) for s in db.scalars(q) if eligible(user, s)]


@router.get("/scenarios/{slug}", response_model=ScenarioDetail)
def get_scenario(slug: str, db: DB, _: CurrentUser) -> dict:
    s = db.scalar(select(Scenario).where(Scenario.slug == slug))
    if s is None:
        raise not_found("Scenario")
    config = dict(s.config)
    if s.kind == "safety":  # never leak answers
        config = {
            "messages": [safety.public_message(m) for m in safety.scenario_from_config(s.config)]
        }
    return {**scenario_summary(s), "config": config}


@router.get("/catalog/investing")
def investing_catalog(_: CurrentUser) -> dict:
    """Fictional assets and illustrative market paths for the investment explorer."""
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
