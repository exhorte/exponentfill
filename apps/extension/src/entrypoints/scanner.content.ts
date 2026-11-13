import { scanForm, type ScanResult } from "@exponent-fill/form-engine";
import { defineContentScript } from "wxt/utils/define-content-script";

declare global {
  // Set by this script, called by the side panel through `scripting.executeScript`.
  var __efScan: (() => ScanResult & { scanId: string }) | undefined;
  // The recent scans WITH their field references, by scan id. They stay in this isolated world: the panel only gets the
  // structure back, and the filler resolves a field through the scan the panel is showing (a later scan never replaces it).
  var __efScans: Map<string, ScanResult> | undefined;
}

const MAX_SCANS = 5;

/** Not crypto.randomUUID(): it only exists in secure contexts, and plain-http sites are treated like https (D3). */
function newScanId(): string {
  const b = new Uint8Array(12);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

/**
 * Form scanner (Phase 3). `registration: "runtime"` keeps it OUT of the manifest: it is injected only into the tab the
 * user is looking at, after an explicit action (activeTab or a per-site permission, ADR-004).
 *
 * It READS the page and returns STRUCTURE only (labels, kinds, options, semantic hints): never a value. It writes nothing.
 */
export default defineContentScript({
  matches: ["https://*/*", "http://*/*"],
  registration: "runtime",
  main() {
    const dom = (globalThis as unknown as { chrome?: { dom?: { openOrClosedShadowRoot?: (el: HTMLElement) => ShadowRoot | null } } }).chrome?.dom;
    globalThis.__efScan = () => {
      const scan = scanForm(document, {
        // Closed shadow roots are reachable from an extension content script.
        getShadowRoot: (el) => dom?.openOrClosedShadowRoot?.(el as HTMLElement) ?? null,
        isVisible: (el) => {
          const rects = (el as HTMLElement).getClientRects();
          if (rects.length === 0) return false;
          const style = getComputedStyle(el as HTMLElement);
          return style.visibility !== "hidden" && style.display !== "none";
        },
      });
      const scanId = newScanId();
      const scans = (globalThis.__efScans ??= new Map());
      scans.set(scanId, scan);
      while (scans.size > MAX_SCANS) scans.delete(scans.keys().next().value as string);
      return { ...scan, scanId };
    };
  },
});
