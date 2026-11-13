# Third-party notices

**No third-party source code has been copied or adapted into the product (`apps/`, `packages/`).**

## Vendored in throwaway spike code only

| Component | Where | License | Notes |
|---|---|---|---|
| hash-wasm 4.12.0 — `dist/argon2.umd.min.js` (Argon2id as WebAssembly) | `spikes/ext/vendor/` (license text: `hash-wasm.LICENSE`) | MIT | Copied by `spikes/vendor-copy.mjs` for spike S7 only. Not part of the product; re-evaluate before any adoption. |

Dependencies installed through package managers keep their own licenses (see `pnpm-lock.yaml` and `apps/backend/uv.lock`).

**Provisional exception (2026-11-12): `psycopg` / `psycopg-binary` (LGPL-3.0)**, the PostgreSQL driver of the backend. Accepted only while the backend runs on our own servers (no redistribution) and the library is used unmodified; allowed with a written reason in `apps/backend/scripts/check_licenses.py`. To be confirmed by Exhorte, and reconsidered (e.g. `asyncpg`, Apache-2.0) if the backend is ever shipped to customers. See the vault's `LICENSE_AUDIT.md`.

## Procedure for adapting third-party code

For every adapted component, add a block here **and** a header comment in each adapted file:

```
// Adapted from <owner/repo> @ <commit> — <path in the original repository>
// License: <MIT | Apache-2.0>. Modifications: <short list>.
```

Each block records: name, URL, commit, license, full license text (and the contents of any `NOTICE` file for Apache-2.0), and the files concerned.

Only permissive licenses (MIT, Apache-2.0) are accepted. **No code from unlicensed projects is ever adapted** (see `CLAUDE.md`).
