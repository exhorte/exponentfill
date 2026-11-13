import re

from conftest import PASSWORD, Env


def test_register_login_session_logout(env: Env) -> None:
    c = env.register("a@example.com")
    assert c.get("/v1/auth/session").json()["user"]["email"] == "a@example.com"
    assert c.post("/v1/auth/logout").status_code == 204
    assert c.get("/v1/auth/session").status_code == 401
    other = env.client()
    r = other.post("/v1/auth/login", json={"email": "A@Example.com", "password": PASSWORD})  # e-mail is case-insensitive
    assert r.status_code == 200 and r.json()["csrf_token"]


def test_password_policy_and_duplicate_email(env: Env) -> None:
    c = env.client()
    assert c.post("/v1/auth/register", json={"email": "x@example.com", "password": "short"}).json()["error"]["code"] == "password_too_short"
    assert c.post("/v1/auth/register", json={"email": "x@example.com", "password": "x@example.com1234"}).status_code == 422
    assert c.post("/v1/auth/register", json={"email": "not-an-email", "password": PASSWORD}).json()["error"]["code"] == "invalid_email"
    env.register("dup@example.com")
    assert c.post("/v1/auth/register", json={"email": "DUP@example.com", "password": PASSWORD}).json()["error"]["code"] == "email_taken"


def test_lockout_after_repeated_failures_and_uniform_errors(env: Env) -> None:
    env.register("lock@example.com")
    c = env.client()
    codes = [c.post("/v1/auth/login", json={"email": "lock@example.com", "password": "wrong password 000"}).json()["error"]["code"] for _ in range(5)]
    assert set(codes) == {"invalid_credentials"}
    assert c.post("/v1/auth/login", json={"email": "lock@example.com", "password": PASSWORD}).json()["error"]["code"] == "account_locked"
    unknown = c.post("/v1/auth/login", json={"email": "nobody@example.com", "password": "whatever password 1"}).json()["error"]
    assert unknown["code"] == "invalid_credentials" and unknown["message"] == "Incorrect e-mail or password."


def test_password_reset_does_not_reveal_accounts_and_revokes_sessions(env: Env) -> None:
    c = env.register("reset@example.com")
    anon = env.client()
    known = anon.post("/v1/auth/password-reset/request", json={"email": "reset@example.com"})
    unknown = anon.post("/v1/auth/password-reset/request", json={"email": "ghost@example.com"})
    assert known.status_code == unknown.status_code == 202 and known.json() == unknown.json()
    assert env.outbox("password_reset", "ghost@example.com") == {}
    token = env.outbox("password_reset", "reset@example.com")["token"]
    assert anon.post("/v1/auth/password-reset/confirm", json={"token": token, "new_password": "short"}).status_code == 422
    new = "a brand new passphrase 99"
    assert anon.post("/v1/auth/password-reset/confirm", json={"token": token, "new_password": new}).status_code == 204
    assert anon.post("/v1/auth/password-reset/confirm", json={"token": token, "new_password": new}).status_code == 422  # single use
    assert c.get("/v1/auth/session").status_code == 401  # the old session was revoked
    assert anon.post("/v1/auth/login", json={"email": "reset@example.com", "password": new}).status_code == 200


def test_csrf_is_required_for_cookie_sessions_only(env: Env, alice) -> None:  # noqa: ANN001
    no_header = env.client()
    no_header.cookies.set("ef_session", alice.cookies.get("ef_session"))
    no_header.cookies.set("ef_csrf", alice.cookies.get("ef_csrf"))
    assert no_header.get("/v1/account").status_code == 200  # reads need no CSRF
    r = no_header.patch("/v1/account", json={"display_name": "Mallory"})
    assert r.status_code == 401 and r.json()["error"]["code"] == "csrf_failed"
    assert alice.patch("/v1/account", json={"display_name": "Alice"}).status_code == 200
    bad = env.client()
    bad.cookies.set("ef_session", alice.cookies.get("ef_session"))
    bad.cookies.set("ef_csrf", "forged-value")
    assert bad.patch("/v1/account", json={"display_name": "x"}, headers={"X-CSRF-Token": "forged-value"}).status_code == 401


def test_sessions_list_and_revocation(env: Env, alice) -> None:  # noqa: ANN001
    second = env.client()
    second.post("/v1/auth/login", json={"email": "alice@example.com", "password": PASSWORD})
    sessions = alice.get("/v1/auth/sessions").json()
    assert len(sessions) == 2 and sum(s["current"] for s in sessions) == 1
    other = next(s for s in sessions if not s["current"])
    assert alice.delete(f"/v1/auth/sessions/{other['id']}").status_code == 204
    assert second.get("/v1/auth/session").status_code == 401


def test_device_tokens_have_scopes_and_validation_needs_an_explicit_grant(env: Env, alice) -> None:  # noqa: ANN001
    r = alice.post("/v1/auth/devices", json={"label": "x", "scopes": ["vault.validate"]})
    assert r.status_code == 403 and r.json()["error"]["code"] == "device_validation_disabled"
    assert alice.post("/v1/auth/devices", json={"label": "x", "scopes": ["account.manage"]}).status_code == 422
    dev = env.device(alice)
    assert dev.get("/v1/vault/facts").status_code == 200
    assert dev.post("/v1/auth/devices", json={"label": "nested", "scopes": []}).status_code == 403  # a device cannot mint devices
    assert dev.put("/v1/privacy", json={"ai_sharing_mode": "none"}).status_code == 403


def test_change_password_and_account_update(env: Env, alice) -> None:  # noqa: ANN001
    assert alice.post("/v1/auth/password/change", json={"current_password": "wrong password 12345", "new_password": "another good passphrase 7"}).status_code == 401
    assert alice.post("/v1/auth/password/change", json={"current_password": PASSWORD, "new_password": "another good passphrase 7"}).status_code == 204
    assert alice.patch("/v1/account", json={"locale": "fr", "display_name": "Alice"}).json()["locale"] == "fr"
    token = env.outbox("verify_email", "alice@example.com")["token"]
    assert re.match(r"^efv_", token)
    assert env.client().post("/v1/auth/email/verify", json={"token": token}).status_code == 204
    assert alice.get("/v1/account").json()["email_verified"] is True
