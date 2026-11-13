import base64
import os
import tempfile
from collections.abc import Callable
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

# Set BEFORE the application module is imported (it builds its runtime at import time).
os.environ.setdefault("EF_MASTER_KEY", base64.b64encode(b"\x01" * 32).decode())
os.environ.setdefault("EF_STORAGE_DIR", tempfile.mkdtemp(prefix="ef-test-storage-"))

from app.adapters.basic import MemoryBlobStore  # noqa: E402
from app.api.deps import Runtime, build_runtime  # noqa: E402
from app.config import Settings  # noqa: E402
from app.domains.identity.models import EmailOutbox  # noqa: E402
from app.main import create_app  # noqa: E402

DATA = Path(__file__).parent / "data"
PASSWORD = "correct horse battery 42"


class Env:
    """One application instance (in-memory SQLite, in-memory blobs) and helpers to drive it as several users."""

    def __init__(self) -> None:
        # EF_TEST_DATABASE_URL runs the same suite on a real PostgreSQL (tables are dropped and recreated).
        url = os.environ.get("EF_TEST_DATABASE_URL") or "sqlite+pysqlite:///:memory:"
        self.settings = Settings(database_url=url, password_hash_profile="fast", storage_dir=os.environ["EF_STORAGE_DIR"], master_key=os.environ["EF_MASTER_KEY"])
        self.runtime: Runtime = build_runtime(self.settings, blobs=MemoryBlobStore())
        if not url.startswith("sqlite") and self.runtime.db is not None:
            from app.database import Base
            from app.domains import models  # noqa: F401

            Base.metadata.drop_all(self.runtime.db.engine)
            Base.metadata.create_all(self.runtime.db.engine)
        self.app = create_app(self.settings, runtime=self.runtime)
        self.blobs: MemoryBlobStore = self.runtime.blobs  # type: ignore[assignment]

    def client(self) -> TestClient:
        return TestClient(self.app)

    def register(self, email: str, password: str = PASSWORD) -> TestClient:
        c = self.client()
        r = c.post("/v1/auth/register", json={"email": email, "password": password})
        assert r.status_code == 201, r.text
        c.headers["X-CSRF-Token"] = c.cookies.get("ef_csrf")
        return c

    def device(self, web: TestClient, scopes: list[str] | None = None, label: str = "Chrome") -> TestClient:
        r = web.post("/v1/auth/devices", json={"label": label, "scopes": scopes or []})
        assert r.status_code == 201, r.text
        d = TestClient(self.app)
        d.headers["Authorization"] = f"Bearer {r.json()['token']}"
        return d

    def outbox(self, template: str, email: str) -> dict[str, str]:
        with self.runtime.db.session() as s:  # type: ignore[union-attr]
            rows = s.scalars(select(EmailOutbox).where(EmailOutbox.template == template, EmailOutbox.to_address == email).order_by(EmailOutbox.created_at.desc())).all()
            return dict(rows[0].payload) if rows else {}


@pytest.fixture
def env() -> Env:
    return Env()


@pytest.fixture
def alice(env: Env) -> TestClient:
    return env.register("alice@example.com")


@pytest.fixture
def bob(env: Env) -> TestClient:
    return env.register("bob@example.com")


@pytest.fixture
def add_fact() -> Callable[..., dict]:
    def _add(client: TestClient, key: str, value: object, **extra: object) -> dict:
        r = client.post("/v1/vault/facts", json={"key": key, "value": value, **extra})
        assert r.status_code in (200, 201), r.text
        return r.json()

    return _add
