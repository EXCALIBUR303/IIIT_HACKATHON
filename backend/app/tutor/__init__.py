"""Optional grounded AI tutor with a deterministic fallback.

The tutor explains concepts and a student's OWN simulation outcomes. It is
grounded on verified context (the concept glossary and the engine's stored
results). It never computes balances, never recommends real products and
never overrides simulation results. When no API key is configured, the SDK
is not installed, the call fails or the model declines, students get the
deterministic glossary explanation instead, so the platform always works.
"""

from __future__ import annotations

import logging
import re
from typing import Any

from app.content import loader
from app.core.config import get_settings

log = logging.getLogger(__name__)

DISCLAIMER = "RupeeRise explains ideas for learning. It does not recommend real financial products."

SYSTEM_PROMPT = """You are the RupeeRise tutor, helping Class 11-12 students in Hyderabad learn \
personal finance through fictional simulations.

Rules:
- Use only the VERIFIED CONTEXT provided. If it does not cover the question, say so briefly and \
suggest which RupeeRise activity to try.
- Never calculate or state new rupee figures. Quote numbers only if they appear in the context.
- Never recommend real banks, funds, shares, apps, crypto or any financial product, and never \
promise or predict returns. Simulations are assumptions, not promises.
- Never ask for personal or financial details.
- Answer in simple English a 16-year-old understands, in at most 120 words, with one everyday \
Indian example when helpful."""


def detect_concept(question: str) -> str | None:
    """Keyword match a question to a glossary concept (deterministic)."""
    text = question.lower()
    keywords = {
        "otp_pin_safety": ["otp", "pin", "upi pin"],
        "phishing_links": ["phishing", "link", "kyc", "fake website"],
        "too_good_offers": ["lottery", "prize", "job offer", "too good", "fee"],
        "personal_data_privacy": ["aadhaar", "privacy", "personal data", "permission"],
        "simple_vs_compound": ["simple interest", "compound interest"],
        "compounding": ["compounding", "start early", "snowball"],
        "diversification": ["diversif", "eggs", "basket"],
        "time_horizon": ["horizon", "how long", "need the money"],
        "risk_return": ["risk", "return", "guarantee"],
        "emergency_fund": ["emergency", "surprise", "unexpected"],
        "saving_habit": ["save", "saving", "habit"],
        "goal_setting": ["goal", "target"],
        "needs_vs_wants": ["need", "want"],
        "budget_allocation": ["budget", "allocate", "plan"],
    }
    for concept, words in keywords.items():
        if any(re.search(r"\b" + re.escape(w), text) for w in words):
            return concept
    return None


def build_context(concept: str | None, session_result: dict[str, Any] | None) -> list[str]:
    context: list[str] = []
    meta = loader.concept_map().get(concept or "")
    if meta:
        context.append(
            f"Concept '{meta['title']}': {meta['explanation']} Example: {meta['example']}"
        )
    if session_result:
        score = session_result.get("score")
        if score is not None:
            context.append(f"The student's simulation score was {score}/100.")
        # Caution/negative notes first: they explain what to improve.
        feedback = sorted(
            _session_feedback(session_result), key=lambda f: f.get("tone") == "positive"
        )
        for f in feedback[:6]:
            context.append(f"Engine feedback ({f.get('tone')}): {f.get('message')}")
    return context


def _session_feedback(session_result: dict[str, Any] | None) -> list[dict[str, Any]]:
    if not session_result:
        return []
    items = list(session_result.get("feedback", []))
    for nested in ("allocation", "outcome"):
        items += (session_result.get(nested) or {}).get("feedback", [])
    for message in session_result.get("messages", []):  # safety challenges
        items += message.get("feedback", [])
    return items


def concept_from_session(session_result: dict[str, Any] | None) -> str | None:
    """Pick the concept the student most needs help with: first caution/negative feedback."""
    feedback = _session_feedback(session_result)
    for f in feedback:
        if f.get("tone") in ("negative", "caution") and f.get("concept") in loader.concept_map():
            return f["concept"]
    return feedback[0]["concept"] if feedback else None


def fallback_answer(concept: str | None, context: list[str]) -> str:
    meta = loader.concept_map().get(concept or "")
    engine_notes = [c.split(": ", 1)[1] for c in context if c.startswith("Engine feedback")]
    score_note = next((c for c in context if c.startswith("The student's simulation score")), None)
    if score_note and engine_notes:
        parts = [score_note.replace("The student's", "Your")]
        parts.append("Here is what the simulation found: " + " ".join(engine_notes[:3]))
        if meta:
            parts.append(f"The key idea is {meta['title'].lower()}: {meta['explanation']}")
        return " ".join(parts)
    if meta:
        answer = f"{meta['explanation']} For example: {meta['example']}"
        engine_notes = [c.split(": ", 1)[1] for c in context if c.startswith("Engine feedback")]
        if engine_notes:
            answer += " In your simulation: " + " ".join(engine_notes[:2])
        return answer
    return (
        "I can explain budgeting, saving, investing basics and staying safe from scams. "
        "Try asking about needs vs wants, emergency funds, compound interest, "
        "diversification or OTP safety."
    )


def ask_model(question: str, context: list[str]) -> str | None:
    """Call Claude with grounded context. Returns None on any failure (caller falls back)."""
    settings = get_settings()
    if not settings.anthropic_api_key or not context:
        return None
    try:
        import anthropic
    except ImportError:
        log.info("anthropic SDK not installed; using deterministic tutor")
        return None
    client = anthropic.Anthropic(
        api_key=settings.anthropic_api_key,
        timeout=settings.tutor_timeout_seconds,
        max_retries=1,
    )
    verified = "\n".join(f"- {c}" for c in context)
    try:
        response = client.beta.messages.create(
            model=settings.tutor_model,
            max_tokens=4000,
            system=SYSTEM_PROMPT,
            output_config={"effort": settings.tutor_effort},
            # Server-side fallback: if the model declines a benign question, another model answers.
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
            messages=[
                {
                    "role": "user",
                    "content": f"VERIFIED CONTEXT:\n{verified}\n\nSTUDENT QUESTION:\n{question}",
                }
            ],
        )
    except anthropic.APIConnectionError:
        log.warning("Tutor API unreachable; using fallback")
        return None
    except anthropic.RateLimitError:
        log.warning("Tutor API rate limited; using fallback")
        return None
    except anthropic.APIStatusError as exc:
        log.warning("Tutor API error %s; using fallback", exc.status_code)
        return None
    if response.stop_reason == "refusal":
        return None
    text = "".join(b.text for b in response.content if b.type == "text").strip()
    return text or None


def answer(question: str, concept: str | None, session_result: dict[str, Any] | None) -> dict:
    concept = concept if concept in loader.concept_map() else detect_concept(question)
    if concept is None:
        concept = concept_from_session(session_result)
    context = build_context(concept, session_result)
    ai_text = ask_model(question, context)
    return {
        "answer": ai_text or fallback_answer(concept, context),
        "source": "ai" if ai_text else "fallback",
        "concept": concept,
        "grounded_on": context,
        "disclaimer": DISCLAIMER,
    }
