from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app import __version__
from app.api.deps import Runtime, build_runtime
from app.api.health import router as health_router
from app.config import Settings, get_settings
from app.domains.common import DomainError
from app.domains.documents.api import router as documents_router
from app.domains.identity.api import router as identity_router
from app.domains.privacy.api import router as privacy_router
from app.domains.vault.api import router as vault_router


def create_app(settings: Settings | None = None, *, runtime: Runtime | None = None) -> FastAPI:
    settings = settings or get_settings()
    app = FastAPI(
        title="Exponent Fill API (working name)",
        version=__version__,
        docs_url="/docs" if settings.enable_docs else None,
        redoc_url=None,
        openapi_url="/openapi.json" if settings.enable_docs else None,
    )
    app.state.settings = settings
    app.state.runtime = runtime or build_runtime(settings)
    if app.state.runtime.db is not None:
        app.state.runtime.db.create_all() if settings.database_url and settings.database_url.startswith("sqlite") else None

    # CORS is OFF unless explicit origins are configured (dashboard, extension). Never "*": it would hand cookies to any site.
    if settings.cors_origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=settings.cors_origins,
            allow_credentials=True,
            allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
            allow_headers=["Content-Type", "Authorization", "X-CSRF-Token", "If-Match"],
        )

    @app.middleware("http")
    async def security_headers(request: Request, call_next):  # type: ignore[no-untyped-def]
        response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("Referrer-Policy", "no-referrer")
        if request.url.path.startswith("/v1/"):
            response.headers.setdefault("Cache-Control", "no-store")
        return response

    @app.exception_handler(DomainError)
    async def domain_error(_: Request, exc: DomainError) -> JSONResponse:
        return JSONResponse({"error": {"code": exc.code, "message": exc.message, **({"details": exc.details} if exc.details else {})}}, status_code=exc.status)

    app.include_router(health_router)
    for router in (identity_router, privacy_router, vault_router, documents_router):
        app.include_router(router)
    return app


app = create_app()
