# Testing

| Layer | Tool | Location | Command |
|---|---|---|---|
| Engine & learning unit tests | pytest | `backend/tests/test_engine_*.py`, `test_learning.py` | `cd backend && uv run pytest tests/test_engine_*.py tests/test_learning.py` |
| API integration (real PostgreSQL) | pytest + FastAPI TestClient | `backend/tests/test_api_*.py` | `cd backend && uv run pytest` |
| Frontend unit & component | Vitest + React Testing Library | `frontend/src/**/*.test.ts(x)` | `cd frontend && npm test` |
| End-to-end journeys | Playwright (Chromium) | `frontend/e2e/*.spec.ts` | `cd frontend && npm run test:e2e` |
| Accessibility (axe, WCAG A/AA/2.1 AA) | Playwright + @axe-core/playwright | `frontend/e2e/a11y.spec.ts` | `cd frontend && npm run test:e2e -- a11y` |
| Static checks | ruff, oxlint, tsc | – | `uv run ruff check . && uv run ruff format --check .` · `npm run lint && npm run typecheck` |

## Databases used by tests

- API tests use `rupeerise_test` (override with `TEST_DATABASE_URL`). The suite **downgrades and re-applies all Alembic migrations** at start (so migrations are tested too), seeds content, and truncates user data after each test.
- E2E uses `rupeerise_e2e` (override with `E2E_DATABASE_URL`). Playwright starts the API on :8001 and Vite on :5174 itself (set `E2E_WEB_PORT` if 5174 is taken).

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

## Added in v2

- **Stages:** grade-to-stage mapping, server-side scenario eligibility (403), missing grade fails safe.
- **Reward ledger:** append-only, idempotent (duplicate key absorbed), sign/type constraint, balance = SUM, no reward for rapid guessing, borrowing, unsafe choices or concentrated investing.
- **Portfolio Quest:** integer-paise maths, seeded price paths, request idempotency, `confirm` required, transfer cap and one-way rule, locks and unlocks, concurrency on the portfolio row.
- **Learning score and levels:** pure functions, no money input, levels cannot be skipped.
- **Money Lab / Banking Explorer / reflections / tutor guardrails:** engine tests, API tests, and regex guardrail tests (advice, predictions, balance changes, ID numbers).
- **E2E:** learn-to-earn journey, public `/journey-demo`, axe scan of ten key pages.
- Migrations are tested by dropping and recreating the schema, then running every migration.

## Added in the security hardening pass

- `test_security_invites.py`: single-use, expiry, revocation, use limits, identical failures, race for the last use, no organisation chosen by the registrant.
- `test_security_sessions.py`: HttpOnly/Secure/SameSite cookies, no token in bodies, CSRF (missing, foreign session, foreign origin), refresh rotation and replay revocation, logout, password change revoking sessions, re-authentication for deletion, every rate limit.
- `test_cohort_isolation.py`: one organisation per student, cross-organisation join rejected like an unknown code, audited leave, educator isolation.
- `test_content_privacy.py`: no answers in public JSON, no key file tracked, production refuses placeholders.
- `test_quiz_integrity.py`: mission-before-quiz, forged timing, cooldown and resume, shuffled order, variant groups, module completion needs mission and quiz.
- `test_stage_gating.py`: missing grade, every stage against detail, start, catalog, calculators and Portfolio Quest, grade lock.
- `test_tutor_safety.py`: adversarial prompts (personal picks, product recommendations, jailbreaks, OTPs, predictions), obfuscation, bad model answers, data minimisation, budgets.
- `test_portfolio_scale.py`: per-round cap, rate limit, snapshots, backfill, 5,000-row history, pagination, accounting invariants.
- Frontend: cookie client (CSRF header, single refresh-and-retry, no token in storage).
- E2E use the real cookie flow; educator specs create an invitation with `python -m app.admin`. The Banking Explorer wrong-answer test needs the private answer keys and skips without them.
- CI also runs `scripts/check-repo-hygiene.sh`.

Backend tests that assert real answers are marked `requires_private_content` and skip when the bundle is absent. Run the suite both ways: `uv run pytest` and `RUPEERISE_PRIVATE_CONTENT_DIR=none uv run pytest`.

## Latest local results (security pass, 2026-10-11)

- Backend: **417 passed** with the private bundle; **410 passed, 7 skipped** without it; ruff clean; `alembic check` clean
- Frontend unit/component: **31 passed**; `tsc` clean; production build succeeds
- E2E: **22 passed** with the bundle; 21 passed, 1 skipped without it
- nginx / Docker: **not run** (no Docker daemon or nginx available)

## Earlier results (v2, 2026-10-10)

- Backend: **252 passed** (`uv run pytest`); ruff clean; `alembic check` clean
- Frontend unit/component: **29 passed** (`npm test`); `tsc` clean; production build succeeds
- E2E: **22 passed** (`npm run test:e2e`)
- oxlint: 15 warnings, 0 errors (see limitations)

## Not yet covered

Load testing for 1,500 concurrent-ish students · manual screen-reader and keyboard-only testing (axe is automated only) · visual regression · cross-browser (Firefox/WebKit) · Docker image build in CI · live-model tutor path.
