// Throwaway rehearsal runner: exercises the spike skeletons end to end in Playwright's Chromium, offline.
//
//   node spikes/runner/rehearse.mjs            (from the repo root, or `pnpm --filter ./spikes/runner rehearse`)
//   REHEARSE_S6_TOTAL=20 (seconds per S6 variant, default 20)   REHEARSE_SKIP_S6=1
//
// What it CAN verify: fixtures, S1 messaging, S2 plumbing (executeScript, frames, dynamic registration), S4, S7, S6 timing.
// What it CANNOT verify: the S2 permission PROMPT (browser UI, not automatable) and anything specific to Chrome 157 stable.
// For the run, host access to localhost origins is pre-granted in a TEMPORARY copy of the extension manifest.

import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const spikes = path.resolve(here, "..");
const S6_TOTAL = Number(process.env.REHEARSE_S6_TOTAL ?? 20);
const BASE = "http://localhost:5800";
const report = [];
const children = [];

function record(name, ok, detail) {
  report.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  " + (typeof detail === "string" ? detail : JSON.stringify(detail)) : ""}`);
}

async function waitFor(url, ms = 10000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try { const r = await fetch(url); if (r.ok) return true; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}

function start(script, args = []) {
  const child = spawn(process.execPath, [path.join(spikes, "server", script), ...args], { stdio: ["ignore", "pipe", "pipe"] });
  child.stdout.on("data", () => {});
  child.stderr.on("data", (d) => process.stderr.write(`[${script}] ${d}`));
  children.push(child);
  return child;
}

async function main() {
  // ---- servers ---------------------------------------------------------------------------------------------
  start("serve.mjs");
  start("fake-llm.mjs");
  record("fixture server up", await waitFor(`${BASE}/whoami`));
  record("fake LLM server up", await waitFor("http://127.0.0.1:5810/health"));

  // NOTE: *.localhost is resolved by the browser itself (RFC 6761); Node/curl on Windows do not resolve it. Checked in-browser below.
  const gen = await fetch(`${BASE}/gen/file?mb=1&seed=1`);
  const body = Buffer.from(await gen.arrayBuffer());
  record("deterministic test file: size and SHA-256 header match",
    body.length === 1024 * 1024 && gen.headers.get("x-sha256") === createHash("sha256").update(body).digest("hex"));

  // ---- extension copy with localhost host access pre-granted (only for this run) ------------------------------
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ef-spikes-ext-"));
  fs.cpSync(path.join(spikes, "ext"), tmp, { recursive: true });
  const manifestPath = path.join(tmp, "manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  manifest.host_permissions = [...manifest.host_permissions, "http://localhost/*", "http://127.0.0.1/*", "http://*.localhost/*"];
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "ef-spikes-profile-"));
  const context = await chromium.launchPersistentContext(profile, {
    channel: "chromium",
    args: [`--disable-extensions-except=${tmp}`, `--load-extension=${tmp}`],
  });
  try {
    let [sw] = context.serviceWorkers();
    sw ??= await context.waitForEvent("serviceworker");
    const extId = new URL(sw.url()).host;
    record("spike extension loaded (service worker up)", /^[a-p]{32}$/.test(extId), extId);

    // Panel as a normal tab (the real side panel cannot be driven by Playwright), then a fixture tab that becomes active.
    const P = await context.newPage();
    await P.goto(`chrome-extension://${extId}/sidepanel.html`);
    const F = await context.newPage();

    async function go(url) {
      await F.goto(url);
      await F.bringToFront();
      await P.waitForFunction((u) => document.getElementById("s2-tab").textContent.startsWith(u), url, { timeout: 8000 }).catch(() => {});
    }
    async function run(buttonId, spike, testPart, timeoutMs = 15000) {
      const before = await P.evaluate(() => globalThis.__efResults.length);
      await P.click(`#${buttonId}`);
      const handle = await P.waitForFunction(({ n, spike, testPart }) =>
        globalThis.__efResults.slice(n).find((r) => r.spike === spike && r.test.includes(testPart) && r.ok !== undefined),
      { n: before, spike, testPart }, { timeout: timeoutMs });
      return handle.jsonValue();
    }
    const check = (name, entry, extra = (e) => true) => record(name, entry.ok === true && extra(entry), entry.data);

    // Several origins from one process: the browser resolves *.localhost to loopback by itself.
    for (const host of ["a.localhost", "b.localhost", "127.0.0.1"]) {
      await F.goto(`http://${host}:5800/whoami`);
      const j = JSON.parse(await F.locator("body").innerText());
      record(`origin ${host}:5800 answers (distinct origin, same server)`, j.host === `${host}:5800`, j.host);
    }

    // ---- S5 fixture bench: do the framework pages build, run and update THEIR OWN state under real typing? --------------------
    // (This validates the FIXTURES with Playwright's trusted input; the filler under test is not written yet.)
    const fxErrors = [];
    F.on("pageerror", (e) => fxErrors.push(String(e)));
    const fx = [
      ["react-basic", "/fx/pages/react-basic.html", async () => { await F.fill("#first", "Zed"); await F.selectOption("#country", "SN"); }, /"first":"Zed".*"country":"SN"/],
      ["vue-basic", "/fx/pages/vue-basic.html", async () => { await F.fill("#first", "Zed"); await F.check("input[value=student]"); }, /"first":"Zed".*"status":"student"/],
      ["angular-basic", "/fx/angular-basic.html", async () => { await F.fill("#first", "Zed"); await F.fill("#email", "z@example.com"); }, /"first":"Zed".*"email":"z@example.com"/],
      ["react-mui", "/fx/pages/react-mui.html", async () => { await F.fill("#mui-name", "Zed"); }, /"name":"Zed"/],
      ["react-select", "/fx/pages/react-select.html", async () => { await F.click("#rs-country"); await F.keyboard.type("Fra"); await F.keyboard.press("Enter"); }, /"country":"FR"/],
      ["antd", "/fx/pages/antd.html", async () => { await F.fill("#name", "Zed"); }, /"name":"Zed"/],
      ["quill", "/fx/pages/quill.html", async () => { await F.click(".ql-editor"); await F.keyboard.type("Hello letter"); }, /Hello letter/],
      ["tiptap", "/fx/pages/tiptap.html", async () => { await F.click(".ProseMirror"); await F.keyboard.type("Hello letter"); }, /Hello letter/],
      ["prosemirror", "/fx/pages/prosemirror.html", async () => { await F.click(".ProseMirror"); await F.keyboard.type("Hello letter"); }, /Hello letter/],
    ];
    for (const [name, url, act, expect] of fx) {
      fxErrors.length = 0;
      try {
        await F.goto(`${BASE}${url}`);
        await F.waitForSelector("#state", { timeout: 8000 });
        await act();
        await F.waitForTimeout(300);
        const state = await F.locator("#state").innerText();
        record(`S5 fixture ${name}: typing updates the framework's own state`, expect.test(state) && fxErrors.length === 0, state.slice(0, 140) + (fxErrors.length ? ` | errors: ${fxErrors[0]}` : ""));
      } catch (e) {
        record(`S5 fixture ${name}: typing updates the framework's own state`, false, String(e).slice(0, 200));
      }
    }

    // ---- S1 ------------------------------------------------------------------------------------------------
    await go(`${BASE}/form-basic.html`);
    check("S1 typed round trip panel→service worker", await run("s1-ping", "S1", "typed round trip"));
    check("S1 content-script sender is rejected by the service worker", await run("s1-fake", "S1", "content-script sender"));

    // ---- S2 plumbing ---------------------------------------------------------------------------------------
    await go(`${BASE}/form-iframe.html`);
    await F.waitForSelector("#fr1");
    await F.waitForTimeout(800);
    const frames = await run("s2-inject", "S2", "executeScript allFrames");
    record("S2 executeScript reaches the top page AND both cross-origin iframes", frames.ok === true && frames.data.length === 3, frames.data.map((f) => f.href));
    const reg = await run("s2-register", "S2", "registerContentScripts");
    record("S2 registerContentScripts accepted", reg.ok === true);
    await F.reload();
    await F.waitForTimeout(500);
    const after = await run("s2-inject", "S2", "executeScript allFrames");
    record("S2 dynamically registered script ran in the top frame after reload", after.data?.some((f) => f.isTop && f.registeredMarker === "1"), after.data?.map((f) => f.registeredMarker));
    await run("s2-unregister", "S2", "unregisterContentScripts");

    // ---- S4 ------------------------------------------------------------------------------------------------
    await go(`${BASE}/shadow-closed.html`);
    const s4 = await run("s4-run", "S4", "closed shadow root");
    check("S4 closed shadow root: found, read, written, read back", s4,
      (e) => e.data.hosts.every((h) => h.outerShadowRootIsNull === true && h.rootAvailable === true));
    record("S4 component's own handler saw the write (page readout)", String(s4.data?.pageReadout ?? "").includes("ACME SARL"), s4.data?.pageReadout);
    await go(`${BASE}/shadow-open.html`);
    check("S4 open + nested (closed → open) shadow roots", await run("s4-open", "S4", "open + nested"));

    // ---- S7 ------------------------------------------------------------------------------------------------
    const derive = await run("s7-derive", "S7", "PBKDF2");
    check("S7 PBKDF2 (600k) + AES-GCM round trip, tamper rejected, < 1 s", derive);
    check("S7 key written to storage.session", await run("s7-session", "S7", "key written"));
    check("S7 content script and page cannot read the key (default access level)", await run("s7-cs", "S7", "content script (isolated)"));
    check("S7 access-level demo: visible only when widened, hidden after reset", await run("s7-level", "S7", "access level demo"));
    check("S7 Argon2id via vendored hash-wasm (WASM allowed by the default MV3 CSP)", await run("s7-argon", "S7", "Argon2id", 20000));

    // ---- S6 (short variants; the real 5-minute run is for the flight) ----------------------------------------
    if (!process.env.REHEARSE_SKIP_S6) {
      await P.fill("#s6-total", String(S6_TOTAL));
      await P.fill("#s6-silence", String(Math.round(S6_TOTAL / 3)));
      await P.fill("#s6-at", "4");
      const hdelay = Number(process.env.REHEARSE_S6_HDELAY ?? 0);
      await P.fill("#s6-hdelay", String(hdelay));
      const t = (S6_TOTAL + hdelay + 25) * 1000;
      const want = (process.env.REHEARSE_S6_VARIANTS ?? "a,b,c,d").split(",");
      const tag = hdelay ? ` [headers delayed ${hdelay}s]` : "";
      if (want.includes("a")) check("S6 (a) fetch from the panel page" + tag, await run("s6-panel", "S6", "(a) fetch from the panel page: end", t));
      if (want.includes("b")) check("S6 (b) fetch inside the service worker" + tag, await run("s6-sw", "S6", "(b) fetch inside the service worker, no keep-alive end", t + 20000));
      if (want.includes("c")) check("S6 (c) service worker + keep-alive port" + tag, await run("s6-port", "S6", "(c) fetch inside the service worker + keep-alive port end", t + 20000));
      if (want.includes("d")) check("S6 (d) offscreen document" + tag, await run("s6-offscreen", "S6", "(d) offscreen fetch: end", t));
    } else {
      record("S6 skipped by REHEARSE_SKIP_S6", true);
    }

    // ---- fixtures: nothing must leave the page ---------------------------------------------------------------
    await go(`${BASE}/trap-submit.html`);
    await F.click("#pay");
    record("fixture trap-submit: submit is intercepted (page did not navigate)", F.url().endsWith("/trap-submit.html") && (await F.getAttribute("body", "data-commits")) === "1");

    const all = await P.evaluate(() => globalThis.__efResults);
    fs.writeFileSync(path.join(here, "last-run.json"), JSON.stringify({ at: new Date().toISOString(), report, panelResults: all }, null, 2));
  } finally {
    await context.close().catch(() => {});
    fs.rmSync(profile, { recursive: true, force: true });
    fs.rmSync(tmp, { recursive: true, force: true });
    for (const c of children) c.kill();
  }

  const failed = report.filter((r) => !r.ok);
  console.log(`\n${report.length - failed.length}/${report.length} checks passed`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => { console.error(e); for (const c of children) c.kill(); process.exit(2); });
