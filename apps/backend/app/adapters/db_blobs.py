"""Encrypted blobs stored in the application database (ADR-024).

Why: a hosted API container has an ephemeral file system, and a persistent disk ties the service to one instance and to
file-ownership quirks. The blobs are ALREADY encrypted before they reach a `BlobStore` (per-document key, AAD bound to the
object), so keeping them in PostgreSQL adds no exposure, backs them up with the database, and keeps the API stateless.
Limit: one row per document (the upload cap is `max_upload_mb`, 20 by default); beyond that an object store is the right tool.
"""

from __future__ import annotations

import os
from datetime import datetime

from sqlalchemy import Integer, LargeBinary, String, delete, select, update
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base, Database, UtcDateTime
from app.ports import Clock

MAX_KEY = 200


class StoredBlob(Base):
    __tablename__ = "stored_blobs"

    key: Mapped[str] = mapped_column(String(MAX_KEY), primary_key=True)
    data: Mapped[bytes] = mapped_column(LargeBinary)
    size: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(UtcDateTime)


class DbBlobStore:
    """`BlobStore` on the database. Each call is its own transaction: a blob is never half-written."""

    def __init__(self, db: Database, clock: Clock | None = None) -> None:
        from app.adapters.basic import SystemClock

        self._db = db
        self._clock = clock or SystemClock()

    @staticmethod
    def _check(key: str) -> str:
        if not key or len(key) > MAX_KEY or key.startswith("/") or ".." in key.split("/"):
            raise ValueError("invalid blob key")
        return key

    def put(self, key: str, data: bytes) -> None:
        self._check(key)
        with self._db.session() as s:
            row = s.get(StoredBlob, key)
            if row is None:
                s.add(StoredBlob(key=key, data=data, size=len(data), created_at=self._clock.now()))
            else:
                row.data, row.size = data, len(data)

    def get(self, key: str) -> bytes:
        self._check(key)
        with self._db.session() as s:
            data = s.scalar(select(StoredBlob.data).where(StoredBlob.key == key))
        if data is None:
            raise FileNotFoundError(key)  # same exception as the file store
        return bytes(data)

    def delete(self, key: str) -> None:
        """Overwrite the content, then delete the row. PostgreSQL may keep dead tuples until VACUUM, and the provider's
        backups keep older copies until they expire: this is deletion from the live database, not forensic erasure."""
        self._check(key)
        with self._db.session() as s:
            size = s.scalar(select(StoredBlob.size).where(StoredBlob.key == key))
            if size is None:
                return
            s.execute(update(StoredBlob).where(StoredBlob.key == key).values(data=os.urandom(size)))
        with self._db.session() as s:
            s.execute(delete(StoredBlob).where(StoredBlob.key == key))
