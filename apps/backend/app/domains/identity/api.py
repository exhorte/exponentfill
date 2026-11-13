from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Request, Response
from fastapi.responses import JSONResponse

from app.api.deps import Services, clear_session_cookies, get_auth, get_principal, get_services, set_session_cookies
from app.domains.common import Principal
from app.domains.identity.models import AuthSession, User
from app.domains.identity.schemas import (
    AccountPatch,
    AuthOut,
    DeleteAccountIn,
    DeletionOut,
    DeviceIn,
    DeviceOut,
    LoginIn,
    PasswordChangeIn,
    PasswordResetConfirmIn,
    PasswordResetRequestIn,
    RegisterIn,
    SessionInfo,
    SessionListItem,
    UserOut,
    VerifyEmailIn,
)

router = APIRouter(prefix="/v1", tags=["identity"])


def user_out(services: Services, user: User) -> UserOut:
    return UserOut(
        id=user.id,
        email=user.email,
        display_name=user.display_name,
        locale=user.locale,
        email_verified=user.email_verified_at is not None,
        status=user.status,
        deletion_scheduled_for=services.identity.deletion_scheduled_for(user),
        created_at=user.created_at,
    )


def _auth_out(services: Services, user: User, session: AuthSession, csrf: str | None) -> AuthOut:
    return AuthOut(
        user=user_out(services, user), session=SessionInfo(id=session.id, kind=session.kind, scopes=list(session.scopes), expires_at=session.expires_at), csrf_token=csrf
    )


@router.post("/auth/register", response_model=AuthOut, status_code=201)
def register(body: RegisterIn, response: Response, services: Services = Depends(get_services)) -> AuthOut:
    user, session, token, csrf = services.identity.register(body.email, body.password, body.display_name, body.locale)
    set_session_cookies(response, services.ctx.settings, token, csrf)
    return _auth_out(services, user, session, csrf)


@router.post("/auth/login", response_model=AuthOut)
def login(body: LoginIn, response: Response, services: Services = Depends(get_services)) -> AuthOut:
    user, session, token, csrf = services.identity.login(body.email, body.password)
    set_session_cookies(response, services.ctx.settings, token, csrf)
    return _auth_out(services, user, session, csrf)


@router.post("/auth/logout", status_code=204)
def logout(response: Response, principal: Principal = Depends(get_principal), services: Services = Depends(get_services)) -> Response:
    services.identity.logout(principal)
    clear_session_cookies(response)
    response.status_code = 204
    return response


@router.get("/auth/session", response_model=AuthOut)
def current_session(request: Request, auth: tuple[Principal, AuthSession] = Depends(get_auth), services: Services = Depends(get_services)) -> AuthOut:
    principal, session = auth
    return _auth_out(services, services.identity.get_user(principal), session, request.cookies.get("ef_csrf"))


@router.post("/auth/password-reset/request", status_code=202)
def password_reset_request(body: PasswordResetRequestIn, services: Services = Depends(get_services)) -> dict[str, str]:
    services.identity.request_password_reset(body.email)
    return {"status": "accepted"}  # identical whether or not the account exists


@router.post("/auth/password-reset/confirm", status_code=204)
def password_reset_confirm(body: PasswordResetConfirmIn, services: Services = Depends(get_services)) -> Response:
    services.identity.confirm_password_reset(body.token, body.new_password)
    return Response(status_code=204)


@router.post("/auth/password/change", status_code=204)
def password_change(body: PasswordChangeIn, principal: Principal = Depends(get_principal), services: Services = Depends(get_services)) -> Response:
    services.identity.change_password(principal, body.current_password, body.new_password)
    return Response(status_code=204)


@router.post("/auth/email/verify", status_code=204)
def email_verify(body: VerifyEmailIn, services: Services = Depends(get_services)) -> Response:
    services.identity.verify_email(body.token)
    return Response(status_code=204)


@router.get("/auth/sessions", response_model=list[SessionListItem])
def sessions(principal: Principal = Depends(get_principal), services: Services = Depends(get_services)) -> list[SessionListItem]:
    return [
        SessionListItem(
            id=s.id, kind=s.kind, label=s.label, scopes=list(s.scopes), created_at=s.created_at, last_seen_at=s.last_seen_at, expires_at=s.expires_at, current=cur
        )
        for s, cur in services.identity.list_sessions(principal)
    ]


@router.delete("/auth/sessions/{session_id}", status_code=204)
def revoke(session_id: uuid.UUID, principal: Principal = Depends(get_principal), services: Services = Depends(get_services)) -> Response:
    services.identity.revoke_session(principal, session_id)
    return Response(status_code=204)


@router.delete("/auth/sessions", status_code=200)
def revoke_others(principal: Principal = Depends(get_principal), services: Services = Depends(get_services)) -> dict[str, int]:
    return {"revoked": services.identity.revoke_others(principal)}


@router.post("/auth/devices", response_model=DeviceOut, status_code=201)
def create_device(body: DeviceIn, principal: Principal = Depends(get_principal), services: Services = Depends(get_services)) -> JSONResponse:
    session, token = services.identity.create_device(principal, body.label, body.scopes)
    out = DeviceOut(id=session.id, label=session.label, token=token, scopes=list(session.scopes), expires_at=session.expires_at)
    return JSONResponse(out.model_dump(mode="json"), status_code=201, headers={"Cache-Control": "no-store"})


@router.get("/account", response_model=UserOut)
def get_account(principal: Principal = Depends(get_principal), services: Services = Depends(get_services)) -> UserOut:
    return user_out(services, services.identity.get_user(principal))


@router.patch("/account", response_model=UserOut)
def patch_account(body: AccountPatch, principal: Principal = Depends(get_principal), services: Services = Depends(get_services)) -> UserOut:
    return user_out(services, services.identity.update_account(principal, display_name=body.display_name, locale=body.locale, email=body.email))


@router.delete("/account", response_model=DeletionOut, status_code=202)
def delete_account(body: DeleteAccountIn, response: Response, principal: Principal = Depends(get_principal), services: Services = Depends(get_services)) -> DeletionOut:
    due = services.identity.request_deletion(principal, body.password)
    clear_session_cookies(response)
    return DeletionOut(deletion_scheduled_for=due)


@router.post("/account/deletion/cancel", status_code=204)
def cancel_deletion(principal: Principal = Depends(get_principal), services: Services = Depends(get_services)) -> Response:
    services.identity.cancel_deletion(principal)
    return Response(status_code=204)
