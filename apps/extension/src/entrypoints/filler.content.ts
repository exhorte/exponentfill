import { resolveRef } from "@exponent-fill/form-engine";
import { FillSession, type FieldResult, type FillRequestItem, type UndoResult } from "@exponent-fill/form-writer";
import { defineContentScript } from "wxt/utils/define-content-script";

declare global {
  /** Resolves fields through the scan with this id; `null` when that scan is gone (the page was reloaded): nothing is written. */
  var __efFill: ((scanId: string, items: FillRequestItem[]) => Promise<FieldResult[] | null>) | undefined;
  var __efUndo: (() => Promise<UndoResult[]>) | undefined;
  var __efHasUndo: (() => boolean) | undefined;
}

/**
 * The filler (Phase 6, ADR-023). Runtime-registered like the scanner: injected only into the tab the user is looking at,
 * after an explicit action. It writes ONLY the fields the panel sends, resolved through the references of the scan the
 * panel is showing, reads every value back, refuses secrets and every commit control, and has NO way to submit anything.
 *
 * The undo snapshot lives in this isolated world's memory: it is never sent to the panel, stored, or logged.
 */
export default defineContentScript({
  matches: ["https://*/*", "http://*/*"],
  registration: "runtime",
  main() {
    if (globalThis.__efFill) return; // injected again for a later fill: keep the session (and its undo point)
    const dom = (globalThis as unknown as { chrome?: { dom?: { openOrClosedShadowRoot?: (el: HTMLElement) => ShadowRoot | null } } }).chrome?.dom;
    const getShadowRoot = (el: Element) => dom?.openOrClosedShadowRoot?.(el as HTMLElement) ?? null;
    let session: FillSession | null = null;

    globalThis.__efFill = async (scanId, items) => {
      const scan = globalThis.__efScans?.get(scanId);
      if (!scan) return null;
      const refs = new Map(scan.fields.map((f) => [f.id, f.ref]));
      session = new FillSession((id) => {
        const ref = refs.get(id);
        return ref ? resolveRef(document, ref, { getShadowRoot }) : null;
      });
      return session.fill(items);
    };
    globalThis.__efUndo = async () => (session ? session.undo() : []);
    globalThis.__efHasUndo = () => session?.hasUndo() ?? false;
  },
});
