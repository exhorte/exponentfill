import type { ResultCode, WidgetKind } from "./types";

export function kindOf(el: Element): WidgetKind {
  const tag = el.tagName;
  if (tag === "INPUT") {
    const t = ((el as HTMLInputElement).type || "text").toLowerCase();
    if (["checkbox", "radio", "file", "hidden", "password", "date", "datetime-local", "number", "tel", "email"].includes(t)) return t as WidgetKind;
    if (el.getAttribute("role") === "combobox" || el.getAttribute("aria-autocomplete")) return "combobox-input";
    return "text";
  }
  if (tag === "TEXTAREA") return "textarea";
  if (tag === "SELECT") return "select";
  if (el.getAttribute("role") === "combobox") return "combobox";
  if (el.getAttribute("role") === "listbox") return "listbox";
  if ((el as HTMLElement).isContentEditable) return "richtext";
  return "unknown";
}

/**
 * Anything that DOES something when pressed: submit, pay, sign, delete, navigate. The writer never touches these
 * (security invariant 2, level 3 is structural): not as a target, and not as a thing to click on the way.
 * A `role="button"` that opens a list (aria-haspopup) is a combobox trigger, not a commit control.
 */
export function isCommitControl(el: Element): boolean {
  const tag = el.tagName;
  if (tag === "BUTTON" || tag === "A") return true;
  if (tag === "INPUT" && ["submit", "button", "image", "reset"].includes(((el as HTMLInputElement).type || "").toLowerCase())) return true; // invariant-ok: refusal list, these controls are never pressed
  if (el.getAttribute("role") === "button" && !el.getAttribute("aria-haspopup")) return true;
  return false;
}

/** True when pressing `el` would press a commit control (the element itself, or something inside one). */
export function pressesCommitControl(el: Element): boolean {
  for (let cur: Element | null = el; cur; cur = cur.parentElement) if (isCommitControl(cur) && !(cur.getAttribute("role") === "option")) return true;
  return false;
}

/** Fields the product must NEVER fill, whatever the value (security invariant 5 and plain safety). */
export function guard(el: Element, kind: WidgetKind): { code: ResultCode; reason: string } | null {
  const input = el as HTMLInputElement;
  const ac = (el.getAttribute("autocomplete") || "").toLowerCase();
  const id = `${input.name || ""} ${el.id || ""}`;
  if (isCommitControl(el)) return { code: "commit_control", reason: "a button or link: the product never presses controls" };
  // autocomplete="new-password" is also used as an anti-autofill hack on ordinary inputs (e.g. UI-library selects):
  // it only counts as a secret when the field itself looks like a password.
  if (kind === "password" || (/(new|current)-password/.test(ac) && /pass|pwd|mdp/i.test(id))) return { code: "secret", reason: "secret: password" };
  if (/one-time-code|cc-csc|cc-number|cc-exp/.test(ac) || /(^|[^a-z])(otp|cvc|cvv|pin)([^a-z]|$)/i.test(id)) return { code: "secret", reason: "secret: one-time code or card data" };
  if (kind === "hidden") return { code: "hidden", reason: "hidden field" };
  if (kind === "file") return { code: "file", reason: "file input (documents are Phase 8)" };
  if (input.disabled) return { code: "disabled", reason: "disabled" };
  if (input.readOnly && ["text", "textarea", "email", "tel", "number", "date"].includes(kind)) return { code: "read_only", reason: "read-only" };
  return null;
}
