"""SQLAlchemy plumbing: portable types so the same models run on SQLite (tests) and PostgreSQL (production)."""

from __future__ import annotations

import uuid
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import UTC, datetime

from sqlalchemy import BigInteger, DateTime, Integer, TypeDecorator, create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker
from sqlalchemy.pool import StaticPool

# SQLite only autoincrements INTEGER primary keys.
BigIntPk = BigInteger().with_variant(Integer, "sqlite")


class Base(DeclarativeBase):
    pass


class UtcDateTime(TypeDecorator):
    """Always stores and returns timezone-aware UTC datetimes (SQLite would return naive ones)."""

    impl = DateTime(timezone=True)
    cache_ok = True

    def process_bind_param(self, value: datetime | None, dialect):  # type: ignore[no-untyped-def]
        if value is None:
            return None
        return (value.replace(tzinfo=UTC) if value.tzinfo is None else value).astimezone(UTC)

    def process_result_value(self, value: datetime | None, dialect):  # type: ignore[no-untyped-def]
        if value is None:
            return None
        return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)


def new_id() -> uuid.UUID:
    return uuid.uuid4()


def normalize_url(url: str) -> str:
    """Hosts hand out `postgres://` or `postgresql://` URLs: SQLAlchemy needs the psycopg 3 driver named explicitly."""
    for prefix in ("postgresql://", "postgres://"):
        if url.startswith(prefix):
            return "postgresql+psycopg://" + url.removeprefix(prefix)
    return url


class Database:
    def __init__(self, url: str) -> None:
        url = normalize_url(url)
        if url.startswith("sqlite"):
            # In-memory SQLite is per connection: share one for the whole process (tests).
            self.engine: Engine = create_engine(url, connect_args={"check_same_thread": False}, poolclass=StaticPool)
        else:
            self.engine = create_engine(url, pool_pre_ping=True)
        self._factory = sessionmaker(self.engine, expire_on_commit=False)

    def create_all(self) -> None:
        # Importing the models registers every table on Base.metadata.
        from app.domains import models  # noqa: F401

        Base.metadata.create_all(self.engine)

    @contextmanager
    def session(self) -> Iterator[Session]:
        s = self._factory()
        try:
            yield s
            s.commit()
        except Exception:
            s.rollback()
            raise
        finally:
            s.close()
