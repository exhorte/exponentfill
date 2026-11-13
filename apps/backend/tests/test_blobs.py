from datetime import timedelta

import pytest
from conftest import DATA, Env
from sqlalchemy import func, select

from app.adapters.db_blobs import DbBlobStore, StoredBlob
from app.api.deps import build_runtime
from app.config import Settings
from app.database import normalize_url


def test_database_blob_store_roundtrip_overwrite_and_missing(env: Env) -> None:
    store = DbBlobStore(env.runtime.db)  # type: ignore[arg-type]
    store.put("u1/d1/1", b"\x00\x01ciphertext")
    assert store.get("u1/d1/1") == b"\x00\x01ciphertext"
    store.put("u1/d1/1", b"replaced")  # same key: replaced, not duplicated
    assert store.get("u1/d1/1") == b"replaced"
    with env.runtime.db.session() as s:  # type: ignore[union-attr]
        assert s.scalar(select(func.count()).select_from(StoredBlob)) == 1
    with pytest.raises(FileNotFoundError):  # same exception as the file store
        store.get("nope")


def test_database_blob_store_delete_is_effective_and_idempotent(env: Env) -> None:
    store = DbBlobStore(env.runtime.db)  # type: ignore[arg-type]
    store.put("u/d/1", b"secret-bytes")
    store.delete("u/d/1")
    store.delete("u/d/1")  # deleting twice is fine
    with pytest.raises(FileNotFoundError):
        store.get("u/d/1")
    with env.runtime.db.session() as s:  # type: ignore[union-attr]
        assert s.scalar(select(func.count()).select_from(StoredBlob)) == 0


@pytest.mark.parametrize("key", ["", "/abs", "../escape", "a/../b", "x" * 201])
def test_database_blob_store_rejects_bad_keys(env: Env, key: str) -> None:
    store = DbBlobStore(env.runtime.db)  # type: ignore[arg-type]
    with pytest.raises(ValueError):
        store.put(key, b"x")


def test_documents_end_to_end_on_the_database_store(env: Env, alice) -> None:  # noqa: ANN001
    """The whole upload -> read -> delete -> purge flow with documents kept in the database: only ciphertext is stored, and the purge empties it."""
    from app.api.deps import build_services

    env.runtime.blobs = DbBlobStore(env.runtime.db)  # type: ignore[arg-type]
    pdf = (DATA / "cv_fr_simple.pdf").read_bytes()
    r = alice.post("/v1/vault/documents", files={"file": ("cv.pdf", pdf, "application/octet-stream")})
    assert r.status_code == 201, r.text
    doc_id = r.json()["id"]

    with env.runtime.db.session() as s:  # type: ignore[union-attr]
        rows = s.scalars(select(StoredBlob)).all()
        assert len(rows) == 1
        stored = bytes(rows[0].data)
        assert rows[0].size == len(stored)
        assert b"%PDF-" not in stored and b"camille" not in stored  # encrypted: the document is not readable in the database

    assert alice.get(f"/v1/vault/documents/{doc_id}/content").content == pdf  # decrypts back to the exact file

    assert alice.delete(f"/v1/vault/documents/{doc_id}?facts=keep").status_code == 204
    with env.runtime.db.session() as s:  # type: ignore[union-attr]
        assert s.scalar(select(func.count()).select_from(StoredBlob)) == 1  # still there during the grace period
        assert build_services(env.runtime, s).documents.purge_due(env.runtime.clock.now() + timedelta(days=30)) == 1
    with env.runtime.db.session() as s:  # type: ignore[union-attr]
        assert s.scalar(select(func.count()).select_from(StoredBlob)) == 0  # the purge removed the stored blob


def test_runtime_chooses_the_store_from_settings(tmp_path) -> None:  # noqa: ANN001
    base = dict(master_key="AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE=", password_hash_profile="fast")
    assert type(build_runtime(Settings(storage_dir=str(tmp_path), **base)).blobs).__name__ == "FileBlobStore"  # type: ignore[arg-type]
    db = build_runtime(Settings(blob_backend="db", database_url="sqlite+pysqlite:///:memory:", **base))  # type: ignore[arg-type]
    assert type(db.blobs).__name__ == "DbBlobStore"
    with pytest.raises(RuntimeError, match="EF_DATABASE_URL"):
        build_runtime(Settings(blob_backend="db", **base))  # type: ignore[arg-type]
    with pytest.raises(RuntimeError, match="SQLite is for tests only"):
        build_runtime(Settings(env="prod", database_url="sqlite+pysqlite:///:memory:", **base))  # type: ignore[arg-type]
    with pytest.raises(RuntimeError, match="unknown EF_BLOB_BACKEND"):
        build_runtime(Settings(blob_backend="s3", **base))  # type: ignore[arg-type]


@pytest.mark.parametrize(
    ("given", "expected"),
    [
        ("postgresql://u:p@dpg-x-a/db", "postgresql+psycopg://u:p@dpg-x-a/db"),
        ("postgres://u:p@dpg-x-a/db", "postgresql+psycopg://u:p@dpg-x-a/db"),
        ("postgresql+psycopg://u:p@h/db", "postgresql+psycopg://u:p@h/db"),
        ("sqlite+pysqlite:///:memory:", "sqlite+pysqlite:///:memory:"),
    ],
)
def test_database_url_is_normalised_for_the_psycopg_driver(given: str, expected: str) -> None:
    assert normalize_url(given) == expected
