# Testing

| Layer | Tool | Location | Command |
|---|---|---|---|
| Engine & learning unit tests | pytest | `backend/tests/test_engine_*.py`, `test_learning.py` | `cd backend && uv run pytest tests/test_engine_*.py tests/test_learning.py` |
| API integration (real PostgreSQL) | pytest + FastAPI TestClient | `backend/tests/test_api_*.py` | `cd backend && uv run pytest` |
| Frontend unit & component | Vitest + React Testing Library | `frontend/src/**/*.test.ts(x)` | `cd frontend && npm test` |
| End-to-end journeys | Playwright (Chromium) | `frontend/e2e/*.spec.ts` | `cd frontend && npm run test:e2e` |
| Static checks | ruff, oxlint, tsc | – | `uv run ruff check . && uv run ruff format --check .` · `npm run lint && npm run typecheck` |

## Databases used by tests

- API tests use `rupeerise_test` (override with `TEST_DATABASE_URL`). The suite **downgrades and re-applies all Alembic migrations** at start (so migrations are tested too), seeds content, and truncates user data after each test.
- E2E uses `rupeerise_e2e` (override with `E2E_DATABASE_URL`). Playwright starts the API on :8001 and Vite on :5174 itself.

```bash
createdb rupeerise_test
createdb rupeerise_e2e
cd frontend && npx playwright install chromium
```

## What is covered

- **Financial correctness:** Decimal rounding, Indian rupee formatting, simple vs compound interest against hand-calculated values, withdrawals, borrowing repayment schedules, allocation validation (negative, zero, unknown, over-budget), event feasibility, deterministic event selection, reproducible Monte Carlo, loss probability falling with horizon, scores independent of market luck.
- **State machines:** invalid transitions (409), closed sessions, duplicate answers, abandoned attempts, retries and "comeback" achievements, concurrent session/attempt creation (regression test for a race found by E2E).
- **Assessment & adaptation:** misconception tagging, confident errors, rapid-guess flagging and down-weighting, 1/n retake weighting, one-shot initial/final checks, post-check lock, recommendation progression.
- **Auth & authorisation:** registration validation, duplicate usernames, invalid tokens, invite codes, role separation, organisation isolation for cohorts, private sessions, account deletion cascade.
- **Frontend:** routing guards, login error and success, registration validation, educator fields, budget simulator live summary and over-budget lock, i18n fallback, accessible progress bars and error states.
- **E2E:** sign-up → onboarding → dashboard; budgeting (incl. over-budget + retry); savings; investing; safety; module quiz → progress; educator cohort creation → student join → overview; student blocked from educator area.

## Latest local results (this foundation commit)

- Backend: **123 passed** (`uv run pytest`)
- Frontend unit/component: **21 passed** (`npm test`)
- E2E: **8 passed** (`npm run test:e2e`)
- `npm run build` succeeds; ruff and tsc clean; oxlint reports warnings only (see limitations)

## Not yet covered (Member 5 backlog)

Load testing for 1,500 concurrent-ish students · automated accessibility scan (axe) · visual regression · cross-browser (Firefox/WebKit) · Docker image build in CI.
