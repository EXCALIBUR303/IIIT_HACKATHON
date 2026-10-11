"""Portfolio Quest engine: a persisted FICTIONAL practice portfolio (pure, no database).

Educational objective: let students *experience* holding, buying, selling and
waiting through market years, so risk, diversification and time horizon stop
being abstract. Nothing here is real: instruments are the fictional assets in
``engine.investing``, prices follow the fixed illustrative market paths, and no
live data is ever used.

Guardrails
* Educate, do not recommend investments. Simulated results do not predict
  anything real.
* All money is integer **paise**; quantities are whole units; no floats touch
  balances or prices.
* Deterministic: the same ``seed`` always produces the same prices.
"""

from __future__ import annotations

import zlib
from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal

from . import investing
from .money import SimulationError

DISCLAIMER = (
    "Fictional instruments and made-up prices for practice. Simulated gains and losses do not "
    "predict real markets and this is not investment advice."
)

PAISE_PER_RUPEE = 100
BASE_PRICE_PAISE = 10_000  # every fictional instrument starts at ₹100.00 per unit
MAX_ROUND = 10
MAX_QUANTITY = 1_000_000
MAX_TRANSFER_RUPEES_PER_RUN = 5_000

INSTRUMENT_KEYS = tuple(investing.ASSETS)
PATH_KEYS = tuple(investing._MARKET_PATHS)  # noqa: SLF001 - same package, fixed catalogue


@dataclass(frozen=True)
class Position:
    quantity: int
    cost_paise: int  # total amount paid for the units currently held


def make_seed(student_id: object, run_number: int) -> int:
    return zlib.crc32(f"{student_id}:portfolio:{run_number}".encode())


def path_for(seed: int) -> str:
    """The named market path this run follows (fixed table, chosen by seed)."""
    return PATH_KEYS[seed % len(PATH_KEYS)]


def price_series(instrument_key: str, path_key: str) -> list[int]:
    """Price in paise at round 0..MAX_ROUND, compounded one rounded step at a time."""
    if instrument_key not in investing.ASSETS:
        raise SimulationError("Unknown instrument", field="instrument_key")
    prices = [BASE_PRICE_PAISE]
    for year in range(1, MAX_ROUND + 1):
        ret = Decimal(str(investing.asset_return(instrument_key, path_key, year)))
        step = (Decimal(prices[-1]) * (Decimal(1) + ret)).quantize(Decimal(1), ROUND_HALF_UP)
        prices.append(max(int(step), 1))
    return prices


def price_at(instrument_key: str, path_key: str, round_no: int) -> int:
    if not 0 <= round_no <= MAX_ROUND:
        raise SimulationError("Round out of range", field="round")
    return price_series(instrument_key, path_key)[round_no]


def prices_at(path_key: str, round_no: int) -> dict[str, int]:
    return {k: price_at(k, path_key, round_no) for k in INSTRUMENT_KEYS}


def parse_quantity(value: object) -> int:
    if isinstance(value, bool) or not isinstance(value, int):
        raise SimulationError("Quantity must be a whole number of units", field="quantity")
    if value < 1:
        raise SimulationError("Quantity must be at least 1 unit", field="quantity")
    if value > MAX_QUANTITY:
        raise SimulationError("Quantity is unrealistically large", field="quantity")
    return value


def check_buy(cash_paise: int, price_paise: int, quantity: int) -> int:
    """Total cost of a purchase, raising if cash would go negative."""
    cost = price_paise * quantity
    if cost > cash_paise:
        raise SimulationError(
            "Not enough practice cash for this purchase.",
            code="insufficient_funds",
            field="quantity",
        )
    return cost


def check_sell(position: Position | None, quantity: int) -> None:
    owned = position.quantity if position else 0
    if quantity > owned:
        raise SimulationError(
            f"You only hold {owned} unit(s) of this instrument.",
            code="insufficient_holdings",
            field="quantity",
        )


def apply_buy(position: Position | None, quantity: int, cost_paise: int) -> Position:
    base = position or Position(0, 0)
    return Position(base.quantity + quantity, base.cost_paise + cost_paise)


def apply_sell(position: Position, quantity: int) -> tuple[Position | None, int]:
    """Sell at average cost. Returns (remaining position or None, cost basis released)."""
    if quantity == position.quantity:
        return None, position.cost_paise
    released = (
        Decimal(position.cost_paise) * Decimal(quantity) / Decimal(position.quantity)
    ).quantize(Decimal(1), ROUND_HALF_UP)
    released_int = int(released)
    return Position(position.quantity - quantity, position.cost_paise - released_int), released_int


def valuation(
    cash_paise: int,
    holdings: dict[str, Position],
    prices: dict[str, int],
    contributed_paise: int,
) -> dict[str, object]:
    rows = []
    invested = 0
    for key in INSTRUMENT_KEYS:
        pos = holdings.get(key)
        if not pos:
            continue
        value = pos.quantity * prices[key]
        invested += value
        rows.append(
            {
                "instrument_key": key,
                "quantity": pos.quantity,
                "cost_paise": pos.cost_paise,
                "avg_cost_paise": round(pos.cost_paise / pos.quantity),
                "price_paise": prices[key],
                "value_paise": value,
                "gain_paise": value - pos.cost_paise,
            }
        )
    total = cash_paise + invested
    for row in rows:
        row["weight_pct"] = round(100 * row["value_paise"] / invested, 1) if invested else 0.0  # type: ignore[operator]
    return {
        "cash_paise": cash_paise,
        "invested_paise": invested,
        "total_paise": total,
        "contributed_paise": contributed_paise,
        "gain_paise": total - contributed_paise,
        "holdings": rows,
    }


def single_company_share(holdings_rows: list[dict[str, object]]) -> float:
    """Fraction (0..1) of invested value sitting in single-company instruments."""
    invested = sum(r["value_paise"] for r in holdings_rows)  # type: ignore[misc]
    if not invested:
        return 0.0
    single = sum(
        r["value_paise"]  # type: ignore[misc]
        for r in holdings_rows
        if investing.ASSETS[r["instrument_key"]].single_company  # type: ignore[index]
    )
    return single / invested


def year_event(path_key: str, round_no: int) -> dict[str, object]:
    """A short, factual description of what the market did in ``round_no`` (1-based)."""
    market = investing._MARKET_PATHS[path_key][1][round_no - 1]  # noqa: SLF001
    if market <= -10:
        mood = "A sharp fall"
    elif market < 0:
        mood = "A small dip"
    elif market < 8:
        mood = "A quiet year"
    else:
        mood = "A strong year"
    return {
        "round": round_no,
        "market_change_pct": market,
        "headline": f"{mood}: the fictional market moved {market:+d}% in year {round_no}.",
    }


MOODS: dict[str, tuple[str, str]] = {
    "crash": (
        "Market crash",
        "Prices fell sharply. Single companies and growth baskets fell the most.",
    ),
    "recovery": (
        "Recovery",
        "Prices bounced back after a hard stretch. Staying invested mattered.",
    ),
    "rally": ("Strong rally", "Most things rose. Riskier holdings rose the most."),
    "sideways": (
        "Sideways year",
        "Prices barely moved, or dipped a little. Steady holdings held up.",
    ),
    "calm": ("Steady growth", "A normal year of gradual gains."),
}
PROMPTS: dict[str, str] = {
    "crash": "A big fall is happening. Would you hold, add or sell, and why?",
    "recovery": "Prices are recovering. Did waiting out the fall change how you feel about risk?",
    "rally": "Everything is rising. Is your portfolio still balanced, or has one piece grown big?",
    "sideways": "Not much happened. Is patience part of your plan, or are you tempted to act?",
    "calm": "A quiet year. What would you do next?",
}


def year_summary(
    path_key: str,
    round_no: int,
    total_before: int,
    total_after: int,
    accessible: list[str],
) -> dict[str, object]:
    """Everything the Decade Simulator shows about one completed year (1-based)."""
    pcts = investing._MARKET_PATHS[path_key][1]  # noqa: SLF001
    market = pcts[round_no - 1]
    prev = pcts[round_no - 2] if round_no > 1 else 0
    if market <= -10:
        mood = "crash"
    elif prev <= -5 and market >= 8:
        mood = "recovery"
    elif market >= 12:
        mood = "rally"
    elif -10 < market <= 5:
        mood = "sideways"
    else:
        mood = "calm"
    title, body = MOODS[mood]
    returns = {k: investing.asset_return(k, path_key, round_no) * 100 for k in accessible}
    best = max(returns, key=returns.__getitem__)
    worst = min(returns, key=returns.__getitem__)
    change = total_after - total_before
    change_pct = round(change / total_before * 100, 1) if total_before else 0.0
    if change == 0:
        consequence = (
            "Your balance did not change. Holding only cash means the market cannot hurt you, "
            "or help you."
        )
    elif market < 0 and change_pct > market:
        consequence = (
            f"Your portfolio moved {change_pct:+.1f}% while the market fell {abs(market)}%. "
            "Holding steadier things reduced the damage."
        )
    elif market > 0 and change_pct < market:
        consequence = (
            f"Your portfolio moved {change_pct:+.1f}% while the market rose {market}%. "
            "Holding steadier things or cash traded some growth for a smoother ride."
        )
    else:
        consequence = (
            f"Your portfolio moved {change_pct:+.1f}% in a market that moved {market:+d}%."
        )
    return {
        "round": round_no,
        "mood": mood,
        "title": f"Year {round_no}: {title}",
        "summary": body,
        "market_change_pct": market,
        "total_before_paise": total_before,
        "total_after_paise": total_after,
        "change_paise": change,
        "change_pct": change_pct,
        "best": {
            "key": best,
            "label": investing.ASSETS[best].label,
            "return_pct": round(returns[best], 1),
        },
        "worst": {
            "key": worst,
            "label": investing.ASSETS[worst].label,
            "return_pct": round(returns[worst], 1),
        },
        "consequence": consequence,
        "prompt": PROMPTS[mood],
    }


def reflection_lines(
    before: dict[str, object], after: dict[str, object], event: dict[str, object]
) -> list[str]:
    """Plain-language review of one year, grounded only in the numbers just computed."""
    lines: list[str] = []
    change = int(after["total_paise"]) - int(before["total_paise"])  # type: ignore[call-overload]
    direction = "rose" if change > 0 else "fell" if change < 0 else "stayed the same"
    lines.append(f"Your practice portfolio {direction} by ₹{abs(change) / 100:,.2f} this year.")
    rows = after["holdings"]
    if rows:
        worst = min(rows, key=lambda r: r["gain_paise"])  # type: ignore[index, arg-type]
        best = max(rows, key=lambda r: r["gain_paise"])  # type: ignore[index, arg-type]
        if worst is not best:
            lines.append(
                f"{investing.ASSETS[best['instrument_key']].label} has done best so far and "  # type: ignore[index]
                f"{investing.ASSETS[worst['instrument_key']].label} worst, which is why holding "  # type: ignore[index]
                "different kinds of things changes how bumpy the ride feels."
            )
        if single_company_share(rows) > 0.5:  # type: ignore[arg-type]
            lines.append(
                "More than half your invested money is in single companies. One company's bad "
                "year can hurt a lot; baskets spread that risk."
            )
    else:
        lines.append("You held only cash, so the market could not change your balance this year.")
    if int(event["market_change_pct"]) < 0:  # type: ignore[call-overload]
        lines.append(
            "Falls are normal. What matters is whether you needed the money soon and whether you "
            "reacted calmly."
        )
    return lines
