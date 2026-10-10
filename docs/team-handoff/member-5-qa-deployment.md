# Member 5 · QA, CI/CD, Deployment & Documentation

**Branch:** `feature/qa-deployment`

## Responsibilities
Unit, integration and end-to-end tests; CI/CD; deployment; documentation; submission validation.

## Owned files
`backend/tests/**` · `frontend/e2e/**` · `frontend/src/**/*.test.*` · `frontend/src/test/**` · `frontend/playwright.config.ts` · `.github/**` · `backend/Dockerfile`, `frontend/Dockerfile`, `frontend/nginx.conf`, `docker-compose.yml` · `README.md`, `docs/testing.md`, `docs/deployment.md`, `docs/limitations.md`

## Current state
123 backend tests (engine, learning, API, real PostgreSQL), 21 frontend unit/component tests, 8 Playwright journeys, GitHub Actions workflow (backend, frontend, e2e). Dockerfiles and compose written but **not yet built**.

## Tasks (priority order)
1. **Verify Docker:** `docker compose up --build`, fix any issues, add an image-build job to CI.
2. **Staging deploy:** API on Render/Railway + managed Postgres; frontend on Vercel/Netlify; document URLs and env in `docs/deployment.md`.
3. **Load test:** seed 1,500 students (script), run k6 or Locust against session start/decide and cohort overview; record p95 latencies in `docs/testing.md`.
4. **Accessibility:** add `@axe-core/playwright` checks to E2E for landing, dashboard, a simulator and educator dashboard.
5. **Coverage:** `pytest --cov` and `vitest --coverage` reports in CI artifacts.
6. **Submission:** demo script, final requirement compliance report, `RupeeRise-Final.zip` from the approved `main`.

## Dependencies
Everyone (tests follow features). Coordinate env var names with Member 4.

## Acceptance criteria
- CI required for merging to `main`; flaky tests fixed, not retried away.
- Docs reflect reality: every claim in README/testing/deployment is verified or labelled as unverified.
