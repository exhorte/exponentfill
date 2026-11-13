import { expect, test, type Page } from "@playwright/test";
import { startVercelLike, type Rig } from "./vercel-like-server";

/**
 * The deployment model of the dashboard (ADR-024), in a real Chromium: the BUILT dashboard behind the headers and the `/v1`
 * rewrite of the real vercel.json, talking to a REAL backend. Needs `pnpm --filter @exponent-fill/dashboard build` first and a
 * backend on EF_E2E_BACKEND_URL (default http://127.0.0.1:8010), e.g. the Docker stack or
 * `EF_ENV=prod EF_MASTER_KEY=<base64> EF_DATABASE_URL=sqlite+pysqlite:///x.db uvicorn app.main:app --port 8010` in apps/backend.
 */
const BACKEND = process.env.EF_E2E_BACKEND_URL ?? "http://127.0.0.1:8010";
let rig: Rig;

test.beforeAll(async () => {
  const health = await fetch(`${BACKEND}/health`).catch(() => null);
  if (!health?.ok) throw new Error(`No backend answers on ${BACKEND}: start it first (see the header of this file).`);
  rig = await startVercelLike(BACKEND);
});
test.afterAll(async () => {
  await rig?.close();
});

/** Records every CSP violation and every console error of the page. */
async function watch(page: Page): Promise<{ violations: () => Promise<string[]>; errors: string[] }> {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.addInitScript(() => {
    (window as unknown as { __csp: string[] }).__csp = [];
    document.addEventListener("securitypolicyviolation", (e) => (window as unknown as { __csp: string[] }).__csp.push(`${e.violatedDirective} ${e.blockedURI}`));
  });
  return { violations: () => page.evaluate(() => (window as unknown as { __csp: string[] }).__csp), errors };
}

const email = () => `e2e-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;

test("serves the dashboard under the strict CSP with the security headers, and nothing is blocked", async ({ page }) => {
  const seen = await watch(page);
  const res = await page.goto(rig.url);
  const h = res!.headers();
  expect(h["content-security-policy"]).toContain("default-src 'self'");
  expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(h["x-frame-options"]).toBe("DENY");
  expect(h["x-content-type-options"]).toBe("nosniff");
  expect(h["referrer-policy"]).toBe("no-referrer");

  await expect(page.getByRole("heading", { name: "Exponent Fill" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  expect(await seen.violations()).toEqual([]);
  expect(seen.errors.filter((e) => !/401/.test(e))).toEqual([]); // the anonymous session probe answers 401: expected
});

test("registers through the rewrite on ONE origin, with correct cookies and CSRF-protected writes", async ({ page, context }) => {
  const seen = await watch(page);
  await page.goto(`${rig.url}/#/register`);
  await page.getByLabel("Name").fill("E2E User");
  await page.getByLabel("E-mail").fill(email());
  await page.getByLabel("Password").fill("correct horse battery 42 e2e");
  const before = rig.forwarded();
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("navigation", { name: "Main" })).toBeVisible({ timeout: 20_000 });
  expect(rig.forwarded()).toBeGreaterThan(before); // /v1 really went through the rewrite

  // Cookies: set on the dashboard's own origin, the session one HttpOnly, both SameSite=Lax.
  const cookies = Object.fromEntries((await context.cookies(rig.url)).map((c) => [c.name, c]));
  expect(cookies.ef_session).toMatchObject({ httpOnly: true, sameSite: "Lax" });
  expect(cookies.ef_csrf).toMatchObject({ httpOnly: false, sameSite: "Lax" });
  expect(await page.evaluate(() => document.cookie.includes("ef_session"))).toBe(false); // the session token is invisible to scripts

  // A write WITHOUT the CSRF header is refused, and the session survives; the UI's own writes carry the header.
  const noCsrf = await page.evaluate(async () => {
    const r = await fetch("/v1/auth/logout", { method: "POST", credentials: "same-origin" });
    return { status: r.status, code: ((await r.json()) as { error: { code: string } }).error.code };
  });
  expect(noCsrf).toEqual({ status: 401, code: "csrf_failed" });
  expect(await page.evaluate(async () => (await fetch("/v1/auth/session", { credentials: "same-origin" })).status)).toBe(200);

  // API answers keep their own cache policy through the proxy, next to the dashboard's security headers.
  const probe = await page.evaluate(async () => {
    const r = await fetch("/v1/auth/session", { credentials: "same-origin" });
    return { cache: r.headers.get("cache-control"), type: r.headers.get("content-type") };
  });
  expect(probe.cache).toBe("no-store");

  await page.getByRole("button", { name: "Sign out" }).click(); // UI write with the CSRF header
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  expect(await seen.violations()).toEqual([]);
  expect(seen.errors.filter((e) => !/401/.test(e))).toEqual([]);
});

test("every dashboard section renders under the CSP after sign-in", async ({ page }) => {
  const seen = await watch(page);
  await page.goto(`${rig.url}/#/register`);
  await page.getByLabel("E-mail").fill(email());
  await page.getByLabel("Password").fill("correct horse battery 42 e2e");
  await page.getByRole("button", { name: "Create account" }).click();
  const nav = page.getByRole("navigation", { name: "Main" });
  await expect(nav).toBeVisible({ timeout: 20_000 });

  const sections = (await nav.getByRole("link").all()).length;
  expect(sections).toBe(12);
  for (let i = 0; i < sections; i++) {
    await nav.getByRole("link").nth(i).click();
    await expect(page.getByRole("main")).toBeVisible();
    await page.waitForTimeout(150);
  }
  expect(await seen.violations()).toEqual([]);
  expect(seen.errors.filter((e) => !/401/.test(e))).toEqual([]);
});
