"""Throwaway spike S10: one adapter per candidate engine, all returning a ``StructuredDocument``.

Engines: pypdf, pdfminer.six, pypdfium2 (text-layer extractors) and Docling (layout + tables + OCR, local models).
LiteParse (WASM) is evaluated separately in ``../liteparse`` because it runs in JavaScript.

Docling runs fully OFFLINE: models come from ``models/`` (downloaded once with ``docling-tools``) and
``HF_HUB_OFFLINE=1`` forbids any network access.
"""

from __future__ import annotations

import os
import re
from pathlib import Path

from structured import Block, StructuredDocument

HERE = Path(__file__).parent
MODELS = HERE / "models"


def _paragraphs(text: str) -> list[str]:
    return [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]


# ---- pypdf ---------------------------------------------------------------------------------------------------------
def extract_pypdf(path: Path) -> StructuredDocument:
    from pypdf import PdfReader

    reader = PdfReader(str(path))
    doc = StructuredDocument("pypdf", len(reader.pages))
    for i, page in enumerate(reader.pages, start=1):
        for para in _paragraphs(page.extract_text() or ""):
            doc.blocks.append(Block("paragraph", para, i))
    if not doc.blocks:
        doc.warnings.append("no text layer (scanned document?) — OCR needed")
    return doc


# ---- pdfminer.six --------------------------------------------------------------------------------------------------
def extract_pdfminer(path: Path) -> StructuredDocument:
    from pdfminer.high_level import extract_pages
    from pdfminer.layout import LAParams, LTTextContainer

    pages = list(extract_pages(str(path), laparams=LAParams()))
    doc = StructuredDocument("pdfminer.six", len(pages))
    for i, page in enumerate(pages, start=1):
        for el in page:
            if isinstance(el, LTTextContainer):
                text = el.get_text().strip()
                if text:
                    doc.blocks.append(Block("paragraph", " ".join(text.split()), i))
    if not doc.blocks:
        doc.warnings.append("no text layer (scanned document?) — OCR needed")
    return doc


# ---- pypdfium2 -----------------------------------------------------------------------------------------------------
def extract_pypdfium2(path: Path) -> StructuredDocument:
    import pypdfium2 as pdfium

    pdf = pdfium.PdfDocument(str(path))
    doc = StructuredDocument("pypdfium2", len(pdf))
    for i in range(len(pdf)):
        textpage = pdf[i].get_textpage()
        text = textpage.get_text_range().replace("\r\n", "\n")
        for para in _paragraphs(text):
            doc.blocks.append(Block("paragraph", " ".join(para.split()), i + 1))
    if not doc.blocks:
        doc.warnings.append("no text layer (scanned document?) — OCR needed")
    return doc


# ---- Docling -------------------------------------------------------------------------------------------------------
_converter = None


def _docling_converter():
    global _converter
    if _converter is None:
        os.environ["HF_HUB_OFFLINE"] = "1"  # never touch the network at extraction time
        from docling.datamodel.base_models import InputFormat
        from docling.datamodel.pipeline_options import PdfPipelineOptions
        from docling.document_converter import DocumentConverter, PdfFormatOption

        opts = PdfPipelineOptions()
        opts.artifacts_path = str(MODELS)
        opts.do_ocr = True
        opts.do_table_structure = True
        _converter = DocumentConverter(format_options={InputFormat.PDF: PdfFormatOption(pipeline_options=opts)})
    return _converter


_KIND = {"TITLE": "heading", "SECTION_HEADER": "heading", "LIST_ITEM": "list_item", "TABLE": "table"}


def extract_docling(path: Path) -> StructuredDocument:
    result = _docling_converter().convert(str(path))
    d = result.document
    doc = StructuredDocument("docling", len(d.pages))
    for item, _level in d.iterate_items():
        label = getattr(item.label, "name", str(item.label))
        if label == "TABLE":
            text = item.export_to_markdown(doc=d)
        else:
            text = getattr(item, "text", "") or ""
        text = text.strip()
        if not text:
            continue
        page = item.prov[0].page_no if getattr(item, "prov", None) else 0
        doc.blocks.append(Block(_KIND.get(label, "paragraph"), text, page))
    for status in getattr(result, "errors", []) or []:
        doc.warnings.append(str(status))
    return doc


ENGINES = {
    "pypdf": extract_pypdf,
    "pdfminer.six": extract_pdfminer,
    "pypdfium2": extract_pypdfium2,
    "docling": extract_docling,
}
