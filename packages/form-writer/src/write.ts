import { collapse, fold } from "@exponent-fill/form-engine";
import { guard, kindOf, pressesCommitControl } from "./guard";
import type { ResultCode, WidgetKind, WriteOptions, WriteResult } from "./types";

/**
 * Writes one value into one field, then READS IT BACK and compares canonical values (OB-05), without rewriting a field
 * that already holds the exact value (OB-06), with the combobox protocol (OB-07) and Unicode-safe matching (OB-08).
 * Result statuses: written (set AND read back equal) · already-correct (nothing written) · failed (explicit reason, never
 * a guess) · refused (a field the product must never fill). A "written" claim must be true in the page's own state:
 * a mismatch would be a SILENT FAILURE, the one outcome this module must never produce.
 */

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const tick = () => sleep(40);

// ---- canonical values (OB-05) ----------------------------------------------------------------------------------------
export function toIsoDate(s: string): string | null {
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s); // day-first (documented convention: FR / EN-UK)
  return m ? `${m[3]}-${(m[2] ?? "").padStart(2, "0")}-${(m[1] ?? "").padStart(2, "0")}` : null;
}

/** Canonical form per field type: comparisons never use prefixes or "any option". */
export function canonical(kind: string, v: unknown): string {
  const s = collapse(String(v ?? ""));
  switch (kind) {
    case "email":
      return s.toLowerCase();
    case "tel": {
      const d = s.replace(/[^\d+]/g, "");
      return d.startsWith("00") ? "+" + d.slice(2) : d;
    }
    case "number": {
      const n = Number(s.replace(/\s/g, "").replace(",", "."));
      return s !== "" && Number.isFinite(n) ? String(n) : s;
    }
    case "date":
      return toIsoDate(s) ?? s;
    default:
      return s;
  }
}

// ---- low-level helpers -------------------------------------------------------------------------------------------
const winOf = (el: Element): Window & typeof globalThis => (el.ownerDocument.defaultView ?? window) as Window & typeof globalThis;

function setNative(el: HTMLInputElement | HTMLTextAreaElement, v: string): void {
  const proto = Object.getPrototypeOf(el) as object;
  const desc = Object.getOwnPropertyDescriptor(proto, "value") ?? Object.getOwnPropertyDescriptor(winOf(el).HTMLInputElement.prototype, "value");
  desc?.set?.call(el, v); // bypasses framework value trackers (React) that shadow the instance property
}
function fireInput(el: Element, data?: string): void {
  const w = winOf(el);
  el.dispatchEvent(new w.InputEvent("input", { bubbles: true, cancelable: false, inputType: "insertText", data: data ?? null }));
}
function fireChange(el: Element): void {
  el.dispatchEvent(new (winOf(el).Event)("change", { bubbles: true, cancelable: false }));
}
function blur(el: Element): void {
  const w = winOf(el);
  el.dispatchEvent(new w.FocusEvent("blur"));
  el.dispatchEvent(new w.FocusEvent("focusout", { bubbles: true }));
}
/** Pressing like a user would. Callers must have checked `pressesCommitControl` first. */
function pointerSequence(el: Element): void {
  const w = winOf(el);
  for (const t of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
    el.dispatchEvent(new w.MouseEvent(t, { bubbles: true, cancelable: true, view: w, button: 0, buttons: t.endsWith("down") ? 1 : 0 }));
  }
}

const done = (kind: WidgetKind, code: ResultCode = "ok", extra: Partial<WriteResult> = {}): WriteResult => ({ status: code === "already_correct" ? "already-correct" : "written", kind, code, ...extra });
const fail = (kind: WidgetKind, code: ResultCode, reason: string, extra: Partial<WriteResult> = {}): WriteResult => ({ status: "failed", kind, code, reason, ...extra });

// ---- native text-like fields ---------------------------------------------------------------------------------------
type TextEl = HTMLInputElement | HTMLTextAreaElement;

async function writeText(el: TextEl, kind: WidgetKind, value: string, opts: WriteOptions): Promise<WriteResult> {
  const ck = kind === "textarea" || kind === "datetime-local" ? "text" : kind;
  const target = canonical(ck, value);
  const current = canonical(ck, el.value);
  if (current === target && el.checkValidity()) return done(kind, "already_correct"); // OB-06
  let toSet = String(value);
  if (kind === "date") {
    const iso = toIsoDate(collapse(value));
    if (!iso && !opts.restore) return fail(kind, "not_a_date", `not a date: ${value}`);
    toSet = iso ?? value;
  }
  if (kind === "number") toSet = canonical("number", value);
  // Constraints the browser only enforces for USER typing (maxlength) are checked here; the rest after the write.
  if (!opts.restore && el.maxLength >= 0 && toSet.length > el.maxLength) return fail(kind, "maxlength", `value is ${toSet.length} characters, longer than maxlength=${el.maxLength}`);
  const previous = el.value;
  const apply = (v: string) => {
    el.focus();
    setNative(el, v);
    fireInput(el, v);
    fireChange(el);
    blur(el);
  };
  apply(toSet);
  await tick();
  const back = el.value;
  if (canonical(ck, back) !== (opts.restore ? canonical(ck, toSet) : target)) return fail(kind, "readback_mismatch", `read-back mismatch: expected "${target}", got "${canonical(ck, back)}" (the page changed or rejected the value)`);
  if (!opts.restore && !el.validity.valid) {
    // pattern, range, format: roll the page back to what it held before, then fail explicitly
    const why = el.validationMessage;
    apply(previous);
    return fail(kind, "invalid_value", `the value is invalid for this field (${why}); previous value restored`);
  }
  return done(kind);
}

// ---- select / radio / checkbox ---------------------------------------------------------------------------------------
function matchByText<T>(items: T[], textOf: (i: T) => string[], value: string): { item: T; loose?: boolean } | { error: string; code: ResultCode } {
  const t = canonical("text", value);
  const exact = items.filter((i) => textOf(i).some((x) => canonical("text", x) === t));
  if (exact.length === 1) return { item: exact[0] as T };
  if (exact.length > 1) return { error: `ambiguous: ${exact.length} exact matches`, code: "ambiguous" };
  const f = fold(value);
  const loose = items.filter((i) => textOf(i).some((x) => fold(x) === f));
  if (loose.length === 1) return { item: loose[0] as T, loose: true };
  return loose.length ? { error: `ambiguous: ${loose.length} case/accent-insensitive matches`, code: "ambiguous" } : { error: "no matching option", code: "no_option" };
}

async function writeSelect(el: HTMLSelectElement, value: string): Promise<WriteResult> {
  const options = Array.from(el.options);
  const r = matchByText(options, (o) => [o.value, o.label, o.textContent ?? ""], value);
  if (!("item" in r)) return fail("select", r.code, r.error);
  if (r.item.value === "" && collapse(value) !== "") return fail("select", "placeholder_option", "matched the empty placeholder option");
  if (el.selectedOptions[0] === r.item && el.checkValidity()) return done("select", "already_correct"); // OB-06
  el.focus();
  el.value = r.item.value;
  fireInput(el);
  fireChange(el);
  await tick();
  if (el.selectedOptions[0] !== r.item) return fail("select", "readback_mismatch", "read-back mismatch: another option is selected");
  return done("select");
}

function groupOf(el: HTMLInputElement): HTMLInputElement[] {
  const root = el.getRootNode() as Document | ShadowRoot;
  if (el.name) return Array.from(root.querySelectorAll<HTMLInputElement>("input[type=radio]")).filter((r) => r.name === el.name);
  const grp = el.closest("[role=radiogroup],fieldset,.ant-radio-group,.MuiFormGroup-root");
  return grp ? Array.from(grp.querySelectorAll<HTMLInputElement>("input[type=radio]")) : [el];
}
const labelText = (el: HTMLInputElement): string => (el.labels && el.labels[0] ? el.labels[0].textContent ?? "" : (el.closest("label")?.textContent ?? ""));

async function writeRadio(el: HTMLInputElement, value: string | boolean): Promise<WriteResult> {
  const group = groupOf(el);
  const v = value === true ? el.value : String(value);
  const r = matchByText(group, (i) => [i.value, labelText(i)], v);
  if (!("item" in r)) return fail("radio", r.code, r.error);
  if (r.item.checked) return done("radio", "already_correct");
  r.item.click();
  await tick();
  if (!r.item.checked) return fail("radio", "not_selected", "read-back mismatch: the radio is not checked");
  return done("radio");
}

async function writeCheckbox(el: HTMLInputElement, value: string | boolean): Promise<WriteResult> {
  const want = value === true || /^(true|1|yes|oui|on|y)$/i.test(String(value));
  if (el.checked === want) return done("checkbox", "already_correct");
  el.click();
  await tick();
  if (el.checked !== want) return fail("checkbox", "readback_mismatch", "read-back mismatch: state did not change");
  return done("checkbox");
}

// ---- rich text (contenteditable: Quill, TipTap, ProseMirror, plain) --------------------------------------------------------
async function writeRichtext(el: HTMLElement, value: string): Promise<WriteResult> {
  const w = winOf(el);
  el.focus();
  const sel = w.getSelection();
  sel?.removeAllRanges();
  const range = el.ownerDocument.createRange();
  range.selectNodeContents(el);
  sel?.addRange(range);
  const doc = el.ownerDocument as Document & { execCommand?: (cmd: string, ui?: boolean, v?: string) => boolean };
  const ok = typeof doc.execCommand === "function" ? doc.execCommand(String(value) === "" ? "delete" : "insertText", false, String(value)) : false;
  await tick();
  await tick();
  const back = el.innerText ?? el.textContent ?? "";
  if (canonical("text", back) !== canonical("text", value)) {
    if (!ok) return fail("richtext", "editor_refused", "execCommand(insertText) refused by the editor");
    return fail("richtext", "readback_mismatch", `read-back mismatch: got "${collapse(back).slice(0, 60)}"`);
  }
  return done("richtext");
}

// ---- OB-07: combobox / autocomplete / custom listbox ---------------------------------------------------------------------
const OPTION_SEL = '[role="option"], .ant-select-item-option';
function visibleOptions(scope: ParentNode): HTMLElement[] {
  return Array.from(scope.querySelectorAll<HTMLElement>(OPTION_SEL)).filter((o) => {
    const r = o.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && winOf(o).getComputedStyle(o).visibility !== "hidden";
  });
}
const optionText = (o: Element): string => collapse(o.getAttribute("aria-label") || o.textContent);

/** The popup of a combobox: the element named by aria-controls/aria-owns when present, else null (use a baseline diff). */
function popupOf(el: Element): Element | null {
  const id = el.getAttribute("aria-controls") || el.getAttribute("aria-owns");
  if (!id) return null;
  const root = el.getRootNode() as Document | ShadowRoot;
  return root.getElementById?.(id) ?? el.ownerDocument.getElementById(id);
}

/** Bounded wait for options to appear and stop changing (async lists, portals). Only options of THIS combobox count. */
async function waitOptions(doc: Document, maxMs: number, popup: Element | null, baseline: Set<HTMLElement>): Promise<HTMLElement[]> {
  const mine = () => visibleOptions(popup ?? doc).filter((o) => popup || !baseline.has(o));
  const t0 = Date.now();
  let last = -1;
  let stableSince = Date.now();
  while (Date.now() - t0 < maxMs) {
    const n = mine().length;
    if (n !== last) {
      last = n;
      stableSince = Date.now();
    }
    if (n > 0 && Date.now() - stableSince >= 150) return mine();
    await sleep(40);
  }
  return mine();
}

/** Exact match, else UNIQUE partial match, else explicit failure with the reason. */
function chooseOption(options: HTMLElement[], value: string): { opt: HTMLElement; partial?: boolean } | { error: string; code: ResultCode } {
  const f = fold(value);
  const exact = options.filter((o) => fold(optionText(o)) === f);
  if (exact.length === 1) return { opt: exact[0] as HTMLElement };
  if (exact.length > 1) return { error: `ambiguous: ${exact.length} exact options`, code: "ambiguous" };
  const partial = options.filter((o) => fold(optionText(o)).includes(f));
  if (partial.length === 1) return { opt: partial[0] as HTMLElement, partial: true };
  return partial.length ? { error: `ambiguous: ${partial.length} options contain "${collapse(value)}"`, code: "ambiguous" } : { error: "no option matches", code: "no_option" };
}

async function writeCombobox(el: HTMLElement, kind: "combobox" | "combobox-input", value: string): Promise<WriteResult> {
  const doc = el.ownerDocument;
  const input = kind === "combobox-input" ? (el as HTMLInputElement) : el.querySelector<HTMLInputElement>("input");
  const typed = collapse(value);
  let options: HTMLElement[] = [];
  const baseline = new Set(visibleOptions(doc)); // options already on screen before we open anything are NOT ours
  const popup = (input ? popupOf(input) : null) ?? popupOf(el);
  if (kind === "combobox") {
    // non-input trigger (e.g. MUI Select): open it like a user would
    el.focus();
    pointerSequence(el);
    options = await waitOptions(doc, 1500, popupOf(el), baseline);
  } else if (input) {
    input.focus();
    for (const q of [typed, typed.length > 3 ? typed.slice(0, 3) : null]) {
      // retry with a shorter query (OB-07)
      if (q === null) break;
      setNative(input, q);
      fireInput(input, q);
      options = await waitOptions(doc, 1500, popup, baseline);
      if (options.length) break;
    }
  }
  if (!options.length) return fail(kind, "no_popup_options", "no option appeared (the typed text is NOT a selection)");
  const c = chooseOption(options, typed);
  if (!("opt" in c)) return fail(kind, c.code, c.error);
  const chosen = optionText(c.opt);
  if (pressesCommitControl(c.opt)) return { status: "refused", kind, code: "commit_control", reason: "the option sits inside a button or link: the product never presses controls" };
  pointerSequence(c.opt);
  await sleep(300);
  // Verify the REAL state: the list is closed and the chosen label is displayed where the user would look.
  const stillOpen = visibleOptions(popup ?? doc).filter((o) => popup || !baseline.has(o)).length > 0 && el.getAttribute("aria-expanded") !== "false";
  // The displayed value may live in a sibling of the search input: look at up to 4 ancestors, never the whole page.
  let shown = (input !== null && collapse(input.value) === chosen) || collapse(el.textContent).includes(chosen);
  for (let z: Element | null = input ?? el, i = 0; !shown && i < 4 && z?.parentElement; i++, z = z.parentElement) shown = collapse(z.parentElement?.textContent).includes(chosen);
  if (stillOpen) return fail(kind, "still_open", "the list is still open after the click: selection not confirmed");
  if (!shown) return fail(kind, "label_not_shown", `the chosen label "${chosen}" is not displayed: selection not confirmed`);
  return done(kind, "ok", c.partial ? { partial: true } : {});
}

async function writeListbox(el: HTMLElement, value: string): Promise<WriteResult> {
  // div role=listbox with role=option children (no input)
  const options = Array.from(el.querySelectorAll<HTMLElement>('[role="option"]'));
  const c = chooseOption(options, value);
  if (!("opt" in c)) return fail("listbox", c.code, c.error);
  if (c.opt.getAttribute("aria-selected") === "true") return done("listbox", "already_correct");
  if (pressesCommitControl(c.opt)) return { status: "refused", kind: "listbox", code: "commit_control", reason: "the option sits inside a button or link" };
  pointerSequence(c.opt);
  await tick();
  if (c.opt.getAttribute("aria-selected") !== "true") return fail("listbox", "not_selected", "read-back mismatch: the option is not selected");
  return done("listbox");
}

// ---- entry point ----------------------------------------------------------------------------------------------------------
export async function writeElement(el: Element, value: string | boolean, opts: WriteOptions = {}): Promise<WriteResult> {
  const kind = kindOf(el);
  const g = guard(el, kind);
  if (g) return { status: "refused", kind, code: g.code, reason: g.reason };
  try {
    switch (kind) {
      case "text":
      case "textarea":
      case "email":
      case "tel":
      case "number":
      case "date":
      case "datetime-local":
        return await writeText(el as TextEl, kind, String(value), opts);
      case "select":
        return await writeSelect(el as HTMLSelectElement, String(value));
      case "radio":
        return await writeRadio(el as HTMLInputElement, value);
      case "checkbox":
        return await writeCheckbox(el as HTMLInputElement, value);
      case "richtext":
        return await writeRichtext(el as HTMLElement, String(value));
      case "combobox":
      case "combobox-input":
        return await writeCombobox(el as HTMLElement, kind, String(value));
      case "listbox":
        return await writeListbox(el as HTMLElement, String(value));
      default:
        return fail(kind, "unsupported", "unsupported field type");
    }
  } catch (e) {
    return fail(kind, "exception", `exception: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/** Low-level helpers shared with the undo code of the session (same events, same read-back discipline). */
export const dom = { setNative, fireInput, fireChange, blur, sleep, tick };
