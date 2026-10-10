"""A student belongs to one organisation; other organisations never see their data."""

from sqlalchemy import text

from app.core.db import SessionLocal
from tests.conftest import (
    answer_all,
    complete_budget,
    register_educator,
    register_onboarded,
    register_student,
)

PROFILE = "/api/v1/students/me/profile"
JOIN = "/api/v1/students/me/cohorts"


def new_cohort(client, org):
    h = register_educator(client, org)
    code = client.post("/api/v1/educator/cohorts", headers=h, json={"name": "Class A"}).json()
    return h, code["id"], code["join_code"]


def test_student_can_join_several_cohorts_of_the_same_organisation(client):
    h1, _, code1 = new_cohort(client, "Org A")
    _, _, code2 = new_cohort(client, "Org A")
    kid, _ = register_onboarded(client)
    assert client.post(JOIN, headers=kid, json={"join_code": code1}).status_code == 200
    r = client.post(JOIN, headers=kid, json={"join_code": code2})
    assert r.status_code == 200 and len(r.json()["cohorts"]) == 2


def test_joining_another_organisations_cohort_is_refused(client):
    _, _, code_a = new_cohort(client, "Org A")
    _, _, code_b = new_cohort(client, "Org B")
    kid, _ = register_onboarded(client)
    assert client.post(JOIN, headers=kid, json={"join_code": code_a}).status_code == 200
    r = client.post(JOIN, headers=kid, json={"join_code": code_b})
    # Indistinguishable from an unknown code, so codes cannot be probed across organisations.
    unknown = client.post(JOIN, headers=kid, json={"join_code": "ZZZZZZ"})
    assert r.status_code == 404 == unknown.status_code
    assert r.json() == unknown.json()
    profile = client.get(PROFILE, headers=kid).json()
    assert [c["name"] for c in profile["cohorts"]] == ["Class A"] and len(profile["cohorts"]) == 1
    with SessionLocal() as db:
        assert db.execute(text("SELECT count(*) FROM cohort_memberships")).scalar() == 1


def test_registering_with_a_code_binds_the_student_to_that_organisation(client):
    _, _, code_a = new_cohort(client, "Org A")
    _, _, code_b = new_cohort(client, "Org B")
    kid, user = register_student(client, join_code=code_a)
    assert user["organization_id"] is not None
    assert client.post(JOIN, headers=kid, json={"join_code": code_b}).status_code == 404


def test_other_organisation_educator_cannot_see_the_student(client):
    ha, cid_a, code_a = new_cohort(client, "Org A")
    hb, cid_b, _ = new_cohort(client, "Org B")
    kid, _ = register_onboarded(client, name="Zoya")
    client.post(JOIN, headers=kid, json={"join_code": code_a})
    complete_budget(client, kid)
    assert "Zoya" in client.get(f"/api/v1/educator/cohorts/{cid_a}/overview", headers=ha).text
    other = client.get(f"/api/v1/educator/cohorts/{cid_a}/overview", headers=hb)
    assert other.status_code == 404 and "Zoya" not in other.text
    assert "Zoya" not in client.get(f"/api/v1/educator/cohorts/{cid_b}/overview", headers=hb).text


def test_leaving_an_organisation_is_explicit_audited_and_removes_educator_access(client):
    ha, cid_a, code_a = new_cohort(client, "Org A")
    hb, cid_b, code_b = new_cohort(client, "Org B")
    kid, user = register_onboarded(client, name="Zoya")
    client.post(JOIN, headers=kid, json={"join_code": code_a})
    complete_budget(client, kid)
    leave = "/api/v1/students/me/organization/leave"
    assert (
        client.post(leave, headers=kid, json={"current_password": "wrong-pass"}).status_code == 403
    )
    r = client.post(leave, headers=kid, json={"current_password": "password123"})
    assert r.status_code == 200 and r.json()["cohorts"] == []
    assert "Zoya" not in client.get(f"/api/v1/educator/cohorts/{cid_a}/overview", headers=ha).text
    with SessionLocal() as db:
        row = db.execute(text("SELECT student_id, cohorts_left FROM organization_transfers")).one()
        assert str(row.student_id) == user["id"] and row.cohorts_left == 1
    # Only now can they join a different organisation.
    assert client.post(JOIN, headers=kid, json={"join_code": code_b}).status_code == 200
    assert "Zoya" in client.get(f"/api/v1/educator/cohorts/{cid_b}/overview", headers=hb).text


def test_educator_cannot_use_student_join_or_leave(client):
    h = register_educator(client, "Org A")
    assert client.post(JOIN, headers=h, json={"join_code": "ABCDEF"}).status_code == 403
    assert (
        client.post(
            "/api/v1/students/me/organization/leave", headers=h, json={"current_password": "x"}
        ).status_code
        == 403
    )


def test_assessment_data_stays_inside_the_approved_organisation(client):
    ha, cid_a, code_a = new_cohort(client, "Org A")
    hb, cid_b, _ = new_cohort(client, "Org B")
    kid, _ = register_onboarded(client, name="Zoya")
    client.post(JOIN, headers=kid, json={"join_code": code_a})
    answer_all(client, kid, "initial", correct=False)
    text_b = client.get(f"/api/v1/educator/cohorts/{cid_b}/overview", headers=hb).text
    assert "Zoya" not in text_b
    assert client.get(f"/api/v1/educator/cohorts/{cid_a}/overview", headers=hb).status_code == 404
