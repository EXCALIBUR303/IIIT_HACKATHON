"""Budgeting engine (Pillar 1: Planning & Budgeting).

Educational objective: help students separate needs from wants, allocate a
limited fictional income, plan toward a short-term goal, and experience how an
unexpected expense tests their plan.

The engine is pure and deterministic: identical inputs always produce identical
outputs. It never touches the database or the network.

Scoring rubric (transparent, documented in docs/architecture.md):

* Needs covered      40 pts  average coverage of each need's essential minimum
* Savings habit      25 pts  savings rate vs. a 20% reference (buffer counts half)
* Wants in check     15 pts  full marks <=30% of income, zero at >=60%
* Goal on track      20 pts  savings vs. the monthly amount the goal requires
"""

from __future__ import annotations

from dataclasses import dataclass, field
from decimal import Decimal
from typing import Any, Literal

from .money import ZERO, SimulationError, clamp, q, ratio, rupees, score, to_money

CategoryKind = Literal["need", "want", "savings"]
ResponseKey = Literal["cut_wants", "mix", "use_savings", "borrow", "skip"]

WANTS_FULL_MARKS = Decimal("0.30")
WANTS_ZERO_MARKS = Decimal("0.60")
SAVINGS_REFERENCE = Decimal("0.20")

# Response preference order used to score how a student handled an event.
# Earlier is better when feasible. Rationale is explained to the student.
RESPONSE_RANK: tuple[ResponseKey, ...] = ("cut_wants", "mix", "use_savings", "borrow")


@dataclass(frozen=True)
class Category:
    key: str
    label: str
    kind: CategoryKind
    essential_min: Decimal = ZERO
    hint: str = ""


@dataclass(frozen=True)
class BudgetEvent:
    key: str
    title: str
    description: str
    amount: Decimal
    kind: Literal["expense", "income_drop"] = "expense"
    essential: bool = True  # essential events cannot be skipped
    skip_consequence: str = ""


@dataclass(frozen=True)
class BudgetScenario:
    income: Decimal
    categories: tuple[Category, ...]
    goal_label: str
    goal_amount: Decimal
    goal_months: int
    events: tuple[BudgetEvent, ...]

    @property
    def goal_monthly_target(self) -> Decimal:
        return q(self.goal_amount / self.goal_months)

    def category(self, key: str) -> Category:
        for cat in self.categories:
            if cat.key == key:
                return cat
        raise SimulationError(f"Unknown budget category '{key}'", field="allocations")


def scenario_from_config(config: dict[str, Any]) -> BudgetScenario:
    """Build a validated scenario from JSON content configuration."""
    try:
        categories = tuple(
            Category(
                key=c["key"],
                label=c["label"],
                kind=c["kind"],
                essential_min=to_money(
                    c.get("essential_min", 0), field=f"{c['key']}.essential_min"
                ),
                hint=c.get("hint", ""),
            )
            for c in config["categories"]
        )
        events = tuple(
            BudgetEvent(
                key=e["key"],
                title=e["title"],
                description=e["description"],
                amount=to_money(e["amount"], field=f"{e['key']}.amount"),
                kind=e.get("kind", "expense"),
                essential=e.get("essential", True),
                skip_consequence=e.get("skip_consequence", ""),
            )
            for e in config["events"]
        )
        scenario = BudgetScenario(
            income=to_money(config["income"], field="income"),
            categories=categories,
            goal_label=config["goal"]["label"],
            goal_amount=to_money(config["goal"]["amount"], field="goal.amount"),
            goal_months=int(config["goal"]["months"]),
            events=events,
        )
    except KeyError as exc:
        raise SimulationError(f"Budget scenario config missing {exc}", code="bad_config") from exc
    if scenario.income <= 0:
        raise SimulationError("Scenario income must be positive", code="bad_config")
    if scenario.goal_months <= 0:
        raise SimulationError("Goal months must be positive", code="bad_config")
    if not scenario.events:
        raise SimulationError("Scenario needs at least one event", code="bad_config")
    if sum((c.essential_min for c in categories), ZERO) > scenario.income:
        raise SimulationError("Essential minimums exceed income", code="bad_config")
    keys = [c.key for c in categories]
    if len(keys) != len(set(keys)):
        raise SimulationError("Duplicate category keys", code="bad_config")
    if not any(c.kind == "savings" for c in categories):
        raise SimulationError("Scenario needs a savings category", code="bad_config")
    return scenario


def pick_event(scenario: BudgetScenario, seed: int) -> BudgetEvent:
    """Deterministically choose the surprise event for a session seed."""
    return scenario.events[seed % len(scenario.events)]


# ---------------------------------------------------------------------------
# Allocation
# ---------------------------------------------------------------------------


@dataclass
class Feedback:
    tone: Literal["positive", "caution", "negative"]
    concept: str
    message: str

    def as_dict(self) -> dict[str, str]:
        return {"tone": self.tone, "concept": self.concept, "message": self.message}


@dataclass
class AllocationResult:
    allocations: dict[str, Decimal]
    total_allocated: Decimal
    buffer: Decimal  # unallocated cash kept in hand
    needs_total: Decimal
    wants_total: Decimal
    savings_total: Decimal
    shortfalls: dict[str, Decimal]
    components: dict[str, int]
    score: int
    goal_progress_pct: int
    feedback: list[Feedback] = field(default_factory=list)
    concept_evidence: dict[str, bool] = field(default_factory=dict)

    def as_dict(self) -> dict[str, Any]:
        return {
            "allocations": {k: float(v) for k, v in self.allocations.items()},
            "total_allocated": float(self.total_allocated),
            "buffer": float(self.buffer),
            "needs_total": float(self.needs_total),
            "wants_total": float(self.wants_total),
            "savings_total": float(self.savings_total),
            "shortfalls": {k: float(v) for k, v in self.shortfalls.items()},
            "components": self.components,
            "score": self.score,
            "goal_progress_pct": self.goal_progress_pct,
            "feedback": [f.as_dict() for f in self.feedback],
            "concept_evidence": self.concept_evidence,
        }


def parse_allocations(scenario: BudgetScenario, raw: dict[str, Any]) -> dict[str, Decimal]:
    """Validate the student's allocation map; missing categories default to zero."""
    if not isinstance(raw, dict):
        raise SimulationError("allocations must be an object", field="allocations")
    allowed = {c.key for c in scenario.categories}
    unknown = set(raw) - allowed
    if unknown:
        raise SimulationError(
            f"Unknown budget categories: {', '.join(sorted(unknown))}", field="allocations"
        )
    allocations = {
        c.key: to_money(raw.get(c.key, 0), field=f"allocations.{c.key}")
        for c in scenario.categories
    }
    total = sum(allocations.values(), ZERO)
    if total > scenario.income:
        raise SimulationError(
            f"You allocated {rupees(total)} but only have {rupees(scenario.income)}. "
            "A budget cannot spend more than the money available.",
            code="over_budget",
            field="allocations",
        )
    return allocations


def evaluate_allocation(scenario: BudgetScenario, raw: dict[str, Any]) -> AllocationResult:
    allocations = parse_allocations(scenario, raw)
    by_kind: dict[str, Decimal] = {"need": ZERO, "want": ZERO, "savings": ZERO}
    for cat in scenario.categories:
        by_kind[cat.kind] += allocations[cat.key]
    total = sum(allocations.values(), ZERO)
    buffer = q(scenario.income - total)

    # Needs coverage: average of min(allocated / essential_min, 1) per need.
    needs = [c for c in scenario.categories if c.kind == "need" and c.essential_min > 0]
    shortfalls: dict[str, Decimal] = {}
    coverage_sum = Decimal("0")
    for cat in needs:
        allocated = allocations[cat.key]
        coverage_sum += clamp(ratio(allocated, cat.essential_min))
        if allocated < cat.essential_min:
            shortfalls[cat.key] = q(cat.essential_min - allocated)
    needs_coverage = coverage_sum / len(needs) if needs else Decimal("1")

    # Savings habit: explicit savings count fully, unallocated buffer counts half.
    effective_savings = by_kind["savings"] + buffer / 2
    savings_rate = ratio(effective_savings, scenario.income)
    savings_component = clamp(savings_rate / SAVINGS_REFERENCE)

    wants_rate = ratio(by_kind["want"], scenario.income)
    if wants_rate <= WANTS_FULL_MARKS:
        wants_component = Decimal("1")
    else:
        span = WANTS_ZERO_MARKS - WANTS_FULL_MARKS
        wants_component = clamp(1 - (wants_rate - WANTS_FULL_MARKS) / span)

    goal_component = clamp(ratio(by_kind["savings"], scenario.goal_monthly_target))

    components = {
        "needs_covered": score(needs_coverage) * 40 // 100,
        "savings_habit": score(savings_component) * 25 // 100,
        "wants_in_check": score(wants_component) * 15 // 100,
        "goal_on_track": score(goal_component) * 20 // 100,
    }
    total_score = sum(components.values())

    feedback: list[Feedback] = []
    if shortfalls:
        labels = ", ".join(scenario.category(k).label for k in shortfalls)
        feedback.append(
            Feedback(
                "negative",
                "needs_vs_wants",
                f"Some needs are underfunded ({labels}). Needs come first: skipping them "
                "usually costs more later.",
            )
        )
    else:
        feedback.append(
            Feedback("positive", "needs_vs_wants", "Every essential need is covered. Great start.")
        )
    if wants_rate > WANTS_FULL_MARKS:
        feedback.append(
            Feedback(
                "caution",
                "budget_allocation",
                f"Wants take {int(wants_rate * 100)}% of your money. A common guideline keeps "
                "wants to around 30% so there is room for savings.",
            )
        )
    if by_kind["savings"] == 0:
        feedback.append(
            Feedback(
                "negative",
                "saving_habit",
                "Nothing is set aside as savings. Paying yourself first, even a small amount, "
                "builds the habit.",
            )
        )
    elif goal_component >= 1:
        feedback.append(
            Feedback(
                "positive",
                "goal_setting",
                f"You are saving enough each month to reach '{scenario.goal_label}' "
                f"in {scenario.goal_months} month(s).",
            )
        )
    else:
        months_needed = (
            (scenario.goal_amount / by_kind["savings"]).to_integral_value(rounding="ROUND_CEILING")
            if by_kind["savings"] > 0
            else None
        )
        feedback.append(
            Feedback(
                "caution",
                "goal_setting",
                f"At this rate '{scenario.goal_label}' takes about {months_needed} months "
                f"instead of {scenario.goal_months}. "
                f"You need {rupees(scenario.goal_monthly_target)}/month.",
            )
        )
    if buffer > 0:
        feedback.append(
            Feedback(
                "positive",
                "emergency_fund",
                f"{rupees(buffer)} is left unallocated as a cash buffer for surprises.",
            )
        )

    goal_progress = clamp(ratio(by_kind["savings"], scenario.goal_amount))
    return AllocationResult(
        allocations=allocations,
        total_allocated=q(total),
        buffer=buffer,
        needs_total=q(by_kind["need"]),
        wants_total=q(by_kind["want"]),
        savings_total=q(by_kind["savings"]),
        shortfalls=shortfalls,
        components=components,
        score=total_score,
        goal_progress_pct=score(goal_progress),
        feedback=feedback,
        concept_evidence={
            "needs_vs_wants": not shortfalls and wants_rate <= WANTS_ZERO_MARKS,
            "budget_allocation": total_score >= 60,
            "goal_setting": goal_component >= 1,
            "saving_habit": by_kind["savings"] > 0,
        },
    )


# ---------------------------------------------------------------------------
# Unexpected event
# ---------------------------------------------------------------------------


@dataclass
class ResponseOption:
    key: ResponseKey
    label: str
    feasible: bool
    explanation: str

    def as_dict(self) -> dict[str, Any]:
        return {
            "key": self.key,
            "label": self.label,
            "feasible": self.feasible,
            "explanation": self.explanation,
        }


RESPONSE_LABELS: dict[ResponseKey, str] = {
    "cut_wants": "Cut back on wants this month",
    "mix": "Cut wants first, then dip into savings",
    "use_savings": "Pay from savings and buffer",
    "borrow": "Borrow from a friend or family member",
    "skip": "Skip it",
}


def response_options(allocation: AllocationResult, event: BudgetEvent) -> list[ResponseOption]:
    wants = allocation.wants_total
    reserve = allocation.savings_total + allocation.buffer
    cost = event.amount
    options = [
        ResponseOption(
            "cut_wants",
            RESPONSE_LABELS["cut_wants"],
            wants >= cost,
            f"Your wants budget is {rupees(wants)}."
            if wants >= cost
            else f"Your wants budget ({rupees(wants)}) cannot cover {rupees(cost)} alone.",
        ),
        ResponseOption(
            "mix",
            RESPONSE_LABELS["mix"],
            wants + reserve >= cost,
            f"Wants {rupees(wants)} + savings and buffer {rupees(reserve)} available.",
        ),
        ResponseOption(
            "use_savings",
            RESPONSE_LABELS["use_savings"],
            reserve >= cost,
            f"Savings and buffer total {rupees(reserve)}."
            if reserve >= cost
            else f"Savings and buffer ({rupees(reserve)}) are not enough.",
        ),
        ResponseOption(
            "borrow",
            RESPONSE_LABELS["borrow"],
            True,
            "Always possible, but it must be repaid from next month's money.",
        ),
    ]
    if not event.essential:
        options.append(
            ResponseOption(
                "skip",
                RESPONSE_LABELS["skip"],
                True,
                event.skip_consequence or "This is optional, so saying no is a valid choice.",
            )
        )
    return options


@dataclass
class EventOutcome:
    event_key: str
    response: ResponseKey
    cost: Decimal
    paid_from: dict[str, Decimal]
    borrowed: Decimal
    remaining_savings: Decimal
    remaining_wants: Decimal
    remaining_buffer: Decimal
    goal_progress_pct: int
    handling_score: int
    best_response: ResponseKey
    feedback: list[Feedback]
    concept_evidence: dict[str, bool]

    def as_dict(self) -> dict[str, Any]:
        return {
            "event_key": self.event_key,
            "response": self.response,
            "cost": float(self.cost),
            "paid_from": {k: float(v) for k, v in self.paid_from.items()},
            "borrowed": float(self.borrowed),
            "remaining_savings": float(self.remaining_savings),
            "remaining_wants": float(self.remaining_wants),
            "remaining_buffer": float(self.remaining_buffer),
            "goal_progress_pct": self.goal_progress_pct,
            "handling_score": self.handling_score,
            "best_response": self.best_response,
            "feedback": [f.as_dict() for f in self.feedback],
            "concept_evidence": self.concept_evidence,
        }


def best_response(allocation: AllocationResult, event: BudgetEvent) -> ResponseKey:
    if not event.essential:
        return "skip"
    feasible = {o.key for o in response_options(allocation, event) if o.feasible}
    for key in RESPONSE_RANK:
        if key in feasible:
            return key
    return "borrow"  # pragma: no cover - borrow is always feasible


def apply_event(
    scenario: BudgetScenario,
    allocation: AllocationResult,
    event: BudgetEvent,
    response: str,
) -> EventOutcome:
    options = {o.key: o for o in response_options(allocation, event)}
    if response not in options:
        raise SimulationError(
            f"'{response}' is not a valid response to this event", field="response"
        )
    option = options[response]
    if not option.feasible:
        raise SimulationError(
            f"'{option.label}' is not possible: {option.explanation}",
            code="infeasible_response",
            field="response",
        )

    cost = event.amount
    wants, savings, buffer = allocation.wants_total, allocation.savings_total, allocation.buffer
    paid: dict[str, Decimal] = {"wants": ZERO, "savings": ZERO, "buffer": ZERO}
    borrowed = ZERO

    def take(source: str, available: Decimal, needed: Decimal) -> tuple[Decimal, Decimal]:
        used = min(available, needed)
        paid[source] += used
        return available - used, needed - used

    remaining = cost
    if response == "skip":
        remaining = ZERO
    elif response == "cut_wants":
        wants, remaining = take("wants", wants, remaining)
    elif response == "mix":
        wants, remaining = take("wants", wants, remaining)
        buffer, remaining = take("buffer", buffer, remaining)
        savings, remaining = take("savings", savings, remaining)
    elif response == "use_savings":
        buffer, remaining = take("buffer", buffer, remaining)
        savings, remaining = take("savings", savings, remaining)
    elif response == "borrow":
        borrowed, remaining = remaining, ZERO

    best = best_response(allocation, event)
    rank_score = {
        "skip": 100,
        "cut_wants": 100,
        "mix": 90,
        "use_savings": 75,
        "borrow": 30,
    }
    handling = rank_score[response]
    if response == best:
        handling = 100
    elif response == "borrow" and best == "borrow":
        handling = 100  # nothing else was possible; the lesson is about building a buffer

    feedback: list[Feedback] = []
    if response == "skip":
        feedback.append(
            Feedback(
                "positive",
                "needs_vs_wants",
                event.skip_consequence or "Saying no to an optional expense protected your plan.",
            )
        )
    elif response in ("cut_wants", "mix") and paid["savings"] == 0:
        feedback.append(
            Feedback(
                "positive",
                "needs_vs_wants",
                "You protected your needs and your goal by trimming wants. "
                "Flexible spending is your first line of defence.",
            )
        )
    if paid["savings"] > 0 or paid["buffer"] > 0:
        feedback.append(
            Feedback(
                "positive" if borrowed == 0 else "caution",
                "emergency_fund",
                f"Your savings and buffer absorbed {rupees(q(paid['savings'] + paid['buffer']))}. "
                "This is exactly why an emergency cushion matters.",
            )
        )
    if response == "borrow":
        if best == "borrow":
            feedback.append(
                Feedback(
                    "caution",
                    "emergency_fund",
                    "You had no cushion left, so borrowing was the only option. "
                    "Keeping even a small buffer next time avoids debt.",
                )
            )
        else:
            feedback.append(
                Feedback(
                    "negative",
                    "emergency_fund",
                    f"You borrowed {rupees(cost)} even though "
                    f"'{RESPONSE_LABELS[best]}' was possible. "
                    "Borrowing creates a repayment that shrinks next month's budget.",
                )
            )
    if response not in (best, "skip") and response != "borrow":
        feedback.append(
            Feedback(
                "caution",
                "budget_allocation",
                f"A stronger choice here was: {RESPONSE_LABELS[best]}. Trim wants before "
                "touching goal savings.",
            )
        )

    goal_progress = clamp(ratio(savings, scenario.goal_amount))
    return EventOutcome(
        event_key=event.key,
        response=response,  # type: ignore[arg-type]
        cost=cost,
        paid_from={k: q(v) for k, v in paid.items()},
        borrowed=q(borrowed),
        remaining_savings=q(savings),
        remaining_wants=q(wants),
        remaining_buffer=q(buffer),
        goal_progress_pct=score(goal_progress),
        handling_score=handling,
        best_response=best,
        feedback=feedback,
        concept_evidence={
            "emergency_fund": response != "borrow" or best == "borrow",
            "needs_vs_wants": response in (best, "skip", "cut_wants", "mix"),
        },
    )


def final_score(allocation: AllocationResult, outcome: EventOutcome) -> int:
    """70% planning quality, 30% handling of the surprise."""
    return round(allocation.score * 0.7 + outcome.handling_score * 0.3)
