"""Savings engine (Pillar 2: Saving & Money Management).

Educational objective: build the habit of regular saving, show why a separate
emergency fund protects goals, and make simple vs. compound interest visible
month by month.

Interest rates used in scenarios are fictional and illustrative. They are
labelled as such in the UI ("assumptions, not promises").
"""

from __future__ import annotations

from dataclasses import dataclass, field
from decimal import Decimal
from typing import Any, Literal

from .money import ZERO, SimulationError, q, rupees, to_money, to_rate

Compounding = Literal["none", "simple", "monthly"]
EventSource = Literal["emergency_fund", "goal_savings", "borrow"]
MAX_MONTHS = 600  # 50 years keeps projections bounded


@dataclass(frozen=True)
class MonthRow:
    month: int
    deposit: Decimal
    withdrawal: Decimal
    interest: Decimal
    balance: Decimal

    def as_dict(self) -> dict[str, Any]:
        return {
            "month": self.month,
            "deposit": float(self.deposit),
            "withdrawal": float(self.withdrawal),
            "interest": float(self.interest),
            "balance": float(self.balance),
        }


@dataclass
class Projection:
    rows: list[MonthRow]
    total_deposited: Decimal
    total_withdrawn: Decimal
    total_interest: Decimal
    final_balance: Decimal

    def reached_month(self, target: Decimal) -> int | None:
        for row in self.rows:
            if row.balance >= target:
                return row.month
        return None

    def as_dict(self) -> dict[str, Any]:
        return {
            "rows": [r.as_dict() for r in self.rows],
            "total_deposited": float(self.total_deposited),
            "total_withdrawn": float(self.total_withdrawn),
            "total_interest": float(self.total_interest),
            "final_balance": float(self.final_balance),
        }


def project(
    *,
    monthly_deposit: object,
    months: int,
    annual_rate: object = 0,
    compounding: Compounding = "monthly",
    opening_balance: object = 0,
    withdrawals: dict[int, object] | None = None,
    deposit_overrides: dict[int, object] | None = None,
) -> Projection:
    """Project a savings balance month by month.

    Order within a month: deposit, then withdrawal, then interest on the
    resulting balance. ``simple`` interest is paid only on deposited principal;
    ``monthly`` compounds interest on interest; ``none`` models a piggy bank.
    """
    deposit = to_money(monthly_deposit, field="monthly_deposit")
    rate = to_rate(annual_rate, field="annual_rate")
    opening = to_money(opening_balance, field="opening_balance")
    if not isinstance(months, int) or isinstance(months, bool) or not 1 <= months <= MAX_MONTHS:
        raise SimulationError(f"months must be between 1 and {MAX_MONTHS}", field="months")
    if compounding not in ("none", "simple", "monthly"):
        raise SimulationError("compounding must be none, simple or monthly", field="compounding")
    withdrawals_d = {
        int(m): to_money(v, field="withdrawal") for m, v in (withdrawals or {}).items()
    }
    overrides = {int(m): to_money(v, field="deposit") for m, v in (deposit_overrides or {}).items()}
    monthly_rate = rate / 12 if compounding != "none" else Decimal("0")

    principal = opening  # money the student put in (for simple interest)
    interest_pool = ZERO  # accumulated simple interest
    balance = opening
    rows: list[MonthRow] = []
    total_dep = total_wd = total_int = ZERO
    for month in range(1, months + 1):
        dep = overrides.get(month, deposit)
        balance += dep
        principal += dep
        wd = min(withdrawals_d.get(month, ZERO), balance)
        balance -= wd
        # withdrawals reduce principal first, then accumulated interest
        from_principal = min(wd, principal)
        principal -= from_principal
        interest_pool -= wd - from_principal
        if compounding == "simple":
            interest = q(principal * monthly_rate)
            interest_pool += interest
        else:
            interest = q(balance * monthly_rate)
        balance = q(balance + interest)
        total_dep += dep
        total_wd += wd
        total_int += interest
        rows.append(MonthRow(month, q(dep), q(wd), interest, balance))
    return Projection(rows, q(total_dep), q(total_wd), q(total_int), q(balance))


def compare_compounding(
    *, monthly_deposit: object, months: int, annual_rate: object, opening_balance: object = 0
) -> dict[str, Any]:
    """Side-by-side simple vs compound projections for the calculator view."""
    simple = project(
        monthly_deposit=monthly_deposit,
        months=months,
        annual_rate=annual_rate,
        compounding="simple",
        opening_balance=opening_balance,
    )
    compound = project(
        monthly_deposit=monthly_deposit,
        months=months,
        annual_rate=annual_rate,
        compounding="monthly",
        opening_balance=opening_balance,
    )
    return {
        "simple": simple.as_dict(),
        "compound": compound.as_dict(),
        "compounding_advantage": float(compound.final_balance - simple.final_balance),
    }


def head_start(
    *, monthly_deposit: object, annual_rate: object, total_years: int, delay_years: int
) -> dict[str, Any]:
    """Compare starting now vs. starting ``delay_years`` later (same end date)."""
    if not 1 <= total_years <= 50 or not 0 <= delay_years < total_years:
        raise SimulationError("Invalid horizon for head-start comparison", field="delay_years")
    early = project(
        monthly_deposit=monthly_deposit, months=total_years * 12, annual_rate=annual_rate
    )
    late = project(
        monthly_deposit=monthly_deposit,
        months=(total_years - delay_years) * 12,
        annual_rate=annual_rate,
    )
    return {
        "early": {
            "deposited": float(early.total_deposited),
            "final_balance": float(early.final_balance),
        },
        "late": {
            "deposited": float(late.total_deposited),
            "final_balance": float(late.final_balance),
        },
        "difference": float(early.final_balance - late.final_balance),
    }


# ---------------------------------------------------------------------------
# Savings challenge (scenario-driven, two decisions)
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class Account:
    key: str
    label: str
    annual_rate: Decimal
    compounding: Compounding
    note: str = ""


@dataclass(frozen=True)
class SavingsScenario:
    income: Decimal
    fixed_spending: Decimal
    goal_label: str
    goal_amount: Decimal
    months: int
    accounts: tuple[Account, ...]
    event_month: int
    event_title: str
    event_description: str
    event_amount: Decimal

    @property
    def capacity(self) -> Decimal:
        return q(self.income - self.fixed_spending)

    def account(self, key: str) -> Account:
        for acc in self.accounts:
            if acc.key == key:
                return acc
        raise SimulationError(f"Unknown account '{key}'", field="account")


def scenario_from_config(config: dict[str, Any]) -> SavingsScenario:
    try:
        scenario = SavingsScenario(
            income=to_money(config["income"], field="income"),
            fixed_spending=to_money(config["fixed_spending"], field="fixed_spending"),
            goal_label=config["goal"]["label"],
            goal_amount=to_money(config["goal"]["amount"], field="goal.amount"),
            months=int(config["months"]),
            accounts=tuple(
                Account(
                    key=a["key"],
                    label=a["label"],
                    annual_rate=to_rate(a["annual_rate"]),
                    compounding=a["compounding"],
                    note=a.get("note", ""),
                )
                for a in config["accounts"]
            ),
            event_month=int(config["event"]["month"]),
            event_title=config["event"]["title"],
            event_description=config["event"]["description"],
            event_amount=to_money(config["event"]["amount"], field="event.amount"),
        )
    except KeyError as exc:
        raise SimulationError(f"Savings scenario config missing {exc}", code="bad_config") from exc
    if scenario.capacity <= 0:
        raise SimulationError("Fixed spending must be below income", code="bad_config")
    if not 1 <= scenario.event_month <= scenario.months:
        raise SimulationError("Event month must fall inside the plan", code="bad_config")
    return scenario


@dataclass(frozen=True)
class SavingsPlan:
    goal_saving: Decimal
    emergency_saving: Decimal
    account: Account

    def as_dict(self) -> dict[str, Any]:
        return {
            "goal_saving": float(self.goal_saving),
            "emergency_saving": float(self.emergency_saving),
            "account": self.account.key,
        }


def parse_plan(scenario: SavingsScenario, raw: dict[str, Any]) -> SavingsPlan:
    if not isinstance(raw, dict):
        raise SimulationError("plan must be an object", field="plan")
    goal = to_money(raw.get("goal_saving", 0), field="goal_saving")
    emergency = to_money(raw.get("emergency_saving", 0), field="emergency_saving")
    account = scenario.account(str(raw.get("account", "")))
    if goal + emergency > scenario.capacity:
        raise SimulationError(
            f"You can save at most {rupees(scenario.capacity)} a month after fixed spending "
            f"(you planned {rupees(goal + emergency)}).",
            code="over_capacity",
            field="plan",
        )
    if goal + emergency == 0:
        raise SimulationError("Plan to save at least something each month", field="plan")
    return SavingsPlan(goal, emergency, account)


def state_before_event(scenario: SavingsScenario, plan: SavingsPlan) -> dict[str, Any]:
    """Balances at the end of the month before the surprise expense."""
    months_before = scenario.event_month - 1
    acc = plan.account
    if months_before == 0:
        return {"goal_balance": 0.0, "emergency_balance": 0.0, "month": 0}
    goal = project(
        monthly_deposit=plan.goal_saving,
        months=months_before,
        annual_rate=acc.annual_rate,
        compounding=acc.compounding,
    )
    emergency = project(
        monthly_deposit=plan.emergency_saving,
        months=months_before,
        annual_rate=acc.annual_rate,
        compounding=acc.compounding,
    )
    return {
        "goal_balance": float(goal.final_balance),
        "emergency_balance": float(emergency.final_balance),
        "month": months_before,
    }


def event_options(scenario: SavingsScenario, plan: SavingsPlan) -> list[dict[str, Any]]:
    before = state_before_event(scenario, plan)
    # Deposits for the event month land before the expense is paid.
    ef = Decimal(str(before["emergency_balance"])) + plan.emergency_saving
    goal = Decimal(str(before["goal_balance"])) + plan.goal_saving
    amount = scenario.event_amount
    return [
        {
            "key": "emergency_fund",
            "label": "Use my emergency fund first",
            "feasible": ef + goal >= amount,
            "explanation": f"Emergency fund has about {rupees(q(ef))}; "
            "any gap comes from goal savings.",
        },
        {
            "key": "goal_savings",
            "label": "Take it from my goal savings",
            "feasible": goal >= amount,
            "explanation": f"Goal savings have about {rupees(q(goal))}.",
        },
        {
            "key": "borrow",
            "label": "Borrow and repay next month",
            "feasible": True,
            "explanation": "Repayment is taken out of next month's goal saving.",
        },
    ]


@dataclass
class SavingsOutcome:
    goal_projection: Projection
    emergency_projection: Projection
    goal_reached_month: int | None
    goal_reached: bool
    paid_from_emergency: Decimal
    paid_from_goal: Decimal
    borrowed: Decimal
    score: int
    components: dict[str, int]
    feedback: list[dict[str, str]] = field(default_factory=list)
    concept_evidence: dict[str, bool] = field(default_factory=dict)
    account_comparison: list[dict[str, Any]] = field(default_factory=list)

    def as_dict(self) -> dict[str, Any]:
        return {
            "goal_projection": self.goal_projection.as_dict(),
            "emergency_projection": self.emergency_projection.as_dict(),
            "goal_reached_month": self.goal_reached_month,
            "goal_reached": self.goal_reached,
            "paid_from_emergency": float(self.paid_from_emergency),
            "paid_from_goal": float(self.paid_from_goal),
            "borrowed": float(self.borrowed),
            "score": self.score,
            "components": self.components,
            "feedback": self.feedback,
            "concept_evidence": self.concept_evidence,
            "account_comparison": self.account_comparison,
        }


def resolve_event(scenario: SavingsScenario, plan: SavingsPlan, source: str) -> SavingsOutcome:
    options = {o["key"]: o for o in event_options(scenario, plan)}
    if source not in options:
        raise SimulationError(f"'{source}' is not a valid choice", field="source")
    if not options[source]["feasible"]:
        raise SimulationError(
            f"Not enough money for '{options[source]['label']}'",
            code="infeasible_response",
            field="source",
        )
    before = state_before_event(scenario, plan)
    ef_available = Decimal(str(before["emergency_balance"])) + plan.emergency_saving
    amount = scenario.event_amount
    month = scenario.event_month
    from_ef = from_goal = borrowed = ZERO
    if source == "emergency_fund":
        from_ef = min(ef_available, amount)
        from_goal = amount - from_ef
    elif source == "goal_savings":
        from_goal = amount
    else:
        borrowed = amount

    acc = plan.account
    goal_overrides: dict[int, Decimal] = {}
    if borrowed > 0:
        # Repay from following months' goal deposits until cleared.
        owed = borrowed
        m = month + 1
        while owed > 0 and m <= scenario.months:
            repay = min(owed, plan.goal_saving)
            goal_overrides[m] = plan.goal_saving - repay
            owed -= repay
            m += 1
            if plan.goal_saving == 0:
                break
    goal_proj = project(
        monthly_deposit=plan.goal_saving,
        months=scenario.months,
        annual_rate=acc.annual_rate,
        compounding=acc.compounding,
        withdrawals={month: from_goal} if from_goal else None,
        deposit_overrides=goal_overrides or None,
    )
    ef_proj = project(
        monthly_deposit=plan.emergency_saving,
        months=scenario.months,
        annual_rate=acc.annual_rate,
        compounding=acc.compounding,
        withdrawals={month: from_ef} if from_ef else None,
    )
    reached = goal_proj.reached_month(scenario.goal_amount)
    goal_reached = reached is not None

    best_rate = max(a.annual_rate for a in scenario.accounts)
    components = {
        "goal_reached": 40
        if goal_reached
        else int(40 * min(Decimal(1), goal_proj.final_balance / scenario.goal_amount)),
        "event_handled": 30 if (borrowed == 0 and from_goal == 0) else (15 if borrowed == 0 else 0),
        "emergency_habit": 15 if plan.emergency_saving > 0 else 0,
        "account_choice": 15 if acc.annual_rate == best_rate else (8 if acc.annual_rate > 0 else 0),
    }
    total = sum(components.values())

    feedback: list[dict[str, str]] = []
    if goal_reached:
        feedback.append(
            {
                "tone": "positive",
                "concept": "saving_habit",
                "message": f"You reached '{scenario.goal_label}' in month {reached}. "
                "Steady monthly saving works.",
            }
        )
    else:
        short = q(scenario.goal_amount - goal_proj.final_balance)
        feedback.append(
            {
                "tone": "caution",
                "concept": "saving_habit",
                "message": f"You ended {rupees(short)} short of '{scenario.goal_label}'. "
                "A slightly higher monthly amount or a longer timeline would close the gap.",
            }
        )
    if plan.emergency_saving > 0 and from_goal == 0 and borrowed == 0:
        feedback.append(
            {
                "tone": "positive",
                "concept": "emergency_fund",
                "message": "Your emergency fund absorbed the surprise, so your goal stayed safe.",
            }
        )
    elif plan.emergency_saving == 0:
        feedback.append(
            {
                "tone": "negative",
                "concept": "emergency_fund",
                "message": "Without an emergency fund, the surprise came out of your goal or "
                "became a loan. Even ₹100 a month builds a cushion.",
            }
        )
    if borrowed > 0:
        feedback.append(
            {
                "tone": "caution",
                "concept": "emergency_fund",
                "message": f"Borrowing {rupees(borrowed)} meant smaller goal deposits afterwards.",
            }
        )
    interest = goal_proj.total_interest + ef_proj.total_interest
    feedback.append(
        {
            "tone": "positive" if interest > 0 else "caution",
            "concept": "simple_vs_compound",
            "message": f"Interest earned: {rupees(q(interest))} with '{acc.label}'. "
            + (
                "Money in a piggy bank does not grow."
                if acc.annual_rate == 0
                else "Interest is the reward for letting money stay saved."
            ),
        }
    )

    comparison = []
    for other in scenario.accounts:
        proj = project(
            monthly_deposit=plan.goal_saving + plan.emergency_saving,
            months=scenario.months,
            annual_rate=other.annual_rate,
            compounding=other.compounding,
        )
        comparison.append(
            {
                "account": other.key,
                "label": other.label,
                "final_balance": float(proj.final_balance),
                "interest": float(proj.total_interest),
            }
        )

    return SavingsOutcome(
        goal_projection=goal_proj,
        emergency_projection=ef_proj,
        goal_reached_month=reached,
        goal_reached=goal_reached,
        paid_from_emergency=q(from_ef),
        paid_from_goal=q(from_goal),
        borrowed=q(borrowed),
        score=total,
        components=components,
        feedback=feedback,
        concept_evidence={
            "saving_habit": goal_reached,
            "emergency_fund": plan.emergency_saving > 0 and borrowed == 0,
            "simple_vs_compound": acc.annual_rate > 0,
        },
        account_comparison=comparison,
    )
