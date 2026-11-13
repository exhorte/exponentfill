"""Opaque tokens: 256 random bits; only the SHA-256 of a token is ever stored."""

from __future__ import annotations

import hashlib
import hmac
import secrets

SESSION_PREFIX = "efs_"
DEVICE_PREFIX = "efd_"
RESET_PREFIX = "efr_"
VERIFY_PREFIX = "efv_"


def new_token(prefix: str) -> tuple[str, str]:
    """Returns (token to hand out once, hash to store)."""
    token = prefix + secrets.token_urlsafe(32)
    return token, hash_token(token)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def new_csrf() -> str:
    return secrets.token_urlsafe(24)


def same(a: str, b: str) -> bool:
    return hmac.compare_digest(a.encode(), b.encode())
