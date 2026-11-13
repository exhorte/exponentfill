"""The dependencies a service call needs, bundled. Services receive a `Ctx`; they never build adapters themselves."""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field

from sqlalchemy.orm import Session

from app.config import Settings
from app.domains.common import NotFound
from app.domains.identity.models import User
from app.ports import AuditPort, BlobStore, Clock, DocumentExtractor, KeyProvider, Mailer
from app.security.passwords import PasswordService


@dataclass
class Ctx:
    s: Session
    settings: Settings
    keys: KeyProvider
    clock: Clock
    mailer: Mailer
    blobs: BlobStore
    audit: AuditPort
    passwords: PasswordService
    extractors: list[DocumentExtractor] = field(default_factory=list)

    def user(self, user_id: uuid.UUID) -> User:
        u = self.s.get(User, user_id)
        if u is None:
            raise NotFound("user not found")
        return u

    def dek(self, user_id: uuid.UUID) -> bytes:
        return self.keys.unwrap_dek(self.user(user_id).data_key_wrapped, user_id)
