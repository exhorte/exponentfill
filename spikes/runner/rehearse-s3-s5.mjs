// Throwaway rehearsal for spikes S3 (vault file -> page) and S5 (writer on the framework bench), offline, Playwright Chromium.
//   node spikes/runner/rehearse-s3-s5.mjs                 both
//   REHEARSE_ONLY=s3|s5   REHEARSE_S3_BIG=1 (adds a 50 MB transfer)
// Writes spikes/runner/last-run-s3-s5.json. Host access to localhost origins is granted in TEMPORARY copies of the manifests
// only where the real extension needs no prompt (the permission prompt itself is spike S2).
import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const spikes = path.resolve(here, "..");
const ONLY = process.env.REHEARSE_ONLY ?? "";
const report = [];
const children = [];
const record = (name, ok, detail) => {
  report.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 300) : ""}`);
};
async function waitFor(url, ms = 10000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { try { if ((await fetch(url)).ok) return true; } catch { /* not yet */ } await new Promise((r) => setTimeout(r, 200)); }
  return false;
}
const start = (script, args = []) => {
  const c = spawn(process.execPath, [script, ...args], { stdio: ["ignore", "pipe", "pipe"] });
  c.stdout.on("data", () => {}); c.stderr.on("data", (d) => process.stderr.write(`[${path.basename(script)}] ${d}`));
  children.push(c); return c;
};

async function loadExtension(srcDir) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ef-ext-"));
  fs.cpSync(srcDir, tmp, { recursive: true });
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "ef-prof-"));
  const context = await chromium.launchPersistentContext(profile, { channel: "chromium", args: [`--disable-extensions-except=${tmp}`, `--load-extension=${tmp}`] });
  let [sw] = context.serviceWorkers();
  sw ??= await context.waitForEvent("serviceworker");
  const extId = new URL(sw.url()).host;
  const close = async () => { await context.close().catch(() => {}); fs.rmSync(profile, { recursive: true, force: true }); fs.rmSync(tmp, { recursive: true, force: true }); };
  return { context, extId, close };
}

// ================================================ S3 ==================================================================
async function s3() {
  const S3 = "http://localhost:5821";
  start(path.join(spikes, "ext-s3/server.mjs"));
  record("S3 server up", await waitFor(`${S3}/`));
  const { context, extId, close } = await loadExtension(path.join(spikes, "ext-s3"));
  try {
    const P = await context.newPage();
    await P.goto(`chrome-extension://${extId}/sidepanel.html`);
    const F = await context.newPage();
    const go = async (p) => { await F.goto(`${S3}/${p}`); await F.bringToFront(); await P.waitForFunction((u) => document.getElementById("tab").textContent.startsWith(u), `${S3}/${p}`, { timeout: 8000 }).catch(() => {}); };
    const run = (strategy, mb, target) => P.evaluate(([s, m, t]) => globalThis.__s3Run(s, m, t), [strategy, mb, target]);
    const sizes = process.env.REHEARSE_S3_BIG ? [1, 10, 50] : [1, 10];

    // (a) volume + completeness + (c) placement patterns, two working strategies, shown with timings
    for (const mb of sizes) {
      for (const strategy of ["push", "pull"]) {
        for (const [label, target, out] of [["A visible input", { selector: "#up-a" }, "#out-a"], ["B hidden input", { selector: "#up-b" }, "#out-b"], ["C drop zone", { dropzone: "#drop" }, "#out-c"]]) {
          if (mb === 50 && label !== "A visible input") continue;
          await go("upload-all.html");
          const r = await run(strategy, mb, target);
          await F.waitForFunction((o) => document.querySelector(o).textContent.includes("sha256="), out, { timeout: 20000 }).catch(() => {});
          const pageText = await F.locator(out).innerText();
          record(`S3 ${strategy} ${mb} MB → ${label}: placed AND the page computed the same SHA-256`,
            r.ok === true && pageText.includes(r.expectedSha256), { transferMs: r.transferMs, totalMs: r.totalMs, maxMessageChars: r.maxMessageChars });
        }
      }
    }
    // blob URL: expected to be unusable across origins — a MEASUREMENT, recorded either way
    await go("upload-all.html");
    const bu = await run("bloburl", 1, { selector: "#up-a" });
    record("S3 blob URL strategy measured (expected: blocked across origins)", true, { works: bu.ok, error: bu.error });

    // (b) choose the compatible input among several hidden ones
    await go("upload-multi.html");
    const auto = await run("push", 10, { hint: "cv" });
    const heldBy = await F.evaluate(() => Array.from(document.querySelectorAll("input[type=file]")).filter((i) => i.files.length).map((i) => i.id));
    record("S3 several inputs: the compatible one (cv: .pdf, ≤ 20 MB, single) is chosen, the 1 KB-limit one is excluded", auto.ok === true && heldBy.length === 1 && heldBy[0] === "cv", { heldBy, used: auto.place?.used, candidates: auto.place?.candidates?.map((c) => `${c.label}:${c.ok ? "ok" : c.reasons.join("+")}`) });

    // (d) verification on the site: a visible error is a failure even though the file name is displayed
    await go("upload-reject.html");
    const rej = await run("push", 10, { selector: "#up-r" });
    const previewShown = (await F.locator("#preview").innerText()).includes(".pdf");
    record("S3 late rejection: name previewed but a visible error ⇒ reported as FAILURE", rej.ok === false && rej.place?.reason === "visible-error" && previewShown, { reason: rej.place?.reason, errors: rej.place?.errors });
    await go("upload-reject.html");
    const acc = await run("push", 1, { selector: "#up-r" });
    record("S3 late rejection page: a small file is accepted and reported OK", acc.ok === true);

    // completeness control + cleanup of abandoned transfers
    await go("upload-all.html");
    const integ = await P.evaluate(async () => {
      const { getVaultFile } = await import("./vault-idb.js");
      const rec = await getVaultFile("resume-10mb");
      const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      const call = (func, args) => chrome.scripting.executeScript({ target: { tabId: tab.id }, func, args }).then((r) => r[0].result);
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["s3-content.js"] });
      const bytes = new Uint8Array(await rec.blob.arrayBuffer());
      const meta = { name: rec.name, type: rec.type, size: rec.size, sha256: rec.sha256, fnv1a: rec.fnv1a, lastModified: 1 };
      const b64 = (u) => { let s = ""; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
      const total = Math.ceil(bytes.length / (1024 * 1024));
      const out = {};
      // 1) incomplete: send all but one chunk
      for (let i = 0; i < total - 1; i++) await call((a) => globalThis.__efS3.receiveChunk(a), [{ id: "t-incomplete", idx: i, total, b64: b64(bytes.subarray(i << 20, (i + 1) << 20)), meta }]);
      out.incomplete = await call((i) => globalThis.__efS3.assemble(i), ["t-incomplete"]);
      // 2) corrupted: flip one byte in chunk 0
      for (let i = 0; i < total; i++) {
        const part = bytes.slice(i << 20, (i + 1) << 20);
        if (i === 0) part[0] ^= 1;
        await call((a) => globalThis.__efS3.receiveChunk(a), [{ id: "t-corrupt", idx: i, total, b64: b64(part), meta }]);
      }
      out.corrupt = await call((i) => globalThis.__efS3.assemble(i), ["t-corrupt"]);
      out.before = await call(() => globalThis.__efS3.stats(), []);
      await call((i) => globalThis.__efS3.abort(i), ["t-incomplete"]);
      await call((i) => globalThis.__efS3.abort(i), ["t-corrupt"]);
      out.after = await call(() => globalThis.__efS3.stats(), []);
      return out;
    });
    record("S3 completeness: a missing chunk is refused", integ.incomplete.ok === false && /incomplete/.test(integ.incomplete.error), integ.incomplete.error);
    record("S3 integrity: a corrupted chunk is refused (hash mismatch)", integ.corrupt.ok === false && /hash mismatch/.test(integ.corrupt.error), integ.corrupt.error);
    record("S3 cleanup: aborted transfers are released", integ.before.open === 2 && integ.after.open === 0, { before: integ.before.open, after: integ.after.open });
  } finally { await close(); }
}

// ================================================ main =================================================================
async function main() {
  try {
    if (!ONLY || ONLY === "s3") await s3();
    if (!ONLY || ONLY === "s5") { const m = await import("./rehearse-s5.mjs"); await m.s5({ spikes, start, waitFor, record, loadExtension }); }
  } finally { for (const c of children) c.kill(); }
  const failed = report.filter((r) => !r.ok);
  fs.writeFileSync(path.join(here, "last-run-s3-s5.json"), JSON.stringify({ at: new Date().toISOString(), report }, null, 2));
  console.log(`\n${report.length - failed.length}/${report.length} checks passed`);
  process.exit(failed.length ? 1 : 0);
}
main().catch((e) => { console.error(e); for (const c of children) c.kill(); process.exit(2); });
