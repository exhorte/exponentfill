from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import JSON, BigInteger, Boolean, CheckConstraint, Float, ForeignKey, Index, Integer, LargeBinary, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base, UtcDateTime, new_id


class ProfileFact(Base):
    """One piece of knowledge about the user, with its provenance and its trust level. Values are never stored in clear."""

    __tablename__ = "profile_facts"
    __table_args__ = (
        CheckConstraint("verification_level = 'none' OR validated_at IS NOT NULL", name="ck_fact_verified_needs_validation"),
        CheckConstraint("sensitivity <> 'sensitive' OR ai_shareable = false", name="ck_fact_sensitive_not_ai_shareable"),
        CheckConstraint("origin IN ('declared','extracted','inferred')", name="ck_fact_origin"),
        CheckConstraint("validation_status IN ('pending_review','validated','rejected','superseded')", name="ck_fact_status"),
        CheckConstraint("verification_level IN ('none','user_confirmed','document_backed')", name="ck_fact_verification"),
        UniqueConstraint("user_id", "client_id", name="uq_fact_client_id"),
        Index("ix_fact_user_seq", "user_id", "seq"),
        Index("ix_fact_user_key", "user_id", "key", "group_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=new_id)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)
    category: Mapped[str] = mapped_column(String(24))
    key: Mapped[str] = mapped_column(String(64))
    group_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    value_type: Mapped[str] = mapped_column(String(10))
    value_encrypted: Mapped[bytes] = mapped_column(LargeBinary)
    value_fp: Mapped[str | None] = mapped_column(String(64), nullable=True)
    origin: Mapped[str] = mapped_column(String(10))
    verification_level: Mapped[str] = mapped_column(String(16), default="none")
    validation_status: Mapped[str] = mapped_column(String(16))
    sensitivity: Mapped[str] = mapped_column(String(10), default="normal")
    ai_shareable: Mapped[bool] = mapped_column(Boolean, default=False)
    confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    client_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    entered_at: Mapped[datetime] = mapped_column(UtcDateTime)
    extracted_at: Mapped[datetime | None] = mapped_column(UtcDateTime, nullable=True)
    validated_at: Mapped[datetime | None] = mapped_column(UtcDateTime, nullable=True)
    validated_by: Mapped[uuid.UUID | None] = mapped_column(nullable=True)
    version: Mapped[int] = mapped_column(Integer, default=1)
    seq: Mapped[int] = mapped_column(BigInteger, default=0)
    deleted_at: Mapped[datetime | None] = mapped_column(UtcDateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(UtcDateTime)
    updated_at: Mapped[datetime] = mapped_column(UtcDateTime)


class FactVersion(Base):
    __tablename__ = "fact_versions"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=new_id)
    fact_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("profile_facts.id"), index=True)
    version: Mapped[int] = mapped_column(Integer)
    value_encrypted: Mapped[bytes] = mapped_column(LargeBinary)
    origin: Mapped[str] = mapped_column(String(10))
    verification_level: Mapped[str] = mapped_column(String(16))
    validation_status: Mapped[str] = mapped_column(String(16))
    actor: Mapped[str] = mapped_column(String(8))
    reason: Mapped[str] = mapped_column(String(48))
    changed_at: Mapped[datetime] = mapped_column(UtcDateTime)


class FactSource(Base):
    """Where a fact comes from. Several sources can corroborate one fact."""

    __tablename__ = "fact_sources"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=new_id)
    fact_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("profile_facts.id"), index=True)
    document_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("documents.id"), index=True)
    locator: Mapped[dict[str, object]] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(UtcDateTime)


class Conflict(Base):
    __tablename__ = "conflicts"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=new_id)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)
    kind: Mapped[str] = mapped_column(String(16), default="contradiction")
    key: Mapped[str] = mapped_column(String(64))
    group_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    fact_a_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("profile_facts.id"))
    fact_b_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("profile_facts.id"))
    status: Mapped[str] = mapped_column(String(16), default="open")  # open | resolved | dismissed
    detected_at: Mapped[datetime] = mapped_column(UtcDateTime)
    resolved_at: Mapped[datetime | None] = mapped_column(UtcDateTime, nullable=True)
