"""The ₹500 Money Lab engine (pure, deterministic, Decimal money).

Educational objective: one small, concrete decision that touches goals,
expenses, saving, liquidity, risk, compounding and inflation together. A
student splits a fictional ₹500 across four buckets, a surprise need arrives
mid-way, and time passes. Everything is shown with its assumptions and limits.

Guardrails
* Fictional buckets only; no real product is named or recommended.
* The score rewards robust planning (it must hold up under a cautious case),
  never the lucky path the seed happened to pick.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from typing import Any

from .money import HUNDRED, SimulationError, q, to_money

DISCLAIMER = (
    "A fictional ₹500 lab with made-up rates and a made-up market. Real prices, rates and "
    "returns differ and can change. This is education, not advice, and RupeeRise does not "
    "recommend any real product."
)
LIMITATIONS = [
    "Rates and the growth path are illustrative and fixed for learning.",
    "One surprise only. Real life can bring more, or none.",
    "Inflation is a single steady 6% a year here; real inflation varies.",
    "No fees or taxes are modelled.",
]

BUCKETS = ("spend", "ready", "deposit", "growth")
SOURCES = ("ready", "deposit", "growth", "borrow")


@dataclass(frozen=True)
class LabScenario:
    total: Decimal
    essential_min: Decimal
    months: int
    event_month: int
    event_title: str
    event_description: str
    event_amount: Decimal
    goal_label: str
    goal_amount: Decimal
    inflation: Decimal  # annual
    deposit_rate: Decimal  # annual, monthly compounding
    growth_paths: list[dict[str, Any]]  # each: key, label, monthly_pct list (len == months)
    borrow_cost_rate: Decimal  # extra repaid on borrowed money


@dataclass(frozen=True)
class Plan:
    spend: Decimal
    ready: Decimal
    deposit: Decimal
    growth: Decimal

    def as_dict(self) -> dict[str, float]:
        return {k: float(getattr(self, k)) for k in BUCKETS}


def scenario_from_config(cfg: dict[str, Any]) -> LabScenario:
    ev = cfg["event"]
    return LabScenario(
        total=to_money(cfg["total"]),
        essential_min=to_money(cfg["essential_min"]),
        months=int(cfg["months"]),
        event_month=int(ev["month"]),
        event_title=ev["title"],
        event_description=ev["description"],
        event_amount=to_money(ev["amount"]),
        goal_label=cfg["goal"]["label"],
        goal_amount=to_money(cfg["goal"]["amount"]),
        inflation=Decimal(str(cfg["inflation"])),
        deposit_rate=Decimal(str(cfg["deposit_rate"])),
        growth_paths=cfg["growth_paths"],
        borrow_cost_rate=Decimal(str(cfg["borrow_cost_rate"])),
    )


def pick_path(sc: LabScenario, seed: int) -> dict[str, Any]:
    return sc.growth_paths[seed % len(sc.growth_paths)]


def parse_plan(sc: LabScenario, payload: dict[str, Any]) -> Plan:
    values: dict[str, Decimal] = {}
    for key in BUCKETS:
        values[key] = to_money(payload.get(key, 0), field=key)
        if values[key] != values[key].to_integral_value():
            raise SimulationError("Use whole rupees in this lab", field=key)
    plan = Plan(**values)
    total = plan.spend + plan.ready + plan.deposit + plan.growth
    if total != sc.total:
        raise SimulationError(
            f"Split all ₹{sc.total:,.0f}. You have allocated ₹{total:,.0f}.",
            code="allocation_total",
            field="allocation",
        )
    if plan.spend < sc.essential_min:
        raise SimulationError(
            f"Keep at least ₹{sc.essential_min:,.0f} in 'Spend now' for something you truly need.",
            code="needs_uncovered",
            field="spend",
        )
    return plan


def _grow_deposit(sc: LabScenario, amount: Decimal, months: int) -> Decimal:
    monthly = sc.deposit_rate / 12
    for _ in range(months):
        amount = q(amount * (1 + monthly))
    return amount


def _grow_path(amount: Decimal, path: dict[str, Any], start: int, end: int) -> Decimal:
    for pct in path["monthly_pct"][start:end]:
        amount = q(amount * (1 + Decimal(str(pct)) / HUNDRED))
    return amount


def balances_at_event(sc: LabScenario, plan: Plan, path: dict[str, Any]) -> dict[str, Decimal]:
    m = sc.event_month
    return {
        "ready": plan.ready,
        "deposit": _grow_deposit(sc, plan.deposit, m),
        "growth": _grow_path(plan.growth, path, 0, m),
    }


def event_options(sc: LabScenario, plan: Plan, path: dict[str, Any]) -> list[dict[str, Any]]:
    bal = balances_at_event(sc, plan, path)
    labels = {
        "ready": ("Use the money you kept ready", "Instant, no loss. This is what 'ready' is for."),
        "deposit": (
            "Take it from the steady deposit",
            "Available at once; you lose a little interest.",
        ),
        "growth": (
            "Sell some of the growth basket",
            "You sell at today's price. If it is down, the loss becomes real.",
        ),
        "borrow": (
            "Borrow from a friend",
            f"You repay {sc.borrow_cost_rate * 100:.0f}% extra later, so it costs more.",
        ),
    }
    out = []
    for key in SOURCES:
        feasible = key == "borrow" or bal[key] >= sc.event_amount
        out.append(
            {
                "key": key,
                "label": labels[key][0],
                "note": labels[key][1],
                "available": float(bal[key]) if key != "borrow" else None,
                "feasible": feasible,
            }
        )
    return out


@dataclass(frozen=True)
class Outcome:
    source: str
    final: dict[str, Decimal]
    saved_total: Decimal
    goal_price: Decimal
    goal_reached: bool
    real_value: Decimal
    inflation_drag: Decimal
    borrowed: Decimal
    repay_extra: Decimal
    expected_total: Decimal
    cautious_total: Decimal
    score: int
    components: dict[str, int]
    feedback: list[dict[str, str]]
    concept_evidence: dict[str, bool]
    path_label: str
    timeline: list[dict[str, Any]]

    def as_dict(self) -> dict[str, Any]:
        return {
            "source": self.source,
            "final": {k: float(v) for k, v in self.final.items()},
            "saved_total": float(self.saved_total),
            "goal_price": float(self.goal_price),
            "goal_reached": self.goal_reached,
            "real_value": float(self.real_value),
            "inflation_drag": float(self.inflation_drag),
            "borrowed": float(self.borrowed),
            "repay_extra": float(self.repay_extra),
            "expected_total": float(self.expected_total),
            "cautious_total": float(self.cautious_total),
            "score": self.score,
            "components": self.components,
            "feedback": self.feedback,
            "concept_evidence": self.concept_evidence,
            "path_label": self.path_label,
            "timeline": self.timeline,
        }


def _projection(sc: LabScenario, plan: Plan, growth_pct_total: Decimal) -> Decimal:
    """Final savings assuming growth changes by a flat percentage over the whole period."""
    deposit = _grow_deposit(sc, plan.deposit, sc.months)
    growth = q(plan.growth * (1 + growth_pct_total / HUNDRED))
    return plan.ready + deposit + growth


def resolve_event(sc: LabScenario, plan: Plan, path: dict[str, Any], source: str) -> Outcome:
    if source not in SOURCES:
        raise SimulationError("Choose one of the listed ways to pay", field="source")
    bal = balances_at_event(sc, plan, path)
    options = {o["key"]: o for o in event_options(sc, plan, path)}
    if not options[source]["feasible"]:
        raise SimulationError(
            "That bucket does not have enough money for this need.",
            code="infeasible_response",
            field="source",
        )
    amount = sc.event_amount
    ready, deposit, growth = bal["ready"], bal["deposit"], bal["growth"]
    borrowed = Decimal("0.00")
    if source == "ready":
        ready -= amount
    elif source == "deposit":
        deposit -= amount
    elif source == "growth":
        growth -= amount
    else:
        borrowed = amount
    # Time moves on from the event month to the end.
    remaining = sc.months - sc.event_month
    deposit = _grow_deposit(sc, deposit, remaining)
    growth = _grow_path(growth, path, sc.event_month, sc.months)
    repay_extra = q(borrowed * sc.borrow_cost_rate)
    repay_total = borrowed + repay_extra
    final = {"ready": ready, "deposit": deposit, "growth": growth}
    saved_total = q(ready + deposit + growth - repay_total)
    infl = 1 + sc.inflation * Decimal(sc.months) / 12
    goal_price = q(sc.goal_amount * infl)
    real_value = q(saved_total / infl)
    inflation_drag = q(saved_total - real_value)

    # Robustness is judged on assumed cases, not on the path the seed happened to pick.
    expected_total = _projection(sc, plan, Decimal("8"))  # assumed average over the period
    cautious_total = _projection(sc, plan, Decimal("-20"))  # a poor period for the basket
    expected_after = q(expected_total - amount - repay_total + borrowed)
    cautious_after = q(cautious_total - amount - repay_total + borrowed)

    liquid_before_event = plan.ready + _grow_deposit(sc, plan.deposit, sc.event_month)
    prepared = liquid_before_event >= amount
    growth_share = plan.growth / sc.total
    idle_cash_share = plan.ready / sc.total
    earning = plan.deposit + plan.growth

    goal_pts = (
        35
        if cautious_after >= goal_price
        else 22
        if expected_after >= goal_price
        else round(
            35 * min(Decimal(1), max(Decimal(0), cautious_after / goal_price)) * Decimal("0.5")
        )
    )
    if source == "ready":
        liquidity_pts = 25 if prepared else 12
    elif source == "deposit":
        liquidity_pts = 22 if prepared else 10
    elif source == "growth":
        liquidity_pts = 8
    else:
        liquidity_pts = 0
    risk_pts = 20 if growth_share <= Decimal("0.4") else 10 if growth_share <= Decimal("0.6") else 0
    infl_pts = 20 if idle_cash_share <= Decimal("0.5") and earning > 0 else 10 if earning > 0 else 0
    # idle cash above what the surprise needs loses value to inflation.
    components = {
        "goal_plan": int(goal_pts),
        "liquidity": int(liquidity_pts),
        "risk_balance": int(risk_pts),
        "inflation_awareness": int(infl_pts),
    }
    score = sum(components.values())

    feedback: list[dict[str, str]] = []
    feedback.append(
        {
            "tone": "positive" if goal_pts >= 22 else "caution",
            "concept": "goal_setting",
            "message": (
                f"Your goal ({sc.goal_label}) costs ₹{goal_price:,.0f} by month {sc.months} after "
                f"{sc.inflation * 100:.0f}% inflation. "
                + (
                    "Your plan holds up even if the growth basket has a poor period."
                    if cautious_after >= goal_price
                    else "Your plan only reaches it if the growth basket does well. No guarantee."
                    if expected_after >= goal_price
                    else "Your plan falls short. Saving more, or earlier, closes the gap."
                )
            ),
        }
    )
    feedback.append(
        {
            "tone": "positive"
            if source in ("ready", "deposit") and prepared
            else "negative"
            if source == "borrow"
            else "caution",
            "concept": "emergency_fund",
            "message": (
                "You had liquid money ready when the surprise came, so nothing was forced."
                if source in ("ready", "deposit") and prepared
                else f"Borrowing cost you ₹{repay_extra:,.0f} extra. Money kept ready avoids that."
                if source == "borrow"
                else "Paying from the growth basket meant selling at that month's price."
                if source == "growth"
                else "Your ready money fell short, so another bucket had to cover the surprise."
            ),
        }
    )
    feedback.append(
        {
            "tone": "positive" if risk_pts == 20 else "caution",
            "concept": "risk_return",
            "message": (
                f"{growth_share * 100:.0f}% of your ₹{sc.total:,.0f} was in the growth basket. "
                + (
                    "That keeps a bad period survivable."
                    if risk_pts >= 10
                    else "That much in one risky place can turn a bad period into a missed goal."
                )
            ),
        }
    )
    feedback.append(
        {
            "tone": "positive" if infl_pts == 20 else "caution",
            "concept": "inflation",
            "message": (
                f"Inflation made your ₹{saved_total:,.0f} worth about ₹{real_value:,.0f} in "
                "today's "
                "rupees. Money that earns nothing quietly loses buying power."
            ),
        }
    )
    evidence = {
        "goal_setting": cautious_after >= goal_price,
        "emergency_fund": prepared and source in ("ready", "deposit"),
        "risk_return": growth_share <= Decimal("0.4"),
        "compounding": earning >= sc.total * Decimal("0.25"),
        "inflation": idle_cash_share <= Decimal("0.5") and earning > 0,
    }
    timeline = []
    d, g = plan.deposit, plan.growth
    for month in range(0, sc.months + 1):
        if month > 0:
            d = _grow_deposit(sc, d, 1)
            g = _grow_path(g, path, month - 1, month)
        timeline.append(
            {
                "month": month,
                "ready": float(plan.ready),
                "deposit": float(d),
                "growth": float(g),
                "total": float(q(plan.ready + d + g)),
            }
        )
    return Outcome(
        source=source,
        final=final,
        saved_total=saved_total,
        goal_price=goal_price,
        goal_reached=saved_total >= goal_price,
        real_value=real_value,
        inflation_drag=inflation_drag,
        borrowed=borrowed,
        repay_extra=repay_extra,
        expected_total=expected_after,
        cautious_total=cautious_after,
        score=score,
        components=components,
        feedback=feedback,
        concept_evidence=evidence,
        path_label=path["label"],
        timeline=timeline,
    )


def assumptions(sc: LabScenario) -> dict[str, Any]:
    return {
        "starting_amount": float(sc.total),
        "months": sc.months,
        "contributions": "None after the start. One ₹500 split.",
        "deposit_rate_pct": float(sc.deposit_rate * 100),
        "inflation_pct": float(sc.inflation * 100),
        "borrow_extra_pct": float(sc.borrow_cost_rate * 100),
        "growth": "Fictional basket with a made-up monthly path, chosen by a fixed seed.",
        "limitations": LIMITATIONS,
        "disclaimer": DISCLAIMER,
    }
