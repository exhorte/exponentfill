from __future__ import annotations

from fastapi import APIRouter, Depends, Response

from app.api.deps import Services, get_principal, get_services
from app.domains.common import Principal
from app.domains.privacy.schemas import AiDisclosureOut, AiPreviewIn, AiPreviewOut, AuditEventOut, PrivacyIn, PrivacyOut

router = APIRouter(prefix="/v1", tags=["privacy"])


def _out(p) -> PrivacyOut:  # type: ignore[no-untyped-def]
    return PrivacyOut(
        ai_sharing_mode=p.ai_sharing_mode,
        ai_allowed_categories=p.ai_allowed_categories,
        document_retention_days=p.document_retention_days,
        audit_retention_days=p.audit_retention_days,
        require_validation_for_sensitive=p.require_validation_for_sensitive,
        device_validation_allowed=p.device_validation_allowed,
        updated_at=p.updated_at,
    )


@router.get("/privacy", response_model=PrivacyOut)
def get_privacy(principal: Principal = Depends(get_principal), services: Services = Depends(get_services)) -> PrivacyOut:
    return _out(services.privacy.get(principal))


@router.put("/privacy", response_model=PrivacyOut)
def put_privacy(body: PrivacyIn, principal: Principal = Depends(get_principal), services: Services = Depends(get_services)) -> PrivacyOut:
    return _out(services.privacy.update(principal, **body.model_dump()))


@router.post("/privacy/ai-preview", response_model=AiPreviewOut)
def ai_preview(body: AiPreviewIn, principal: Principal = Depends(get_principal), services: Services = Depends(get_services)) -> AiPreviewOut:
    return services.privacy.ai_preview(principal, body.purpose)


@router.get("/privacy/ai-disclosures", response_model=list[AiDisclosureOut])
def ai_disclosures(principal: Principal = Depends(get_principal), services: Services = Depends(get_services)) -> list[AiDisclosureOut]:
    return [
        AiDisclosureOut(id=d.id, purpose=d.purpose, mode=d.mode, fact_ids=d.fact_ids, categories=d.categories, created_at=d.created_at)
        for d in services.privacy.disclosures(principal)
    ]


@router.get("/account/export")
def export_json(principal: Principal = Depends(get_principal), services: Services = Depends(get_services)) -> dict[str, object]:
    return services.privacy.export_json(principal)


@router.get("/account/export.zip")
def export_zip(principal: Principal = Depends(get_principal), services: Services = Depends(get_services)) -> Response:
    return Response(
        services.privacy.export_zip(principal), media_type="application/zip", headers={"Content-Disposition": 'attachment; filename="exponent-fill-export.zip"'}
    )


@router.get("/audit/events", response_model=list[AuditEventOut])
def audit_events(
    limit: int = 100, before: int | None = None, principal: Principal = Depends(get_principal), services: Services = Depends(get_services)
) -> list[AuditEventOut]:
    return [
        AuditEventOut(
            id=e.id, actor=e.actor, action=e.action, subject_type=e.subject_type, subject_id=e.subject_id, outcome=e.outcome, meta=e.meta, created_at=e.created_at
        )
        for e in services.audit.events(principal.user_id, limit=limit, before=before)
    ]


@router.get("/audit/verify")
def audit_verify(principal: Principal = Depends(get_principal), services: Services = Depends(get_services)) -> dict[str, object]:
    return services.audit.verify(principal.user_id)
