"""Adaptive learning rules (pure, transparent, unit-tested).

The recommender reads a snapshot of a student's progress and returns ONE next
activity plus a human-readable reason. Rules, in priority order:

1. Finish onboarding.
2. Take the starting point check (initial assessment).
3. Pick the incomplete module whose concepts are weakest (ties: module order).
   a. No simulation done yet -> recommend a scenario. Target difficulty:
      mastery < 50% -> 1 (guided), < 80% -> 2 (standard), else 3 (challenge).
      Without evidence, the self-reported learning level decides.
      Prefer the student's persona when difficulties tie.
   b. Simulation done but quiz not passed (>= 60%) -> module quiz.
4. All modules complete and no final check -> final check (post assessment).
5. Otherwise practise the weakest concept below 80%, or offer a harder,
   not-yet-tried challenge.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

QUIZ_PASS = 60
PILLAR_LABEL = {
    "budgeting": "Planning & Budgeting",
    "saving": "Saving & Money Management",
    "investing": "Understanding Investing",
    "safety": "Financial Safety",
}
LEVEL_DIFFICULTY = {"beginner": 1, "intermediate": 2, "advanced": 3}

MISCONCEPTIONS: dict[str, str] = {
    "wants_as_needs": "treating wants as needs",
    "no_prioritisation": "not prioritising essential expenses",
    "spend_all_income": "spending everything that comes in",
    "no_plan": "leaving money without a plan",
    "lending_is_saving": "treating lending as saving",
    "goal_math_error": "miscalculating monthly goal amounts",
    "save_what_is_left": "saving only what is left over",
    "last_minute_saving": "leaving saving to the last minute",
    "irregular_saving": "saving irregularly",
    "saving_needs_high_income": "believing saving needs a high income",
    "ef_for_returns": "using an emergency fund to chase returns",
    "no_buffer_needed": "assuming emergencies won't happen",
    "ef_for_wants": "spending emergency money on wants",
    "interest_on_interest_ignored": "missing how interest earns interest",
    "compounding_doubles": "overestimating how fast compounding works",
    "interest_timing": "confusion about when interest is paid",
    "guaranteed_returns": "believing returns can be guaranteed",
    "test_the_scam": "testing suspicious schemes with small amounts",
    "higher_return_no_risk": "expecting high returns without risk",
    "famous_is_safe": "assuming a famous company is safe",
    "diversify_same_sector": "diversifying within one industry",
    "chasing_returns": "chasing recent winners",
    "short_horizon_high_risk": "taking high risk with money needed soon",
    "horizon_irrelevant": "ignoring the time horizon",
    "otp_safe_to_share_with_bank": "believing OTPs can be shared with 'bank staff'",
    "partial_sharing_safe": "sharing part of an OTP",
    "trust_official_looking": "trusting messages that look official",
    "wrong_signal": "focusing on the wrong warning signs",
    "fee_for_job": "paying fees for jobs",
    "social_proof": "trusting popularity over evidence",
    "small_fee_ok": "thinking small scam fees are harmless",
    "context_ignored": "ignoring context when judging needs",
    "borrow_to_balance": "borrowing to balance a budget",
    "cut_needs_first": "cutting needs before wants",
    "vague_goal": "setting vague goals",
    "raid_goal_first": "dipping into goal savings first",
    "borrow_first": "borrowing before using other options",
    "emi_makes_affordable": "treating EMIs as making things affordable",
    "pause_saving": "pausing saving for wants",
    "ef_too_small": "underestimating emergency fund size",
    "ef_unrealistic": "setting unrealistic emergency targets",
    "small_amounts_dont_matter": "believing small amounts don't add up",
    "risk_always_bad": "seeing all risk as bad",
    "risk_amount_confusion": "thinking risk depends on amount",
    "compounding_time_ignored": "underestimating the value of starting early",
    "luck_only": "attributing outcomes only to luck",
    "diversification_useless": "doubting diversification",
    "leverage_ok": "investing borrowed money",
    "simulation_is_promise": "treating simulations as promises",
    "certainty_expected": "expecting certainty from investing",
    "pin_to_receive": "believing a PIN is needed to receive money",
    "fee_for_prize": "paying fees to claim prizes",
    "share_id_freely": "sharing ID documents too freely",
    "permissions_normal": "accepting excessive app permissions",
    "too_good_believed": "believing too-good-to-be-true offers",
    "over_budget": "planning more spending than income",
}


@dataclass
class ModuleProgress:
    slug: str
    pillar: str
    title: str
    order: int
    concepts: list[str]
    completed_scenarios: set[str] = field(default_factory=set)
    quiz_slug: str | None = None
    quiz_best: int | None = None

    @property
    def simulation_done(self) -> bool:
        return bool(self.completed_scenarios)

    @property
    def quiz_passed(self) -> bool:
        return self.quiz_best is not None and self.quiz_best >= QUIZ_PASS

    @property
    def completed(self) -> bool:
        return self.simulation_done and self.quiz_passed

    @property
    def percent(self) -> int:
        return (50 if self.simulation_done else 0) + (50 if self.quiz_passed else 0)


@dataclass
class ScenarioInfo:
    slug: str
    module: str
    title: str
    difficulty: int
    persona: str | None
    best_score: int | None = None


@dataclass
class Snapshot:
    onboarding_completed: bool
    persona_key: str | None
    learning_level: str
    initial_done: bool
    post_done: bool
    modules: list[ModuleProgress]
    scenarios: list[ScenarioInfo]
    mastery: dict[
        str, tuple[float, int, str | None]
    ]  # concept -> (mastery, evidence, misconception)


def concept_mastery(snapshot: Snapshot, concept: str) -> float | None:
    m = snapshot.mastery.get(concept)
    if m is None or m[1] == 0:
        return None
    return m[0]


def module_mastery(snapshot: Snapshot, module: ModuleProgress) -> float | None:
    values = [v for c in module.concepts if (v := concept_mastery(snapshot, c)) is not None]
    return sum(values) / len(values) if values else None


def target_difficulty(mastery: float | None, learning_level: str) -> int:
    if mastery is None:
        return LEVEL_DIFFICULTY.get(learning_level, 1)
    if mastery < 0.5:
        return 1
    if mastery < 0.8:
        return 2
    return 3


def _pick_scenario(
    snapshot: Snapshot, module: ModuleProgress, difficulty: int, *, include_done: bool = False
) -> ScenarioInfo | None:
    pool = [
        s
        for s in snapshot.scenarios
        if s.module == module.slug and (include_done or s.slug not in module.completed_scenarios)
    ]
    if not pool:
        return None
    return min(
        pool,
        key=lambda s: (
            abs(s.difficulty - difficulty),
            0 if s.persona in (snapshot.persona_key, None) else 1,
            0 if s.persona == snapshot.persona_key else 1,
            s.difficulty,
            s.slug,
        ),
    )


def _misconception_note(snapshot: Snapshot, module: ModuleProgress) -> str:
    for c in module.concepts:
        m = snapshot.mastery.get(c)
        if m and m[2] and m[0] < 0.5:
            label = MISCONCEPTIONS.get(m[2], m[2].replace("_", " "))
            return f" Earlier answers suggest {label}; this activity tackles that directly."
    return ""


def _level_word(d: int) -> str:
    return {1: "guided", 2: "standard", 3: "challenge"}[d]


def recommend(snapshot: Snapshot) -> dict[str, Any]:
    if not snapshot.onboarding_completed:
        return {
            "kind": "onboarding",
            "slug": None,
            "title": "Set up your profile",
            "reason": "Choose your language, level and a persona so activities feel relevant.",
        }
    if not snapshot.initial_done:
        return {
            "kind": "assessment",
            "slug": "initial",
            "title": "Starting point check",
            "reason": "A 12-question check helps us choose activities that match what you "
            "already know. It isn't graded.",
        }

    incomplete = [m for m in snapshot.modules if not m.completed]
    if incomplete:

        def sort_key(m: ModuleProgress):
            mm = module_mastery(snapshot, m)
            return (mm if mm is not None else 0.5, m.order)

        module = min(incomplete, key=sort_key)
        mm = module_mastery(snapshot, module)
        pillar = PILLAR_LABEL[module.pillar]
        if not module.simulation_done:
            difficulty = target_difficulty(mm, snapshot.learning_level)
            scenario = _pick_scenario(snapshot, module, difficulty)
            if scenario:
                if mm is None:
                    basis = f"Based on your chosen level, start {pillar} with a"
                else:
                    basis = f"Your {pillar} understanding is around {round(mm * 100)}%, so try a"
                return {
                    "kind": "scenario",
                    "slug": scenario.slug,
                    "title": scenario.title,
                    "pillar": module.pillar,
                    "difficulty": scenario.difficulty,
                    "reason": f"{basis} {_level_word(scenario.difficulty)} scenario."
                    + _misconception_note(snapshot, module),
                }
        if module.quiz_slug and not module.quiz_passed:
            return {
                "kind": "assessment",
                "slug": module.quiz_slug,
                "title": f"{module.title} quiz",
                "pillar": module.pillar,
                "reason": "You've practised with a simulation. The module quiz checks your "
                "understanding (60% completes the module)."
                if module.quiz_best is None
                else f"Your best quiz score is {module.quiz_best}%. Review the explanations "
                "and try again to complete the module.",
            }

    if not snapshot.post_done:
        return {
            "kind": "assessment",
            "slug": "post",
            "title": "Final check",
            "reason": "You've completed all four pillars. The final check shows how your "
            "understanding has changed since your starting point.",
        }

    weakest = sorted(
        (v, c)
        for c in {c for m in snapshot.modules for c in m.concepts}
        if (v := concept_mastery(snapshot, c)) is not None and v < 0.8
    )
    if weakest:
        value, concept = weakest[0]
        module = next(m for m in snapshot.modules if concept in m.concepts)
        scenario = _pick_scenario(snapshot, module, target_difficulty(value, "beginner"))
        scenario = scenario or _pick_scenario(snapshot, module, 1, include_done=True)
        if scenario:
            return {
                "kind": "scenario",
                "slug": scenario.slug,
                "title": scenario.title,
                "pillar": module.pillar,
                "difficulty": scenario.difficulty,
                "reason": f"Keep practising '{concept.replace('_', ' ')}' "
                f"(currently {round(value * 100)}%).",
            }

    untried = [
        s
        for s in snapshot.scenarios
        if not any(s.slug in m.completed_scenarios for m in snapshot.modules)
    ]
    if untried:
        s = max(untried, key=lambda x: (x.difficulty, x.slug))
        module = next(m for m in snapshot.modules if m.slug == s.module)
        return {
            "kind": "scenario",
            "slug": s.slug,
            "title": s.title,
            "pillar": module.pillar,
            "difficulty": s.difficulty,
            "reason": "You've shown strong understanding. Try this challenge for a new situation.",
        }
    return {
        "kind": "review",
        "slug": None,
        "title": "Review your progress",
        "reason": "You've completed every activity. Revisit any scenario to try different choices.",
    }
