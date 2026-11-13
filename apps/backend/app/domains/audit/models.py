from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import JSON, Index, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base, BigIntPk, UtcDateTime


class AuditEvent(Base):
    """Append-only, hash-chained per user. NEVER holds a fact value, a password or a token."""

    __tablename__ = "audit_events"
    __table_args__ = (Index("ix_audit_user_ref_id", "user_ref", "id"),)

    id: Mapped[int] = mapped_column(BigIntPk, primary_key=True, autoincrement=True)
    # Pseudonymous reference (HMAC of the user id), deliberately WITHOUT a foreign key: it survives account purge.
    user_ref: Mapped[str | None] = mapped_column(String(64), nullable=True)
    actor: Mapped[str] = mapped_column(String(8))
    action: Mapped[str] = mapped_column(String(48))
    subject_type: Mapped[str | None] = mapped_column(String(24), nullable=True)
    subject_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    outcome: Mapped[str] = mapped_column(String(24), default="ok")
    meta: Mapped[dict[str, object]] = mapped_column(JSON, default=dict)
    session_id: Mapped[uuid.UUID | None] = mapped_column(nullable=True)
    created_at: Mapped[datetime] = mapped_column(UtcDateTime)
    prev_hash: Mapped[str] = mapped_column(String(64))
    hash: Mapped[str] = mapped_column(String(64))
