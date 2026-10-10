"""Load versioned learning content (JSON) shipped with the backend.

Content is authored as JSON so educators and translators can edit it without
touching Python. ``app.seed`` upserts it into the database by slug.
"""

from __future__ import annotations

import json
from functools import cache
from pathlib import Path
from typing import Any

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


def scenarios() -> list[dict[str, Any]]:
    return load("scenarios")


def assessments() -> list[dict[str, Any]]:
    return load("assessments")


def achievements() -> list[dict[str, Any]]:
    return load("achievements")


PILLARS = ("budgeting", "saving", "investing", "safety")


def reflections() -> list[dict[str, Any]]:
    return load("reflections")


def banking_explorer() -> dict[str, Any]:
    return load("banking_explorer")
