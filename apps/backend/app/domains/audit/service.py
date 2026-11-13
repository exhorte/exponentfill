"""Append-only, hash-chained audit trail. It records WHAT happened, never the personal data involved."""

from __future__ import annotations

import hashlib
import json
import uuid
from typing import Literal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.domains.audit.models import AuditEvent
from app.ports import Clock, KeyProvider

GENESIS = "0" * 64
# Metadata keys that must never be written: a value, a secret or a token would turn the audit trail into a leak.
FORBIDDEN_KEYS = {"value", "values", "password", "new_password", "current_password", "token", "secret", "email", "filename", "text", "snippet"}
MAX_STR = 120


def _clean(meta: dict[str, object] | None) -> dict[str, object]:
    out: dict[str, object] = {}
    for key, val in (meta or {}).items():
        if key.lower() in FORBIDDEN_KEYS:
            continue
        if isinstance(val, str):
            out[key] = val[:MAX_STR]
        elif isinstance(val, bool | int | float) or val is None:
            out[key] = val
        elif isinstance(val, list | tuple):
            out[key] = [str(v)[:MAX_STR] for v in val][:50]
    return out


def _digest(prev: str, e: AuditEvent) -> str:
    body = json.dumps(
        [e.user_ref, e.actor, e.action, e.subject_type, e.subject_id, e.outcome, e.meta, str(e.session_id), e.created_at.isoformat()],
        sort_keys=True,
        separators=(",", ":"),
        default=str,
    )
    return hashlib.sha256((prev + body).encode()).hexdigest()


class SqlAudit:
    def __init__(self, session: Session, keys: KeyProvider, clock: Clock) -> None:
        self._s = session
        self._keys = keys
        self._clock = clock

    def record(
        self,
        *,
        user_id: uuid.UUID | None,
        actor: Literal["user", "agent", "system"],
        action: str,
        subject_type: str | None = None,
        subject_id: str | None = None,
        outcome: str = "ok",
        meta: dict[str, object] | None = None,
        session_id: uuid.UUID | None = None,
    ) -> None:
        ref = self._keys.user_ref(user_id) if user_id else None
        prev = self._s.scalar(select(AuditEvent.hash).where(AuditEvent.user_ref == ref).order_by(AuditEvent.id.desc()).limit(1)) or GENESIS
        event = AuditEvent(
            user_ref=ref,
            actor=actor,
            action=action,
            subject_type=subject_type,
            subject_id=subject_id,
            outcome=outcome,
            meta=_clean(meta),
            session_id=session_id,
            created_at=self._clock.now(),
            prev_hash=prev,
            hash="",
        )
        event.hash = _digest(prev, event)
        self._s.add(event)
        self._s.flush()

    # --- reading (the user's own trail only) ---
    def events(self, user_id: uuid.UUID, *, limit: int = 100, before: int | None = None) -> list[AuditEvent]:
        q = select(AuditEvent).where(AuditEvent.user_ref == self._keys.user_ref(user_id))
        if before is not None:
            q = q.where(AuditEvent.id < before)
        return list(self._s.scalars(q.order_by(AuditEvent.id.desc()).limit(min(limit, 500))))

    def verify(self, user_id: uuid.UUID) -> dict[str, object]:
        ref = self._keys.user_ref(user_id)
        prev, count = GENESIS, 0
        for e in self._s.scalars(select(AuditEvent).where(AuditEvent.user_ref == ref).order_by(AuditEvent.id)):
            if e.prev_hash != prev or e.hash != _digest(prev, e):
                return {"valid": False, "events": count, "broken_at": e.id}
            prev, count = e.hash, count + 1
        return {"valid": True, "events": count, "broken_at": None}
