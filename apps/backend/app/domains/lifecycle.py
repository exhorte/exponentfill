"""Cross-domain contracts for account export, purge and AI sharing.

The privacy domain orchestrates these operations WITHOUT importing the vault or documents domains: each domain
registers a contributor that implements the protocols below (ports and adapters, ADR-019).
"""

from __future__ import annotations

import uuid
from collections.abc import Iterator
from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True)
class AiCandidate:
    """A fact that COULD be shared with a model, described without its value."""

    fact_id: str
    key: str
    category: str
    sensitive: bool
    validated: bool
    ai_shareable: bool


class LifecycleContributor(Protocol):
    name: str

    def export_data(self, user_id: uuid.UUID) -> dict[str, object]:
        """JSON-serialisable data of this domain for the user (values decrypted: it is the user's own export)."""
        ...

    def export_files(self, user_id: uuid.UUID) -> Iterator[tuple[str, bytes]]:
        """(path inside the archive, decrypted bytes) for the ZIP export. May be empty."""
        ...

    def purge_user(self, user_id: uuid.UUID) -> None:
        """Effective deletion of everything this domain holds for the user."""
        ...


class AiSharingSource(Protocol):
    def ai_candidates(self, user_id: uuid.UUID) -> list[AiCandidate]: ...


@dataclass
class ExtractedFact:
    """A fact proposed from a document (system actor). It never carries more trust than `extracted`."""

    key: str
    value: str | bool
    group_id: str | None
    confidence: float
    document_id: uuid.UUID
    locator: dict[str, object]
    origin: str = "extracted"


class FactProposer(Protocol):
    """What the documents domain needs from the vault, without importing it."""

    def propose_extracted(self, user_id: uuid.UUID, items: list[ExtractedFact]) -> list[object]: ...

    def detach_document(self, user_id: uuid.UUID, document_id: uuid.UUID, *, delete_orphans: bool) -> None: ...
