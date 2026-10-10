"""Assessment scoring with misconception detection and guess dampening."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app.engine.money import SimulationError

from .mastery import RAPID_RESPONSE_MS, RAPID_WEIGHT, Evidence

GUESSING_SHARE = 0.5  # flag the attempt if at least half the answers were rapid


@dataclass
class ScoredResponse:
    question_slug: str
    concept: str
    selected: str
    correct_key: str
    is_correct: bool
    misconception: str | None
    confident_error: bool
    rapid: bool
    explanation: str
    correct_explanation: str
    weight: float


def score_attempt(
    questions: list[dict[str, Any]],
    responses: list[dict[str, Any]],
    *,
    base_weight: float,
) -> dict[str, Any]:
    """Score a full set of responses.

    ``questions``: [{slug, concept, options:[{key, correct?, misconception?, explanation}]}]
    ``responses``: [{question_slug, option_key, confidence?, response_ms?}]
    """
    by_slug = {q["slug"]: q for q in questions}
    seen: set[str] = set()
    for r in responses:
        slug = r.get("question_slug")
        if slug not in by_slug:
            raise SimulationError(
                f"Question '{slug}' is not part of this assessment", field="responses"
            )
        if slug in seen:
            raise SimulationError(f"Question '{slug}' was answered twice", field="responses")
        seen.add(slug)
    missing = set(by_slug) - seen
    if missing:
        raise SimulationError(
            f"Please answer every question ({len(missing)} unanswered)",
            code="incomplete",
            field="responses",
        )

    scored: list[ScoredResponse] = []
    for r in responses:
        q = by_slug[r["question_slug"]]
        options = {o["key"]: o for o in q["options"]}
        key = r.get("option_key")
        if key not in options:
            raise SimulationError(f"Invalid option for '{q['slug']}'", field="responses")
        correct_opt = next(o for o in q["options"] if o.get("correct"))
        chosen = options[key]
        is_correct = bool(chosen.get("correct"))
        ms = r.get("response_ms")
        rapid = isinstance(ms, int) and 0 <= ms < RAPID_RESPONSE_MS
        weight = base_weight * (RAPID_WEIGHT if rapid else 1.0)
        scored.append(
            ScoredResponse(
                question_slug=q["slug"],
                concept=q["concept"],
                selected=key,
                correct_key=correct_opt["key"],
                is_correct=is_correct,
                misconception=None if is_correct else chosen.get("misconception"),
                confident_error=(not is_correct) and r.get("confidence") == "high",
                rapid=rapid,
                explanation=chosen.get("explanation", ""),
                correct_explanation=correct_opt.get("explanation", ""),
                weight=weight,
            )
        )

    total = len(scored)
    correct = sum(1 for s in scored if s.is_correct)
    rapid_count = sum(1 for s in scored if s.rapid)
    concepts: dict[str, dict[str, int]] = {}
    for s in scored:
        c = concepts.setdefault(s.concept, {"correct": 0, "total": 0})
        c["total"] += 1
        c["correct"] += int(s.is_correct)
    misconceptions = sorted({s.misconception for s in scored if s.misconception})

    return {
        "correct_count": correct,
        "total": total,
        "score_pct": round(correct / total * 100) if total else 0,
        "flagged_guessing": total > 0 and rapid_count / total >= GUESSING_SHARE,
        "concepts": concepts,
        "misconceptions": misconceptions,
        "scored": scored,
        "evidence": [Evidence(s.concept, s.is_correct, s.weight, s.misconception) for s in scored],
    }
