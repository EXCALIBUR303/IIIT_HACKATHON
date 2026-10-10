"""SQLAlchemy models.

Data separation (privacy by design):
* Identity & account data: ``users``, ``student_profiles`` (minimal: a display
  name/nickname, username, grade band, preferences). No email, phone, school
  ID, Aadhaar or real bank data is ever collected.
* Learning content: ``learning_modules``, ``scenarios``, ``assessments``,
  ``questions``, ``achievements`` (seeded from app/content/*.json).
* Fictional simulation & learning evidence: ``simulation_sessions``,
  ``simulation_decisions``, ``assessment_attempts``, ``question_responses``,
  ``concept_mastery``, ``student_achievements``. These reference a user id only
  and contain fictional rupee amounts, never real finances.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import (
    JSON,
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base

JsonType = JSON().with_variant(JSONB(), "postgresql")


def utcnow() -> datetime:
    return datetime.now(UTC)


def new_uuid() -> uuid.UUID:
    return uuid.uuid4()


# ---------------------------------------------------------------------------
# Identity and organisations
# ---------------------------------------------------------------------------


class Organization(Base):
    __tablename__ = "organizations"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120), unique=True)
    kind: Mapped[str] = mapped_column(String(20), default="ngo")
    city: Mapped[str] = mapped_column(String(80), default="Hyderabad")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    __table_args__ = (CheckConstraint("kind IN ('ngo', 'school', 'other')", name="kind"),)


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=new_uuid)
    username: Mapped[str] = mapped_column(String(40), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(100))
    role: Mapped[str] = mapped_column(String(20), default="student")
    display_name: Mapped[str] = mapped_column(String(60))
    organization_id: Mapped[int | None] = mapped_column(
        ForeignKey("organizations.id", ondelete="SET NULL")
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    last_active_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    organization: Mapped[Organization | None] = relationship()
    profile: Mapped[StudentProfile | None] = relationship(
        back_populates="user", cascade="all, delete-orphan", uselist=False
    )

    __table_args__ = (CheckConstraint("role IN ('student', 'educator', 'admin')", name="role"),)


class StudentProfile(Base):
    __tablename__ = "student_profiles"

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    grade: Mapped[int | None] = mapped_column(Integer)
    language: Mapped[str] = mapped_column(String(5), default="en")
    learning_level: Mapped[str] = mapped_column(String(20), default="beginner")
    persona_key: Mapped[str | None] = mapped_column(String(30))
    onboarding_completed: Mapped[bool] = mapped_column(Boolean, default=False)
    preferences: Mapped[dict[str, Any]] = mapped_column(JsonType, default=dict)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )

    user: Mapped[User] = relationship(back_populates="profile")

    __table_args__ = (
        CheckConstraint("grade IS NULL OR grade BETWEEN 7 AND 13", name="grade"),
        CheckConstraint("language IN ('en', 'hi', 'te')", name="language"),
        CheckConstraint(
            "learning_level IN ('beginner', 'intermediate', 'advanced')", name="learning_level"
        ),
    )


class Cohort(Base):
    __tablename__ = "cohorts"

    id: Mapped[int] = mapped_column(primary_key=True)
    organization_id: Mapped[int] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"))
    educator_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    name: Mapped[str] = mapped_column(String(80))
    join_code: Mapped[str] = mapped_column(String(12), unique=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    organization: Mapped[Organization] = relationship()
    memberships: Mapped[list[CohortMembership]] = relationship(
        back_populates="cohort", cascade="all, delete-orphan"
    )


class CohortMembership(Base):
    __tablename__ = "cohort_memberships"

    cohort_id: Mapped[int] = mapped_column(
        ForeignKey("cohorts.id", ondelete="CASCADE"), primary_key=True
    )
    student_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    joined_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    cohort: Mapped[Cohort] = relationship(back_populates="memberships")
    student: Mapped[User] = relationship()


# ---------------------------------------------------------------------------
# Learning content (seeded)
# ---------------------------------------------------------------------------


class LearningModule(Base):
    __tablename__ = "learning_modules"

    id: Mapped[int] = mapped_column(primary_key=True)
    slug: Mapped[str] = mapped_column(String(60), unique=True)
    pillar: Mapped[str] = mapped_column(String(20))
    title: Mapped[str] = mapped_column(String(120))
    summary: Mapped[str] = mapped_column(Text)
    order: Mapped[int] = mapped_column(Integer)
    objectives: Mapped[list[str]] = mapped_column(JsonType, default=list)
    concepts: Mapped[list[str]] = mapped_column(JsonType, default=list)

    scenarios: Mapped[list[Scenario]] = relationship(back_populates="module")

    __table_args__ = (
        CheckConstraint("pillar IN ('budgeting', 'saving', 'investing', 'safety')", name="pillar"),
    )


class Scenario(Base):
    __tablename__ = "scenarios"

    id: Mapped[int] = mapped_column(primary_key=True)
    slug: Mapped[str] = mapped_column(String(80), unique=True)
    module_id: Mapped[int] = mapped_column(ForeignKey("learning_modules.id", ondelete="CASCADE"))
    kind: Mapped[str] = mapped_column(String(20))
    title: Mapped[str] = mapped_column(String(160))
    intro: Mapped[str] = mapped_column(Text)
    objective: Mapped[str] = mapped_column(Text)
    difficulty: Mapped[int] = mapped_column(Integer)
    persona_key: Mapped[str | None] = mapped_column(String(30))
    config: Mapped[dict[str, Any]] = mapped_column(JsonType)
    stages: Mapped[list[str]] = mapped_column(
        JsonType,
        default=lambda: ["future_planner", "investor_sandbox"],
        server_default=text("""'["future_planner", "investor_sandbox"]'::jsonb"""),
    )
    version: Mapped[int] = mapped_column(Integer, default=1)

    module: Mapped[LearningModule] = relationship(back_populates="scenarios")

    __table_args__ = (
        CheckConstraint(
            "kind IN ('budget', 'savings', 'investing', 'safety', 'money_lab')", name="kind"
        ),
        CheckConstraint("difficulty BETWEEN 1 AND 3", name="difficulty"),
    )


class Assessment(Base):
    __tablename__ = "assessments"

    id: Mapped[int] = mapped_column(primary_key=True)
    slug: Mapped[str] = mapped_column(String(60), unique=True)
    kind: Mapped[str] = mapped_column(String(20))
    module_id: Mapped[int | None] = mapped_column(
        ForeignKey("learning_modules.id", ondelete="CASCADE")
    )
    title: Mapped[str] = mapped_column(String(120))
    description: Mapped[str] = mapped_column(Text, default="")

    questions: Mapped[list[Question]] = relationship(
        back_populates="assessment", order_by="Question.order"
    )
    module: Mapped[LearningModule | None] = relationship()

    __table_args__ = (CheckConstraint("kind IN ('initial', 'module', 'post')", name="kind"),)


class Question(Base):
    __tablename__ = "questions"

    id: Mapped[int] = mapped_column(primary_key=True)
    assessment_id: Mapped[int] = mapped_column(ForeignKey("assessments.id", ondelete="CASCADE"))
    slug: Mapped[str] = mapped_column(String(60), unique=True)
    concept: Mapped[str] = mapped_column(String(40))
    difficulty: Mapped[int] = mapped_column(Integer)
    prompt: Mapped[str] = mapped_column(Text)
    # [{key, text, correct?, misconception?, explanation}]
    options: Mapped[list[dict[str, Any]]] = mapped_column(JsonType)
    order: Mapped[int] = mapped_column(Integer)

    assessment: Mapped[Assessment] = relationship(back_populates="questions")


class Achievement(Base):
    __tablename__ = "achievements"

    id: Mapped[int] = mapped_column(primary_key=True)
    slug: Mapped[str] = mapped_column(String(40), unique=True)
    title: Mapped[str] = mapped_column(String(80))
    description: Mapped[str] = mapped_column(Text)
    icon: Mapped[str] = mapped_column(String(40))


# ---------------------------------------------------------------------------
# Fictional simulations and learning evidence
# ---------------------------------------------------------------------------


class SimulationSession(Base):
    __tablename__ = "simulation_sessions"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=new_uuid)
    student_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    scenario_id: Mapped[int] = mapped_column(ForeignKey("scenarios.id", ondelete="CASCADE"))
    attempt_number: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(20), default="in_progress")
    phase: Mapped[str] = mapped_column(String(30))
    seed: Mapped[int] = mapped_column(Integer)
    state: Mapped[dict[str, Any]] = mapped_column(JsonType, default=dict)
    result: Mapped[dict[str, Any] | None] = mapped_column(JsonType)
    score: Mapped[int | None] = mapped_column(Integer)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    scenario: Mapped[Scenario] = relationship()
    decisions: Mapped[list[SimulationDecision]] = relationship(
        back_populates="session", order_by="SimulationDecision.step", cascade="all, delete-orphan"
    )

    __table_args__ = (
        CheckConstraint("status IN ('in_progress', 'completed', 'abandoned')", name="status"),
        CheckConstraint("score IS NULL OR score BETWEEN 0 AND 100", name="score"),
        UniqueConstraint("student_id", "scenario_id", "attempt_number", name="uq_session_attempt"),
    )


class SimulationDecision(Base):
    __tablename__ = "simulation_decisions"

    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("simulation_sessions.id", ondelete="CASCADE"), index=True
    )
    step: Mapped[int] = mapped_column(Integer)
    decision_type: Mapped[str] = mapped_column(String(30))
    payload: Mapped[dict[str, Any]] = mapped_column(JsonType)
    outcome: Mapped[dict[str, Any] | None] = mapped_column(JsonType)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    session: Mapped[SimulationSession] = relationship(back_populates="decisions")

    __table_args__ = (UniqueConstraint("session_id", "step", name="uq_decision_step"),)


class AssessmentAttempt(Base):
    __tablename__ = "assessment_attempts"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=new_uuid)
    student_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    assessment_id: Mapped[int] = mapped_column(ForeignKey("assessments.id", ondelete="CASCADE"))
    attempt_number: Mapped[int] = mapped_column(Integer)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    correct_count: Mapped[int | None] = mapped_column(Integer)
    total: Mapped[int | None] = mapped_column(Integer)
    score_pct: Mapped[int | None] = mapped_column(Integer)
    flagged_guessing: Mapped[bool] = mapped_column(Boolean, default=False)

    assessment: Mapped[Assessment] = relationship()
    responses: Mapped[list[QuestionResponse]] = relationship(
        back_populates="attempt", cascade="all, delete-orphan"
    )

    __table_args__ = (
        UniqueConstraint("student_id", "assessment_id", "attempt_number", name="uq_attempt"),
        CheckConstraint("score_pct IS NULL OR score_pct BETWEEN 0 AND 100", name="score_pct"),
    )


class QuestionResponse(Base):
    __tablename__ = "question_responses"

    id: Mapped[int] = mapped_column(primary_key=True)
    attempt_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("assessment_attempts.id", ondelete="CASCADE"), index=True
    )
    question_id: Mapped[int] = mapped_column(ForeignKey("questions.id", ondelete="CASCADE"))
    selected_option: Mapped[str] = mapped_column(String(5))
    is_correct: Mapped[bool] = mapped_column(Boolean)
    confidence: Mapped[str | None] = mapped_column(String(10))
    response_ms: Mapped[int | None] = mapped_column(Integer)
    misconception: Mapped[str | None] = mapped_column(String(60))

    attempt: Mapped[AssessmentAttempt] = relationship(back_populates="responses")
    question: Mapped[Question] = relationship()

    __table_args__ = (
        UniqueConstraint("attempt_id", "question_id", name="uq_response_question"),
        CheckConstraint(
            "confidence IS NULL OR confidence IN ('low', 'medium', 'high')", name="confidence"
        ),
    )


class ConceptMastery(Base):
    __tablename__ = "concept_mastery"

    student_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    concept: Mapped[str] = mapped_column(String(40), primary_key=True)
    evidence_count: Mapped[int] = mapped_column(Integer, default=0)
    weighted_correct: Mapped[float] = mapped_column(Float, default=0.0)
    weighted_total: Mapped[float] = mapped_column(Float, default=0.0)
    mastery: Mapped[float] = mapped_column(Float, default=0.0)
    last_misconception: Mapped[str | None] = mapped_column(String(60))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )

    __table_args__ = (
        CheckConstraint("mastery >= 0 AND mastery <= 1", name="mastery_range"),
        CheckConstraint("weighted_correct <= weighted_total + 0.0001", name="weights"),
    )


class StudentAchievement(Base):
    __tablename__ = "student_achievements"

    student_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    achievement_id: Mapped[int] = mapped_column(
        ForeignKey("achievements.id", ondelete="CASCADE"), primary_key=True
    )
    awarded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    achievement: Mapped[Achievement] = relationship()


class RewardLedgerEntry(Base):
    """Append-only educational reward ledger (fictional learning money, whole rupees).

    The balance is ``SUM(amount)``; there is no mutable balance column. The unique
    (student, idempotency key) pair makes every issuance exactly-once.
    """

    __tablename__ = "reward_ledger"

    id: Mapped[int] = mapped_column(primary_key=True)
    student_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    entry_type: Mapped[str] = mapped_column(String(20))
    amount: Mapped[int] = mapped_column(Integer)
    rule_key: Mapped[str] = mapped_column(String(40))
    source_type: Mapped[str] = mapped_column(String(20))
    source_ref: Mapped[str | None] = mapped_column(String(80))
    concept: Mapped[str | None] = mapped_column(String(40))
    reason: Mapped[str] = mapped_column(Text)
    idempotency_key: Mapped[str] = mapped_column(String(120))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    __table_args__ = (
        UniqueConstraint("student_id", "idempotency_key", name="uq_reward_idempotency"),
        CheckConstraint(
            "(entry_type = 'reward' AND amount > 0) "
            "OR (entry_type = 'transfer_out' AND amount < 0)",
            name="amount_sign",
        ),
    )


class Portfolio(Base):
    """A student's fictional practice portfolio (one active run; money in integer paise)."""

    __tablename__ = "portfolios"

    student_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    cash_paise: Mapped[int] = mapped_column(BigInteger)
    starting_cash_paise: Mapped[int] = mapped_column(BigInteger)
    contributed_paise: Mapped[int] = mapped_column(BigInteger)
    run_number: Mapped[int] = mapped_column(Integer, default=1)
    seed: Mapped[int] = mapped_column(BigInteger)
    round: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )

    holdings: Mapped[list[PortfolioHolding]] = relationship(
        back_populates="portfolio", cascade="all, delete-orphan"
    )

    __table_args__ = (
        CheckConstraint("cash_paise >= 0", name="cash_non_negative"),
        CheckConstraint("round BETWEEN 0 AND 10", name="round_range"),
        CheckConstraint("run_number >= 1", name="run_positive"),
    )


class PortfolioHolding(Base):
    __tablename__ = "portfolio_holdings"

    student_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("portfolios.student_id", ondelete="CASCADE"), primary_key=True
    )
    instrument_key: Mapped[str] = mapped_column(String(30), primary_key=True)
    quantity: Mapped[int] = mapped_column(Integer)
    cost_paise: Mapped[int] = mapped_column(BigInteger)

    portfolio: Mapped[Portfolio] = relationship(back_populates="holdings")

    __table_args__ = (
        CheckConstraint("quantity > 0", name="quantity_positive"),
        CheckConstraint("cost_paise >= 0", name="cost_non_negative"),
    )


class PortfolioTransaction(Base):
    """Append-only log of everything that changed a portfolio, keyed for idempotency."""

    __tablename__ = "portfolio_transactions"

    id: Mapped[int] = mapped_column(primary_key=True)
    student_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    run_number: Mapped[int] = mapped_column(Integer)
    round: Mapped[int] = mapped_column(Integer)
    kind: Mapped[str] = mapped_column(String(20))
    instrument_key: Mapped[str | None] = mapped_column(String(30))
    quantity: Mapped[int | None] = mapped_column(Integer)
    price_paise: Mapped[int | None] = mapped_column(BigInteger)
    amount_paise: Mapped[int] = mapped_column(BigInteger)  # signed change in cash
    cash_after_paise: Mapped[int] = mapped_column(BigInteger)
    request_id: Mapped[str] = mapped_column(String(64))
    note: Mapped[str | None] = mapped_column(String(200))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    __table_args__ = (
        UniqueConstraint("student_id", "request_id", name="uq_portfolio_request"),
        CheckConstraint(
            "kind IN ('open', 'buy', 'sell', 'transfer_in', 'advance', 'reset')", name="kind"
        ),
        CheckConstraint("cash_after_paise >= 0", name="cash_after_non_negative"),
    )


class Reflection(Base):
    """A multiple-choice explanation after a mission. No free text is ever stored."""

    __tablename__ = "reflections"

    id: Mapped[int] = mapped_column(primary_key=True)
    student_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    session_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("simulation_sessions.id", ondelete="CASCADE")
    )
    question_key: Mapped[str] = mapped_column(String(60))
    selected_option: Mapped[str] = mapped_column(String(5))
    is_correct: Mapped[bool] = mapped_column(Boolean)
    concept: Mapped[str] = mapped_column(String(40))
    confidence: Mapped[str | None] = mapped_column(String(10))
    misconception: Mapped[str | None] = mapped_column(String(60))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    __table_args__ = (
        UniqueConstraint("student_id", "question_key", name="uq_reflection_question"),
        CheckConstraint(
            "confidence IS NULL OR confidence IN ('low', 'medium', 'high')",
            name="reflection_confidence",
        ),
    )
