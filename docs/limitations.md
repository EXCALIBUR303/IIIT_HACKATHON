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

## Security

- **Old answer keys remain in git history.** The keys were removed from the working tree and moved to a private bundle, but the earlier public commits still contain them until history is rewritten (needs the owner's decision). Treat existing questions as exposed and add variants. See [content-privacy.md](content-privacy.md).
- **Client-delivered quizzes cannot be cheat-proof.** Shuffling, variants, server-side timing and cooldowns discourage casual abuse only. Scores are formative.
- **Class (grade) is self-declared.** Stages personalise content; they do not verify age. A class change is limited to once per 30 days after onboarding.
- **Rate limits depend on the client IP seen by the API.** They are correct only when a trusted proxy overwrites `X-Forwarded-For` and uvicorn trusts only that proxy. They are Postgres-based, which is fine at pilot scale; beyond that move `ratelimit.hit` to Redis.
- **Tutor input filters are regexes** plus output checks. A rephrased request can pass the first layer; the system prompt and output validation are independent layers, not a guarantee. Text in Hindi/Telugu is answered from the glossary only. The live-model path is still untested against the real API.
- **No account recovery.** There is no email, so a forgotten password cannot be reset by the user. An operator must handle it.
- **No MFA** for educators.
- **The nginx and Docker setup is untested here** (no Docker daemon or nginx binary was available); run it once before relying on the headers.
- **TLS is the deployer's job.** The containers speak HTTP.

## Technical

- **No offline mode**; needs a connection for every decision (engine runs server-side by design).
- **Docker/compose not yet built and verified** in this environment.
- **No load test yet** for the 1,500-student target (architecture is sized for it, but unmeasured). Portfolio history and rate-limit counters are indexed and bounded, but unmeasured under load.
- **oxlint warnings** remain (react-refresh export hints, set-state-in-effect in data loaders); no errors.
- **Logo** is an SVG trace of the supplied image, not the original vector.
- **No screen-reader testing.** Axe passes on ten pages, which is not the same as an accessibility review.
- **AI tutor** has only been tested in fallback mode and with a stubbed model (no API key configured). The model call path is implemented with the official SDK but unverified against the live API.
