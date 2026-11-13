from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class DocumentOut(BaseModel):
    id: uuid.UUID
    filename: str
    mime: str
    kind: str
    size: int
    sha256: str
    status: str
    status_reason: str | None
    doc_type: str
    doc_type_confidence: float
    page_count: int
    language: str | None
    version: int
    replaces_id: uuid.UUID | None
    uploaded_at: datetime
    deleted_at: datetime | None
    duplicate: bool = False


class DocumentPatch(BaseModel):
    doc_type: str = Field(pattern="^(cv|diploma|transcript|proof_of_address|id_document|payslip|contract|certificate|other|unknown)$")


class DocumentTextOut(BaseModel):
    text: str
    truncated: bool
    engine: str | None
    warnings: list[str]
