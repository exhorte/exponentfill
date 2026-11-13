import type { ReviewItem } from "@exponent-fill/vault-domain";
import { beforeEach, describe, expect, it, vi } from "vitest";

const exec = vi.fn();
const tabsGet = vi.fn();
vi.mock("wxt/browser", () => ({ browser: { tabs: { get: (...a: unknown[]) => tabsGet(...a), query: vi.fn() }, scripting: { executeScript: (...a: unknown[]) => exec(...a) } } }));

import { AUDIT_MAX, appendAudit, buildEntry, clearAudit, markUndone, readAudit } from "./audit";
import { fillTab, hasUndo, undoTab } from "./fill";
import type { KeyValueStore } from "./vault/service";

const memory = (): KeyValueStore => {
  const m = new Map<string, unknown>();
  return { get: async (k) => m.get(k), set: async (k, v) => void m.set(k, structuredClone(v)), remove: async (k) => void m.delete(k) };
};

const item = (id: string, over: Partial<ReviewItem> = {}): ReviewItem => ({
  fieldId: id, label: id, kind: "text", semanticType: "first_name", required: false, state: "known", reason: "usable", value: "SECRET-CANARY-VALUE", factId: "fact-1", trust: "declared", sourcesCount: 1,
  alreadyFilled: false, confidence: 0.9, via: "label", fillable: true, defaultChecked: true, ...over,
});

describe("fillTab / undoTab", () => {
  beforeEach(() => {
    exec.mockReset();
    tabsGet.mockReset();
  });

  it("sends only field ids and values, and accepts a well-formed answer", async () => {
    tabsGet.mockResolvedValue({ url: "https://site.test/form?x=1" });
    exec.mockResolvedValueOnce([{}]).mockResolvedValueOnce([{ result: [{ fieldId: "f1", status: "written", kind: "text", code: "ok" }] }]);
    const out = await fillTab(7, "https://site.test/form?x=2", "a1b2c3d4e5f6a1b2c3d4e5f6", [{ fieldId: "f1", value: "Awa", factId: "fact-1", trust: "declared" }]);
    expect(out).toEqual({ ok: true, results: [{ fieldId: "f1", status: "written", kind: "text", code: "ok" }] });
    const call = exec.mock.calls[1]![0] as { args: unknown[] };
    expect(call.args).toEqual(["a1b2c3d4e5f6a1b2c3d4e5f6", [{ fieldId: "f1", value: "Awa" }]]); // scan id + ids and values: no fact id, no trust class, nothing else leaves the panel
  });

  it("refuses to write when the page is no longer the scanned one", async () => {
    tabsGet.mockResolvedValue({ url: "https://site.test/other" });
    expect(await fillTab(7, "https://site.test/form", "a1b2c3d4e5f6a1b2c3d4e5f6", [])).toEqual({ ok: false, reason: "page_changed" });
    tabsGet.mockResolvedValue({ url: "https://evil.test/form" });
    expect(await fillTab(7, "https://site.test/form", "a1b2c3d4e5f6a1b2c3d4e5f6", [])).toEqual({ ok: false, reason: "page_changed" });
    expect(exec).not.toHaveBeenCalled();
  });

  it("reports page_changed (and writes nothing) when the page no longer has the scan that was shown", async () => {
    tabsGet.mockResolvedValue({ url: "https://site.test/form" });
    exec.mockResolvedValueOnce([{}]).mockResolvedValueOnce([{ result: null }]);
    expect(await fillTab(7, "https://site.test/form", "a1b2c3d4e5f6a1b2c3d4e5f6", [])).toEqual({ ok: false, reason: "page_changed" });
  });

  it("rejects a malformed answer coming from the page", async () => {
    tabsGet.mockResolvedValue({ url: "https://site.test/form" });
    exec.mockResolvedValueOnce([{}]).mockResolvedValueOnce([{ result: [{ fieldId: "f1", status: "totally-fine", kind: "text", code: "ok" }] }]);
    expect(await fillTab(7, "https://site.test/form", "a1b2c3d4e5f6a1b2c3d4e5f6", [])).toEqual({ ok: false, reason: "invalid" });
  });

  it("reports no access when the page cannot be scripted, and handles undo results", async () => {
    tabsGet.mockResolvedValue({ url: "https://site.test/form" });
    exec.mockRejectedValueOnce(new Error("Cannot access"));
    expect(await fillTab(7, "https://site.test/form", "a1b2c3d4e5f6a1b2c3d4e5f6", [])).toEqual({ ok: false, reason: "no_access" });
    exec.mockResolvedValueOnce([{ result: [{ fieldId: "f1", status: "restored", code: "ok", kind: "text" }] }]);
    expect(await undoTab(7)).toEqual({ ok: true, results: [{ fieldId: "f1", status: "restored", code: "ok", kind: "text" }] });
    exec.mockResolvedValueOnce([{ result: true }]);
    expect(await hasUndo(7)).toBe(true);
    exec.mockRejectedValueOnce(new Error("gone"));
    expect(await hasUndo(7)).toBe(false);
  });
});

describe("audit history never records a value", () => {
  it("keeps what happened to which field and fact, with no value anywhere", () => {
    const entry = buildEntry("site.test", [item("a"), item("b", { state: "inferred", value: "OTHER-CANARY" }), item("pw", { state: "skipped", value: null })], new Set(["a", "b"]), [
      { fieldId: "a", status: "written", code: "ok" }, { fieldId: "b", status: "failed", code: "readback_mismatch" },
    ], new Date("2026-11-12T10:00:00Z"), "e1");
    const json = JSON.stringify(entry);
    expect(json).not.toContain("CANARY");
    expect(entry).toMatchObject({ host: "site.test", written: 1, failed: 1, refused: 0, undone: false });
    expect(entry.fields.map((f) => [f.label, f.status, f.code, f.approvedUnconfirmed])).toEqual([["a", "written", "ok", false], ["b", "failed", "readback_mismatch", true]]);
  });

  it("is capped, can mark an entry undone, and can be cleared", async () => {
    const store = memory();
    for (let i = 0; i < AUDIT_MAX + 5; i++) await appendAudit(store, buildEntry("h", [], new Set(), [], new Date(), `e${i}`));
    const all = await readAudit(store);
    expect(all).toHaveLength(AUDIT_MAX);
    expect(all[0]!.id).toBe(`e${AUDIT_MAX + 4}`); // newest first
    expect((await markUndone(store, `e${AUDIT_MAX + 4}`))[0]!.undone).toBe(true);
    await clearAudit(store);
    expect(await readAudit(store)).toEqual([]);
  });
});
