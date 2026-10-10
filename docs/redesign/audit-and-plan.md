# RupeeRise v2: Audit, Gap Register, Design System and Implementation Plan

Audit date: 2026-10-10. Commit audited: `136b255` (`main`, matches `origin/main`).
Scope: the "Master Implementation and Redesign Directive". This document is the Phase-0 deliverable. No product code was changed during the audit.

## 1. Baseline (actually run on 2026-10-10)

| Check | Command | Result |
|---|---|---|
| Backend tests | `cd backend && uv run pytest -q` | 123 passed |
| Backend lint | `uv run ruff check .` | All checks passed |
| Migration drift | `uv run alembic check` | No new upgrade operations |
| Frontend typecheck | `npx tsc -b --noEmit` | exit 0 |
| Frontend unit tests | `npx vitest run` | 21 passed (5 files) |
| Running app | API :8000, web :5173 | Landing renders; auth splash resolves in about 1 s |
| E2E (Playwright) | not re-run during the audit | last green before commit `ee82dad` |

## 2. Gap register

### Present and functional (verified in code and tests)
- Student/educator auth (JWT, bcrypt, invite code, org isolation, account deletion cascade).
- Budget simulations (4 scenarios) with surprise events and response options.
- Savings and compounding (3 scenarios plus the compounding explorer and the head-start calculator).
- Investing risk and diversification (3 scenarios, 5 fictional assets, 5 fixed market paths, seeded Monte Carlo, score independent of the market path).
- Scam challenges (3 sets, 14 messages, genuine ones included; verdict + red flags + action rubric).
- Assessments (starting check, final check, 4 module quizzes), confidence input, misconception tags, rapid-guess dampening.
- Mastery model, adaptive next step with a reason, progress page, 11 achievements kept separate from mastery.
- Educator dashboard (participation, completion, concept mastery, pre/post, misconceptions, nicknames only).
- Tutor: grounded on the glossary; `claude-opus-5-5` when a key is set, deterministic fallback otherwise. The system prompt forbids recommendations, new numbers and requests for personal data.
- en/hi/te UI chrome; accessibility preferences (large text, high contrast, reduced motion).

### Present but incomplete
- **Scam Defender**: no fake *investment-returns* message ("guaranteed 3× in 30 days") and no explicit *advance-fee* message. A reward for safe reasoning does not exist yet because the reward system does not exist.
- **Stage adaptation**: only `learning_level` (beginner/intermediate/advanced) and persona exist. Grade is collected but nothing uses it.
- **Translations**: UI chrome only; all learning content is English; hi/te are unreviewed drafts.
- **Reflection/explanation evidence**: simulations give feedback, but students never *explain* a choice.
- **Visual design**: clean but generic SaaS look. No stage identity, and no visual separation between learning, reward and portfolio, because the last two don't exist.

### Missing (confirmed absent)
- **`/journey-demo` route**: the directive lists it as existing, but there is no such route, component or reference anywhere in the repo. It must be built, not preserved.
- Reward wallet, reward ledger, reward rules, wallet-to-portfolio transfers.
- Portfolio Quest: no persisted cash, holdings, transactions or market rounds. The investing simulator is a one-shot allocation exercise, not a portfolio.
- ₹500 Money Lab.
- Banking Explorer.
- Grade 7–10 experience: no content, eligibility rules or reporting.
- 0–100 learning score and level 1–5 unlocks.
- Changed-condition replay as an explicit mechanic. Retries exist, but none of them change conditions.

### Unsafe to change without a migration (and how we will do it)
| Change | Why it needs a migration | Approach (non-destructive) |
|---|---|---|
| Grades 7–10 | `ck_student_profiles_grade` allows only 11, 12, 13 | Widen the check to `grade IS NULL OR grade BETWEEN 7 AND 13`; existing rows stay valid |
| Stage-eligible content | `scenarios` has no stage column | Add `stages` JSON column with a server default of the current audience; backfill via seed |
| New simulation kinds (Money Lab) | `ck_scenarios_kind` lists four kinds | Widen the check to add `money_lab` |
| Rewards, portfolio, reflections | New tables | Additive `CREATE TABLE` only; every FK to `users` uses `ON DELETE CASCADE` so account deletion still erases everything |

No migration drops or rewrites a column. All new migrations are new files (`0002_…`, `0003_…`); `0001` is never edited.

## 3. Architecture decisions (for the implementation phase)

### 3.1 Stages (age-adaptive)
- `stage` is **derived** from grade by a pure function `learning/stages.py::stage_for(grade)`: 7–8 → `explorer`, 9–10 → `builder`, 11–12 → `future_planner`, 13 ("finished Class 12 / 18+") → `investor_sandbox`. Missing grade → `future_planner` (the current pilot). We do not store it separately, so it can't drift, and we never collect a date of birth.
- Content carries `stages: [...]`. The scenario list, the adaptive recommender, assessments and educator reporting filter on it, so the backend enforces eligibility; it is not just a frontend label.
- Advancement *within* a stage uses learning levels (3.4), never completion counts alone.

### 3.2 Reward ledger (backend-authoritative)
- Table `reward_ledger` with columns `id, student_id (FK cascade), amount INT (≠0), entry_type ('reward'|'transfer_out'), rule_key, source_type, source_ref, concept, reason, idempotency_key, created_at`, and **UNIQUE(student_id, idempotency_key)**. The balance is `SUM(amount)`; there is no mutable balance column to drift.
- Rules live in one module, `rewards/rules.py` (pure; integer rupees). Each rule declares a deterministic idempotency key, e.g. `sim:{slug}:pass`, `sim:{slug}:excellent`, `quiz:{slug}:pass`, `concept:{key}:mastered`, `mission:{key}:complete`. A key can pay out **once per student, forever**, so replaying an easy activity earns nothing. A retry that reaches a *higher* tier earns that tier's one-time key.
- Eligibility always requires demonstrated understanding (score threshold **and** rule-specific safety conditions). Examples: no reward for a budget that borrowed when a safe option existed; no safety reward if any scam was answered with an unsafe action; investing tiers use the existing reasoning score, which is path-independent. **Portfolio profit is never an input to any rule.**
- Issuance happens inside the same DB transaction that completes the session, attempt or mission. Duplicate requests or races hit the unique constraint and are absorbed (SAVEPOINT + IntegrityError, the same pattern as attempt creation).
- Rewards never touch mastery, the learning score or achievements, and those never read the ledger.

### 3.3 Portfolio Quest (persisted, fictional)
- Tables:
  - `portfolios`: `student_id PK, cash_paise BIGINT ≥ 0, starting_cash_paise, run_number, seed, round, created_at, updated_at`.
  - `portfolio_holdings`: `(student_id, instrument_key) PK, quantity INT > 0, cost_paise BIGINT`.
  - `portfolio_transactions`: append-only. Columns: `kind ('open','buy','sell','transfer_in','advance','reset')`, `instrument_key, quantity, price_paise, amount_paise, cash_after_paise, round, run_number, request_id`, with **UNIQUE(student_id, request_id)** for idempotency.
- Integer **paise** throughout (no floats). Starting cash ₹10,000, configurable via `RUPEERISE_PORTFOLIO_STARTING_CASH`.
- Instruments reuse `engine/investing.ASSETS` (fictional) so there is one catalogue. Prices are deterministic: `price(round) = base × Π(1 + asset_return(asset, path, r))`, with the path chosen by `crc32(student:portfolio:run)`. "Advance time" moves one round, which is an illustrative year. No live data.
- Every buy, sell, transfer or advance runs in one transaction with `SELECT … FOR UPDATE` on the portfolio row. The server checks ownership, positive integer quantity, available cash (no negative cash), owned quantity (no overselling) and unlock gates, and computes the price itself; client totals are ignored. A replayed `request_id` returns the original result without applying it twice.
- **Wallet → portfolio transfer**: one transaction writes `reward_ledger(transfer_out, -n, key=transfer:{request_id})` and `portfolio_transactions(transfer_in, +n)`. The wallet balance is checked under an advisory lock on `wallet:{student}`. Transfers are one-way (simpler, and they can't be used to launder gains back into "rewards").
- Reset = practice: it increments `run_number`, picks a new seed, clears holdings, restores starting cash and logs a `reset` row. Earlier runs stay in history, labelled practice. Transferred reward money is *not* refunded on reset; the UI says so before confirming.
- Gates (from learning level, 3.4): diversified baskets from Level 3; single-company instruments only after Level 4 (diversification demonstrated); transfers from the wallet from Level 2.
- Explorer/Builder stages see Portfolio Quest locked with an explanation; it opens at Future Planner.

### 3.4 Learning score and levels
- Pure function `learning/score.py` returning 0–100 plus a breakdown, with configurable weights (default: assessments 40, scenario decisions 30, explanation/reflection 20, safe behaviour 10). Inputs: assessment bests and mastery, best scenario scores weighted by coverage, reflection correctness, safety actions and absence of panic-selling or unnecessary borrowing. **It never reads portfolio value, P/L, the reward balance or the trade count.**
- New `reflections` table: after a simulation, the student picks the best explanation of *why* their outcome happened (a deterministic multiple-choice item tagged with a concept and a misconception) and states confidence. We store **no free text**, so there is no PII risk and no LLM grading.
- Levels 1–5 (Money basics → Saving & compounding → Risk & return → Diversification → Responsible planning). Each needs concept mastery ≥ threshold **plus** a passed applied mission or changed-condition replay. Rules live in `learning/levels.py` (pure) and every lock carries a human-readable reason.
- Changed-condition replay: re-run a completed scenario with one condition changed (another event or path, or a higher price level for inflation) using the existing seed mechanism (`seed` salt `replay`).

### 3.5 New learning experiences
- **₹500 Money Lab**: new kind `money_lab`, pure engine `engine/money_lab.py`. Steps: choose a goal → split ₹500 across spend / keep-ready / save / grow (fictional) → time passes (inflation plus one urgent need) → outcome with assumptions shown (rate, months, contributions, inflation), a limitations note and no product names.
- **Banking Explorer**: guided content journey from `content/banking_explorer.json`. Each card has `sources: [{title, url, publisher}]` and `last_verified`. Short checks (no free-text inputs anywhere) are recorded as a mission. Facts will be researched from RBI and official bank pages during the Sonnet phase; anything we can't verify is cut, not guessed. A banner states that RupeeRise cannot open accounts and never asks for Aadhaar, PAN, OTP, PIN, card or account numbers.
- **Scam Defender**: add fake-investment-returns, advance-fee/"processing fee" scholarship, fake customer-care and courier-impersonation messages (all fictional senders). The reward requires correct verdicts plus safe actions.

### 3.6 `/journey-demo`
A public, read-only, clearly labelled **local demo** that walks a visitor through the four stages using real engine calculators (no login, nothing persisted). Built late (P5).

## 4. Design system: "Mission Control / Finance Lab"

**Brand mark (updated 2026-10-10):** the team supplied a new logo, a cream `#FFFDF7` "R" on a navy `#131A26` rounded tile. It replaces the earlier indigo rupee mark in `LogoMark` and `favicon.svg` (traced as SVG; swap in the original vector if one exists). Navy becomes the console/ink colour and cream the paper colour; indigo stays as the learning accent.

**Idea:** a calm lab bench with instrument-like readouts. The RupeeRise logo (indigo tile, emerald rising arrow) anchors the brand. Colour does a job: every value on screen is colour-coded to the *kind of thing* it is, which is our main defence against mixing learning, rewards and fictional portfolio money.

| Domain | Token family | Colour | Used for |
|---|---|---|---|
| Brand / learning | `--learn-*` | Indigo `#4338CA` (logo) | Mastery, levels, missions, primary actions |
| Educational rewards | `--reward-*` | Marigold `#E8A317`, text `#8A5A00` | Wallet balance, ledger, "earned" moments |
| Fictional portfolio | `--market-*` | Teal `#0E7490`; gains `#047857`, losses `#B42318` | Portfolio Quest only |
| Safety | `--safety-*` | Vermilion `#C2410C` | Scam Defender, warnings |
| Surfaces | `--canvas` warm paper `#F7F6F2`, `--panel` white, `--console` ink `#0B1220` | | Console panels for readouts and charts |

- **Type**: Bricolage Grotesque (display; editorial, youthful), Plus Jakarta Sans (body; already shipped) and JetBrains Mono for readouts and tabular numbers. All are self-hosted via `@fontsource` under the OFL; no CDN fonts.
- **Readout component**: a label in small caps, a large tabular number and a domain chip ("FICTIONAL · PORTFOLIO", "LEARNING REWARD"). Every rupee figure is rendered through it, so its domain is always labelled.
- **Stage theming** via `data-stage` on `<html>`:
  - Explorer: larger type, rounder radius, story illustrations, one action per screen.
  - Builder: standard.
  - Future Planner: denser data.
  - Investor Sandbox: console-dark panels, calm motion.
- **Layout**: a left rail on desktop and a bottom tab bar on mobile (Home · Learn · Wallet · Portfolio · More). Each screen has one primary action and a visible "next step" strip.
- **Motion**: Motion only for state changes such as level unlock, reward count-up, price-tick transitions, mission complete and page transitions. A `useReducedMotion` gate falls back to instant state with no information loss. External Lottie/Rive: **none planned**. Hand-built SVG and Motion avoid licensing and hotlink risk; if one is added later it is bundled locally and its licence is recorded in `docs/redesign/assets.md`.
- **Accessibility**: 44 px targets, AA contrast for all text tokens (marigold is never used for text on white; `#8A5A00` is), visible focus, chart data also in tables, and gain/loss never conveyed by colour alone (always ▲/▼ and a sign).
- Avoid: purple gradients, glassmorphism, decorative icon soup, multi-chart walls.

## 5. Implementation plan (priority order)

| Phase | Deliverable | Key files | Tests |
|---|---|---|---|
| **P0** | Design tokens, fonts, Readout/DomainChip/Rail/TabBar, stage theming hook; migration `0002` (grade 7–13, `scenarios.stages`, `money_lab` kind); `learning/stages.py` | `index.css`, `components/ui/*`, `AppShell`, `alembic/versions/0002_*`, `models`, `schemas` | stage mapping, migration upgrade/downgrade, existing 123 + 21 green |
| **P1** | Reward ledger + rules + wallet API (`GET /wallet`, history) + issuance hooks in simulations/assessments; Wallet screen | `rewards/rules.py`, `services/rewards.py`, `api/v1/wallet.py`, `features/wallet` | issuance, idempotency, tier upgrade, no reward for unsafe choices, races, isolation |
| **P2** | Portfolio Quest: tables, service, `GET/POST /portfolio`, buy/sell/advance/reset/transfer, gates; screen with holdings, allocation, history, confirm dialogs, reflection after a market event | `engine/portfolio.py`, `services/portfolio.py`, `api/v1/portfolio.py`, `features/portfolio` | buy/sell validation, insufficient cash, oversell, bad quantity, idempotent request_id, valuation, determinism, transfer, gates, isolation |
| **P3** | Learning score + levels + reflections + changed-condition replay; Money Lab; Banking Explorer (official sources); Scam Defender additions | `learning/score.py`, `learning/levels.py`, `engine/money_lab.py`, content JSON | score maths, unlock rules, money-lab engine, content validation |
| **P4** | Dashboard redesign (Learning / Rewards / Portfolio as three separate panels), all student screens restyled, next-step strip | `features/dashboard`, all features | RTL tests, E2E full journey |
| **P5** | Educator refinements (stage filter, reflection gaps, follow-up suggestions), `/journey-demo`, a11y pass, translation keys for new UI, tutor guardrail additions (wallet/portfolio questions) | `services/educator.py`, `features/educator`, `features/journey-demo` | educator isolation, E2E educator, axe checks |

The end-to-end journey (sign in → stage → scenario → reflection → reward → wallet history → transfer → buy → market event → gain/loss + reflection → level up → unlock) becomes one Playwright spec, and it must pass before breadth work in P5.

## 6. Risks and open questions
- Banking Explorer facts depend on what official sources state on the day we check; unverifiable claims will be omitted and the gap noted.
- Grades 7–10 need age-appropriate content authoring. P3 ships at least two Explorer and two Builder scenarios; full parity is out of scope for the hackathon and will be listed as a limitation.
- hi/te for new content: keys wired; native review still required.
