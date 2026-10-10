"""Learning levels 1-5 and the unlock rules (pure, transparent).

Levels depend on demonstrated understanding only: mission scores, quiz scores,
concept mastery and reflections. Never on money, rewards or trading volume, so
there is no pay-to-progress path. Every unmet requirement is returned with a
plain-language label so students always see exactly what is left to do.
"""

from __future__ import annotations

from dataclasses import dataclass, field

PASS = 60
MASTERY_OK = 0.6
MIN_WEIGHT = 2


@dataclass(frozen=True)
class LevelEvidence:
    mission_best: dict[str, int] = field(default_factory=dict)  # kind -> best score
    mission_safe: dict[str, bool] = field(default_factory=dict)  # kind -> best attempt safe
    quiz_best: dict[str, int] = field(default_factory=dict)
    diversification: tuple[float, float] = (0.0, 0.0)  # (mastery, weighted_total)
    reflections_correct: set[str] = field(default_factory=set)  # concepts explained correctly
    applied_missions: set[str] = field(default_factory=set)  # e.g. {"money_lab"}


@dataclass(frozen=True)
class Requirement:
    key: str
    label: str
    met: bool


LEVELS = [
    (1, "Money basics", "Plan a budget and keep needs ahead of wants."),
    (2, "Saving and compounding", "Build a saving habit and see compounding at work."),
    (3, "Risk and return", "Understand why higher growth comes with bigger swings."),
    (4, "Diversification", "Show you can spread risk across different kinds of things."),
    (5, "Responsible financial planning", "Combine saving, risk and safety in a real-life plan."),
]


def _mission(e: LevelEvidence, kind: str) -> bool:
    return e.mission_best.get(kind, 0) >= PASS


def _quiz(e: LevelEvidence, slug: str) -> bool:
    return e.quiz_best.get(slug, 0) >= PASS


def requirements(level: int, e: LevelEvidence) -> list[Requirement]:
    mastery, weight = e.diversification
    if level == 1:
        return [
            Requirement(
                "mission_budget",
                "Finish a budgeting mission with a score of 60+",
                _mission(e, "budget"),
            ),
            Requirement(
                "quiz_budget",
                "Pass the Plan & Budget quiz (60%+)",
                _quiz(e, "quiz-plan-and-budget"),
            ),
        ]
    if level == 2:
        return [
            Requirement(
                "mission_savings",
                "Finish a saving mission with a score of 60+",
                _mission(e, "savings"),
            ),
            Requirement(
                "quiz_savings",
                "Pass the Save & Manage quiz (60%+)",
                _quiz(e, "quiz-save-and-manage"),
            ),
        ]
    if level == 3:
        return [
            Requirement(
                "mission_investing",
                "Finish an investing mission with a score of 60+",
                _mission(e, "investing"),
            ),
            Requirement(
                "quiz_investing",
                "Pass the Understand Investing quiz (60%+)",
                _quiz(e, "quiz-understand-investing"),
            ),
        ]
    if level == 4:
        return [
            Requirement(
                "mastery_diversification",
                "Show you understand diversification (mastery 60%+ from quizzes and missions)",
                mastery >= MASTERY_OK and weight >= MIN_WEIGHT,
            ),
            Requirement(
                "reflect_diversification",
                "Explain why diversification reduces risk in a reflection question",
                "diversification" in e.reflections_correct,
            ),
            Requirement(
                "investing_safe",
                "Finish an investing mission without concentrating in single companies",
                e.mission_safe.get("investing", False) and _mission(e, "investing"),
            ),
        ]
    return [
        Requirement(
            "mission_safety",
            "Finish a safety challenge with only safe actions",
            _mission(e, "safety") and e.mission_safe.get("safety", False),
        ),
        Requirement("quiz_safety", "Pass the Stay Safe quiz (60%+)", _quiz(e, "quiz-stay-safe")),
        Requirement(
            "applied_money_lab",
            "Finish the ₹500 Money Lab, the final applied mission",
            "money_lab" in e.applied_missions,
        ),
    ]


def evaluate(e: LevelEvidence) -> dict[str, object]:
    """Highest unlocked level plus a requirement checklist for every level."""
    unlocked = 0
    out = []
    blocked = False
    for number, title, summary in LEVELS:
        reqs = requirements(number, e)
        done = all(r.met for r in reqs) and not blocked
        if done:
            unlocked = number
        else:
            blocked = True  # a level cannot be reached before the one below it
        out.append(
            {
                "level": number,
                "title": title,
                "summary": summary,
                "unlocked": done,
                "requirements": [{"key": r.key, "label": r.label, "met": r.met} for r in reqs],
            }
        )
    nxt = next((lv for lv in out if not lv["unlocked"]), None)
    return {
        "current": unlocked,
        "current_title": LEVELS[unlocked - 1][1] if unlocked else "Getting started",
        "levels": out,
        "next": nxt,
    }
