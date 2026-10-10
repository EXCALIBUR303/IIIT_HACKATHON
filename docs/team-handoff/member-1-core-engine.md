# Member 1 · Core Engine, Adaptive Learning, AI & Architecture (Tech Lead)

**Branch:** `feature/core-engine`

## Responsibilities
- Own correctness and educational design of the financial simulation engine.
- Evolve the adaptive learning rules and mastery model.
- Enable and evaluate the optional AI tutor.
- Guard architecture and shared contracts; review and merge all PRs; run final integration.

## Owned files
`backend/app/engine/**` · `backend/app/learning/**` · `backend/app/tutor/**` · `backend/app/content/scenarios.json`, `concepts.json`, `assessments.json` (scoring fields) · `docs/architecture.md` · `docs/requirements.md`

## Current state
- Pure, deterministic engines for budget, savings, investing and safety with Decimal money and transparent rubrics (see architecture.md §3).
- 13 scenarios, 14 concepts, 6 assessments (44 questions with misconception tags).
- Mastery: smoothed weighted ratio; retakes 1/n; rapid answers ×0.25. Adaptive: rule list in `learning/adaptive.py`.
- Tutor: official `anthropic` SDK (optional group `ai`), `claude-opus-5-5` at `low` effort by default, server-side `fallbacks: "default"`, deterministic glossary/session fallback.

## Tasks (priority order)
1. **Engine depth:** multi-event budgets (2–3 surprises over a month), an EMI/credit scenario (Imran's phone instalment), inflation toggle in the compounding explorer. Each with a stated objective and unit tests.
2. **Safety content:** add a deepfake-voice call, fake app-store page and "refund" scam set (difficulty 3).
3. **Adaptive v2:** spaced review (recommend a concept again after N days), misconception-specific micro-lessons (map `MISCONCEPTIONS` keys → short explanation cards), guard against recommending the same scenario repeatedly.
4. **AI tutor:** set `RUPEERISE_ANTHROPIC_API_KEY` locally, `uv sync --group ai`, build a 30-question evaluation (needs answers, refusal cases like "which stock should I buy?"), verify grounding and fallback. Consider `claude-haiku-5-5` for cost if quality holds (measure first).
5. **Integration:** merge order backend → engine → frontend → UI → QA; resolve conflicts; run full test matrix.

## Dependencies
- Member 4 for any new tables/columns (e.g. storing tutor feedback) and for new endpoints.
- Member 2 to surface new scenario fields in the UI; Member 3 for new visuals.

## Acceptance criteria
- Every new calculation has hand-checked unit tests (include zero, negative, boundary values).
- Engine functions remain pure; scores never depend on random market luck.
- No real product names; disclaimers retained.
- `uv run pytest` and `ruff` pass; architecture.md updated for any rule change.

## Integration expectations
- Changing a `state`/`result` shape = contract change: update `frontend/src/lib/api/types.ts` and `docs/api-contracts.md` in the same PR and tag Member 2.
