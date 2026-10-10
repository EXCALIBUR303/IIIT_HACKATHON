# Team Handoff

| Brief | Member | Branch |
|---|---|---|
| [member-1-core-engine.md](member-1-core-engine.md) | 1 · Tech lead: engine, adaptive learning, AI, architecture | `feature/core-engine` |
| [member-2-frontend-functionality.md](member-2-frontend-functionality.md) | 2 · Functional frontend | `feature/frontend-functionality` |
| [member-3-ui-ux.md](member-3-ui-ux.md) | 3 · UI/UX design system | `feature/ui-ux` |
| [member-4-backend.md](member-4-backend.md) | 4 · Backend & database | `feature/backend` |
| [member-5-qa-deployment.md](member-5-qa-deployment.md) | 5 · QA, CI/CD, deployment, docs | `feature/qa-deployment` |

## Everyone, first hour

```bash
git clone https://github.com/EXCALIBUR303/IIIT_HACKATHON.git && cd IIIT_HACKATHON
git checkout -b feature/<your-branch>
# backend
cd backend && cp .env.example .env && uv sync && createdb rupeerise && createdb rupeerise_test
uv run alembic upgrade head && uv run python -m app.seed --demo
uv run uvicorn app.main:app --reload --port 8000      # API docs: http://localhost:8000/api/docs
# frontend (new terminal)
cd frontend && npm install && npm run dev               # http://localhost:5173
```

Sample logins (local only, created by `--demo`): `demo.student` / `demo.educator`, password `rupeerise-demo`.

Workflow: small commits → push your branch → PR into `main` using the template → CI green → review → squash-merge by Member 1. Read [team-ownership.md](../team-ownership.md) before editing anything outside your paths.
