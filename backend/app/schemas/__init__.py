"""Pydantic request/response schemas: the stable API contract (see docs/api-contracts.md).

Kind-specific simulation ``state`` and ``result`` payloads are documented in
docs/api-contracts.md and mirrored as TypeScript types in
frontend/src/lib/api/types.ts.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

Role = Literal["student", "educator", "admin"]
Language = Literal["en", "hi", "te"]
LearningLevel = Literal["beginner", "intermediate", "advanced"]
Pillar = Literal["budgeting", "saving", "investing", "safety"]
ScenarioKind = Literal["budget", "savings", "investing", "safety", "money_lab"]

USERNAME_PATTERN = r"^[a-zA-Z0-9_.-]{3,40}$"


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# --- Auth -----------------------------------------------------------------


class StudentRegister(BaseModel):
    username: str = Field(pattern=USERNAME_PATTERN, description="3-40 letters, digits, _ . -")
    password: str = Field(min_length=8, max_length=64)
    display_name: str = Field(min_length=1, max_length=40, description="A first name or nickname")
    join_code: str | None = Field(default=None, max_length=12)

    @field_validator("display_name")
    @classmethod
    def strip_name(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("display name cannot be blank")
        return v


class EducatorRegister(StudentRegister):
    invite_code: str = Field(min_length=1, max_length=64)
    organization_name: str = Field(min_length=2, max_length=120)


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=40)
    password: str = Field(min_length=1, max_length=64)


class UserOut(ORM):
    id: uuid.UUID
    username: str
    display_name: str
    role: Role
    organization_id: int | None = None


class TokenOut(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"
    expires_in: int
    user: UserOut


# --- Student profile ------------------------------------------------------


class Preferences(BaseModel):
    large_text: bool = False
    reduced_motion: bool = False
    high_contrast: bool = False
    show_hints: bool = True


class StageOut(BaseModel):
    key: str
    label: str
    grades: str
    tagline: str
    portfolio_quest: bool


class ProfileOut(BaseModel):
    user: UserOut
    grade: int | None
    stage: StageOut
    language: Language
    learning_level: LearningLevel
    persona_key: str | None
    onboarding_completed: bool
    preferences: Preferences
    cohorts: list[dict[str, Any]] = []


class ProfileUpdate(BaseModel):
    display_name: str | None = Field(default=None, min_length=1, max_length=40)
    grade: Literal[7, 8, 9, 10, 11, 12, 13] | None = None
    language: Language | None = None
    learning_level: LearningLevel | None = None
    persona_key: str | None = Field(default=None, max_length=30)
    onboarding_completed: bool | None = None
    preferences: Preferences | None = None


class JoinCohort(BaseModel):
    join_code: str = Field(min_length=4, max_length=12)


# --- Content --------------------------------------------------------------


class PersonaOut(BaseModel):
    key: str
    name: str
    age: int
    grade: str
    area: str
    situation: str
    money_source: str
    monthly_money: int
    goal: str
    maturity: LearningLevel
    color: str


class ConceptOut(BaseModel):
    key: str
    pillar: Pillar
    title: str
    explanation: str
    example: str


class ScenarioSummary(ORM):
    slug: str
    kind: ScenarioKind
    title: str
    intro: str
    objective: str
    difficulty: int
    persona_key: str | None
    module_slug: str
    pillar: Pillar
    stages: list[str] = []


class ScenarioDetail(ScenarioSummary):
    config: dict[str, Any]


class ModuleOut(BaseModel):
    slug: str
    pillar: Pillar
    title: str
    summary: str
    order: int
    objectives: list[str]
    concepts: list[str]
    quiz_slug: str | None
    scenarios: list[ScenarioSummary]


# --- Simulations ----------------------------------------------------------


class SessionCreate(BaseModel):
    scenario_slug: str = Field(max_length=80)


class DecisionIn(BaseModel):
    type: str = Field(max_length=30, description="allocate | respond_event | plan | classify")
    payload: dict[str, Any]


class SessionOut(BaseModel):
    id: uuid.UUID
    scenario_slug: str
    kind: ScenarioKind
    attempt_number: int
    status: Literal["in_progress", "completed", "abandoned"]
    phase: str
    state: dict[str, Any]
    result: dict[str, Any] | None
    score: int | None
    previous_best: int | None = None
    new_achievements: list[str] = []
    started_at: datetime
    completed_at: datetime | None


class SessionSummary(BaseModel):
    id: uuid.UUID
    scenario_slug: str
    scenario_title: str
    kind: ScenarioKind
    attempt_number: int
    status: str
    score: int | None
    started_at: datetime
    completed_at: datetime | None


class SavingsProjectionIn(BaseModel):
    monthly_deposit: float = Field(ge=0, le=1_000_000)
    months: int = Field(ge=1, le=600)
    annual_rate: float = Field(ge=0, le=0.3)
    opening_balance: float = Field(default=0, ge=0, le=10_000_000)


class HeadStartIn(BaseModel):
    monthly_deposit: float = Field(ge=0, le=1_000_000)
    annual_rate: float = Field(ge=0, le=0.3)
    total_years: int = Field(ge=1, le=50)
    delay_years: int = Field(ge=0, le=49)


class InvestmentProjectionIn(BaseModel):
    amount: float = Field(ge=100, le=10_000_000)
    allocation: dict[str, float]
    horizon_years: Literal[1, 3, 5, 10]


# --- Assessments ----------------------------------------------------------


class OptionOut(BaseModel):
    key: str
    text: str


class QuestionOut(BaseModel):
    slug: str
    concept: str
    difficulty: int
    prompt: str
    options: list[OptionOut]


class AssessmentSummary(BaseModel):
    slug: str
    kind: Literal["initial", "module", "post"]
    title: str
    description: str
    module_slug: str | None
    question_count: int
    attempts: int
    best_score: int | None
    available: bool
    locked_reason: str | None = None


class AttemptStartOut(BaseModel):
    attempt_id: uuid.UUID
    assessment: AssessmentSummary
    questions: list[QuestionOut]


class ResponseIn(BaseModel):
    question_slug: str = Field(max_length=60)
    option_key: str = Field(max_length=5)
    confidence: Literal["low", "medium", "high"] | None = None
    response_ms: int | None = Field(default=None, ge=0, le=3_600_000)


class SubmitIn(BaseModel):
    responses: list[ResponseIn] = Field(min_length=1, max_length=50)


class QuestionResult(BaseModel):
    question_slug: str
    prompt: str
    concept: str
    selected: str
    correct_key: str
    is_correct: bool
    explanation: str
    correct_explanation: str
    misconception: str | None
    misconception_label: str | None
    rapid: bool


class RewardEntryOut(BaseModel):
    id: int
    entry_type: Literal["reward", "transfer_out"]
    amount: int
    reason: str
    rule_key: str
    source_type: str
    source_ref: str | None
    concept: str | None
    created_at: datetime


class WalletOut(BaseModel):
    balance: int
    total_earned: int
    history: list[RewardEntryOut]
    notice: str


class AttemptResultOut(BaseModel):
    attempt_id: uuid.UUID
    assessment_slug: str
    attempt_number: int
    score_pct: int
    correct_count: int
    total: int
    flagged_guessing: bool
    concepts: dict[str, dict[str, int]]
    misconceptions: list[dict[str, str]]
    questions: list[QuestionResult]
    new_achievements: list[str] = []
    rewards: list[RewardEntryOut] = []
    submitted_at: datetime


# --- Progress -------------------------------------------------------------


class ConceptProgress(BaseModel):
    concept: str
    title: str
    pillar: Pillar
    mastery: float | None
    level: Literal["not_started", "needs_practice", "developing", "mastered"]
    evidence_count: int


class ModuleProgressOut(BaseModel):
    slug: str
    title: str
    pillar: Pillar
    percent: int
    simulation_done: bool
    quiz_best: int | None
    completed: bool


class Recommendation(BaseModel):
    kind: Literal["onboarding", "assessment", "scenario", "review"]
    slug: str | None
    title: str
    reason: str
    pillar: Pillar | None = None
    difficulty: int | None = None


class ProgressOut(BaseModel):
    modules: list[ModuleProgressOut]
    concepts: list[ConceptProgress]
    strengths: list[str]
    practice_areas: list[str]
    pre_post: dict[str, Any] | None
    activity: dict[str, int]
    recent: list[dict[str, Any]]
    recommendation: Recommendation


class AchievementOut(BaseModel):
    slug: str
    title: str
    description: str
    icon: str
    earned: bool
    awarded_at: datetime | None


# --- Educator -------------------------------------------------------------


class CohortCreate(BaseModel):
    name: str = Field(min_length=2, max_length=80)


class CohortOut(BaseModel):
    id: int
    name: str
    join_code: str
    student_count: int
    created_at: datetime


# --- Tutor ----------------------------------------------------------------


class TutorAsk(BaseModel):
    question: str = Field(min_length=2, max_length=500)
    concept: str | None = Field(default=None, max_length=40)
    session_id: uuid.UUID | None = None


class TutorAnswer(BaseModel):
    answer: str
    source: Literal["ai", "fallback"]
    concept: str | None
    grounded_on: list[str]
    disclaimer: str
