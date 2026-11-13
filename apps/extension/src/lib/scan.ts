import { browser } from "wxt/browser";
import type { MatchableField } from "@exponent-fill/vault-domain";
import { z } from "zod";

/** What crosses the boundary from the page's tab: validated, because its text comes from an untrusted page. */
const FieldSchema = z.object({
  id: z.string().max(32),
  kind: z.string().max(24),
  label: z.object({ text: z.string().max(400), source: z.string(), confidence: z.number(), shared: z.boolean() }),
  section: z.string().max(400).nullable(),
  required: z.boolean(),
  disabled: z.boolean(),
  readOnly: z.boolean(),
  hasValue: z.boolean(),
  constraints: z.object({ maxLength: z.number().nullable(), multiple: z.boolean() }).partial().optional(),
  options: z.array(z.object({ value: z.string().max(400), label: z.string().max(400), selected: z.boolean(), disabled: z.boolean() })).max(500).nullable(),
  semantic: z.object({ type: z.string().max(48), confidence: z.number(), via: z.string(), secret: z.boolean(), sensitive: z.boolean() }),
});
const ScanSchema = z.object({
  scanId: z.string().regex(/^[0-9a-f]{24}$/),
  fields: z.array(FieldSchema).max(500),
  buttons: z.array(z.object({ text: z.string().max(200), intent: z.enum(["next", "previous", "dismiss", "commit"]), commitKind: z.string().nullable(), reason: z.string() })),
  stats: z.object({ fields: z.number(), unlabeled: z.number(), sharedLabels: z.number(), secrets: z.number(), skipped: z.number() }),
});
export type PageScan = Omit<z.infer<typeof ScanSchema>, "fields"> & { fields: (MatchableField & { hasValue: boolean; constraints?: { maxLength?: number | null; multiple?: boolean } })[] };

export type ScanFailure = "no_tab" | "no_access" | "invalid";

/** The tab the user is looking at, if it is an ordinary web page. */
export async function activeWebTab(): Promise<{ id: number; url: string } | null> {
  const [tab] = await browser.tabs.query({ active: true, lastFocusedWindow: true });
  return tab?.id && tab.url && /^https?:/.test(tab.url) ? { id: tab.id, url: tab.url } : null;
}

/** Scans the tab the user is looking at. Needs activeTab (toolbar click) or a per-site permission. Reads, never writes. */
export async function scanActiveTab(): Promise<{ ok: true; scan: PageScan; url: string; tabId: number; scanId: string } | { ok: false; reason: ScanFailure }> {
  const tab = await activeWebTab();
  if (!tab) return { ok: false, reason: "no_tab" };
  try {
    await browser.scripting.executeScript({ target: { tabId: tab.id, allFrames: false }, files: ["/content-scripts/scanner.js"] });
    const [res] = await browser.scripting.executeScript({ target: { tabId: tab.id }, func: () => globalThis.__efScan?.() ?? null });
    const parsed = ScanSchema.safeParse(res?.result);
    if (!parsed.success) return { ok: false, reason: "invalid" };
    return { ok: true, scan: parsed.data as PageScan, url: tab.url, tabId: tab.id, scanId: parsed.data.scanId };
  } catch {
    return { ok: false, reason: "no_access" };
  }
}
