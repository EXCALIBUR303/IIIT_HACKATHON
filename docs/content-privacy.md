# Content privacy: answer keys

Quiz answers, explanations, reflection answers, Banking Explorer answers and the safety
inbox verdicts are **not** in the public repository. The JSON under `backend/app/content/`
carries prompts and options only.

## Where the keys live

`backend/private_content/answer_keys.json`, ignored by git (`.gitignore`: `backend/private_content/`, `**/answer_keys.json`). It is merged into the public content at start-up by `app/content/keys.py` and `loader.py`.

| Environment | Behaviour without the bundle |
|---|---|
| `RUPEERISE_ENV=production` | **Refuses to start** |
| development / tests | Uses *clearly labelled placeholder keys* (every explanation says so). Tests that need the real answers are marked `requires_private_content` and skip |

Point the API at the bundle with `RUPEERISE_PRIVATE_CONTENT_DIR` (docker-compose mounts `backend/private_content` read-only at `/run/private-content`). `RUPEERISE_PRIVATE_CONTENT_DIR=none` forces placeholders, which is how CI runs.

Distribute the bundle to maintainers and to the deployment environment through a secret store, not through git, chat or the container image.

## Tools

- `backend/scripts/split_private_content.py` split an answer-bearing content set into public JSON + private bundle (already run once).
- `tests/test_content_privacy.py` checks the public JSON has no answers or verdicts, that no answer-key file is tracked, that merging round-trips, and that production refuses placeholders.
- `scripts/check-repo-hygiene.sh` repeats the check in CI.

## What this does not fix

1. **Git history.** The answers were committed and pushed before this change. They remain in earlier commits of the public repository until history is rewritten (for example with `git filter-repo` replacing the old content blobs, then a force-push and asking every clone to re-clone). That needs the repository owner's decision, and anything already cloned or forked keeps the old keys. Treat the current questions as exposed. The practical fix is new question variants: add alternates with a shared `variant_group` and keep their answers only in the private bundle.
2. **The browser.** Questions and, after submitting, the correct answers and explanations for that attempt are delivered to the student by design. The controls in [security.md](security.md#learning-integrity-what-is-and-is-not-enforced) reduce casual abuse; they do not make a quiz secret.
