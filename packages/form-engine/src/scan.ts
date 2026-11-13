import { classifyButton } from "./buttons";
import { CONTROL_SEL, explicitLabel, groupQuestion, labelFor, textWithoutControls } from "./labels";
import { buildRef } from "./refs";
import { classifySemantic } from "./semantic";
import { collapse } from "./text";
import type { ButtonInfo, Constraints, FieldKind, FieldOption, FormField, ScanOptions, ScanResult } from "./types";

type Root = Document | ShadowRoot;
interface Found {
  el: Element;
  root: Root;
  chain: { host: Element; parentRoot: Root }[];
}

const SKIPPED_INPUT_TYPES = new Set(["hidden", "submit", "button", "reset", "image"]);
const FIELD_SEL = "input, select, textarea, [contenteditable=''], [contenteditable='true'], [role='combobox'], [role='listbox'], [role='textbox']";
const BUTTON_SEL = "button, input[type='submit'], input[type='button'], input[type='reset'], [role='button']";

/** Attribute-based visibility (works without layout, e.g. in jsdom). In a browser pass `isVisible` based on layout. */
export function defaultIsVisible(el: Element): boolean {
  for (let cur: Element | null = el; cur; cur = cur.parentElement) {
    if ((cur as HTMLElement).hidden || cur.getAttribute("aria-hidden") === "true") return false;
    const style = (cur.getAttribute("style") ?? "").replace(/\s+/g, "").toLowerCase();
    if (/display:none|visibility:hidden/.test(style)) return false;
  }
  return true;
}

function collect(root: Root, sel: string, opts: ScanOptions, chain: Found["chain"] = [], out: Found[] = []): Found[] {
  const scope: ParentNode = root;
  const all = Array.from(scope.querySelectorAll("*"));
  for (const el of all) {
    if (el.matches(sel)) out.push({ el, root, chain });
    const sr = el.shadowRoot ?? opts.getShadowRoot?.(el) ?? null;
    if (sr) collect(sr, sel, opts, [...chain, { host: el, parentRoot: root }], out);
  }
  return out;
}

function kindOf(el: Element): FieldKind | "skip" {
  const tag = el.tagName;
  if (tag === "INPUT") {
    const t = ((el as HTMLInputElement).type || "text").toLowerCase();
    if (SKIPPED_INPUT_TYPES.has(t)) return "skip";
    if (t === "checkbox") return "checkbox";
    if (t === "radio") return "radio-group";
    if (t === "file") return "file";
    if (t === "password") return "password";
    if (t === "email" || t === "tel" || t === "number" || t === "date" || t === "datetime-local") return t;
    if (el.getAttribute("role") === "combobox" || el.getAttribute("aria-autocomplete")) return "combobox";
    return "text";
  }
  if (tag === "TEXTAREA") return "textarea";
  if (tag === "SELECT") return "select";
  const role = el.getAttribute("role");
  if (role === "combobox") return "combobox";
  if (role === "listbox") return "listbox";
  if (role === "textbox" || (el as HTMLElement).isContentEditable || el.getAttribute("contenteditable") !== null) return "richtext";
  return "unknown";
}

function constraintsOf(el: Element): Constraints {
  const a = (n: string) => el.getAttribute(n);
  const num = (n: string) => {
    const v = a(n);
    return v !== null && v !== "" && Number.isFinite(Number(v)) ? Number(v) : null;
  };
  return {
    maxLength: num("maxlength"),
    minLength: num("minlength"),
    pattern: a("pattern"),
    min: a("min"),
    max: a("max"),
    step: a("step"),
    multiple: el.hasAttribute("multiple"),
    accept: a("accept"),
  };
}

function isRequired(el: Element, labelText: string): boolean {
  return (
    el.hasAttribute("required") ||
    el.getAttribute("aria-required") === "true" ||
    /(\*\s*$|\(\s*(required|obligatoire)\s*\)|\bobligatoire\b)/i.test(labelText)
  );
}

function cleanLabel(text: string): string {
  return collapse(text.replace(/\s*\*\s*$/, "").replace(/\(\s*(required|obligatoire)\s*\)/i, ""));
}

function sectionOf(el: Element): string | null {
  const fs = el.closest("fieldset");
  const legend = fs?.querySelector(":scope > legend");
  if (legend && !legend.contains(el)) {
    const t = collapse(legend.textContent);
    if (t) return t;
  }
  for (let cur: Element | null = el; cur; cur = cur.parentElement) {
    let prev = cur.previousElementSibling;
    for (let i = 0; prev && i < 3; i++, prev = prev.previousElementSibling) {
      if (/^H[1-6]$/.test(prev.tagName)) return collapse(prev.textContent) || null;
    }
  }
  return null;
}

function hasValue(el: Element): boolean {
  if (el instanceof Object && "value" in el) {
    const t = (el as HTMLInputElement).type;
    if (t === "checkbox" || t === "radio") return (el as HTMLInputElement).checked;
    return String((el as HTMLInputElement).value ?? "") !== "";
  }
  return collapse(el.textContent) !== "";
}

function optionsOfSelect(el: HTMLSelectElement): FieldOption[] {
  return Array.from(el.options)
    .filter((o) => !(o.value === "" && collapse(o.textContent) !== "" && o.index === 0))
    .map((o) => ({ value: o.value, label: collapse(o.label || o.textContent), selected: o.selected, disabled: o.disabled }));
}

function optionLabel(r: Element): string {
  return explicitLabel(r)?.text ?? collapse(r.getAttribute("aria-label")) ?? collapse(r.getAttribute("value"));
}

/** Scan a document (or shadow root / subtree) and describe every fillable field and every button. Never writes to the DOM. */
export function scanForm(rootNode: Root | Element, options: ScanOptions = {}): ScanResult {
  const isVisible = options.isVisible ?? defaultIsVisible;
  // No `instanceof`: the engine must work with any DOM implementation (browser, jsdom), where globals differ.
  const isElement = (n: Root | Element): n is Element => n.nodeType === 1;
  const scope: Root = isElement(rootNode) ? (rootNode.getRootNode() as Root) : rootNode;
  const subtree = isElement(rootNode) ? rootNode : null;

  const found = collect(scope, FIELD_SEL, options).filter((f) => !subtree || subtree.contains(f.el) || f.chain.length > 0);
  let skipped = 0;

  // aria-label sharing across the page (OB-01): a label that many fields carry identifies none of them.
  const sharedAria = new Map<string, number>();
  for (const f of found) {
    const al = collapse(f.el.getAttribute("aria-label"));
    if (al) sharedAria.set(al, (sharedAria.get(al) ?? 0) + 1);
  }

  const fields: FormField[] = [];
  const doneGroups = new Set<string>();
  let n = 0;

  for (const f of found) {
    const kind = kindOf(f.el);
    if (kind === "skip" || kind === "unknown") {
      skipped++;
      continue;
    }
    if (!options.includeHidden && !isVisible(f.el)) {
      skipped++;
      continue;
    }
    // A closed contenteditable inside an editor widget is reported once (the editable root).
    if (kind === "richtext" && f.el.parentElement?.closest("[contenteditable='true'],[contenteditable='']")) {
      skipped++;
      continue;
    }

    let members: Element[] = [f.el];
    let finalKind: FieldKind = kind;
    let label;
    let options_: FieldOption[] | null = null;

    if (kind === "radio-group" || kind === "checkbox") {
      const name = f.el.getAttribute("name");
      const sameRoot = Array.from(f.root.querySelectorAll(`input[type='${kind === "checkbox" ? "checkbox" : "radio"}']`)).filter((x) => (name ? x.getAttribute("name") === name : x === f.el));
      const groupKey = `${kind}:${name ?? `#${n}`}:${f.chain.length}`;
      if (kind === "radio-group" && name) {
        if (doneGroups.has(groupKey)) continue;
        doneGroups.add(groupKey);
        members = sameRoot;
      } else if (kind === "checkbox" && name && sameRoot.length > 1) {
        if (doneGroups.has(groupKey)) continue;
        doneGroups.add(groupKey);
        members = sameRoot;
        finalKind = "checkbox-group";
      }
      if (members.length > 1 || kind === "radio-group") {
        const q = groupQuestion(members);
        label = { text: q ?? "", source: q ? ("group-legend" as const) : ("none" as const), confidence: q ? 0.9 : 0, shared: false };
        options_ = members.map((m) => ({ value: m.getAttribute("value") ?? "on", label: optionLabel(m), selected: (m as HTMLInputElement).checked, disabled: (m as HTMLInputElement).disabled }));
      }
    }
    if (!label) label = labelFor(f.el, sharedAria);
    if (kind === "select") options_ = optionsOfSelect(f.el as HTMLSelectElement);

    const text = cleanLabel(label.text);
    const input = {
      kind: finalKind,
      autocomplete: f.el.getAttribute("autocomplete"),
      label: text,
      name: f.el.getAttribute("name"),
      htmlId: f.el.id || null,
      placeholder: f.el.getAttribute("placeholder"),
    };
    n++;
    fields.push({
      id: `f${n}`,
      ref: buildRef(members[0] ?? f.el, f.root, f.chain),
      kind: finalKind,
      name: input.name,
      htmlId: input.htmlId,
      label: { ...label, text },
      section: sectionOf(f.el),
      required: members.some((m) => isRequired(m, label.text)),
      disabled: members.every((m) => (m as HTMLInputElement).disabled === true),
      readOnly: (f.el as HTMLInputElement).readOnly === true,
      constraints: constraintsOf(f.el),
      options: options_,
      autocomplete: input.autocomplete,
      semantic: classifySemantic(input),
      hasValue: members.some(hasValue),
    });
  }

  const buttons: ButtonInfo[] = collect(scope, BUTTON_SEL, options)
    .filter((b) => options.includeHidden || isVisible(b.el))
    .map((b) => {
      const el = b.el as HTMLInputElement;
      const text = el.tagName === "INPUT" ? el.value : collapse(textWithoutControls(b.el)) || collapse(b.el.getAttribute("aria-label")) || collapse(b.el.getAttribute("title"));
      return classifyButton(text, { type: b.el.getAttribute("type") ?? (b.el.tagName === "BUTTON" ? "submit" : null) });
    });

  return {
    fields,
    buttons,
    stats: {
      fields: fields.length,
      unlabeled: fields.filter((x) => x.label.text === "").length,
      sharedLabels: fields.filter((x) => x.label.shared).length,
      secrets: fields.filter((x) => x.semantic.secret).length,
      skipped,
    },
  };
}

export { CONTROL_SEL };
