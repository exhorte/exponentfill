// Throwaway S3 content-side logic, injected in the ISOLATED world with chrome.scripting.executeScript({files}).
// Written from the behavioural spec OB-11 only:
//   (a) big file without exceeding messaging limits, completeness check, cleanup of abandoned transfers
//   (b) choose the input compatible with type, size and `multiple` when a page exposes several
//   (c) placement compatible with drop zones
//   (d) verification on the SITE: a visible error means failure, even if a file name is displayed
(() => {
  if (globalThis.__efS3) return;
  const transfers = new Map(); // id -> { parts: Map(idx->Uint8Array), total, meta, expiresAt }
  const TTL_MS = 120000;

  const sweep = () => { const now = Date.now(); for (const [id, t] of transfers) if (t.expiresAt < now) transfers.delete(id); };

  // ---- integrity: SHA-256 when crypto.subtle exists (secure contexts only), FNV-1a 32 otherwise ------------------
  function fnv1a(bytes) { let h = 0x811c9dc5; for (let i = 0; i < bytes.length; i++) { h ^= bytes[i]; h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16); }
  async function digest(bytes) {
    if (globalThis.crypto && crypto.subtle) {
      const d = await crypto.subtle.digest("SHA-256", bytes);
      return { kind: "sha256", hex: Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, "0")).join("") };
    }
    return { kind: "fnv1a", hex: fnv1a(bytes) };
  }
  const fromB64 = (b64) => { const s = atob(b64); const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; };

  function store(id, idx, total, meta, bytes) {
    sweep();
    let t = transfers.get(id);
    if (!t) { t = { parts: new Map(), total, meta, expiresAt: Date.now() + TTL_MS }; transfers.set(id, t); }
    t.parts.set(idx, bytes);
  }

  /** Strategy 1 (push): the extension calls this once per chunk through executeScript args. */
  function receiveChunk({ id, idx, total, b64, meta }) {
    store(id, idx, total, meta, fromB64(b64));
    return { ok: true, have: transfers.get(id).parts.size };
  }

  /** Strategy 2 (pull): the content script connects to the offscreen document and pulls the chunks one by one. */
  async function pullFromPort({ id, key, meta }) {
    const port = chrome.runtime.connect({ name: "s3-pull" });
    const wait = (type) => new Promise((resolve, reject) => {
      const onMsg = (m) => { port.onMessage.removeListener(onMsg); m.type === type ? resolve(m) : reject(new Error(m.error || `unexpected ${m.type}`)); };
      port.onMessage.addListener(onMsg);
      setTimeout(() => { port.onMessage.removeListener(onMsg); reject(new Error(`timeout waiting for ${type}`)); }, 20000);
    });
    try {
      port.postMessage({ type: "open", key });
      const info = await wait("meta");
      for (let i = 0; i < info.chunks; i++) {
        port.postMessage({ type: "get", idx: i });
        const c = await wait("chunk");
        store(id, c.idx, info.chunks, meta, fromB64(c.b64));
      }
      port.postMessage({ type: "close" });
      return { ok: true, chunks: info.chunks };
    } catch (e) {
      try { port.disconnect(); } catch { /* closed */ }
      throw e;
    }
  }

  /** Strategy 3 (blob URL created by the extension page). Expected to be blocked across origins: this MEASURES it. */
  async function fetchBlobUrl({ id, url, meta }) {
    try {
      const res = await fetch(url);
      const bytes = new Uint8Array(await res.arrayBuffer());
      store(id, 0, 1, meta, bytes);
      return { ok: true, bytes: bytes.length };
    } catch (e) { return { ok: false, error: String(e) }; }
  }

  /** Completeness control + File construction. Never places a file whose parts or hash do not match. */
  async function assemble(id) {
    const t = transfers.get(id);
    if (!t) return { ok: false, error: "unknown-transfer" };
    if (t.parts.size !== t.total) return { ok: false, error: `incomplete: ${t.parts.size}/${t.total} chunks` };
    const all = new Uint8Array(t.meta.size);
    let off = 0;
    for (let i = 0; i < t.total; i++) {
      const p = t.parts.get(i);
      if (!p) return { ok: false, error: `missing chunk ${i}` };
      all.set(p, off); off += p.length;
    }
    if (off !== t.meta.size) return { ok: false, error: `size mismatch: ${off} != ${t.meta.size}` };
    const d = await digest(all);
    const expected = d.kind === "sha256" ? t.meta.sha256 : t.meta.fnv1a;
    if (d.hex !== expected) return { ok: false, error: `hash mismatch (${d.kind})` };
    t.file = new File([all], t.meta.name, { type: t.meta.type, lastModified: t.meta.lastModified });
    return { ok: true, hashKind: d.kind, size: off };
  }

  // ---- (b) choosing the compatible input --------------------------------------------------------------------------
  function acceptOk(accept, name, type) {
    if (!accept || !accept.trim()) return true;
    const ext = "." + (name.split(".").pop() || "").toLowerCase();
    return accept.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean).some((a) => {
      if (a.startsWith(".")) return a === ext;
      if (a.endsWith("/*")) return (type || "").toLowerCase().startsWith(a.slice(0, -1));
      return a === (type || "").toLowerCase();
    });
  }
  function deepInputs(root = document, out = []) {
    for (const el of root.querySelectorAll("*")) {
      if (el.tagName === "INPUT" && el.type === "file") out.push(el);
      const sr = el.shadowRoot || (chrome.dom && chrome.dom.openOrClosedShadowRoot && chrome.dom.openOrClosedShadowRoot(el));
      if (sr) deepInputs(sr, out);
    }
    return out;
  }
  function label(el) { const l = el.labels && el.labels[0]; return (l ? l.textContent : el.getAttribute("aria-label") || el.name || el.id || "").trim(); }

  /** Score candidates; incompatible ones are EXCLUDED, never "best effort". Returns { chosen, candidates }. */
  function chooseInput(file, hint) {
    const inputs = deepInputs();
    const rows = inputs.map((el) => {
      const reasons = [];
      if (el.disabled) reasons.push("disabled");
      if (!acceptOk(el.accept, file.name, file.type)) reasons.push(`accept=${el.accept}`);
      const max = Number(el.dataset.maxSize || el.dataset.maxBytes || 0);
      if (max && file.size > max) reasons.push(`size>${max}`);
      let score = 10;
      if (!el.multiple) score += 2; // a single file fits a single-file input best
      if (el.accept && el.accept.trim()) score += 1; // a more specific accept beats an open input
      if (hint && label(el).toLowerCase().includes(String(hint).toLowerCase())) score += 5;
      return { el, label: label(el), accept: el.accept, multiple: el.multiple, ok: reasons.length === 0, reasons, score };
    });
    const ok = rows.filter((r) => r.ok).sort((a, b) => b.score - a.score);
    const tie = ok.length > 1 && ok[0].score === ok[1].score;
    return { chosen: ok[0] ? ok[0].el : null, ambiguous: tie, candidates: rows.map(({ el, ...r }) => r) };
  }

  // ---- (c) placement ----------------------------------------------------------------------------------------------
  function visibleErrors(scope) {
    const sel = "[role=alert],.error,.invalid,.upload-error,[aria-invalid=true]";
    return Array.from(scope.querySelectorAll(sel)).filter((e) => (e.textContent || "").trim() && e.getClientRects().length).map((e) => e.textContent.trim().slice(0, 120));
  }
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function place({ id, target }) {
    const t = transfers.get(id);
    if (!t || !t.file) return { ok: false, error: "not-assembled" };
    const file = t.file;
    const dt = new DataTransfer();
    dt.items.add(file);
    let used = null, mode = "input", chooser = null;

    if (target && target.dropzone) {
      const zone = document.querySelector(target.dropzone);
      if (!zone) return { ok: false, error: "no-dropzone" };
      for (const type of ["dragenter", "dragover", "drop"]) zone.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt }));
      mode = "dropzone"; used = target.dropzone;
    } else {
      chooser = target && target.selector ? { chosen: document.querySelector(target.selector), candidates: [], ambiguous: false } : chooseInput(file, target && target.hint);
      if (!chooser.chosen) return { ok: false, error: "no-compatible-input", candidates: chooser.candidates };
      if (chooser.ambiguous) return { ok: false, error: "ambiguous-input", candidates: chooser.candidates };
      chooser.chosen.files = dt.files;
      chooser.chosen.dispatchEvent(new Event("input", { bubbles: true }));
      chooser.chosen.dispatchEvent(new Event("change", { bubbles: true }));
      used = chooser.chosen.id || chooser.chosen.name || "(anonymous)";
    }

    // (d) verify on the site: wait for the page to settle, then look for what the USER would see.
    await sleep(900);
    const scope = (mode === "input" ? chooser.chosen.closest("section,fieldset,form,.upload") : document.querySelector(target.dropzone).closest("section,fieldset,form,.upload")) || document.body;
    const errors = visibleErrors(scope);
    const preview = (scope.textContent || "").includes(file.name);
    const inputHolds = mode === "input" ? (chooser.chosen.files.length === 1 && chooser.chosen.files[0].size === file.size) : null;
    const ok = errors.length === 0 && (mode === "dropzone" ? preview : inputHolds === true);
    return { ok, mode, used, errors, previewShowsName: preview, inputHolds, candidates: chooser ? chooser.candidates : undefined,
      reason: ok ? undefined : errors.length ? "visible-error" : "not-held" };
  }

  function abort(id) { transfers.delete(id); return { ok: true }; }
  function stats() { sweep(); return { open: transfers.size, subtle: !!(globalThis.crypto && crypto.subtle), secureContext: globalThis.isSecureContext }; }

  globalThis.__efS3 = { receiveChunk, pullFromPort, fetchBlobUrl, assemble, place, abort, stats, chooseInputPreview: (name, type, size) => chooseInput({ name, type, size }).candidates };
})();
