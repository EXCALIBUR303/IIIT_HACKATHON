# Deployment

## Recommended hosting

| Part | Suggested host | Notes |
|---|---|---|
| Frontend (static `dist/`) | Vercel or Netlify | Build `npm run build` in `frontend/`; set `VITE_API_BASE_URL=https://<api-host>`; add SPA fallback to `index.html` |
| API | Render, Railway or Fly.io (Docker) | `backend/Dockerfile` runs migrations + idempotent content seed, then uvicorn on `$PORT` |
| Database | Managed PostgreSQL (Render, Railway, Neon, Supabase) | Use the provider's `postgresql://` URL with the `postgresql+psycopg://` scheme |

## Required production environment

| Variable | Notes |
|---|---|
| `RUPEERISE_ENV=production` | Enables safety checks; refuses sample data |
| `RUPEERISE_DATABASE_URL` | `postgresql+psycopg://user:pass@host:5432/db` |
| `RUPEERISE_SECRET_KEY` | ≥ 48 random chars; app refuses to start with the dev default |
| `RUPEERISE_EDUCATOR_INVITE_CODE` | Shared privately with NGO coordinators; app refuses the dev default |
| `RUPEERISE_CORS_ORIGINS` | JSON list, e.g. `["https://rupeerise.example.org"]` |
| `RUPEERISE_ANTHROPIC_API_KEY` | Optional; leave empty for deterministic tutor |

## Local full stack with Docker

```bash
cp .env.example .env   # set POSTGRES_PASSWORD, RUPEERISE_SECRET_KEY, RUPEERISE_EDUCATOR_INVITE_CODE
docker compose up --build
# web: http://localhost:8080   api docs: http://localhost:8000/api/docs
```

> Status: the Dockerfiles and compose file are written but **have not yet been built in this environment** (Docker daemon was not running). Verifying them is on Member 5's checklist.

## Release checklist

1. CI green on `main` (backend, frontend, e2e).
2. `alembic upgrade head` applied (automatic in the container start command).
3. Smoke test: `/api/health` → `{"status": "ok"}`; register a student; complete one simulation; educator sees the cohort.
4. Confirm no `.env` or secrets in the image or repository.
