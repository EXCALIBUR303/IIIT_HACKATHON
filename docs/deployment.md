# Deployment

> `docker-compose.yml` is a **local demo stack** (plain HTTP on localhost). It is not a production deployment. Use it to try the app, and follow the steps below for anything real.

## Recommended hosting

| Part | Suggested host | Notes |
|---|---|---|
| Web (static `dist/` + proxy) | The `frontend/Dockerfile` image (nginx) behind a TLS-terminating proxy or load balancer | Carries the security headers, request throttles and SPA fallback. Hosting `dist/` on a static host works only if you add the same headers there and proxy `/api` from the **same origin** (cookies are same-site) |
| API | Any container host (Render, Railway, Fly.io, ECS, Cloud Run) | `backend/Dockerfile` runs migrations and the idempotent content seed, then uvicorn |
| Database | Managed PostgreSQL with backups | Use the provider URL with the `postgresql+psycopg://` scheme |

## TLS is required

Cookies are `Secure` in production, so sign-in **does not work over plain HTTP**, and the API refuses to start in production otherwise. Terminate TLS in front of the web container (cloud load balancer, Caddy, Traefik, or nginx with certificates) and forward `X-Forwarded-Proto: https`. The bundled nginx then sends HSTS. Do not publish the API container's port: browsers must reach it only through the web proxy.

If another proxy sits in front of the bundled nginx, make nginx use the real client address (`set_real_ip_from <proxy>; real_ip_header X-Forwarded-For;`) so `$remote_addr`, and therefore the rate limits, are per user and not per load balancer.

## Required production environment

| Variable | Notes |
|---|---|
| `RUPEERISE_ENV=production` | Enables safety checks; refuses sample data, placeholder answer keys, insecure cookies and the default secret |
| `RUPEERISE_DATABASE_URL` | `postgresql+psycopg://user:pass@host:5432/db` |
| `RUPEERISE_SECRET_KEY` | ≥ 48 random chars; signs access tokens and CSRF tokens. Rotating it signs everyone out |
| `RUPEERISE_CORS_ORIGINS` | JSON list of the exact public origin(s), e.g. `["https://rupeerise.example.org"]`. Also the CSRF `Origin` allow-list |
| `RUPEERISE_PRIVATE_CONTENT_DIR` | Folder containing `answer_keys.json` (see [content-privacy.md](content-privacy.md)). Required |
| `FORWARDED_ALLOW_IPS` | The proxy addresses uvicorn may trust for `X-Forwarded-For` (compose uses `*` only because the API has no published port) |
| `RUPEERISE_ANTHROPIC_API_KEY` | Optional; empty = deterministic tutor |
| `ALPHA_VANTAGE_API_KEY` | Optional. Delayed end-of-day BSE closes for the Market Lab watchlist. Free tier ≈ 25 calls/day: one refresh is 9 calls, cached for `RUPEERISE_MARKET_DATA_TTL_MINUTES` (default 720). Empty or failing = labelled demo prices |
| `MARKETAUX_API_TOKEN` | Optional. India market headlines with thumbnails. Free tier ≈ 100 calls/day: one refresh is 2 calls, cached for `RUPEERISE_NEWS_TTL_MINUTES` (default 45). Empty or failing = labelled demo explainers |

Optional: `RUPEERISE_ENABLE_API_DOCS` (ignored in production), `RUPEERISE_RL_*` limits, `RUPEERISE_REFRESH_DAYS`, `RUPEERISE_QUIZ_COOLDOWN_SECONDS`, `RUPEERISE_PORTFOLIO_MAX_ACTIONS_PER_ROUND`. `RUPEERISE_COOKIE_SECURE=false` exists only for localhost HTTP and is rejected in production.

## First deployment (or upgrading from v2)

1. Back up the database.
2. Deploy the new images. The container start command applies migrations `0007` (security core), `0008` (learning integrity) and `0009` (portfolio snapshots/indexes) `0010` (Market Lab sessions) and `0011` (provider cache), all additive.
3. **Everyone must sign in again** once: old bearer tokens no longer exist.
4. Install the private answer-key bundle and set `RUPEERISE_PRIVATE_CONTENT_DIR`.
5. Create organisations and the first invitations as an operator:
   ```bash
   python -m app.admin create-org "Asha Foundation" --kind ngo
   python -m app.admin create-invite --org "Asha Foundation" --days 7 --uses 1
   ```
   Give the printed token to the coordinator out of band. It is shown once. After that, educators can invite colleagues from inside their own organisation.
6. Existing educators and students keep their organisation. Existing students without a class are asked for one at next sign-in.

## Local full stack with Docker

```bash
cp .env.example .env   # set POSTGRES_PASSWORD and RUPEERISE_SECRET_KEY
docker compose up --build
# web: http://localhost:8080  (bound to 127.0.0.1)
```

The API has no published port; the interactive docs are off. Without a private bundle the stack uses placeholder answer keys.

> Status: the Dockerfiles, compose file and nginx configuration have **not been built or run** in the environment this was written in (the Docker daemon was not running and `nginx` is not installed), so `nginx -t` has not been run on them. Run `docker compose up --build` once and check the response headers (`curl -I http://localhost:8080/`) before relying on them.

## Release checklist

1. CI green on `main` (hygiene, backend, frontend, e2e).
2. `alembic upgrade head` applied (automatic in the container start command).
3. `curl -I https://<host>/` shows `Content-Security-Policy`, `Strict-Transport-Security`, `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`, `Permissions-Policy`; `https://<host>/api/docs` is 404.
4. Smoke test: `/api/health` → `{"status": "ok"}`; register a student; complete one mission; educator invitation works once and a second use is refused.
5. `scripts/check-repo-hygiene.sh` passes; no `.env`, key or answer file in the image or repository.
