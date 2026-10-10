# Known Limitations (honest status)

## Product & learning

- **Learning content is English-only.** The UI is translated into Hindi and Telugu (drafts that need native-speaker review); scenarios, questions and explanations are not yet translated. Content JSON is structured so translations can be added per field.
- **Learning gains are not yet evidenced.** The pre/post comparison exists, but no real students have used RupeeRise. Twelve questions per check is a small instrument; treat changes as indicative.
- **Stage tagging is thin.** Only a few scenarios are tagged for Explorer (Classes 7–8) and Builder (9–10); most content targets Future Planner and above.
- **New v2 screens are English-only.** Hindi/Telugu cover navigation labels only, as unreviewed drafts.
- **Changed-condition replay is implicit.** Retrying a Money Lab or Portfolio run varies the seeded surprise or price path; there is no explicit "change one thing and compare" mode.
- **Banking Explorer sources.** The RBI minors notification and the RBI Ombudsman FAQ were opened directly. NPCI, DICGC and the 1930 helpline facts come from search summaries, and the BSBD claim rests on older circulars because the page sat behind a human-verification step. Re-check against official pages before publishing; `last_verified` is 2026-10-10.
- **Rewards are fictional.** The wallet and Portfolio Quest hold no real value and cannot be withdrawn; the wallet-to-portfolio transfer is one-way and capped.
- **Simplified finance.** Budgets cover one month; savings use a single account per plan; investing uses illustrative paths and a one-factor Monte Carlo with normally distributed returns. No taxes, fees or inflation. All of this is deliberate for teaching, and labelled as assumptions.
- **Adaptive rules are heuristic** (transparent thresholds), not a calibrated psychometric model.
- **Sample data** created with `--demo` is synthetic and labelled; any numbers on the educator dashboard in demos come from these sample students.

## Technical

- **Auth tokens in `localStorage`** (simple cross-origin deploys). An XSS bug could expose a token; a production rollout should move to httpOnly cookies + CSRF protection and add refresh tokens.
- **No rate limiting** on login/registration yet.
- **No offline mode**; needs a connection for every decision (engine runs server-side by design).
- **Docker/compose not yet built and verified** in this environment.
- **No load test yet** for the 1,500-student target (architecture is sized for it, but unmeasured).
- **oxlint warnings** remain (react-refresh export hints, set-state-in-effect in data loaders); no errors.
- **Tutor guardrails are keyword-based** (regex), so a rephrased advice request can slip past them and reach the model's own prompt rules.
- **Logo** is an SVG trace of the supplied image, not the original vector.
- **No screen-reader testing.** Axe passes on ten pages, which is not the same as an accessibility review.
- **AI tutor** has only been tested in fallback mode (no API key configured). The model call path is implemented with the official SDK but unverified against the live API.
