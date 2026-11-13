from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Float, ForeignKey, Index, Integer, LargeBinary, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base, UtcDateTime, new_id


class Document(Base):
    __tablename__ = "documents"
    __table_args__ = (Index("ix_document_user_sha", "user_id", "sha256"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=new_id)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)
    filename_encrypted: Mapped[bytes] = mapped_column(LargeBinary)
    mime: Mapped[str] = mapped_column(String(80))
    kind: Mapped[str] = mapped_column(String(8))  # pdf | text | image
    size: Mapped[int] = mapped_column(Integer)
    sha256: Mapped[str] = mapped_column(String(64))
    storage_key: Mapped[str] = mapped_column(String(160))
    wrapped_key: Mapped[bytes] = mapped_column(LargeBinary)  # per-document DEK, wrapped by the user's DEK
    status: Mapped[str] = mapped_column(String(16), default="uploaded")
    status_reason: Mapped[str | None] = mapped_column(String(120), nullable=True)
    doc_type: Mapped[str] = mapped_column(String(24), default="unknown")
    doc_type_confidence: Mapped[float] = mapped_column(Float, default=0.0)
    page_count: Mapped[int] = mapped_column(Integer, default=0)
    language: Mapped[str | None] = mapped_column(String(8), nullable=True)
    version: Mapped[int] = mapped_column(Integer, default=1)
    replaces_id: Mapped[uuid.UUID | None] = mapped_column(nullable=True)
    uploaded_at: Mapped[datetime] = mapped_column(UtcDateTime)
    deleted_at: Mapped[datetime | None] = mapped_column(UtcDateTime, nullable=True)
    purge_after: Mapped[datetime | None] = mapped_column(UtcDateTime, nullable=True)


class DocumentExtraction(Base):
    __tablename__ = "document_extractions"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=new_id)
    document_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("documents.id"), index=True)
    engine: Mapped[str] = mapped_column(String(32))
    status: Mapped[str] = mapped_column(String(12))  # ok | failed
    text_encrypted: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)
    structured_encrypted: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)
    created_at: Mapped[datetime] = mapped_column(UtcDateTime)
