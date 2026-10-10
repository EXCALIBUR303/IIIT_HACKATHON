"""Banking Explorer: sourced content, safe answering, rewards, privacy."""

import json
import re

from app.content import loader
from tests.conftest import register_educator, register_student

URL = "/api/v1/banking-explorer"
ALLOWED_HOSTS = (
    "rbi.org.in",
    "rbikehtahai.rbi.org.in",
    "npci.org.in",
    "dicgc.org.in",
    "pib.gov.in",
)


def correct_key(stop_key):
    stop = next(s for s in loader.banking_explorer()["stops"] if s["key"] == stop_key)
    return next(o["key"] for o in stop["options"] if o["correct"])


def wrong_key(stop_key):
    stop = next(s for s in loader.banking_explorer()["stops"] if s["key"] == stop_key)
    return next(o["key"] for o in stop["options"] if not o["correct"])


def answer(client, h, stop, key):
    return client.post(f"{URL}/stops/{stop}/answer", headers=h, json={"selected": key})


def test_every_fact_stop_has_an_official_source_and_a_verification_date():
    doc = loader.banking_explorer()
    assert re.fullmatch(r"\d{4}-\d{2}-\d{2}", doc["last_verified"])
    assert "cannot open" in doc["disclaimer"] and "never asks for Aadhaar" in doc["disclaimer"]
    for stop in doc["stops"]:
        assert stop["sources"], stop["key"]
        for sid in stop["sources"]:
            url = doc["sources"][sid]["url"]
            assert url.startswith("https://")
            assert any(url.split("/")[2].endswith(h) for h in ALLOWED_HOSTS), url
            assert doc["sources"][sid]["checked"]
        assert sum(1 for o in stop["options"] if o["correct"]) == 1


def test_content_never_asks_for_sensitive_data():
    text = json.dumps(loader.banking_explorer()).lower()
    assert "enter your aadhaar" not in text and "type your pan" not in text
    for stop in loader.banking_explorer()["stops"]:
        assert "free text" not in stop and "input" not in stop  # multiple choice only


def test_journey_view_hides_answers_and_shows_sources(client, student):
    j = client.get(URL, headers=student).json()
    assert j["total"] == 7 and j["completed"] == 0 and j["last_verified"]
    raw = json.dumps(j)
    assert '"correct"' not in raw and "explanation" not in raw
    assert all(s["sources"] and s["sources"][0]["url"].startswith("https://") for s in j["stops"])


def test_wrong_answer_can_be_retried_and_pays_nothing(client, student):
    r = answer(client, student, "pin-otp", wrong_key("pin-otp")).json()
    assert r["correct"] is False and r["rewards"] == [] and r["explanation"]
    j = client.get(URL, headers=student).json()
    stop = next(s for s in j["stops"] if s["key"] == "pin-otp")
    assert stop["attempts"] == 1 and stop["completed"] is False
    r = answer(client, student, "pin-otp", correct_key("pin-otp")).json()
    assert r["correct"] and [x["amount"] for x in r["rewards"]] == [10]


def test_stop_reward_is_paid_once_and_journey_completion_pays_a_bonus(client, student):
    keys = [s["key"] for s in loader.banking_explorer()["stops"]]
    first = answer(client, student, keys[0], correct_key(keys[0])).json()
    again = answer(client, student, keys[0], correct_key(keys[0])).json()
    assert len(first["rewards"]) == 1 and again["rewards"] == []
    last = None
    for k in keys[1:]:
        last = answer(client, student, k, correct_key(k)).json()
    assert last["journey_complete"] is True
    assert any(r["rule_key"] == "explorer_complete" for r in last["rewards"])
    j = client.get(URL, headers=student).json()
    assert j["completed"] == j["total"]
    wallet = client.get("/api/v1/wallet", headers=student).json()
    assert wallet["balance"] == 10 * len(keys) + 25
    replay = answer(client, student, keys[-1], correct_key(keys[-1])).json()
    assert replay["rewards"] == []


def test_invalid_stop_and_option_rejected(client, student):
    assert answer(client, student, "no-such-stop", "a").status_code == 404
    assert answer(client, student, "pin-otp", "z").status_code == 422
    r = client.post(
        f"{URL}/stops/pin-otp/answer",
        headers=student,
        json={"selected": "a", "account_number": "123"},
    )
    assert r.status_code == 200  # unknown fields are ignored, never stored


def test_progress_is_private_and_student_only(client, student):
    answer(client, student, "pin-otp", correct_key("pin-otp"))
    other, _ = register_student(client)
    assert client.get(URL, headers=other).json()["completed"] == 0
    assert client.get(URL).status_code == 401
    assert client.get(URL, headers=register_educator(client)).status_code == 403


def test_answers_feed_concept_mastery_not_rewards_into_score(client, student):
    before = client.get("/api/v1/learning/status", headers=student).json()["score"]["total"]
    answer(client, student, "pin-otp", correct_key("pin-otp"))
    after = client.get("/api/v1/learning/status", headers=student).json()["score"]["total"]
    assert after == before  # the explorer adds mastery evidence, not reward-based score
    concepts = client.get("/api/v1/progress/me", headers=student).json()["concepts"]
    assert next(c for c in concepts if c["concept"] == "otp_pin_safety")["evidence_count"] >= 1
