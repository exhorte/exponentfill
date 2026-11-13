from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class RegisterIn(BaseModel):
    email: str = Field(max_length=320)
    password: str = Field(max_length=512)
    display_name: str = Field(default="", max_length=120)
    locale: str = Field(default="en", pattern="^(en|fr)$")


class LoginIn(BaseModel):
    email: str = Field(max_length=320)
    password: str = Field(max_length=512)


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str
    display_name: str
    locale: str
    email_verified: bool
    status: str
    deletion_scheduled_for: datetime | None
    created_at: datetime


class SessionInfo(BaseModel):
    id: uuid.UUID
    kind: str
    scopes: list[str]
    expires_at: datetime


class AuthOut(BaseModel):
    user: UserOut
    session: SessionInfo
    csrf_token: str | None = None


class SessionListItem(BaseModel):
    id: uuid.UUID
    kind: str
    label: str
    scopes: list[str]
    created_at: datetime
    last_seen_at: datetime
    expires_at: datetime
    current: bool


class PasswordResetRequestIn(BaseModel):
    email: str = Field(max_length=320)


class PasswordResetConfirmIn(BaseModel):
    token: str = Field(max_length=200)
    new_password: str = Field(max_length=512)


class PasswordChangeIn(BaseModel):
    current_password: str = Field(max_length=512)
    new_password: str = Field(max_length=512)


class VerifyEmailIn(BaseModel):
    token: str = Field(max_length=200)


class DeviceIn(BaseModel):
    label: str = Field(min_length=1, max_length=120)
    scopes: list[str] = Field(default_factory=list)


class DeviceOut(BaseModel):
    id: uuid.UUID
    label: str
    token: str  # shown ONCE
    scopes: list[str]
    expires_at: datetime


class AccountPatch(BaseModel):
    display_name: str | None = Field(default=None, max_length=120)
    locale: str | None = Field(default=None, pattern="^(en|fr)$")
    email: str | None = Field(default=None, max_length=320)


class DeleteAccountIn(BaseModel):
    password: str = Field(max_length=512)


class DeletionOut(BaseModel):
    deletion_scheduled_for: datetime
