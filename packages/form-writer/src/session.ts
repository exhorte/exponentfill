import { guard, kindOf } from "./guard";
import type { ResultCode, WidgetKind, WriteResult } from "./types";
import { canonical, dom, writeElement } from "./write";

export interface FillRequestItem {
  fieldId: string;
  value: string | boolean;
}
export interface FieldResult extends WriteResult {
  fieldId: string;
}
export interface UndoResult {
  fieldId: string;
  status: "restored" | "failed" | "skipped";
  code: ResultCode;
  kind: WidgetKind;
}

/** The state of a field BEFORE a write. Kept only in the page's own memory: it is never sent anywhere or stored. */
type Snapshot =
  | { type: "value"; el: HTMLInputElement | HTMLTextAreaElement; kind: WidgetKind; value: string }
  | { type: "select"; el: HTMLSelectElement; index: number }
  | { type: "checkbox"; el: HTMLInputElement; checked: boolean }
  | { type: "radio"; el: HTMLInputElement; previous: HTMLInputElement | null; group: HTMLInputElement[] }
  | { type: "richtext"; el: HTMLElement; text: string }
  | { type: "none"; el: Element; kind: WidgetKind };

const TEXT_KINDS: ReadonlySet<WidgetKind> = new Set(["text", "textarea", "email", "tel", "number", "date", "datetime-local", "combobox-input"]);

function capture(el: Element, kind: WidgetKind): Snapshot {
  if (TEXT_KINDS.has(kind)) return { type: "value", el: el as HTMLInputElement, kind, value: (el as HTMLInputElement).value };
  if (kind === "select") return { type: "select", el: el as HTMLSelectElement, index: (el as HTMLSelectElement).selectedIndex };
  if (kind === "checkbox") return { type: "checkbox", el: el as HTMLInputElement, checked: (el as HTMLInputElement).checked };
  if (kind === "radio") {
    const r = el as HTMLInputElement;
    const root = r.getRootNode() as Document | ShadowRoot;
    const group = r.name ? Array.from(root.querySelectorAll<HTMLInputElement>("input[type=radio]")).filter((x) => x.name === r.name) : [r];
    return { type: "radio", el: r, previous: group.find((x) => x.checked) ?? null, group };
  }
  if (kind === "richtext") return { type: "richtext", el: el as HTMLElement, text: (el as HTMLElement).innerText ?? el.textContent ?? "" };
  return { type: "none", el, kind };
}

async function restore(s: Snapshot): Promise<{ ok: boolean; code: ResultCode }> {
  switch (s.type) {
    case "value": {
      if (s.kind === "combobox-input") {
        dom.setNative(s.el, s.value);
        dom.fireInput(s.el, s.value);
        dom.fireChange(s.el);
        await dom.tick();
        return s.el.value === s.value ? { ok: true, code: "ok" } : { ok: false, code: "readback_mismatch" };
      }
      const r = await writeElement(s.el, s.value, { restore: true });
      return { ok: r.status === "written" || r.status === "already-correct", code: r.code };
    }
    case "select": {
      s.el.selectedIndex = s.index;
      dom.fireInput(s.el);
      dom.fireChange(s.el);
      await dom.tick();
      return s.el.selectedIndex === s.index ? { ok: true, code: "ok" } : { ok: false, code: "readback_mismatch" };
    }
    case "checkbox": {
      const r = await writeElement(s.el, s.checked, { restore: true });
      return { ok: r.status === "written" || r.status === "already-correct", code: r.code };
    }
    case "radio": {
      if (s.previous) {
        s.previous.click();
        await dom.tick();
        return s.previous.checked ? { ok: true, code: "ok" } : { ok: false, code: "readback_mismatch" };
      }
      // nothing was checked before: a radio cannot be unchecked by a click, so clear the one that is checked now
      // (any member of the group, not necessarily the element the fill was addressed to) the way a script would
      for (const member of s.group.filter((x) => x.checked)) {
        member.checked = false;
        dom.fireInput(member);
        dom.fireChange(member);
      }
      await dom.tick();
      return s.group.some((x) => x.checked) ? { ok: false, code: "readback_mismatch" } : { ok: true, code: "ok" };
    }
    case "richtext": {
      const r = await writeElement(s.el, s.text, { restore: true });
      return { ok: r.status === "written" || r.status === "already-correct", code: r.code };
    }
    default:
      return { ok: false, code: "undo_unsupported" };
  }
}

/**
 * One filling pass over the fields the user approved, with a one-level undo (FR-13). The snapshot of the previous values
 * lives in this object, i.e. in the page's own memory: it is never sent to the panel, never stored, and is lost when the
 * page reloads (the panel says so).
 */
export class FillSession {
  private undoStack: { fieldId: string; snap: Snapshot }[] = [];

  constructor(private readonly resolve: (fieldId: string) => Element | null) {}

  hasUndo(): boolean {
    return this.undoStack.length > 0;
  }

  async fill(items: readonly FillRequestItem[]): Promise<FieldResult[]> {
    this.undoStack = []; // one level: a new fill replaces the previous undo point
    const results: FieldResult[] = [];
    for (const item of items) {
      const el = this.resolve(item.fieldId);
      if (!el) {
        results.push({ fieldId: item.fieldId, status: "failed", kind: "unknown", code: "not_found", reason: "field not found (the page changed since the scan)" });
        continue;
      }
      const kind = kindOf(el);
      const snap = guard(el, kind) ? null : capture(el, kind); // never snapshot what will be refused
      const r = await writeElement(el, item.value);
      results.push({ fieldId: item.fieldId, ...r });
      if (snap && r.status === "written") this.undoStack.push({ fieldId: item.fieldId, snap });
    }
    return results;
  }

  /** Restores, in reverse order, every field this session wrote. Combobox and listbox selections cannot be restored reliably. */
  async undo(): Promise<UndoResult[]> {
    const out: UndoResult[] = [];
    const stack = this.undoStack.reverse();
    this.undoStack = [];
    for (const { fieldId, snap } of stack) {
      const kind = "kind" in snap ? snap.kind : kindOf(snap.el);
      if (!snap.el.isConnected) {
        out.push({ fieldId, status: "skipped", code: "not_found", kind });
        continue;
      }
      const r = await restore(snap);
      out.push({ fieldId, status: r.ok ? "restored" : "failed", code: r.code, kind });
    }
    return out;
  }
}

export { canonical };
