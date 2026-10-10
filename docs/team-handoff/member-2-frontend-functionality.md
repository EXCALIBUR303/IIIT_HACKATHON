# Member 2 · Functional Frontend

**Branch:** `feature/frontend-functionality`

## Responsibilities
Student-facing pages and flows, interactive learning components, forms, routing, client state, and API integration.

## Owned files
`frontend/src/features/**` (behaviour and data flow) · `frontend/src/App.tsx` · `frontend/src/lib/useAsync.ts` · `frontend/src/lib/auth.tsx` · `frontend/src/lib/api/endpoints.ts` (with Member 4 for contract changes)

## Current state
All screens are functional: landing, register/login, onboarding (profile → language/level → persona → starting check), dashboard with adaptive recommendation and journey, learn + module pages, four simulators, explore tools, assessments (take/result), progress, settings, educator dashboard, tutor panel. Data via `useAsync` + typed client.

## Tasks (priority order)
1. **Resume in-progress sessions:** on `SimulationPage`, if the latest session for the scenario is `in_progress`, offer "Continue" (GET `/simulations/sessions?scenario_slug=` then GET by id).
2. **Assessment autosave:** keep answers in `sessionStorage` per attempt id so a refresh doesn't lose progress.
3. **Attempt history view:** list past attempts of a scenario with scores and a link to view the stored result.
4. **Show hints preference:** respect `preferences.show_hints` in simulators (hide category hints when off).
5. **Error/loading polish:** consistent retry on network errors for decision submits; disable double submissions.
6. Consider TanStack Query only if caching/refetch logic grows; discuss with Member 1 first (new dependency).

## Dependencies
- Member 3 owns visual components; reuse `components/ui/*` and request new variants rather than restyling locally.
- Member 4 / Member 1 for new endpoints or fields.

## Acceptance criteria
- No dead buttons or placeholder interactions; every action calls the API or navigates.
- Works at 375 px, keyboard-only and with screen reader labels (use `Field`, roles, `aria-*`).
- `npm run typecheck`, `npm test`, `npm run build` pass; add RTL tests for new behaviour.

## Integration expectations
- Never hard-code API shapes; extend `lib/api/types.ts` only alongside backend schema changes.
- Avoid editing `components/ui/**` and `index.css`; open a PR or ask Member 3.
