# Market Lab (Portfolio Quest)

Market Lab is the main mode of Portfolio Quest: students practise buying, selling and holding nine
well-known Indian companies with ₹1,00,000 of **fictional** money while scenario news moves a
**simulated** market. The ten-year basket run is still available as the second tab.

Everything is labelled as practice: *Fictional portfolio*, *Practice money only*, *Not financial
advice*, and a data-status badge (Delayed / Demo for prices, Live / Demo for news). Nothing here
places a real order, recommends a stock or predicts a price.

## How a scenario works

1. **Start** a scenario (`POST /api/v1/portfolio/scenario/start`). Prices start from the latest
   reference closes (Alpha Vantage when configured, otherwise demo prices) and then follow a
   seeded simulation (`app/engine/market_lab.py`). The server never sends future prices.
2. **Decide** (`POST /portfolio/scenario/decisions`): buy, sell or hold one company, always with a
   reason chip. Cash, holdings and prices are computed on the server; a request id makes retries
   safe. One company can be at most 25% of the portfolio (40% once the student has shown they
   understand diversification), mirroring the existing single-company rule.
3. **Advance** (`POST /portfolio/scenario/advance`): the next day (or year) is revealed with any
   news event, a recap, and "what happened after your decision" for each journal entry.
4. **Finish** (`POST /portfolio/scenario/finish`): a multiple-choice debrief. A correct answer earns
   15 RR coins (learning-wallet money) **once per scenario**. Profit never earns coins.

Scenarios: results-day surprise, RBI policy day, global selloff, company-specific bad news, good
results at a high price, sector rotation, and ten years of compounding. Every scenario event is
marked "Fictional event".

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/portfolio/market-data` | Reference closes for the watchlist (`status`: `delayed`, `mixed` or `demo`) |
| GET | `/portfolio/news` | Market news (`status`: `live` or `demo`) with category, possible impact, why it matters, affected companies |
| GET | `/portfolio/news/{id}/image` | Same-origin thumbnail proxy for a cached article |
| GET | `/portfolio/scenario` | Scenario cards, the active (or last finished) session, wallet balance |
| POST | `/portfolio/scenario/start` · `decisions` · `advance` · `finish` | Gameplay (see above) |
| GET | `/portfolio/streak` | 12-week activity heatmap, current/longest streak, milestones, today's habits |

All need a signed-in student. Writes share the Portfolio Quest rate limit.

## Data providers

`app/market/providers.py` defines `MarketDataProvider` and `NewsProvider` with real and mock
implementations. A provider is used only when its key is set on the **server**:

| Variable | Provider | Free tier | What we do |
|---|---|---|---|
| `ALPHA_VANTAGE_API_KEY` | `AlphaVantageProvider` (`TIME_SERIES_DAILY`, `RELIANCE.BSE` …) | ~25 calls/day | 9 calls per refresh, refreshed in the background at most every `RUPEERISE_MARKET_DATA_TTL_MINUTES` (720); a rate-limit reply stops the batch and backs off 1 h; last good closes are kept |
| `MARKETAUX_API_TOKEN` | `MarketauxNewsProvider` (`/v1/news/all`) | ~100 calls/day, 3 articles per call | 2 calls per refresh every `RUPEERISE_NEWS_TTL_MINUTES` (45); results are merged so the feed grows |

Requests never wait on a provider: they get the cached value (or demo data) and a single thread
refreshes it. Any missing key, error or quota reply falls back **per item** to
`MockMarketDataProvider` / `MockNewsProvider`, whose output is always labelled demo. Demo news is
educational explainers, not invented headlines. Nothing is scraped.

Thumbnails: the browser never loads third-party images (the CSP allows `img-src 'self'`, and it
keeps students' IP addresses away from unknown hosts). The API fetches only image URLs that the
cached Marketaux feed returned, only from public hosts, never following redirects, JPEG/PNG/WebP/
GIF/AVIF only (no SVG), at most 1.5 MB each, and keeps the last 48 in memory.

## Limitations

* Alpha Vantage BSE coverage and symbols change (for example after corporate actions); a symbol
  that fails simply shows demo data. Closes are end of day, never live.
* Caches are per API process; several workers each refresh on their own.
* Marketaux sentiment is coarse, so "possible impact" is a prompt to think, not a forecast.
* Streak days use India time and count missions, checks, reflections, Portfolio Quest actions and
  Market Lab decisions. Streak milestones are badges only.
