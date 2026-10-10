"""Private answer keys: kept out of the repository, merged in at load time.

The JSON files in this directory are *public*: prompts, option text and story content only.
Everything that reveals or explains the right answer lives in ``answer_keys.json`` inside the
private content directory (``RUPEERISE_PRIVATE_CONTENT_DIR``, default ``backend/private_content``),
which is git-ignored and installed on the server at deploy time. See docs/content-privacy.md.

What is private, per content kind:

* assessment, reflection and banking-explorer options: ``correct``, ``misconception``,
  ``explanation``;
* safety messages: ``verdict``, ``red_flags``, ``safe_actions``, ``best_action``,
  ``explanation``.

When no bundle is installed, development and test runs get clearly-labelled *placeholder* keys so
the app still runs. Production refuses to seed without the real bundle.
"""

from __future__ import annotations

import copy
import json
import os
from pathlib import Path
from typing import Any

OPTION_FIELDS = ("correct", "misconception", "explanation")
SAFETY_FIELDS = ("verdict", "red_flags", "safe_actions", "best_action", "explanation")
KEYS_FILE = "answer_keys.json"
DEFAULT_DIR = Path(__file__).resolve().parents[2] / "private_content"
PLACEHOLDER_NOTE = "Placeholder explanation: the private answer keys are not installed."


def private_dir() -> Path | None:
    raw = os.environ.get("RUPEERISE_PRIVATE_CONTENT_DIR", "").strip()
    if raw.lower() == "none":  # explicit: behave like a checkout without the bundle
        return None
    path = Path(raw) if raw else DEFAULT_DIR
    return path if (path / KEYS_FILE).is_file() else None


def load_bundle() -> dict[str, Any] | None:
    d = private_dir()
    if d is None:
        return None
    with (d / KEYS_FILE).open(encoding="utf-8") as fh:
        return json.load(fh)


# --- splitting (used once by scripts/split_private_content.py) -------------------------------


def split_options(options: list[dict[str, Any]]) -> tuple[list[dict], dict[str, dict]]:
    public, keys = [], {}
    for o in options:
        public.append({k: v for k, v in o.items() if k not in OPTION_FIELDS})
        keys[o["key"]] = {k: o[k] for k in OPTION_FIELDS if k in o}
    return public, keys


def split_safety(config: dict[str, Any]) -> tuple[dict, dict]:
    public_msgs, keys = [], {}
    for m in config["messages"]:
        public_msgs.append({k: v for k, v in m.items() if k not in SAFETY_FIELDS})
        keys[m["id"]] = {k: m[k] for k in SAFETY_FIELDS if k in m}
    return {**config, "messages": public_msgs}, keys


# --- merging -----------------------------------------------------------------------------------


def _merge_options(options: list[dict], keys: dict[str, dict] | None, placeholder: bool) -> list:
    out = []
    for i, o in enumerate(options):
        merged = dict(o)
        if keys is not None:
            merged.update(keys.get(o["key"], {}))
        elif placeholder:
            merged.update({"correct": i == 0, "explanation": PLACEHOLDER_NOTE})
        out.append(merged)
    return out


def _placeholder_safety(index: int) -> dict[str, Any]:
    scam = index % 2 == 0
    return {
        "verdict": "scam" if scam else "genuine",
        "red_flags": ["urgency"] if scam else [],
        "safe_actions": ["report_block", "ignore_delete"] if scam else ["proceed_normally"],
        "best_action": "report_block" if scam else "proceed_normally",
        "explanation": PLACEHOLDER_NOTE,
    }


def merge(kind: str, public: Any, bundle: dict[str, Any] | None, *, placeholder_ok: bool) -> Any:
    """Return a deep copy of ``public`` content with answer keys merged in."""
    data = copy.deepcopy(public)
    if bundle is None and not placeholder_ok:
        raise RuntimeError("Private answer keys are required but not installed")
    k = (bundle or {}).get(kind, {})
    if kind == "assessments":
        for a in data:
            for q in a["questions"]:
                q["options"] = _merge_options(
                    q["options"], k.get(a["slug"], {}).get(q["slug"]) if bundle else None, True
                )
    elif kind == "reflections":
        for q in data:
            q["options"] = _merge_options(q["options"], k.get(q["key"]) if bundle else None, True)
    elif kind == "banking":
        for stop in data["stops"]:
            stop["options"] = _merge_options(
                stop["options"], k.get(stop["key"]) if bundle else None, True
            )
    elif kind == "safety":
        for s in data:
            if s["kind"] != "safety":
                continue
            for i, m in enumerate(s["config"]["messages"]):
                m.update(k.get(s["slug"], {}).get(m["id"]) if bundle else _placeholder_safety(i))
    return data


def is_placeholder() -> bool:
    return private_dir() is None
