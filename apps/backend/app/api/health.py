from typing import Literal

from fastapi import APIRouter, Request
from pydantic import BaseModel

from app import __version__, db

router = APIRouter()


class HealthResponse(BaseModel):
    """Contract mirrored by `HealthResponseSchema` in packages/shared-types."""

    status: Literal["ok"]
    version: str
    database: db.DatabaseState


class VersionResponse(BaseModel):
    version: str


@router.get("/health", response_model=HealthResponse)
def health(request: Request) -> HealthResponse:
    settings = request.app.state.settings
    return HealthResponse(
        status="ok",
        version=__version__,
        database=db.check_database(settings.database_url),
    )


@router.get("/v1/version", response_model=VersionResponse)
def version() -> VersionResponse:
    return VersionResponse(version=__version__)
