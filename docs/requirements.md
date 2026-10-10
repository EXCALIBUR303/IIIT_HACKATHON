# Requirements & Traceability

**Source of truth:** Vanguard India problem statement *"Empowering the Next Generation Through Financial Literacy"* (IIIT Hyderabad Megathon 2026). The sponsor deck is marked *Vanguard Internal Use Only* and is **not** stored in this repository; requirements below are our team's paraphrase.

## 1. Problem interpretation

Design a digital experience that Class 11–12 students, particularly from underserved communities across Hyderabad, *want* to use, built around **learning by doing: make choices, see consequences, try again.** Start with roughly 1,500 students and design to scale. Keep it educational, scalable and privacy-conscious. Guardrail: **educate, do not recommend investments; simulations are assumptions, not promises.**

RupeeRise answers this with persona-led financial-life simulations backed by a deterministic engine, assessments that separate understanding from activity, transparent adaptive recommendations, and an NGO/educator dashboard.

## 2. Requirement classification

### A. Mandatory sponsor requirements

| ID | Requirement (paraphrased from the brief) |
|---|---|
| M-01 | Audience: Grade 11–12 students, underserved communities, Hyderabad |
| M-02 | Pillar 1, Plan & budget: needs vs wants, choices, goals |
| M-03 | Pillar 2, Save & manage: habits, spending, unexpected needs |
| M-04 | Pillar 3, Understand investing: risk, time, compounding, diversification |
| M-05 | Pillar 4, Stay financially safe: protect information, spot suspicious offers |
| M-06 | Simple + relatable: everyday decisions students recognise; easy for a beginner |
| M-07 | Interactive + fun: games, stories, simulations, challenges, rewards or quizzes |
| M-08 | Safe to explore: experiment and make mistakes without real-world consequences |
| M-09 | Learn by doing: make choices, see consequences, try again |
| M-10 | Persona-led: adapt by age, context and financial maturity |
| M-11 | Language-ready: translation capability for wider accessibility |
| M-12 | Game-based evaluation: test learning and evaluate understanding |
| M-13 | Intuitive UI: simple navigation with minimal guidance |
| M-14 | NGO-integrated: enable delivery, rollout and progress support |
| M-15 | Scale: start with ~1,500 students, design to scale |
| M-16 | Privacy-conscious and educational |
| M-17 | Guardrail: educate, do not recommend investments |
| M-18 | Guardrail: simulations are assumptions, not promises |

### B. Implementation assumptions

| ID | Assumption | Rationale |
|---|---|---|
| A-01 | Students may not have email or phones of their own → username + password + nickname only | Inclusion and data minimisation |
| A-02 | Delivery happens through NGOs/schools on shared or low-end devices → responsive web app, small bundles, no install | Reach |
| A-03 | Educators self-register with an invite code issued by the programme coordinator | Prevents arbitrary access to student analytics |
| A-04 | Hindi and Telugu are the priority languages after English for Hyderabad; Urdu is a candidate for the next round | Local context |
| A-05 | All amounts are fictional rupees; interest rates and market paths are illustrative | M-17, M-18 |
| A-06 | A module is "completed" after one simulation plus a module quiz score of ≥60% | Clear, explainable completion rule |
| A-07 | Pre/post change is reported only for students who took both checks, with a caveat on small samples | Avoid unsupported claims of learning gains |

### C. Recommended enhancements (implemented)

AI tutor grounded on verified content with deterministic fallback · misconception detection · rapid-guess dampening · achievements kept separate from mastery · free-explore calculators · account self-deletion · accessibility preferences (large text, high contrast, reduced motion).

### D. Optional / future

Offline-first PWA · voice narration · translated learning content (not just UI) · SMS nudges via NGO · additional personas (e.g. girls' hostel, rural commuter) · educator content authoring UI · cohort data export.

## 3. Traceability matrix

Status legend: **Verified** = implemented and covered by automated tests or verified in the running app; **Implemented** = built but not yet independently verified; **Partial** = some aspects missing.

| ID | Implementation module(s) | Acceptance criteria | Verification method | Status |
|---|---|---|---|---|
| M-01 | Personas (`backend/app/content/personas.json`), onboarding grade question, Hyderabad contexts in all scenarios | Every scenario uses relatable Indian student contexts; onboarding asks class 11/12 | Content review; E2E onboarding | Verified |
| M-02 | `engine/budget.py`; 4 budget scenarios; quiz `quiz-plan-and-budget` | Student allocates income across needs/wants/savings, cannot exceed income, faces a surprise, sees consequences, retries | `test_engine_budget.py` (22 tests), `test_api_simulations.py`, E2E budgeting | Verified |
| M-03 | `engine/savings.py`; 3 savings scenarios; compounding explorer | Goal + emergency fund plan, emergency event, month-by-month balances, simple vs compound | `test_engine_savings.py`, E2E savings | Verified |
| M-04 | `engine/investing.py`; 3 investing scenarios; investing explorer | Fictional assets; allocation must total 100%; outcome ranges; loss probability by horizon; diversification score; reaction to a fall | `test_engine_investing.py`, E2E investing | Verified |
| M-05 | `engine/safety.py`; 3 safety scenarios (14 messages, genuine ones included) | Student judges scam/genuine, picks red flags and an action, gets per-message explanation | `test_engine_safety.py`, E2E safety | Verified |
| M-06 | Plain-language copy, personas, concept glossary, "Why this?" explanations | Every score has an explanation; concepts defined with Indian examples | Manual review in running app | Implemented |
| M-07 | 13 simulations, 6 assessments, 11 achievements, interactive explorers | Each pillar has ≥3 interactive scenarios and a quiz | E2E suite; content counts in `test_engine_*` | Verified |
| M-08 | Fictional money everywhere, retries with attempt history, "Try a different strategy" | Unlimited retries; no real money or data | API test `test_retry_increments_attempt...`; E2E retry | Verified |
| M-09 | Session state machine `services/simulations.py` (decide → event → consequences) | Choices → recomputed outcome → feedback → retry | API + E2E tests | Verified |
| M-10 | Persona selection, persona-matched scenarios, difficulty ladder, `learning/adaptive.py` | Recommendation adapts to mastery and learning level; persona scenarios flagged | `test_learning.py` adaptive tests; API recommendation test | Verified |
| M-11 | `frontend/src/lib/i18n` (en/hi/te), persisted language preference | UI switches language; missing keys fall back to English | `i18n.test.ts`; manual check in app | Partial: UI chrome only; learning content English; translations need native review |
| M-12 | Initial/module/post assessments, misconception tagging, mastery model, guessing detection | Concept-level mastery separate from completion; pre/post comparison | `test_learning.py`, `test_api_learning.py` | Verified |
| M-13 | App shell, guided onboarding, recommendation card, consistent navigation | All nav links functional; no dead buttons | Component tests + E2E navigation | Verified |
| M-14 | Educator registration, cohorts with join codes, cohort overview analytics | Educator sees participation, module completion, concept mastery, pre/post, misconceptions; org isolation | `test_educator_cohort_flow_and_isolation`, E2E educator | Verified |
| M-15 | Stateless API, PostgreSQL, indexed FKs, set-based educator queries, code-split frontend | ~1,500 students served by one API instance + managed Postgres | Architecture review; **load test not yet run** | Implemented |
| M-16 | No PII collected, account deletion, org-scoped analytics, nicknames only | Delete removes all learning data; educators can't see other orgs | `test_account_deletion...`, isolation test | Verified |
| M-17 | Fictional assets only, disclaimers, tutor system prompt forbids product recommendations | No real product names; disclaimer on every investing result | Content review; tutor fallback test | Verified |
| M-18 | Outcome ranges, Monte Carlo bands, "illustrative" labels, score based on reasoning not returns | Investing score independent of market path | `test_score_rewards_reasoning_not_luck` | Verified |

## 4. Success measures from the brief → how we evidence them

| Measure | Evidence in RupeeRise |
|---|---|
| Simple | Beginner path: guided (★) scenarios, glossary, plain language |
| Relatable | Four Hyderabad personas with realistic incomes and goals |
| Persona-led | Persona chosen at onboarding; persona scenarios highlighted and preferred by recommender |
| Language-ready | i18n framework with three UI languages |
| Game-based | Simulations, challenges, quizzes, badges |
| Intuitive UI | Six-item navigation, single recommended next step |
| NGO-integrated | Cohorts, join codes, educator analytics |
