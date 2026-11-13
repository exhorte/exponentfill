"""Shared vocabulary of the identity / vault domains: errors, principal, and the enumerations of the contract.

The enumerations below are mirrored by `packages/shared-types` (zod); both sides are tested against
`packages/shared-types/contract/vault-enums.json`.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from enum import StrEnum
from typing import Literal


class Origin(StrEnum):
    DECLARED = "declared"  # typed by the user
    EXTRACTED = "extracted"  # read in a document
    INFERRED = "inferred"  # deduced (context, form, computation)


class Verification(StrEnum):
    NONE = "none"
    USER_CONFIRMED = "user_confirmed"
    DOCUMENT_BACKED = "document_backed"  # confirmed by the user AND supported by a source document


class ValidationStatus(StrEnum):
    PENDING_REVIEW = "pending_review"
    VALIDATED = "validated"
    REJECTED = "rejected"
    SUPERSEDED = "superseded"


class Sensitivity(StrEnum):
    NORMAL = "normal"
    SENSITIVE = "sensitive"


class Category(StrEnum):
    PERSONAL = "personal"
    CONTACT = "contact"
    PROFESSIONAL = "professional"
    ACADEMIC = "academic"
    SKILLS = "skills"
    CERTIFICATIONS = "certifications"
    EXPERIENCE = "experience"
    ADMINISTRATIVE = "administrative"
    OTHER = "other"


class TrustClass(StrEnum):
    DECLARED = "declared"
    EXTRACTED = "extracted"
    VERIFIED = "verified"
    INFERRED = "inferred"


class ValueType(StrEnum):
    TEXT = "text"
    DATE = "date"
    NUMBER = "number"
    BOOLEAN = "boolean"


class DocumentStatus(StrEnum):
    UPLOADED = "uploaded"
    EXTRACTING = "extracting"
    EXTRACTED = "extracted"
    NEEDS_REVIEW = "needs_review"
    NEEDS_OCR = "needs_ocr"
    FAILED = "failed"
    REPLACED = "replaced"
    DELETED = "deleted"


# --- scopes ---------------------------------------------------------------------------------------------------------
SCOPE_READ = "vault.read"
SCOPE_WRITE = "vault.write"
SCOPE_PROPOSE = "vault.propose"
SCOPE_VALIDATE = "vault.validate"
SCOPE_DOC_READ = "documents.read"
SCOPE_DOC_WRITE = "documents.write"
SCOPE_ACCOUNT = "account.manage"

WEB_SCOPES = frozenset({SCOPE_READ, SCOPE_WRITE, SCOPE_PROPOSE, SCOPE_VALIDATE, SCOPE_DOC_READ, SCOPE_DOC_WRITE, SCOPE_ACCOUNT})
DEVICE_ALLOWED_SCOPES = frozenset({SCOPE_READ, SCOPE_PROPOSE, SCOPE_VALIDATE, SCOPE_DOC_READ})
DEVICE_DEFAULT_SCOPES = frozenset({SCOPE_READ, SCOPE_PROPOSE, SCOPE_DOC_READ})


@dataclass(frozen=True)
class Principal:
    """Who is acting. Every service call receives one: isolation between users starts here."""

    user_id: uuid.UUID
    kind: Literal["web", "device"]
    scopes: frozenset[str]
    session_id: uuid.UUID
    actor: Literal["user", "agent"] = "user"

    def has(self, scope: str) -> bool:
        return scope in self.scopes

    @property
    def can_validate(self) -> bool:
        """R2: only a human validates. A web session, or a device the user explicitly granted `vault.validate`."""
        return self.actor == "user" and SCOPE_VALIDATE in self.scopes


class DomainError(Exception):
    status = 400
    code = "error"

    def __init__(self, message: str = "", *, code: str | None = None, details: dict[str, object] | None = None) -> None:
        super().__init__(message or self.code)
        self.message = message or self.code
        if code:
            self.code = code
        self.details = details or {}


class Unauthorized(DomainError):
    status = 401
    code = "unauthorized"


class Forbidden(DomainError):
    status = 403
    code = "forbidden"


class NotFound(DomainError):
    status = 404
    code = "not_found"


class Conflict(DomainError):
    status = 409
    code = "conflict"


class Invalid(DomainError):
    status = 422
    code = "invalid"


class TooManyRequests(DomainError):
    status = 429
    code = "too_many_requests"
