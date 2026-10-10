"""Investment education engine (Pillar 3: Understanding Investing).

Educational objective: make risk, time horizon, compounding, diversification
and uncertainty tangible using FICTIONAL assets and ILLUSTRATIVE market paths.

Guardrails (from the sponsor brief):
* Educate, do not recommend investments. No real products appear here.
* Simulations are assumptions, not promises. Every result carries a
  disclaimer and shows a *range* of outcomes, including losses.
* Scores reward sound reasoning (diversification, risk matched to horizon,
  calm response to a fall), never lucky returns.

Determinism: market paths are fixed tables; the Monte Carlo fan uses a seeded
``random.Random`` so the same inputs always return the same numbers.
"""

from __future__ import annotations

import math
import random
from dataclasses import dataclass
from decimal import Decimal
from typing import Any, Literal

from .money import SimulationError, to_money

DISCLAIMER = (
    "Fictional assets and illustrative assumptions. Real investments can lose money and "
    "past or simulated returns do not predict the future. This is education, not advice."
)

CrashAction = Literal["hold", "sell_all", "rebalance"]
HORIZONS = (1, 3, 5, 10)
MARKET_SIGMA = 0.16
MC_RUNS = 1000


@dataclass(frozen=True)
class Asset:
    key: str
    label: str
    description: str
    risk_level: Literal["low", "medium", "high", "very_high"]
    mu: float  # long-run average annual return assumption
    beta: float  # sensitivity to the shared market factor
    idio: float  # company-specific volatility
    single_company: bool = False

    @property
    def volatility(self) -> float:
        return math.sqrt((self.beta * MARKET_SIGMA) ** 2 + self.idio**2)


ASSETS: dict[str, Asset] = {
    a.key: a
    for a in (
        Asset(
            "steady_deposit",
            "Steady Deposit",
            "A fictional deposit paying a fixed 6% a year. Low growth, no market ups and downs.",
            "low",
            0.06,
            0.0,
            0.0,
        ),
        Asset(
            "balanced_basket",
            "Balanced Basket",
            "A fictional mix of many companies and deposits. Moderate ups and downs.",
            "medium",
            0.08,
            0.5,
            0.02,
        ),
        Asset(
            "growth_basket",
            "Growth Basket",
            "A fictional basket of 50 companies. Grows more on average, falls harder in bad years.",
            "high",
            0.11,
            1.0,
            0.03,
        ),
        Asset(
            "zippy_gadgets",
            "Zippy Gadgets Ltd",
            "One fictional gadget company. Exciting stories, very large swings.",
            "very_high",
            0.11,
            1.1,
            0.35,
            True,
        ),
        Asset(
            "sunrise_solar",
            "Sunrise Solar Ltd",
            "One fictional solar company. Its fate depends on a single business.",
            "very_high",
            0.11,
            1.0,
            0.33,
            True,
        ),
    )
}

# Illustrative yearly returns (%) for the growth basket under named market paths.
_MARKET_PATHS: dict[str, tuple[str, list[float]]] = {
    "steady_climb": ("Steady climb", [9, 12, 7, 14, 10, 8, 13, 11, 6, 12]),
    "early_crash": ("Crash in year 1", [-28, 18, 22, 9, 12, 10, 8, 14, 7, 11]),
    "late_crash": ("Crash in the final year", [14, 12, 16, 10, 13, 9, 11, 15, 12, -30]),
    "choppy": ("Choppy ups and downs", [12, -15, 20, -8, 15, -5, 18, 3, 10, 9]),
    "slow_start": ("Slow start, late recovery", [-10, 5, -12, 8, 2, -6, 15, 20, 18, 14]),
}
# Company-specific surprises (%) added on top of the market for single companies.
_IDIO_PATHS: dict[str, list[float]] = {
    "zippy_gadgets": [5, -20, 30, -45, 25, 10, -15, 40, -10, 5],
    "sunrise_solar": [-15, 35, -30, 20, -10, 25, -40, 15, 30, -20],
}
# Paths that contain a fall the student can react to, with the year it happens.
CRASH_PATHS: dict[str, int] = {"early_crash": 1, "choppy": 2, "slow_start": 1}


def asset_return(asset_key: str, path_key: str, year: int) -> float:
    """Return for ``asset_key`` in ``year`` (1-based) of a named path, as a fraction."""
    market = _MARKET_PATHS[path_key][1][year - 1] / 100
    if asset_key == "steady_deposit":
        return 0.06
    if asset_key == "balanced_basket":
        return 0.5 * market + 0.5 * 0.06
    if asset_key == "growth_basket":
        return market
    idio = _IDIO_PATHS[asset_key][year - 1] / 100
    return max(-0.9, market + idio)


def market_paths() -> list[dict[str, Any]]:
    return [{"key": k, "label": v[0]} for k, v in _MARKET_PATHS.items()]


def parse_allocation(raw: dict[str, Any], allowed: list[str] | None = None) -> dict[str, float]:
    """Allocation is a map of asset key -> whole percent; must total 100."""
    if not isinstance(raw, dict) or not raw:
        raise SimulationError("allocation must be a non-empty object", field="allocation")
    allowed_keys = set(allowed or ASSETS)
    out: dict[str, float] = {}
    for key, value in raw.items():
        if key not in allowed_keys:
            raise SimulationError(f"'{key}' is not available in this scenario", field="allocation")
        if isinstance(value, bool) or not isinstance(value, int | float):
            raise SimulationError("allocation percentages must be numbers", field="allocation")
        if value < 0 or value > 100:
            raise SimulationError("each percentage must be between 0 and 100", field="allocation")
        if value:
            out[key] = float(value)
    if abs(sum(out.values()) - 100) > 0.01:
        raise SimulationError(
            f"Percentages must add up to 100 (currently {sum(out.values()):g})",
            code="allocation_total",
            field="allocation",
        )
    return {k: v / 100 for k, v in out.items()}


def validate_horizon(horizon: object) -> int:
    if horizon not in HORIZONS:
        raise SimulationError(
            f"horizon_years must be one of {', '.join(map(str, HORIZONS))}", field="horizon_years"
        )
    return int(horizon)  # type: ignore[arg-type]


def diversification_score(weights: dict[str, float]) -> float:
    """0 = everything in one asset, 1 = perfectly spread; single companies count as concentrated."""
    hhi = sum(w * w for w in weights.values())
    n = len(ASSETS)
    base = (1 - hhi) / (1 - 1 / n)
    single = sum(w for k, w in weights.items() if ASSETS[k].single_company)
    return max(0.0, min(1.0, base - max(0.0, single - 0.2)))


def portfolio_volatility(weights: dict[str, float]) -> float:
    """Approximate annual volatility with a one-factor model (market + company-specific)."""
    market = sum(w * ASSETS[k].beta for k, w in weights.items()) * MARKET_SIGMA
    idio = math.sqrt(sum((w * ASSETS[k].idio) ** 2 for k, w in weights.items()))
    return math.sqrt(market**2 + idio**2)


def risk_label(vol: float) -> str:
    if vol < 0.03:
        return "low"
    if vol < 0.10:
        return "medium"
    if vol < 0.20:
        return "high"
    return "very_high"


def run_path(
    amount: Decimal,
    weights: dict[str, float],
    horizon: int,
    path_key: str,
    *,
    annual_contribution: Decimal = Decimal(0),
    action_after_year: tuple[int, CrashAction] | None = None,
) -> list[dict[str, Any]]:
    """Year-by-year value for one illustrative path. Holdings drift with returns."""
    holdings = {k: float(amount) * w for k, w in weights.items()}
    target = dict(weights)
    rows = [{"year": 0, "value": round(float(amount)), "return_pct": 0.0}]
    for year in range(1, horizon + 1):
        start = sum(holdings.values())
        for k in holdings:
            holdings[k] *= 1 + asset_return(k, path_key, year)
        if annual_contribution > 0:
            for k, w in target.items():
                holdings[k] = holdings.get(k, 0.0) + float(annual_contribution) * w
        end = sum(holdings.values())
        rows.append(
            {
                "year": year,
                "value": round(end),
                "return_pct": round((end - start - float(annual_contribution)) / start * 100, 1)
                if start
                else 0.0,
            }
        )
        if action_after_year and action_after_year[0] == year:
            action = action_after_year[1]
            if action == "sell_all":
                holdings = {"steady_deposit": end}
                target = {"steady_deposit": 1.0}
            elif action == "rebalance":
                holdings = {k: end * w for k, w in target.items()}
    return rows


def monte_carlo(
    amount: Decimal,
    weights: dict[str, float],
    horizon: int,
    *,
    seed: int,
    runs: int = MC_RUNS,
) -> dict[str, Any]:
    """Seeded simulation of many possible futures. Returns percentile bands per year."""
    rng = random.Random(seed)
    finals: list[float] = []
    yearly: list[list[float]] = [[] for _ in range(horizon + 1)]
    for _ in range(runs):
        value = float(amount)
        yearly[0].append(value)
        for year in range(1, horizon + 1):
            z_market = rng.gauss(0, 1)
            growth = 0.0
            for k, w in weights.items():
                a = ASSETS[k]
                r = a.mu + a.beta * MARKET_SIGMA * z_market + a.idio * rng.gauss(0, 1)
                growth += w * max(-0.95, r)
            value *= 1 + growth
            yearly[year].append(value)
        finals.append(value)

    def pct(values: list[float], p: float) -> int:
        ordered = sorted(values)
        idx = min(len(ordered) - 1, max(0, int(round(p * (len(ordered) - 1)))))
        return round(ordered[idx])

    bands = [
        {"year": y, "p10": pct(v, 0.10), "p50": pct(v, 0.50), "p90": pct(v, 0.90)}
        for y, v in enumerate(yearly)
    ]
    loss_prob = sum(1 for f in finals if f < float(amount)) / runs
    return {
        "runs": runs,
        "seed": seed,
        "bands": bands,
        "probability_of_loss": round(loss_prob, 3),
        "worst_case_p10": pct(finals, 0.10),
        "median": pct(finals, 0.50),
        "best_case_p90": pct(finals, 0.90),
    }


def loss_probability_by_horizon(
    amount: Decimal, weights: dict[str, float], seed: int
) -> list[dict]:
    """The time-horizon lesson: chance of ending below the starting amount shrinks with time."""
    out = []
    for h in HORIZONS:
        mc = monte_carlo(amount, weights, h, seed=seed, runs=600)
        out.append({"horizon_years": h, "probability_of_loss": mc["probability_of_loss"]})
    return out


def project_portfolio(
    *,
    amount: object,
    allocation: dict[str, Any],
    horizon_years: object,
    seed: int = 2026,
    allowed_assets: list[str] | None = None,
) -> dict[str, Any]:
    """Stateless projection used by the explorer and the scenario result screen."""
    money = to_money(amount, field="amount")
    if money < 100:
        raise SimulationError("Use at least ₹100 of fictional money", field="amount")
    weights = parse_allocation(allocation, allowed_assets)
    horizon = validate_horizon(horizon_years)
    paths = []
    for key, (label, _) in _MARKET_PATHS.items():
        rows = run_path(money, weights, horizon, key)
        paths.append({"key": key, "label": label, "rows": rows, "final": rows[-1]["value"]})
    finals = [p["final"] for p in paths]
    vol = portfolio_volatility(weights)
    return {
        "amount": float(money),
        "allocation": {k: round(w * 100, 2) for k, w in weights.items()},
        "horizon_years": horizon,
        "paths": paths,
        "path_range": {"lowest": min(finals), "highest": max(finals)},
        "monte_carlo": monte_carlo(money, weights, horizon, seed=seed),
        "loss_probability_by_horizon": loss_probability_by_horizon(money, weights, seed),
        "diversification": round(diversification_score(weights), 3),
        "volatility": round(vol, 3),
        "risk_level": risk_label(vol),
        "disclaimer": DISCLAIMER,
    }


# ---------------------------------------------------------------------------
# Scenario flow: allocate -> (market fall) -> respond -> result
# ---------------------------------------------------------------------------


def pick_path(seed: int, horizon: int) -> str | None:
    """Pick a path with a fall the student can react to before the horizon ends."""
    candidates = [k for k, year in CRASH_PATHS.items() if year < horizon]
    if not candidates:
        return None
    return sorted(candidates)[seed % len(candidates)]


def horizon_fit(vol: float, horizon: int) -> float:
    """How well the portfolio's risk suits the time horizon (0..1)."""
    if horizon <= 1:
        limit = 0.04
    elif horizon <= 3:
        limit = 0.09
    elif horizon <= 5:
        limit = 0.14
    else:
        limit = 0.20
    if vol <= limit:
        return 1.0
    return max(0.0, 1 - (vol - limit) / limit)


def crash_event(amount: Decimal, weights: dict[str, float], horizon: int, path_key: str) -> dict:
    year = CRASH_PATHS[path_key]
    rows = run_path(amount, weights, year, path_key)
    return {
        "path": path_key,
        "year": year,
        "value": rows[-1]["value"],
        # Change since the start can still be positive if earlier years were good,
        # so the fall in the event year is reported separately.
        "change_pct": round((rows[-1]["value"] - float(amount)) / float(amount) * 100, 1),
        "year_change_pct": rows[-1]["return_pct"],
        "market_change_pct": _MARKET_PATHS[path_key][1][year - 1],
        "options": [
            {"key": "hold", "label": "Stay invested and wait"},
            {"key": "sell_all", "label": "Sell everything and move to Steady Deposit"},
            {"key": "rebalance", "label": "Rebalance back to my original mix"},
        ],
    }


def evaluate_scenario(
    *,
    amount: Decimal,
    weights: dict[str, float],
    horizon: int,
    path_key: str | None,
    action: CrashAction | None,
    seed: int,
) -> dict[str, Any]:
    vol = portfolio_volatility(weights)
    div = diversification_score(weights)
    fit = horizon_fit(vol, horizon)
    single = sum(w for k, w in weights.items() if ASSETS[k].single_company)

    components = {
        "diversification": round(25 * div),
        "risk_matches_horizon": round(35 * fit),
        "concentration": 15 if single <= 0.2 else (7 if single <= 0.4 else 0),
        "steady_response": 25 if action in (None, "hold", "rebalance") else 5,
    }
    feedback: list[dict[str, str]] = []
    feedback.append(
        {
            "tone": "positive" if div >= 0.5 else "caution",
            "concept": "diversification",
            "message": "Spreading money across different baskets means one bad company "
            "cannot sink everything."
            if div >= 0.5
            else "Most of your money sits in one place. Diversifying limits how much a "
            "single failure can hurt.",
        }
    )
    if single > 0.2:
        feedback.append(
            {
                "tone": "caution",
                "concept": "risk_return",
                "message": f"{round(single * 100)}% is in single companies. They can fall 40%+ "
                "in a year even when the overall market is fine.",
            }
        )
    feedback.append(
        {
            "tone": "positive" if fit >= 0.8 else "caution",
            "concept": "time_horizon",
            "message": (
                f"Your mix suits a {horizon}-year horizon."
                if fit >= 0.8
                else f"This mix swings a lot for money needed in {horizon} year(s). "
                "Money needed soon belongs in steadier options."
            ),
        }
    )

    path_result = None
    if path_key:
        crash_year = CRASH_PATHS[path_key]
        outcomes = {}
        for opt in ("hold", "sell_all", "rebalance"):
            rows = run_path(amount, weights, horizon, path_key, action_after_year=(crash_year, opt))
            outcomes[opt] = rows[-1]["value"]
        chosen_rows = run_path(
            amount, weights, horizon, path_key, action_after_year=(crash_year, action or "hold")
        )
        path_result = {
            "path": path_key,
            "label": _MARKET_PATHS[path_key][0],
            "rows": chosen_rows,
            "final": chosen_rows[-1]["value"],
            "outcome_by_action": outcomes,
        }
        if action == "sell_all":
            feedback.append(
                {
                    "tone": "caution",
                    "concept": "risk_return",
                    "message": "Selling after a fall turns a temporary drop into a permanent loss. "
                    "In this illustrative path the market recovered later; in real life recovery "
                    "is never guaranteed, which is why risk should match your timeline up front.",
                }
            )
        else:
            feedback.append(
                {
                    "tone": "positive",
                    "concept": "risk_return",
                    "message": "You stayed calm during the fall. Falls are part of investing; "
                    "having a long enough horizon is what lets you wait.",
                }
            )
    feedback.append(
        {
            "tone": "positive",
            "concept": "compounding",
            "message": "Returns earn returns: growth in later years is larger because it builds "
            "on earlier growth. Time is the ingredient compounding needs.",
        }
    )

    return {
        "score": sum(components.values()),
        "components": components,
        "diversification": round(div, 3),
        "volatility": round(vol, 3),
        "risk_level": risk_label(vol),
        "path_result": path_result,
        "monte_carlo": monte_carlo(amount, weights, horizon, seed=seed),
        "loss_probability_by_horizon": loss_probability_by_horizon(amount, weights, seed),
        "feedback": feedback,
        "concept_evidence": {
            "diversification": div >= 0.5 and single <= 0.2,
            "time_horizon": fit >= 0.8,
            "risk_return": action != "sell_all",
        },
        "disclaimer": DISCLAIMER,
    }
