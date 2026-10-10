"""Educator registration is bound to an organisation by an invitation, never by a typed name."""

from datetime import UTC, datetime, timedelta

from sqlalchemy import text

from app.core.db import SessionLocal
from tests.conftest import BEARER, make_invite, make_org

REGISTER = "/api/v1/auth/register/educator"


def _body(token, username="teacher1", **extra):
    return {
        "username": username,
        "password": "password123",
        "display_name": "Teacher",
        "invite_token": token,
        **extra,
    }


def _register(client, token, username="teacher1"):
    return client.post(REGISTER, json=_body(token, username), headers=BEARER)


def _org_of(client, resp):
    headers = {"Authorization": f"Bearer {resp.json()['access_token']}"}
    return client.get("/api/v1/auth/me", headers=headers).json()["organization_id"]


def test_valid_invite_joins_only_its_own_organisation(client):
    org_a, org_b = make_org("Org A"), make_org("Org B")
    _, token_a = make_invite(org_a)
    r = _register(client, token_a)
    assert r.status_code == 201, r.text
    assert _org_of(client, r) == org_a != org_b


def test_org_a_invite_cannot_create_an_educator_in_org_b_even_if_asked_to(client):
    org_a, org_b = make_org("Org A"), make_org("Org B")
    _, token_a = make_invite(org_a)
    # Extra fields (the old way of choosing an organisation) are ignored, not honoured.
    r = client.post(
        REGISTER,
        json=_body(token_a, organization_name="Org B", organization_id=org_b),
        headers=BEARER,
    )
    assert r.status_code == 201
    assert _org_of(client, r) == org_a


def test_organisation_name_alone_grants_nothing(client):
    make_org("Victim NGO")
    r = client.post(
        REGISTER,
        json={
            "username": "attacker",
            "password": "password123",
            "display_name": "A",
            "organization_name": "Victim NGO",
        },
        headers=BEARER,
    )
    assert r.status_code == 422  # invite_token is required; no organisation can be named
    with SessionLocal() as db:
        assert db.execute(text("SELECT count(*) FROM users")).scalar() == 0


def test_old_shared_invite_code_is_gone(client):
    make_org("Victim NGO")
    for code in ("dev-educator-invite", "test-invite", "anything"):
        r = _register(client, code)
        assert r.status_code == 403 and r.json()["error"]["code"] == "invalid_invite"


def test_invite_is_single_use_by_default(client):
    _, token = make_invite(make_org("Org A"))
    assert _register(client, token, "first").status_code == 201
    assert _register(client, token, "second").status_code == 403


def test_multi_use_invite_stops_at_its_limit(client):
    _, token = make_invite(make_org("Org A"), uses=2)
    assert _register(client, token, "one").status_code == 201
    assert _register(client, token, "two").status_code == 201
    assert _register(client, token, "three").status_code == 403


def test_expired_revoked_unknown_and_malformed_fail_identically(client):
    org = make_org("Org A")
    expired_id, expired = make_invite(org)
    revoked_id, revoked = make_invite(org)
    used_id, used = make_invite(org)
    with SessionLocal() as db:
        db.execute(
            text("UPDATE educator_invites SET expires_at = :t WHERE id = :i"),
            {"t": datetime.now(UTC) - timedelta(minutes=1), "i": expired_id},
        )
        db.execute(
            text("UPDATE educator_invites SET revoked_at = now() WHERE id = :i"), {"i": revoked_id}
        )
        db.commit()
    assert _register(client, used, "usr1").status_code == 201
    seen = set()
    for token in (expired, revoked, used, "rri_unknown", "x", "  ", "a" * 100):
        r = _register(client, token, "victim")
        assert r.status_code in (403, 422)
        if r.status_code == 403:
            seen.add((r.status_code, r.json()["error"]["code"], r.json()["error"]["message"]))
    assert len(seen) == 1, seen  # same status, code and message for every failure cause


def test_taken_username_does_not_burn_the_invite(client):
    _, token = make_invite(make_org("Org A"))
    _, other = make_invite(make_org("Org A"))
    assert _register(client, other, "samename").status_code == 201
    r = _register(client, token, "samename")
    assert r.status_code == 409
    assert _register(client, token, "different").status_code == 201


def test_token_is_stored_hashed_only(client):
    org = make_org("Org A")
    _, token = make_invite(org)
    with SessionLocal() as db:
        stored = db.execute(text("SELECT token_hash FROM educator_invites")).scalar()
    assert token not in stored and len(stored) == 64


def test_educator_creates_and_revokes_invites_for_their_own_org_only(client):
    org_a, org_b = make_org("Org A"), make_org("Org B")
    _, ta = make_invite(org_a)
    _, tb = make_invite(org_b)
    ra = _register(client, ta, "edu_a")
    rb = _register(client, tb, "edu_b")
    ha = {"Authorization": f"Bearer {ra.json()['access_token']}"}
    hb = {"Authorization": f"Bearer {rb.json()['access_token']}"}
    made = client.post("/api/v1/educator/invites", headers=ha, json={"max_uses": 1}).json()
    assert made["token"].startswith("rri_") and made["status"] == "active"
    listed = client.get("/api/v1/educator/invites", headers=ha).json()
    assert all(i["token"] is None for i in listed)  # tokens are never listed again
    assert client.delete(f"/api/v1/educator/invites/{made['id']}", headers=hb).status_code == 404
    colleague = _register(client, made["token"], "colleague")
    assert colleague.status_code == 201 and _org_of(client, colleague) == org_a
    again = client.post("/api/v1/educator/invites", headers=ha, json={}).json()
    assert client.delete(f"/api/v1/educator/invites/{again['id']}", headers=ha).status_code == 204
    assert _register(client, again["token"], "late").status_code == 403


def test_students_cannot_issue_invites(client, student):
    assert client.post("/api/v1/educator/invites", headers=student, json={}).status_code == 403
