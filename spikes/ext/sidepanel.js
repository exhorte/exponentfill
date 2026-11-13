// Throwaway spike panel. Plain ES module, no build step. Measurement code only — never product code.

const $ = (id) => document.getElementById(id);
const results = [];
globalThis.__efResults = results; // spike convenience: lets the rehearsal runner read structured results

function log(spike, test, ok, data) {
  const entry = { ts: new Date().toISOString(), spike, test, ok, data };
  results.push(entry);
  const line = `${entry.ts.slice(11, 19)} [${spike}] ${ok === true ? "OK " : ok === false ? "FAIL" : "..."} ${test}` +
    (data === undefined ? "" : "\n    " + JSON.stringify(data));
  $("log").textContent += line + "\n";
  $("log").scrollTop = $("log").scrollHeight;
}

$("clear").addEventListener("click", () => { $("log").textContent = ""; });
$("copy").addEventListener("click", async () => {
  const payload = JSON.stringify({ chrome: chromeVersion(), ua: navigator.userAgent, results }, null, 2);
  try { await navigator.clipboard.writeText(payload); log("meta", "results copied to clipboard", true, { entries: results.length }); }
  catch (e) { log("meta", "clipboard failed — select the log manually", false, String(e)); }
});

function chromeVersion() {
  const m = /Chrome\/(\d+\.\d+\.\d+\.\d+)/.exec(navigator.userAgent);
  return m ? m[1] : "unknown";
}
$("ver").textContent = `Chrome ${chromeVersion()}`;

// ---- active tab tracking (kept in memory so click handlers can stay synchronous for user-gesture APIs) ----------
let tabInfo = { id: null, url: null, origin: null, pattern: null };
async function refreshTab() {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab || !tab.url) { tabInfo = { id: tab?.id ?? null, url: null, origin: null, pattern: null }; }
  else {
    try {
      const u = new URL(tab.url);
      const ok = u.protocol === "http:" || u.protocol === "https:";
      tabInfo = { id: tab.id, url: tab.url, origin: ok ? u.origin : null, pattern: ok ? `${u.protocol}//${u.hostname}/*` : null };
    } catch { tabInfo = { id: tab.id, url: tab.url, origin: null, pattern: null }; }
  }
  $("s2-tab").textContent = `${tabInfo.url ?? "(no url — grant needed or non-web tab)"}  → pattern ${tabInfo.pattern ?? "n/a"}`;
}
chrome.tabs.onActivated.addListener(refreshTab);
chrome.tabs.onUpdated.addListener((_id, change) => { if (change.url || change.status === "complete") refreshTab(); });
refreshTab();

function requireTab() {
  if (tabInfo.id == null) { log("meta", "no active tab", false); return false; }
  return true;
}

// =============================================== S1 ===========================================================
$("s1-ping").addEventListener("click", async () => {
  const nonce = crypto.randomUUID();
  const t0 = performance.now();
  try {
    const r = await chrome.runtime.sendMessage({ type: "s1.ping", nonce });
    log("S1", "typed round trip panel→SW", r?.ok === true && r.pong === nonce,
      { ms: Math.round(performance.now() - t0), swStartedAt: r?.swStartedAt, chrome: chromeVersion() });
  } catch (e) { log("S1", "typed round trip panel→SW", false, String(e)); }
});

$("s1-tab-only").addEventListener("click", async () => {
  if (!requireTab()) return;
  const r = await chrome.runtime.sendMessage({ type: "s1.per-tab", tabId: tabInfo.id });
  log("S1", "side panel enabled for this tab only (switch tabs: it must disappear on others)", r?.ok === true, r);
});
$("s1-tab-reset").addEventListener("click", async () => {
  const r = await chrome.runtime.sendMessage({ type: "s1.per-tab-reset" });
  log("S1", "side panel enabled for all tabs again", r?.ok === true, r);
});

$("s1-fake").addEventListener("click", async () => {
  if (!requireTab()) return;
  try {
    // A content script's sender.url is the web page, so the service worker must reject it.
    const [res] = await chrome.scripting.executeScript({
      target: { tabId: tabInfo.id },
      func: () => chrome.runtime.sendMessage({ type: "s1.ping", nonce: "from-content-script" }),
    });
    log("S1", "content-script sender is rejected by the SW", res?.result?.ok === false && res.result.error === "rejected", res?.result);
  } catch (e) { log("S1", "content-script sender is rejected by the SW", false, String(e)); }
});

// =============================================== S2 ===========================================================
function probe() {
  return {
    href: location.href, isTop: window === window.top, title: document.title,
    fields: document.querySelectorAll("input,select,textarea").length,
    registeredMarker: document.documentElement.getAttribute("data-ef-spike-injected"),
  };
}

$("s2-origins").addEventListener("click", async () => {
  const all = await chrome.permissions.getAll();
  log("S2", "granted permissions", undefined, all);
});

$("s2-request").addEventListener("click", () => {
  // Called first thing in the handler so the user gesture is still valid.
  if (!tabInfo.pattern) { log("S2", "request origin", false, "active tab is not http(s) or has no url yet"); return; }
  const pattern = tabInfo.pattern;
  const t0 = performance.now();
  chrome.permissions.request({ origins: [pattern] }).then(
    (granted) => log("S2", `permissions.request ${pattern}`, granted === true, { granted, msUntilAnswer: Math.round(performance.now() - t0) }),
    (e) => log("S2", `permissions.request ${pattern}`, false, String(e)),
  );
});

$("s2-inject").addEventListener("click", async () => {
  if (!requireTab()) return;
  try {
    const res = await chrome.scripting.executeScript({ target: { tabId: tabInfo.id, allFrames: true }, func: probe });
    log("S2", "executeScript allFrames", res.length > 0, res.map((r) => ({ frameId: r.frameId, ...r.result })));
  } catch (e) { log("S2", "executeScript allFrames", false, String(e)); }
});

$("s2-frames").addEventListener("click", async () => {
  if (!requireTab()) return;
  try {
    const res = await chrome.scripting.executeScript({ target: { tabId: tabInfo.id, allFrames: true }, func: probe });
    const rows = [];
    for (const r of res) {
      let origin = null; let contained = null;
      try { origin = new URL(r.result.href).origin; contained = await chrome.permissions.contains({ origins: [`${new URL(r.result.href).protocol}//${new URL(r.result.href).hostname}/*`] }); } catch {}
      rows.push({ frameId: r.frameId, origin, hasGrant: contained, fields: r.result.fields });
    }
    log("S2", "frames reached + per-frame grant", undefined, rows);
  } catch (e) { log("S2", "frames reached", false, String(e)); }
});

$("s2-register").addEventListener("click", async () => {
  if (!tabInfo.pattern) { log("S2", "register content script", false, "no http(s) tab"); return; }
  const id = "ef-spike-" + new URL(tabInfo.url).hostname;
  try {
    await chrome.scripting.registerContentScripts([{ id, matches: [tabInfo.pattern], js: ["cs-register.js"], allFrames: true, runAt: "document_idle", persistAcrossSessions: false }]);
    log("S2", `registerContentScripts ${id}`, true, { matches: tabInfo.pattern, next: "reload the tab, then press 'Inject into this tab' and look for registeredMarker=1" });
  } catch (e) { log("S2", `registerContentScripts ${id}`, false, String(e)); }
});
$("s2-unregister").addEventListener("click", async () => {
  try { await chrome.scripting.unregisterContentScripts(); log("S2", "unregisterContentScripts", true); }
  catch (e) { log("S2", "unregisterContentScripts", false, String(e)); }
});

$("s2-request-all").addEventListener("click", () => {
  const t0 = performance.now();
  chrome.permissions.request({ origins: ["https://*/*", "http://*/*"] }).then(
    (granted) => log("S2", "permissions.request ALL sites", granted === true, { granted, msUntilAnswer: Math.round(performance.now() - t0) }),
    (e) => log("S2", "permissions.request ALL sites", false, String(e)),
  );
});
$("s2-remove-all").addEventListener("click", async () => {
  const all = await chrome.permissions.getAll();
  const optional = (all.origins ?? []).filter((o) => !o.startsWith("http://127.0.0.1:5810"));
  if (optional.length === 0) { log("S2", "remove optional access", true, "nothing to remove"); return; }
  try { const removed = await chrome.permissions.remove({ origins: optional }); log("S2", "remove optional access", removed === true, optional); }
  catch (e) { log("S2", "remove optional access", false, String(e)); }
});
$("s2-activetab").addEventListener("click", async () => {
  if (!requireTab()) return;
  try {
    const res = await chrome.scripting.executeScript({ target: { tabId: tabInfo.id }, func: probe });
    log("S2", "inject with no grant (activeTab only)", undefined, { reached: res.length, note: "works only if you clicked the TOOLBAR icon on this tab; a click inside the panel does not grant activeTab (verify)" });
  } catch (e) { log("S2", "inject with no grant (activeTab only)", false, String(e)); }
});

// =============================================== S4 ===========================================================
function s4Probe(text, ids) {
  const out = { chromeDom: typeof chrome !== "undefined" && !!chrome.dom, url: location.href, hosts: [] };
  function field(root) { return root ? root.querySelector("input") : null; }
  for (const id of ids) {
    const host = document.getElementById(id);
    const row = { id, found: !!host };
    if (host) {
      row.outerShadowRootIsNull = host.shadowRoot === null;
      let root = chrome.dom.openOrClosedShadowRoot(host);
      row.rootAvailable = !!root;
      let input = field(root);
      if (!input && root) {
        // nested case: the closed root contains another host with its own (open) root
        const inner = root.querySelector("ef-inner");
        if (inner) { row.nested = true; root = chrome.dom.openOrClosedShadowRoot(inner); input = field(root); }
      }
      row.inputFound = !!input;
      if (input) {
        row.readBefore = input.value;
        input.focus();
        input.value = text;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
        row.readAfter = input.value;
      }
    }
    out.hosts.push(row);
  }
  const ro = document.getElementById("readout");
  out.pageReadout = ro ? ro.textContent : null; // component-owned: proves the component's own handler fired
  return out;
}

async function runS4(ids, label) {
  if (!requireTab()) return;
  try {
    const [res] = await chrome.scripting.executeScript({ target: { tabId: tabInfo.id }, func: s4Probe, args: [$("s4-text").value, ids] });
    const rows = res.result.hosts;
    const ok = rows.length > 0 && rows.every((r) => r.found && r.inputFound && r.readAfter === $("s4-text").value);
    log("S4", label, ok, res.result);
  } catch (e) { log("S4", label, false, String(e)); }
}
$("s4-run").addEventListener("click", () => runS4(["host1", "host2"], "closed shadow root: read + write"));
$("s4-open").addEventListener("click", () => runS4(["open1", "nested1"], "open + nested shadow roots: read + write"));

// =============================================== S6 ===========================================================
function s6Params() {
  const total = Number($("s6-total").value), silence = Number($("s6-silence").value), at = Number($("s6-at").value);
  const hdelay = Number($("s6-hdelay").value);
  return { total, silence, at, hdelay, url: `http://127.0.0.1:5810/stream?total=${total}&gap=2&silence=${silence}&silenceAt=${at}&headerDelay=${hdelay}` };
}

async function consumeStream(url, tag) {
  const t0 = performance.now();
  let events = 0, last = t0, maxGap = 0, error = null;
  try {
    const res = await fetch(url);
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let nextReport = 30000;
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      const now = performance.now();
      events += (dec.decode(value, { stream: true }).match(/data:/g) || []).length;
      maxGap = Math.max(maxGap, now - last);
      last = now;
      if (now - t0 > nextReport) { log("S6", `${tag} progress`, undefined, { elapsedS: Math.round((now - t0) / 1000), events }); nextReport += 30000; }
    }
  } catch (e) { error = String(e); }
  return { elapsedS: Math.round((performance.now() - t0) / 1000), events, maxGapS: Math.round(maxGap / 100) / 10, error };
}

$("s6-panel").addEventListener("click", async () => {
  const p = s6Params();
  log("S6", "(a) fetch from the panel page: start", undefined, p);
  const r = await consumeStream(p.url, "(a)");
  log("S6", "(a) fetch from the panel page: end", r.error === null && r.elapsedS >= p.total - 5, r);
});

async function swRun(tag, withPort) {
  const p = s6Params();
  const before = await chrome.runtime.sendMessage({ type: "s1.ping", nonce: "s6" });
  log("S6", `${tag} start`, undefined, { ...p, swStartedAt: before?.swStartedAt });
  await chrome.runtime.sendMessage({ type: "s6.sw-fetch", url: p.url });
  let port = null, hb = 0;
  if (withPort) {
    port = chrome.runtime.connect({ name: "s6-keepalive" });
    port.onMessage.addListener((m) => { if (m?.type === "s6.hb") { hb++; port.postMessage({ type: "s6.hb-ack", n: hb }); } });
  }
  // Without the port we stay silent (no message to the SW) so nothing resets its idle timer artificially.
  await new Promise((r) => setTimeout(r, (p.hdelay + p.total + 15) * 1000));
  if (port) port.disconnect();
  const r = await chrome.runtime.sendMessage({ type: "s6.sw-status" });
  const restarted = r?.status?.swStartedAt !== before?.swStartedAt;
  log("S6", `${tag} end`, !restarted && r?.status?.doneAt != null && !r?.status?.error,
    { status: r?.status, heartbeatsAnswered: hb, serviceWorkerRestarted: restarted, expectedEventsAtLeast: Math.floor((p.total - p.silence) / 2) - 5 });
}
$("s6-sw").addEventListener("click", () => swRun("(b) fetch inside the service worker, no keep-alive", false));
$("s6-port").addEventListener("click", () => swRun("(c) fetch inside the service worker + keep-alive port", true));

let offState = null;
chrome.runtime.onMessage.addListener((m) => {
  if (!m || typeof m.type !== "string" || !m.type.startsWith("s6.off-") || m.type === "s6.off-run") return;
  if (m.type === "s6.off-progress") log("S6", "(d) offscreen progress", undefined, m.data);
  if (m.type === "s6.off-done") { log("S6", "(d) offscreen fetch: end", !m.data.error && m.data.elapsedS >= offState?.total - 5, m.data); offState = null; }
});
$("s6-offscreen").addEventListener("click", async () => {
  const p = s6Params();
  offState = p;
  log("S6", "(d) fetch in an offscreen document: start", undefined, p);
  const r = await chrome.runtime.sendMessage({ type: "s6.offscreen-start", url: p.url });
  if (!r?.ok) log("S6", "(d) offscreen start", false, r);
});

// =============================================== S7 ===========================================================
const enc = new TextEncoder();
const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
let derived = null;

$("s7-derive").addEventListener("click", async () => {
  const iterations = Number($("s7-iter").value);
  try {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const t0 = performance.now();
    const base = await crypto.subtle.importKey("raw", enc.encode($("s7-pass").value), "PBKDF2", false, ["deriveKey"]);
    const key = await crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
    const deriveMs = Math.round(performance.now() - t0);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const plain = enc.encode(JSON.stringify({ firstName: "Test", note: "fictitious vault entry" }));
    const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plain);
    const back = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct));
    const roundTrip = new TextDecoder().decode(back) === new TextDecoder().decode(plain);
    const tampered = new Uint8Array(ct); tampered[0] ^= 1;
    let tamperRejected = false;
    try { await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, tampered); } catch { tamperRejected = true; }
    const raw = await crypto.subtle.exportKey("raw", key);
    derived = { rawB64: b64(raw) };
    log("S7", "PBKDF2-SHA256 + AES-GCM", roundTrip && tamperRejected && deriveMs < 1000, { iterations, deriveMs, roundTrip, tamperRejected, target: "< 1000 ms" });
  } catch (e) { log("S7", "PBKDF2-SHA256 + AES-GCM", false, String(e)); }
});

$("s7-session").addEventListener("click", async () => {
  if (!derived) { log("S7", "storage.session", false, "derive a key first"); return; }
  try { await chrome.storage.session.set({ efKey: derived.rawB64 }); log("S7", "key written to storage.session", true, { bytes: await chrome.storage.session.getBytesInUse() }); }
  catch (e) { log("S7", "key written to storage.session", false, String(e)); }
});

async function csRead(world) {
  const [res] = await chrome.scripting.executeScript({
    target: { tabId: tabInfo.id }, world,
    func: () => {
      if (typeof chrome === "undefined" || !chrome.storage) return { reachable: false, reason: "chrome.storage undefined here" };
      return chrome.storage.session.get("efKey").then((r) => ({ reachable: true, keyVisible: !!r.efKey }), (e) => ({ reachable: false, reason: String(e) }));
    },
  });
  return res?.result;
}

$("s7-cs").addEventListener("click", async () => {
  if (!requireTab()) return;
  try {
    const isolated = await csRead("ISOLATED");
    const main = await csRead("MAIN");
    const ok = isolated?.keyVisible !== true && main?.keyVisible !== true;
    log("S7", "content script (isolated) and page (main world) cannot read the key", ok, { isolated, main });
  } catch (e) { log("S7", "content script read", false, String(e)); }
});

$("s7-level").addEventListener("click", async () => {
  if (!requireTab()) return;
  try {
    await chrome.storage.session.setAccessLevel({ accessLevel: "TRUSTED_AND_UNTRUSTED_CONTEXTS" });
    const open = await csRead("ISOLATED");
    await chrome.storage.session.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
    const closed = await csRead("ISOLATED");
    log("S7", "access level demo (expect key visible when OPEN, hidden after reset)", open?.keyVisible === true && closed?.keyVisible !== true, { whenOpen: open, afterReset: closed });
  } catch (e) { log("S7", "access level demo", false, String(e)); }
});

$("s7-argon").addEventListener("click", async () => {
  try {
    await new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "vendor/argon2.umd.min.js"; s.onload = resolve; s.onerror = () => reject(new Error("vendor/argon2.umd.min.js missing — run: node spikes/vendor-copy.mjs"));
      document.head.appendChild(s);
    });
    const t0 = performance.now();
    const hash = await globalThis.hashwasm.argon2id({ password: $("s7-pass").value, salt: crypto.getRandomValues(new Uint8Array(16)), parallelism: 1, iterations: 3, memorySize: 65536, hashLength: 32, outputType: "hex" });
    const ms = Math.round(performance.now() - t0);
    log("S7", "Argon2id (hash-wasm, 64 MiB, t=3, p=1)", ms < 1000, { ms, hashHexLength: hash.length, note: "WASM needs 'wasm-unsafe-eval' declared in content_security_policy.extension_pages (the MV3 default CSP does NOT allow it — measured in rehearsal)" });
  } catch (e) { log("S7", "Argon2id (hash-wasm)", false, String(e)); }
});
