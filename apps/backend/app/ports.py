"""Ports: everything the identity / vault / documents domains need from the outside world.

A domain never imports an adapter. Adapters live in `app/adapters`; tests and other ExponentValue products
can plug their own (clock, mailer, blob store, key provider, extractor).
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import datetime
from typing import Literal, Protocol


class Clock(Protocol):
    def now(self) -> datetime: ...


class KeyProvider(Protocol):
    """Key hierarchy: a master key (KEK, outside the database) wraps one data key (DEK) per user."""

    def new_dek(self) -> bytes: ...
    def wrap_dek(self, dek: bytes, user_id: uuid.UUID) -> bytes: ...
    def unwrap_dek(self, wrapped: bytes, user_id: uuid.UUID) -> bytes: ...
    def user_ref(self, user_id: uuid.UUID) -> str:
        """Pseudonymous, stable reference of a user (HMAC): used by the audit trail, survives account deletion."""
        ...


@dataclass(frozen=True)
class Mail:
    to: str
    template: str
    payload: dict[str, str] = field(default_factory=dict)
    user_id: uuid.UUID | None = None


class Mailer(Protocol):
    def send(self, mail: Mail) -> None: ...


class BlobStore(Protocol):
    def put(self, key: str, data: bytes) -> None: ...
    def get(self, key: str) -> bytes: ...
    def delete(self, key: str) -> None:
        """Effective deletion: the content must not remain recoverable from the store."""
        ...


class AuditPort(Protocol):
    def record(
        self,
        *,
        user_id: uuid.UUID | None,
        actor: Literal["user", "agent", "system"],
        action: str,
        subject_type: str | None = None,
        subject_id: str | None = None,
        outcome: str = "ok",
        meta: dict[str, object] | None = None,
        session_id: uuid.UUID | None = None,
    ) -> None: ...


# --- Document extraction (ADR-010): knows nothing about the vault, classification or AI orchestration ---


@dataclass(frozen=True)
class Block:
    kind: Literal["heading", "paragraph", "list_item", "table", "other"]
    text: str
    page: int  # 1-based


@dataclass
class StructuredDocument:
    engine: str
    page_count: int
    blocks: list[Block] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    @property
    def text(self) -> str:
        return "\n".join(b.text for b in self.blocks)


class ExtractorUnavailable(RuntimeError):
    """The engine is not installed or cannot run here (never a reason to lose the document)."""


class DocumentExtractor(Protocol):
    name: str

    def supports(self, kind: str) -> bool: ...
    def extract(self, data: bytes, kind: str) -> StructuredDocument: ...
