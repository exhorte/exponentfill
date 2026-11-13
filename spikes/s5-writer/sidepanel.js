// Throwaway S5 harness: runs writer.js against a page's cases and compares with the page framework's own state.
import { PAGES, classify, truthMatches } from "./cases.js";

const $ = (id) => document.getElementById(id);
const rows = [];
globalThis.__s5Rows = rows;
globalThis.__s5Done = false;

async function activeTab() { const [t] = await chrome.tabs.query({ active: true, lastFocusedWindow: true }); return t; }

function waitComplete(tabId, ms = 15000) {
  return new Promise((resolve) => {
    const t0 = setTimeout(() => { chrome.tabs.onUpdated.removeListener(l); resolve(); }, ms);
    const l = (id, info) => { if (id === tabId && info.status === "complete") { clearTimeout(t0); chrome.tabs.onUpdated.removeListener(l); resolve(); } };
    chrome.tabs.onUpdated.addListener(l);
  });
}

async function runPage(tab, page) {
  await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["writer.js"] });
  // frameworks render after load: wait (bounded) for the page-owned #state when the page has one
  await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => new Promise((r) => { const t0 = Date.now(); const i = setInterval(() => { if (document.getElementById("state") || Date.now() - t0 > 3000) { clearInterval(i); setTimeout(r, 300); } }, 50); }) });
  for (const c of page.cases) {
    const [res] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: async (c) => {
        const w = globalThis.__efWriter;
        const writer = await w.writeField(c.spec, c.value);
        await new Promise((r) => setTimeout(r, 250)); // let framework state settle
        const actual = w.readTruth(c.truth);
        return { writer, actual: actual === undefined ? null : actual };
      },
      args: [c],
    });
    const { writer, actual } = res.result;
    const canonical = (k, v) => v; // canonical comparison is done page-side for typed fields; here only raw equality except `canon`
    let truthOk;
    if (c.truth.canon === "tel") truthOk = String(actual).replace(/[^\d+]/g, "") === String(c.truth.equals).replace(/[^\d+]/g, "");
    else truthOk = truthMatches(actual, c.truth, canonical);
    const outcome = classify(c, writer, truthOk);
    rows.push({ id: c.id, cat: c.cat, path: page.path, weak: !!c.weak, expect: c.expect || "success", writer, actual, truthOk, outcome });
    render();
  }
}

function render() {
  const tb = $("cases").querySelector("tbody");
  tb.replaceChildren();
  for (const r of rows) {
    const tr = document.createElement("tr");
    const cls = /SILENT|VIOLATION/.test(r.outcome) ? "bad" : /false-negative|unexpected/.test(r.outcome) ? "warn" : "ok";
    for (const text of [r.id, r.cat, `${r.writer.status}${r.writer.reason ? ": " + r.writer.reason : ""}`.slice(0, 110), JSON.stringify(r.actual)?.slice(0, 40) ?? "", r.outcome]) {
      const td = document.createElement("td"); td.textContent = text; tr.appendChild(td);
    }
    tr.lastChild.className = cls;
    tb.appendChild(tr);
  }
  const cats = {};
  for (const r of rows) { const c = (cats[r.cat] ??= { n: 0, success: 0, safe: 0 }); c.n++; if (r.outcome === "success") c.success++; if (!/SILENT|VIOLATION/.test(r.outcome)) c.safe++; }
  $("rates").textContent = Object.entries(cats).map(([k, v]) => `${k}: ${v.success}/${v.n} written+verified, ${v.safe}/${v.n} safe`).join("  |  ");
  const silent = rows.filter((r) => /SILENT|VIOLATION/.test(r.outcome)).length;
  $("summary").textContent = `cases=${rows.length}  success=${rows.filter((r) => r.outcome === "success").length}  explicit-failure=${rows.filter((r) => /explicit-failure|expected-failure-ok/.test(r.outcome)).length}  refusal-ok=${rows.filter((r) => r.outcome === "refusal-ok").length}  false-negative=${rows.filter((r) => r.outcome === "false-negative").length}  SILENT/VIOLATION=${silent}`;
}

$("run-tab").addEventListener("click", async () => {
  const tab = await activeTab();
  const base = $("base").value;
  const page = PAGES.find((p) => tab.url && new URL(tab.url).pathname === p.path && tab.url.startsWith(base));
  if (!page) { $("summary").textContent = "no case list for this page: " + tab.url; return; }
  await runPage(tab, page);
});

$("run-all").addEventListener("click", async () => {
  globalThis.__s5Done = false;
  const tab = await activeTab();
  const base = $("base").value;
  for (const page of PAGES) {
    await chrome.tabs.update(tab.id, { url: base + page.path });
    await waitComplete(tab.id);
    await runPage(tab, page);
  }
  globalThis.__s5Done = true;
});

$("copy").addEventListener("click", () => navigator.clipboard.writeText(JSON.stringify({ ua: navigator.userAgent, rows }, null, 2)));
