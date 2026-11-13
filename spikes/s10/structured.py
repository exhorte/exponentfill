"""Throwaway spike S10: the COMMON representation every extraction engine must produce (``StructuredDocument``).

Design rule (ADR-010): the rest of the system depends on this shape, never on an engine. An engine is replaceable if it
can fill this structure. Deliberately tiny: text blocks with a kind and a page, plus warnings. Nothing about the vault,
classification or AI orchestration lives here.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

BlockKind = Literal["heading", "paragraph", "list_item", "table", "other"]


@dataclass(frozen=True)
class Block:
    kind: BlockKind
    text: str
    page: int  # 1-based


@dataclass
class StructuredDocument:
    engine: str
    page_count: int
    blocks: list[Block] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    @property
    def text(self) -> str:
        return "\n".join(b.text for b in self.blocks)

    def to_dict(self) -> dict:
        return {
            "engine": self.engine,
            "page_count": self.page_count,
            "warnings": self.warnings,
            "blocks": [{"kind": b.kind, "text": b.text, "page": b.page} for b in self.blocks],
        }
