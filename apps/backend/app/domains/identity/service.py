"""Accounts, sessions, devices, password recovery. Framework-agnostic: no FastAPI import here."""

from __future__ import annotations

import re
import uuid
from datetime import datetime, timedelta

from sqlalchemy import select, update

from app.domains.common import (
    DEVICE_ALLOWED_SCOPES,
    DEVICE_DEFAULT_SCOPES,
    SCOPE_VALIDATE,
    WEB_SCOPES,
    Conflict,
    Forbidden,
    Invalid,
    NotFound,
    Principal,
    TooManyRequests,
    Unauthorized,
)
from app.domains.context import Ctx
from app.domains.identity.models import AuthSession, OneTimeToken, User
from app.domains.privacy.models import PrivacyPreferences
from app.ports import Mail
from app.security import tokens
from app.security.passwords import PolicyError, check_policy

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]{2,}$")
MAX_FAILED = 5
RESET_TTL = timedelta(hours=1)
VERIFY_TTL = timedelta(hours=24)
INVALID_CREDENTIALS = "Incorrect e-mail or password."


def normalize_email(email: str) -> str:
    e = email.strip().lower()
    if len(e) > 320 or not EMAIL_RE.match(e):
        raise Invalid("That does not look like an e-mail address.", code="invalid_email")
    return e


class IdentityService:
    def __init__(self, ctx: Ctx) -> None:
        self.c = ctx

    # ---------------------------------------------------------------- registration and sessions
    def register(self, email: str, password: str, display_name: str = "", locale: str = "en") -> tuple[User, AuthSession, str, str]:
        email = normalize_email(email)
        try:
            check_policy(password, email=email)
        except PolicyError as exc:
            raise Invalid(str(exc), code=exc.code) from exc
        if self.c.s.scalar(select(User.id).where(User.email == email)) is not None:
            raise Conflict("An account already exists for this e-mail.", code="email_taken")
        now = self.c.clock.now()
        user_id = uuid.uuid4()
        user = User(
            id=user_id,
            email=email,
            password_hash=self.c.passwords.hash(password),
            display_name=display_name.strip(),
            locale=locale,
            data_key_wrapped=self.c.keys.wrap_dek(self.c.keys.new_dek(), user_id),
            created_at=now,
            updated_at=now,
            last_login_at=now,
        )
        self.c.s.add(user)
        self.c.s.add(PrivacyPreferences(user_id=user_id, updated_at=now))
        self.c.s.flush()
        self._send_verification(user)
        self.c.audit.record(user_id=user_id, actor="user", action="auth.register")
        session, token, csrf = self._create_session(user, kind="web", label="Web", scopes=sorted(WEB_SCOPES), ttl=timedelta(hours=self.c.settings.session_ttl_hours))
        return user, session, token, csrf

    def login(self, email: str, password: str) -> tuple[User, AuthSession, str, str]:
        email = email.strip().lower()
        user = self.c.s.scalar(select(User).where(User.email == email))
        now = self.c.clock.now()
        if user is None:
            self.c.passwords.verify(self.c.passwords.hash("not-a-real-password"), password)  # equalise timing
            raise Unauthorized(INVALID_CREDENTIALS, code="invalid_credentials")
        if user.locked_until and user.locked_until > now:
            self.c.audit.record(user_id=user.id, actor="user", action="auth.login_failed", outcome="locked")
            self.c.s.commit()  # a refusal must be remembered even though the request fails
            raise TooManyRequests("Too many attempts. Try again later.", code="account_locked")
        if not self.c.passwords.verify(user.password_hash, password):
            user.failed_logins += 1
            if user.failed_logins >= MAX_FAILED:
                user.locked_until = now + timedelta(minutes=min(15, 2 ** (user.failed_logins - MAX_FAILED)))
            self.c.audit.record(user_id=user.id, actor="user", action="auth.login_failed", outcome="bad_password")
            self.c.s.commit()  # the failed-attempt counter and the lockout must survive the error response
            raise Unauthorized(INVALID_CREDENTIALS, code="invalid_credentials")
        user.failed_logins = 0
        user.locked_until = None
        user.last_login_at = now
        if self.c.passwords.needs_rehash(user.password_hash):
            user.password_hash = self.c.passwords.hash(password)
        self.c.audit.record(user_id=user.id, actor="user", action="auth.login")
        session, token, csrf = self._create_session(user, kind="web", label="Web", scopes=sorted(WEB_SCOPES), ttl=timedelta(hours=self.c.settings.session_ttl_hours))
        return user, session, token, csrf

    def _create_session(self, user: User, *, kind: str, label: str, scopes: list[str], ttl: timedelta) -> tuple[AuthSession, str, str]:
        now = self.c.clock.now()
        token, token_hash = tokens.new_token(tokens.SESSION_PREFIX if kind == "web" else tokens.DEVICE_PREFIX)
        csrf = tokens.new_csrf() if kind == "web" else ""
        session = AuthSession(
            user_id=user.id,
            token_hash=token_hash,
            kind=kind,
            label=label,
            scopes=scopes,
            csrf_hash=tokens.hash_token(csrf) if csrf else None,
            created_at=now,
            last_seen_at=now,
            expires_at=now + ttl,
        )
        self.c.s.add(session)
        self.c.s.flush()
        return session, token, csrf

    def authenticate(self, token: str) -> tuple[Principal, AuthSession]:
        if not token or len(token) > 200:
            raise Unauthorized("Authentication required.", code="unauthenticated")
        session = self.c.s.scalar(select(AuthSession).where(AuthSession.token_hash == tokens.hash_token(token)))
        now = self.c.clock.now()
        if session is None or session.revoked_at is not None or session.expires_at <= now:
            raise Unauthorized("Authentication required.", code="unauthenticated")
        user = self.c.s.get(User, session.user_id)
        if user is None:
            raise Unauthorized("Authentication required.", code="unauthenticated")
        if now - session.last_seen_at > timedelta(minutes=5):
            session.last_seen_at = now
        return Principal(user_id=user.id, kind="web" if session.kind == "web" else "device", scopes=frozenset(session.scopes), session_id=session.id), session

    def logout(self, principal: Principal) -> None:
        self._revoke(principal.session_id)
        self.c.audit.record(user_id=principal.user_id, actor="user", action="auth.logout", session_id=principal.session_id)

    def _revoke(self, session_id: uuid.UUID) -> None:
        s = self.c.s.get(AuthSession, session_id)
        if s and s.revoked_at is None:
            s.revoked_at = self.c.clock.now()

    def list_sessions(self, principal: Principal) -> list[tuple[AuthSession, bool]]:
        now = self.c.clock.now()
        rows = self.c.s.scalars(
            select(AuthSession)
            .where(AuthSession.user_id == principal.user_id, AuthSession.revoked_at.is_(None), AuthSession.expires_at > now)
            .order_by(AuthSession.created_at.desc())
        )
        return [(r, r.id == principal.session_id) for r in rows]

    def revoke_session(self, principal: Principal, session_id: uuid.UUID) -> None:
        s = self.c.s.get(AuthSession, session_id)
        if s is None or s.user_id != principal.user_id:
            raise NotFound("session not found")
        self._revoke(s.id)
        self.c.audit.record(user_id=principal.user_id, actor="user", action="auth.session_revoked", subject_type="session", subject_id=str(s.id))

    def revoke_others(self, principal: Principal) -> int:
        now = self.c.clock.now()
        res = self.c.s.execute(
            update(AuthSession)
            .where(AuthSession.user_id == principal.user_id, AuthSession.id != principal.session_id, AuthSession.revoked_at.is_(None))
            .values(revoked_at=now)
        )
        self.c.audit.record(user_id=principal.user_id, actor="user", action="auth.session_revoked", meta={"count": res.rowcount})
        return int(res.rowcount or 0)

    def _revoke_all(self, user_id: uuid.UUID) -> None:
        self.c.s.execute(update(AuthSession).where(AuthSession.user_id == user_id, AuthSession.revoked_at.is_(None)).values(revoked_at=self.c.clock.now()))

    # ---------------------------------------------------------------- devices (extension)
    def create_device(self, principal: Principal, label: str, scopes: list[str]) -> tuple[AuthSession, str]:
        if principal.kind != "web":
            raise Forbidden("Only a signed-in web session can create a device token.")
        wanted = set(scopes) or set(DEVICE_DEFAULT_SCOPES)
        if not wanted <= DEVICE_ALLOWED_SCOPES:
            raise Invalid("Unknown or forbidden scope for a device.", code="invalid_scope")
        if SCOPE_VALIDATE in wanted:
            prefs = self.c.s.get(PrivacyPreferences, principal.user_id)
            if prefs is None or not prefs.device_validation_allowed:
                raise Forbidden("Validation from a device is disabled in your privacy settings.", code="device_validation_disabled")
        user = self.c.user(principal.user_id)
        session, token, _ = self._create_session(user, kind="device", label=label.strip(), scopes=sorted(wanted), ttl=timedelta(days=self.c.settings.device_ttl_days))
        self.c.audit.record(
            user_id=user.id, actor="user", action="auth.device_created", subject_type="session", subject_id=str(session.id), meta={"scopes": sorted(wanted)}
        )
        return session, token

    # ---------------------------------------------------------------- password recovery and change
    def request_password_reset(self, email: str) -> None:
        """Always succeeds from the caller's point of view: no sign of whether the account exists."""
        try:
            email = normalize_email(email)
        except Invalid:
            return
        user = self.c.s.scalar(select(User).where(User.email == email))
        if user is None:
            return
        token = self._issue_token(user, "reset_password", RESET_TTL, tokens.RESET_PREFIX)
        self.c.mailer.send(Mail(to=user.email, template="password_reset", payload={"token": token}, user_id=user.id))
        self.c.audit.record(user_id=user.id, actor="user", action="auth.password_reset_requested")

    def confirm_password_reset(self, token: str, new_password: str) -> None:
        row = self._consume_token(token, "reset_password")
        user = self.c.user(row.user_id)
        try:
            check_policy(new_password, email=user.email)
        except PolicyError as exc:
            row.used_at = None  # a rejected password must not burn the token
            raise Invalid(str(exc), code=exc.code) from exc
        user.password_hash = self.c.passwords.hash(new_password)
        user.failed_logins, user.locked_until = 0, None
        user.updated_at = self.c.clock.now()
        self._revoke_all(user.id)  # whoever held a session before the reset is signed out
        self.c.audit.record(user_id=user.id, actor="user", action="auth.password_changed", meta={"via": "reset"})

    def change_password(self, principal: Principal, current: str, new: str) -> None:
        user = self.c.user(principal.user_id)
        if not self.c.passwords.verify(user.password_hash, current):
            raise Unauthorized("The current password is incorrect.", code="invalid_credentials")
        try:
            check_policy(new, email=user.email)
        except PolicyError as exc:
            raise Invalid(str(exc), code=exc.code) from exc
        user.password_hash = self.c.passwords.hash(new)
        user.updated_at = self.c.clock.now()
        self.revoke_others(principal)
        self.c.audit.record(user_id=user.id, actor="user", action="auth.password_changed", meta={"via": "change"}, session_id=principal.session_id)

    def _issue_token(self, user: User, purpose: str, ttl: timedelta, prefix: str) -> str:
        token, token_hash = tokens.new_token(prefix)
        now = self.c.clock.now()
        self.c.s.add(OneTimeToken(user_id=user.id, purpose=purpose, token_hash=token_hash, created_at=now, expires_at=now + ttl))
        return token

    def _consume_token(self, token: str, purpose: str) -> OneTimeToken:
        row = self.c.s.scalar(select(OneTimeToken).where(OneTimeToken.token_hash == tokens.hash_token(token or ""), OneTimeToken.purpose == purpose))
        now = self.c.clock.now()
        if row is None or row.used_at is not None or row.expires_at <= now:
            raise Invalid("This link is invalid or has expired.", code="invalid_token")
        row.used_at = now
        return row

    def _send_verification(self, user: User) -> None:
        token = self._issue_token(user, "verify_email", VERIFY_TTL, tokens.VERIFY_PREFIX)
        self.c.mailer.send(Mail(to=user.email, template="verify_email", payload={"token": token}, user_id=user.id))

    def verify_email(self, token: str) -> None:
        row = self._consume_token(token, "verify_email")
        self.c.user(row.user_id).email_verified_at = self.c.clock.now()

    # ---------------------------------------------------------------- account
    def get_user(self, principal: Principal) -> User:
        return self.c.user(principal.user_id)

    def update_account(self, principal: Principal, *, display_name: str | None = None, locale: str | None = None, email: str | None = None) -> User:
        user = self.c.user(principal.user_id)
        changed: list[str] = []
        if display_name is not None:
            user.display_name = display_name.strip()
            changed.append("display_name")
        if locale is not None:
            user.locale = locale
            changed.append("locale")
        if email is not None:
            new = normalize_email(email)
            if new != user.email:
                if self.c.s.scalar(select(User.id).where(User.email == new)) is not None:
                    raise Conflict("An account already exists for this e-mail.", code="email_taken")
                user.email = new
                user.email_verified_at = None
                self._send_verification(user)
                changed.append("email")
        user.updated_at = self.c.clock.now()
        self.c.audit.record(user_id=user.id, actor="user", action="account.updated", meta={"fields": changed}, session_id=principal.session_id)
        return user

    def request_deletion(self, principal: Principal, password: str) -> datetime:
        user = self.c.user(principal.user_id)
        if not self.c.passwords.verify(user.password_hash, password):
            raise Unauthorized("The password is incorrect.", code="invalid_credentials")
        now = self.c.clock.now()
        user.status, user.deletion_requested_at, user.updated_at = "pending_deletion", now, now
        self._revoke_all(user.id)
        due = now + timedelta(days=self.c.settings.deletion_grace_days)
        self.c.audit.record(user_id=user.id, actor="user", action="account.deletion_requested", meta={"due": due.isoformat()})
        return due

    def cancel_deletion(self, principal: Principal) -> None:
        user = self.c.user(principal.user_id)
        if user.status != "pending_deletion":
            raise Conflict("No deletion is pending.", code="no_pending_deletion")
        user.status, user.deletion_requested_at = "active", None
        self.c.audit.record(user_id=user.id, actor="user", action="account.deletion_cancelled")

    def deletion_scheduled_for(self, user: User) -> datetime | None:
        if user.status != "pending_deletion" or user.deletion_requested_at is None:
            return None
        return user.deletion_requested_at + timedelta(days=self.c.settings.deletion_grace_days)
