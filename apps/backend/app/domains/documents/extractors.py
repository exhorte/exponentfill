"""DocumentExtractor adapters (ADR-010). They know NOTHING about the vault, classification or AI orchestration."""

from __future__ import annotations

import io
import re

from app.ports import Block, DocumentExtractor, ExtractorUnavailable, StructuredDocument


def _paragraphs(text: str) -> list[str]:
    return [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]


class PlainTextExtractor:
    name = "plain-text"

    def supports(self, kind: str) -> bool:
        return kind == "text"

    def extract(self, data: bytes, kind: str) -> StructuredDocument:
        text = data.decode("utf-8", errors="replace").replace("\r\n", "\n")
        doc = StructuredDocument(self.name, 1)
        for para in _paragraphs(text):
            doc.blocks.append(Block("paragraph", para, 1))
        return doc


class PypdfExtractor:
    """Text layer of a PDF through pypdf (BSD-3). Scans (no text layer) are reported, never silently emptied."""

    name = "pypdf"

    def supports(self, kind: str) -> bool:
        return kind == "pdf"

    def extract(self, data: bytes, kind: str) -> StructuredDocument:
        from pypdf import PdfReader
        from pypdf.errors import PyPdfError

        try:
            reader = PdfReader(io.BytesIO(data))
            doc = StructuredDocument(self.name, len(reader.pages))
            for number, page in enumerate(reader.pages, start=1):
                text = (page.extract_text() or "").replace("\r\n", "\n")
                for line_block in _paragraphs(text) or ([text.strip()] if text.strip() else []):
                    doc.blocks.append(Block("paragraph", line_block, number))
        except (PyPdfError, ValueError, KeyError, OSError) as exc:
            raise ExtractorUnavailable(f"unreadable PDF: {type(exc).__name__}") from exc
        if not doc.blocks:
            doc.warnings.append("no text layer: OCR is needed")
        return doc


class DoclingExtractor:
    """Optional adapter: used only when Docling is installed (spike S10 decides whether it becomes the default)."""

    name = "docling"

    def supports(self, kind: str) -> bool:
        return kind == "pdf"

    def extract(self, data: bytes, kind: str) -> StructuredDocument:
        try:
            import docling  # noqa: F401
        except ImportError as exc:
            raise ExtractorUnavailable("docling is not installed") from exc
        raise ExtractorUnavailable("the Docling adapter is not wired yet (see spike S10)")


def default_extractors() -> list[DocumentExtractor]:
    return [PypdfExtractor(), PlainTextExtractor()]
