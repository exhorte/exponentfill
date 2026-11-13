"""Small adapters for the ports: clock, mailer (outbox table), file blob store."""

from __future__ import annotations

import os
from datetime import UTC, datetime
from pathlib import Path

from sqlalchemy.orm import Session

from app.domains.identity.models import EmailOutbox
from app.ports import Mail


class SystemClock:
    def now(self) -> datetime:
        return datetime.now(UTC)


class OutboxMailer:
    """Writes the message to the `email_outbox` table. No SMTP: a real mailer replaces this adapter at deployment."""

    def __init__(self, session: Session, clock: SystemClock | None = None) -> None:
        self._session = session
        self._clock = clock or SystemClock()

    def send(self, mail: Mail) -> None:
        self._session.add(EmailOutbox(user_id=mail.user_id, to_address=mail.to, template=mail.template, payload=dict(mail.payload), created_at=self._clock.now()))


class FileBlobStore:
    """Encrypted blobs on a local directory. `delete` overwrites the file before unlinking it."""

    def __init__(self, root: str | Path) -> None:
        self._root = Path(root).resolve()
        self._root.mkdir(parents=True, exist_ok=True)

    def _path(self, key: str) -> Path:
        path = (self._root / key).resolve()
        if self._root not in path.parents:
            raise ValueError("blob key escapes the storage directory")
        return path

    def put(self, key: str, data: bytes) -> None:
        path = self._path(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)

    def get(self, key: str) -> bytes:
        return self._path(key).read_bytes()

    def delete(self, key: str) -> None:
        path = self._path(key)
        if not path.exists():
            return
        size = path.stat().st_size
        with path.open("r+b") as handle:
            handle.write(os.urandom(size))
            handle.flush()
            os.fsync(handle.fileno())
        path.unlink()
        for parent in path.parents:
            if parent == self._root:
                break
            try:
                parent.rmdir()
            except OSError:
                break


class MemoryBlobStore:
    """In-memory store for tests."""

    def __init__(self) -> None:
        self.items: dict[str, bytes] = {}

    def put(self, key: str, data: bytes) -> None:
        self.items[key] = data

    def get(self, key: str) -> bytes:
        return self.items[key]

    def delete(self, key: str) -> None:
        self.items.pop(key, None)
