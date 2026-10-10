"""One-off: move answer keys out of the public content JSON into a private bundle.

    uv run python scripts/split_private_content.py [--out private_content] [--force]

Reads the content files that still contain answers, writes ``<out>/answer_keys.json``, and
rewrites the public JSON without any answer fields. Refuses to overwrite an existing bundle
without ``--force`` (so re-running on already-stripped files cannot destroy your keys).
Copy the bundle to the server and keep it OUT of git (backend/private_content/ is ignored).
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.content import keys  # noqa: E402

CONTENT = ROOT / "app" / "content"


def dump(path: Path, data) -> None:
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(ROOT / "private_content"))
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args()
    out = Path(args.out)
    target = out / keys.KEYS_FILE
    if target.exists() and not args.force:
        sys.exit(f"{target} already exists; refusing to overwrite (use --force)")

    bundle: dict = {"version": 1, "assessments": {}, "reflections": {}, "banking": {}, "safety": {}}

    assessments = json.loads((CONTENT / "assessments.json").read_text(encoding="utf-8"))
    for a in assessments:
        for q in a["questions"]:
            q["options"], k = keys.split_options(q["options"])
            bundle["assessments"].setdefault(a["slug"], {})[q["slug"]] = k

    reflections = json.loads((CONTENT / "reflections.json").read_text(encoding="utf-8"))
    for r in reflections:
        r["options"], bundle["reflections"][r["key"]] = keys.split_options(r["options"])

    banking = json.loads((CONTENT / "banking_explorer.json").read_text(encoding="utf-8"))
    for stop in banking["stops"]:
        stop["options"], bundle["banking"][stop["key"]] = keys.split_options(stop["options"])

    scenarios = json.loads((CONTENT / "scenarios.json").read_text(encoding="utf-8"))
    for s in scenarios:
        if s["kind"] == "safety":
            s["config"], bundle["safety"][s["slug"]] = keys.split_safety(s["config"])

    out.mkdir(parents=True, exist_ok=True)
    dump(target, bundle)
    dump(CONTENT / "assessments.json", assessments)
    dump(CONTENT / "reflections.json", reflections)
    dump(CONTENT / "banking_explorer.json", banking)
    dump(CONTENT / "scenarios.json", scenarios)
    print(f"Wrote {target}\nPublic content rewritten without answer fields.")


if __name__ == "__main__":
    main()
