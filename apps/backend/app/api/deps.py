"""Composition root of the HTTP layer: builds the services of ONE request and authenticates it.

Everything environment-specific (database, keys, clock, blob store, mailer, extractors) is created once in
`app.state.runtime` and injected here; the domains only see ports.
"""

from __future__ import annotations

from collections.abc import Iterator
from dataclasses import dataclass, field

from fastapi import Depends, Request, Response
from sqlalchemy.orm import Session

from app.adapters.basic import FileBlobStore, OutboxMailer, SystemClock
from app.adapters.db_blobs import DbBlobStore
from app.config import Settings
from app.database import Database
from app.domains.audit.service import SqlAudit
from app.domains.common import Principal, Unauthorized
from app.domains.context import Ctx
from app.domains.documents.extractors import default_extractors
from app.domains.documents.service import DocumentService
from app.domains.identity.models import AuthSession
from app.domains.identity.service import IdentityService
from app.domains.privacy.service import PrivacyService
from app.domains.vault.service import VaultService
from app.ports import BlobStore, Clock, DocumentExtractor, KeyProvider
from app.security import tokens
from app.security.crypto import EnvKeyProvider, load_master_key
from app.security.passwords import PasswordService

SESSION_COOKIE = "ef_session"
CSRF_COOKIE = "ef_csrf"
CSRF_HEADER = "x-csrf-token"
SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}


@dataclass
class Runtime:
    """Process-wide singletons."""

    settings: Settings
    db: Database | None
    keys: KeyProvider
    clock: Clock
    blobs: BlobStore
    passwords: PasswordService
    extractors: list[DocumentExtractor] = field(default_factory=list)


def build_runtime(settings: Settings, *, blobs: BlobStore | None = None, clock: Clock | None = None, extractors: list[DocumentExtractor] | None = None) -> Runtime:
    master = load_master_key(settings.master_key, settings.dev_master_key_path, is_prod=settings.is_prod)
    if settings.is_prod and settings.database_url and settings.database_url.startswith("sqlite"):
        # `Database` shares ONE connection across threads for in-memory test databases: under concurrent requests it can crash the process.
        raise RuntimeError("SQLite is for tests only: production needs PostgreSQL (EF_DATABASE_URL)")
    db = Database(settings.database_url) if settings.database_url else None
    if blobs is None:
        if settings.blob_backend == "db":
            if db is None:
                raise RuntimeError("EF_BLOB_BACKEND=db needs EF_DATABASE_URL")
            blobs = DbBlobStore(db, clock)
        elif settings.blob_backend == "file":
            blobs = FileBlobStore(settings.storage_dir)
        else:
            raise RuntimeError(f"unknown EF_BLOB_BACKEND {settings.blob_backend!r} (expected 'file' or 'db')")
    return Runtime(
        settings=settings,
        db=db,
        keys=EnvKeyProvider(master),
        clock=clock or SystemClock(),
        blobs=blobs,
        passwords=PasswordService(settings.password_hash_profile),
        extractors=extractors if extractors is not None else default_extractors(),
    )


@dataclass
class Services:
    ctx: Ctx
    identity: IdentityService
    vault: VaultService
    documents: DocumentService
    privacy: PrivacyService
    audit: SqlAudit


def build_services(rt: Runtime, session: Session) -> Services:
    audit = SqlAudit(session, rt.keys, rt.clock)
    ctx = Ctx(
        s=session,
        settings=rt.settings,
        keys=rt.keys,
        clock=rt.clock,
        mailer=OutboxMailer(session, rt.clock),
        blobs=rt.blobs,
        audit=audit,
        passwords=rt.passwords,
        extractors=rt.extractors,
    )
    vault = VaultService(ctx)
    documents = DocumentService(ctx, vault)
    privacy = PrivacyService(ctx, contributors=[vault, documents], ai_sources=[vault], audit_reader=audit)
    return Services(ctx=ctx, identity=IdentityService(ctx), vault=vault, documents=documents, privacy=privacy, audit=audit)


def get_services(request: Request) -> Iterator[Services]:
    rt: Runtime = request.app.state.runtime
    if rt.db is None:
        raise Unauthorized("The service is not configured with a database.", code="service_unavailable")
    with rt.db.session() as session:
        yield build_services(rt, session)


def _bearer(request: Request) -> str | None:
    header = request.headers.get("authorization", "")
    return header[7:].strip() if header.lower().startswith("bearer ") else None


def get_auth(request: Request, services: Services = Depends(get_services)) -> tuple[Principal, AuthSession]:
    """Cookie (dashboard, with CSRF) or Bearer device token (extension, no ambient credentials => no CSRF)."""
    bearer = _bearer(request)
    if bearer:
        return services.identity.authenticate(bearer)
    cookie = request.cookies.get(SESSION_COOKIE)
    if not cookie:
        raise Unauthorized("Authentication required.", code="unauthenticated")
    principal, session = services.identity.authenticate(cookie)
    if request.method not in SAFE_METHODS:
        header, ck = request.headers.get(CSRF_HEADER, ""), request.cookies.get(CSRF_COOKIE, "")
        if not header or not ck or not tokens.same(header, ck) or session.csrf_hash is None or not tokens.same(tokens.hash_token(ck), session.csrf_hash):
            raise Unauthorized("Missing or invalid CSRF token.", code="csrf_failed")
    return principal, session


def get_principal(auth: tuple[Principal, AuthSession] = Depends(get_auth)) -> Principal:
    return auth[0]


def set_session_cookies(response: Response, settings: Settings, token: str, csrf: str) -> None:
    max_age = settings.session_ttl_hours * 3600
    secure = settings.cookies_secure
    response.set_cookie(SESSION_COOKIE, token, max_age=max_age, httponly=True, samesite="lax", secure=secure, path="/")
    response.set_cookie(CSRF_COOKIE, csrf, max_age=max_age, httponly=False, samesite="lax", secure=secure, path="/")


def clear_session_cookies(response: Response) -> None:
    response.delete_cookie(SESSION_COOKIE, path="/")
    response.delete_cookie(CSRF_COOKIE, path="/")
