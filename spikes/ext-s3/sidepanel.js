// Throwaway S3 panel: runs one transfer strategy end to end and records timing + integrity + site verification.
import { CHUNK, getVaultFile, putVaultFile, sha256Hex, toBase64 } from "./vault-idb.js";

const $ = (id) => document.getElementById(id);
const results = [];
globalThis.__s3Results = results;
const SERVER = "http://localhost:5821";

function log(line, data) { $("log").textContent += line + (data === undefined ? "" : "\n    " + JSON.stringify(data)) + "\n"; }
$("clear").addEventListener("click", () => { $("log").textContent = ""; });
$("copy").addEventListener("click", () => navigator.clipboard.writeText(JSON.stringify({ ua: navigator.userAgent, results }, null, 2)));

let tab = { id: null, url: null };
async function refreshTab() { const [t] = await chrome.tabs.query({ active: true, lastFocusedWindow: true }); tab = { id: t?.id ?? null, url: t?.url ?? null }; $("tab").textContent = tab.url ?? "(none)"; }
chrome.tabs.onActivated.addListener(refreshTab);
chrome.tabs.onUpdated.addListener((_i, c) => { if (c.url || c.status === "complete") refreshTab(); });
refreshTab();

/** The "vault": a deterministic file stored in IndexedDB under the extension origin (so the bytes are NOT in the page). */
async function ensureVault(sizeMb) {
  const key = `resume-${sizeMb}mb`;
  let rec = await getVaultFile(key);
  if (rec) return { key, rec };
  const res = await fetch(`${SERVER}/gen/file?mb=${sizeMb}&seed=1`);
  const blob = new Blob([await res.arrayBuffer()], { type: "application/pdf" });
  rec = { blob, name: `${key}.pdf`, type: "application/pdf", size: blob.size, sha256: await sha256Hex(blob), serverSha256: res.headers.get("x-sha256"), lastModified: 1700000000000 };
  // FNV-1a fallback for insecure origins where crypto.subtle is missing in the content script
  const u = new Uint8Array(await blob.arrayBuffer());
  let h = 0x811c9dc5; for (let i = 0; i < u.length; i++) { h ^= u[i]; h = Math.imul(h, 0x01000193) >>> 0; }
  rec.fnv1a = h.toString(16);
  await putVaultFile(key, rec);
  return { key, rec };
}

const inTab = (func, args = []) => chrome.scripting.executeScript({ target: { tabId: tab.id }, func, args }).then((r) => r[0]?.result);

async function run(strategy, sizeMb, target) {
  if (tab.id == null) { log("no active tab"); return null; }
  const t0 = performance.now();
  const { key, rec } = await ensureVault(sizeMb);
  const meta = { name: rec.name, type: rec.type, size: rec.size, sha256: rec.sha256, fnv1a: rec.fnv1a, lastModified: rec.lastModified };
  const id = crypto.randomUUID();
  await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["s3-content.js"] });
  const row = { strategy, sizeMb, target, expectedSha256: rec.sha256, serverSha256: rec.serverSha256, integrityAtSource: rec.sha256 === rec.serverSha256 };
  let maxMessage = 0, transferError = null;
  const tT = performance.now();
  try {
    if (strategy === "push") {
      const total = Math.ceil(rec.size / CHUNK);
      const bytes = new Uint8Array(await rec.blob.arrayBuffer());
      for (let i = 0; i < total; i++) {
        const b64 = toBase64(bytes.subarray(i * CHUNK, (i + 1) * CHUNK));
        maxMessage = Math.max(maxMessage, b64.length);
        const r = await inTab((a) => globalThis.__efS3.receiveChunk(a), [{ id, idx: i, total, b64, meta }]);
        if (!r?.ok) throw new Error("chunk rejected " + i);
      }
    } else if (strategy === "pull") {
      const e = await chrome.runtime.sendMessage({ type: "s3.ensure-offscreen" });
      if (!e?.ok) throw new Error("offscreen: " + JSON.stringify(e));
      const r = await inTab(async (a) => { try { return await globalThis.__efS3.pullFromPort(a); } catch (err) { return { ok: false, error: String(err) }; } }, [{ id, key, meta }]);
      if (!r?.ok) throw new Error("pull failed: " + r?.error);
      maxMessage = Math.ceil(CHUNK * 4 / 3);
    } else {
      const url = URL.createObjectURL(rec.blob);
      const r = await inTab(async (a) => globalThis.__efS3.fetchBlobUrl(a), [{ id, url, meta }]);
      URL.revokeObjectURL(url);
      if (!r?.ok) throw new Error("blob URL fetch failed: " + r?.error);
    }
  } catch (e) { transferError = String(e); }
  row.transferMs = Math.round(performance.now() - tT);
  row.maxMessageChars = maxMessage;
  if (transferError) {
    row.ok = false; row.error = transferError;
  } else {
    const a = await inTab(async (i) => globalThis.__efS3.assemble(i), [id]);
    row.assemble = a;
    if (!a?.ok) { row.ok = false; row.error = a?.error; }
    else {
      const p = await inTab(async (a2) => globalThis.__efS3.place(a2), [{ id, target }]);
      row.place = p;
      row.ok = p?.ok === true;
      if (!row.ok) row.error = p?.reason || p?.error;
    }
  }
  await inTab((i) => globalThis.__efS3.abort(i), [id]).catch(() => {});
  row.totalMs = Math.round(performance.now() - t0);
  results.push(row);
  log(`${row.ok ? "OK  " : "FAIL"} ${strategy} ${sizeMb}MB ${JSON.stringify(target)}  transfer=${row.transferMs}ms total=${row.totalMs}ms`, row.ok ? { maxMessageChars: row.maxMessageChars, used: row.place?.used, mode: row.place?.mode } : { error: row.error, place: row.place });
  return row;
}
globalThis.__s3Run = run;

$("run").addEventListener("click", () => run($("strategy").value, Number($("size").value), JSON.parse($("target").value)));
$("all").addEventListener("click", async () => { for (const s of ["push", "pull", "bloburl"]) await run(s, Number($("size").value), JSON.parse($("target").value)); });
