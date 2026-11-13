"""Passwords (Argon2id) and the password policy. Opaque tokens live in `tokens.py`."""

from __future__ import annotations

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError

MIN_LENGTH = 12
MAX_LENGTH = 256

# A deliberately small list of the most common choices; length is the real protection.
COMMON = {
    "password1234",
    "123456789012",
    "qwertyuiop12",
    "motdepasse12",
    "azertyuiop12",
    "letmein12345",
    "welcome12345",
    "iloveyou1234",
    "administrator",
    "password!234",
    "changeme1234",
    "exponentfill",
}


class PolicyError(ValueError):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


def check_policy(password: str, *, email: str = "") -> None:
    if len(password) < MIN_LENGTH:
        raise PolicyError("password_too_short", f"The password must have at least {MIN_LENGTH} characters.")
    if len(password) > MAX_LENGTH:
        raise PolicyError("password_too_long", f"The password must have at most {MAX_LENGTH} characters.")
    low = password.lower()
    if low in COMMON:
        raise PolicyError("password_too_common", "This password is too common.")
    local = email.split("@")[0].lower() if email else ""
    if email and (email.lower() in low or (len(local) >= 4 and local in low and len(low) - len(local) < 6)):
        raise PolicyError("password_contains_email", "The password must not be built from the e-mail address.")
    if len(set(low)) < 5:
        raise PolicyError("password_too_simple", "The password is too repetitive.")


class PasswordService:
    def __init__(self, profile: str = "default") -> None:
        # "fast" only exists so the test suite does not spend minutes hashing; never use it elsewhere.
        self._hasher = PasswordHasher(time_cost=1, memory_cost=8, parallelism=1) if profile == "fast" else PasswordHasher()

    def hash(self, password: str) -> str:
        return self._hasher.hash(password)

    def verify(self, hashed: str, password: str) -> bool:
        try:
            return self._hasher.verify(hashed, password)
        except (VerifyMismatchError, VerificationError, InvalidHashError):
            return False

    def needs_rehash(self, hashed: str) -> bool:
        try:
            return self._hasher.check_needs_rehash(hashed)
        except InvalidHashError:
            return True
