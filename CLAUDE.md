# CLAUDE.md — Exponent Fill (working name)

AI-assisted form filling for Chrome. Proprietary, all rights reserved (ADR-017). "Exponent Fill" is a **working name** (ADR-018): never hard-code it outside `apps/extension/public/_locales/*/messages.json` (`extName`) and configuration.

## Where decisions live

The product decisions, architecture, security model and roadmap are in the Obsidian vault (written in French, source of truth):
`C:\Ebrain_os\ebrain\20_PROJECTS\ACTIVE\form_ai_agent\` — read `HANDOFF.md` first, then `PROJECT_STATE.md`.
Key documents: `01_plan/phase-1-specification/` (PRD, SYSTEM_ARCHITECTURE, SECURITY_ARCHITECTURE, DATABASE_SCHEMA, API_SPECIFICATION, DEVELOPMENT_ROADMAP), `01_plan/ARCHITECTURE_DECISIONS.md` (ADR-001…024), `01_plan/PLAN_TESTS_HORS_LIGNE.md`.
Repository documentation is in **English** (ADR-016); an English version of the key vault documents is still to be written.

## Commands

```bash
pnpm install                 # workspace install (pnpm 11, Node >= 22)
pnpm dev:ext                 # WXT dev build of the extension
pnpm build                   # production build -> apps/extension/.output/chrome-mv3
pnpm typecheck               # strict TypeScript, every package
pnpm test                    # unit tests (vitest)
pnpm test:e2e                # builds the extension, runs Playwright in Chromium (fake backend)
pnpm check:i18n              # every locale must define the same keys as `en`
pnpm check:invariants        # security invariants (no debugger, no broad hosts, no submit action, ...)
pnpm check:licenses          # deny GPL/AGPL/SSPL/unlicensed (JS + Python)
pnpm backup                  # copy 04_code outside the repo (there is still no commit)
pnpm --filter @exponent-fill/dashboard dev   # Vite dev server of the dashboard, proxies /v1 to 127.0.0.1:8010
pnpm --filter @exponent-fill/dashboard build && pnpm --filter @exponent-fill/dashboard test:e2e   # built dashboard in a real Chromium behind the headers + /v1 rewrite of vercel.json; needs a backend on EF_E2E_BACKEND_URL (default :8010)
pnpm --filter @exponent-fill/extension test:e2e   # builds, then Playwright: panel, manifest, and the scan -> review -> fill -> undo flow (fills a fixture page)
# Writer on the 9-library framework bench, with the PRODUCT code (needs spikes/frameworks built):
node spikes/s5-writer-product/build.mjs && REHEARSE_ONLY=s5 REHEARSE_S5_DIR=s5-writer-product/ext node spikes/runner/rehearse-s3-s5.mjs

cd apps/backend
uv sync                      # Python 3.12 pinned (.python-version)
uv run pytest -q             # SQLite in memory
EF_TEST_DATABASE_URL=postgresql+psycopg://... uv run pytest -q   # same suite on a real PostgreSQL (tables dropped and recreated)
uv run ruff check . && uv run ruff format --check .

# Local stack (PostgreSQL 18 + API). Ports bound to 127.0.0.1.
docker compose -f infrastructure/docker/compose.yaml up -d db api
#   API http://127.0.0.1:8010   PostgreSQL 127.0.0.1:5442
# Real-backend integration test (stack must be running):
EF_E2E_REAL_BACKEND=1 pnpm --filter @exponent-fill/extension exec playwright test e2e/backend.integration.spec.ts
```

## Layout

```
apps/extension     WXT + React 19 + TypeScript strict + Tailwind 4 + shadcn/ui (MV3, side panel)
apps/backend       FastAPI + SQLAlchemy 2 + Alembic (Python 3.12, uv); independent domains: identity, vault, documents, privacy, audit (ports in app/ports.py)
apps/dashboard     Vite + React 19 + Tailwind 4 web dashboard (account, personal vault, documents, privacy); FR + EN
packages/shared-types   zod schemas shared by the clients (single source of truth for message/API contracts; contract/vault-enums.json mirrors the Python enums)
packages/form-engine    form detection: labels, stable refs, buttons, taxonomy, value-free serialization (clean-session implementation of OB-01/02/03/04/08)
packages/vault-domain   client-side vault rules: trust display (never promotes), structure-only match fields, review model (states, to-complete, careful pre-ticking), offline cache + idempotent queue
packages/form-writer    writes values and READS THEM BACK; refuses secrets and every commit control; one-level undo snapshot; no submit capability (ADR-023)
packages/fixtures       form fixtures shared by tests
infrastructure/docker   compose.yaml (db + api, local development)
render.yaml        Render Blueprint: API (Docker) + PostgreSQL, Frankfurt (ADR-024); apps/dashboard/vercel.json: dashboard on Vercel
docs/DEPLOYMENT.md deployment procedure, checks, operations (English)
scripts            repository scripts (our own code only)
spikes             THROWAWAY measurement code (S1–S10), fixtures, offline rehearsal — never imported by apps/ or packages/
```

`spikes/` has its own sub-workspaces (`frameworks/`, `liteparse/`, `s10/`) with their own lockfiles; do not merge their dependencies into the product lockfile.
pnpm 11 refuses releases younger than `minimumReleaseAge` (1 day): **never add `minimumReleaseAgeExclude` entries** — pin an older version instead.
`pnpm spikes:rehearse` runs the spike skeletons end to end (offline).
Create a new package only when it has a clear responsibility.

## Hard rules (security invariants — tests enforce several of them)

1. **No `debugger` permission** and **no broad host access at install time** (ADR-003, ADR-004). The manifest hook in `wxt.config.ts` and `e2e/sidepanel.spec.ts` guard this. Site access is requested per site at runtime.
2. **No command that submits, pays, signs or deletes.** The execution layer only fills, selects, checks and uploads; the user submits on the page. Level 3 actions need explicit, separate confirmation (ADR-006).
3. **Page content is untrusted data**, never instructions. Wrap it in escaped `<untrusted_*>` tags before it reaches any model.
4. **The LLM never sees personal values** (ADR-005): it receives form *structure* and returns *references* to vault keys; values are substituted locally.
5. **Never fill, store or send passwords, one-time codes or card security codes.**
6. **Never solve or bypass CAPTCHAs.** Hand control back to the user.
7. **Every message is validated** (zod) on receipt; the service worker checks the sender id *and* that the sender URL is an extension page.
8. The service worker holds **no state in memory** (it can stop after ~30 s).
9. **No telemetry** by default (ADR-014). No secrets in the repository or in logs.
10. Keep verification inside the extension's isolated world; never rely on markers a web page could write.

## Personal Knowledge Vault rules (ADR-019/020/021 — tests enforce them)

- **Server = source of truth; the extension only caches usable, non-sensitive facts.** Reach vault data only through `VaultService`.
- **Never turn an uncertain fact into a verified one.** A fact is *usable* only if `validated` + no open conflict + not secret + (sensitive => verification >= `user_confirmed`). Only a human validates (web session, or a device with the explicit `vault.validate` scope). Extracted/inferred facts start `pending_review`.
- Secrets (passwords, OTP, card codes) are **never stored**. Sensitive facts are masked and **never** shareable with an AI model (`ai_shareable` is forced to false).
- Values are encrypted (AES-256-GCM, per-user DEK under `EF_MASTER_KEY`); dedup/conflicts use HMAC fingerprints. The audit log records **no values** and is append-only. Never log a fact value.
- Sessions are opaque tokens (hash stored), cookie `ef_session` + CSRF double-submit; devices use Bearer tokens with scopes. **No CORS by default; never `*`.**
- Domains talk through ports (`ports.py`, `domains/lifecycle.py`), never through each other's tables.

## Mapping and filling rules (ADR-022/023 — tests and `check:invariants` enforce them)

- **The type classifier is the least trusted layer.** Out of sample it still proposes a wrong type for 18-33 % of trap-heavy labels (`MAPPING_FILL_SPEC` §6): safety rests on the human review, the server's `usable` rule and careful pre-ticking (`AUTO_CHECK_MIN_CONFIDENCE`), not on classification alone.
- **Any taxonomy change comes with corpus entries** (`packages/form-engine/src/bench/`). When a false positive is found, ADD the case to a corpus; never delete a trap to make the bench pass. `bench.test.ts` must stay at 0 false positives and 0 secret leaks.
- **The model (if any) sees structure only** (escaped `<untrusted_text>`), reclassifies only `unknown` fields, never overrides a deterministic type, never yields a secret type; a bad answer or an error leaves the fields untouched. The provider adapter is not built (spike S9).
- **The writer never commits**: no `submit`/`requestSubmit`, no key presses (Enter submits), never presses a button, link or `role=button` (not even as a side effect of choosing an option). Refused fields stay refused even if the review proposed them.
- **A write is claimed only after an exact read-back.** A page that rewrites the value, rejects it or does not keep it is a `failed` result, never `written`. Result codes carry no value; the panel text may.
- **Nothing is written without the user's "Fill" click after the review.** A ticked suggestion is approved for that fill only; it never validates the fact in the vault (R2).
- **The undo snapshot lives in the page's isolated world** (never sent, never stored). The local audit history records no value, no fact value and no writer reason text.

## Deployment rules (ADR-024 — `tests/test_deploy_config.py` enforces several of them)

- **Production = Vercel (static dashboard) + Render (API + PostgreSQL).** The browser talks to ONE origin: Vercel forwards `/v1` to the API, so `SameSite=Lax` cookies, CSRF and "no CORS" stay as they are. Never add `*` or a dashboard origin to CORS to "make it work".
- **`EF_MASTER_KEY` is supplied by the owner** (`sync: false`), never generated by the host, never in the repository; losing or changing it makes all data unreadable. `render.yaml` holds no secret and every `EF_*` key in it must be a real setting.
- **Production refuses to start** without a master key or with SQLite (SQLite shares one connection across threads: it can crash the process). Use PostgreSQL; `postgres://` and `postgresql://` URLs are normalised for psycopg 3.
- **Documents live encrypted in the database** (`EF_BLOB_BACKEND=db`, `stored_blobs`): the container disk is ephemeral. Do not rely on `storage_dir` in production.
- **Strict CSP on the dashboard** (no inline script, no `eval`, `connect-src 'self'`). Import `./zod-config` FIRST in an entry file so zod runs `jitless`; otherwise the CSP reports a `new Function` probe as a violation. Re-run the dashboard e2e after changing `vercel.json` or the build.
- Real Render and Vercel have NOT been exercised: request-size limits of the proxied `/v1`, plan ids and cookie pass-through are unverified (`docs/DEPLOYMENT.md` §6). Never deploy, create a paid service or push without the owner's explicit go-ahead.

## Conventions

- TypeScript `strict` + `noUncheckedIndexedAccess`; validate every external input; `zod` for contracts.
- **No hard-coded UI strings**: use `t()` from `src/lib/i18n.ts`; add keys to **both** `en` and `fr`.
- Tests for business logic. An unknown value is left **empty** rather than guessed; a wrong personal value is worse than an empty field.
- Python: ruff (lint + format), type hints, Pydantic models mirrored by the zod schemas.
- Prefer small, verified increments; keep the build green.
- Develop **offline-capable**: `pnpm install --offline --frozen-lockfile`, `uv sync --offline --frozen` and `docker compose up` with local images must keep working (spikes are done on a flight).

## Reference material

- **Licensed references (MIT/Apache-2.0)** may be read: `C:\Ebrain_os\references-externes\licencie\`. Adopting code requires the procedure in the vault (`LICENSE_AUDIT.md` §4): read the whole file, attribution header, entry in `THIRD_PARTY_NOTICES.md`.
- **⛔ OpenBUA is unlicensed. Implementation sessions MUST NOT read** `C:\Ebrain_os\references-externes\non-licencie\` **nor** the vault's `OPENBUA_REFERENCE.md`. Work only from the sanitised behavioural specifications in the vault's `COMPONENT_REUSE_MATRIX.md` §B-OB (OB-01…OB-15). Never copy, translate or paraphrase its code. Do not run anything from reference folders.
- A session that has read the OpenBUA analysis is **contaminated** and must not write the OB-xx components (upload, autocomplete, read-back, resubmission guard, submission-outcome proof…).

## Git

- **Exhorte is the sole author** of every commit and pull request: never add `Co-Authored-By`, "Generated with…" or any attribution line; never change the git identity.
- Commit or push **only when Exhorte asks**. Never rewrite pushed history, never force-push, never use `--no-verify`.
- The repository is **private**; never make it public without an audit of the whole history (ADR-017).
