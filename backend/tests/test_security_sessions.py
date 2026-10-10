"""Cookie sessions, CSRF, refresh rotation, logout, password change, re-authentication, limits."""

import pytest
from fastapi.testclient import TestClient

from app.core import ratelimit
from app.core.config import get_settings
from app.main import app
from tests.conftest import make_invite, make_org

A = "/api/v1/auth"
PW = "password123"


@pytest.fixture
def browser():
    """A cookie-jar client, i.e. what the SPA is: no bearer header, no token in any body."""
    with TestClient(app) as c:
        yield c


def signup(c, username="browser1", **extra):
    r = c.post(
        f"{A}/register/student", json={"username": username, "password": PW, "display_name": "B"}
    )
    assert r.status_code == 201, r.text
    return r


def csrf(c):
    return {"X-CSRF-Token": c.cookies.get("rr_csrf")}


def onboard_browser(c):
    r = c.put(
        "/api/v1/students/me/profile",
        headers=csrf(c),
        json={"grade": 12, "persona_key": "meera", "onboarding_completed": True},
    )
    assert r.status_code == 200, r.text


# --- cookie sessions --------------------------------------------------------------


def _flags(response):
    out = {}
    for line in response.headers.get_list("set-cookie"):
        name = line.split("=", 1)[0]
        out[name] = {p.strip().lower() for p in line.split(";")[1:]}
    return out


def test_login_sets_httponly_cookies_and_returns_no_token(browser):
    r = signup(browser)
    body = r.json()
    assert "access_token" not in body and body["csrf_token"]
    flags = _flags(r)
    assert "httponly" in flags["rr_access"] and "samesite=lax" in flags["rr_access"]
    assert "httponly" in flags["rr_refresh"] and "samesite=strict" in flags["rr_refresh"]
    assert "path=/api/v1/auth" in flags["rr_refresh"]  # refresh token is never sent elsewhere
    # The CSRF cookie must stay readable by the page; it is not a credential on its own.
    assert "httponly" not in flags["rr_csrf"]
    assert browser.get(f"{A}/me").status_code == 200


def test_cookies_are_secure_in_production(browser, monkeypatch):
    monkeypatch.setattr(get_settings(), "cookie_secure", True)
    r = signup(browser, "securecookie")
    assert all("secure" in f for f in _flags(r).values())


def test_cookie_requests_without_csrf_token_are_rejected(browser):
    signup(browser)
    r = browser.put("/api/v1/students/me/profile", json={"language": "hi"})
    assert r.status_code == 403 and r.json()["error"]["code"] == "csrf_failed"
    bad = browser.put(
        "/api/v1/students/me/profile", json={"language": "hi"}, headers={"X-CSRF-Token": "forged"}
    )
    assert bad.status_code == 403
    ok = browser.put("/api/v1/students/me/profile", json={"language": "hi"}, headers=csrf(browser))
    assert ok.status_code == 200
    assert browser.get(f"{A}/me").status_code == 200  # safe methods need no token


def test_csrf_token_of_another_session_does_not_work(browser):
    signup(browser, "victim1")
    with TestClient(app) as attacker:
        signup(attacker, "attacker1")
        stolen = csrf(attacker)
    r = browser.put("/api/v1/students/me/profile", json={"language": "hi"}, headers=stolen)
    assert r.status_code == 403


def test_foreign_origin_is_rejected_even_with_a_valid_token(browser):
    signup(browser)
    h = {**csrf(browser), "Origin": "https://evil.example"}
    r = browser.put("/api/v1/students/me/profile", json={"language": "hi"}, headers=h)
    assert r.status_code == 403 and r.json()["error"]["code"] == "csrf_failed"
    h = {**csrf(browser), "Origin": get_settings().cors_origins[0]}
    assert (
        browser.put("/api/v1/students/me/profile", json={"language": "hi"}, headers=h).status_code
        == 200
    )


def test_bearer_clients_skip_csrf_because_they_are_not_cookie_authenticated(client, student):
    r = client.put("/api/v1/students/me/profile", headers=student, json={"language": "hi"})
    assert r.status_code == 200


# --- refresh rotation, logout, revocation ----------------------------------------


def test_refresh_rotates_the_token_and_replay_revokes_the_session(browser):
    signup(browser)
    old = browser.cookies.get("rr_refresh")
    assert browser.post(f"{A}/refresh", headers=csrf(browser)).status_code == 200
    new = browser.cookies.get("rr_refresh")
    assert new != old
    # An attacker replays the stolen, already-rotated token.
    with TestClient(app) as thief:
        thief.cookies.set("rr_refresh", old, path="/api/v1/auth")
        sid = old.split(".")[0]
        from app.core import sessions

        headers = {"X-CSRF-Token": sessions.csrf_token(sid)}
        assert thief.post(f"{A}/refresh", headers=headers).status_code == 401
    # The reuse killed the whole session, including the legitimate holder's newest token.
    assert browser.post(f"{A}/refresh", headers=csrf(browser)).status_code == 401
    assert browser.get(f"{A}/me").status_code == 401


def test_refresh_requires_csrf_and_a_cookie(browser):
    signup(browser)
    assert browser.post(f"{A}/refresh").status_code == 403
    with TestClient(app) as nobody:
        assert nobody.post(f"{A}/refresh").status_code == 401


def test_logout_revokes_on_the_server_not_just_in_the_browser(browser):
    signup(browser)
    access = browser.cookies.get("rr_access")
    assert browser.post(f"{A}/logout", headers=csrf(browser)).status_code == 204
    # Even a copied access token is dead: the session row is what counts.
    with TestClient(app) as replay:
        r = replay.get(f"{A}/me", headers={"Authorization": f"Bearer {access}"})
        assert r.status_code == 401
    assert browser.get(f"{A}/me").status_code == 401


def test_logout_needs_csrf(browser):
    signup(browser)
    assert browser.post(f"{A}/logout").status_code == 403
    assert browser.get(f"{A}/me").status_code == 200


def test_expired_session_is_refused(browser):
    from sqlalchemy import text

    from app.core.db import SessionLocal

    signup(browser)
    with SessionLocal() as db:
        db.execute(text("UPDATE auth_sessions SET expires_at = now() - interval '1 minute'"))
        db.commit()
    assert browser.get(f"{A}/me").status_code == 401


def test_old_style_tokens_without_a_session_are_rejected(client):
    import jwt

    token = jwt.encode({"sub": "x", "exp": 9999999999}, get_settings().secret_key, "HS256")
    r = client.get(f"{A}/me", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 401


# --- password change ---------------------------------------------------------------


def test_password_change_revokes_every_other_session_and_keeps_this_one(browser):
    signup(browser, "pwuser1")
    with TestClient(app) as other_device:
        other_device.post(f"{A}/login", json={"username": "pwuser1", "password": PW})
        assert other_device.get(f"{A}/me").status_code == 200
        r = browser.post(
            f"{A}/password",
            headers=csrf(browser),
            json={"current_password": PW, "new_password": "brand-new-pass-9"},
        )
        assert r.status_code == 200
        assert other_device.get(f"{A}/me").status_code == 401  # revoked
    assert browser.get(f"{A}/me").status_code == 200  # this device continues
    assert (
        browser.post(f"{A}/login", json={"username": "pwuser1", "password": PW}).status_code == 401
    )
    ok = browser.post(f"{A}/login", json={"username": "pwuser1", "password": "brand-new-pass-9"})
    assert ok.status_code == 200


def test_password_change_needs_the_current_password(browser):
    signup(browser)
    r = browser.post(
        f"{A}/password",
        headers=csrf(browser),
        json={"current_password": "wrong-password", "new_password": "brand-new-pass-9"},
    )
    assert r.status_code == 403 and r.json()["error"]["code"] == "wrong_password"
    same = browser.post(
        f"{A}/password", headers=csrf(browser), json={"current_password": PW, "new_password": PW}
    )
    assert same.status_code == 422


# --- account deletion needs re-authentication -------------------------------------


def test_account_deletion_requires_the_current_password(browser):
    signup(browser, "doomed1")
    onboard_browser(browser)
    h = csrf(browser)
    assert browser.request("DELETE", "/api/v1/students/me", headers=h).status_code == 422
    wrong = browser.request(
        "DELETE", "/api/v1/students/me", headers=h, json={"current_password": "not-it-at-all"}
    )
    assert wrong.status_code == 403 and wrong.json()["error"]["code"] == "wrong_password"
    assert browser.get(f"{A}/me").status_code == 200  # still there
    ok = browser.request("DELETE", "/api/v1/students/me", headers=h, json={"current_password": PW})
    assert ok.status_code == 204
    assert browser.get(f"{A}/me").status_code == 401


# --- rate limiting --------------------------------------------------------------


@pytest.fixture
def tight(monkeypatch):
    s = get_settings()
    for name, value in dict(
        rl_login_ip=100, rl_login_user=3, rl_register_ip=3, rl_invite_ip=3, rl_invite_token=2,
        rl_join_ip=2, rl_join_student=2, rl_tutor_hour=2, rl_tutor_day=3, rl_password_user=2,
    ).items():  # fmt: skip
        monkeypatch.setattr(s, name, value)


def test_login_is_limited_per_ip_and_username(client, tight):
    from tests.conftest import register_student

    _, user = register_student(client)
    for _ in range(3):
        r = client.post(f"{A}/login", json={"username": user["username"], "password": "nope12345"})
        assert r.status_code == 401
    r = client.post(f"{A}/login", json={"username": user["username"], "password": PW})
    assert r.status_code == 429 and r.json()["error"]["code"] == "rate_limited"
    assert int(r.headers["retry-after"]) > 0
    # A different username from the same IP is a separate (ip+username) bucket.
    other = client.post(f"{A}/login", json={"username": "someone-else", "password": "x1234567"})
    assert other.status_code == 401


def test_login_ip_limit_applies_across_usernames(client, monkeypatch):
    s = get_settings()
    monkeypatch.setattr(s, "rl_login_ip", 3)
    codes = [
        client.post(f"{A}/login", json={"username": f"user{i}", "password": "x1234567"}).status_code
        for i in range(5)
    ]
    assert codes == [401, 401, 401, 429, 429]


def test_student_registration_is_limited_per_ip(client, tight):
    codes = []
    for i in range(5):
        r = client.post(
            f"{A}/register/student",
            json={"username": f"limited{i}", "password": PW, "display_name": "L"},
        )
        codes.append(r.status_code)
    assert codes == [201, 201, 201, 429, 429]


def test_invite_attempts_are_limited_per_token(client, tight, monkeypatch):
    monkeypatch.setattr(get_settings(), "rl_invite_ip", 100)
    body = {"username": "guesser1", "password": PW, "display_name": "G", "invite_token": "rri_bad"}
    codes = [client.post(f"{A}/register/educator", json=body).status_code for _ in range(4)]
    assert codes == [403, 403, 429, 429]


def test_invite_attempts_are_limited_per_ip(client, tight):
    codes = []
    for i in range(5):
        body = {
            "username": "guesser1",
            "password": PW,
            "display_name": "G",
            "invite_token": f"rri_{i}",
        }
        codes.append(client.post(f"{A}/register/educator", json=body).status_code)
    assert codes == [403, 403, 403, 429, 429]


def test_cohort_join_attempts_are_limited_per_student(client, tight):
    from tests.conftest import register_onboarded

    h, _ = register_onboarded(client)
    codes = [
        client.post(
            "/api/v1/students/me/cohorts", headers=h, json={"join_code": f"NOPE{i}X"}
        ).status_code
        for i in range(4)
    ]
    assert codes == [404, 404, 429, 429]


def test_limits_hold_across_instances_because_they_live_in_the_database(client, monkeypatch):
    monkeypatch.setattr(get_settings(), "rl_register_ip", 2)
    ratelimit.hit("register:ip", "testclient", 2, ratelimit.HOUR)  # "another API instance"
    ratelimit.hit("register:ip", "testclient", 2, ratelimit.HOUR)
    r = client.post(
        f"{A}/register/student", json={"username": "overlimit", "password": PW, "display_name": "L"}
    )
    assert r.status_code == 429


def test_rate_limit_keys_do_not_store_readable_identifiers(client, tight):
    from sqlalchemy import text

    from app.core.db import SessionLocal

    client.post(f"{A}/login", json={"username": "secretname", "password": "x1234567"})
    with SessionLocal() as db:
        keys = [r[0] for r in db.execute(text("SELECT key FROM rate_limit_counters"))]
    assert keys and not any("secretname" in k or "testclient" in k for k in keys)


def test_unauthenticated_and_forbidden_errors_keep_the_error_envelope(client):
    r = client.get(f"{A}/me")
    assert r.status_code == 401 and r.json()["error"]["code"] == "unauthorized"
    _, token = make_invite(make_org("Org A"))
    assert client.get("/api/v1/educator/cohorts").status_code == 401
