"""Financial safety engine (Pillar 4: Staying Financially Safe).

Educational objective: recognise scams and phishing, protect OTPs, PINs and
personal data, and choose a safe action. Legitimate messages are mixed in so
students learn to verify rather than distrust everything.

Scoring per message (0-100):
* Verdict correct (scam vs. genuine)   50
* Red-flag identification (F1 score)   30
* Safe action chosen                   20
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal

from .money import SimulationError

Verdict = Literal["scam", "genuine"]

RED_FLAGS: dict[str, dict[str, str]] = {
    "urgency": {
        "label": "Creates panic or urgency",
        "explanation": "Scammers rush you ('within 1 hour', 'account blocked today') so you act "
        "before thinking. Genuine organisations give you time.",
    },
    "asks_otp_pin": {
        "label": "Asks for OTP, PIN or password",
        "explanation": "No bank, app or official ever needs your OTP or UPI PIN. Sharing it "
        "hands over your money.",
    },
    "upfront_fee": {
        "label": "Asks for a fee to receive money or a job",
        "explanation": "Real prizes, scholarships and jobs never ask you to pay first.",
    },
    "too_good": {
        "label": "Too good to be true",
        "explanation": "Huge prizes, guaranteed high earnings or free expensive gadgets are bait.",
    },
    "suspicious_link": {
        "label": "Unknown or look-alike link",
        "explanation": "Look-alike web addresses (extra words, odd endings like .co or .xyz) "
        "imitate real sites to steal details.",
    },
    "impersonation": {
        "label": "Pretends to be someone trusted",
        "explanation": "Fraudsters pose as banks, officials, companies or relatives. Verify "
        "through a number or app you already know.",
    },
    "personal_info": {
        "label": "Requests personal documents or data",
        "explanation": "Aadhaar, PAN, photos and addresses can be misused for fraud or fake loans.",
    },
    "secrecy": {
        "label": "Asks you to keep it secret",
        "explanation": "'Don't tell anyone' isolates you from people who would spot the scam.",
    },
    "pin_to_receive": {
        "label": "Says you must enter a PIN or scan to RECEIVE money",
        "explanation": "On UPI you never enter your PIN or scan a QR code to receive money. "
        "PIN = money leaves your account.",
    },
    "excessive_permissions": {
        "label": "Wants access to contacts, photos or SMS",
        "explanation": "Illegal loan apps grab contacts and photos to harass and blackmail users.",
    },
}

ACTIONS: dict[str, dict[str, str]] = {
    "report_block": {"label": "Report and block the sender"},
    "verify_official": {"label": "Check through the official app, website or a trusted adult"},
    "ignore_delete": {"label": "Ignore and delete it"},
    "follow_link": {"label": "Click the link or open the app they suggest"},
    "share_details": {"label": "Reply with the details they ask for"},
    "pay_fee": {"label": "Pay the amount requested"},
    "proceed_normally": {"label": "It's genuine: act on it normally"},
}


@dataclass(frozen=True)
class Message:
    id: str
    channel: str
    sender: str
    body: str
    verdict: Verdict
    red_flags: tuple[str, ...]
    safe_actions: tuple[str, ...]
    best_action: str
    explanation: str


def scenario_from_config(config: dict[str, Any]) -> list[Message]:
    try:
        messages = [
            Message(
                id=m["id"],
                channel=m["channel"],
                sender=m["sender"],
                body=m["body"],
                verdict=m["verdict"],
                red_flags=tuple(m.get("red_flags", [])),
                safe_actions=tuple(m["safe_actions"]),
                best_action=m["best_action"],
                explanation=m["explanation"],
            )
            for m in config["messages"]
        ]
    except KeyError as exc:
        raise SimulationError(f"Safety scenario config missing {exc}", code="bad_config") from exc
    for m in messages:
        unknown = [f for f in m.red_flags if f not in RED_FLAGS]
        if unknown or m.verdict not in ("scam", "genuine"):
            raise SimulationError(f"Bad safety message {m.id}", code="bad_config")
        if m.best_action not in m.safe_actions or any(a not in ACTIONS for a in m.safe_actions):
            raise SimulationError(f"Bad actions for message {m.id}", code="bad_config")
    if len({m.id for m in messages}) != len(messages):
        raise SimulationError("Duplicate message ids", code="bad_config")
    return messages


def public_message(m: Message) -> dict[str, Any]:
    """What the student sees before answering (no answers leaked)."""
    return {"id": m.id, "channel": m.channel, "sender": m.sender, "body": m.body}


def catalog() -> dict[str, Any]:
    return {
        "red_flags": [{"key": k, "label": v["label"]} for k, v in RED_FLAGS.items()],
        "actions": [{"key": k, "label": v["label"]} for k, v in ACTIONS.items()],
    }


def evaluate_message(message: Message, raw: dict[str, Any]) -> dict[str, Any]:
    verdict = raw.get("verdict")
    if verdict not in ("scam", "genuine"):
        raise SimulationError("verdict must be 'scam' or 'genuine'", field="verdict")
    flags = raw.get("flags", [])
    if not isinstance(flags, list) or any(f not in RED_FLAGS for f in flags):
        raise SimulationError("flags must be a list of known red flags", field="flags")
    action = raw.get("action")
    if action not in ACTIONS:
        raise SimulationError("action must be one of the listed actions", field="action")

    chosen = set(flags)
    actual = set(message.red_flags)
    hits = chosen & actual
    missed = actual - chosen
    false_flags = chosen - actual
    if not actual and not chosen:
        flag_quality = 1.0
    else:
        precision = len(hits) / len(chosen) if chosen else 0.0
        recall = len(hits) / len(actual) if actual else 0.0
        flag_quality = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
        if not actual:  # genuine message: penalise each invented flag
            flag_quality = max(0.0, 1 - 0.34 * len(false_flags))

    verdict_ok = verdict == message.verdict
    action_ok = action in message.safe_actions
    score = (50 if verdict_ok else 0) + round(30 * flag_quality) + (20 if action_ok else 0)

    feedback: list[dict[str, str]] = []
    if verdict_ok:
        feedback.append(
            {
                "tone": "positive",
                "concept": "phishing_links"
                if message.verdict == "scam"
                else "personal_data_privacy",
                "message": "Correct: this message is "
                + ("a scam." if message.verdict == "scam" else "genuine."),
            }
        )
    else:
        feedback.append(
            {
                "tone": "negative",
                "concept": "phishing_links",
                "message": "This one is "
                + ("a scam. " if message.verdict == "scam" else "actually genuine. ")
                + message.explanation,
            }
        )
    for f in sorted(missed):
        feedback.append(
            {
                "tone": "caution",
                "concept": _concept_for_flag(f),
                "message": RED_FLAGS[f]["explanation"],
            }
        )
    if false_flags and not actual:
        feedback.append(
            {
                "tone": "caution",
                "concept": "phishing_links",
                "message": "Not every message is a trap. Checking through official channels "
                "is better than ignoring genuine information.",
            }
        )
    if not action_ok:
        feedback.append(
            {
                "tone": "negative",
                "concept": "otp_pin_safety",
                "message": f"'{ACTIONS[action]['label']}' is risky here. A safer choice: "
                f"{ACTIONS[message.best_action]['label']}.",
            }
        )

    evidence: dict[str, bool] = {}
    for f in actual:
        concept = _concept_for_flag(f)
        evidence[concept] = evidence.get(concept, True) and f in chosen and verdict_ok
    if not actual:
        evidence["phishing_links"] = verdict_ok

    return {
        "message_id": message.id,
        "verdict": verdict,
        "correct_verdict": message.verdict,
        "verdict_correct": verdict_ok,
        "flags_found": sorted(hits),
        "flags_missed": sorted(missed),
        "flags_incorrect": sorted(false_flags),
        "action": action,
        "action_safe": action_ok,
        "best_action": message.best_action,
        "explanation": message.explanation,
        "score": score,
        "feedback": feedback,
        "concept_evidence": evidence,
    }


def _concept_for_flag(flag: str) -> str:
    return {
        "asks_otp_pin": "otp_pin_safety",
        "pin_to_receive": "otp_pin_safety",
        "suspicious_link": "phishing_links",
        "impersonation": "phishing_links",
        "urgency": "phishing_links",
        "too_good": "too_good_offers",
        "upfront_fee": "too_good_offers",
        "personal_info": "personal_data_privacy",
        "excessive_permissions": "personal_data_privacy",
        "secrecy": "too_good_offers",
    }[flag]


def summarize(results: list[dict[str, Any]]) -> dict[str, Any]:
    if not results:
        return {"score": 0, "correct_verdicts": 0, "total": 0}
    return {
        "score": round(sum(r["score"] for r in results) / len(results)),
        "correct_verdicts": sum(1 for r in results if r["verdict_correct"]),
        "total": len(results),
    }
