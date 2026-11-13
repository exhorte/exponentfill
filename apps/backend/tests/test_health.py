from fastapi.testclient import TestClient

from app import __version__, db
from app.config import Settings
from app.main import create_app


def make_client(**overrides: object) -> TestClient:
    return TestClient(create_app(Settings(**overrides)))  # type: ignore[arg-type]


def test_health_without_database_configuration() -> None:
    response = make_client(database_url=None).get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "version": __version__, "database": "unconfigured"}


def test_health_reports_database_ok(monkeypatch) -> None:
    monkeypatch.setattr(db, "check_database", lambda url, timeout_s=2: "ok")
    response = make_client(database_url="postgresql://u:p@db/x").get("/health")
    assert response.json()["database"] == "ok"


def test_health_reports_database_unreachable(monkeypatch) -> None:
    monkeypatch.setattr(db, "check_database", lambda url, timeout_s=2: "unreachable")
    response = make_client(database_url="postgresql://u:p@db/x").get("/health")
    assert response.status_code == 200
    assert response.json()["database"] == "unreachable"


def test_unreachable_database_is_a_state_not_a_crash() -> None:
    # Nothing listens on port 1: the check must report it instead of raising.
    assert db.check_database("postgresql://u:p@127.0.0.1:1/x", timeout_s=1) == "unreachable"


def test_database_url_never_leaks_in_responses() -> None:
    secret = "s3cr3t-password"
    client = make_client(database_url=f"postgresql://user:{secret}@127.0.0.1:1/x")
    for path in ("/health", "/v1/version"):
        assert secret not in client.get(path).text


def test_version_endpoint() -> None:
    assert make_client().get("/v1/version").json() == {"version": __version__}


def test_interactive_docs_are_disabled_by_default() -> None:
    client = make_client()
    assert client.get("/docs").status_code == 404
    assert client.get("/openapi.json").status_code == 404


def test_interactive_docs_can_be_enabled_for_local_development() -> None:
    assert make_client(enable_docs=True).get("/docs").status_code == 200


def test_no_cross_origin_access_for_web_pages() -> None:
    response = make_client().get("/health", headers={"Origin": "https://evil.example"})
    assert "access-control-allow-origin" not in {k.lower() for k in response.headers}
