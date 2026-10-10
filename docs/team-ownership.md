# Team Ownership

GitHub is the source of truth. Work on your branch, keep to your owned paths, and open a PR into `main`. Changes to **shared** paths need a review from the listed owner.

| Member | Role | Branch | Owns | Reviews |
|---|---|---|---|---|
| 1 (tech lead) | Core engine, adaptive learning, AI, architecture, integration | `feature/core-engine` | `backend/app/engine/`, `backend/app/learning/`, `backend/app/tutor/`, `backend/app/content/scenarios.json`, `docs/architecture.md` | All PRs touching shared contracts; final merges |
| 2 | Functional frontend | `feature/frontend-functionality` | `frontend/src/features/**` (logic, routing, state, API wiring), `frontend/src/App.tsx`, `frontend/src/lib/useAsync.ts`, `frontend/src/lib/auth.tsx` | Member 3 for any visual change |
| 3 | UI/UX & design system | `feature/ui-ux` | `frontend/src/components/ui/**`, `frontend/src/components/brand/**`, `frontend/src/components/common/**`, `frontend/src/components/layout/**`, `frontend/src/index.css`, `frontend/public/**`, `frontend/src/lib/i18n/**` (copy) | Member 2 for behavioural change |
| 4 | Backend & database | `feature/backend` | `backend/app/api/**`, `backend/app/services/**`, `backend/app/models/**`, `backend/app/core/**`, `backend/alembic/**`, `backend/app/seed.py` | Member 1 for engine/learning calls |
| 5 | QA, CI/CD, deployment, docs | `feature/qa-deployment` | `backend/tests/**`, `frontend/e2e/**`, `frontend/src/**/*.test.*`, `.github/**`, `Dockerfile`s, `docker-compose.yml`, `docs/testing.md`, `docs/deployment.md`, `README.md` | Everyone's PRs for test coverage |

## Shared contracts (coordinate before changing)

| Contract | Files | Process |
|---|---|---|
| REST API | `backend/app/schemas/__init__.py`, `frontend/src/lib/api/types.ts`, `frontend/src/lib/api/endpoints.ts`, `docs/api-contracts.md` | One PR updating all four; Members 1 + 2 + 4 review |
| Database schema | `backend/app/models/__init__.py` + new Alembic migration | Member 4 authors; Member 1 reviews |
| Learning content | `backend/app/content/*.json` | Content edits welcome from anyone; Member 1 reviews scoring-relevant fields |
| Design tokens | `frontend/src/index.css` `@theme` | Member 3 owns; others request via PR comment |

## Ground rules

1. Never force-push shared branches or `main`. Rebase/merge your own branch only.
2. Never commit secrets, `.env` files, personal data, or the sponsor PDF.
3. Keep the app runnable: `pytest`, `npm test`, `npm run build` must pass before requesting review.
4. Don't edit another member's files to "fix" something. Open an issue or a small PR tagging them.
