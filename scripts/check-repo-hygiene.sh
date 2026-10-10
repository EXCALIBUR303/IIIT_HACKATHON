#!/usr/bin/env bash
# Fails if the repository tracks secrets, local config or answer keys. Run in CI and before
# publishing:  scripts/check-repo-hygiene.sh
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
fail=0

bad_files=$(git ls-files | grep -Ei '(^|/)(\.env(\..+)?|answer_keys[^/]*\.json|.*\.pem|.*\.key|id_rsa.*)$|(^|/)private_content/' | grep -v '\.env\.example$' || true)
if [ -n "$bad_files" ]; then
  echo "Tracked files that must stay private:"; echo "$bad_files"; fail=1
fi

# Likely credentials in tracked text files (this script and the docs that describe the patterns are excluded).
patterns='sk-ant-[A-Za-z0-9_-]{20,}|-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----|AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{30,}|xox[baprs]-[A-Za-z0-9-]{10,}'
hits=$(git grep -InE "$patterns" -- . ':!scripts/check-repo-hygiene.sh' ':!docs/*' || true)
if [ -n "$hits" ]; then
  echo "Possible credentials committed:"; echo "$hits" | sed 's/\(.\{0,120\}\).*/\1/'; fail=1
fi

# The public content must carry no answers.
# (concepts.json is the public glossary and legitimately has explanations.)
if git grep -InE '"correct"\s*:\s*(true|false)|"correct_explanation"|"verdict"' -- 'backend/app/content/assessments.json' 'backend/app/content/reflections.json' 'backend/app/content/banking_explorer.json' 'backend/app/content/scenarios.json' | grep -q .; then
  echo "Answer keys found in public content JSON"; fail=1
fi

[ "$fail" -eq 0 ] && echo "Repository hygiene OK"
exit "$fail"
