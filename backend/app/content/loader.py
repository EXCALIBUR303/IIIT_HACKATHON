"""Load versioned learning content (JSON) shipped with the backend.

Content is authored as JSON so educators and translators can edit it without
touching Python. ``app.seed`` upserts it into the database by slug.
"""

from __future__ import annotations

import json
from functools import cache
from pathlib import Path
from typing import Any

from app.core.config import get_settings

from . import keys

CONTENT_DIR = Path(__file__).parent


@cache
def load(name: str) -> Any:
    with (CONTENT_DIR / f"{name}.json").open(encoding="utf-8") as fh:
        return json.load(fh)


def concepts() -> list[dict[str, Any]]:
    return load("concepts")


def concept_map() -> dict[str, dict[str, Any]]:
    return {c["key"]: c for c in concepts()}


def personas() -> list[dict[str, Any]]:
    return load("personas")


def modules() -> list[dict[str, Any]]:
    return load("modules")


@cache
def _bundle() -> dict[str, Any] | None:
    bundle = keys.load_bundle()
    if bundle is None and get_settings().is_production:
        raise RuntimeError(
            "Private answer keys are not installed. Set RUPEERISE_PRIVATE_CONTENT_DIR to the "
            "directory holding answer_keys.json (see docs/content-privacy.md)."
        )
    return bundle


@cache
def _merged(kind: str) -> Any:
    public = {"safety": "scenarios", "banking": "banking_explorer"}.get(kind, kind)
    return keys.merge(kind, load(public), _bundle(), placeholder_ok=True)


def keys_are_placeholders() -> bool:
    """True when the private bundle is missing and stand-in keys are active (never in prod)."""
    return _bundle() is None


def public_scenarios() -> list[dict[str, Any]]:
    """Scenario content without answer keys (what the repository ships)."""
    return load("scenarios")


def scenarios() -> list[dict[str, Any]]:
    """Scenarios with private safety keys merged in. For seeding and tests; never for responses."""
    return _merged("safety")


def assessments() -> list[dict[str, Any]]:
    """Assessments with answer keys merged in. For seeding and tests; never for responses."""
    return _merged("assessments")


def achievements() -> list[dict[str, Any]]:
    return load("achievements")


PILLARS = ("budgeting", "saving", "investing", "safety")


def reflections() -> list[dict[str, Any]]:
    return _merged("reflections")


def banking_explorer() -> dict[str, Any]:
    return _merged("banking")
