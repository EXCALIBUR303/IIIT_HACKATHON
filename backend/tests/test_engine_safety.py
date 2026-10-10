import pytest

from app.content import loader
from app.engine import safety
from app.engine.money import SimulationError


def messages(slug="safety-inbox-basics"):
    cfg = next(s for s in loader.scenarios() if s["slug"] == slug)["config"]
    return {m.id: m for m in safety.scenario_from_config(cfg)}


def test_all_safety_scenarios_valid_and_mix_genuine_messages():
    for s in loader.scenarios():
        if s["kind"] == "safety":
            msgs = safety.scenario_from_config(s["config"])
            assert any(m.verdict == "genuine" for m in msgs)
            assert any(m.verdict == "scam" for m in msgs)


def test_perfect_scam_answer_scores_100():
    m = messages()["lottery"]
    r = safety.evaluate_message(
        m, {"verdict": "scam", "flags": list(m.red_flags), "action": "report_block"}
    )
    assert r["score"] == 100 and r["verdict_correct"] and r["action_safe"]
    assert r["flags_missed"] == []


@pytest.mark.requires_private_content
def test_partial_flags_and_risky_action():
    m = messages()["kyc_block"]
    r = safety.evaluate_message(
        m, {"verdict": "scam", "flags": ["urgency"], "action": "follow_link"}
    )
    assert r["verdict_correct"] and not r["action_safe"]
    assert set(r["flags_missed"]) == {"suspicious_link", "impersonation"}
    assert r["score"] == 50 + round(30 * 0.5)  # precision 1, recall 1/3 -> F1 0.5
    assert any(f["tone"] == "negative" for f in r["feedback"])


def test_genuine_message_with_invented_flags_is_penalised():
    m = messages()["bank_otp"]
    clean = safety.evaluate_message(
        m, {"verdict": "genuine", "flags": [], "action": "proceed_normally"}
    )
    paranoid = safety.evaluate_message(
        m, {"verdict": "genuine", "flags": ["urgency", "too_good"], "action": "proceed_normally"}
    )
    assert clean["score"] == 100
    assert paranoid["score"] < clean["score"]


def test_public_message_hides_answers():
    pub = safety.public_message(messages()["lottery"])
    assert set(pub) == {"id", "channel", "sender", "body"}


@pytest.mark.parametrize(
    "payload",
    [
        {"verdict": "maybe", "flags": [], "action": "report_block"},
        {"verdict": "scam", "flags": ["aliens"], "action": "report_block"},
        {"verdict": "scam", "flags": [], "action": "dance"},
    ],
)
def test_invalid_answers_rejected(payload):
    with pytest.raises(SimulationError):
        safety.evaluate_message(messages()["lottery"], payload)


def test_summary():
    assert safety.summarize([]) == {"score": 0, "correct_verdicts": 0, "total": 0}


@pytest.mark.requires_private_content
def test_every_safety_scenario_validates_and_covers_the_required_scam_types():
    from app.content import loader
    from app.engine import safety

    seen_flags: set[str] = set()
    ids: set[str] = set()
    for sc in loader.scenarios():
        if sc["kind"] != "safety":
            continue
        messages = safety.scenario_from_config(sc["config"])  # raises on bad content
        for m in messages:
            assert m.id not in ids, f"duplicate message id {m.id}"
            ids.add(m.id)
            seen_flags.update(m.red_flags)
    # fake investment claims, advance fees, OTP/PIN requests, links, impersonation
    assert {
        "too_good",
        "upfront_fee",
        "asks_otp_pin",
        "suspicious_link",
        "impersonation",
    } <= seen_flags
    bodies = " ".join(
        m["body"].lower()
        for sc in loader.scenarios()
        if sc["kind"] == "safety"
        for m in sc["config"]["messages"]
    )
    assert "guaranteed" in bodies and "processing fee" in bodies and "scholarship" in bodies
