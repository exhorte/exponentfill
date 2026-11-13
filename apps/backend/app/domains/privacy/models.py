from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import JSON, Boolean, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base, UtcDateTime, new_id


class PrivacyPreferences(Base):
    __tablename__ = "privacy_preferences"

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), primary_key=True)
    # none: nothing is ever shared with a model. structure_only: form structure only (ADR-005). selected: opted-in categories.
    ai_sharing_mode: Mapped[str] = mapped_column(String(16), default="none")
    ai_allowed_categories: Mapped[list[str]] = mapped_column(JSON, default=list)
    document_retention_days: Mapped[int | None] = mapped_column(Integer, nullable=True)
    audit_retention_days: Mapped[int | None] = mapped_column(Integer, nullable=True)
    require_validation_for_sensitive: Mapped[bool] = mapped_column(Boolean, default=True)
    device_validation_allowed: Mapped[bool] = mapped_column(Boolean, default=False)
    updated_at: Mapped[datetime] = mapped_column(UtcDateTime)


class AiDisclosure(Base):
    """What was shared with an AI model, when and why. Fact ids only: never values."""

    __tablename__ = "ai_disclosures"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=new_id)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)
    purpose: Mapped[str] = mapped_column(String(64))
    mode: Mapped[str] = mapped_column(String(16))
    fact_ids: Mapped[list[str]] = mapped_column(JSON, default=list)
    categories: Mapped[list[str]] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(UtcDateTime)
