# Development Roadmap

## Milestone 1: Foundation (complete, pending push approval)

Working full-stack foundation: deterministic engine for all four pillars, 13 scenarios, 6 assessments, mastery + adaptive rules, educator analytics, optional grounded tutor, full frontend, 123 backend tests, 21 frontend tests, 8 Playwright journeys, CI workflow, docs and handoff briefs.

## Milestone 2: Parallel development (teammates, branches in parallel)

| Track | Goal | Owner |
|---|---|---|
| Engine depth | More events per scenario, multi-month budget runs, debt/EMI scenario, harder safety sets (deepfake voice call, fake app store page) | Member 1 |
| Adaptive v2 | Spaced review of weak concepts, misconception-specific micro-lessons, difficulty unlocks | Member 1 |
| AI tutor | Enable with key, evaluation set of 30 student questions, refusal/fallback checks | Member 1 |
| Frontend flows | Resume in-progress sessions, simulation history view, assessment autosave, better empty states | Member 2 |
| Design polish | Illustrations per persona, micro-animations on outcomes, dark-on-light contrast audit, Hindi/Telugu typography check | Member 3 |
| Backend | Rate limiting, refresh tokens or cookie auth, cohort CSV export, admin endpoints, indexes review | Member 4 |
| QA & deploy | Load test for 1,500 students, accessibility audit (axe), staging deploy, coverage report | Member 5 |

## Milestone 3: Integration & submission

Merge PRs in order: backend → engine → frontend functionality → UI/UX → QA. Run the full test matrix, verify the four pillars end to end, deploy, record the demo, produce `RupeeRise-Final.zip` and the compliance report.

## Definition of done for any feature

- Educational objective stated (what concept, which misconception it addresses)
- Deterministic calculations with unit tests
- Works on a 375 px wide screen and with keyboard only
- No new personal data collected
- Documented in the relevant `docs/` file
