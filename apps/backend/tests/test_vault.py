import json
from uuid import uuid4

from conftest import Env


def test_r1_declared_by_the_user_vs_proposed_by_a_device(env: Env, alice, add_fact) -> None:  # noqa: ANN001
    mine = add_fact(alice, "personal.first_name", "Awa")
    assert (mine["origin"], mine["validation_status"], mine["verification_level"], mine["trust_class"]) == ("declared", "validated", "none", "declared")
    dev = env.device(alice)
    prop = add_fact(dev, "personal.last_name", "Diop")
    assert (prop["origin"], prop["validation_status"], prop["verification_level"], prop["trust_class"]) == ("inferred", "pending_review", "none", "inferred")
    assert prop["usable"] is False


def test_r2_only_a_human_validates(env: Env, alice, add_fact) -> None:  # noqa: ANN001
    dev = env.device(alice)
    prop = add_fact(dev, "contact.city", "Dakar")
    r = dev.post(f"/v1/vault/facts/{prop['id']}/validate", json={"base_version": prop["version"]})
    assert r.status_code == 403 and r.json()["error"]["code"] == "human_validation_required"
    assert dev.post(f"/v1/vault/facts/{prop['id']}/reject").status_code == 403
    # A device the user EXPLICITLY granted the scope to may validate (and the grant itself needs the privacy setting).
    alice.put("/v1/privacy", json={"ai_sharing_mode": "none", "device_validation_allowed": True})
    trusted = env.device(alice, ["vault.read", "vault.propose", "vault.validate"], "Trusted")
    ok = trusted.post(f"/v1/vault/facts/{prop['id']}/validate", json={"base_version": prop["version"]})
    assert ok.status_code == 200 and ok.json()["trust_class"] == "verified"
    # The refusal was audited.
    events = alice.get("/v1/audit/events?limit=50").json()
    assert any(e["action"] == "vault.fact.validated" and e["outcome"] == "refused" for e in events)


def test_validation_levels_and_trust_class(env: Env, alice, add_fact) -> None:  # noqa: ANN001
    dev = env.device(alice)
    p = add_fact(dev, "contact.city", "Lyon")
    v = alice.post(f"/v1/vault/facts/{p['id']}/validate", json={"base_version": p["version"]}).json()
    assert (v["validation_status"], v["verification_level"], v["trust_class"], v["usable"]) == ("validated", "user_confirmed", "verified", True)
    assert alice.post(f"/v1/vault/facts/{p['id']}/validate", json={"base_version": 1}).json()["error"]["code"] == "stale_version"


def test_r3_changing_a_value_makes_it_declared_and_unverified(alice, add_fact) -> None:  # noqa: ANN001
    f = add_fact(alice, "personal.first_name", "Awa")
    v = alice.post(f"/v1/vault/facts/{f['id']}/validate", json={"base_version": f["version"]}).json()
    assert v["trust_class"] == "verified"
    u = alice.patch(f"/v1/vault/facts/{f['id']}", json={"base_version": v["version"], "value": "Awa Marie"}).json()
    assert (u["origin"], u["verification_level"], u["trust_class"], u["value"]) == ("declared", "none", "declared", "Awa Marie")
    hist = alice.get(f"/v1/vault/facts/{f['id']}/history").json()
    assert [h["value"] for h in hist if h["reason"] in ("created", "value_changed")] == ["Awa", "Awa Marie"]
    assert alice.patch(f"/v1/vault/facts/{f['id']}", json={"base_version": 1, "value": "x"}).status_code == 409


def test_r5_secrets_are_never_stored(alice) -> None:  # noqa: ANN001
    for key in ("other.password", "administrative.card_number", "other.one_time_code", "other.cvv", "personal.pin"):
        r = alice.post("/v1/vault/facts", json={"key": key, "value": "x"})
        assert r.status_code == 422 and r.json()["error"]["code"] == "secret_not_storable", key
    assert alice.post("/v1/vault/facts", json={"key": "nocategory", "value": "x"}).json()["error"]["code"] == "invalid_key"
    assert alice.post("/v1/vault/facts", json={"key": "weird.thing", "value": "x"}).json()["error"]["code"] == "invalid_category"


def test_r6_sensitive_facts_are_masked_unconfirmed_and_never_shareable(alice, add_fact) -> None:  # noqa: ANN001
    f = add_fact(alice, "administrative.passport_number", "12AB34567")
    assert f["sensitivity"] == "sensitive" and f["masked"] is True and f["value"] is None
    assert f["usable"] is False  # sensitive and not confirmed
    assert alice.patch(f"/v1/vault/facts/{f['id']}", json={"base_version": f["version"], "ai_shareable": True}).json()["error"]["code"] == "sensitive_not_shareable"
    assert alice.post(f"/v1/vault/facts/{f['id']}/reveal").json()["value"] == "12AB34567"
    ok = alice.post(f"/v1/vault/facts/{f['id']}/validate", json={"base_version": f["version"]}).json()
    assert ok["usable"] is True and ok["value"] is None  # still masked in lists
    assert any(e["action"] == "vault.fact.revealed" for e in alice.get("/v1/audit/events").json())
    assert any(i["id"] == f["id"] for i in alice.get("/v1/vault/review").json()["facts"]) is False  # confirmed: no longer needs review


def test_r7_r8_contradictions_open_a_conflict_that_blocks_use(env: Env, alice, add_fact) -> None:  # noqa: ANN001
    mine = add_fact(alice, "contact.city", "Dakar")
    dev = env.device(alice)
    other = add_fact(dev, "contact.city", "Thiès")
    assert other["has_open_conflict"] is True
    assert alice.get(f"/v1/vault/facts/{mine['id']}").json()["usable"] is False  # R7: blocked until resolved
    conflicts = alice.get("/v1/vault/conflicts").json()
    assert len(conflicts) == 1 and conflicts[0]["key"] == "contact.city"
    assert alice.post(f"/v1/vault/conflicts/{conflicts[0]['id']}/resolve", json={"keep": "a"}).status_code == 204
    kept, lost = alice.get(f"/v1/vault/facts/{mine['id']}").json(), alice.get(f"/v1/vault/facts/{other['id']}").json()
    assert kept["usable"] is True and lost["validation_status"] == "superseded"
    assert alice.get("/v1/vault/conflicts").json() == []


def test_multi_valued_keys_do_not_conflict_and_duplicates_are_refused(env: Env, alice, add_fact) -> None:  # noqa: ANN001
    add_fact(alice, "contact.email", "a@example.com")
    add_fact(alice, "contact.email", "b@example.com")
    assert alice.get("/v1/vault/conflicts").json() == []
    dup = alice.post("/v1/vault/facts", json={"key": "contact.email", "value": " A@EXAMPLE.com "})
    assert dup.status_code == 409 and dup.json()["error"]["code"] == "duplicate_fact"


def test_isolation_between_users(env: Env, alice, bob, add_fact) -> None:  # noqa: ANN001
    f = add_fact(alice, "personal.first_name", "Awa")
    for method, path, body in (
        ("get", f"/v1/vault/facts/{f['id']}", None),
        ("patch", f"/v1/vault/facts/{f['id']}", {"base_version": 1, "value": "Hacked"}),
        ("delete", f"/v1/vault/facts/{f['id']}", None),
        ("post", f"/v1/vault/facts/{f['id']}/validate", {"base_version": 1}),
        ("post", f"/v1/vault/facts/{f['id']}/reveal", None),
        ("get", f"/v1/vault/facts/{f['id']}/history", None),
        ("get", f"/v1/vault/documents/{uuid4()}", None),
    ):
        r = getattr(bob, method)(path, **({"json": body} if body else {}))
        assert r.status_code == 404, (method, path, r.status_code)
    assert bob.get("/v1/vault/facts").json()["items"] == []
    assert alice.get(f"/v1/vault/facts/{f['id']}").json()["value"] == "Awa"
    sync = bob.get("/v1/vault/sync?since=0").json()
    assert sync["changes"] == []


def test_delete_leaves_a_tombstone_and_erases_every_value(env: Env, alice, add_fact) -> None:  # noqa: ANN001
    f = add_fact(alice, "personal.first_name", "Awa")
    alice.patch(f"/v1/vault/facts/{f['id']}", json={"base_version": f["version"], "value": "Awa Marie"})
    assert alice.delete(f"/v1/vault/facts/{f['id']}").status_code == 204
    assert alice.get(f"/v1/vault/facts/{f['id']}").status_code == 404
    assert alice.get("/v1/vault/facts").json()["items"] == []
    tomb = [c for c in alice.get("/v1/vault/sync?since=0").json()["changes"] if c["id"] == f["id"]][0]
    assert tomb["deleted"] is True and tomb["value"] is None
    assert [h["value"] for h in alice.get(f"/v1/vault/facts/{f['id']}/history").json()] == [None, None]


def test_values_are_never_in_clear_in_the_database(env: Env, alice, add_fact) -> None:  # noqa: ANN001
    add_fact(alice, "personal.first_name", "CANARY-FIRST-NAME")
    with env.runtime.db.session() as s:  # type: ignore[union-attr]
        from sqlalchemy import text

        rows = s.execute(text("SELECT value_encrypted FROM profile_facts UNION ALL SELECT value_encrypted FROM fact_versions")).all()
    assert rows and all(b"CANARY" not in bytes(r[0]) for r in rows)


def test_sync_since_and_idempotent_push(env: Env, alice, add_fact) -> None:  # noqa: ANN001
    add_fact(alice, "personal.first_name", "Awa")
    first = alice.get("/v1/vault/sync?since=0").json()
    assert len(first["changes"]) == 1 and first["seq"] >= 1
    add_fact(alice, "personal.last_name", "Diop")
    later = alice.get(f"/v1/vault/sync?since={first['seq']}").json()
    assert [c["key"] for c in later["changes"]] == ["personal.last_name"]
    dev = env.device(alice)
    op = {"op": "create", "client_id": "offline-1", "key": "contact.city", "value": "Dakar"}
    r1 = dev.post("/v1/vault/sync/push", json={"ops": [op]}).json()["results"][0]
    r2 = dev.post("/v1/vault/sync/push", json={"ops": [op]}).json()["results"][0]
    assert (r1["status"], r2["status"]) == ("created", "exists") and r1["fact"]["id"] == r2["fact"]["id"]
    assert r1["fact"]["validation_status"] == "pending_review"  # a device only proposes
    upd = dev.post("/v1/vault/sync/push", json={"ops": [{"op": "delete", "client_id": "x", "id": r1["fact"]["id"]}]}).json()["results"][0]
    assert upd["status"] == "forbidden"
    # sensitive values never travel in a sync
    add_fact(alice, "administrative.iban", "FR7612345")
    assert all(c["value"] is None for c in alice.get("/v1/vault/sync?since=0").json()["changes"] if c["key"] == "administrative.iban")


def _fields(*specs: tuple[str, str, dict]) -> dict:
    return {"fields": [{"id": i, "semantic_type": s, **extra} for i, s, extra in specs]}


def test_match_decisions_fill_suggest_none(env: Env, alice, add_fact) -> None:  # noqa: ANN001
    add_fact(alice, "personal.first_name", "Awa")
    add_fact(alice, "personal.last_name", "Diop")
    dev = env.device(alice)
    add_fact(dev, "contact.city", "Dakar")  # proposed, not validated
    add_fact(alice, "contact.country", "Sénégal")
    add_fact(alice, "administrative.passport_number", "12AB34567")
    body = _fields(
        ("f1", "first_name", {}),
        ("f2", "city", {}),
        ("f3", "country", {"kind": "select", "options": ["France", "Senegal", "Canada"]}),
        ("f4", "country", {"kind": "select", "options": ["Sénégal", "Mali"]}),
        ("f5", "passport_number", {}),
        ("f6", "password", {}),
        ("f7", "iban", {}),
        ("f8", "consent", {}),
        ("f9", "full_name", {}),
        ("f10", "country", {"kind": "select", "options": ["France", "Canada"]}),
    )
    m = {x["field_id"]: x for x in dev.post("/v1/vault/match", json=body).json()["matches"]}
    assert m["f1"]["decision"] == "fill" and m["f1"]["candidates"][0]["value"] == "Awa"
    assert m["f2"]["decision"] == "suggest" and m["f2"]["reason"] == "pending_review"  # never auto-filled
    assert m["f3"]["decision"] == "fill" and m["f3"]["candidates"][0]["value"] == "Senegal"  # unique accent-insensitive match: the OPTION text is returned
    assert m["f4"]["decision"] == "fill" and m["f4"]["candidates"][0]["value"] == "Sénégal"
    assert m["f5"]["decision"] == "suggest" and m["f5"]["candidates"][0]["value"] is None  # sensitive, unconfirmed
    assert m["f6"] == {"field_id": "f6", "decision": "none", "reason": "secret", "candidates": []}
    assert m["f7"]["decision"] == "none" and m["f8"]["reason"] == "consent_requires_user"
    assert m["f10"]["decision"] == "suggest" and m["f10"]["reason"] == "no_matching_option"  # no option fits: never "the closest one"
    assert m["f9"]["decision"] == "fill" and m["f9"]["candidates"][0]["value"] == "Awa Diop"
    # No value appears in the audit trail of the match itself.
    audit = json.dumps(alice.get("/v1/audit/events?limit=100").json())
    assert "Awa" not in audit and "12AB34567" not in audit


def test_match_reveals_sensitive_only_on_request_when_confirmed(env: Env, alice, add_fact) -> None:  # noqa: ANN001
    f = add_fact(alice, "administrative.passport_number", "12AB34567")
    alice.post(f"/v1/vault/facts/{f['id']}/validate", json={"base_version": f["version"]})
    dev = env.device(alice)
    body = _fields(("p", "passport_number", {}))
    assert dev.post("/v1/vault/match", json=body).json()["matches"][0]["candidates"][0]["value"] is None
    revealed = dev.post("/v1/vault/match", json={**body, "reveal_sensitive": True}).json()["matches"][0]
    assert revealed["decision"] == "fill" and revealed["candidates"][0]["value"] == "12AB34567"


def test_a_conflict_downgrades_matching_to_suggest(env: Env, alice, add_fact) -> None:  # noqa: ANN001
    add_fact(alice, "contact.city", "Dakar")
    add_fact(env.device(alice), "contact.city", "Thiès")
    m = alice.post("/v1/vault/match", json=_fields(("c", "city", {}))).json()["matches"][0]
    assert m["decision"] == "suggest" and m["candidates"][0]["reason"] == "open_conflict"


def test_enum_contract_matches_the_shared_json() -> None:
    from pathlib import Path

    from app.domains import common

    path = Path(__file__).parents[3] / "packages" / "shared-types" / "contract" / "vault-enums.json"
    contract = json.loads(path.read_text(encoding="utf-8"))
    mapping = {
        "origin": common.Origin,
        "verification_level": common.Verification,
        "validation_status": common.ValidationStatus,
        "sensitivity": common.Sensitivity,
        "category": common.Category,
        "trust_class": common.TrustClass,
        "value_type": common.ValueType,
        "document_status": common.DocumentStatus,
    }
    for name, enum in mapping.items():
        assert contract[name] == [e.value for e in enum], name
    assert set(contract["scopes"]) == set(common.WEB_SCOPES)
