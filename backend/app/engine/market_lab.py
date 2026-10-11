"""Market Lab engine: scenario-driven FICTIONAL stock-market practice (pure, no database).

Educational objective: let students feel profit, loss, volatility and news
pressure on familiar Indian company names, then see what happened after each
decision. Real company names make it believable; everything that happens to
them here is invented.

Guardrails
* Practice money only. Scenario events are fictional and say so. Nothing here
  predicts real prices, recommends a stock or executes a real trade.
* Prices start from a reference close (real delayed data when a provider is
  configured, otherwise an illustrative demo price) and then follow a seeded,
  deterministic simulation. The future is never sent to the client.
* All money is integer paise; quantities are whole shares.
"""

from __future__ import annotations

import random
import zlib
from dataclasses import dataclass, field

from .money import SimulationError

DISCLAIMER = (
    "Fictional portfolio with practice money. Scenario events are invented and prices are "
    "simulated after the reference close. This is not investment advice and nothing here is a "
    "real trade."
)

PAISE_PER_RUPEE = 100
STARTING_CASH_PAISE = 1_00_000 * PAISE_PER_RUPEE  # ₹1,00,000 of practice cash
MIN_PRICE_PAISE = 100
MAX_ACTIONS_PER_STEP = 12
MAX_QUANTITY = 100_000
# Until a student shows they understand diversification, one company may be at most this share
# of the portfolio. Mirrors the Portfolio Quest single-company rule.
MAX_WEIGHT_PCT = 25
MAX_WEIGHT_PCT_UNLOCKED = 40

REASONS: dict[str, str] = {
    "news": "Reacting to the news",
    "price_move": "The price moved a lot",
    "long_term": "Thinking long term",
    "diversify": "Spreading my risk",
    "lock_profit": "Locking in a gain",
    "cut_loss": "Limiting a loss",
    "following_others": "Others are doing it",
    "experiment": "Just testing an idea",
}


@dataclass(frozen=True)
class Company:
    key: str
    name: str
    ticker: str  # exchange ticker without suffix
    sector: str
    reference_rupees: int  # illustrative demo price used when no live reference is available
    vol: float  # typical daily move (standard deviation)
    beta: float  # how strongly it follows the whole market
    risk_level: str
    about: str

    @property
    def bse_symbol(self) -> str:
        return f"{self.ticker}.BSE"


COMPANIES: dict[str, Company] = {
    c.key: c
    for c in (
        Company("reliance", "Reliance Industries", "RELIANCE", "Energy & Retail", 1380, 0.014, 1.0,
                "medium", "Oil-to-chemicals, retail stores and telecom under one group."),
        Company("tcs", "Tata Consultancy Services", "TCS", "IT services", 3050, 0.013, 0.8,
                "medium", "Software and IT services, mostly for overseas clients."),
        Company("infosys", "Infosys", "INFY", "IT services", 1500, 0.015, 0.85,
                "medium", "IT consulting and outsourcing earned largely in dollars."),
        Company("hdfcbank", "HDFC Bank", "HDFCBANK", "Banking", 960, 0.012, 0.95,
                "medium", "Large private-sector bank: loans, deposits and cards."),
        Company("icicibank", "ICICI Bank", "ICICIBANK", "Banking", 1380, 0.013, 1.0,
                "medium", "Private-sector bank with retail and business lending."),
        Company("sbi", "State Bank of India", "SBIN", "Banking", 860, 0.016, 1.15,
                "medium", "India's largest public-sector bank."),
        Company("tatamotors", "Tata Motors", "TATAMOTORS", "Auto", 680, 0.021, 1.35,
                "high", "Cars, trucks and electric vehicles; sensitive to demand and rates."),
        Company("airtel", "Bharti Airtel", "BHARTIARTL", "Telecom", 1950, 0.013, 0.75,
                "medium", "Mobile, broadband and enterprise telecom services."),
        Company("lt", "Larsen & Toubro", "LT", "Infrastructure", 3700, 0.015, 1.1,
                "medium", "Engineering and construction for roads, plants and factories."),
    )
}  # fmt: skip

SECTORS = tuple(dict.fromkeys(c.sector for c in COMPANIES.values()))


# --- scenarios ---------------------------------------------------------------


@dataclass(frozen=True)
class Shock:
    target: str  # "market", "sector:<name>" or a company key
    pct: float  # fractional move added to that step's return
    offset: int = 0  # steps after the event is revealed


@dataclass(frozen=True)
class Event:
    step: int  # revealed at the start of this step
    category: str  # Earnings | Policy | Sector | Global | Company | Macro
    headline: str
    body: str
    why: str  # why this matters (educational)
    impact: str  # possible impact: Up | Down | Mixed | Watch
    affected: tuple[str, ...]  # company keys ("*" = whole market)
    shocks: tuple[Shock, ...] = ()
    after: str = ""  # what tended to happen next, shown once later steps are reached


@dataclass(frozen=True)
class Debrief:
    prompt: str
    options: tuple[tuple[str, str], ...]  # (key, text)
    correct: str
    explanation: str


@dataclass(frozen=True)
class Scenario:
    key: str
    title: str
    kicker: str
    summary: str
    lesson: str
    focus: tuple[str, ...]  # companies this scenario is about
    steps: int
    unit: str  # "day" or "year"
    market_drift: float
    market_vol: float
    sector_vol: float
    idio_scale: float
    events: tuple[Event, ...]
    debrief: Debrief
    skills: tuple[str, ...] = field(default=())

    def label(self, step: int) -> str:
        return f"Year {step}" if self.unit == "year" else f"Day {step + 1}"


ALL = ("*",)

SCENARIOS: dict[str, Scenario] = {
    s.key: s
    for s in (
        Scenario(
            key="earnings_surprise",
            title="Results day surprise",
            kicker="Earnings",
            summary="Infosys reports results mid-week. Watch how fast a surprise is priced in.",
            lesson="Prices react to the gap between results and expectations, usually before "
            "anyone can act on the headline.",
            focus=("infosys", "tcs"),
            steps=6,
            unit="day",
            market_drift=0.0006,
            market_vol=0.004,
            sector_vol=0.002,
            idio_scale=0.45,
            skills=("Earnings", "Expectations"),
            events=(
                Event(1, "Earnings", "Infosys results due after market hours tomorrow",
                      "Analysts have published estimates for revenue and profit. The company "
                      "reports after the close.",
                      "Results are compared with what analysts expected. The surprise, not the "
                      "profit alone, is what usually moves the price.",
                      "Watch", ("infosys", "tcs")),
                Event(2, "Earnings", "Fictional event: Infosys profit beats estimates and "
                      "raises its growth outlook",
                      "Profit came in well above estimates and the company sounded more "
                      "confident about next year.",
                      "A beat plus a better outlook changes what investors expect from the whole "
                      "IT sector, not just one company.",
                      "Up", ("infosys", "tcs"),
                      (Shock("infosys", 0.072), Shock("infosys", 0.012, 1),
                       Shock("tcs", 0.021), Shock("infosys", -0.02, 2)),
                      "Most of the jump happened at the open, before anyone could react to the "
                      "headline. A little of it faded two days later."),
            ),
            debrief=Debrief(
                "Infosys jumped at the open on results day. What does that show?",
                (("a", "Prices react to the surprise against expectations, often before you "
                       "can act"),
                 ("b", "Good results always make a price keep rising"),
                 ("c", "Buying straight after good news is a sure gain")),
                "a",
                "The price already reflected what people expected. Only the surprise moved it, "
                "and it moved within minutes, so chasing headlines rarely helps.",
            ),
        ),
        Scenario(
            key="rbi_policy",
            title="RBI policy day",
            kicker="Policy",
            summary="The RBI's rate decision lands on day four. Which sectors care most?",
            lesson="Interest-rate decisions hit rate-sensitive sectors such as banks and autos "
            "much harder than the rest of the market.",
            focus=("hdfcbank", "icicibank", "sbi", "tatamotors"),
            steps=6,
            unit="day",
            market_drift=0.0004,
            market_vol=0.004,
            sector_vol=0.002,
            idio_scale=0.45,
            skills=("Interest rates", "Sectors"),
            events=(
                Event(1, "Policy", "RBI's rate-setting committee meets this week",
                      "Most economists expect the repo rate to be cut. The decision is due in "
                      "two days.",
                      "The repo rate sets how costly it is for banks to borrow. Banks, car makers "
                      "and builders feel changes first.",
                      "Watch", ("hdfcbank", "icicibank", "sbi", "tatamotors")),
                Event(3, "Policy", "Fictional event: RBI holds the repo rate and warns that "
                      "inflation risks remain",
                      "The cut many expected did not come.",
                      "When an expected cut does not arrive, loans stay costlier for longer. "
                      "That hurts lenders and buyers of cars and homes most.",
                      "Down", ("hdfcbank", "icicibank", "sbi", "tatamotors"),
                      (Shock("sector:Banking", -0.034), Shock("sector:Auto", -0.032),
                       Shock("market", -0.007), Shock("sector:Banking", 0.012, 2)),
                      "Rate-sensitive sectors fell much more than IT and telecom, which barely "
                      "noticed. Banks recovered part of the fall two days later."),
            ),
            debrief=Debrief(
                "Why did bank and auto shares move most on policy day?",
                (("a", "Their business depends heavily on interest rates and loans"),
                 ("b", "The RBI sets their share prices"),
                 ("c", "They are the cheapest shares in the market")),
                "a",
                "Banks earn from lending and car buyers often borrow, so a rate decision changes "
                "their profits directly. Companies with little debt hardly react.",
            ),
        ),
        Scenario(
            key="global_selloff",
            title="Global market selloff",
            kicker="Global",
            summary="Overnight panic abroad drags Indian shares down. Sell, hold or buy?",
            lesson="Broad selloffs hit good and bad companies alike. Selling in panic can lock "
            "in a loss the market later recovers.",
            focus=ALL,
            steps=6,
            unit="day",
            market_drift=0.0002,
            market_vol=0.004,
            sector_vol=0.002,
            idio_scale=0.45,
            skills=("Volatility", "Patience"),
            events=(
                Event(1, "Global", "Fictional event: US markets fall sharply on recession "
                      "worries",
                      "Shares fell across the US and Europe overnight. Indian markets are "
                      "expected to open lower.",
                      "Foreign investors often sell many markets at once, so strong Indian "
                      "companies can fall on a day with no local news at all.",
                      "Down", ALL,
                      (Shock("market", -0.046), Shock("market", -0.019, 1),
                       Shock("market", 0.024, 2), Shock("market", 0.021, 3),
                       Shock("market", 0.016, 4)),
                      "After two weak days, prices steadily recovered most of the fall as the "
                      "panic eased."),
                Event(3, "Macro", "Fictional event: Foreign investors turn buyers again as "
                      "panic eases",
                      "Selling slowed and bargain hunters stepped in.",
                      "Fear fades as fast as it arrives. Prices often swing further than the "
                      "news deserves, in both directions.",
                      "Up", ALL),
            ),
            debrief=Debrief(
                "Prices fell for two days, then recovered. What did selling in a panic on day "
                "two most likely do?",
                (("a", "Locked in a loss the market later won back"),
                 ("b", "Avoided all the losses"),
                 ("c", "Made no difference at all")),
                "a",
                "Selling after a fall turns a paper loss into a real one. Students who held "
                "through the dip were back near where they started by day six.",
            ),
        ),
        Scenario(
            key="company_bad_news",
            title="Bad news for one company",
            kicker="Company",
            summary="A fictional plant problem hits Tata Motors while the market is calm.",
            lesson="Company-specific news can hit one stock hard while the market barely moves. "
            "How much of your money is in one company decides how much it hurts.",
            focus=("tatamotors",),
            steps=6,
            unit="day",
            market_drift=0.0007,
            market_vol=0.004,
            sector_vol=0.002,
            idio_scale=0.45,
            skills=("Single-stock risk", "Position size"),
            events=(
                Event(2, "Company", "Fictional event: A supplier fire halts output at a Tata "
                      "Motors plant",
                      "Production at one plant is paused for an unknown period.",
                      "Lost production means lost sales. Investors guess how long it lasts, so "
                      "the price can fall hard and then wobble.",
                      "Down", ("tatamotors",),
                      (Shock("tatamotors", -0.088), Shock("tatamotors", -0.024, 1),
                       Shock("tatamotors", 0.011, 3)),
                      "The rest of the market kept rising gently. Only holders of this one "
                      "company felt the fall."),
            ),
            debrief=Debrief(
                "Why does it matter how much of your portfolio was in one company?",
                (("a", "Company news can hit one stock hard while the market barely moves"),
                 ("b", "Single companies never fall more than the market"),
                 ("c", "It only matters for small companies")),
                "a",
                "A 10% fall in one company costs 10% if it is all you own, but only 1% if it is "
                "a tenth of your portfolio. That is what diversification buys you.",
            ),
        ),
        Scenario(
            key="expensive_results",
            title="Good results, high price",
            kicker="Valuation",
            summary="Bharti Airtel rallies into results. The results are good. Then what?",
            lesson="A good company is not always a good price. When hopes are already in the "
            "price, good news can still disappoint.",
            focus=("airtel",),
            steps=6,
            unit="day",
            market_drift=0.0004,
            market_vol=0.004,
            sector_vol=0.002,
            idio_scale=0.45,
            skills=("Valuation", "Expectations"),
            events=(
                Event(1, "Earnings", "Fictional event: Bharti Airtel rallies as expectations "
                      "climb ahead of results",
                      "The share has risen for days as investors bet on a strong quarter.",
                      "A run-up before results means a lot of good news may already be in the "
                      "price.",
                      "Watch", ("airtel",),
                      (Shock("airtel", 0.024), Shock("airtel", 0.03, 1))),
                Event(3, "Earnings", "Fictional event: Airtel profit rises strongly, roughly in "
                      "line with high hopes",
                      "Solid growth, but nothing better than what buyers had hoped for.",
                      "When results only match high hopes, there is nobody left to surprise. "
                      "Some buyers take their gains.",
                      "Mixed", ("airtel",),
                      (Shock("airtel", 0.008), Shock("airtel", -0.046, 1),
                       Shock("airtel", -0.018, 2)),
                      "The share slipped after the results even though the business did well."),
            ),
            debrief=Debrief(
                "Airtel posted strong results, but the share fell afterwards. Why?",
                (("a", "The good news was already in the price, so 'in line' disappointed"),
                 ("b", "The results were secretly bad"),
                 ("c", "Share prices fall after every result")),
                "a",
                "Buyers had paid up in advance. Results that only matched those hopes gave no "
                "reason to pay more, so some took profits.",
            ),
        ),
        Scenario(
            key="sector_rotation",
            title="Sector rotation",
            kicker="Sectors",
            summary="Money drifts from IT exporters to banks as conditions change.",
            lesson="Sectors take turns leading. Owning more than one sector smooths the ride.",
            focus=("tcs", "infosys", "hdfcbank", "icicibank", "sbi"),
            steps=6,
            unit="day",
            market_drift=0.0004,
            market_vol=0.004,
            sector_vol=0.002,
            idio_scale=0.45,
            skills=("Sectors", "Diversification"),
            events=(
                Event(1, "Sector", "Fictional event: Stronger rupee pressures IT exporters; "
                      "lenders expected to gain from lower rates",
                      "A stronger rupee means overseas earnings convert into fewer rupees.",
                      "IT companies earn in dollars, banks earn from lending at home. The same "
                      "news can push the two sectors in opposite directions.",
                      "Mixed", ("tcs", "infosys", "hdfcbank", "icicibank", "sbi"),
                      (Shock("sector:IT services", -0.02), Shock("sector:IT services", -0.015, 1),
                       Shock("sector:IT services", -0.011, 2), Shock("sector:Banking", 0.015),
                       Shock("sector:Banking", 0.012, 1), Shock("sector:Banking", 0.01, 2)),
                      "IT shares drifted lower for three days while banks rose. A mix of both "
                      "barely moved."),
                Event(3, "Sector", "Fictional event: Fund managers shift money from IT to banks",
                      "Big investors report moving money between sectors.",
                      "Rotation is about where money flows next, not whether a company is good.",
                      "Watch", ("tcs", "infosys", "hdfcbank", "icicibank", "sbi")),
            ),
            debrief=Debrief(
                "What is sector rotation?",
                (("a", "Money moving from one group of industries to another as conditions "
                       "change"),
                 ("b", "Companies swapping their business every year"),
                 ("c", "A rule that every sector must rise in turn")),
                "a",
                "Changing rates, currencies or demand favour different industries at different "
                "times. Holding several sectors means one falling does not sink you.",
            ),
        ),
        Scenario(
            key="long_term_compounding",
            title="Ten years of compounding",
            kicker="Long term",
            summary="Hold through a decade with a crash and a correction on the way.",
            lesson="Over long periods, staying invested through bad years lets gains compound. "
            "Missing the recovery costs more than the fall.",
            focus=ALL,
            steps=11,
            unit="year",
            market_drift=0.105,
            market_vol=0.05,
            sector_vol=0.03,
            idio_scale=3.5,
            skills=("Compounding", "Time horizon"),
            events=(
                Event(1, "Macro", "Fictional event: A steady year as company profits grow",
                      "Earnings rise across most sectors.",
                      "Over years, share prices tend to follow profits. Single years are noisy.",
                      "Up", ALL),
                Event(3, "Global", "Fictional event: A global slowdown drags markets down",
                      "Demand falls around the world and shares drop sharply.",
                      "Big falls feel permanent while they happen. Over a decade they are often "
                      "a few bad steps on a longer climb.",
                      "Down", ALL,
                      (Shock("market", -0.24), Shock("market", 0.09, 1), Shock("market", 0.04, 2)),
                      "The market fell hard, then recovered over the next two years."),
                Event(7, "Macro", "Fictional event: A sharp correction after a strong run",
                      "Prices fall after rising fast for several years.",
                      "Corrections cool prices that ran ahead of profits. They are a normal part "
                      "of long periods.",
                      "Down", ALL, (Shock("market", -0.13),),
                      "The correction was smaller than the gains of the years before it."),
            ),
            debrief=Debrief(
                "Your holdings fell in year three. What mattered most over the ten years?",
                (("a", "Staying invested so gains could compound after the fall"),
                 ("b", "Selling at the bottom to avoid more falls"),
                 ("c", "Trading every year to catch each move")),
                "a",
                "Gains build on gains. Students who held through year three captured the "
                "recovery; those who sold usually bought back higher, or not at all.",
            ),
        ),
    )
}  # fmt: skip


def scenario(key: str) -> Scenario:
    try:
        return SCENARIOS[key]
    except KeyError as exc:
        raise SimulationError("Unknown scenario", field="scenario_key") from exc


def company(key: str) -> Company:
    try:
        return COMPANIES[key]
    except KeyError as exc:
        raise SimulationError("Unknown company", field="company_key") from exc


def make_seed(student_id: object, scenario_key: str, attempt: int) -> int:
    return zlib.crc32(f"{student_id}:market:{scenario_key}:{attempt}".encode())


def default_anchors() -> dict[str, int]:
    return {k: c.reference_rupees * PAISE_PER_RUPEE for k, c in COMPANIES.items()}


def price_paths(sc: Scenario, seed: int, anchors: dict[str, int]) -> dict[str, list[int]]:
    """Every company's price in paise at steps 0..steps-1. Deterministic for a given seed."""
    rng = random.Random(seed)
    shocks: dict[int, list[Shock]] = {}
    for ev in sc.events:
        for sh in ev.shocks:
            shocks.setdefault(ev.step + sh.offset, []).append(sh)
    prices = {k: [max(int(anchors.get(k) or c.reference_rupees * 100), MIN_PRICE_PAISE)]
              for k, c in COMPANIES.items()}  # fmt: skip
    for step in range(1, sc.steps):
        market = sc.market_drift + rng.gauss(0, sc.market_vol)
        sector = {s: rng.gauss(0, sc.sector_vol) for s in SECTORS}
        here = shocks.get(step, [])
        for key, c in COMPANIES.items():
            ret = c.beta * market + sector[c.sector]
            ret += rng.gauss(0, c.vol * sc.idio_scale)  # yearly scenarios scale this up
            for sh in here:
                if sh.target == "market":
                    ret += sh.pct * c.beta
                elif sh.target == f"sector:{c.sector}" or sh.target == key:
                    ret += sh.pct
            ret = max(ret, -0.6)
            prices[key].append(max(round(prices[key][-1] * (1 + ret)), MIN_PRICE_PAISE))
    return prices


def revealed_events(sc: Scenario, step: int) -> list[Event]:
    return [e for e in sc.events if e.step <= step]


def events_between(sc: Scenario, after_step: int, upto_step: int, key: str) -> list[Event]:
    """Events revealed after a decision (exclusive) up to now (inclusive) that touched ``key``."""
    c = COMPANIES.get(key)
    out = []
    for e in sc.events:
        if not after_step < e.step <= upto_step:
            continue
        touches = "*" in e.affected or key in e.affected
        touches = touches or any(
            s.target == "market" or (c and s.target == f"sector:{c.sector}") for s in e.shocks
        )
        if touches:
            out.append(e)
    return out
