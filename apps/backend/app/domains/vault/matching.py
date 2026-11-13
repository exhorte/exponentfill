"""Which facts could fill which form field? Structure in, candidates out. Deterministic: no model is involved (ADR-005).

Decision per field:
  fill     a USABLE candidate exists (R4: validated, no open conflict, sensitive => confirmed) and, when the field offers
           options, its value matches exactly one option
  suggest  something exists but needs the user (pending, conflicting, sensitive, no matching option): shown, never auto-filled
  none     nothing relevant, or the field must never be filled (secrets, consent)
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import select

from app.domains.common import Principal, Sensitivity, ValidationStatus
from app.domains.vault.models import ProfileFact
from app.domains.vault.registry import canonical
from app.domains.vault.schemas import Candidate, FieldMatch, MatchField

if TYPE_CHECKING:
    from app.domains.vault.service import VaultService

SEMANTIC_TO_KEYS: dict[str, list[str]] = {
    "first_name": ["personal.first_name"],
    "last_name": ["personal.last_name"],
    "civility": ["personal.civility"],
    "date_of_birth": ["personal.date_of_birth"],
    "place_of_birth": ["personal.place_of_birth"],
    "nationality": ["personal.nationality"],
    "gender": ["personal.gender"],
    "marital_status": ["personal.marital_status"],
    "email": ["contact.email"],
    "phone": ["contact.phone"],
    "address_line1": ["contact.address_line1"],
    "address_line2": ["contact.address_line2"],
    "postal_code": ["contact.postal_code"],
    "city": ["contact.city"],
    "region": ["contact.region"],
    "country": ["contact.country"],
    "company": ["professional.company", "experience.company"],
    "job_title": ["professional.job_title", "experience.title"],
    "website": ["professional.website"],
    "linkedin": ["professional.linkedin"],
    "salary": ["professional.salary_expectation"],
    "degree": ["academic.degree"],
    "institution": ["academic.institution"],
    "graduation_year": ["academic.end_year"],
    "national_id": ["administrative.national_id"],
    "passport_number": ["administrative.passport_number"],
    "tax_id": ["administrative.tax_id"],
    "iban": ["administrative.iban"],
}
NEVER = {
    "password": "secret",
    "one_time_code": "secret",
    "card_number": "secret",
    "card_security_code": "secret",
    "consent": "consent_requires_user",
}
TRUST_RANK = {"verified": 0, "declared": 1, "extracted": 2, "inferred": 3}


def _reason(usable: bool, f: ProfileFact, has_conflict: bool) -> str:
    if usable:
        return "usable"
    if has_conflict:
        return "open_conflict"
    if f.validation_status == ValidationStatus.PENDING_REVIEW:
        return "pending_review"
    if f.sensitivity == Sensitivity.SENSITIVE:
        return "sensitive_unconfirmed"
    return "not_validated"


def _match_option(value: str, options: list[str]) -> str | None:
    """The option equal to the value, exactly or in a unique case/accent-insensitive way; never 'the closest one'."""
    target = canonical("text", value)
    hits = [o for o in options if canonical("text", o) == target]
    return hits[0] if len(hits) == 1 else None


def match_fields(service: VaultService, principal: Principal, fields: list[MatchField], *, reveal_sensitive: bool) -> list[FieldMatch]:
    conflict_ids = service._open_conflict_fact_ids(principal.user_id)
    by_key: dict[str, list[ProfileFact]] = {}

    def facts_for(key: str) -> list[ProfileFact]:
        if key not in by_key:
            by_key[key] = list(
                service.c.s.scalars(
                    select(ProfileFact).where(
                        ProfileFact.user_id == principal.user_id,
                        ProfileFact.key == key,
                        ProfileFact.deleted_at.is_(None),
                        ProfileFact.validation_status.in_([ValidationStatus.VALIDATED.value, ValidationStatus.PENDING_REVIEW.value]),
                    )
                )
            )
        return by_key[key]

    out: list[FieldMatch] = []
    for fld in fields:
        sem = fld.semantic_type
        if sem in NEVER:
            out.append(FieldMatch(field_id=fld.id, decision="none", reason=NEVER[sem], candidates=[]))
            continue
        if fld.kind in ("file", "password"):
            out.append(FieldMatch(field_id=fld.id, decision="none", reason="not_a_vault_field", candidates=[]))
            continue
        if sem == "full_name":
            out.append(_full_name(service, fld, facts_for, conflict_ids))
            continue
        keys = SEMANTIC_TO_KEYS.get(sem)
        if not keys:
            out.append(FieldMatch(field_id=fld.id, decision="none", reason="no_mapping", candidates=[]))
            continue
        rows = [f for k in keys for f in facts_for(k)]
        scored: list[tuple[tuple[int, int, float], Candidate]] = []
        for f in rows:
            o = service.to_out(f, conflict_ids=conflict_ids)
            value = o.value
            sensitive_hidden = o.masked and not (reveal_sensitive and o.usable)
            if o.masked and reveal_sensitive and o.usable:
                value = service._dec(f.user_id, f.id, f.value_encrypted)
                sensitive_hidden = False
            reason = _reason(o.usable, f, o.has_open_conflict)
            usable = o.usable
            if fld.options and isinstance(value, str) and not sensitive_hidden:
                picked = _match_option(value, fld.options)
                if picked is None:
                    usable, reason = False, "no_matching_option"
                else:
                    value = picked
            scored.append(
                (
                    (0 if usable else 1, TRUST_RANK[o.trust_class], -f.updated_at.timestamp()),
                    Candidate(
                        fact_id=f.id,
                        key=f.key,
                        value=None if sensitive_hidden else value,
                        trust_class=o.trust_class,
                        validation_status=o.validation_status,
                        usable=usable,
                        needs_confirmation=not usable,
                        reason=reason,
                        sources_count=o.sources_count,
                    ),
                )
            )
        scored.sort(key=lambda t: t[0])
        cands = [c for _, c in scored][:3]
        if cands and cands[0].usable:
            out.append(FieldMatch(field_id=fld.id, decision="fill", reason="usable", candidates=cands))
        elif cands:
            out.append(FieldMatch(field_id=fld.id, decision="suggest", reason=cands[0].reason, candidates=cands))
        else:
            out.append(FieldMatch(field_id=fld.id, decision="none", reason="nothing_in_vault", candidates=[]))
    return out


def _full_name(service: VaultService, fld: MatchField, facts_for, conflict_ids) -> FieldMatch:  # type: ignore[no-untyped-def]
    """Derived value: 'first last'. It is only as trustworthy as its weakest part, and only usable when both parts are."""
    parts = []
    for key in ("personal.first_name", "personal.last_name"):
        outs = sorted((service.to_out(f, conflict_ids=conflict_ids) for f in facts_for(key)), key=lambda o: (0 if o.usable else 1, TRUST_RANK[o.trust_class]))
        parts.append(outs[0] if outs else None)
    if not all(parts):
        return FieldMatch(field_id=fld.id, decision="none", reason="nothing_in_vault", candidates=[])
    first, last = parts[0], parts[1]
    assert first is not None and last is not None
    usable = first.usable and last.usable
    weakest = max((first.trust_class, last.trust_class), key=lambda t: TRUST_RANK[t])
    cand = Candidate(
        fact_id=None,
        key="derived.full_name",
        value=f"{first.value} {last.value}",
        trust_class=weakest,
        validation_status="validated" if usable else "pending_review",
        usable=usable,
        needs_confirmation=not usable,
        reason="usable" if usable else "pending_review",
    )
    return FieldMatch(field_id=fld.id, decision="fill" if usable else "suggest", reason=cand.reason, candidates=[cand])
