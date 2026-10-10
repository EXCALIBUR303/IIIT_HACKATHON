# Security model

RupeeRise is an education product for minors with fictional money. It stores a nickname, a
username and learning progress, and no email, phone number or real-world ID. This page says what
protects that data, how to run it safely, and what is *not* protected.

## Who can become what

| Role | How | Notes |
|---|---|---|
| Student | Self-registers (rate-limited per IP) | May join classes of **one** organisation |
| Educator | Registers with an **invitation token** | The token names the organisation. Nothing the registrant types can pick, name or match an organisation |
| Organisation | Created by an operator only | `python -m app.admin create-org`. No HTTP route creates one |

### Educator invitations

- Created by an operator (`python -m app.admin create-invite --org "…" --days 7 --uses 1 [--json]`) or by an existing educator for **their own** organisation (`POST /educator/invites`).
- Token format `rri_<random>`; shown once; only its SHA-256 is stored.
- Expiry (default 7 days, max 90), a use limit (default 1) and revocation.
- Consumed by a single conditional `UPDATE … RETURNING organization_id`, so two people racing for the last use cannot both win. A taken username rolls the transaction back and does not burn the invite.
- Unknown, malformed, expired, revoked and used-up tokens all return the same `403 invalid_invite` with the same message.
- Attempts are limited per IP and per token.
- There is no shared global educator code any more (`RUPEERISE_EDUCATOR_INVITE_CODE` was removed).

## Sessions

- Browsers hold **no token in script-readable storage**. `rr_access` (HttpOnly, `SameSite=Lax`, 15 min, path `/api`), `rr_refresh` (HttpOnly, `SameSite=Strict`, 14 days, path `/api/v1/auth`) and `rr_csrf` (readable, only useful with the HttpOnly pair).
- `Secure` is on in production; the API refuses to start in production if cookies would not be Secure.
- Every request checks the `auth_sessions` row, so **logout, password change and reuse detection take effect immediately**, not when a JWT expires.
- Refresh tokens are `<session>.<secret>`, stored hashed, rotated on every use. Presenting a previous token (replay) revokes the session.
- **CSRF:** unsafe cookie-authenticated requests need `X-CSRF-Token` = HMAC(secret, session id), and an `Origin`/`Referer` in `RUPEERISE_CORS_ORIGINS`.
- `POST /auth/password` verifies the current password, revokes all sessions and opens a new one. `DELETE /students/me` and `POST /students/me/organization/leave` need the current password.
- Unknown usernames cost the same bcrypt time as wrong passwords.
- Bearer mode (`X-Auth-Mode: bearer`) exists for scripts and tests; the SPA does not use it.

## Abuse limits

Postgres fixed-window counters with hashed keys (no usernames, IPs or tokens in readable form). Defaults (all `RUPEERISE_RL_*`):

| Action | Key | Limit |
|---|---|---|
| Login | IP; IP + username | 40 / 8 per 15 min |
| Student registration | IP | 10 / hour |
| Educator invitation attempts | IP; token | 10 / 20 per hour |
| Cohort join | IP; student | 20 / 10 per hour |
| Password change / re-auth | student | 6 / hour |
| Tutor questions | student | 20 / hour, 100 / day (refused questions count) |
| Portfolio writes | student | 300 / hour |

Postgres is shared by every API instance, so limits hold when you scale out. A dedicated Redis would scale further; `app/core/ratelimit.py:hit` is the only seam.

**The limits are only as good as the client IP the API sees.** Run uvicorn with `--proxy-headers` and `FORWARDED_ALLOW_IPS` limited to your proxy, and make that proxy *overwrite* `X-Forwarded-For` (the bundled nginx does). If you trust a header a client can set, anyone can pick their own rate-limit bucket.

## Organisation isolation

- A student has one organisation. A code from another organisation returns the same `404 invalid_join_code` as an unknown code.
- Moving is explicit: `POST /students/me/organization/leave` (password required) removes the student from all classes and writes an `organization_transfers` audit row. Their old educators lose sight of them at once.
- Educator queries filter by the cohort's organisation **and** the student's organisation, so a stale membership row cannot leak data.

## Learning integrity (what is and is not enforced)

- **Answer keys are not in the repository** (see [content-privacy.md](content-privacy.md)).
- Module quizzes unlock only after a finished mission in the same module. Completing a module needs the mission **and** a passed quiz.
- Each attempt gets a server-chosen question order, option order and (where authored) one item per variant group. Resuming returns the same set.
- Timing is measured on the server from when the questions were served. A client `response_ms` is accepted only if plausible, otherwise replaced by the server average. Timing only ever *reduces* reward eligibility for implausibly fast answers; slow readers lose nothing.
- Repeated failures trigger a short, growing cooldown for **new** attempts. An open attempt can always be resumed.
- Rewards stay once-per-tier in the append-only ledger.

**Limitation, stated plainly:** questions are delivered to the browser, so a determined student can read them, can screenshot them, and can share them. Shuffling, variants, server timing and cooldowns make casual copying and brute-force retrying less rewarding; they cannot make a client-delivered quiz cheat-proof. Scores are formative, never grades or certificates.

## Learning stages

Stage comes from the class (grade) a student reports. It is **self-declared and unverified**, so stages are age-appropriate personalisation that the server enforces consistently, not proof of age.

- Onboarding cannot complete without a class (`422 grade_required`). Until then stage-gated routes answer `403 stage_required`; there is no default to an older stage.
- Scenario lists, scenario detail, session start, the investing catalog, the savings and investment calculators and Portfolio Quest all check the stage.
- After onboarding the class can change once per 30 days.

## AI tutor

- Deterministic glossary answers are always available and are the fallback for every failure.
- **Before the model:** a deterministic screen refuses requests for personal picks ("what would you buy"), product or app recommendations, predictions, jailbreak phrasing, pasted OTPs/PINs/passwords/IDs and balance edits. Obfuscation (spaced letters, leetspeak, zero-width characters, full-width forms) is normalised first. Refusals are canned and never reach the model. Text in a non-Latin script is answered from the glossary only, because the filters cannot read it.
- **To the model:** only the verified glossary entry, the student's own simulation feedback for the session they asked about, and the question with long numbers, emails, phone numbers and links removed. No name, username, id, class, school or history.
- **After the model:** answers naming real brands, banks, brokers, indices or coins (unless the context did), giving advice or an opinion, predicting, promising returns, asking for secrets, containing links, quoting rupee figures that are not in the verified context, or over 1,200 characters are discarded and replaced by the glossary answer.
- Student questions are never logged; refusals log only a category.
- Regexes are a floor, not a ceiling. A rephrased request can still pass the input screen; it still has to survive the system prompt and the output checks. This is not a substitute for human review of the tutor in a pilot.

## Portfolio Quest

Unchanged controls: integer paise, server-computed prices from a seeded path, non-negative cash enforced in code and by a CHECK constraint, `request_id` idempotency, `confirm` on every mutation, the row locked `FOR UPDATE`.

Added: at most 40 buys, sells and transfers per fictional year (409 `round_action_limit`); a per-student write rate limit; one persisted value row per year (≤ 11 per run) instead of replaying the log for the chart; keyset-paginated history; indexes for both access paths.

## Web and API surface

The bundled nginx (`frontend/nginx.conf`, `frontend/nginx/`) sends a Content-Security-Policy (same-origin scripts, no framing), HSTS (only when the request arrived over HTTPS), `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy` and cross-origin isolation headers; sets `Cache-Control: no-store` on `/api`; limits body size to 64 KB; applies coarse per-IP throttles; and returns 404 for the interactive API docs. In production the backend also disables its docs. SPA routing and the `/api` proxy are unchanged.

## Repository hygiene

`scripts/check-repo-hygiene.sh` (run in CI) fails if a `.env`, key file, answer-key file or likely credential is tracked, or if the public content JSON contains answers. `.gitignore` excludes `.env*`, `*.pem` and the private bundle.

## Known gaps

See [limitations.md](limitations.md#security). The largest: the old answer keys remain in git history until it is rewritten.
