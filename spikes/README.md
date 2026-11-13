# Spikes (throwaway)

Measurement code for the feasibility spikes S1–S10 (see the vault's `TECHNICAL_FEASIBILITY.md` §5 and `RUNBOOK_VOL.md`).
**Nothing here is product code**: it never enters `apps/` or `packages/` without a clean rewrite and review.
Everything runs **offline** once dependencies are installed.

| Folder | What | How |
|---|---|---|
| `fixtures/` | Plain-HTML test pages (forms, shadow DOM, iframes, upload patterns, traps) | served by `server/serve.mjs` |
| `server/` | `serve.mjs` (fixtures on several origins, port 5800) and `fake-llm.mjs` (long SSE stream, port 5810). Zero dependencies | `node spikes/server/serve.mjs` |
| `ext/` | Throwaway MV3 extension (plain JS, no build): S1 side panel/messaging, S2 per-site permissions, S4 closed shadow root, S6 long streaming call, S7 vault encryption | Chrome → `chrome://extensions` → Developer mode → Load unpacked → `spikes/ext` |
| `frameworks/` | S5 fixture bench: React, MUI, react-select, Ant Design, Vue, Angular (JIT), Quill, TipTap, ProseMirror. **Own pnpm workspace** (own lockfile) | `pnpm build` → served under `/fx/` |
| `liteparse/` | S10: LiteParse (WASM, Apache-2.0) on the corpus. Own pnpm workspace | `node bench.mjs` |
| `s10/` | S10: Docling, pypdf, pdfminer.six, pypdfium2 on a **fictitious** corpus, common `StructuredDocument`, license inventory. Own uv project (Python 3.12) | `uv run python bench.py` |
| `runner/` | Rehearsal: runs the skeletons end to end in Playwright's Chromium | `node spikes/runner/rehearse.mjs` |

## Not written here on purpose

- **S3 (file transfer vault → page)** and the **S5 writer** (typing into custom widgets) correspond to components OB-05/06/07/11 of the
  OpenBUA-derived specifications. They must be written by a session that has **not** read the OpenBUA analysis (see `../CLAUDE.md`).
  The *pages* they need (`fixtures/upload.html`, `frameworks/`) exist.

## Rules

- Fictitious data only. No real personal document in any corpus.
- Do not bypass pnpm's `minimumReleaseAge` (supply-chain safeguard): pin an older version instead.
- Do not run anything from `references-externes/`.
