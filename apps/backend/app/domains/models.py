"""Importing this module registers every table of the identity / vault domains on `Base.metadata`."""

from app.adapters.db_blobs import StoredBlob
from app.domains.audit.models import AuditEvent
from app.domains.documents.models import Document, DocumentExtraction
from app.domains.identity.models import AuthSession, EmailOutbox, OneTimeToken, User
from app.domains.privacy.models import AiDisclosure, PrivacyPreferences
from app.domains.vault.models import Conflict, FactSource, FactVersion, ProfileFact

__all__ = [
    "AiDisclosure",
    "AuditEvent",
    "AuthSession",
    "Conflict",
    "Document",
    "DocumentExtraction",
    "EmailOutbox",
    "FactSource",
    "FactVersion",
    "OneTimeToken",
    "PrivacyPreferences",
    "ProfileFact",
    "StoredBlob",
    "User",
]
