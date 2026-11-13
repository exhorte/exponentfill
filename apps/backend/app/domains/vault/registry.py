"""Registry of well-known keys, value validation and canonical forms. Free keys (`category.name`) are allowed too."""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from datetime import date

from app.domains.common import Category, Invalid, Sensitivity, ValueType

KEY_RE = re.compile(r"^[a-z][a-z_]*\.[a-z][a-z0-9_]*$")
# Secrets are NEVER stored (security invariant 5): the API refuses them.
SECRET_RE = re.compile(r"(^|[._])(password|passwd|otp|cvv|cvc|pin|secret|card_number|card_security_code|one_time_code)($|[._])")
SENSITIVE_HINT_RE = re.compile(r"(national_id|passport|iban|bic|social_security|tax_id|salary|health|religion|ethnic|biometric|criminal)")
MAX_TEXT = 4000


@dataclass(frozen=True)
class KeySpec:
    key: str
    value_type: ValueType
    multiple: bool = False
    sensitive: bool = False
    grouped: bool = False

    @property
    def category(self) -> str:
        return self.key.split(".", 1)[0]


def _k(key: str, vt: ValueType = ValueType.TEXT, *, multiple: bool = False, sensitive: bool = False, grouped: bool = False) -> KeySpec:
    return KeySpec(key, vt, multiple, sensitive, grouped)


_T, _D, _N = ValueType.TEXT, ValueType.DATE, ValueType.NUMBER
_SPECS = [
    _k("personal.first_name"),
    _k("personal.last_name"),
    _k("personal.civility"),
    _k("personal.date_of_birth", _D, sensitive=True),
    _k("personal.place_of_birth", sensitive=True),
    _k("personal.nationality", sensitive=True),
    _k("personal.gender", sensitive=True),
    _k("personal.marital_status", sensitive=True),
    _k("contact.email", multiple=True),
    _k("contact.phone", multiple=True),
    _k("contact.address_line1"),
    _k("contact.address_line2"),
    _k("contact.postal_code"),
    _k("contact.city"),
    _k("contact.region"),
    _k("contact.country"),
    _k("professional.job_title"),
    _k("professional.company"),
    _k("professional.website"),
    _k("professional.linkedin"),
    _k("professional.summary"),
    _k("professional.salary_expectation", _N, sensitive=True),
    _k("academic.degree", grouped=True),
    _k("academic.institution", grouped=True),
    _k("academic.field_of_study", grouped=True),
    _k("academic.start_year", _N, grouped=True),
    _k("academic.end_year", _N, grouped=True),
    _k("academic.grade", grouped=True),
    _k("experience.title", grouped=True),
    _k("experience.company", grouped=True),
    _k("experience.location", grouped=True),
    _k("experience.start_date", _D, grouped=True),
    _k("experience.end_date", _D, grouped=True),
    _k("experience.description", grouped=True),
    _k("skills.skill", multiple=True),
    _k("skills.language", multiple=True),
    _k("certifications.name", grouped=True),
    _k("certifications.issuer", grouped=True),
    _k("certifications.issue_date", _D, grouped=True),
    _k("certifications.expiry_date", _D, grouped=True),
    _k("certifications.credential_id", grouped=True),
    _k("administrative.national_id", sensitive=True),
    _k("administrative.passport_number", sensitive=True),
    _k("administrative.tax_id", sensitive=True),
    _k("administrative.iban", sensitive=True),
    _k("administrative.social_security", sensitive=True),
]
REGISTRY: dict[str, KeySpec] = {s.key: s for s in _SPECS}


def resolve_key(key: str) -> KeySpec:
    """Spec of a key (known or free). Raises `Invalid` for malformed keys and for secrets."""
    key = key.strip().lower()
    if not KEY_RE.match(key):
        raise Invalid("A key looks like 'category.name' (lower-case letters, digits, underscores).", code="invalid_key")
    if SECRET_RE.search(key):
        raise Invalid("Passwords, one-time codes and card data are never stored.", code="secret_not_storable")
    category = key.split(".", 1)[0]
    if category not in {c.value for c in Category}:
        raise Invalid(f"Unknown category '{category}'.", code="invalid_category")
    known = REGISTRY.get(key)
    if known:
        return known
    return KeySpec(key, ValueType.TEXT, multiple=category in {"skills", "other"}, sensitive=bool(SENSITIVE_HINT_RE.search(key)), grouped=False)


def sensitivity_of(spec: KeySpec) -> Sensitivity:
    return Sensitivity.SENSITIVE if spec.sensitive else Sensitivity.NORMAL


# ----------------------------------------------------------------------------- values
_DATE_RE = re.compile(r"^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$")


def normalize_value(value_type: str, value: object) -> str | bool:
    """Validate and normalise a value for storage. Numbers and dates are stored as canonical strings."""
    if value_type == ValueType.BOOLEAN:
        if isinstance(value, bool):
            return value
        raise Invalid("Expected a boolean.", code="invalid_value")
    if value_type == ValueType.NUMBER:
        if isinstance(value, bool) or not isinstance(value, int | float | str):
            raise Invalid("Expected a number.", code="invalid_value")
        try:
            n = float(str(value).replace(",", ".").replace(" ", ""))
        except ValueError as exc:
            raise Invalid("Expected a number.", code="invalid_value") from exc
        return str(int(n)) if n == int(n) else str(n)
    if not isinstance(value, str):
        raise Invalid("Expected a text value.", code="invalid_value")
    text = unicodedata.normalize("NFC", value).strip()
    if not text:
        raise Invalid("The value must not be empty.", code="invalid_value")
    if len(text) > MAX_TEXT:
        raise Invalid(f"The value is limited to {MAX_TEXT} characters.", code="value_too_long")
    if value_type == ValueType.DATE:
        m = _DATE_RE.match(text)
        if not m:
            raise Invalid("Expected a date: YYYY, YYYY-MM or YYYY-MM-DD.", code="invalid_value")
        y, mo, d = int(m.group(1)), int(m.group(2) or 1), int(m.group(3) or 1)
        try:
            date(y, mo, d)
        except ValueError as exc:
            raise Invalid("This date does not exist.", code="invalid_value") from exc
    return text


def canonical(value_type: str, value: str | bool) -> str:
    """Canonical form used for fingerprints: equal values, whatever their formatting, share one fingerprint."""
    if isinstance(value, bool):
        return "true" if value else "false"
    if value_type == ValueType.TEXT:
        folded = unicodedata.normalize("NFD", " ".join(value.split()).casefold())
        # accents are folded on Latin letters only; other scripts are kept as they are
        return unicodedata.normalize("NFC", re.sub(r"(?<=[a-z])[̀-ͯ]+", "", folded))
    return value.strip().casefold()
