import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { test as base, chromium, expect, type BrowserContext, type Page } from "@playwright/test";

/**
 * Phase 5-6 end to end, in a real Chromium, with the BUILT extension: scan a fixture page -> ask the (fake) vault -> review ->
 * write the ticked fields -> read back -> undo -> audit. The ONLY departure from the real extension is a temporary copy of the
 * manifest that grants host access to localhost (a toolbar click, i.e. activeTab, cannot be automated); the real manifest is
 * checked in sidepanel.spec.ts.
 */
// Only used inside page.evaluate callbacks, which run in the extension page.
declare const chrome: { storage: { local: { set(o: Record<string, unknown>): Promise<void>; get(k: string): Promise<Record<string, unknown>> } } };
const PAGES = path.resolve(import.meta.dirname, "../../../packages/fixtures/pages");
const BUILD = path.resolve(import.meta.dirname, "../.output/chrome-mv3");
const en = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, "../public/_locales/en/messages.json"), "utf8")) as Record<string, { message: string }>;
const msg = (k: string) => en[k]!.message;

const FACT = (key: string, value: string | null, over: object = {}) => ({
  fact_id: "11111111-1111-4111-8111-111111111111", key, value, trust_class: "declared", validation_status: "validated", usable: true, needs_confirmation: false, reason: "usable", sources_count: 1, ...over,
});

/** What the fake vault knows, by semantic type: usable facts (fill), an unvalidated one (suggest), a conflicted one, and a sensitive masked one. */
function answer(semantic: string) {
  switch (semantic) {
    case "first_name": return { decision: "fill", reason: "usable", candidates: [FACT("personal.first_name", "Awa")] };
    case "last_name": return { decision: "fill", reason: "usable", candidates: [FACT("personal.last_name", "Ndiaye-Lé")] };
    case "email": return { decision: "fill", reason: "usable", candidates: [FACT("contact.email", "awa@example.com")] };
    case "phone": return { decision: "fill", reason: "usable", candidates: [FACT("contact.phone", "+221 77 000 00 00")] };
    case "city": return { decision: "fill", reason: "usable", candidates: [FACT("contact.city", "Dakar")] };
    case "country": return { decision: "fill", reason: "usable", candidates: [FACT("contact.country", "Senegal")] };
    case "postal_code": return { decision: "suggest", reason: "pending_review", candidates: [FACT("contact.postal_code", "10000", { usable: false, validation_status: "pending_review", trust_class: "extracted", reason: "pending_review" })] };
    case "address_line1": return { decision: "suggest", reason: "open_conflict", candidates: [FACT("contact.address_line1", "WRONG-ADDRESS", { usable: false, reason: "open_conflict" })] };
    case "date_of_birth": return { decision: "suggest", reason: "sensitive_unconfirmed", candidates: [FACT("personal.date_of_birth", null, { usable: false, reason: "sensitive_unconfirmed" })] };
    case "consent": return { decision: "none", reason: "consent_requires_user", candidates: [] };
    default: return { decision: "none", reason: "no_mapping", candidates: [] };
  }
}

interface Rig { matchBodies: string[]; close: () => Promise<void> }
async function startServers(): Promise<Rig> {
  const matchBodies: string[] = [];
  const backend = http.createServer((req, res) => {
    if (req.method === "POST" && req.url === "/v1/vault/match") {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        matchBodies.push(body);
        const fields = (JSON.parse(body) as { fields: { id: string; semantic_type: string }[] }).fields;
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ matches: fields.map((f) => ({ field_id: f.id, ...answer(f.semantic_type) })), seq: 1 }));
      });
    } else {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ status: "ok", version: "test", database: "ok" }));
    }
  });
  const pages = http.createServer((req, res) => {
    const name = decodeURIComponent((req.url ?? "/").split("?")[0]!).replace(/^\/+/, "") || "form-basic.html";
    const file = path.join(PAGES, name);
    if (!file.startsWith(PAGES) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return void res.writeHead(404).end();
    res.writeHead(200, { "content-type": file.endsWith(".css") ? "text/css" : "text/html; charset=utf-8" });
    res.end(fs.readFileSync(file));
  });
  await new Promise<void>((r) => backend.listen(8010, "127.0.0.1", r));
  await new Promise<void>((r) => pages.listen(5830, "127.0.0.1", r));
  // The browser keeps HTTP connections alive: close() alone would wait for them (minutes), so drop them first.
  const stop = (s: http.Server) => new Promise<void>((r) => { s.closeAllConnections(); s.close(() => r()); });
  return { matchBodies, close: async () => { await stop(backend); await stop(pages); } };
}

const test = base.extend<{ context: BrowserContext; extensionId: string }>({
  // eslint-disable-next-line no-empty-pattern
  context: async ({}, use) => {
    const copy = fs.mkdtempSync(path.join(os.tmpdir(), "ef-e2e-ext-"));
    fs.cpSync(BUILD, copy, { recursive: true });
    const mpath = path.join(copy, "manifest.json");
    const manifest = JSON.parse(fs.readFileSync(mpath, "utf8")) as { host_permissions: string[] };
    manifest.host_permissions.push("http://127.0.0.1:5830/*"); // test harness only
    fs.writeFileSync(mpath, JSON.stringify(manifest));
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), "ef-e2e-prof-"));
    const context = await chromium.launchPersistentContext(profile, { channel: "chromium", args: [`--disable-extensions-except=${copy}`, `--load-extension=${copy}`] });
    await use(context);
    await context.close();
    fs.rmSync(profile, { recursive: true, force: true });
    fs.rmSync(copy, { recursive: true, force: true });
  },
  extensionId: async ({ context }, use) => {
    let [worker] = context.serviceWorkers();
    worker ??= await context.waitForEvent("serviceworker");
    await use(new URL(worker.url()).host);
  },
});

async function open(context: BrowserContext, extensionId: string, pageName: string): Promise<{ panel: Page; site: Page }> {
  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await panel.evaluate(() => chrome.storage.local.set({ "ef.device.token": "efd_e2e" }));
  const site = await context.newPage();
  await site.goto(`http://127.0.0.1:5830/${pageName}`);
  await site.bringToFront(); // the panel reads "the tab the user is looking at"
  return { panel, site };
}

test.describe("Phase 5-6: scan, review, fill, read back, undo, audit", () => {
  test.describe.configure({ timeout: 120_000 }); // a background tab is throttled: clicks and scripting are slow
  test("fills only what is ticked, verifies it, never touches secrets, and undoes", async ({ context, extensionId }) => {
    const rig = await startServers();
    try {
      const { panel, site } = await open(context, extensionId, "form-basic.html");
      await site.fill("#notes", "PAGE-CANARY (a value already on the page)");
      await panel.getByRole("button", { name: msg("pageScan") }).click();
      await expect(panel.getByText(msg("stateKnown"), { exact: false }).first()).toBeVisible({ timeout: 15_000 });

      // The vault was asked about STRUCTURE only: no page value, no field value.
      expect(rig.matchBodies).toHaveLength(1);
      expect(rig.matchBodies[0]).not.toContain("PAGE-CANARY");
      expect(rig.matchBodies[0]).not.toContain("fixture-token");
      const asked = (JSON.parse(rig.matchBodies[0]!) as { fields: { semantic_type: string }[] }).fields.map((f) => f.semantic_type);
      expect(asked).not.toContain("password");
      expect(asked).not.toContain("one_time_code");

      // Review: "known" fields are pre-ticked, a suggestion and a conflict are not; nothing is written yet.
      const box = (name: string) => panel.getByRole("checkbox", { name: new RegExp(name) });
      await expect(box("First name")).toBeChecked();
      await expect(box("Postal code")).not.toBeChecked(); // suggestion (pending review)
      await expect(box("Street")).toBeDisabled(); // conflict: cannot even be ticked
      await expect(box("Date of birth")).toBeDisabled(); // sensitive and masked: no value
      expect(await site.inputValue("#first")).toBe("");

      // The user also approves the postal code suggestion, FOR THIS FILL ONLY.
      await box("Postal code").check();
      await panel.getByRole("button", { name: new RegExp(msg("fillRun")) }).click();
      await expect(panel.getByText(msg("fillStatusWritten"), { exact: false }).first()).toBeVisible({ timeout: 20_000 });

      // The page itself shows the values (read back from the DOM, not from the panel).
      expect(await site.inputValue("#first")).toBe("Awa");
      expect(await site.inputValue("input[name=last_name]")).toBe("Ndiaye-Lé");
      expect(await site.inputValue("#email")).toBe("awa@example.com");
      expect(await site.inputValue("#phone")).toBe("+221 77 000 00 00");
      expect(await site.inputValue("#city")).toBe("Dakar");
      expect(await site.inputValue("#country")).toBe("SN");
      expect(await site.inputValue("#zip")).toBe("10000");
      // Never touched: conflicted address, masked birth date, the user's own notes, secrets, hidden and read-only fields.
      expect(await site.inputValue("#street")).toBe("");
      expect(await site.inputValue("#dob")).toBe("");
      expect(await site.inputValue("#notes")).toContain("PAGE-CANARY");
      expect(await site.inputValue("#pw")).toBe("");
      expect(await site.inputValue("#otp")).toBe("");
      expect(await site.inputValue("#ro")).toBe("REF-0001");
      expect(await site.locator("input[name=terms]").isChecked()).toBe(false);

      // The audit history recorded the fill WITHOUT any value.
      const audit = JSON.stringify(await panel.evaluate(async () => (await chrome.storage.local.get("ef.audit"))["ef.audit"]));
      expect(audit).toContain("127.0.0.1:5830");
      expect(audit).toContain("written");
      for (const v of ["Awa", "Ndiaye", "awa@example.com", "Dakar", "10000", "PAGE-CANARY"]) expect(audit, `audit must not contain ${v}`).not.toContain(v);

      // Undo restores the previous state of what was written (and nothing else).
      await panel.getByRole("button", { name: msg("fillUndo") }).click();
      // wait for the per-field undo results (a list named after the action), not for a word that the static note also contains
      await expect(panel.getByRole("list", { name: msg("fillUndo") })).toBeVisible({ timeout: 20_000 });
      await expect(panel.getByRole("list", { name: msg("fillUndo") }).getByText(msg("fillRestored"), { exact: false }).first()).toBeVisible();
      expect(await site.inputValue("#first")).toBe("");
      expect(await site.inputValue("#email")).toBe("");
      expect(await site.inputValue("#country")).toBe("");
      expect(await site.inputValue("#zip")).toBe("");
      expect(await site.inputValue("#notes")).toContain("PAGE-CANARY");
    } finally {
      await rig.close();
    }
  });

  test("on a page with traps, nothing is submitted and secrets are never filled", async ({ context, extensionId }) => {
    const rig = await startServers();
    try {
      const { panel, site } = await open(context, extensionId, "trap-submit.html");
      await panel.getByRole("button", { name: msg("pageScan") }).click();
      await expect(panel.getByText(msg("pageCommitButtons"), { exact: false }).first()).toBeVisible({ timeout: 15_000 });
      // Nothing known, nothing ticked: the fill button is disabled, so there is no way to write anything.
      await expect(panel.getByRole("button", { name: new RegExp(msg("fillRun")) })).toBeDisabled();
      expect(await site.evaluate(() => document.body.dataset.commits ?? "0")).toBe("0");
      expect(await site.inputValue("#cc")).toBe("");
      expect(await site.inputValue("#cvc")).toBe("");
    } finally {
      await rig.close();
    }
  });
});
