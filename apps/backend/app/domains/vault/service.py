"""The Personal Knowledge Vault: facts, provenance, trust, conflicts, matching, synchronisation.

The rules R1-R8 of the functional specification live HERE, not in the API layer:
  R1 extracted / inferred facts are born `pending_review`, verification `none`
  R2 only a human validates (principal.can_validate); an agent can only propose
  R3 changing a value makes the fact declared and unverified; the old value stays in the history
  R4 usable for filling = validated, no open conflict, not secret, and (sensitive => verification >= user_confirmed)
  R5 secrets are never stored (registry)
  R6 sensitive facts are never shareable with an AI and are masked unless explicitly revealed
  R7 an open conflict blocks the facts it concerns
  R8 nothing inferred replaces a validated value: a contradicting proposal opens a conflict
"""

from __future__ import annotations

import json
import uuid
from collections.abc import Iterator
from datetime import datetime

from sqlalchemy import func, or_, select, update

from app.domains.common import (
    SCOPE_PROPOSE,
    SCOPE_READ,
    Category,
    Forbidden,
    Invalid,
    NotFound,
    Origin,
    Principal,
    Sensitivity,
    TrustClass,
    ValidationStatus,
    Verification,
)
from app.domains.common import (
    Conflict as ConflictError,
)
from app.domains.context import Ctx
from app.domains.identity.models import User
from app.domains.lifecycle import AiCandidate, ExtractedFact
from app.domains.vault import registry
from app.domains.vault.models import Conflict, FactSource, FactVersion, ProfileFact
from app.domains.vault.schemas import (
    ConflictOut,
    ConflictSide,
    FactOut,
    SourceOut,
    SyncResult,
    VersionOut,
)
from app.security import crypto

ACTIVE = (ValidationStatus.PENDING_REVIEW.value, ValidationStatus.VALIDATED.value)


def trust_class(f: ProfileFact) -> TrustClass:
    if f.validation_status == ValidationStatus.VALIDATED and f.verification_level in (Verification.USER_CONFIRMED, Verification.DOCUMENT_BACKED):
        return TrustClass.VERIFIED
    if f.origin == Origin.DECLARED:
        return TrustClass.DECLARED
    if f.origin == Origin.EXTRACTED:
        return TrustClass.EXTRACTED
    return TrustClass.INFERRED


def is_usable(f: ProfileFact, *, has_open_conflict: bool) -> bool:
    """R4."""
    if f.deleted_at is not None or f.validation_status != ValidationStatus.VALIDATED or has_open_conflict:
        return False
    if f.sensitivity == Sensitivity.SENSITIVE and f.verification_level == Verification.NONE:
        return False
    return True


class VaultService:
    name = "vault"

    def __init__(self, ctx: Ctx) -> None:
        self.c = ctx
        self._deks: dict[uuid.UUID, bytes] = {}

    # ------------------------------------------------------------------ internals
    def _dek(self, user_id: uuid.UUID) -> bytes:
        if user_id not in self._deks:
            self._deks[user_id] = self.c.dek(user_id)
        return self._deks[user_id]

    def _enc(self, user_id: uuid.UUID, fact_id: uuid.UUID, value: str | bool, column: str = "value") -> bytes:
        return crypto.encrypt(self._dek(user_id), json.dumps({"v": value}).encode(), crypto.aad("fact", user_id, fact_id, column))

    def _dec(self, user_id: uuid.UUID, fact_id: uuid.UUID, blob: bytes, column: str = "value") -> str | bool | None:
        if not blob:
            return None
        return json.loads(crypto.decrypt(self._dek(user_id), blob, crypto.aad("fact", user_id, fact_id, column)))["v"]

    def _next_seq(self, user_id: uuid.UUID) -> int:
        row = self.c.s.execute(update(User).where(User.id == user_id).values(vault_seq=User.vault_seq + 1).returning(User.vault_seq)).one()
        return int(row[0])

    def _own(self, principal: Principal, fact_id: uuid.UUID, *, include_deleted: bool = False) -> ProfileFact:
        f = self.c.s.get(ProfileFact, fact_id)
        if f is None or f.user_id != principal.user_id or (f.deleted_at is not None and not include_deleted):
            raise NotFound("fact not found")  # 404, never 403: another user's ids must not be probeable
        return f

    def _need(self, principal: Principal, scope: str) -> None:
        if not principal.has(scope):
            raise Forbidden(f"This session lacks the '{scope}' scope.", code="missing_scope")

    def _open_conflict_fact_ids(self, user_id: uuid.UUID) -> set[uuid.UUID]:
        ids: set[uuid.UUID] = set()
        for a, b in self.c.s.execute(select(Conflict.fact_a_id, Conflict.fact_b_id).where(Conflict.user_id == user_id, Conflict.status == "open")):
            ids.update((a, b))
        return ids

    def _version(self, f: ProfileFact, value: str | bool | None, actor: str, reason: str) -> None:
        blob = self._enc(f.user_id, f.id, value, "version") if value is not None else b""
        self.c.s.add(
            FactVersion(
                fact_id=f.id,
                version=f.version,
                value_encrypted=blob,
                origin=f.origin,
                verification_level=f.verification_level,
                validation_status=f.validation_status,
                actor=actor,
                reason=reason,
                changed_at=self.c.clock.now(),
            )
        )

    def _touch(self, f: ProfileFact) -> None:
        f.updated_at = self.c.clock.now()
        f.seq = self._next_seq(f.user_id)

    def facts_from_document(self, principal: Principal, document_id: uuid.UUID) -> list[FactOut]:
        """Traceability, document -> facts."""
        self._need(principal, SCOPE_READ)
        conflict_ids = self._open_conflict_fact_ids(principal.user_id)
        rows = self.c.s.scalars(
            select(ProfileFact)
            .join(FactSource, FactSource.fact_id == ProfileFact.id)
            .where(ProfileFact.user_id == principal.user_id, FactSource.document_id == document_id, ProfileFact.deleted_at.is_(None))
            .order_by(ProfileFact.key)
        )
        return [self.to_out(f, conflict_ids=conflict_ids) for f in rows]

    def to_out(self, f: ProfileFact, *, reveal: bool = False, conflict_ids: set[uuid.UUID] | None = None) -> FactOut:
        conflict_ids = self._open_conflict_fact_ids(f.user_id) if conflict_ids is None else conflict_ids
        deleted = f.deleted_at is not None
        sensitive = f.sensitivity == Sensitivity.SENSITIVE
        masked = sensitive and not reveal and not deleted
        value = None if (masked or deleted) else self._dec(f.user_id, f.id, f.value_encrypted)
        n_sources = self.c.s.scalar(select(func.count()).select_from(FactSource).where(FactSource.fact_id == f.id)) or 0
        has_conflict = f.id in conflict_ids
        return FactOut(
            id=f.id,
            key=f.key,
            category=f.category,
            group_id=f.group_id,
            value=value,
            masked=masked,
            value_type=f.value_type,
            origin=f.origin,
            verification_level=f.verification_level,
            validation_status=f.validation_status,
            sensitivity=f.sensitivity,
            ai_shareable=f.ai_shareable,
            confidence=f.confidence,
            trust_class=trust_class(f).value,
            usable=is_usable(f, has_open_conflict=has_conflict),
            has_open_conflict=has_conflict,
            sources_count=int(n_sources),
            entered_at=f.entered_at,
            extracted_at=f.extracted_at,
            validated_at=f.validated_at,
            updated_at=f.updated_at,
            version=f.version,
            seq=f.seq,
            deleted=deleted,
        )

    # ------------------------------------------------------------------ create
    def create_fact(
        self,
        principal: Principal,
        *,
        key: str,
        value: object,
        value_type: str | None = None,
        group_id: str | None = None,
        client_id: str | None = None,
    ) -> tuple[ProfileFact, bool]:
        """Returns (fact, created). A web session declares (validated, unverified); any other caller only PROPOSES (R1, R2)."""
        spec = registry.resolve_key(key)
        vt = value_type or spec.value_type.value
        norm = registry.normalize_value(vt, value)
        now = self.c.clock.now()
        if client_id:  # idempotent create (offline queue)
            prev = self.c.s.scalar(select(ProfileFact).where(ProfileFact.user_id == principal.user_id, ProfileFact.client_id == client_id))
            if prev is not None:
                return prev, False
        declared = principal.kind == "web" and principal.has("vault.write") and principal.actor == "user"
        if not declared:
            self._need(principal, SCOPE_PROPOSE)
        fp = crypto.fingerprint(self._dek(principal.user_id), registry.canonical(vt, norm))
        existing = self._active_same_fp(principal.user_id, spec.key, group_id, fp)
        if existing is not None:
            raise ConflictError("This information is already in your vault.", code="duplicate_fact", details={"fact_id": str(existing.id)})
        f = ProfileFact(
            id=uuid.uuid4(),
            user_id=principal.user_id,
            category=spec.category,
            key=spec.key,
            group_id=group_id,
            value_type=vt,
            value_encrypted=b"",
            value_fp=fp,
            origin=Origin.DECLARED if declared else Origin.INFERRED,
            verification_level=Verification.NONE,
            validation_status=ValidationStatus.VALIDATED if declared else ValidationStatus.PENDING_REVIEW,
            sensitivity=registry.sensitivity_of(spec),
            ai_shareable=False,
            client_id=client_id,
            entered_at=now,
            validated_at=now if declared else None,
            validated_by=principal.user_id if declared else None,
            version=1,
            created_at=now,
            updated_at=now,
        )
        f.value_encrypted = self._enc(f.user_id, f.id, norm)
        self.c.s.add(f)
        self.c.s.flush()
        self._touch(f)
        self._version(f, norm, "user" if declared else "agent", "created")
        self._detect_conflicts(f, spec)
        self.c.audit.record(
            user_id=f.user_id,
            actor="user" if declared else "agent",
            action="vault.fact.created",
            subject_type="fact",
            subject_id=str(f.id),
            meta={"key": f.key, "origin": f.origin},
            session_id=principal.session_id,
        )
        return f, True

    def propose_extracted(self, user_id: uuid.UUID, items: list[ExtractedFact]) -> list[ProfileFact]:
        """System actor: facts read in a document. Born `pending_review`; identical values CORROBORATE instead of duplicating."""
        out: list[ProfileFact] = []
        now = self.c.clock.now()
        for it in items:
            try:
                spec = registry.resolve_key(it.key)
                norm = registry.normalize_value(spec.value_type.value, it.value)
            except Invalid:
                continue
            fp = crypto.fingerprint(self._dek(user_id), registry.canonical(spec.value_type.value, norm))
            same = self._active_same_fp(user_id, spec.key, it.group_id, fp)
            rejected = self.c.s.scalar(
                select(ProfileFact.id).where(
                    ProfileFact.user_id == user_id,
                    ProfileFact.key == spec.key,
                    ProfileFact.value_fp == fp,
                    ProfileFact.validation_status == ValidationStatus.REJECTED.value,
                    ProfileFact.deleted_at.is_(None),
                )
            )
            if rejected is not None and same is None:
                continue  # the user already said no to this value: do not nag
            if same is not None:
                if not self.c.s.scalar(select(FactSource.id).where(FactSource.fact_id == same.id, FactSource.document_id == it.document_id)):
                    self.c.s.add(FactSource(fact_id=same.id, document_id=it.document_id, locator=it.locator, created_at=now))
                    self._touch(same)
                out.append(same)
                continue
            f = ProfileFact(
                id=uuid.uuid4(),
                user_id=user_id,
                category=spec.category,
                key=spec.key,
                group_id=it.group_id,
                value_type=spec.value_type.value,
                value_encrypted=b"",
                value_fp=fp,
                origin=Origin(it.origin),
                verification_level=Verification.NONE,
                validation_status=ValidationStatus.PENDING_REVIEW,
                sensitivity=registry.sensitivity_of(spec),
                ai_shareable=False,
                confidence=it.confidence,
                entered_at=now,
                extracted_at=now,
                version=1,
                created_at=now,
                updated_at=now,
            )
            f.value_encrypted = self._enc(user_id, f.id, norm)
            self.c.s.add(f)
            self.c.s.flush()
            self.c.s.add(FactSource(fact_id=f.id, document_id=it.document_id, locator=it.locator, created_at=now))
            self._touch(f)
            self._version(f, norm, "agent", "extracted")
            self._detect_conflicts(f, spec)
            self.c.audit.record(
                user_id=user_id, actor="agent", action="vault.fact.created", subject_type="fact", subject_id=str(f.id), meta={"key": f.key, "origin": f.origin}
            )
            out.append(f)
        return out

    def _active_same_fp(self, user_id: uuid.UUID, key: str, group_id: str | None, fp: str) -> ProfileFact | None:
        q = select(ProfileFact).where(
            ProfileFact.user_id == user_id,
            ProfileFact.key == key,
            ProfileFact.value_fp == fp,
            ProfileFact.deleted_at.is_(None),
            ProfileFact.validation_status.in_(ACTIVE),
        )
        q = q.where(ProfileFact.group_id == group_id) if group_id is not None else q.where(ProfileFact.group_id.is_(None))
        return self.c.s.scalars(q).first()

    # ------------------------------------------------------------------ conflicts (R7, R8)
    def _detect_conflicts(self, f: ProfileFact, spec: registry.KeySpec) -> None:
        if spec.multiple:
            return
        q = select(ProfileFact).where(
            ProfileFact.user_id == f.user_id,
            ProfileFact.key == f.key,
            ProfileFact.id != f.id,
            ProfileFact.deleted_at.is_(None),
            ProfileFact.validation_status.in_(ACTIVE),
            ProfileFact.value_fp != f.value_fp,
        )
        q = q.where(ProfileFact.group_id == f.group_id) if f.group_id is not None else q.where(ProfileFact.group_id.is_(None))
        for other in self.c.s.scalars(q):
            exists = self.c.s.scalar(
                select(Conflict.id).where(
                    Conflict.status == "open",
                    or_((Conflict.fact_a_id == other.id) & (Conflict.fact_b_id == f.id), (Conflict.fact_a_id == f.id) & (Conflict.fact_b_id == other.id)),
                )
            )
            if exists is None:
                self.c.s.add(
                    Conflict(user_id=f.user_id, kind="contradiction", key=f.key, group_id=f.group_id, fact_a_id=other.id, fact_b_id=f.id, detected_at=self.c.clock.now())
                )

    def _close_stale_conflicts(self, f: ProfileFact) -> None:
        """After a fact changed or disappeared: conflicts that no longer hold are closed."""
        for c in self.c.s.scalars(
            select(Conflict).where(Conflict.user_id == f.user_id, Conflict.status == "open", or_(Conflict.fact_a_id == f.id, Conflict.fact_b_id == f.id))
        ):
            other = self.c.s.get(ProfileFact, c.fact_b_id if c.fact_a_id == f.id else c.fact_a_id)
            gone = f.deleted_at is not None or f.validation_status not in ACTIVE or other is None or other.deleted_at is not None or other.validation_status not in ACTIVE
            if gone or (other is not None and other.value_fp == f.value_fp):
                c.status, c.resolved_at = "resolved", self.c.clock.now()

    def conflicts(self, principal: Principal, *, status: str = "open") -> list[ConflictOut]:
        self._need(principal, SCOPE_READ)
        rows = self.c.s.scalars(select(Conflict).where(Conflict.user_id == principal.user_id, Conflict.status == status).order_by(Conflict.detected_at.desc()))
        return [self._conflict_out(c) for c in rows]

    def _conflict_out(self, c: Conflict) -> ConflictOut:
        def side(fid: uuid.UUID) -> ConflictSide:
            f = self.c.s.get(ProfileFact, fid)
            assert f is not None
            o = self.to_out(f)
            return ConflictSide(fact_id=f.id, value=o.value, masked=o.masked, trust_class=o.trust_class, validation_status=o.validation_status)

        return ConflictOut(id=c.id, kind=c.kind, key=c.key, group_id=c.group_id, status=c.status, detected_at=c.detected_at, a=side(c.fact_a_id), b=side(c.fact_b_id))

    def resolve_conflict(self, principal: Principal, conflict_id: uuid.UUID, keep: str) -> None:
        if not principal.can_validate:
            raise Forbidden("Only the user can resolve a conflict.", code="human_validation_required")
        c = self.c.s.get(Conflict, conflict_id)
        if c is None or c.user_id != principal.user_id or c.status != "open":
            raise NotFound("conflict not found")
        a, b = self.c.s.get(ProfileFact, c.fact_a_id), self.c.s.get(ProfileFact, c.fact_b_id)
        assert a is not None and b is not None
        if keep in ("a", "b"):
            winner, loser = (a, b) if keep == "a" else (b, a)
            loser.validation_status = ValidationStatus.SUPERSEDED
            loser.version += 1
            self._version(loser, self._dec(loser.user_id, loser.id, loser.value_encrypted), "user", "superseded")
            self._touch(loser)
            if winner.validation_status == ValidationStatus.PENDING_REVIEW:  # choosing it IS the human validation
                self._set_validated(winner, principal, with_document=False, reason="conflict_resolved")
            c.status = "resolved"
        else:
            c.status = "dismissed"  # both values are legitimate (e.g. two valid answers)
        c.resolved_at = self.c.clock.now()
        self.c.audit.record(
            user_id=principal.user_id,
            actor="user",
            action="vault.conflict.resolved",
            subject_type="conflict",
            subject_id=str(c.id),
            meta={"keep": keep},
            session_id=principal.session_id,
        )

    # ------------------------------------------------------------------ update / validate / reject / delete
    def update_fact(
        self, principal: Principal, fact_id: uuid.UUID, *, base_version: int, value: object | None = None, group_id: str | None = None, ai_shareable: bool | None = None
    ) -> ProfileFact:
        self._need(principal, "vault.write")
        f = self._own(principal, fact_id)
        if f.version != base_version:
            raise ConflictError("This information changed since you loaded it.", code="stale_version", details={"current_version": f.version})
        spec = registry.resolve_key(f.key)
        actor = "user"
        if value is not None:
            norm = registry.normalize_value(f.value_type, value)
            fp = crypto.fingerprint(self._dek(f.user_id), registry.canonical(f.value_type, norm))
            if fp != f.value_fp:
                dup = self._active_same_fp(f.user_id, f.key, group_id if group_id is not None else f.group_id, fp)
                if dup is not None and dup.id != f.id:
                    raise ConflictError("This information is already in your vault.", code="duplicate_fact", details={"fact_id": str(dup.id)})
                f.version += 1
                f.value_fp = fp
                f.value_encrypted = self._enc(f.user_id, f.id, norm)
                # R3: a user-typed value is a declaration, not yet verified.
                f.origin, f.verification_level, f.validation_status = Origin.DECLARED, Verification.NONE, ValidationStatus.VALIDATED
                f.validated_at, f.validated_by = self.c.clock.now(), principal.user_id
                self.c.s.query(FactSource).filter(FactSource.fact_id == f.id).delete()  # the old source no longer supports the new value
                self._version(f, norm, actor, "value_changed")
                self._touch(f)
                self._detect_conflicts(f, spec)
                self._close_stale_conflicts(f)
        if group_id is not None and group_id != f.group_id:
            f.group_id = group_id
            self._touch(f)
        if ai_shareable is not None:
            if ai_shareable and f.sensitivity == Sensitivity.SENSITIVE:
                raise Invalid("Sensitive information can never be shared with an AI.", code="sensitive_not_shareable")
            f.ai_shareable = ai_shareable
            self._touch(f)
        self.c.audit.record(
            user_id=f.user_id,
            actor="user",
            action="vault.fact.updated",
            subject_type="fact",
            subject_id=str(f.id),
            meta={"key": f.key, "version": f.version},
            session_id=principal.session_id,
        )
        return f

    def _set_validated(self, f: ProfileFact, principal: Principal, *, with_document: bool, reason: str) -> None:
        backed = with_document and self.c.s.scalar(select(func.count()).select_from(FactSource).where(FactSource.fact_id == f.id)) > 0
        f.validation_status = ValidationStatus.VALIDATED
        f.verification_level = Verification.DOCUMENT_BACKED if backed else Verification.USER_CONFIRMED
        f.validated_at, f.validated_by = self.c.clock.now(), principal.user_id
        f.version += 1
        self._version(f, self._dec(f.user_id, f.id, f.value_encrypted), "user", reason)
        self._touch(f)
        self._close_stale_conflicts(f)

    def validate_fact(self, principal: Principal, fact_id: uuid.UUID, *, base_version: int, with_document: bool = False) -> ProfileFact:
        """R2: the ONLY way to reach `validated` + a verification level other than `none` for a proposed fact."""
        if not principal.can_validate:
            self.c.audit.record(
                user_id=principal.user_id,
                actor=principal.actor,
                action="vault.fact.validated",
                subject_type="fact",
                subject_id=str(fact_id),
                outcome="refused",
                session_id=principal.session_id,
            )
            self.c.s.commit()  # the refusal itself is audited
            raise Forbidden("Only the user can validate information.", code="human_validation_required")
        f = self._own(principal, fact_id)
        if f.version != base_version:
            raise ConflictError("This information changed since you loaded it.", code="stale_version", details={"current_version": f.version})
        if f.validation_status in (ValidationStatus.REJECTED, ValidationStatus.SUPERSEDED):
            raise Invalid("A rejected or superseded fact cannot be validated.", code="invalid_state")
        self._set_validated(f, principal, with_document=with_document, reason="validated")
        self.c.audit.record(
            user_id=f.user_id,
            actor="user",
            action="vault.fact.validated",
            subject_type="fact",
            subject_id=str(f.id),
            meta={"key": f.key, "level": f.verification_level},
            session_id=principal.session_id,
        )
        return f

    def reject_fact(self, principal: Principal, fact_id: uuid.UUID) -> ProfileFact:
        if not principal.can_validate:
            raise Forbidden("Only the user can reject information.", code="human_validation_required")
        f = self._own(principal, fact_id)
        f.validation_status, f.verification_level = ValidationStatus.REJECTED, Verification.NONE
        f.version += 1
        self._version(f, self._dec(f.user_id, f.id, f.value_encrypted), "user", "rejected")
        self._touch(f)
        self._close_stale_conflicts(f)
        self.c.audit.record(
            user_id=f.user_id, actor="user", action="vault.fact.rejected", subject_type="fact", subject_id=str(f.id), meta={"key": f.key}, session_id=principal.session_id
        )
        return f

    def delete_fact(self, principal: Principal, fact_id: uuid.UUID) -> None:
        self._need(principal, "vault.write")
        f = self._own(principal, fact_id)
        self._tombstone(f)
        self.c.audit.record(
            user_id=f.user_id, actor="user", action="vault.fact.deleted", subject_type="fact", subject_id=str(f.id), meta={"key": f.key}, session_id=principal.session_id
        )

    def _tombstone(self, f: ProfileFact) -> None:
        """Deleting a fact erases its value AND its history values: the user asked for it to be gone."""
        f.deleted_at = self.c.clock.now()
        f.value_encrypted, f.value_fp = b"", None
        f.validation_status = ValidationStatus.REJECTED if f.validation_status in ACTIVE else f.validation_status
        for v in self.c.s.scalars(select(FactVersion).where(FactVersion.fact_id == f.id)):
            v.value_encrypted = b""
        self.c.s.query(FactSource).filter(FactSource.fact_id == f.id).delete()
        self._touch(f)
        self._close_stale_conflicts(f)

    # ------------------------------------------------------------------ reading
    def list_facts(
        self,
        principal: Principal,
        *,
        category: str | None = None,
        status: str | None = None,
        origin: str | None = None,
        key: str | None = None,
        q: str | None = None,
        include_deleted: bool = False,
    ) -> tuple[list[FactOut], int]:
        self._need(principal, SCOPE_READ)
        stmt = select(ProfileFact).where(ProfileFact.user_id == principal.user_id)
        if not include_deleted:
            stmt = stmt.where(ProfileFact.deleted_at.is_(None))
        if category:
            stmt = stmt.where(ProfileFact.category == category)
        if status:
            stmt = stmt.where(ProfileFact.validation_status == status)
        if origin:
            stmt = stmt.where(ProfileFact.origin == origin)
        if key:
            stmt = stmt.where(ProfileFact.key == key)
        conflict_ids = self._open_conflict_fact_ids(principal.user_id)
        rows = list(self.c.s.scalars(stmt.order_by(ProfileFact.category, ProfileFact.key, ProfileFact.group_id, ProfileFact.entered_at)))
        items = [self.to_out(f, conflict_ids=conflict_ids) for f in rows]
        if q:  # search only inside values the caller may see (masked ones are never matched)
            needle = q.casefold()
            items = [i for i in items if needle in i.key.casefold() or (isinstance(i.value, str) and needle in i.value.casefold())]
        return items, self.user_seq(principal.user_id)

    def user_seq(self, user_id: uuid.UUID) -> int:
        return int(self.c.s.scalar(select(User.vault_seq).where(User.id == user_id)) or 0)

    def get_fact(self, principal: Principal, fact_id: uuid.UUID) -> FactOut:
        self._need(principal, SCOPE_READ)
        return self.to_out(self._own(principal, fact_id))

    def reveal(self, principal: Principal, fact_id: uuid.UUID) -> str | bool | None:
        self._need(principal, SCOPE_READ)
        f = self._own(principal, fact_id)
        self.c.audit.record(
            user_id=f.user_id,
            actor=principal.actor,
            action="vault.fact.revealed",
            subject_type="fact",
            subject_id=str(f.id),
            meta={"key": f.key},
            session_id=principal.session_id,
        )
        return self._dec(f.user_id, f.id, f.value_encrypted)

    def history(self, principal: Principal, fact_id: uuid.UUID) -> list[VersionOut]:
        self._need(principal, SCOPE_READ)
        f = self._own(principal, fact_id, include_deleted=True)
        sensitive = f.sensitivity == Sensitivity.SENSITIVE
        out = []
        for v in self.c.s.scalars(select(FactVersion).where(FactVersion.fact_id == f.id).order_by(FactVersion.version, FactVersion.changed_at)):
            val = None if sensitive else self._dec(f.user_id, f.id, v.value_encrypted, "version")
            out.append(
                VersionOut(
                    version=v.version,
                    value=val,
                    masked=sensitive,
                    origin=v.origin,
                    verification_level=v.verification_level,
                    validation_status=v.validation_status,
                    actor=v.actor,
                    reason=v.reason,
                    changed_at=v.changed_at,
                )
            )
        return out

    def sources(self, principal: Principal, fact_id: uuid.UUID) -> list[SourceOut]:
        self._need(principal, SCOPE_READ)
        f = self._own(principal, fact_id, include_deleted=True)
        return [
            SourceOut(document_id=s.document_id, locator=s.locator, created_at=s.created_at)
            for s in self.c.s.scalars(select(FactSource).where(FactSource.fact_id == f.id).order_by(FactSource.created_at))
        ]

    def review(self, principal: Principal) -> tuple[list[FactOut], list[ConflictOut]]:
        """What needs a human: extracted/inferred facts, sensitive facts not yet confirmed, and conflicts."""
        self._need(principal, SCOPE_READ)
        conflict_ids = self._open_conflict_fact_ids(principal.user_id)
        rows = self.c.s.scalars(
            select(ProfileFact)
            .where(
                ProfileFact.user_id == principal.user_id,
                ProfileFact.deleted_at.is_(None),
                or_(
                    ProfileFact.validation_status == ValidationStatus.PENDING_REVIEW.value,
                    (ProfileFact.sensitivity == Sensitivity.SENSITIVE.value)
                    & (ProfileFact.verification_level == Verification.NONE.value)
                    & (ProfileFact.validation_status == ValidationStatus.VALIDATED.value),
                ),
            )
            .order_by(ProfileFact.entered_at)
        )
        return [self.to_out(f, conflict_ids=conflict_ids) for f in rows], self.conflicts(principal)

    def registry(self) -> list[registry.KeySpec]:
        return list(registry.REGISTRY.values())

    # ------------------------------------------------------------------ matching for a form (extension)
    def match(self, principal: Principal, fields: list, *, reveal_sensitive: bool = False):  # type: ignore[no-untyped-def]
        from app.domains.vault.matching import match_fields

        self._need(principal, SCOPE_READ)
        result = match_fields(self, principal, fields, reveal_sensitive=reveal_sensitive)
        self.c.audit.record(
            user_id=principal.user_id,
            actor=principal.actor,
            action="vault.match",
            session_id=principal.session_id,
            meta={
                "fields": len(fields),
                "fill": sum(m.decision == "fill" for m in result),
                "suggest": sum(m.decision == "suggest" for m in result),
                "revealed": reveal_sensitive,
            },
        )
        return result

    # ------------------------------------------------------------------ synchronisation
    def sync_changes(self, principal: Principal, since: int, limit: int = 200) -> tuple[list[FactOut], int, bool]:
        """Everything changed after `since`, tombstones included. Values of SENSITIVE facts are never part of a sync (masked)."""
        self._need(principal, SCOPE_READ)
        limit = max(1, min(limit, 500))
        conflict_ids = self._open_conflict_fact_ids(principal.user_id)
        rows = list(
            self.c.s.scalars(select(ProfileFact).where(ProfileFact.user_id == principal.user_id, ProfileFact.seq > since).order_by(ProfileFact.seq).limit(limit + 1))
        )
        more = len(rows) > limit
        rows = rows[:limit]
        seq = rows[-1].seq if more and rows else self.user_seq(principal.user_id)
        return [self.to_out(f, conflict_ids=conflict_ids) for f in rows], seq, more

    def sync_push(self, principal: Principal, ops: list) -> list[SyncResult]:  # type: ignore[no-untyped-def]
        results: list[SyncResult] = []
        for op in ops:
            try:
                if op.op == "create":
                    if not op.key or op.value is None:
                        results.append(SyncResult(client_id=op.client_id, status="invalid", detail="key and value are required"))
                        continue
                    f, created = self.create_fact(principal, key=op.key, value=op.value, group_id=op.group_id, client_id=op.client_id)
                    results.append(SyncResult(client_id=op.client_id, status="created" if created else "exists", fact=self.to_out(f)))
                elif op.op in ("update", "delete"):
                    # Offline clients PROPOSE; changing or deleting validated knowledge is a human action in the dashboard.
                    if principal.kind != "web":
                        results.append(SyncResult(client_id=op.client_id, status="forbidden", detail="devices can only propose new facts"))
                        continue
                    if op.id is None:
                        results.append(SyncResult(client_id=op.client_id, status="invalid", detail="id is required"))
                        continue
                    if op.op == "delete":
                        self.delete_fact(principal, op.id)
                        results.append(SyncResult(client_id=op.client_id, status="deleted"))
                    else:
                        f = self.update_fact(principal, op.id, base_version=op.base_version or 0, value=op.value, group_id=op.group_id)
                        results.append(SyncResult(client_id=op.client_id, status="updated", fact=self.to_out(f)))
            except ConflictError as exc:
                current = self.c.s.get(ProfileFact, op.id) if op.id else None
                results.append(
                    SyncResult(
                        client_id=op.client_id,
                        status="conflict",
                        detail=exc.code,
                        fact=self.to_out(current) if current and current.user_id == principal.user_id else None,
                    )
                )
            except (Invalid, NotFound, Forbidden) as exc:
                results.append(SyncResult(client_id=op.client_id, status="forbidden" if isinstance(exc, Forbidden) else "invalid", detail=exc.code))
        self.c.audit.record(
            user_id=principal.user_id,
            actor=principal.actor,
            action="vault.sync_push",
            session_id=principal.session_id,
            meta={"ops": len(ops), "created": sum(r.status == "created" for r in results), "conflicts": sum(r.status == "conflict" for r in results)},
        )
        return results

    # ------------------------------------------------------------------ documents hooks
    def detach_document(self, user_id: uuid.UUID, document_id: uuid.UUID, *, delete_orphans: bool) -> None:
        """A document disappears: facts keep or lose their link to it (policy chosen by the user, R-document-delete)."""
        for src in list(
            self.c.s.scalars(
                select(FactSource).join(ProfileFact, ProfileFact.id == FactSource.fact_id).where(FactSource.document_id == document_id, ProfileFact.user_id == user_id)
            )
        ):
            f = self.c.s.get(ProfileFact, src.fact_id)
            assert f is not None
            self.c.s.delete(src)
            self.c.s.flush()
            remaining = self.c.s.scalar(select(func.count()).select_from(FactSource).where(FactSource.fact_id == f.id)) or 0
            if remaining == 0:
                if delete_orphans:
                    self._tombstone(f)
                    continue
                if f.verification_level == Verification.DOCUMENT_BACKED:
                    f.verification_level = Verification.USER_CONFIRMED  # no document supports it any more
            self._touch(f)

    # ------------------------------------------------------------------ lifecycle contributor (export / purge / AI sharing)
    def export_data(self, user_id: uuid.UUID) -> dict[str, object]:
        facts = []
        for f in self.c.s.scalars(select(ProfileFact).where(ProfileFact.user_id == user_id, ProfileFact.deleted_at.is_(None)).order_by(ProfileFact.key)):
            o = self.to_out(f, reveal=True)
            history = [
                {
                    "version": v.version,
                    "value": self._dec(user_id, f.id, v.value_encrypted, "version"),
                    "origin": v.origin,
                    "verification": v.verification_level,
                    "status": v.validation_status,
                    "actor": v.actor,
                    "reason": v.reason,
                    "at": v.changed_at.isoformat(),
                }
                for v in self.c.s.scalars(select(FactVersion).where(FactVersion.fact_id == f.id).order_by(FactVersion.version))
            ]
            sources = [{"document_id": str(s.document_id), "locator": s.locator} for s in self.c.s.scalars(select(FactSource).where(FactSource.fact_id == f.id))]
            facts.append({**json.loads(o.model_dump_json()), "history": history, "sources": sources})
        conflicts = [json.loads(self._conflict_out(c).model_dump_json()) for c in self.c.s.scalars(select(Conflict).where(Conflict.user_id == user_id))]
        return {"facts": facts, "conflicts": conflicts}

    def export_files(self, user_id: uuid.UUID) -> Iterator[tuple[str, bytes]]:
        return iter(())

    def purge_user(self, user_id: uuid.UUID) -> None:
        ids = list(self.c.s.scalars(select(ProfileFact.id).where(ProfileFact.user_id == user_id)))
        if ids:
            self.c.s.query(FactVersion).filter(FactVersion.fact_id.in_(ids)).delete(synchronize_session=False)
            self.c.s.query(FactSource).filter(FactSource.fact_id.in_(ids)).delete(synchronize_session=False)
        self.c.s.query(Conflict).filter(Conflict.user_id == user_id).delete(synchronize_session=False)
        self.c.s.query(ProfileFact).filter(ProfileFact.user_id == user_id).delete(synchronize_session=False)

    def purge_tombstones(self, older_than: datetime) -> int:
        ids = list(self.c.s.scalars(select(ProfileFact.id).where(ProfileFact.deleted_at.is_not(None), ProfileFact.deleted_at < older_than)))
        if ids:
            self.c.s.query(Conflict).filter(or_(Conflict.fact_a_id.in_(ids), Conflict.fact_b_id.in_(ids))).delete(synchronize_session=False)
            self.c.s.query(FactVersion).filter(FactVersion.fact_id.in_(ids)).delete(synchronize_session=False)
            self.c.s.query(ProfileFact).filter(ProfileFact.id.in_(ids)).delete(synchronize_session=False)
        return len(ids)

    def ai_candidates(self, user_id: uuid.UUID) -> list[AiCandidate]:
        return [
            AiCandidate(str(f.id), f.key, f.category, f.sensitivity == Sensitivity.SENSITIVE, f.validation_status == ValidationStatus.VALIDATED, f.ai_shareable)
            for f in self.c.s.scalars(select(ProfileFact).where(ProfileFact.user_id == user_id, ProfileFact.deleted_at.is_(None)))
        ]


_ = (Category,)  # the enum documents the contract; re-exported for callers
