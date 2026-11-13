# Deployment: dashboard on Vercel, API and database on Render

Decision record: ADR-024 (vault). Files: [`render.yaml`](../render.yaml), [`apps/dashboard/vercel.json`](../apps/dashboard/vercel.json).

```
Browser ── https://<dashboard>.vercel.app ──► Vercel: static dashboard (apps/dashboard/dist)
              │  /v1/*  (rewrite, server to server)
              ▼
          Render (Frankfurt): exponent-fill-api (Docker)  ──private network──►  exponent-fill-db (PostgreSQL 18)
                ▲
Chrome extension (Bearer device token, direct, host permission = the API origin)
```

The browser only ever talks to ONE origin (Vercel); `/v1` is forwarded to the API. That is what keeps the `SameSite=Lax` session cookie, the CSRF double-submit and "no CORS" working unchanged. The extension calls the API directly with its device token.

## 0. Before anything

* **The code must be in a Git repository** that Render and Vercel can read: `04_code/` is the repository root and has **no commit yet**. Creating the GitHub repository (private, ADR-017) and the first commit are the owner's decisions.
* Generate the **master key** once, keep it outside the repository (password manager + an offline copy):

  ```bash
  python -c "import os,base64;print(base64.b64encode(os.urandom(32)).decode())"
  ```

  It protects every user's data key. **Losing it, or changing it later, makes every stored fact and document unreadable.** There is no rotation tool yet.

## 1. API and database on Render

1. Render dashboard → **New → Blueprint** → pick the repository (root `render.yaml`).
2. Render asks for `EF_MASTER_KEY` (declared `sync: false`): paste the key. Everything else is in the file.
3. Check the service: logs show `alembic upgrade head` then Uvicorn; `https://<service>.onrender.com/health` answers `{"status":"ok","database":"ok"}`.
4. If the service URL is not `https://exponent-fill-api.onrender.com` (Render adds a suffix when the name is taken), update the rewrite destination in `apps/dashboard/vercel.json` (and the matching assertion in `apps/backend/tests/test_deploy_config.py`).

What the Blueprint sets: `EF_ENV=prod` (master key required, secure cookies), `EF_BLOB_BACKEND=db` (documents stored encrypted in PostgreSQL, the container disk is ephemeral), `EF_ENABLE_DOCS=false`, `EF_DATABASE_URL` from the database's private connection string, region **Frankfurt**, database closed to the outside (`ipAllowList: []`; add your own address to run `psql` or `pg_dump` from your machine). **The Blueprint uses the FREE plans (the owner's choice, 2026-11-13): demo data only.** A free database is deleted about 30 days after its creation (Render suspends it, then deletes it) and has no backups; a free web service sleeps after 15 minutes without traffic, so the first request afterwards waits about a minute (the dashboard may show "the server cannot be reached": retry), and it shares the workspace's monthly free instance hours with the other free services. Render also limits free databases per workspace (the account already holds free databases for other projects: if the plan is refused for that reason, free a slot or use a paid plan). To keep real data, set both plans to a paid one and add a payment method to the Render account.

## 2. Dashboard on Vercel

1. Vercel → **Add New Project** → same repository.
2. **Root Directory: `apps/dashboard`**, keep "Include source files outside of the Root Directory" enabled (the dashboard imports workspace packages). The install and build commands are in `vercel.json` and run from the repository root with pnpm.
3. The repository pins `packageManager: pnpm@11.8.0`. **Verified on 2026-11-13**: Vercel detects it from `package.json`, installs the monorepo with `pnpm install --frozen-lockfile` and builds with `vite build`; no environment variable is needed.
4. Deploy. No environment variable is needed: the API address lives in `vercel.json`.

`vercel.json` also sends the security headers and a strict Content-Security-Policy (`default-src 'self'`, no inline script, no `eval`; see `apps/dashboard/src/zod-config.ts` for why zod runs `jitless`).

## 3. Extension

Build it against the production API and load/package it:

```bash
WXT_BACKEND_URL=https://<service>.onrender.com pnpm build
```

The manifest then allows exactly that origin (`check:invariants` and `e2e/sidepanel.spec.ts` keep it that way). Create a device token in the dashboard (Account → devices) and paste it in the panel.

## 4. Checks after the first deploy

* `/health` OK on Render; the dashboard opens, **Sign in / Create account** work.
* Browser dev tools → Application → Cookies on the Vercel domain: `ef_session` is `HttpOnly`, `Secure`, `SameSite=Lax`; no CSP error in the console.
* Create an account, add a fact, **upload a PDF** (the API limit is `max_upload_mb`, 20 by default). **If the upload is refused through Vercel, that is Vercel's request-size limit on proxied requests, which was not verified**: the fallback is to let the dashboard call the API origin directly for uploads (needs CORS and a code change) or to host the dashboard and the API behind one reverse proxy (the "one server" option of ADR-024).
* The sign-out button works (it is a CSRF-protected write).

## 5. Operating it

* **Backups**: none on the free database. On a paid plan, Render's backups depend on the plan (check retention in the dashboard); documents live in the same database, so one backup covers both. Back up the **master key separately**: without it a restored database is unreadable.
* **Deletion**: deleting a document or an account removes the rows (documents are overwritten then deleted), but provider backups keep older copies until they expire. Say so in the privacy notice.
* **E-mail**: there is **no SMTP adapter**; e-mails (password reset, verification) go to the `email_outbox` table and are NOT delivered. A forgotten password cannot be recovered by the user yet.
* **Rollback**: Render → redeploy a previous deploy; Vercel → promote a previous deployment. A database downgrade below `0003` drops `stored_blobs` and therefore **every uploaded document**: never do it on real data.
* Logs contain no personal values (by design); still, review them before sharing.

## 6. What is verified and what is not

Verified locally (see `HANDOFF.md`): the backend image starts in production mode on an imposed `PORT`, migrations `0001` to `0003` apply and downgrade on PostgreSQL 18 (also with a `postgres://` URL), the whole backend suite passes on SQLite and on PostgreSQL 18, documents round-trip as ciphertext through the database store, production refuses to start without a master key or with SQLite, and the built dashboard works in a real Chromium behind the headers and the `/v1` rewrite of the real `vercel.json` (`apps/dashboard`: `pnpm test:e2e`, needs a backend on `EF_E2E_BACKEND_URL`).

**Verified on the real Vercel (2026-11-13)**: the project builds from the monorepo (pnpm 11.8.0) and the production alias serves the security headers and the CSP of `vercel.json`. **Not verified**: Render (the Blueprint is created but cannot be planned until a payment method is added to the Render account); Vercel's behaviour on large or slow proxied requests and its cookie pass-through (the API did not exist yet; only a local stand-in was used); Render prices; SMTP; custom domain and TLS; monitoring and alerting; an independent security review (required before real personal data).
