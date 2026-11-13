import { rawLabel } from "./labels";
import { cssEscape, fnv1a } from "./text";
import type { FieldRef } from "./types";

type Root = Document | ShadowRoot;

/** CSS path of `el` inside `root`: unique #id when there is one, else a tag/nth-of-type chain. Reads the DOM, never writes it. */
export function pathWithin(el: Element, root: Root): string {
  const parts: string[] = [];
  let cur: Element | null = el;
  while (cur) {
    if (cur.id) {
      const sel = `#${cssEscape(cur.id)}`;
      if (root.querySelectorAll(sel).length === 1) {
        parts.unshift(sel);
        break;
      }
    }
    const parent: Element | null = cur.parentElement;
    const tag = cur.tagName.toLowerCase();
    if (!parent) {
      parts.unshift(tag);
      break;
    }
    const same = Array.from(parent.children).filter((c) => c.tagName === cur!.tagName);
    parts.unshift(same.length > 1 ? `${tag}:nth-of-type(${same.indexOf(cur) + 1})` : tag);
    cur = parent;
  }
  return parts.join(" > ");
}

/** Fingerprint from the field's OWN attributes and explicit label: it does not depend on position, so it survives reordering. */
export function fingerprint(el: Element): string {
  const a = (n: string) => el.getAttribute(n) ?? "";
  return fnv1a([el.tagName, a("type"), a("name"), el.id, a("autocomplete"), a("placeholder"), a("role"), a("value") && el.matches("input[type=radio],input[type=checkbox]") ? a("value") : "", rawLabel(el)].join("|"));
}

export interface RootStep {
  root: Root;
  hosts: string[];
}

/** Build the reference of a field. `hostChain` lists the shadow hosts crossed (outermost first) with their roots. */
export function buildRef(el: Element, root: Root, hostChain: { host: Element; parentRoot: Root }[]): FieldRef {
  return {
    hosts: hostChain.map((h) => pathWithin(h.host, h.parentRoot)),
    path: pathWithin(el, root),
    fp: fingerprint(el),
  };
}

export interface ResolveOptions {
  getShadowRoot?: (el: Element) => ShadowRoot | null;
  /** Candidate elements to search by fingerprint when the path no longer matches (e.g. after a reorder). */
  candidates?: (root: Root) => Element[];
}

/**
 * Find the element again. 1) by path, checked against the fingerprint; 2) by fingerprint among the candidates.
 * Several candidates with the same fingerprint => null (ambiguous): the caller must report it, never guess.
 */
export function resolveRef(doc: Root, ref: FieldRef, opts: ResolveOptions = {}): Element | null {
  let root: Root = doc;
  for (const h of ref.hosts) {
    const host = root.querySelector(h);
    if (!host) return null;
    const sr = host.shadowRoot ?? opts.getShadowRoot?.(host) ?? null;
    if (!sr) return null;
    root = sr;
  }
  try {
    const byPath = root.querySelector(ref.path);
    if (byPath && fingerprint(byPath) === ref.fp) return byPath;
  } catch {
    /* invalid selector: fall through to the fingerprint search */
  }
  const pool = opts.candidates ? opts.candidates(root) : Array.from(root.querySelectorAll("input, select, textarea, [contenteditable], [role='combobox'], [role='listbox'], [role='textbox']"));
  const hits = pool.filter((c) => fingerprint(c) === ref.fp);
  return hits.length === 1 ? (hits[0] ?? null) : null;
}
