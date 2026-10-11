"""Market data and news providers with demo fallbacks.

``MarketDataProvider`` and ``NewsProvider`` are the two seams. Real providers
are picked only when a server-side key is configured:

* ``AlphaVantageProvider``: end-of-day BSE closes (``RELIANCE.BSE`` ...). The free
  tier allows about 25 calls a day, so one refresh (one call per company) runs at
  most every ``market_data_ttl_minutes`` and the last good closes are kept.
* ``MarketauxNewsProvider``: India market news with thumbnails, refreshed at most
  every ``news_ttl_minutes``.

Anything missing or failing falls back per item to ``MockMarketDataProvider`` /
``MockNewsProvider``, whose output is always labelled as demo data. Nothing is
scraped, and the keys are only ever sent to the provider's own HTTPS API.
"""

from __future__ import annotations

import ipaddress
import logging
import random
import re
import socket
import time
import zlib
from collections import OrderedDict
from datetime import UTC, date, datetime, timedelta
from typing import Any, Protocol

import httpx
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.engine import market_lab as lab

from . import store

log = logging.getLogger(__name__)

ALPHA_VANTAGE_URL = "https://www.alphavantage.co/query"
MARKETAUX_URL = "https://api.marketaux.com/v1/news/all"
HTTP_TIMEOUT = 5.0
HISTORY_POINTS = 30
NEWS_KEEP = 18


class ProviderLimited(Exception):
    """The provider answered with a rate-limit or quota message."""


# --- shared helpers -------------------------------------------------------------


def _paise(value: object) -> int | None:
    try:
        out = round(float(str(value)) * lab.PAISE_PER_RUPEE)
    except (TypeError, ValueError):
        return None
    return out if out > 0 else None


def _https(url: object) -> str | None:
    return url if isinstance(url, str) and url.startswith("https://") and len(url) < 1000 else None


def _clip(text: object, limit: int) -> str:
    s = re.sub(r"\s+", " ", str(text or "")).strip()
    return s if len(s) <= limit else s[: limit - 1].rstrip() + "…"


def _quote_from_history(c: lab.Company, history: list[tuple[str, int]], source: str) -> dict:
    """``history`` is oldest-first (date, close in paise)."""
    last_date, last = history[-1]
    prev = history[-2][1] if len(history) > 1 else last
    change = last - prev
    return {
        "key": c.key,
        "name": c.name,
        "ticker": c.ticker,
        "symbol": c.bse_symbol,
        "sector": c.sector,
        "about": c.about,
        "risk_level": c.risk_level,
        "price_paise": last,
        "prev_close_paise": prev,
        "change_paise": change,
        "change_pct": round(change / prev * 100, 2) if prev else 0.0,
        "history": [{"date": d, "close_paise": p} for d, p in history[-HISTORY_POINTS:]],
        "as_of": last_date,
        "source": source,
    }


def _trading_days(n: int, end: date) -> list[date]:
    days: list[date] = []
    d = end
    while len(days) < n:
        if d.weekday() < 5:
            days.append(d)
        d -= timedelta(days=1)
    return list(reversed(days))


# --- market data ----------------------------------------------------------------


class MarketDataProvider(Protocol):
    name: str

    def snapshot(self, db: Session) -> dict[str, Any]: ...


class MockMarketDataProvider:
    """Illustrative reference prices: a seeded month of closes ending at the demo price."""

    name = "Demo data"

    def quote(self, key: str) -> dict:
        c = lab.company(key)
        rng = random.Random(zlib.crc32(f"demo:{key}".encode()))
        end = datetime.now(UTC).date() - timedelta(days=1)
        days = _trading_days(HISTORY_POINTS, end)
        closes = [c.reference_rupees * lab.PAISE_PER_RUPEE]
        for _ in days[1:]:  # walk backwards from today's demo price
            closes.append(max(round(closes[-1] / (1 + rng.gauss(0.0004, c.vol))), 100))
        closes.reverse()
        rows = [(d.isoformat(), p) for d, p in zip(days, closes, strict=True)]
        return _quote_from_history(c, rows, "demo")

    def snapshot(self, db: Session | None = None) -> dict[str, Any]:
        quotes = [self.quote(k) for k in lab.COMPANIES]
        return _snapshot(quotes, provider=self.name)


class AlphaVantageProvider:
    """Daily BSE closes from Alpha Vantage, cached in Postgres and refreshed a few at a time.

    One request refreshes at most ``BATCH`` stale companies (so it stays well inside a
    serverless time limit and the free tier's one-call-per-second pacing); the rest follow on
    the next requests. A rate-limit reply pauses refreshing for an hour. Everything not yet
    fetched falls back to labelled demo prices.
    """

    name = "Alpha Vantage"
    BATCH = 3

    def __init__(self, api_key: str, ttl_minutes: int, *, pause_seconds: float = 1.2):
        self.api_key = api_key
        self.ttl = ttl_minutes * 60
        self.pause = pause_seconds
        self.fallback = MockMarketDataProvider()

    def fetch_company(self, client: httpx.Client, c: lab.Company) -> dict | None:
        r = client.get(
            ALPHA_VANTAGE_URL,
            params={
                "function": "TIME_SERIES_DAILY",
                "symbol": c.bse_symbol,
                "outputsize": "compact",
                "apikey": self.api_key,
            },
        )
        r.raise_for_status()
        body = r.json()
        if not isinstance(body, dict):
            return None
        if "Note" in body or "Information" in body:
            raise ProviderLimited(str(body.get("Note") or body.get("Information"))[:200])
        series = body.get("Time Series (Daily)")
        if not isinstance(series, dict) or not series:
            return None
        rows = []
        for day, bar in series.items():
            close = _paise(bar.get("4. close")) if isinstance(bar, dict) else None
            if close and re.fullmatch(r"\d{4}-\d{2}-\d{2}", str(day)):
                rows.append((str(day), close))
        rows.sort()
        return _quote_from_history(c, rows, "alpha_vantage") if rows else None

    def refresh(self, db: Session, stale: list[str]) -> None:
        """Fetch up to ``BATCH`` of the stale companies and store whatever succeeds."""
        fetched = 0
        # The free tier allows about one call a second across all requests, not just within one.
        last = store.load(db, "alpha:_last").get("alpha:_last")
        if last and self.pause:
            time.sleep(max(0.0, min(self.pause, self.pause - (time.time() - last[1]))))
        with httpx.Client(timeout=HTTP_TIMEOUT) as client:
            for key in stale[: self.BATCH]:
                if fetched and self.pause:
                    time.sleep(self.pause)
                c = lab.COMPANIES[key]
                try:
                    quote = self.fetch_company(client, c)
                except ProviderLimited as exc:
                    # "25 requests per day" means stop for hours; a burst warning only needs a
                    # moment, so other requests can carry on shortly.
                    daily = "per day" in str(exc).lower() or "daily" in str(exc).lower()
                    log.warning(
                        "Alpha Vantage limit reached (%s): %s", "daily" if daily else "burst", exc
                    )
                    store.set_backoff(db, "alpha:_backoff", 6 * 3600 if daily else 30)
                    return
                except (httpx.HTTPError, ValueError) as exc:
                    log.warning("Alpha Vantage %s failed: %s", c.bse_symbol, exc)
                    fetched += 1
                    continue
                fetched += 1
                store.save(db, "alpha:_last", {"at": time.time()})
                if quote:
                    store.save(db, f"alpha:{key}", quote)
                else:
                    # An unknown symbol: remember the miss so it is not retried every request.
                    store.save(db, f"alpha:{key}", {"missing": True})

    def snapshot(self, db: Session) -> dict[str, Any]:
        cached = store.load(db, "alpha:")
        now = time.time()
        stale = [
            k
            for k in lab.COMPANIES
            if f"alpha:{k}" not in cached or now - cached[f"alpha:{k}"][1] > self.ttl
        ]
        if (
            stale
            and not store.backoff_active(db, "alpha:_backoff")
            and store.try_refresh_lock(db, "alpha")
        ):
            self.refresh(db, stale)
            cached = store.load(db, "alpha:")
        quotes = []
        for k in lab.COMPANIES:
            payload = cached.get(f"alpha:{k}", ({}, 0))[0]
            quotes.append(payload if payload.get("source") else self.fallback.quote(k))
        return _snapshot(quotes, provider=self.name)


def _snapshot(quotes: list[dict], *, provider: str) -> dict[str, Any]:
    real = sum(q["source"] != "demo" for q in quotes)
    if real == len(quotes):
        status = "delayed"
        note = (
            f"Reference closes from {provider} (end of day, may be delayed). Scenario prices "
            "are simulated from these."
        )
    elif real:
        status = "mixed"
        note = (
            f"{real} of {len(quotes)} reference closes from {provider} (delayed); the rest are "
            "demo prices. Scenario prices are simulated."
        )
    else:
        status = "demo"
        note = "Demo reference prices: illustrative, not live. Scenario prices are simulated."
    as_of = max((q["as_of"] for q in quotes if q["source"] != "demo"), default=None)
    return {
        "status": status,
        "provider": provider if real else "Demo data",
        "note": note,
        "as_of": as_of,
        "quotes": quotes,
    }


# --- news -------------------------------------------------------------------------

CATEGORY_RULES: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("Earnings", ("result", "profit", "quarter", "q1", "q2", "q3", "q4", "earnings", "revenue",
                  "net income", "ebitda", "margin")),
    ("Policy", ("rbi", "repo", "sebi", "policy", "rate cut", "rate hike", "government", "budget",
                "gst", "regulator", "ministry")),
    ("Global", ("us ", "u.s.", "fed", "global", "china", "wall street", "crude", "brent", "dollar",
                "tariff", "nasdaq", "dow", "europe", "japan")),
    ("Macro", ("inflation", "gdp", "economy", "rupee", "cpi", "wpi", "iip", "monsoon", "fiscal",
               "growth rate")),
    ("Sector", ("sector", "banks", "lenders", "it stocks", "auto stocks", "telecom", "pharma",
                "metal", "realty", "fmcg", "infra")),
)  # fmt: skip

WHY: dict[str, str] = {
    "Earnings": "Results are judged against what analysts expected. The surprise, more than the "
    "profit itself, tends to move the price.",
    "Policy": "Policy and interest-rate changes shift borrowing costs and rules, which matter "
    "most for banks, auto makers and builders.",
    "Global": "Foreign investors move money across many markets at once, so news abroad can move "
    "Indian shares with no local trigger.",
    "Macro": "Inflation, growth and the rupee shape company profits and interest rates, which "
    "slowly feed into almost every share price.",
    "Sector": "Companies in one industry share costs and customers, so news about one often "
    "moves the others too.",
    "Company": "Company-specific news mostly moves that one share. How much it matters to you "
    "depends on how much of it you hold.",
}

NAME_HINTS: dict[str, tuple[str, ...]] = {
    "reliance": ("reliance",),
    "tcs": ("tcs", "tata consultancy"),
    "infosys": ("infosys",),
    "hdfcbank": ("hdfc bank",),
    "icicibank": ("icici bank", "icici"),
    "sbi": ("state bank of india", "sbi "),
    "tatamotors": ("tata motors",),
    "airtel": ("airtel",),
    "lt": ("larsen", "l&t"),
}
TICKER_TO_KEY = {c.ticker: k for k, c in lab.COMPANIES.items()}


def categorise(text: str) -> str:
    t = f" {text.lower()} "
    for category, words in CATEGORY_RULES:
        if any(w in t for w in words):
            return category
    return "Company"


def impact_from_sentiment(scores: list[float]) -> str:
    if not scores:
        return "Watch"
    if any(s > 0.2 for s in scores) and any(s < -0.2 for s in scores):
        return "Mixed"
    avg = sum(scores) / len(scores)
    return "Up" if avg > 0.2 else "Down" if avg < -0.2 else "Watch"


def affected_keys(text: str, symbols: list[str]) -> list[str]:
    keys = {TICKER_TO_KEY[s.split(".")[0].upper()] for s in symbols if s.split(".")[0].upper()
            in TICKER_TO_KEY}  # fmt: skip
    t = f" {text.lower()} "
    keys |= {k for k, hints in NAME_HINTS.items() if any(h in t for h in hints)}
    return [k for k in lab.COMPANIES if k in keys]


class NewsProvider(Protocol):
    name: str

    def feed(self, db: Session) -> dict[str, Any]: ...

    def image(self, db: Session, item_id: str) -> tuple[bytes, str] | None: ...


IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"}  # never SVG
MAX_IMAGE_BYTES = 1_500_000
MAX_IMAGES = 48


def _public_host(host: str) -> bool:
    """Refuse anything that is or resolves to a private, loopback or link-local address."""
    if not host or "." not in host or host.lower().endswith((".local", ".internal", "localhost")):
        return False
    try:
        ipaddress.ip_address(host)
        return False  # literal IPs are never expected from a news provider
    except ValueError:
        pass
    try:
        infos = socket.getaddrinfo(host, 443, proto=socket.IPPROTO_TCP)
    except OSError:
        return False
    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if not ip.is_global:
            return False
    return True


DEMO_NEWS: tuple[tuple[str, str, str, str, tuple[str, ...]], ...] = (
    ("Policy", "Explainer: what an RBI rate hold usually means for bank shares",
     "When the repo rate stays put, loan costs stay where they are. Here is why lenders react "
     "first.", "Mixed", ("hdfcbank", "icicibank", "sbi")),
    ("Earnings", "Results season: how TCS and Infosys are judged against estimates",
     "Analysts publish forecasts before results. The gap between forecast and actual is what "
     "traders watch.", "Watch", ("tcs", "infosys")),
    ("Global", "When US markets fall overnight, why Indian shares often open lower",
     "Global funds sell many markets together. A weak night abroad can mean a weak morning "
     "here.", "Down", ()),
    ("Sector", "Telecom tariffs: why Bharti Airtel's revenue per user is watched closely",
     "Small changes in what each customer pays add up across hundreds of millions of users.",
     "Watch", ("airtel",)),
    ("Company", "Reliance Industries: one company, three very different businesses",
     "Energy, retail and telecom each respond to different news, which makes the share harder "
     "to read.", "Mixed", ("reliance",)),
    ("Macro", "Inflation, the rupee and your practice portfolio",
     "Rising prices and a weaker rupee affect exporters and importers in opposite ways.",
     "Mixed", ("tcs", "infosys", "reliance")),
    ("Sector", "Infrastructure orders and engineering companies like Larsen & Toubro",
     "Order books show work already won. Investors track how fast they grow.", "Up", ("lt",)),
    ("Company", "Car demand, EV plans and what tends to move Tata Motors",
     "Auto makers are sensitive to loan rates, fuel prices and new launches.", "Watch",
     ("tatamotors",)),
)  # fmt: skip


class MockNewsProvider:
    """Educational explainers about real companies, always labelled as demo content."""

    name = "Demo news"

    def image(self, db: Session | None, item_id: str) -> tuple[bytes, str] | None:
        return None  # demo items draw their own thumbnails

    def items(self) -> list[dict[str, Any]]:
        now = datetime.now(UTC).replace(minute=0, second=0, microsecond=0)
        out = []
        for i, (category, title, snippet, impact, affected) in enumerate(DEMO_NEWS):
            out.append(
                {
                    "id": f"demo-{i}",
                    "title": title,
                    "snippet": snippet,
                    "source": "RupeeRise demo desk",
                    "url": None,
                    "image_url": None,
                    "published_at": (now - timedelta(hours=2 + i * 3)).isoformat(),
                    "category": category,
                    "impact": impact,
                    "why": WHY[category],
                    "affected": list(affected),
                    "is_demo": True,
                }
            )
        return out

    def feed(self, db: Session | None = None) -> dict[str, Any]:
        return {
            "status": "demo",
            "provider": self.name,
            "note": "Demo explainers, not live news. Add MARKETAUX_API_TOKEN on the server for "
            "live headlines.",
            "items": self.items(),
        }


class MarketauxNewsProvider:
    """India market headlines from Marketaux, cached and merged across refreshes."""

    name = "Marketaux"

    KEY = "news:marketaux"

    def __init__(self, token: str, ttl_minutes: int):
        self.token = token
        self.ttl = ttl_minutes * 60
        self.fallback = MockNewsProvider()
        self._images: OrderedDict[str, tuple[bytes, str]] = OrderedDict()

    def _get(self, client: httpx.Client, params: dict[str, str]) -> list[dict[str, Any]]:
        r = client.get(MARKETAUX_URL, params={**params, "api_token": self.token})
        if r.status_code in (402, 429):
            raise ProviderLimited(f"HTTP {r.status_code}")
        r.raise_for_status()
        body = r.json()
        data = body.get("data") if isinstance(body, dict) else None
        return [self.item(a) for a in data or [] if isinstance(a, dict) and a.get("title")]

    @staticmethod
    def item(a: dict[str, Any]) -> dict[str, Any]:
        title = _clip(a.get("title"), 200)
        snippet = _clip(a.get("snippet") or a.get("description"), 320)
        entities = [e for e in a.get("entities") or [] if isinstance(e, dict)]
        scores = [float(e["sentiment_score"]) for e in entities
                  if isinstance(e.get("sentiment_score"), int | float)]  # fmt: skip
        category = categorise(f"{title} {snippet}")
        return {
            "id": re.sub(r"[^A-Za-z0-9-]", "", str(a.get("uuid") or zlib.crc32(title.encode())))[
                :64
            ],
            "title": title,
            "snippet": snippet,
            "source": _clip(a.get("source"), 80) or "Marketaux",
            "url": _https(a.get("url")),
            # Kept server-side; the browser gets a same-origin proxy path (see ``image``).
            "image_source": _https(a.get("image_url")),
            "published_at": _clip(a.get("published_at"), 40) or None,
            "category": category,
            "impact": impact_from_sentiment(scores),
            "why": WHY[category],
            "affected": affected_keys(
                f"{title} {snippet}", [str(e.get("symbol") or "") for e in entities]
            ),
            "is_demo": False,
        }

    def fetch(self, previous: list[dict[str, Any]] | None) -> list[dict[str, Any]] | None:
        symbols = ",".join(f"{c.ticker}.NS" for c in lab.COMPANIES.values())
        calls = (
            {"symbols": symbols, "filter_entities": "true", "language": "en"},
            {"countries": "in", "language": "en"},
        )
        got: list[dict[str, Any]] = []
        with httpx.Client(timeout=HTTP_TIMEOUT) as client:
            for params in calls:
                try:
                    got.extend(self._get(client, params))
                except ProviderLimited as exc:
                    log.warning("Marketaux limit reached: %s", exc)
                    break
                except (httpx.HTTPError, ValueError) as exc:
                    log.warning("Marketaux request failed: %s", exc)
        if not got:
            return None
        merged = {i["id"]: i for i in [*(previous or []), *got]}
        items = sorted(merged.values(), key=lambda i: i["published_at"] or "", reverse=True)
        return items[:NEWS_KEEP]

    def _items(self, db: Session) -> list[dict[str, Any]]:
        """Cached headlines, refreshed (inline, two quick calls) when stale or empty."""
        row = store.load(db, self.KEY).get(self.KEY)
        items = list(row[0].get("items") or []) if row else []
        stale = row is None or time.time() - row[1] > self.ttl
        if (
            (stale or not items)
            and not store.backoff_active(db, "news:_backoff")
            and store.try_refresh_lock(db, "news")
        ):
            fresh = self.fetch(items)
            if fresh:
                store.save(db, self.KEY, {"items": fresh})
                return fresh
            store.set_backoff(db, "news:_backoff", 15 * 60)
        return items

    def feed(self, db: Session) -> dict[str, Any]:
        items = self._items(db)
        if not items:
            out = self.fallback.feed()
            out["note"] = "Live news is unavailable right now, so these are demo explainers."
            return out
        public = [
            {
                **{k: v for k, v in i.items() if k != "image_source"},
                "image_url": f"/api/v1/portfolio/news/{i['id']}/image"
                if i["image_source"]
                else None,
            }
            for i in items
        ]
        return {
            "status": "live",
            "provider": self.name,
            "note": "Headlines from Marketaux. 'Possible impact' is a learning prompt, not a "
            "prediction.",
            "items": public,
        }

    def image(self, db: Session, item_id: str) -> tuple[bytes, str] | None:
        """Fetch (and keep) a cached article's thumbnail so students' browsers never contact
        third-party image hosts. Only URLs the provider itself returned are ever fetched."""
        if item_id in self._images:
            self._images.move_to_end(item_id)
            return self._images[item_id]
        row = store.load(db, self.KEY).get(self.KEY)
        source = next(
            (
                i["image_source"]
                for i in (row[0].get("items") if row else []) or []
                if i["id"] == item_id
            ),
            None,
        )
        if not source or not _public_host(httpx.URL(source).host):
            return None
        try:
            with httpx.Client(timeout=5.0, follow_redirects=False) as client:
                with client.stream("GET", source, headers={"Accept": "image/*"}) as r:
                    ctype = r.headers.get("content-type", "").split(";")[0].strip().lower()
                    if r.status_code != 200 or ctype not in IMAGE_TYPES:
                        return None
                    body = bytearray()
                    for chunk in r.iter_bytes():
                        body.extend(chunk)
                        if len(body) > MAX_IMAGE_BYTES:
                            return None
        except httpx.HTTPError:
            return None
        self._images[item_id] = (bytes(body), ctype)
        while len(self._images) > MAX_IMAGES:
            self._images.popitem(last=False)
        return self._images[item_id]


# --- factories ----------------------------------------------------------------------

_market: MarketDataProvider | None = None
_news: NewsProvider | None = None


def market_provider() -> MarketDataProvider:
    global _market
    if _market is None:
        s = get_settings()
        _market = (
            AlphaVantageProvider(s.alpha_vantage_api_key, s.market_data_ttl_minutes)
            if s.alpha_vantage_api_key
            else MockMarketDataProvider()
        )
    return _market


def news_provider() -> NewsProvider:
    global _news
    if _news is None:
        s = get_settings()
        _news = (
            MarketauxNewsProvider(s.marketaux_api_token, s.news_ttl_minutes)
            if s.marketaux_api_token
            else MockNewsProvider()
        )
    return _news


def reset_providers() -> None:
    """Forget the chosen providers (tests and settings reloads)."""
    global _market, _news
    _market = None
    _news = None
