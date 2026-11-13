from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, File, Query, Response, UploadFile
from fastapi.responses import JSONResponse

from app.api.deps import Services, get_principal, get_services
from app.domains.common import Invalid, Principal
from app.domains.documents.schemas import DocumentOut, DocumentPatch, DocumentTextOut
from app.domains.vault.schemas import FactOut

router = APIRouter(prefix="/v1/vault/documents", tags=["documents"])


async def _read(upload: UploadFile, limit_mb: int) -> bytes:
    data = await upload.read(limit_mb * 1024 * 1024 + 1)  # never buffer more than the limit
    if len(data) > limit_mb * 1024 * 1024:
        raise Invalid(f"The file is larger than {limit_mb} MB.", code="file_too_large")
    return data


@router.post("", response_model=DocumentOut)
async def upload(file: UploadFile = File(...), principal: Principal = Depends(get_principal), services: Services = Depends(get_services)) -> JSONResponse:
    data = await _read(file, services.ctx.settings.max_upload_mb)
    doc, created = services.documents.upload(principal, file.filename or "document", data)
    out = services.documents.to_out(doc, duplicate=not created)
    return JSONResponse(out.model_dump(mode="json"), status_code=201 if created else 200)


@router.get("", response_model=list[DocumentOut])
def list_documents(include_replaced: bool = False, principal: Principal = Depends(get_principal), services: Services = Depends(get_services)) -> list[DocumentOut]:
    return services.documents.list(principal, include_replaced=include_replaced)


@router.get("/{doc_id}", response_model=DocumentOut)
def get_document(doc_id: uuid.UUID, principal: Principal = Depends(get_principal), services: Services = Depends(get_services)) -> DocumentOut:
    return services.documents.get(principal, doc_id)


@router.patch("/{doc_id}", response_model=DocumentOut)
def patch_document(doc_id: uuid.UUID, body: DocumentPatch, principal: Principal = Depends(get_principal), services: Services = Depends(get_services)) -> DocumentOut:
    return services.documents.to_out(services.documents.change_type(principal, doc_id, body.doc_type))


@router.delete("/{doc_id}", status_code=204)
def delete_document(
    doc_id: uuid.UUID, facts: str = Query(default="detach"), principal: Principal = Depends(get_principal), services: Services = Depends(get_services)
) -> Response:
    services.documents.delete(principal, doc_id, facts)
    return Response(status_code=204)


@router.get("/{doc_id}/content")
def content(doc_id: uuid.UUID, principal: Principal = Depends(get_principal), services: Services = Depends(get_services)) -> Response:
    data, mime, filename = services.documents.content(principal, doc_id)
    safe = filename.replace('"', "").replace("\r", "").replace("\n", "")
    return Response(
        data, media_type=mime, headers={"Content-Disposition": f'attachment; filename="{safe}"', "X-Content-Type-Options": "nosniff", "Cache-Control": "no-store"}
    )


@router.put("/{doc_id}/content", response_model=DocumentOut)
async def replace(
    doc_id: uuid.UUID, file: UploadFile = File(...), principal: Principal = Depends(get_principal), services: Services = Depends(get_services)
) -> DocumentOut:
    data = await _read(file, services.ctx.settings.max_upload_mb)
    return services.documents.to_out(services.documents.replace(principal, doc_id, file.filename or "document", data))


@router.post("/{doc_id}/reextract", response_model=DocumentOut)
def reextract(doc_id: uuid.UUID, principal: Principal = Depends(get_principal), services: Services = Depends(get_services)) -> DocumentOut:
    return services.documents.to_out(services.documents.reextract(principal, doc_id))


@router.get("/{doc_id}/text", response_model=DocumentTextOut)
def text(doc_id: uuid.UUID, principal: Principal = Depends(get_principal), services: Services = Depends(get_services)) -> DocumentTextOut:
    return services.documents.text(principal, doc_id)


@router.get("/{doc_id}/facts", response_model=list[FactOut])
def facts_of(doc_id: uuid.UUID, principal: Principal = Depends(get_principal), services: Services = Depends(get_services)) -> list[FactOut]:
    services.documents.get(principal, doc_id)  # 404 for a document that is not the caller's
    return services.vault.facts_from_document(principal, doc_id)
