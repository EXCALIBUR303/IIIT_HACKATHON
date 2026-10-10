# Known Limitations (honest status)

## Product & learning

- **Learning content is English-only.** The UI is translated into Hindi and Telugu (drafts that need native-speaker review); scenarios, questions and explanations are not yet translated. Content JSON is structured so translations can be added per field.
- **Learning gains are not yet evidenced.** The pre/post comparison exists, but no real students have used RupeeRise. Twelve questions per check is a small instrument; treat changes as indicative.
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
- **AI tutor** has only been tested in fallback mode (no API key configured). The model call path is implemented with the official SDK but unverified against the live API.
