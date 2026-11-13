# PROJECT_STATE

_Last update: 2026-11-13. Full project state and decisions: the Obsidian vault (`HANDOFF.md`, `PROJECT_STATE.md`)._

## Phase

**Phase 2 done except gate G2 (flight spikes); Phase 3 detection done; Phase 4 vault + dashboard prototype done; Phases 5-6 (mapping + filling) built on 2026-11-12, gate G4 NOT passed (see below).** Gate G1 passed on 2026-11-11.

## Done

- Monorepo (pnpm workspaces + uv), strict TypeScript, ruff.
- Extension: WXT + React 19 + Tailwind 4 + shadcn/ui button; side panel; service worker; typed messages validated with zod and sender checks; FR/EN i18n; manifest with no broad host access at install time and no static content script.
- Backend: FastAPI (`/health`, `/v1/version`), settings via `EF_*` variables, Alembic with an empty baseline migration, Docker image (non-root), no CORS, docs off by default.
- Local stack: PostgreSQL 18 + API in Docker Compose (ports on 127.0.0.1).
- Offline readiness verified: `pnpm install --offline --frozen-lockfile` and `uv sync --offline --frozen` from a cold state; Playwright pinned to 1.62.0 to reuse the cached `chromium-1234` build.

## Verified on 2026-11-12 (end of the "plan resumption + personal knowledge vault" session)

| Check | Result |
|---|---|
| TypeScript tests (form-engine 88, extension 18, shared-types 10, vault-domain 7, dashboard 7) | 130 pass |
| `pytest` backend (SQLite **and** PostgreSQL 18) | 49 pass |
| Playwright e2e (fake backend) / integration (real backend) | 3 pass / pass |
| `typecheck`, `check:i18n` (55 keys), `check:invariants`, `check:licenses`, `ruff` | pass |
| Docker stack with migrations (`0002 (head)`), CV -> proposed facts -> validation -> match -> audit chain | pass |
| Spike rehearsals | 34/34 and 30/30 |

Phases 5-6 (2026-11-12 evening): `form-engine` 101 tests (incl. a 394-label benchmark: 0 false positives in sample, but the FIRST out-of-sample reads were 32.7 % and 18.6 % on trap-heavy corpora), `vault-domain` 15, `form-writer` 29 (jsdom), S5 bench on the product writer 56/56 verified writes with 0 silent failure, extension unit tests + e2e `fill.spec.ts`.

Deployment prepared on 2026-11-13 (ADR-024, nothing deployed): `render.yaml`, `apps/dashboard/vercel.json` (strict CSP), documents stored encrypted in PostgreSQL (migration `0003`), production refuses SQLite / a missing master key. Verified locally: container in production mode on an imposed `PORT`; migrations 0001-0003 on PostgreSQL 18; **70 backend tests on SQLite and on PostgreSQL 18**; first real-browser test of the dashboard (3 tests: 0 CSP violation, cookie flags, CSRF refusal, 12 sections render); 187 TypeScript tests. Not verified: anything on the real Render/Vercel.

Not verified: page scan in a real browser on real sites; extraction quality on real documents; filling (Phase 6 not built).

## Verified on 2026-11-11 (history)

| Check | Result |
|---|---|
| `pnpm typecheck` (strict) | pass |
| Unit tests (shared-types 7, extension 13) | 20 pass |
| `pnpm check:i18n` | pass (15 keys, en/fr) |
| Playwright e2e (fake backend) | 3 pass, 1 skipped by design |
| Playwright integration (real backend + database) | pass |
| `pytest` (backend) | 9 pass |
| `ruff check` / `ruff format --check` | pass |
| Alembic on PostgreSQL 18 | `0001 (head)` |
| Container user / published ports | `uid 10001` / `127.0.0.1` only |

## Flight preparation (2026-11-11)

`spikes/` (throwaway, see its `README.md`) holds everything needed to run spikes S1, S2, S4, S6, S7, S10 offline, plus fixtures and the S5 framework bench.
`pnpm spikes:rehearse` runs the skeletons end to end in Playwright's Chromium: **34/34 checks pass** (fixtures, S1 messaging, S2 plumbing, S4, S5 fixture bench on 9 libraries, S6 short variants, S7).
Cold offline reinstall verified for the product workspace, `spikes/frameworks`, `spikes/liteparse` and `spikes/s10`; Docker stack starts with local images only (`--pull never`).
Not automatable: the S2 permission prompt, Chrome 157 stable behaviour. **Deliberately not written** (OpenBUA contamination rule): S3 file transfer and the S5 writer.

## Not done yet

- Spikes S1–S10 themselves (planned offline, on a flight): see the vault's `RUNBOOK_VOL.md`.
- First commit: the repository has **no commit** (back up with `pnpm backup`); commit only when Exhorte asks.
- Copyright holder not yet decided (no LICENSE file on purpose).
- English version of the key vault documents.

## Next

1. Airplane-mode rehearsal, then the flight (spikes) -> gate G2.
2. Security review of the vault; hosting and master-key decisions; `psycopg` licence decision.
3. Phase 5 (mapping) and Phase 6 (filling).

## Provenance note (OpenBUA)

This foundation was written by a session that had read part of OpenBUA's code. It contains **no OB-xx component**: only the extension skeleton, health check, typed messaging, i18n, backend and Docker. Components OB-01…OB-15 must be written by a session that has not read the analysis (see `CLAUDE.md`).

**Update 2026-11-12:** S3, the S5 writer, `packages/form-engine` and the whole vault module were written by a **clean** session (it read neither `non-licencie\` nor `OPENBUA_REFERENCE.md`), from the sanitised specifications only. The similarity check is still to be set up.
