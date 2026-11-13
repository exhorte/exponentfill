import io
import json
import zipfile
from datetime import timedelta

import pytest
from conftest import DATA, PASSWORD, Env

from app.security import crypto


def _upload(client, name: str, data: bytes):  # noqa: ANN001, ANN202
    return client.post("/v1/vault/documents", files={"file": (name, data, "application/octet-stream")})


def _cv() -> bytes:
    return (DATA / "cv_fr_simple.pdf").read_bytes()


def test_cv_upload_classifies_extracts_and_PROPOSES_facts_with_sources(env: Env, alice) -> None:  # noqa: ANN001
    r = _upload(alice, "cv.pdf", _cv())
    assert r.status_code == 201, r.text
    doc = r.json()
    assert doc["kind"] == "pdf" and doc["doc_type"] == "cv" and doc["status"] == "needs_review" and doc["page_count"] == 1
    facts = alice.get(f"/v1/vault/documents/{doc['id']}/facts").json()
    by_key: dict[str, list[dict]] = {}
    for f in facts:
        by_key.setdefault(f["key"], []).append(f)
    assert by_key["contact.email"][0]["value"] == "camille.durand@example.com"
    assert "personal.first_name" in by_key and "personal.last_name" in by_key
    assert any(f["value"] == "Société Exemple SAS" for f in by_key.get("experience.company", []))
    assert any("Master Informatique" in f["value"] for f in by_key.get("academic.degree", []))
    # R1: nothing extracted is validated, verified or usable; everything is traceable.
    assert all(f["origin"] == "extracted" and f["validation_status"] == "pending_review" and f["verification_level"] == "none" and f["usable"] is False for f in facts)
    src = alice.get(f"/v1/vault/facts/{by_key['contact.email'][0]['id']}/sources").json()
    assert src[0]["document_id"] == doc["id"] and src[0]["locator"]["page"] == 1 and "camille.durand@example.com" in src[0]["locator"]["quote"]
    assert doc["language"] == "fr"


def test_validating_an_extracted_fact_with_its_document_makes_it_document_backed(alice) -> None:  # noqa: ANN001
    doc = _upload(alice, "cv.pdf", _cv()).json()
    f = next(x for x in alice.get(f"/v1/vault/documents/{doc['id']}/facts").json() if x["key"] == "contact.email")
    v = alice.post(f"/v1/vault/facts/{f['id']}/validate", json={"base_version": f["version"], "with_document": True}).json()
    assert v["verification_level"] == "document_backed" and v["trust_class"] == "verified" and v["usable"] is True


def test_duplicate_upload_and_content_roundtrip(env: Env, alice) -> None:  # noqa: ANN001
    first = _upload(alice, "cv.pdf", _cv())
    again = _upload(alice, "same.pdf", _cv())
    assert again.status_code == 200 and again.json()["duplicate"] is True and again.json()["id"] == first.json()["id"]
    assert alice.get(f"/v1/vault/documents/{first.json()['id']}/content").content == _cv()
    assert len(alice.get("/v1/vault/documents").json()) == 1
    # Files are encrypted at rest.
    assert all(b"%PDF-" not in blob and b"camille" not in blob for blob in env.blobs.items.values())


def test_unsupported_empty_and_oversized_files_are_refused(env: Env, alice) -> None:  # noqa: ANN001
    assert _upload(alice, "x.exe", b"MZ\x90\x00\x03\x00\x00\x00binary").json()["error"]["code"] == "unsupported_type"
    assert _upload(alice, "empty.txt", b"").json()["error"]["code"] == "empty_file"
    env.settings.max_upload_mb = 1
    assert _upload(alice, "big.txt", b"a" * (1024 * 1024 + 10)).json()["error"]["code"] == "file_too_large"
    img = _upload(alice, "scan.png", b"\x89PNG\r\n\x1a\n" + b"0" * 50)
    assert img.status_code == 201 and img.json()["status"] == "needs_ocr"


def test_text_document_and_manual_type_change(alice) -> None:  # noqa: ANN001
    note = "Attestation sur l'honneur\nJe soussigné Awa Diop, joignable à awa.diop@example.com, atteste ce qui suit."
    doc = _upload(alice, "note.md", note.encode()).json()
    assert doc["kind"] == "text" and doc["doc_type"] == "certificate"
    assert alice.patch(f"/v1/vault/documents/{doc['id']}", json={"doc_type": "contract"}).json()["doc_type_confidence"] == 1.0
    assert "awa.diop@example.com" in alice.get(f"/v1/vault/documents/{doc['id']}/text").json()["text"]


def test_replacing_a_document_corroborates_and_keeps_traceability(alice) -> None:  # noqa: ANN001
    doc = _upload(alice, "cv.pdf", _cv()).json()
    before = {f["id"] for f in alice.get(f"/v1/vault/documents/{doc['id']}/facts").json()}
    new = alice.put(f"/v1/vault/documents/{doc['id']}/content", files={"file": ("cv-v2.txt", b"Camille DURAND\ncamille.durand@example.com\n", "text/plain")}).json()
    assert new["version"] == 2 and new["replaces_id"] == doc["id"]
    listed = alice.get("/v1/vault/documents").json()
    assert [d["id"] for d in listed] == [new["id"]]  # the replaced version is hidden
    email = next(f for f in alice.get(f"/v1/vault/documents/{new['id']}/facts").json() if f["key"] == "contact.email")
    assert email["id"] in before and email["sources_count"] == 2  # same fact, now corroborated by two documents


@pytest.mark.parametrize("policy", ["keep", "detach", "delete"])
def test_deleting_a_document_applies_the_facts_policy_and_purge_removes_the_file(env: Env, alice, policy: str) -> None:  # noqa: ANN001
    doc = _upload(alice, "cv.pdf", _cv()).json()
    email = next(f for f in alice.get(f"/v1/vault/documents/{doc['id']}/facts").json() if f["key"] == "contact.email")
    alice.post(f"/v1/vault/facts/{email['id']}/validate", json={"base_version": email["version"], "with_document": True})
    assert alice.delete(f"/v1/vault/documents/{doc['id']}?facts={policy}").status_code == 204
    assert alice.get(f"/v1/vault/documents/{doc['id']}").status_code == 404
    after = alice.get(f"/v1/vault/facts/{email['id']}")
    if policy == "delete":
        assert after.status_code == 404
    else:
        assert after.json()["verification_level"] == ("document_backed" if policy == "keep" else "user_confirmed")
    # Effective purge after the grace period.
    from app.api.deps import build_services
    from app.domains.documents.service import DocumentService

    assert len(env.blobs.items) == 1
    with env.runtime.db.session() as s:  # type: ignore[union-attr]
        svc = build_services(env.runtime, s)
        assert isinstance(svc.documents, DocumentService)
        assert svc.documents.purge_due(env.runtime.clock.now() + timedelta(days=30)) == 1
    assert env.blobs.items == {}
    if policy == "keep":
        assert alice.get(f"/v1/vault/facts/{email['id']}").json()["sources_count"] == 0  # no dangling source after purge


def test_export_is_complete_and_zip_holds_the_original_files(env: Env, alice, bob, add_fact) -> None:  # noqa: ANN001
    add_fact(alice, "personal.first_name", "Awa")
    add_fact(bob, "personal.first_name", "BOB-SECRET-NAME")
    _upload(alice, "cv.pdf", _cv())
    data = alice.get("/v1/account/export").json()
    assert data["account"]["email"] == "alice@example.com"
    assert any(f["key"] == "personal.first_name" and f["value"] == "Awa" and f["history"] for f in data["facts"])
    assert data["documents"][0]["extracted_text"] and "BOB-SECRET-NAME" not in json.dumps(data)
    z = zipfile.ZipFile(io.BytesIO(alice.get("/v1/account/export.zip").content))
    names = z.namelist()
    assert "export.json" in names and any(n.startswith("documents/") and n.endswith("cv.pdf") for n in names)
    assert z.read(next(n for n in names if n.endswith("cv.pdf"))) == _cv()


def test_ai_sharing_defaults_to_nothing_and_never_includes_sensitive_facts(alice, add_fact) -> None:  # noqa: ANN001
    f1 = add_fact(alice, "personal.first_name", "Awa")
    add_fact(alice, "administrative.iban", "FR761234")
    preview = alice.post("/v1/privacy/ai-preview", json={"purpose": "draft-letter"}).json()
    assert preview["mode"] == "none" and preview["shareable"] == []
    alice.put("/v1/privacy", json={"ai_sharing_mode": "selected", "ai_allowed_categories": ["personal", "administrative"]})
    assert alice.post("/v1/privacy/ai-preview", json={"purpose": "x"}).json()["shareable"] == []  # fact not marked shareable
    alice.patch(f"/v1/vault/facts/{f1['id']}", json={"base_version": 1, "ai_shareable": True})
    preview = alice.post("/v1/privacy/ai-preview", json={"purpose": "x"}).json()
    assert [i["key"] for i in preview["shareable"]] == ["personal.first_name"] and preview["excluded"]["sensitive"] == 1
    assert alice.put("/v1/privacy", json={"ai_sharing_mode": "selected", "ai_allowed_categories": ["nope"]}).status_code == 422


def test_audit_chain_is_valid_has_no_values_and_detects_tampering(env: Env, alice, add_fact) -> None:  # noqa: ANN001
    add_fact(alice, "personal.first_name", "CANARY-VALUE-123")
    _upload(alice, "secret-name-CANARY.pdf", _cv())
    alice.patch("/v1/account", json={"display_name": "CANARY-DISPLAY"})
    events = alice.get("/v1/audit/events?limit=200").json()
    dump = json.dumps(events)
    assert "CANARY" not in dump and "alice@example.com" not in dump and "efs_" not in dump
    assert alice.get("/v1/audit/verify").json() == {"valid": True, "events": len(events), "broken_at": None}
    from sqlalchemy import text

    with env.runtime.db.session() as s:  # type: ignore[union-attr]
        s.execute(text("UPDATE audit_events SET action = 'tampered' WHERE id = (SELECT MIN(id) FROM audit_events)"))
    verdict = alice.get("/v1/audit/verify").json()
    assert verdict["valid"] is False and verdict["broken_at"] is not None


def test_account_deletion_has_a_grace_period_then_purges_everything(env: Env, alice, bob, add_fact) -> None:  # noqa: ANN001
    add_fact(alice, "personal.first_name", "Awa")
    add_fact(bob, "personal.first_name", "Bob")
    _upload(alice, "cv.pdf", _cv())
    assert alice.request("DELETE", "/v1/account", json={"password": "wrong wrong wrong 1"}).status_code == 401
    r = alice.request("DELETE", "/v1/account", json={"password": PASSWORD})
    assert r.status_code == 202 and r.json()["deletion_scheduled_for"]
    login = env.client().post("/v1/auth/login", json={"email": "alice@example.com", "password": PASSWORD})
    assert login.json()["user"]["status"] == "pending_deletion"  # cancellable during the grace period
    from sqlalchemy import func, select

    from app.api.deps import build_services
    from app.domains.identity.models import User
    from app.domains.vault.models import ProfileFact

    with env.runtime.db.session() as s:  # type: ignore[union-attr]
        svc = build_services(env.runtime, s)
        user = s.scalar(select(User).where(User.email == "alice@example.com"))
        svc.privacy.purge_account(user.id)
    with env.runtime.db.session() as s:  # type: ignore[union-attr]
        assert s.scalar(select(func.count()).select_from(User).where(User.email == "alice@example.com")) == 0
        assert s.scalar(select(func.count()).select_from(ProfileFact)) == 1  # only Bob's fact remains
    assert env.blobs.items == {}
    assert env.client().post("/v1/auth/login", json={"email": "alice@example.com", "password": PASSWORD}).status_code == 401


def test_cancelling_a_deletion_request(env: Env, alice) -> None:  # noqa: ANN001
    alice.request("DELETE", "/v1/account", json={"password": PASSWORD})
    c = env.client()
    c.post("/v1/auth/login", json={"email": "alice@example.com", "password": PASSWORD})
    c.headers["X-CSRF-Token"] = c.cookies.get("ef_csrf")
    assert c.post("/v1/account/deletion/cancel").status_code == 204
    assert c.get("/v1/account").json()["status"] == "active"


def test_crypto_roundtrip_context_binding_and_tampering() -> None:
    key = crypto.new_key()
    blob = crypto.encrypt(key, b"secret", b"ctx")
    assert crypto.decrypt(key, blob, b"ctx") == b"secret" and blob.count(b"secret") == 0
    for bad_key, bad_aad, bad_blob in ((crypto.new_key(), b"ctx", blob), (key, b"other", blob), (key, b"ctx", blob[:-1] + bytes([blob[-1] ^ 1]))):
        with pytest.raises(crypto.CryptoError):
            crypto.decrypt(bad_key, bad_blob, bad_aad)
    assert crypto.fingerprint(key, "a") == crypto.fingerprint(key, "a") != crypto.fingerprint(key, "b")


def test_no_cors_by_default_and_never_a_wildcard(env: Env) -> None:
    c = env.client()
    r = c.options("/v1/auth/login", headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "POST"})
    assert "access-control-allow-origin" not in r.headers
    from app.config import Settings

    assert Settings(dashboard_origins="*,https://ok.example").cors_origins == ["https://ok.example"]
