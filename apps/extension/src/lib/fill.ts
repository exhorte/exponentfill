import { browser } from "wxt/browser";
import type { FillItem } from "@exponent-fill/vault-domain";
import { z } from "zod";

/** What comes back from the page's tab is validated: it crossed a world boundary. */
const FieldResultSchema = z.object({
  fieldId: z.string().max(32),
  status: z.enum(["written", "already-correct", "failed", "refused"]),
  kind: z.string().max(24),
  code: z.string().max(40),
  reason: z.string().max(400).optional(),
  partial: z.boolean().optional(),
});
const UndoResultSchema = z.object({ fieldId: z.string().max(32), status: z.enum(["restored", "failed", "skipped"]), code: z.string().max(40), kind: z.string().max(24) });
export type FieldResult = z.infer<typeof FieldResultSchema>;
export type UndoResult = z.infer<typeof UndoResultSchema>;

export type FillFailure = "no_tab" | "no_access" | "invalid" | "page_changed";


/** The page the user is on must still be the page that was scanned (same origin and path): otherwise the references are stale. */
const samePage = (a: string, b: string) => {
  try {
    const x = new URL(a);
    const y = new URL(b);
    return x.origin === y.origin && x.pathname === y.pathname;
  } catch {
    return false;
  }
};

/** Writes the approved items into the scanned tab. Sends ONLY field ids and values; the page answers with one result per field. */
export async function fillTab(tabId: number, scannedUrl: string, scanId: string, items: readonly FillItem[]): Promise<{ ok: true; results: FieldResult[] } | { ok: false; reason: FillFailure }> {
  try {
    const tab = await browser.tabs.get(tabId);
    if (!tab.url || !samePage(tab.url, scannedUrl)) return { ok: false, reason: "page_changed" };
    await browser.scripting.executeScript({ target: { tabId, allFrames: false }, files: ["/content-scripts/filler.js"] });
    const payload = items.map((i) => ({ fieldId: i.fieldId, value: i.value }));
    const [res] = await browser.scripting.executeScript({ target: { tabId }, func: (id, p) => globalThis.__efFill?.(id, p) ?? null, args: [scanId, payload] as [string, typeof payload] });
    // `null`: the scan this fill refers to no longer exists in the page (it was reloaded), so nothing was written
    if (res?.result === null) return { ok: false, reason: "page_changed" };
    const parsed = z.array(FieldResultSchema).max(500).safeParse(res?.result);
    return parsed.success ? { ok: true, results: parsed.data } : { ok: false, reason: "invalid" };
  } catch {
    return { ok: false, reason: "no_access" };
  }
}

/** Restores the previous values of the last fill. The snapshot lives in the page; a reload loses it (the panel says so). */
export async function undoTab(tabId: number): Promise<{ ok: true; results: UndoResult[] } | { ok: false; reason: FillFailure }> {
  try {
    const [res] = await browser.scripting.executeScript({ target: { tabId }, func: () => globalThis.__efUndo?.() ?? null });
    const parsed = z.array(UndoResultSchema).max(500).safeParse(res?.result);
    return parsed.success ? { ok: true, results: parsed.data } : { ok: false, reason: "invalid" };
  } catch {
    return { ok: false, reason: "no_access" };
  }
}

export async function hasUndo(tabId: number): Promise<boolean> {
  try {
    const [res] = await browser.scripting.executeScript({ target: { tabId }, func: () => globalThis.__efHasUndo?.() ?? false });
    return res?.result === true;
  } catch {
    return false;
  }
}
