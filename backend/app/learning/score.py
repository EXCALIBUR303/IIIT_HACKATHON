"""Learning score (0-100): a transparent summary of demonstrated understanding.

It is deliberately separate from, and never reads, portfolio value, gains or
losses, the reward balance, or the number of trades. Weights are configurable
in one place. Every component carries a plain-language explanation and a
recovery tip so a low number always points to a next step.
"""

from __future__ import annotations

from dataclasses import dataclass

WEIGHTS = {"assessments": 40, "decisions": 30, "reflection": 20, "safe_behavior": 10}
PILLAR_KINDS = ("budget", "savings", "investing", "safety")
QUIZ_SLUGS = (
    "quiz-plan-and-budget",
    "quiz-save-and-manage",
    "quiz-understand-investing",
    "quiz-stay-safe",
)
EVIDENCE_TARGET = 4  # items needed for full credit in ratio-based components


@dataclass(frozen=True)
class Evidence:
    quiz_best: dict[str, int]  # quiz slug -> best score_pct
    scenario_best_by_kind: dict[str, int]  # kind -> best completed score
    reflections_correct: int
    reflections_total_available: int
    completed_missions: int  # best attempt per scenario
    safe_missions: int  # of those, free of dangerous choices


def _clamp(value: float) -> int:
    return max(0, min(100, round(value)))


def compute(e: Evidence) -> dict[str, object]:
    quiz = sum(e.quiz_best.get(s, 0) for s in QUIZ_SLUGS) / len(QUIZ_SLUGS)
    assessments = _clamp(quiz)

    decisions = _clamp(
        sum(e.scenario_best_by_kind.get(k, 0) for k in PILLAR_KINDS) / len(PILLAR_KINDS)
    )

    reflection = (
        _clamp(100 * e.reflections_correct / e.reflections_total_available)
        if e.reflections_total_available
        else 0
    )

    if e.completed_missions:
        coverage = min(1.0, e.completed_missions / EVIDENCE_TARGET)
        safe = _clamp(100 * (e.safe_missions / e.completed_missions) * coverage)
    else:
        safe = 0

    components = [
        _component(
            "assessments",
            assessments,
            "Average of your best module-quiz scores across the four pillars.",
            "Take or retake a module quiz after reading its explanations.",
        ),
        _component(
            "decisions",
            decisions,
            "Average of your best mission score in each of the four pillars.",
            "Replay a mission and try a different strategy; only your best attempt counts.",
        ),
        _component(
            "reflection",
            reflection,
            "Share of reflection questions you explained correctly after missions.",
            "Finish a mission and answer its reflection question.",
        ),
        _component(
            "safe_behavior",
            safe,
            "Missions finished without borrowing, risky concentration or unsafe actions.",
            "Replay a mission and choose the safer option; borrowing or unsafe picks lower this.",
        ),
    ]
    total = _clamp(sum(c["points"] for c in components))  # type: ignore[misc]
    return {
        "total": total,
        "components": components,
        "note": (
            "Your learning score measures what you have shown you understand. It does not use "
            "reward money, portfolio gains or losses, or how many trades you made."
        ),
    }


def _component(key: str, score: int, explanation: str, recovery: str) -> dict[str, object]:
    weight = WEIGHTS[key]
    return {
        "key": key,
        "score": score,
        "weight": weight,
        "points": round(score * weight / 100, 1),
        "explanation": explanation,
        "recovery": recovery,
    }
