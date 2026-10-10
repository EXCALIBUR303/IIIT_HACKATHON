from tests.conftest import register_educator, register_student


def test_health(client):
    r = client.get("/api/health")
    assert r.json()["database"] is True


def test_register_login_me(client):
    headers, user = register_student(client, name="  Meera  ")
    assert user["display_name"] == "Meera" and user["role"] == "student"
    me = client.get("/api/v1/auth/me", headers=headers).json()
    assert me["id"] == user["id"]
    r = client.post(
        "/api/v1/auth/login", json={"username": user["username"].upper(), "password": "password123"}
    )
    assert r.status_code == 200


def test_duplicate_username_conflict(client):
    _, user = register_student(client)
    r = client.post(
        "/api/v1/auth/register/student",
        json={"username": user["username"], "password": "password123", "display_name": "X"},
    )
    assert r.status_code == 409
    assert r.json()["error"]["code"] == "username_taken"


def test_validation_error_envelope(client):
    r = client.post(
        "/api/v1/auth/register/student",
        json={"username": "a b", "password": "short", "display_name": ""},
    )
    assert r.status_code == 422
    err = r.json()["error"]
    assert err["code"] == "validation_error" and err["details"]


def test_wrong_password_and_missing_token(client):
    _, user = register_student(client)
    r = client.post(
        "/api/v1/auth/login", json={"username": user["username"], "password": "nope12345"}
    )
    assert r.status_code == 401 and r.json()["error"]["code"] == "invalid_credentials"
    assert client.get("/api/v1/auth/me").status_code == 401
    bad = client.get("/api/v1/auth/me", headers={"Authorization": "Bearer not.a.token"})
    assert bad.status_code == 401


def test_role_separation(client):
    student_headers, _ = register_student(client)
    educator_headers = register_educator(client)
    assert client.get("/api/v1/educator/cohorts", headers=student_headers).status_code == 403
    assert client.get("/api/v1/progress/me", headers=educator_headers).status_code == 403


def test_invalid_join_code(client):
    r = client.post(
        "/api/v1/auth/register/student",
        json={
            "username": "joiner",
            "password": "password123",
            "display_name": "J",
            "join_code": "NOPE99",
        },
    )
    assert r.status_code == 422 and r.json()["error"]["field"] == "join_code"
