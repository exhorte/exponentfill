"""Privacy: preferences, control over what reaches an AI, export of the user's data, effective account purge."""

from __future__ import annotations

import io
import json
import uuid
import zipfile
from typing import Any

from sqlalchemy import select

from app.domains.common import Category, Forbidden, Invalid, Principal
from app.domains.context import Ctx
from app.domains.identity.models import AuthSession, EmailOutbox, OneTimeToken, User
from app.domains.lifecycle import AiSharingSource, LifecycleContributor
from app.domains.privacy.models import AiDisclosure, PrivacyPreferences
from app.domains.privacy.schemas import AiPreviewItem, AiPreviewOut


class PrivacyService:
    def __init__(self, ctx: Ctx, contributors: list[LifecycleContributor], ai_sources: list[AiSharingSource], audit_reader: Any) -> None:
        self.c = ctx
        self.contributors = contributors
        self.ai_sources = ai_sources
        self.audit_reader = audit_reader

    # ------------------------------------------------------------------ preferences
    def get(self, principal: Principal) -> PrivacyPreferences:
        prefs = self.c.s.get(PrivacyPreferences, principal.user_id)
        if prefs is None:  # defensive: every account gets one at registration
            prefs = PrivacyPreferences(user_id=principal.user_id, updated_at=self.c.clock.now())
            self.c.s.add(prefs)
            self.c.s.flush()
        return prefs

    def update(
        self,
        principal: Principal,
        *,
        ai_sharing_mode: str,
        ai_allowed_categories: list[str],
        document_retention_days: int | None,
        audit_retention_days: int | None,
        require_validation_for_sensitive: bool,
        device_validation_allowed: bool,
    ) -> PrivacyPreferences:
        if principal.kind != "web":
            raise Forbidden("Privacy settings can only be changed from a signed-in web session.", code="web_session_required")
        valid = {c.value for c in Category}
        if not set(ai_allowed_categories) <= valid:
            raise Invalid("Unknown category.", code="invalid_category")
        prefs = self.get(principal)
        prefs.ai_sharing_mode, prefs.ai_allowed_categories = ai_sharing_mode, sorted(set(ai_allowed_categories))
        prefs.document_retention_days, prefs.audit_retention_days = document_retention_days, audit_retention_days
        prefs.require_validation_for_sensitive, prefs.device_validation_allowed = require_validation_for_sensitive, device_validation_allowed
        prefs.updated_at = self.c.clock.now()
        self.c.audit.record(
            user_id=principal.user_id,
            actor="user",
            action="privacy.updated",
            session_id=principal.session_id,
            meta={"mode": ai_sharing_mode, "device_validation": device_validation_allowed},
        )
        return prefs

    # ------------------------------------------------------------------ AI sharing (R6)
    def ai_preview(self, principal: Principal, purpose: str) -> AiPreviewOut:
        """What WOULD be shared for this purpose. Sensitive facts and non-validated ones never are, whatever the settings."""
        prefs = self.get(principal)
        shareable: list[AiPreviewItem] = []
        excluded: dict[str, int] = {}

        def skip(reason: str) -> None:
            excluded[reason] = excluded.get(reason, 0) + 1

        for src in self.ai_sources:
            for cand in src.ai_candidates(principal.user_id):
                if prefs.ai_sharing_mode in ("none", "structure_only"):
                    skip("mode_" + prefs.ai_sharing_mode)
                elif cand.sensitive:
                    skip("sensitive")
                elif not cand.validated:
                    skip("not_validated")
                elif cand.category not in prefs.ai_allowed_categories:
                    skip("category_not_allowed")
                elif not cand.ai_shareable:
                    skip("fact_not_marked_shareable")
                else:
                    shareable.append(AiPreviewItem(fact_id=cand.fact_id, key=cand.key, category=cand.category))
        return AiPreviewOut(mode=prefs.ai_sharing_mode, purpose=purpose, shareable=shareable, excluded=excluded)

    def record_disclosure(self, user_id: uuid.UUID, purpose: str, fact_ids: list[str], categories: list[str]) -> None:
        """Called by whatever sends data to a model, BEFORE sending. Ids only, never values."""
        prefs = self.c.s.get(PrivacyPreferences, user_id)
        self.c.s.add(
            AiDisclosure(
                user_id=user_id,
                purpose=purpose[:64],
                mode=prefs.ai_sharing_mode if prefs else "none",
                fact_ids=fact_ids[:500],
                categories=categories,
                created_at=self.c.clock.now(),
            )
        )
        self.c.audit.record(user_id=user_id, actor="system", action="vault.fact.shared_with_ai", meta={"purpose": purpose, "count": len(fact_ids)})

    def disclosures(self, principal: Principal, limit: int = 100) -> list[AiDisclosure]:
        return list(
            self.c.s.scalars(select(AiDisclosure).where(AiDisclosure.user_id == principal.user_id).order_by(AiDisclosure.created_at.desc()).limit(min(limit, 500)))
        )

    # ------------------------------------------------------------------ export
    def export_json(self, principal: Principal) -> dict[str, object]:
        user: User = self.c.user(principal.user_id)
        prefs = self.get(principal)
        data: dict[str, object] = {
            "exported_at": self.c.clock.now().isoformat(),
            "format": "exponent-fill-export-v1",
            "account": {
                "email": user.email,
                "display_name": user.display_name,
                "locale": user.locale,
                "created_at": user.created_at.isoformat(),
                "email_verified": user.email_verified_at is not None,
            },
            "preferences": {
                "ai_sharing_mode": prefs.ai_sharing_mode,
                "ai_allowed_categories": prefs.ai_allowed_categories,
                "document_retention_days": prefs.document_retention_days,
                "require_validation_for_sensitive": prefs.require_validation_for_sensitive,
                "device_validation_allowed": prefs.device_validation_allowed,
            },
            "ai_disclosures": [{"purpose": d.purpose, "mode": d.mode, "fact_ids": d.fact_ids, "at": d.created_at.isoformat()} for d in self.disclosures(principal, 500)],
        }
        for contrib in self.contributors:
            data.update(contrib.export_data(principal.user_id))
        data["audit"] = [
            {"action": e.action, "actor": e.actor, "outcome": e.outcome, "subject_type": e.subject_type, "at": e.created_at.isoformat(), "meta": e.meta}
            for e in self.audit_reader.events(principal.user_id, limit=500)
        ]
        self.c.audit.record(user_id=principal.user_id, actor="user", action="account.export", session_id=principal.session_id)
        return data

    def export_zip(self, principal: Principal) -> bytes:
        payload = self.export_json(principal)
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
            z.writestr("export.json", json.dumps(payload, ensure_ascii=False, indent=2, default=str))
            for contrib in self.contributors:
                for path, content in contrib.export_files(principal.user_id):
                    z.writestr(path, content)
        return buf.getvalue()

    # ------------------------------------------------------------------ effective deletion
    def purge_account(self, user_id: uuid.UUID) -> None:
        """Removes EVERYTHING the service holds for the user. The audit trail stays, pseudonymised (no foreign key to the user)."""
        self.c.audit.record(user_id=user_id, actor="system", action="account.purged")
        for contrib in self.contributors:
            contrib.purge_user(user_id)
        self.c.s.query(AiDisclosure).filter(AiDisclosure.user_id == user_id).delete(synchronize_session=False)
        self.c.s.query(PrivacyPreferences).filter(PrivacyPreferences.user_id == user_id).delete(synchronize_session=False)
        self.c.s.query(OneTimeToken).filter(OneTimeToken.user_id == user_id).delete(synchronize_session=False)
        self.c.s.query(AuthSession).filter(AuthSession.user_id == user_id).delete(synchronize_session=False)
        self.c.s.query(EmailOutbox).filter(EmailOutbox.user_id == user_id).delete(synchronize_session=False)
        self.c.s.query(User).filter(User.id == user_id).delete(synchronize_session=False)
