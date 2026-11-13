from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class PrivacyOut(BaseModel):
    ai_sharing_mode: Literal["none", "structure_only", "selected"]
    ai_allowed_categories: list[str]
    document_retention_days: int | None
    audit_retention_days: int | None
    require_validation_for_sensitive: bool
    device_validation_allowed: bool
    updated_at: datetime


class PrivacyIn(BaseModel):
    ai_sharing_mode: Literal["none", "structure_only", "selected"]
    ai_allowed_categories: list[str] = Field(default_factory=list, max_length=20)
    document_retention_days: int | None = Field(default=None, ge=1, le=3650)
    audit_retention_days: int | None = Field(default=None, ge=30, le=3650)
    require_validation_for_sensitive: bool = True
    device_validation_allowed: bool = False


class AiPreviewIn(BaseModel):
    purpose: str = Field(min_length=1, max_length=64)


class AiPreviewItem(BaseModel):
    fact_id: str
    key: str
    category: str


class AiPreviewOut(BaseModel):
    mode: str
    purpose: str
    shareable: list[AiPreviewItem]
    excluded: dict[str, int]


class AiDisclosureOut(BaseModel):
    id: uuid.UUID
    purpose: str
    mode: str
    fact_ids: list[str]
    categories: list[str]
    created_at: datetime


class AuditEventOut(BaseModel):
    id: int
    actor: str
    action: str
    subject_type: str | None
    subject_id: str | None
    outcome: str
    meta: dict[str, object]
    created_at: datetime
