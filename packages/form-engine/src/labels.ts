import { collapse } from "./text";
import type { LabelInfo, LabelSource } from "./types";

export const CONTROL_SEL = "input, select, textarea, button, [contenteditable=''], [contenteditable='true'], [role='combobox'], [role='listbox'], [role='textbox']";

const MAX_QUESTION = 140;

function rootGet(el: Element, id: string): Element | null {
  const root = el.getRootNode() as Document | ShadowRoot;
  return (root as Document).getElementById?.(id) ?? el.ownerDocument.getElementById(id);
}

/** Text of an element without its form controls, options, scripts and styles. */
export function textWithoutControls(el: Element): string {
  const clone = el.cloneNode(true) as Element;
  clone.querySelectorAll("input, select, textarea, button, option, script, style, svg").forEach((n) => n.remove());
  return collapse(clone.textContent);
}

/** Explicit label: aria-labelledby, then <label for> / el.labels, then a wrapping <label>. */
export function explicitLabel(el: Element): { text: string; source: LabelSource } | null {
  const by = el.getAttribute("aria-labelledby");
  if (by) {
    const t = collapse(
      by
        .split(/\s+/)
        .map((id) => rootGet(el, id))
        .filter((n): n is Element => n !== null)
        .map((n) => n.textContent ?? "")
        .join(" "),
    );
    if (t) return { text: t, source: "aria-labelledby" };
  }
  const labels = (el as HTMLInputElement).labels;
  if (labels && labels.length > 0) {
    const t = collapse(Array.from(labels).map((l) => textWithoutControls(l)).join(" "));
    if (t) {
      const wrapped = Array.from(labels).some((l) => l.contains(el));
      return { text: t, source: wrapped ? "label-wrap" : "label-for" };
    }
  }
  const wrap = el.closest("label");
  if (wrap) {
    const t = textWithoutControls(wrap);
    if (t) return { text: t, source: "label-wrap" };
  }
  return null;
}

/** Text of the nearest previous siblings that carry a short question and no control. */
function previousText(el: Element): string | null {
  let prev = el.previousElementSibling;
  for (let i = 0; prev && i < 2; i++, prev = prev.previousElementSibling) {
    if (prev.matches(CONTROL_SEL) || prev.querySelector(CONTROL_SEL)) return null;
    const t = collapse(prev.textContent);
    if (t && t.length <= MAX_QUESTION) return t;
  }
  return null;
}

/**
 * The question that belongs to THIS field (OB-01): the text of the nearest wrapper that contains exactly one control,
 * else the short text just before the field. A wrapper holding several controls is never used (it asks several questions).
 */
export function containerQuestion(el: Element): string | null {
  let cur: Element = el;
  for (let depth = 0; depth < 4; depth++) {
    const parent = cur.parentElement;
    if (!parent) break;
    const controls = Array.from(parent.querySelectorAll(CONTROL_SEL)).filter((c) => c.tagName !== "BUTTON");
    if (controls.length > 1) return previousText(cur);
    const own = textWithoutControls(parent);
    if (own && own.length <= MAX_QUESTION) return own;
    cur = parent;
  }
  return previousText(el);
}

/** Legend or accessible name of the group (fieldset, role=group/radiogroup) around a set of controls. */
export function groupQuestion(members: Element[]): string | null {
  const first = members[0];
  if (!first) return null;
  const fs = first.closest("fieldset");
  const legend = fs?.querySelector(":scope > legend");
  if (legend) {
    const t = collapse(legend.textContent);
    if (t) return t;
  }
  const grp = first.closest("[role='radiogroup'], [role='group']");
  if (grp) {
    const by = grp.getAttribute("aria-labelledby");
    if (by) {
      const t = collapse(by.split(/\s+/).map((id) => rootGet(grp, id)?.textContent ?? "").join(" "));
      if (t) return t;
    }
    const al = collapse(grp.getAttribute("aria-label"));
    if (al) return al;
  }
  // Lowest common ancestor, never climbing into a container that also holds controls OUTSIDE the group (another question).
  let lca: Element | null = first.parentElement;
  while (lca && !members.every((m) => lca!.contains(m))) lca = lca.parentElement;
  for (let i = 0; lca && i < 3; i++, lca = lca.parentElement) {
    const all = Array.from(lca.querySelectorAll(CONTROL_SEL)).filter((c) => c.tagName !== "BUTTON");
    const outside = all.filter((c) => !members.includes(c));
    if (outside.length > 0) return previousText(lca);
    const own = textWithoutControls(lca);
    const optionTexts = members.map((m) => explicitLabel(m)?.text ?? "").filter(Boolean);
    let q = own;
    for (const o of optionTexts) q = collapse(q.replace(o, ""));
    if (q && q.length <= MAX_QUESTION) return q;
    const p = previousText(lca);
    if (p) return p;
  }
  return null;
}

function humanize(s: string): string {
  return collapse(s.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_\-.[\]]+/g, " "));
}

/** Label of a single field. `sharedAria` counts how many fields of the page use each aria-label. */
export function labelFor(el: Element, sharedAria: Map<string, number>): LabelInfo {
  const make = (text: string, source: LabelSource, confidence: number, shared = false): LabelInfo => ({ text, source, confidence, shared });
  const exp = explicitLabel(el);
  if (exp) return make(exp.text, exp.source, exp.source === "aria-labelledby" ? 0.95 : 0.92);

  const aria = collapse(el.getAttribute("aria-label"));
  const isShared = aria !== "" && (sharedAria.get(aria) ?? 0) > 1;
  if (aria && !isShared) return make(aria, "aria-label", 0.85);

  const q = containerQuestion(el);
  if (q) return make(q, "container-question", isShared ? 0.75 : 0.6, isShared);
  if (aria) return make(aria, "aria-label", 0.3, true);

  const ph = collapse(el.getAttribute("placeholder"));
  if (ph) return make(ph, "placeholder", 0.5);
  const title = collapse(el.getAttribute("title"));
  if (title) return make(title, "title", 0.5);
  const name = el.getAttribute("name") || el.id;
  if (name) return make(humanize(name), "name", 0.3);
  return make("", "none", 0);
}

/** Raw label used only for the fingerprint (no heuristics, so it is stable). */
export function rawLabel(el: Element): string {
  return explicitLabel(el)?.text ?? collapse(el.getAttribute("aria-label")) ?? "";
}
