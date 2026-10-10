"""Reward rules for the fictional educational wallet (pure, no database).

Principles
* Rewards recognise *demonstrated understanding*, never luck, speed or volume.
* Every reward has a deterministic idempotency key and can be earned once per
  student, so repeating an easy activity pays nothing. A retry that reaches a
  higher tier earns that tier's one-time reward.
* Dangerous financial choices (borrowing for a want, answering a scam message
  unsafely, concentrating money in single companies) disqualify a reward.
* Portfolio profit and loss are never inputs.
* Amounts are whole fictional rupees and live in ``AMOUNTS`` so they are easy
  to tune in one place.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

AMOUNTS: dict[str, int] = {
    "sim_pass": 25,
    "sim_strong": 50,
    "quiz_pass": 25,
    "quiz_strong": 25,
    "check_done": 20,
    "reflect_correct": 10,
    "explorer_stop": 10,
    "explorer_complete": 25,
}

PASS_SCORE = 60
STRONG_SCORE = 85


@dataclass(frozen=True)
class Award:
    rule_key: str
    amount: int
    idempotency_key: str
    reason: str
    concept: str | None = None


def disqualifier(kind: str, result: dict[str, Any]) -> str | None:
    """A short reason a reward is withheld, or None when the choices were safe."""
    if kind == "budget":
        if (result.get("outcome") or {}).get("borrowed", 0) > 0:
            return "borrowing to cover the surprise when safer options existed"
    elif kind == "savings":
        if result.get("borrowed", 0) > 0:
            return "borrowing to cover the emergency"
    elif kind == "money_lab":
        plan = result.get("plan") or {}
        total = sum(plan.values()) or 1
        if result.get("borrowed", 0) > 0:
            return "borrowing to cover the surprise when money was available"
        if plan.get("growth", 0) / total > 0.7:
            return "putting most of the money into the growth basket"
    elif kind == "investing":
        if (result.get("components") or {}).get("concentration", 15) == 0:
            return "putting most of the money into single companies"
    elif kind == "safety":
        messages = result.get("messages") or []
        if any(not m.get("action_safe", True) for m in messages):
            return "choosing an unsafe action on at least one message"
        if result.get("total") and result.get("correct_verdicts", 0) / result["total"] < 0.7:
            return "misjudging too many messages"
    return None


_SIM_CONCEPT = {
    "budget": "needs_vs_wants",
    "savings": "saving_habit",
    "investing": "diversification",
    "safety": "phishing_links",
    "money_lab": "goal_setting",
}


def simulation_awards(
    scenario_slug: str, kind: str, score: int | None, result: dict[str, Any]
) -> list[Award]:
    if score is None:
        return []
    if disqualifier(kind, result):
        return []
    concept = _SIM_CONCEPT.get(kind)
    awards: list[Award] = []
    if score >= PASS_SCORE:
        awards.append(
            Award(
                "sim_pass",
                AMOUNTS["sim_pass"],
                f"sim:{scenario_slug}:pass",
                "Completed the mission with sound choices.",
                concept,
            )
        )
    if score >= STRONG_SCORE:
        awards.append(
            Award(
                "sim_strong",
                AMOUNTS["sim_strong"],
                f"sim:{scenario_slug}:strong",
                "Strong, well-reasoned choices in the mission.",
                concept,
            )
        )
    return awards


def assessment_awards(slug: str, kind: str, score_pct: int, flagged_guessing: bool) -> list[Award]:
    if flagged_guessing:
        return []
    if kind in ("initial", "post"):
        # One-shot checks: reward an honest attempt, not the score, so students
        # have no reason to inflate the starting check.
        return [
            Award(
                "check_done",
                AMOUNTS["check_done"],
                f"check:{slug}:done",
                "Finished a knowledge check honestly.",
            )
        ]
    awards = []
    if score_pct >= PASS_SCORE:
        awards.append(
            Award(
                "quiz_pass",
                AMOUNTS["quiz_pass"],
                f"quiz:{slug}:pass",
                "Passed the module quiz.",
            )
        )
    if score_pct >= 80:
        awards.append(
            Award(
                "quiz_strong",
                AMOUNTS["quiz_strong"],
                f"quiz:{slug}:strong",
                "Showed strong understanding in the module quiz.",
            )
        )
    return awards


def reflection_award(question_key: str, concept: str) -> Award:
    return Award(
        "reflect_correct",
        AMOUNTS["reflect_correct"],
        f"reflect:{question_key}:correct",
        "Explained why your result happened.",
        concept,
    )


def explorer_stop_award(stop_key: str, concept: str) -> Award:
    return Award(
        "explorer_stop",
        AMOUNTS["explorer_stop"],
        f"explorer:{stop_key}:correct",
        "Understood a Banking Explorer stop.",
        concept,
    )


def explorer_complete_award() -> Award:
    return Award(
        "explorer_complete",
        AMOUNTS["explorer_complete"],
        "mission:banking_explorer:complete",
        "Completed the whole Banking Explorer journey.",
        "banking_basics",
    )
