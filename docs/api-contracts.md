# API Contracts (v1)

- Base path: `/api/v1` · JSON only · interactive docs at `/api/docs` · machine-readable schema in [`openapi.json`](openapi.json) (regenerate with `uv run python scripts/export_openapi.py` from `backend/`).
- Python source of truth: `backend/app/schemas/__init__.py`. TypeScript mirror: `frontend/src/lib/api/types.ts`.
- **Contract changes need a PR that updates schemas, TS types and this file together**, reviewed by Member 1 (architecture) and the affected owner.

## Conventions

**Authentication:** `Authorization: Bearer <access_token>` from `/auth/login` or `/auth/register/*`. Tokens expire after 12 h (configurable).

**Errors** always use one envelope:

```json
{ "error": { "code": "over_budget", "message": "You allocated ₹2,149 but only have ₹2,000…", "field": "allocations" } }
```

| Status | Typical codes |
|---|---|
| 401 | `unauthorized`, `invalid_credentials` |
| 403 | `forbidden`, `invalid_invite` |
| 404 | `not_found`, `invalid_join_code` (join) |
| 409 | `username_taken`, `invalid_transition`, `session_closed`, `already_answered`, `assessment_locked`, `already_submitted`, `already_member`, `conflict` |
| 422 | `validation_error` (with `details[]`), `over_budget`, `over_capacity`, `allocation_total`, `infeasible_response`, `incomplete`, `invalid_persona`, `persona_required` |
| 500 | `internal_error` (details logged server-side only) |

**Money** is returned as JSON numbers in rupees (computed with `Decimal` server-side, rounded to paise). All money is fictional.

## Endpoints

| Method & path | Auth | Purpose |
|---|---|---|
| `GET /api/health` | – | Liveness + DB check |
| `POST /auth/register/student` | – | `{username, password(8–64), display_name, join_code?}` → `TokenOut` (201) |
| `POST /auth/register/educator` | – | `{…, invite_code, organization_name}` → `TokenOut` (201) |
| `POST /auth/login` | – | `{username, password}` → `TokenOut` |
| `GET /auth/me` | any | `UserOut` |
| `GET /students/me/profile` | student | `ProfileOut` (grade, language, level, persona, onboarding flag, preferences, cohorts) |
| `PUT /students/me/profile` | student | Partial `ProfileUpdate`; completing onboarding requires a persona |
| `POST /students/me/cohorts` | student | `{join_code}` join a class |
| `DELETE /students/me` | student | Delete account and all learning data (204) |
| `GET /personas` | – | Fictional personas |
| `GET /concepts` | – | 14-concept glossary (also the tutor's fallback knowledge) |
| `GET /modules` | any | Modules with scenarios and quiz slug |
| `GET /scenarios?kind=` · `GET /scenarios/{slug}` | any | Scenario summaries / detail (safety answers never included) |
| `GET /catalog/investing` · `GET /catalog/safety` | any | Fictional assets & paths · red flags & actions |
| `POST /simulations/sessions` | student | `{scenario_slug}` → new attempt (`SessionOut`, 201). Abandons an open attempt |
| `GET /simulations/sessions?scenario_slug=` | student | Attempt history |
| `GET /simulations/sessions/{id}` | owner | Session state/result |
| `POST /simulations/sessions/{id}/decisions` | owner | `{type, payload}` → updated `SessionOut` |
| `POST /calculators/savings` | any | Simple vs compound projection (not saved) |
| `POST /calculators/head-start` | any | Start-now vs start-later comparison |
| `POST /calculators/investment` | any | Paths, Monte Carlo bands, loss-by-horizon, risk & diversification |
| `GET /assessments` · `GET /assessments/{slug}` | student | Summaries with attempts, best score, availability/lock reason |
| `POST /assessments/{slug}/attempts` | student | Start or resume attempt → questions **without** answers (201) |
| `POST /assessments/attempts/{id}/submit` | owner | `{responses:[{question_slug, option_key, confidence?, response_ms?}]}` → `AttemptResultOut` |
| `GET /assessments/attempts/{id}` | owner | Review a submitted attempt |
| `GET /progress/me` | student | Modules, concept mastery, strengths, practice areas, pre/post, recent, recommendation |
| `GET /progress/me/recommendation` | student | Next activity + reason |
| `GET /achievements/me` | student | Catalogue with earned flags |
| `GET /educator/cohorts` · `POST /educator/cohorts` | educator | List / create (`{name}` → join code) |
| `GET /educator/cohorts/{id}/overview` | educator (same org) | Participation, module completion, concept mastery, pre/post, support topics, misconceptions, student rows (nicknames) |
| `POST /tutor/ask` | student | `{question, concept?, session_id?}` → `{answer, source: ai|fallback, concept, grounded_on[], disclaimer}` |

## Simulation decision contract

Each kind is a small state machine; a decision is accepted only in its phase.

| Kind | Phase → decision `type` | `payload` | Next phase |
|---|---|---|---|
| budget | `allocate` → `allocate` | `{allocations: {category_key: rupees}}` (sum ≤ income, ≥ 0) | `respond_event` |
| | `respond_event` → `respond_event` | `{response: cut_wants\|mix\|use_savings\|borrow\|skip}` (must be feasible) | `done` |
| savings | `plan` → `plan` | `{goal_saving, emergency_saving, account}` (sum ≤ capacity, > 0) | `respond_event` |
| | `respond_event` → `respond_event` | `{source: emergency_fund\|goal_savings\|borrow}` | `done` |
| investing | `allocate` → `allocate` | `{allocation: {asset_key: percent}, horizon_years}` (total 100, allowed assets/horizons) | `respond_event`, or `done` if no fall fits the horizon |
| | `respond_event` → `respond_event` | `{action: hold\|sell_all\|rebalance}` | `done` |
| safety | `classify` → `classify` (once per message) | `{message_id, verdict: scam\|genuine, flags: [...], action}` | `done` after the last message |

### `state` / `result` shapes

Fully typed in `frontend/src/lib/api/types.ts` (`BudgetState`, `BudgetResult`, `SavingsState`, `SavingsResult`, `InvestingState`, `InvestingResult`, `SafetyState`, `SafetyResult`). Every result contains `score` (0–100), human-readable `feedback[]` items (`{tone: positive|caution|negative, concept, message}`) and `concept_evidence` (concept → bool) used for mastery.

## Example: budget session

```http
POST /api/v1/simulations/sessions
{"scenario_slug": "budget-meera-pocket-money"}
→ 201 {"id": "…", "phase": "allocate", "state": {"income": 2000.0, "goal": {...}, "categories": [...]}}

POST /api/v1/simulations/sessions/{id}/decisions
{"type": "allocate", "payload": {"allocations": {"bus_pass": 600, "lunch": 400, "stationery": 200,
  "recharge": 149, "outings": 150, "gaming": 50, "savings": 400}}}
→ 200 {"phase": "respond_event", "state": {"allocation": {"score": 100, ...},
       "event": {"title": "Lost geometry box", "amount": 250.0, ...},
       "options": [{"key": "cut_wants", "feasible": false, ...}, {"key": "mix", "feasible": true, ...}]}}

POST /api/v1/simulations/sessions/{id}/decisions
{"type": "respond_event", "payload": {"response": "mix"}}
→ 200 {"status": "completed", "score": 100, "result": {"outcome": {"paid_from": {...}, ...}},
       "new_achievements": ["budget_builder", "emergency_ready"]}
```
