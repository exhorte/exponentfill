# TODO (prioritized)

## Now (state on 2026-11-13)
- [ ] **Deploy** (docs/DEPLOYMENT.md, ADR-024): private GitHub repository + first commit (owner's call), master key generated and backed up OUTSIDE the repository, Render Blueprint (paid plans), Vercel project, then the §4 checks, above all a PDF upload through Vercel's `/v1` rewrite (size limit unverified).
- [ ] SMTP adapter (password reset and verification e-mails go to `email_outbox` and are not delivered); independent security review and privacy notice before real data.
- [ ] Optional: S3-compatible `BlobStore` if documents outgrow the database store (cap: `max_upload_mb`).
- [ ] **Airplane-mode rehearsal on Chrome 157**, then the flight (spikes S1-S10): see the vault's `RUNBOOK_VOL.md`.
- [ ] Review ADR-019/020/021, then decide hosting, `EF_MASTER_KEY` management, E2EE or not, SMTP, GDPR; independent security review of the vault before any real data.
- [ ] Confirm the `psycopg` (LGPL-3.0) decision, or switch driver (`asyncpg`/`pg8000`) if the backend is ever shipped.
- [ ] Browser test of the dashboard and of the scan on real sites; measure extraction quality on real documents.
- [ ] **Close gate G4**: measure the type classifier on REAL forms (without submitting), labelled by someone other than the rule author; the in-sample zeros are a regression guard only.
- [ ] Spike S9: provider adapter + the user's own key + optional host permission for the model (the reclassification logic and `lib/model.ts` hook exist).
- [ ] Replay the S5 bench with the product writer on Chrome 157 (flight), and try several real sites without submitting (G5).
- [ ] File upload (Phase 8), automatic multi-page flows (Phase 9), free-text generation (cover letter).

## Done (Phase 2 remainder, spikes preparation)
- [x] Form fixtures v0 (plain HTML, multi-step, ARIA combobox, upload patterns, rich text, iframes, shadow DOM, traps) and the S5 framework bench (React, MUI, react-select, Ant, Vue, Angular, Quill, TipTap, ProseMirror) — in `spikes/`, to be promoted to a proper fixtures package in Phase 2/3.
- [x] Back up `04_code/` (`pnpm backup`; there is still no commit — commit only when Exhorte asks).
- [x] Spike S3 and the S5 writer, written in a clean session (30/30 rehearsal).
- [ ] Decide on `opencv-python-headless` (FFmpeg LGPL-2.1 bundled in the wheel) before any Docling adoption.
- [x] Security invariant tests (`pnpm check:invariants`).
- [x] CI: license check and pinned GitHub Actions (`.github/workflows/ci.yml`).
- [x] Spike skeletons S1, S2, S3, S4, S6, S7, S10 (throwaway code, outside the product packages).
- [ ] Decide the copyright holder, then add the proprietary notice.

## Done (Phase 3 and vault prototype)
- [x] `packages/form-engine`: detection, labels, stable refs, buttons, taxonomy, value-free serialization (88 tests).
- [x] Side panel: structured field preview ("This page") and vault panel.
- [x] Backend identity / vault / documents / privacy / audit; `apps/dashboard`; `packages/vault-domain`.
- [x] Phases 5-6: taxonomy guards + benchmark, model reclassification logic, review model, `packages/form-writer`, filler content script, review/fill/undo/audit in the panel.
- [ ] Per-site permission flow (after spike S2, in flight).

## Later
- [ ] Docling-based extraction (spike S10 first); the current extractor is rule-based (pypdf + text).
- [ ] Mapping, execution, agent, documents, workflows — see the roadmap in the vault.
- [ ] English version of the vault's key documents (PRD, architecture, security, ADRs).
- [ ] Trademark search before any public asset (ADR-018).
