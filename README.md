# Exponent Fill (working name)

An AI-assisted Chrome extension that understands web forms, proposes values from a personal, source-tracked vault, fills the fields, verifies the result and **stops before anything binding**. The user stays in control.

> **Status:** Phase 2 (foundation). The extension, its backend and the local database are connected; form detection starts in Phase 3. See `PROJECT_STATE.md`.
> **License:** proprietary, all rights reserved (private repository). Copyright holder to be confirmed.

## Quick start

Requirements: Node >= 22, pnpm 11, Python 3.12 + [uv](https://docs.astral.sh/uv/), Docker, Chrome.

```bash
pnpm install
pnpm build                     # -> apps/extension/.output/chrome-mv3
# Chrome -> chrome://extensions -> Developer mode -> Load unpacked -> choose that folder

docker compose -f infrastructure/docker/compose.yaml up -d db api   # API on http://127.0.0.1:8010
```

Open the side panel from the toolbar icon: it shows the backend and database status.

## Tests

```bash
pnpm typecheck && pnpm test && pnpm check:i18n
pnpm test:e2e                                  # Playwright, extension loaded in Chromium
(cd apps/backend && uv run pytest -q)
```

## Structure

`apps/extension` (WXT, React, TypeScript) · `apps/backend` (FastAPI) · `packages/shared-types` (zod contracts) · `infrastructure/docker` · see `CLAUDE.md` for the rules that govern the code.

## Third-party code

See `THIRD_PARTY_NOTICES.md`.
