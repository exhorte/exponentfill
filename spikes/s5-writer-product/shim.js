// Throwaway shim: runs the PRODUCT writer (packages/form-writer) inside the S5 measurement harness.
// Same contract as spikes/s5-writer/writer.js: globalThis.__efWriter = { writeField(spec, value), readTruth(t) }.
// Only the lookup (spec = {host, sel}) and readTruth (the page framework's own state, MEASUREMENT only) live here;
// every write goes through the product code, which is what is being measured.
import { writeElement } from "../../packages/form-writer/src/index.ts";

(() => {
  if (globalThis.__efWriter) return;
  const rootOf = (el) => el.shadowRoot || (typeof chrome !== "undefined" && chrome.dom && chrome.dom.openOrClosedShadowRoot ? chrome.dom.openOrClosedShadowRoot(el) : null);
  function resolve(spec) {
    let root = document;
    for (const h of spec.host || []) {
      const el = root.querySelector(h);
      if (!el) return null;
      root = rootOf(el);
      if (!root) return null;
    }
    return root.querySelector(spec.sel);
  }
  async function writeField(spec, value) {
    const el = resolve(spec);
    if (!el) return { status: "failed", kind: "unknown", reason: "field not found" };
    const r = await writeElement(el, value);
    return { status: r.status, kind: r.kind, reason: r.reason ?? r.code, code: r.code };
  }
  const resolveSpec = (t) => resolve({ host: t.host, sel: t.sel });
  function readTruth(t) {
    const text = (sel) => { const e = document.querySelector(sel); return e ? e.textContent : null; };
    switch (t.kind) {
      case "state": { try { return JSON.parse(text("#state"))[t.key]; } catch { return undefined; } }
      case "state-text": return text("#state");
      case "dom": return text(t.sel);
      case "field": { const e = resolveSpec(t); return e ? e[t.prop || "value"] : undefined; }
      case "checked": { const e = document.querySelector(t.sel); return e ? e.checked : undefined; }
      default: return undefined;
    }
  }
  globalThis.__efWriter = { writeField, readTruth };
})();
