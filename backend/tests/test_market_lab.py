"""Market Lab: engine, gating, server-side accounting, idempotency, rewards, providers, streaks."""

import statistics
import time
import uuid
from datetime import UTC, datetime, timedelta

import httpx
import pytest
from sqlalchemy import select, update

from app.core.db import SessionLocal
from app.engine import market_lab as lab
from app.market import providers
from app.models import MarketCache, MarketLabSession, RewardLedgerEntry, SimulationSession
from tests.conftest import register_onboarded
from tests.test_api_portfolio import complete_investing

P = "/api/v1/portfolio"


def rid():
    return uuid.uuid4().hex


def unlocked(client):
    h, _ = register_onboarded(client)
    complete_investing(client, h)
    return h


def start(client, h, key="earnings_surprise", request_id=None):
    r = client.post(
        f"{P}/scenario/start",
        headers=h,
        json={"request_id": request_id or rid(), "scenario_key": key},
    )
    assert r.status_code == 200, r.text
    return r.json()["session"]


def decide(client, h, action, key, qty=0, reason="long_term", request_id=None, confirm=True):
    return client.post(
        f"{P}/scenario/decisions",
        headers=h,
        json={
            "request_id": request_id or rid(),
            "action": action,
            "company_key": key,
            "quantity": qty,
            "reason": reason,
            "confirm": confirm,
        },
    )


def advance(client, h):
    r = client.post(f"{P}/scenario/advance", headers=h, json={"request_id": rid()})
    assert r.status_code == 200, r.text
    return r.json()


# --- engine --------------------------------------------------------------------------


def test_paths_are_deterministic_positive_and_sized():
    for sc in lab.SCENARIOS.values():
        a = lab.price_paths(sc, 42, lab.default_anchors())
        assert a == lab.price_paths(sc, 42, lab.default_anchors())
        assert set(a) == set(lab.COMPANIES)
        for series in a.values():
            assert len(series) == sc.steps
            assert all(isinstance(p, int) and p >= lab.MIN_PRICE_PAISE for p in series)


def test_paths_start_at_the_reference_anchor():
    anchors = {**lab.default_anchors(), "tcs": 312_345}
    assert lab.price_paths(lab.SCENARIOS["rbi_policy"], 7, anchors)["tcs"][0] == 312_345


@pytest.mark.parametrize(
    "key,company,sign",
    [
        ("earnings_surprise", "infosys", 1),
        ("company_bad_news", "tatamotors", -1),
        ("long_term_compounding", "lt", 1),
    ],
)
def test_each_lesson_shows_up_reliably(key, company, sign):
    sc = lab.SCENARIOS[key]
    moves = []
    for seed in range(120):
        p = lab.price_paths(sc, seed, lab.default_anchors())[company]
        moves.append(p[-1] / p[0] - 1)
    assert sign * statistics.mean(moves) > 0.04


def test_sector_rotation_moves_it_and_banks_apart():
    sc = lab.SCENARIOS["sector_rotation"]
    gaps = []
    for seed in range(120):
        p = lab.price_paths(sc, seed, lab.default_anchors())
        gaps.append(p["hdfcbank"][-1] / p["hdfcbank"][0] - p["infosys"][-1] / p["infosys"][0])
    assert statistics.mean(gaps) > 0.05


# --- gating and reads ------------------------------------------------------------------


def test_locked_until_an_investing_mission_is_done(client):
    h, _ = register_onboarded(client)
    body = client.get(f"{P}/scenario", headers=h).json()
    assert body["access"]["open"] is False
    assert body["session"] is None
    assert len(body["scenarios"]) == 7
    r = client.post(
        f"{P}/scenario/start", headers=h, json={"request_id": rid(), "scenario_key": "rbi_policy"}
    )
    assert r.status_code == 403


def test_reference_data_and_news_need_a_login_and_fall_back_to_demo(client):
    assert client.get(f"{P}/market-data").status_code == 401
    h, _ = register_onboarded(client)
    data = client.get(f"{P}/market-data", headers=h).json()
    assert data["status"] == "demo"
    assert {q["key"] for q in data["quotes"]} == set(lab.COMPANIES)
    assert all(q["source"] == "demo" and len(q["history"]) == 30 for q in data["quotes"])
    news = client.get(f"{P}/news", headers=h).json()
    assert news["status"] == "demo"
    assert news["items"] and all(i["is_demo"] for i in news["items"])
    assert all(i["category"] in providers.WHY for i in news["items"])


# --- gameplay --------------------------------------------------------------------------


def test_trade_hold_advance_and_the_future_is_never_sent(client):
    h = unlocked(client)
    s = start(client, h)
    assert s["step"] == 0
    assert s["cash_paise"] == lab.STARTING_CASH_PAISE
    assert all(len(c["history_paise"]) == 1 for c in s["companies"])
    price = next(c["price_paise"] for c in s["companies"] if c["key"] == "infosys")

    r = decide(client, h, "buy", "infosys", 5, reason="news")
    assert r.status_code == 200, r.text
    s = r.json()
    assert s["cash_paise"] == lab.STARTING_CASH_PAISE - 5 * price
    assert s["holdings"][0]["quantity"] == 5
    assert s["total_paise"] == lab.STARTING_CASH_PAISE
    assert s["journal"][0]["reason_label"] == lab.REASONS["news"]

    assert decide(client, h, "hold", "tcs").status_code == 200

    s = advance(client, h)
    assert s["step"] == 1 and s["step_label"] == "Day 2"
    assert all(len(c["history_paise"]) == 2 for c in s["companies"])
    assert [e["step"] for e in s["events"]] == [1]  # results day (step 2) not revealed yet
    buy = next(j for j in s["journal"] if j["action"] == "buy")
    assert buy["outcome"] and buy["outcome"]["text"].startswith("Since you bought")
    assert s["recap"]["label"] == "Day 2"
    assert len(s["series"]) == 2


def test_server_rejects_bad_orders(client):
    h = unlocked(client)
    start(client, h)
    r = decide(client, h, "buy", "lt", 10_000)
    assert r.status_code == 409 and r.json()["error"]["code"] == "insufficient_cash"
    r = decide(client, h, "buy", "tcs", 20)  # 20 x ~₹3,050 is well over 25% of ₹1,00,000
    assert r.status_code == 409 and r.json()["error"]["code"] == "concentration_limit"
    r = decide(client, h, "sell", "tcs", 1)
    assert r.status_code == 409 and r.json()["error"]["code"] == "insufficient_shares"
    assert decide(client, h, "buy", "tcs", 1, reason="vibes").status_code == 422
    assert decide(client, h, "buy", "tcs", 0).status_code == 422
    assert decide(client, h, "buy", "nifty", 1).status_code == 422
    assert decide(client, h, "buy", "tcs", 1, confirm=False).status_code == 400


def test_a_repeated_request_is_applied_once(client):
    h = unlocked(client)
    start(client, h)
    request_id = rid()
    a = decide(client, h, "buy", "sbi", 3, request_id=request_id).json()
    b = decide(client, h, "buy", "sbi", 3, request_id=request_id).json()
    assert a["cash_paise"] == b["cash_paise"]
    assert b["holdings"][0]["quantity"] == 3
    assert len(b["journal"]) == 1


def test_selling_returns_cash_and_keeps_average_cost(client):
    h = unlocked(client)
    start(client, h, "rbi_policy")
    decide(client, h, "buy", "hdfcbank", 10)
    advance(client, h)
    s = decide(client, h, "sell", "hdfcbank", 4, reason="lock_profit").json()
    row = s["holdings"][0]
    assert row["quantity"] == 6
    assert s["total_paise"] == s["cash_paise"] + s["invested_paise"]


def test_finish_awards_once_per_scenario_for_understanding(client):
    h = unlocked(client)
    s = start(client, h, "company_bad_news")
    r = client.post(f"{P}/scenario/finish", headers=h, json={"request_id": rid(), "answer": "a"})
    assert r.status_code == 409  # not at the last day yet
    for _ in range(s["scenario"]["steps"] - 1):
        s = advance(client, h)
    assert s["is_last_step"] and s["debrief"]["correct_key"] is None
    r = client.post(f"{P}/scenario/advance", headers=h, json={"request_id": rid()})
    assert r.status_code == 409
    done = client.post(
        f"{P}/scenario/finish", headers=h, json={"request_id": rid(), "answer": "a"}
    ).json()
    assert done["status"] == "completed"
    assert done["debrief"]["correct"] is True and done["debrief"]["reward"] == 15
    assert done["scenario"]["lesson"]

    # Replaying the scenario and answering again earns nothing more.
    s = start(client, h, "company_bad_news")
    for _ in range(s["scenario"]["steps"] - 1):
        advance(client, h)
    again = client.post(
        f"{P}/scenario/finish", headers=h, json={"request_id": rid(), "answer": "a"}
    ).json()
    assert again["debrief"]["reward"] == 0
    with SessionLocal() as db:
        rows = db.scalars(
            select(RewardLedgerEntry).where(RewardLedgerEntry.rule_key == "market_debrief")
        ).all()
        assert len(rows) == 1 and rows[0].amount == 15

    overview = client.get(f"{P}/scenario", headers=h).json()
    card = next(c for c in overview["scenarios"] if c["key"] == "company_bad_news")
    assert card["completed"] == 2 and card["understood"] is True


def test_starting_another_scenario_abandons_the_active_one(client):
    h = unlocked(client)
    start(client, h, "rbi_policy")
    start(client, h, "global_selloff")
    with SessionLocal() as db:
        statuses = sorted(s.status for s in db.scalars(select(MarketLabSession)))
    assert statuses == ["abandoned", "active"]


def test_students_never_see_each_others_sessions(client):
    a = unlocked(client)
    start(client, a)
    decide(client, a, "buy", "infosys", 2)
    b = unlocked(client)
    assert client.get(f"{P}/scenario", headers=b).json()["session"] is None
    r = client.post(f"{P}/scenario/advance", headers=b, json={"request_id": rid()})
    assert r.status_code == 409


# --- streaks -----------------------------------------------------------------------------


def test_streak_counts_consecutive_learning_days(client):
    h = unlocked(client)
    start(client, h)
    decide(client, h, "buy", "airtel", 1, reason="news")
    decide(client, h, "hold", "airtel", reason="long_term")
    with SessionLocal() as db:
        sim = db.scalars(select(SimulationSession)).first()
        db.execute(
            update(SimulationSession)
            .where(SimulationSession.id == sim.id)
            .values(started_at=datetime.now(UTC) - timedelta(days=1))
        )
        db.commit()
    body = client.get(f"{P}/streak", headers=h).json()
    assert len(body["days"]) >= 78 and body["weeks"] == 12
    assert body["current"] >= 2 and body["today_done"] is True
    habits = {x["key"]: x["done"] for x in body["habits"]}
    assert habits["decide"] is True and habits["reasons"] is True
    assert [m["days"] for m in body["milestones"]] == [7, 14, 30, 47, 84]


# --- providers (no network: httpx mock transport) ------------------------------------------


def _av_body(closes):
    """Daily closes ending yesterday, so they always look recent."""
    end = datetime.now(UTC).date() - timedelta(days=1)
    days = [(end - timedelta(days=len(closes) - 1 - i)).isoformat() for i in range(len(closes))]
    return {
        "Time Series (Daily)": {d: {"4. close": str(c)} for d, c in zip(days, closes, strict=True)}
    }


def _mock_http(monkeypatch, handler):
    real_client = httpx.Client
    monkeypatch.setattr(
        providers.httpx, "Client", lambda **kw: real_client(transport=httpx.MockTransport(handler))
    )


def _snapshot(provider):
    """One request: read the cache, maybe refresh, commit (as the endpoint does)."""
    with SessionLocal() as db:
        out = provider.snapshot(db)
        db.commit()
    return out


def test_alpha_vantage_refreshes_a_few_companies_per_request_and_keeps_them(monkeypatch):
    calls = []

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.params["apikey"] == "k"
        calls.append(request.url.params["symbol"])
        return httpx.Response(200, json=_av_body([3000.5, 3010.25, 2990.0]))

    _mock_http(monkeypatch, handler)
    p = providers.AlphaVantageProvider("k", 720, pause_seconds=0)
    first = _snapshot(p)
    assert len(calls) == p.BATCH  # bounded work per request
    assert first["status"] == "mixed"
    assert sum(q["source"] == "alpha_vantage" for q in first["quotes"]) == p.BATCH
    real = next(q for q in first["quotes"] if q["source"] == "alpha_vantage")
    assert real["price_paise"] == 299_000 and real["prev_close_paise"] == 301_025

    # The next requests finish the watchlist, then nothing more is fetched while fresh.
    _snapshot(p)
    last = _snapshot(p)
    assert last["status"] == "delayed" and len(calls) == len(lab.COMPANIES)
    _snapshot(p)
    assert len(calls) == len(lab.COMPANIES)


def test_cached_closes_survive_a_cold_start(monkeypatch):
    _mock_http(monkeypatch, lambda r: httpx.Response(200, json=_av_body([100.0, 101.0])))
    for _ in range(3):
        _snapshot(providers.AlphaVantageProvider("k", 720, pause_seconds=0))

    def boom(request: httpx.Request) -> httpx.Response:
        raise AssertionError("a fresh instance must not call the provider again")

    _mock_http(monkeypatch, boom)
    fresh_instance = providers.AlphaVantageProvider("k", 720, pause_seconds=0)
    out = _snapshot(fresh_instance)
    assert out["status"] == "delayed"


def test_alpha_vantage_rate_limit_pauses_all_refreshing(monkeypatch):
    calls = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request.url.params["symbol"])
        return httpx.Response(200, json={"Note": "Thank you for using Alpha Vantage! limit"})

    _mock_http(monkeypatch, handler)
    p = providers.AlphaVantageProvider("k", 720, pause_seconds=0)
    assert _snapshot(p)["status"] == "demo"
    assert len(calls) == 1  # the first limit reply stops the batch
    _snapshot(providers.AlphaVantageProvider("k", 720, pause_seconds=0))  # even a new instance
    assert len(calls) == 1


@pytest.mark.parametrize(
    "message,min_seconds,max_seconds",
    [
        ("Burst pattern detected. Please spread requests more evenly.", 1, 120),
        ("Our standard API rate limit is 25 requests per day.", 3600, 24 * 3600),
    ],
)
def test_alpha_vantage_pauses_briefly_for_bursts_and_long_for_the_daily_quota(
    monkeypatch, message, min_seconds, max_seconds
):
    _mock_http(monkeypatch, lambda r: httpx.Response(200, json={"Information": message}))
    _snapshot(providers.AlphaVantageProvider("k", 720, pause_seconds=0))
    with SessionLocal() as db:
        row = db.get(MarketCache, "alpha:_backoff")
        wait = float(row.payload["until"]) - time.time()
    assert min_seconds <= wait <= max_seconds


def test_a_renamed_company_falls_through_to_its_current_symbol(monkeypatch):
    tried = []

    def handler(request: httpx.Request) -> httpx.Response:
        sym = request.url.params["symbol"]
        tried.append(sym)
        if sym == "TMPV.BSE":
            return httpx.Response(200, json=_av_body([411.0, 405.5]))
        return httpx.Response(200, json={"Error Message": "Invalid API call"})

    _mock_http(monkeypatch, handler)
    assert lab.COMPANIES["tatamotors"].bse_symbols[0] == "TMPV.BSE"
    q = providers.AlphaVantageProvider("k", 720, pause_seconds=0)
    got = q.fetch_company(httpx.Client(), lab.COMPANIES["tatamotors"])
    assert got and got["symbol"] == "TMPV.BSE" and got["price_paise"] == 40_550
    assert tried[0] == "TMPV.BSE"


def test_stale_history_from_a_delisted_symbol_is_not_shown_as_live(monkeypatch):
    old = {
        "Time Series (Daily)": {
            "2025-10-01": {"4. close": "680.0"},
            "2025-10-02": {"4. close": "690.0"},
        }
    }
    _mock_http(monkeypatch, lambda r: httpx.Response(200, json=old))
    q = providers.AlphaVantageProvider("k", 720, pause_seconds=0)
    assert q.fetch_company(httpx.Client(), lab.COMPANIES["reliance"]) is None


def test_alpha_vantage_unknown_symbol_is_remembered_not_retried(monkeypatch):
    calls = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(1)
        return httpx.Response(200, json={"Error Message": "Invalid API call"})

    _mock_http(monkeypatch, handler)
    p = providers.AlphaVantageProvider("k", 720, pause_seconds=0)
    for _ in range(4):
        out = _snapshot(p)
    assert out["status"] == "demo"
    # Each company is tried once under every symbol it has used, then remembered as missing.
    assert len(calls) == sum(len(c.bse_symbols) for c in lab.COMPANIES.values())


def test_marketaux_items_are_mapped_and_sanitised():
    item = providers.MarketauxNewsProvider.item(
        {
            "uuid": "abc",
            "title": "HDFC Bank quarterly profit rises 12%",
            "snippet": "Net income beat estimates.",
            "source": "example.com",
            "url": "javascript:alert(1)",
            "image_url": "https://img.example.com/a.jpg",
            "published_at": "2026-10-10T10:00:00.000000Z",
            "entities": [{"symbol": "HDFCBANK.NS", "sentiment_score": 0.6}],
        }
    )
    assert item["category"] == "Earnings"
    assert item["impact"] == "Up"
    assert item["affected"] == ["hdfcbank"]
    assert item["url"] is None and item["image_source"].startswith("https://")
    assert item["is_demo"] is False


def _feed(provider):
    with SessionLocal() as db:
        out = provider.feed(db)
        db.commit()
    return out


def test_marketaux_failure_falls_back_to_labelled_demo(monkeypatch):
    _mock_http(monkeypatch, lambda r: httpx.Response(429))
    feed = _feed(providers.MarketauxNewsProvider("t", 45))
    assert feed["status"] == "demo" and all(i["is_demo"] for i in feed["items"])


def test_marketaux_feed_only_exposes_same_origin_image_paths_and_is_cached(monkeypatch):
    article = {
        "uuid": "a1b2-c3",
        "title": "Infosys shares rise after results",
        "image_url": "https://img.example.com/x.jpg",
        "published_at": "2026-10-10T10:00:00Z",
        "entities": [],
    }
    calls = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(1)
        return httpx.Response(200, json={"data": [article]})

    _mock_http(monkeypatch, handler)
    feed = _feed(providers.MarketauxNewsProvider("t", 45))
    assert feed["status"] == "live"
    item = feed["items"][0]
    assert item["image_url"] == "/api/v1/portfolio/news/a1b2-c3/image"
    assert "image_source" not in item and "img.example.com" not in str(feed)
    spent = len(calls)
    # A fresh instance (a serverless cold start) serves the stored headlines, no new calls.
    again = _feed(providers.MarketauxNewsProvider("t", 45))
    assert again["status"] == "live" and len(calls) == spent


@pytest.mark.parametrize("host", ["localhost", "127.0.0.1", "10.0.0.8", "metadata.internal", ""])
def test_image_proxy_refuses_private_hosts(host):
    assert providers._public_host(host) is False


def test_image_endpoint_is_404_for_demo_items(client):
    h, _ = register_onboarded(client)
    assert client.get(f"{P}/news/demo-0/image", headers=h).status_code == 404
    assert client.get(f"{P}/news/..%2Fetc/image", headers=h).status_code in (404, 422)
