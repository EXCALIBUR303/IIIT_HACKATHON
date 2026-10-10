"""The repository ships no answer keys. Real keys live in a private bundle."""

import json
import subprocess
from pathlib import Path

import pytest

from app.content import keys, loader

CONTENT = Path(loader.__file__).parent
FORBIDDEN_OPTION = set(keys.OPTION_FIELDS)


def raw(name):
    return json.loads((CONTENT / f"{name}.json").read_text(encoding="utf-8"))


def test_public_assessments_have_no_answers_or_explanations():
    for a in raw("assessments"):
        for q in a["questions"]:
            for o in q["options"]:
                assert not FORBIDDEN_OPTION & set(o), (q["slug"], o)


def test_public_reflections_and_banking_have_no_answers():
    for q in raw("reflections"):
        assert all(not FORBIDDEN_OPTION & set(o) for o in q["options"]), q["key"]
    for stop in raw("banking_explorer")["stops"]:
        assert all(not FORBIDDEN_OPTION & set(o) for o in stop["options"]), stop["key"]


def test_public_safety_scenarios_have_no_verdicts():
    for s in raw("scenarios"):
        if s["kind"] == "safety":
            for m in s["config"]["messages"]:
                assert not set(keys.SAFETY_FIELDS) & set(m), (s["slug"], m["id"])


def test_no_answer_key_file_is_tracked_by_git():
    root = Path(__file__).resolve().parents[2]
    try:
        tracked = subprocess.check_output(["git", "ls-files"], cwd=root, text=True).splitlines()
    except (OSError, subprocess.CalledProcessError):
        pytest.skip("not a git checkout")
    assert not [f for f in tracked if "answer_keys" in f or "private_content" in f]


def test_merge_round_trips_and_placeholders_are_clearly_labelled():
    merged = keys.merge("assessments", raw("assessments"), None, placeholder_ok=True)
    opts = merged[0]["questions"][0]["options"]
    assert sum(1 for o in opts if o["correct"]) == 1
    assert all(keys.PLACEHOLDER_NOTE in o["explanation"] for o in opts)


def test_production_refuses_placeholder_keys(monkeypatch):
    from app.core.config import get_settings

    monkeypatch.setattr(get_settings(), "env", "production")
    monkeypatch.setenv("RUPEERISE_PRIVATE_CONTENT_DIR", "none")
    loader._bundle.cache_clear()
    try:
        with pytest.raises(RuntimeError, match="Private answer keys"):
            loader._bundle()
    finally:
        loader._bundle.cache_clear()
