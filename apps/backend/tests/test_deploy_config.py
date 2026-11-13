"""The deployment files must stay consistent with the real settings (ADR-024): a typo in render.yaml would only show up on the host."""

import json
import re
from pathlib import Path

import pytest
import yaml

from app.config import Settings

ROOT = Path(__file__).resolve().parents[3]
RENDER = yaml.safe_load((ROOT / "render.yaml").read_text(encoding="utf-8"))
VERCEL = json.loads((ROOT / "apps/dashboard/vercel.json").read_text(encoding="utf-8"))
API = next(s for s in RENDER["services"] if s["name"] == "exponent-fill-api")
ENV = {e["key"]: e for e in API["envVars"]}


def test_every_env_var_of_the_blueprint_is_a_real_setting() -> None:
    fields = {f"EF_{name}".upper() for name in Settings.model_fields}
    assert set(ENV) <= fields, f"unknown settings in render.yaml: {sorted(set(ENV) - fields)}"


def test_the_blueprint_runs_production_mode_with_safe_defaults() -> None:
    assert ENV["EF_ENV"]["value"] == "prod"
    assert ENV["EF_BLOB_BACKEND"]["value"] == "db"  # the container disk is ephemeral
    assert ENV["EF_COOKIE_SECURE"]["value"] == "true"
    assert ENV["EF_ENABLE_DOCS"]["value"] == "false"
    assert "EF_DASHBOARD_ORIGINS" not in ENV and "EF_EXTENSION_ORIGINS" not in ENV  # same origin through Vercel: no CORS at all
    # the settings the blueprint selects really are valid values
    s = Settings(env="prod", blob_backend="db", cookie_secure=True, master_key="x")
    assert s.is_prod and s.cookies_secure and s.cors_origins == []


def test_secrets_are_never_written_in_the_file() -> None:
    assert ENV["EF_MASTER_KEY"] == {"key": "EF_MASTER_KEY", "sync": False}  # asked once, never in the repository, never generated
    assert "generateValue" not in ENV["EF_MASTER_KEY"]
    text = (ROOT / "render.yaml").read_text(encoding="utf-8")
    assert not re.search(r"postgres(ql)?://\w+:\w+@", text)  # no connection string with a password
    assert ENV["EF_DATABASE_URL"]["fromDatabase"]["property"] == "connectionString"


def test_the_database_is_in_the_eu_and_closed_to_the_outside() -> None:
    db = RENDER["databases"][0]
    assert ENV["EF_DATABASE_URL"]["fromDatabase"]["name"] == db["name"]
    assert db["region"] == API["region"] == "frankfurt"
    assert db["ipAllowList"] == []  # nothing outside Render's private network


def test_free_plans_are_a_demo_choice_and_the_file_says_so() -> None:
    # The owner chose the free plans (2026-11-13). A free database is deleted after about 30 days and a free service sleeps, so this
    # instance is for demo data only: the blueprint must keep saying it, and free and paid must not be mixed by accident.
    db = RENDER["databases"][0]
    assert db["plan"] == API["plan"] == "free"
    assert "DEMO DATA ONLY" in (ROOT / "render.yaml").read_text(encoding="utf-8")


def test_the_service_builds_the_backend_image_and_has_a_health_check() -> None:
    assert API["runtime"] == "docker" and API["healthCheckPath"] == "/health"
    dockerfile = ROOT / API["dockerfilePath"]
    assert dockerfile.is_file() and (ROOT / API["dockerContext"]).samefile(dockerfile.parent)
    assert "${PORT:-8010}" in dockerfile.read_text(encoding="utf-8")  # the host may impose the port
    assert API["autoDeployTrigger"] == "checksPass"


def test_vercel_forwards_v1_to_the_api_so_the_browser_stays_on_one_origin() -> None:
    (rule,) = VERCEL["rewrites"]
    assert rule["source"] == "/v1/:path*"
    assert re.fullmatch(r"https://[a-z0-9-]+\.onrender\.com/v1/:path\*", rule["destination"])
    assert rule["destination"].startswith(f"https://{API['name']}.onrender.com/")  # the default Render host of the service
    assert VERCEL["outputDirectory"] == "dist" and "--filter @exponent-fill/dashboard" in VERCEL["buildCommand"]


def test_vercel_sends_security_headers_and_a_strict_content_security_policy() -> None:
    headers = {h["key"]: h["value"] for h in VERCEL["headers"][0]["headers"]}
    csp = headers["Content-Security-Policy"]
    for directive in ("default-src 'self'", "script-src 'self'", "connect-src 'self'", "object-src 'none'", "frame-ancestors 'none'", "base-uri 'none'"):
        assert directive in csp
    assert "unsafe-eval" not in csp and "unsafe-inline" not in csp and "*" not in csp.replace("'self'", "")
    assert headers["X-Content-Type-Options"] == "nosniff" and headers["X-Frame-Options"] == "DENY" and headers["Referrer-Policy"] == "no-referrer"


def test_the_master_key_is_required_in_production() -> None:
    from app.security.crypto import load_master_key

    with pytest.raises(Exception):  # noqa: B017, PT011
        load_master_key(None, "var/none.key", is_prod=True)
