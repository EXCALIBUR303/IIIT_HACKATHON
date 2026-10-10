# Member 4 · Backend & Database

**Branch:** `feature/backend`

## Responsibilities
Database improvements, API development, authentication, progress persistence, backend reliability and integration support.

## Owned files
`backend/app/api/**` · `backend/app/services/**` · `backend/app/models/**` · `backend/app/core/**` · `backend/app/schemas/**` (with Member 1 review) · `backend/alembic/**` · `backend/app/seed.py`

## Current state
FastAPI v1 routers (auth, students, content, simulations, calculators, assessments, progress, achievements, educator, tutor), SQLAlchemy 2 models with check/unique constraints and cascades, Alembic migration `0001`, bcrypt + JWT auth, role checks, org-scoped educator analytics, consistent error envelope, concurrency-safe attempt creation.

## Tasks (priority order)
1. **Rate limiting** on `/auth/login` and registration (e.g. per-IP sliding window; keep dependency-free or justify one).
2. **Auth hardening:** httpOnly cookie session or refresh tokens + CSRF strategy (coordinate with Member 2); password change endpoint.
3. **Educator features:** cohort CSV export (nicknames + aggregates only), remove student from cohort, multiple educators per org.
4. **Admin endpoints:** create organisations / rotate invite codes (role `admin`).
5. **Performance:** add indexes as queries grow (`simulation_sessions(student_id, scenario_id)`, `assessment_attempts(student_id, assessment_id)`); EXPLAIN the cohort overview with 1,500 seeded students.
6. **Observability:** structured request logging with request ids (no PII), `/api/health` DB latency.

## Dependencies
Member 1 for anything touching engine/learning; Member 2 for contract changes; Member 5 for CI/deploy env vars.

## Acceptance criteria
- Every schema change ships with a new Alembic migration (never edit `0001`).
- New endpoints documented in `docs/api-contracts.md`, typed in schemas, covered by API tests in `backend/tests/`.
- No personal data beyond what is listed in `docs/database-design.md` without a team decision.
