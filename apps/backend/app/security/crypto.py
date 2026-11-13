"""Envelope encryption (ADR-021). AES-256-GCM everywhere; every ciphertext is bound to its object by AAD.

    master key (KEK, outside the database)
        └─ wraps ─► one data key (DEK) per user  (stored wrapped in `users.data_key_wrapped`)
                      ├─ encrypts ─► fact values        (AAD: user | fact | column)
                      └─ wraps ───► one DEK per document (encrypts the file, AAD: user | document)

Blob layout: 12-byte random nonce || ciphertext+tag. A wrong key, a wrong AAD or any altered byte raises `CryptoError`.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import os
import uuid
from pathlib import Path

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.hashes import SHA256
from cryptography.hazmat.primitives.kdf.hkdf import HKDF

NONCE = 12


class CryptoError(Exception):
    """Decryption failed: wrong key, wrong context or tampered data."""


def new_key() -> bytes:
    return os.urandom(32)


def encrypt(key: bytes, plaintext: bytes, aad: bytes) -> bytes:
    nonce = os.urandom(NONCE)
    return nonce + AESGCM(key).encrypt(nonce, plaintext, aad)


def decrypt(key: bytes, blob: bytes, aad: bytes) -> bytes:
    if len(blob) < NONCE + 16:
        raise CryptoError("ciphertext too short")
    try:
        return AESGCM(key).decrypt(blob[:NONCE], blob[NONCE:], aad)
    except InvalidTag as exc:
        raise CryptoError("authentication failed") from exc


def fingerprint(dek: bytes, canonical: str) -> str:
    """HMAC of a canonical value under a key derived from the DEK: equality testing without decrypting or exposing."""
    sub = HKDF(algorithm=SHA256(), length=32, salt=None, info=b"ef-value-fingerprint-v1").derive(dek)
    return hmac.new(sub, canonical.encode("utf-8"), hashlib.sha256).hexdigest()


def aad(*parts: object) -> bytes:
    return "|".join(str(p) for p in parts).encode("utf-8")


class EnvKeyProvider:
    """KeyProvider backed by one master key held in configuration (a secrets manager in production)."""

    def __init__(self, master_key: bytes) -> None:
        if len(master_key) != 32:
            raise ValueError("the master key must be exactly 32 bytes")
        self._master = master_key

    def new_dek(self) -> bytes:
        return new_key()

    def wrap_dek(self, dek: bytes, user_id: uuid.UUID) -> bytes:
        return encrypt(self._master, dek, aad("dek", user_id))

    def unwrap_dek(self, wrapped: bytes, user_id: uuid.UUID) -> bytes:
        return decrypt(self._master, wrapped, aad("dek", user_id))

    def user_ref(self, user_id: uuid.UUID) -> str:
        return hmac.new(self._master, f"user-ref:{user_id}".encode(), hashlib.sha256).hexdigest()


def load_master_key(configured: str | None, dev_path: str, *, is_prod: bool) -> bytes:
    """Master key from `EF_MASTER_KEY` (base64). In dev only, one is generated into a local, git-ignored file."""
    if configured:
        key = base64.b64decode(configured)
        if len(key) != 32:
            raise ValueError("EF_MASTER_KEY must decode to exactly 32 bytes")
        return key
    if is_prod:
        raise RuntimeError("EF_MASTER_KEY is required in production")
    path = Path(dev_path)
    if path.exists():
        return base64.b64decode(path.read_text().strip())
    path.parent.mkdir(parents=True, exist_ok=True)
    key = new_key()
    path.write_text(base64.b64encode(key).decode())
    return key
