// Throwaway S5 "writer": writes a value into a form field, then READS IT BACK and compares canonical values.
// Injected in the ISOLATED world (chrome.scripting.executeScript({files:["writer.js"]})); exposes globalThis.__efWriter.
// Written from the behavioural specs OB-05 (exact read-back), OB-06 (idempotence), OB-07 (combobox protocol),
// OB-08 (Unicode-safe normalisation) only.
//
// Contract of writeField(spec, value) -> { status, kind, reason?, readBack? }
//   written          the value was set AND read back equal (canonical comparison for the field's type)
//   already-correct  a NATIVE field already held the exact, valid value: nothing was written (OB-06)
//   failed           explicit failure with a reason — never a guess, never "some option"
//   refused          a field the product must never fill (secrets, read-only, disabled, hidden)
// A "written" status is a claim the measurement harness checks against the page framework's own state:
// any mismatch is a SILENT FAILURE and is the one outcome this writer must never produce.
(() => {
  if (globalThis.__efWriter) return;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const tick = () => sleep(40);

  // ---- OB-08: Unicode-safe normalisation ---------------------------------------------------------------------------
  const nfkc = (s) => String(s ?? "").normalize("NFKC");
  const collapse = (s) => nfkc(s).replace(/\s+/g, " ").trim();
  /** Matching-only fold: lower-case + removal of accents ON LATIN LETTERS. Arabic, Cyrillic, CJK are never altered. */
  const fold = (s) => collapse(s).normalize("NFD").replace(/(?<=\p{Script=Latin})\p{M}+/gu, "").normalize("NFC").toLocaleLowerCase();

  function toIsoDate(s) {
    let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (m) return s;
    m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s); // day-first (documented convention: FR / EN-UK)
    if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    return null;
  }
  /** Canonical form per field type (OB-05): comparisons never use prefixes or "any option". */
  function canonical(kind, v) {
    const s = collapse(v);
    switch (kind) {
      case "email": return s.toLowerCase();
      case "tel": { const d = s.replace(/[^\d+]/g, ""); return d.startsWith("00") ? "+" + d.slice(2) : d; }
      case "number": { const n = Number(s.replace(/\s/g, "").replace(",", ".")); return s !== "" && Number.isFinite(n) ? String(n) : s; }
      case "date": return toIsoDate(s) ?? s;
      default: return s;
    }
  }

  // ---- resolving fields (closed shadow roots through chrome.dom) -----------------------------------------------------
  function rootOf(el) { return el.shadowRoot || (typeof chrome !== "undefined" && chrome.dom && chrome.dom.openOrClosedShadowRoot ? chrome.dom.openOrClosedShadowRoot(el) : null); }
  function resolve(spec) {
    let root = document;
    for (const h of spec.host || []) {
      const el = root.querySelector(h);
      if (!el) return null;
      root = rootOf(el);
      if (!root) return null;
    }
    return root.querySelector(spec.sel);
  }

  function kindOf(el) {
    const tag = el.tagName;
    if (tag === "INPUT") {
      const t = (el.type || "text").toLowerCase();
      if (["checkbox", "radio", "file", "hidden", "password", "date", "datetime-local", "number", "tel", "email"].includes(t)) return t;
      if (el.getAttribute("role") === "combobox" || el.getAttribute("aria-autocomplete")) return "combobox-input";
      return "text";
    }
    if (tag === "TEXTAREA") return "textarea";
    if (tag === "SELECT") return "select";
    if (el.getAttribute("role") === "combobox") return "combobox";
    if (el.getAttribute("role") === "listbox") return "listbox";
    if (el.isContentEditable) return "richtext";
    return "unknown";
  }

  /** Fields the product must NEVER fill, whatever the value (security invariant 5 and plain safety). */
  function guard(el, kind) {
    const ac = (el.getAttribute("autocomplete") || "").toLowerCase();
    const id = `${el.name || ""} ${el.id || ""}`;
    // autocomplete="new-password" is also used as an anti-autofill hack on ordinary inputs (e.g. UI-library selects):
    // it only counts as a secret when the field itself looks like a password.
    if (kind === "password" || (/(new|current)-password/.test(ac) && /pass|pwd|mdp/i.test(id))) return "secret: password";
    if (/one-time-code|cc-csc|cc-number|cc-exp/.test(ac) || /(^|[^a-z])(otp|cvc|cvv|pin)([^a-z]|$)/i.test(id)) return "secret: one-time code or card data";
    if (kind === "hidden") return "hidden field";
    if (kind === "file") return "file input (handled by the upload path, spike S3)";
    if (el.disabled) return "disabled";
    if (el.readOnly && ["text", "textarea", "email", "tel", "number", "date"].includes(kind)) return "read-only";
    return null;
  }

  // ---- low-level helpers -------------------------------------------------------------------------------------------
  function setNative(el, v) {
    const proto = Object.getPrototypeOf(el);
    const desc = Object.getOwnPropertyDescriptor(proto, "value") || Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
    desc.set.call(el, v); // bypasses framework value trackers (React) that shadow the instance property
  }
  function fire(el, type, init = {}) { el.dispatchEvent(new (type === "input" ? InputEvent : Event)(type, { bubbles: true, cancelable: false, ...init })); }
  function pointerSequence(el) {
    for (const t of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
      el.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true, view: window, button: 0, buttons: t.endsWith("down") ? 1 : 0 }));
    }
  }
  const fail = (kind, reason, extra = {}) => ({ status: "failed", kind, reason, ...extra });

  // ---- native text-like fields -------------------------------------------------------------------------------------
  async function writeText(el, kind, value) {
    const ck = kind === "textarea" || kind === "datetime-local" ? "text" : kind;
    const target = canonical(ck, value);
    const current = canonical(ck, el.value);
    if (current === target && el.checkValidity()) return { status: "already-correct", kind, readBack: el.value }; // OB-06
    let toSet = String(value);
    if (kind === "date") { const iso = toIsoDate(collapse(value)); if (!iso) return fail(kind, `not a date: ${value}`); toSet = iso; }
    if (kind === "number") toSet = canonical("number", value);
    // Constraints the browser only enforces for USER typing (maxlength) are checked here; the rest is checked after the write.
    if (el.maxLength >= 0 && toSet.length > el.maxLength) return fail(kind, `value is ${toSet.length} characters, longer than maxlength=${el.maxLength}`);
    const previous = el.value;
    const apply = (v) => {
      el.focus();
      setNative(el, v);
      fire(el, "input", { inputType: "insertText", data: v });
      fire(el, "change");
      el.dispatchEvent(new FocusEvent("blur"));
      el.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    };
    apply(toSet);
    await tick();
    const back = el.value;
    if (canonical(ck, back) !== target) return fail(kind, `read-back mismatch: expected "${target}", got "${canonical(ck, back)}" (the page changed or rejected the value)`, { readBack: back });
    if (!el.validity.valid) { // pattern, range, format: roll the page back to what it held before, then fail explicitly
      const why = el.validationMessage;
      apply(previous);
      return fail(kind, `the value is invalid for this field (${why}); previous value restored`);
    }
    return { status: "written", kind, readBack: back };
  }

  // ---- select / radio / checkbox -----------------------------------------------------------------------------------
  function matchByText(items, textOf, value) {
    const t = canonical("text", value);
    const exact = items.filter((i) => textOf(i).some((x) => canonical("text", x) === t));
    if (exact.length === 1) return { item: exact[0] };
    if (exact.length > 1) return { error: `ambiguous: ${exact.length} exact matches` };
    const f = fold(value);
    const loose = items.filter((i) => textOf(i).some((x) => fold(x) === f));
    if (loose.length === 1) return { item: loose[0], loose: true };
    return { error: loose.length ? `ambiguous: ${loose.length} case/accent-insensitive matches` : "no matching option" };
  }

  async function writeSelect(el, value) {
    const options = Array.from(el.options);
    const r = matchByText(options, (o) => [o.value, o.label, o.textContent], value);
    if (!r.item) return fail("select", r.error);
    if (r.item.value === "" && collapse(value) !== "") return fail("select", "matched the empty placeholder option");
    if (el.selectedOptions[0] === r.item && el.checkValidity()) return { status: "already-correct", kind: "select" }; // OB-06
    el.focus();
    el.value = r.item.value;
    fire(el, "input"); fire(el, "change");
    await tick();
    if (el.selectedOptions[0] !== r.item) return fail("select", "read-back mismatch: another option is selected");
    return { status: "written", kind: "select", readBack: el.value };
  }

  function groupOf(el) {
    const root = el.getRootNode();
    if (el.name) return Array.from(root.querySelectorAll(`input[type=radio]`)).filter((r) => r.name === el.name);
    const grp = el.closest('[role=radiogroup],fieldset,.ant-radio-group,.MuiFormGroup-root');
    return grp ? Array.from(grp.querySelectorAll("input[type=radio]")) : [el];
  }
  const labelText = (el) => (el.labels && el.labels[0] ? el.labels[0].textContent : el.closest("label") ? el.closest("label").textContent : "");

  async function writeRadio(el, value) {
    const group = groupOf(el);
    const v = value === true ? el.value : value;
    const r = matchByText(group, (i) => [i.value, labelText(i)], v);
    if (!r.item) return fail("radio", r.error);
    if (r.item.checked) return { status: "already-correct", kind: "radio" };
    r.item.click();
    await tick();
    if (!r.item.checked) return fail("radio", "read-back mismatch: the radio is not checked");
    return { status: "written", kind: "radio", readBack: r.item.value };
  }

  async function writeCheckbox(el, value) {
    const want = value === true || /^(true|1|yes|oui|on|y)$/i.test(String(value));
    if (el.checked === want) return { status: "already-correct", kind: "checkbox" };
    el.click();
    await tick();
    if (el.checked !== want) return fail("checkbox", "read-back mismatch: state did not change");
    return { status: "written", kind: "checkbox", readBack: String(el.checked) };
  }

  // ---- rich text (contenteditable: Quill, TipTap, ProseMirror, plain) -------------------------------------------------
  async function writeRichtext(el, value) {
    el.focus();
    const sel = getSelection();
    sel.removeAllRanges();
    const range = document.createRange();
    range.selectNodeContents(el);
    sel.addRange(range);
    const ok = document.execCommand("insertText", false, String(value));
    await tick(); await tick();
    const back = el.innerText;
    if (!ok && canonical("text", back) !== canonical("text", value)) return fail("richtext", "execCommand(insertText) refused by the editor");
    if (canonical("text", back) !== canonical("text", value)) return fail("richtext", `read-back mismatch: got "${collapse(back).slice(0, 60)}"`, { readBack: back });
    return { status: "written", kind: "richtext", readBack: back };
  }

  // ---- OB-07: combobox / autocomplete / custom listbox ---------------------------------------------------------------
  const OPTION_SEL = '[role="option"], .ant-select-item-option';
  function visibleOptions(scope = document) {
    return Array.from(scope.querySelectorAll(OPTION_SEL)).filter((o) => { const r = o.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(o).visibility !== "hidden"; });
  }
  const optionText = (o) => collapse(o.getAttribute("aria-label") || o.textContent);

  /** The popup of a combobox: the element named by aria-controls/aria-owns when present, else null (use a baseline diff). */
  function popupOf(el) {
    const id = el.getAttribute("aria-controls") || el.getAttribute("aria-owns");
    return id ? el.getRootNode().getElementById?.(id) || document.getElementById(id) : null;
  }
  /** Bounded wait for options to appear and stop changing (async lists, portals). Only options of THIS combobox count:
   *  those inside its aria-controls popup, or else those that were not visible before it was opened. */
  async function waitOptions(maxMs, popup, baseline) {
    const mine = () => visibleOptions(popup || document).filter((o) => popup || !baseline.has(o));
    const t0 = Date.now();
    let last = -1, stableSince = Date.now();
    while (Date.now() - t0 < maxMs) {
      const n = mine().length;
      if (n !== last) { last = n; stableSince = Date.now(); }
      if (n > 0 && Date.now() - stableSince >= 150) return mine();
      await sleep(40);
    }
    return mine();
  }
  /** Exact match, else UNIQUE partial match, else explicit failure with the reason. */
  function chooseOption(options, value) {
    const f = fold(value);
    const exact = options.filter((o) => fold(optionText(o)) === f);
    if (exact.length === 1) return { opt: exact[0] };
    if (exact.length > 1) return { error: `ambiguous: ${exact.length} exact options` };
    const partial = options.filter((o) => fold(optionText(o)).includes(f));
    if (partial.length === 1) return { opt: partial[0], partial: true };
    return { error: partial.length ? `ambiguous: ${partial.length} options contain "${collapse(value)}"` : "no option matches" };
  }

  async function writeCombobox(el, kind, value) {
    const input = kind === "combobox-input" ? el : el.querySelector("input");
    const typed = collapse(value);
    let options = [];
    const baseline = new Set(visibleOptions()); // options already on screen before we open anything are NOT ours
    const popup = popupOf(input || el) || popupOf(el);
    if (kind === "combobox") { // non-input trigger (e.g. MUI Select): open it like a user would
      el.focus(); pointerSequence(el);
      options = await waitOptions(1500, popupOf(el), baseline);
    } else {
      input.focus();
      for (const q of [typed, typed.length > 3 ? typed.slice(0, 3) : null]) { // retry with a shorter query (OB-07)
        if (q === null) break;
        setNative(input, q);
        fire(input, "input", { inputType: "insertText", data: q });
        options = await waitOptions(1500, popup, baseline);
        if (options.length) break;
      }
    }
    if (!options.length) return fail(kind, "no option appeared (the typed text is NOT a selection)", { typedOnly: true });
    const c = chooseOption(options, typed);
    if (!c.opt) return fail(kind, c.error);
    const chosen = optionText(c.opt);
    pointerSequence(c.opt);
    await sleep(300);
    // Verify the REAL state: the list is closed and the chosen label is displayed where the user would look.
    const stillOpen = visibleOptions(popup || document).filter((o) => popup || !baseline.has(o)).length > 0 && (el.getAttribute("aria-expanded") !== "false");
    // The displayed value may live in a sibling of the search input: look at up to 4 ancestors, never the whole page.
    let shown = (input && collapse(input.value) === chosen) || collapse(el.textContent || "").includes(chosen);
    for (let z = input || el, i = 0; !shown && i < 4 && z.parentElement; i++, z = z.parentElement) shown = collapse(z.parentElement.textContent || "").includes(chosen);
    if (stillOpen) return fail(kind, "the list is still open after the click: selection not confirmed");
    if (!shown) return fail(kind, `the chosen label "${chosen}" is not displayed: selection not confirmed`);
    return { status: "written", kind, readBack: chosen, partial: c.partial === true };
  }

  async function writeListbox(el, value) { // div role=listbox with role=option children (no input)
    const options = Array.from(el.querySelectorAll('[role="option"]'));
    const c = chooseOption(options, value);
    if (!c.opt) return fail("listbox", c.error);
    if (c.opt.getAttribute("aria-selected") === "true") return { status: "already-correct", kind: "listbox" };
    pointerSequence(c.opt);
    await tick();
    if (c.opt.getAttribute("aria-selected") !== "true") return fail("listbox", "read-back mismatch: the option is not selected");
    return { status: "written", kind: "listbox", readBack: optionText(c.opt) };
  }

  // ---- entry point -------------------------------------------------------------------------------------------------------
  async function writeField(spec, value) {
    const el = resolve(spec);
    if (!el) return { status: "failed", kind: "unknown", reason: "field not found" };
    const kind = kindOf(el);
    const g = guard(el, kind);
    if (g) return { status: "refused", kind, reason: g };
    try {
      switch (kind) {
        case "text": case "textarea": case "email": case "tel": case "number": case "date": case "datetime-local": return await writeText(el, kind, value);
        case "select": return await writeSelect(el, value);
        case "radio": return await writeRadio(el, value);
        case "checkbox": return await writeCheckbox(el, value);
        case "richtext": return await writeRichtext(el, value);
        case "combobox": case "combobox-input": return await writeCombobox(el, kind, value);
        case "listbox": return await writeListbox(el, value);
        default: return fail(kind, "unsupported field type");
      }
    } catch (e) { return fail(kind, `exception: ${e && e.message}`); }
  }

  /** Reads a page-owned truth for MEASUREMENT only (never used to verify in the product). */
  function readTruth(t) {
    const text = (sel) => { const e = document.querySelector(sel); return e ? e.textContent : null; };
    switch (t.kind) {
      case "state": { try { return JSON.parse(text("#state"))[t.key]; } catch { return undefined; } }
      case "state-text": return text("#state");
      case "dom": return text(t.sel);
      case "field": { const e = resolveSpec(t); return e ? e[t.prop || "value"] : undefined; }
      case "checked": { const e = document.querySelector(t.sel); return e ? e.checked : undefined; }
      default: return undefined;
    }
  }
  const resolveSpec = (t) => resolve({ host: t.host, sel: t.sel });

  globalThis.__efWriter = { writeField, readTruth, canonical, fold, collapse, kindOf, guard, chooseOption };
})();
