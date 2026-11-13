from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Header, Query, Response

from app.api.deps import Services, get_principal, get_services
from app.domains.common import Principal
from app.domains.vault.schemas import (
    ConflictOut,
    FactCreate,
    FactList,
    FactOut,
    FactPatch,
    MatchIn,
    MatchOut,
    RegistryItem,
    ResolveIn,
    RevealOut,
    ReviewOut,
    SourceOut,
    SyncOut,
    SyncPushIn,
    SyncPushOut,
    ValidateIn,
    VersionOut,
)

router = APIRouter(prefix="/v1/vault", tags=["vault"])


@router.get("/registry", response_model=list[RegistryItem])
def registry(principal: Principal = Depends(get_principal), services: Services = Depends(get_services)) -> list[RegistryItem]:
    return [
        RegistryItem(key=s.key, category=s.category, value_type=s.value_type.value, multiple=s.multiple, sensitive=s.sensitive, grouped=s.grouped)
        for s in services.vault.registry()
    ]


@router.get("/facts", response_model=FactList)
def list_facts(
    category: str | None = None,
    status: str | None = None,
    origin: str | None = None,
    key: str | None = None,
    q: str | None = Query(default=None, max_length=100),
    include_deleted: bool = False,
    principal: Principal = Depends(get_principal),
    services: Services = Depends(get_services),
) -> FactList:
    items, seq = services.vault.list_facts(principal, category=category, status=status, origin=origin, key=key, q=q, include_deleted=include_deleted)
    return FactList(items=items, seq=seq)


@router.post("/facts", response_model=FactOut, status_code=201)
def create_fact(body: FactCreate, response: Response, principal: Principal = Depends(get_principal), services: Services = Depends(get_services)) -> FactOut:
    fact, created = services.vault.create_fact(principal, key=body.key, value=body.value, value_type=body.value_type, group_id=body.group_id, client_id=body.client_id)
    response.status_code = 201 if created else 200
    return services.vault.to_out(fact)


@router.get("/facts/{fact_id}", response_model=FactOut)
def get_fact(fact_id: uuid.UUID, principal: Principal = Depends(get_principal), services: Services = Depends(get_services)) -> FactOut:
    return services.vault.get_fact(principal, fact_id)


@router.patch("/facts/{fact_id}", response_model=FactOut)
def patch_fact(
    fact_id: uuid.UUID,
    body: FactPatch,
    if_match: str | None = Header(default=None),
    principal: Principal = Depends(get_principal),
    services: Services = Depends(get_services),
) -> FactOut:
    base = int(if_match.strip('"')) if if_match and if_match.strip('"').isdigit() else body.base_version
    fact = services.vault.update_fact(principal, fact_id, base_version=base, value=body.value, group_id=body.group_id, ai_shareable=body.ai_shareable)
    return services.vault.to_out(fact)


@router.delete("/facts/{fact_id}", status_code=204)
def delete_fact(fact_id: uuid.UUID, principal: Principal = Depends(get_principal), services: Services = Depends(get_services)) -> Response:
    services.vault.delete_fact(principal, fact_id)
    return Response(status_code=204)


@router.post("/facts/{fact_id}/validate", response_model=FactOut)
def validate_fact(fact_id: uuid.UUID, body: ValidateIn, principal: Principal = Depends(get_principal), services: Services = Depends(get_services)) -> FactOut:
    return services.vault.to_out(services.vault.validate_fact(principal, fact_id, base_version=body.base_version, with_document=body.with_document))


@router.post("/facts/{fact_id}/reject", response_model=FactOut)
def reject_fact(fact_id: uuid.UUID, principal: Principal = Depends(get_principal), services: Services = Depends(get_services)) -> FactOut:
    return services.vault.to_out(services.vault.reject_fact(principal, fact_id))


@router.post("/facts/{fact_id}/reveal", response_model=RevealOut)
def reveal(fact_id: uuid.UUID, response: Response, principal: Principal = Depends(get_principal), services: Services = Depends(get_services)) -> RevealOut:
    response.headers["Cache-Control"] = "no-store"
    return RevealOut(value=services.vault.reveal(principal, fact_id))


@router.get("/facts/{fact_id}/history", response_model=list[VersionOut])
def history(fact_id: uuid.UUID, principal: Principal = Depends(get_principal), services: Services = Depends(get_services)) -> list[VersionOut]:
    return services.vault.history(principal, fact_id)


@router.get("/facts/{fact_id}/sources", response_model=list[SourceOut])
def sources(fact_id: uuid.UUID, principal: Principal = Depends(get_principal), services: Services = Depends(get_services)) -> list[SourceOut]:
    return services.vault.sources(principal, fact_id)


@router.get("/review", response_model=ReviewOut)
def review(principal: Principal = Depends(get_principal), services: Services = Depends(get_services)) -> ReviewOut:
    facts, conflicts = services.vault.review(principal)
    return ReviewOut(facts=facts, conflicts=conflicts)


@router.get("/conflicts", response_model=list[ConflictOut])
def conflicts(principal: Principal = Depends(get_principal), services: Services = Depends(get_services)) -> list[ConflictOut]:
    return services.vault.conflicts(principal)


@router.post("/conflicts/{conflict_id}/resolve", status_code=204)
def resolve(conflict_id: uuid.UUID, body: ResolveIn, principal: Principal = Depends(get_principal), services: Services = Depends(get_services)) -> Response:
    services.vault.resolve_conflict(principal, conflict_id, body.keep)
    return Response(status_code=204)


@router.post("/match", response_model=MatchOut)
def match(body: MatchIn, response: Response, principal: Principal = Depends(get_principal), services: Services = Depends(get_services)) -> MatchOut:
    response.headers["Cache-Control"] = "no-store"
    return MatchOut(matches=services.vault.match(principal, body.fields, reveal_sensitive=body.reveal_sensitive), seq=services.vault.user_seq(principal.user_id))


@router.get("/sync", response_model=SyncOut)
def sync(since: int = 0, limit: int = 200, principal: Principal = Depends(get_principal), services: Services = Depends(get_services)) -> SyncOut:
    changes, seq, more = services.vault.sync_changes(principal, since, limit)
    return SyncOut(seq=seq, changes=changes, more=more)


@router.post("/sync/push", response_model=SyncPushOut)
def sync_push(body: SyncPushIn, principal: Principal = Depends(get_principal), services: Services = Depends(get_services)) -> SyncPushOut:
    results = services.vault.sync_push(principal, body.ops)
    return SyncPushOut(results=results, seq=services.vault.user_seq(principal.user_id))
