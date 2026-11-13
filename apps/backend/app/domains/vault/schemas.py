from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class SourceOut(BaseModel):
    document_id: uuid.UUID
    document_type: str | None = None
    locator: dict[str, object]
    created_at: datetime


class FactOut(BaseModel):
    id: uuid.UUID
    key: str
    category: str
    group_id: str | None
    value: str | bool | None  # None when masked (sensitive) or deleted
    masked: bool
    value_type: str
    origin: str
    verification_level: str
    validation_status: str
    sensitivity: str
    ai_shareable: bool
    confidence: float | None
    trust_class: str
    usable: bool
    has_open_conflict: bool
    sources_count: int
    entered_at: datetime
    extracted_at: datetime | None
    validated_at: datetime | None
    updated_at: datetime
    version: int
    seq: int
    deleted: bool


class FactList(BaseModel):
    items: list[FactOut]
    seq: int


class FactCreate(BaseModel):
    key: str = Field(max_length=64)
    value: str | int | float | bool
    value_type: str | None = Field(default=None, pattern="^(text|date|number|boolean)$")
    group_id: str | None = Field(default=None, max_length=64)
    client_id: str | None = Field(default=None, max_length=64)


class FactPatch(BaseModel):
    base_version: int
    value: str | int | float | bool | None = None
    group_id: str | None = Field(default=None, max_length=64)
    ai_shareable: bool | None = None


class ValidateIn(BaseModel):
    base_version: int
    with_document: bool = False


class VersionOut(BaseModel):
    version: int
    value: str | bool | None
    masked: bool
    origin: str
    verification_level: str
    validation_status: str
    actor: str
    reason: str
    changed_at: datetime


class RevealOut(BaseModel):
    value: str | bool | None


class ConflictSide(BaseModel):
    fact_id: uuid.UUID
    value: str | bool | None
    masked: bool
    trust_class: str
    validation_status: str


class ConflictOut(BaseModel):
    id: uuid.UUID
    kind: str
    key: str
    group_id: str | None
    status: str
    detected_at: datetime
    a: ConflictSide
    b: ConflictSide


class ResolveIn(BaseModel):
    keep: Literal["a", "b", "dismiss"]


class ReviewOut(BaseModel):
    facts: list[FactOut]
    conflicts: list[ConflictOut]


class RegistryItem(BaseModel):
    key: str
    category: str
    value_type: str
    multiple: bool
    sensitive: bool
    grouped: bool


# ----------------------------------------------------------------------------- matching (extension)
class MatchField(BaseModel):
    id: str = Field(max_length=64)
    semantic_type: str = Field(max_length=48)
    kind: str = Field(default="text", max_length=24)
    label: str | None = Field(default=None, max_length=200)
    options: list[str] | None = None
    section: str | None = Field(default=None, max_length=200)
    required: bool = False


class MatchIn(BaseModel):
    fields: list[MatchField] = Field(max_length=300)
    reveal_sensitive: bool = False


class Candidate(BaseModel):
    fact_id: uuid.UUID | None
    key: str
    value: str | bool | None
    trust_class: str
    validation_status: str
    usable: bool
    needs_confirmation: bool
    reason: str
    sources_count: int = 0


class FieldMatch(BaseModel):
    field_id: str
    decision: Literal["fill", "suggest", "none"]
    reason: str
    candidates: list[Candidate]


class MatchOut(BaseModel):
    matches: list[FieldMatch]
    seq: int


# ----------------------------------------------------------------------------- sync
class SyncOut(BaseModel):
    seq: int
    changes: list[FactOut]
    more: bool


class SyncOp(BaseModel):
    op: Literal["create", "update", "delete"]
    client_id: str = Field(max_length=64)
    id: uuid.UUID | None = None
    base_version: int | None = None
    key: str | None = None
    value: str | int | float | bool | None = None
    group_id: str | None = None


class SyncPushIn(BaseModel):
    ops: list[SyncOp] = Field(max_length=200)


class SyncResult(BaseModel):
    client_id: str
    status: Literal["created", "exists", "updated", "deleted", "conflict", "forbidden", "invalid"]
    fact: FactOut | None = None
    detail: str | None = None


class SyncPushOut(BaseModel):
    results: list[SyncResult]
    seq: int
