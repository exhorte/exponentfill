"""Documents: import, protect, extract, classify, propose facts, replace, delete, purge.

Files are encrypted at rest (one DEK per document, wrapped by the user's DEK). Extraction goes through the
`DocumentExtractor` port; found facts go to the vault through the `FactProposer` port and are only PROPOSALS.
"""

from __future__ import annotations

import hashlib
import json
import re
import uuid
from collections.abc import Iterator
from datetime import datetime, timedelta

from sqlalchemy import func, select

from app.domains.common import (
    DocumentStatus,
    Forbidden,
    Invalid,
    NotFound,
    Principal,
)
from app.domains.context import Ctx
from app.domains.documents import classify as classifier
from app.domains.documents.facts import extract_facts
from app.domains.documents.models import Document, DocumentExtraction
from app.domains.documents.schemas import DocumentOut, DocumentTextOut
from app.domains.lifecycle import ExtractedFact, FactProposer
from app.ports import ExtractorUnavailable, StructuredDocument
from app.security import crypto

TEXT_PREVIEW_CHARS = 60_000
PNG = b"\x89PNG\r\n\x1a\n"


def sniff(data: bytes) -> tuple[str, str]:
    """(kind, mime) from the CONTENT, never from the file name or the declared type."""
    if data.startswith(b"%PDF-"):
        return "pdf", "application/pdf"
    if data.startswith(PNG):
        return "image", "image/png"
    if data.startswith(b"\xff\xd8\xff"):
        return "image", "image/jpeg"
    head = data[:8192]
    if b"\x00" not in head:
        try:
            data.decode("utf-8")
            return "text", "text/plain"
        except UnicodeDecodeError:
            pass
    raise Invalid("Only PDF, text, Markdown, PNG and JPEG files are accepted.", code="unsupported_type")


def clean_filename(name: str) -> str:
    base = re.split(r"[\\/]", name or "document")[-1]
    base = re.sub(r"[\x00-\x1f\x7f]", "", base).strip()[:200]
    return base or "document"


class DocumentService:
    name = "documents"

    def __init__(self, ctx: Ctx, proposer: FactProposer) -> None:
        self.c = ctx
        self.proposer = proposer

    # ------------------------------------------------------------------ helpers
    def _own(self, principal: Principal, doc_id: uuid.UUID, *, include_deleted: bool = False) -> Document:
        d = self.c.s.get(Document, doc_id)
        if d is None or d.user_id != principal.user_id or (d.deleted_at is not None and not include_deleted):
            raise NotFound("document not found")
        return d

    def _doc_key(self, d: Document) -> bytes:
        return crypto.decrypt(self.c.dek(d.user_id), d.wrapped_key, crypto.aad("docdek", d.user_id, d.id))

    def _filename(self, d: Document) -> str:
        return crypto.decrypt(self.c.dek(d.user_id), d.filename_encrypted, crypto.aad("docname", d.user_id, d.id)).decode()

    def to_out(self, d: Document, *, duplicate: bool = False) -> DocumentOut:
        return DocumentOut(
            id=d.id,
            filename=self._filename(d),
            mime=d.mime,
            kind=d.kind,
            size=d.size,
            sha256=d.sha256,
            status=d.status,
            status_reason=d.status_reason,
            doc_type=d.doc_type,
            doc_type_confidence=d.doc_type_confidence,
            page_count=d.page_count,
            language=d.language,
            version=d.version,
            replaces_id=d.replaces_id,
            uploaded_at=d.uploaded_at,
            deleted_at=d.deleted_at,
            duplicate=duplicate,
        )

    def _store(self, user_id: uuid.UUID, doc_id: uuid.UUID, version: int, filename: str, data: bytes) -> tuple[bytes, bytes, str]:
        user_dek = self.c.dek(user_id)
        doc_dek = crypto.new_key()
        wrapped = crypto.encrypt(user_dek, doc_dek, crypto.aad("docdek", user_id, doc_id))
        name_enc = crypto.encrypt(user_dek, filename.encode(), crypto.aad("docname", user_id, doc_id))
        key = f"{user_id}/{doc_id}/{version}"
        self.c.blobs.put(key, crypto.encrypt(doc_dek, data, crypto.aad("doc", user_id, doc_id)))
        return wrapped, name_enc, key

    # ------------------------------------------------------------------ upload / replace
    def upload(self, principal: Principal, filename: str, data: bytes, *, replaces: Document | None = None) -> tuple[Document, bool]:
        if not principal.has("documents.write"):
            raise Forbidden("This session cannot import documents.", code="missing_scope")
        limit = self.c.settings.max_upload_mb * 1024 * 1024
        if len(data) == 0:
            raise Invalid("The file is empty.", code="empty_file")
        if len(data) > limit:
            raise Invalid(f"The file is larger than {self.c.settings.max_upload_mb} MB.", code="file_too_large")
        kind, mime = sniff(data)
        sha = hashlib.sha256(data).hexdigest()
        dup = self.c.s.scalar(
            select(Document).where(
                Document.user_id == principal.user_id, Document.sha256 == sha, Document.deleted_at.is_(None), Document.status != DocumentStatus.REPLACED.value
            )
        )
        if dup is not None and replaces is None:
            return dup, False
        now = self.c.clock.now()
        doc_id = uuid.uuid4()
        version = (replaces.version + 1) if replaces else 1
        name = clean_filename(filename)
        wrapped, name_enc, key = self._store(principal.user_id, doc_id, version, name, data)
        d = Document(
            id=doc_id,
            user_id=principal.user_id,
            filename_encrypted=name_enc,
            mime=mime,
            kind=kind,
            size=len(data),
            sha256=sha,
            storage_key=key,
            wrapped_key=wrapped,
            status=DocumentStatus.UPLOADED,
            version=version,
            replaces_id=replaces.id if replaces else None,
            uploaded_at=now,
        )
        self.c.s.add(d)
        self.c.s.flush()
        self.c.audit.record(
            user_id=principal.user_id,
            actor="user",
            action="document.replaced" if replaces else "document.uploaded",
            subject_type="document",
            subject_id=str(d.id),
            meta={"kind": kind, "size": len(data)},
            session_id=principal.session_id,
        )
        self.process(d)
        return d, True

    def replace(self, principal: Principal, doc_id: uuid.UUID, filename: str, data: bytes) -> Document:
        old = self._own(principal, doc_id)
        new, created = self.upload(principal, filename, data, replaces=old)
        if created:
            old.status = DocumentStatus.REPLACED
            old.purge_after = self.c.clock.now() + timedelta(days=self.c.settings.purge_grace_days)
        return new

    # ------------------------------------------------------------------ extraction pipeline
    def process(self, d: Document) -> None:
        """extract -> classify -> propose facts. A failure marks the document, it never loses it and never invents facts."""
        d.status = DocumentStatus.EXTRACTING
        if d.kind == "image":
            d.status, d.status_reason = DocumentStatus.NEEDS_OCR, "images need OCR (a later phase): the file is stored"
            return
        data = crypto.decrypt(self._doc_key(d), self.c.blobs.get(d.storage_key), crypto.aad("doc", d.user_id, d.id))
        structured: StructuredDocument | None = None
        errors: list[str] = []
        for ex in self.c.extractors:
            if not ex.supports(d.kind):
                continue
            try:
                structured = ex.extract(data, d.kind)
                break
            except ExtractorUnavailable as exc:
                errors.append(f"{ex.name}: {exc}")
        if structured is None:
            d.status, d.status_reason = DocumentStatus.FAILED, ("; ".join(errors) or "no extractor for this file")[:120]
            self.c.s.add(DocumentExtraction(document_id=d.id, engine="none", status="failed", created_at=self.c.clock.now()))
            return
        dk = self._doc_key(d)
        text = structured.text
        self.c.s.add(
            DocumentExtraction(
                document_id=d.id,
                engine=structured.engine,
                status="ok",
                created_at=self.c.clock.now(),
                text_encrypted=crypto.encrypt(dk, text.encode(), crypto.aad("extraction-text", d.user_id, d.id)),
                structured_encrypted=crypto.encrypt(
                    dk,
                    json.dumps({"blocks": [{"kind": b.kind, "text": b.text, "page": b.page} for b in structured.blocks], "warnings": structured.warnings}).encode(),
                    crypto.aad("extraction", d.user_id, d.id),
                ),
            )
        )
        d.page_count = structured.page_count
        d.language = classifier.detect_language(text)
        d.doc_type, d.doc_type_confidence = classifier.classify(text)
        if not text.strip():
            d.status, d.status_reason = DocumentStatus.NEEDS_OCR, "no text layer: OCR is needed"
            return
        candidates = extract_facts(structured, d.doc_type)
        items = [
            ExtractedFact(
                key=c.key,
                value=c.value,
                group_id=f"{d.id.hex[:8]}:{c.group_id}" if c.group_id else None,
                confidence=c.confidence * (0.5 + 0.5 * max(d.doc_type_confidence, 0.2)),
                document_id=d.id,
                locator=c.locator,
            )
            for c in candidates
        ]
        self.proposer.propose_extracted(d.user_id, items)
        d.status = DocumentStatus.NEEDS_REVIEW if items else DocumentStatus.EXTRACTED
        d.status_reason = None
        self.c.audit.record(
            user_id=d.user_id,
            actor="system",
            action="document.extracted",
            subject_type="document",
            subject_id=str(d.id),
            meta={"engine": structured.engine, "type": d.doc_type, "facts": len(items)},
        )

    def reextract(self, principal: Principal, doc_id: uuid.UUID) -> Document:
        d = self._own(principal, doc_id)
        self.process(d)
        return d

    # ------------------------------------------------------------------ reading
    def list(self, principal: Principal, *, include_replaced: bool = False) -> list[DocumentOut]:
        if not principal.has("documents.read"):
            raise Forbidden("This session cannot read documents.", code="missing_scope")
        q = select(Document).where(Document.user_id == principal.user_id, Document.deleted_at.is_(None)).order_by(Document.uploaded_at.desc())
        if not include_replaced:
            q = q.where(Document.status != DocumentStatus.REPLACED.value)
        return [self.to_out(d) for d in self.c.s.scalars(q)]

    def get(self, principal: Principal, doc_id: uuid.UUID) -> DocumentOut:
        if not principal.has("documents.read"):
            raise Forbidden("This session cannot read documents.", code="missing_scope")
        return self.to_out(self._own(principal, doc_id))

    def content(self, principal: Principal, doc_id: uuid.UUID) -> tuple[bytes, str, str]:
        if not principal.has("documents.read"):
            raise Forbidden("This session cannot read documents.", code="missing_scope")
        d = self._own(principal, doc_id)
        data = crypto.decrypt(self._doc_key(d), self.c.blobs.get(d.storage_key), crypto.aad("doc", d.user_id, d.id))
        return data, d.mime, self._filename(d)

    def text(self, principal: Principal, doc_id: uuid.UUID) -> DocumentTextOut:
        if not principal.has("documents.read"):
            raise Forbidden("This session cannot read documents.", code="missing_scope")
        d = self._own(principal, doc_id)
        ex = self.c.s.scalars(
            select(DocumentExtraction).where(DocumentExtraction.document_id == d.id, DocumentExtraction.status == "ok").order_by(DocumentExtraction.created_at.desc())
        ).first()
        if ex is None or ex.text_encrypted is None:
            return DocumentTextOut(text="", truncated=False, engine=None, warnings=[d.status_reason] if d.status_reason else [])
        dk = self._doc_key(d)
        text = crypto.decrypt(dk, ex.text_encrypted, crypto.aad("extraction-text", d.user_id, d.id)).decode()
        warnings = (
            json.loads(crypto.decrypt(dk, ex.structured_encrypted or b"", crypto.aad("extraction", d.user_id, d.id)) or b"{}").get("warnings", [])
            if ex.structured_encrypted
            else []
        )
        return DocumentTextOut(text=text[:TEXT_PREVIEW_CHARS], truncated=len(text) > TEXT_PREVIEW_CHARS, engine=ex.engine, warnings=warnings)

    def change_type(self, principal: Principal, doc_id: uuid.UUID, doc_type: str) -> Document:
        d = self._own(principal, doc_id)
        d.doc_type, d.doc_type_confidence = doc_type, 1.0  # the user's word beats the classifier
        self.c.audit.record(
            user_id=d.user_id,
            actor="user",
            action="document.updated",
            subject_type="document",
            subject_id=str(d.id),
            meta={"type": doc_type},
            session_id=principal.session_id,
        )
        return d

    # ------------------------------------------------------------------ delete / purge
    def delete(self, principal: Principal, doc_id: uuid.UUID, facts: str = "detach") -> None:
        if facts not in ("keep", "detach", "delete"):
            raise Invalid("facts must be keep, detach or delete.", code="invalid_policy")
        if not principal.has("documents.write"):
            raise Forbidden("This session cannot delete documents.", code="missing_scope")
        d = self._own(principal, doc_id)
        now = self.c.clock.now()
        if facts in ("detach", "delete"):
            self.proposer.detach_document(d.user_id, d.id, delete_orphans=(facts == "delete"))
        d.status, d.deleted_at = DocumentStatus.DELETED, now
        d.purge_after = now + timedelta(days=self.c.settings.purge_grace_days)
        self.c.audit.record(
            user_id=d.user_id,
            actor="user",
            action="document.deleted",
            subject_type="document",
            subject_id=str(d.id),
            meta={"facts": facts},
            session_id=principal.session_id,
        )

    def _purge_document(self, d: Document) -> None:
        self.proposer.detach_document(d.user_id, d.id, delete_orphans=False)
        self.c.blobs.delete(d.storage_key)  # effective deletion: the encrypted file is overwritten then removed
        self.c.s.query(DocumentExtraction).filter(DocumentExtraction.document_id == d.id).delete(synchronize_session=False)
        self.c.s.delete(d)

    def purge_due(self, now: datetime) -> int:
        due = list(self.c.s.scalars(select(Document).where(Document.purge_after.is_not(None), Document.purge_after <= now)))
        for d in due:
            self._purge_document(d)
        return len(due)

    # ------------------------------------------------------------------ lifecycle contributor
    def export_data(self, user_id: uuid.UUID) -> dict[str, object]:
        out = []
        for d in self.c.s.scalars(select(Document).where(Document.user_id == user_id, Document.deleted_at.is_(None)).order_by(Document.uploaded_at)):
            o = json.loads(self.to_out(d).model_dump_json())
            ex = self.c.s.scalars(select(DocumentExtraction).where(DocumentExtraction.document_id == d.id, DocumentExtraction.status == "ok")).first()
            o["extracted_text"] = (
                crypto.decrypt(self._doc_key(d), ex.text_encrypted, crypto.aad("extraction-text", d.user_id, d.id)).decode() if ex and ex.text_encrypted else None
            )
            out.append(o)
        return {"documents": out}

    def export_files(self, user_id: uuid.UUID) -> Iterator[tuple[str, bytes]]:
        for d in self.c.s.scalars(select(Document).where(Document.user_id == user_id, Document.deleted_at.is_(None))):
            data = crypto.decrypt(self._doc_key(d), self.c.blobs.get(d.storage_key), crypto.aad("doc", d.user_id, d.id))
            yield f"documents/{d.id.hex[:8]}-{self._filename(d)}", data

    def purge_user(self, user_id: uuid.UUID) -> None:
        for d in list(self.c.s.scalars(select(Document).where(Document.user_id == user_id))):
            self.c.blobs.delete(d.storage_key)
            self.c.s.query(DocumentExtraction).filter(DocumentExtraction.document_id == d.id).delete(synchronize_session=False)
            self.c.s.delete(d)

    def count(self, user_id: uuid.UUID) -> int:
        return int(self.c.s.scalar(select(func.count()).select_from(Document).where(Document.user_id == user_id, Document.deleted_at.is_(None))) or 0)
