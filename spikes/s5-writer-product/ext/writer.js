(function() {
	// packages/form-writer/src/guard.ts
	function kindOf(el) {
		const tag = el.tagName;
		if (tag === "INPUT") {
			const t = (el.type || "text").toLowerCase();
			if ([
				"checkbox",
				"radio",
				"file",
				"hidden",
				"password",
				"date",
				"datetime-local",
				"number",
				"tel",
				"email"
			].includes(t)) return t;
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
	/**
	* Anything that DOES something when pressed: submit, pay, sign, delete, navigate. The writer never touches these
	* (security invariant 2, level 3 is structural): not as a target, and not as a thing to click on the way.
	* A `role="button"` that opens a list (aria-haspopup) is a combobox trigger, not a commit control.
	*/
	function isCommitControl(el) {
		const tag = el.tagName;
		if (tag === "BUTTON" || tag === "A") return true;
		if (tag === "INPUT" && [
			"submit",
			"button",
			"image",
			"reset"
		].includes((el.type || "").toLowerCase())) return true;
		if (el.getAttribute("role") === "button" && !el.getAttribute("aria-haspopup")) return true;
		return false;
	}
	/** True when pressing `el` would press a commit control (the element itself, or something inside one). */
	function pressesCommitControl(el) {
		for (let cur = el; cur; cur = cur.parentElement) if (isCommitControl(cur) && !(cur.getAttribute("role") === "option")) return true;
		return false;
	}
	/** Fields the product must NEVER fill, whatever the value (security invariant 5 and plain safety). */
	function guard(el, kind) {
		const input = el;
		const ac = (el.getAttribute("autocomplete") || "").toLowerCase();
		const id = `${input.name || ""} ${el.id || ""}`;
		if (isCommitControl(el)) return {
			code: "commit_control",
			reason: "a button or link: the product never presses controls"
		};
		if (kind === "password" || /(new|current)-password/.test(ac) && /pass|pwd|mdp/i.test(id)) return {
			code: "secret",
			reason: "secret: password"
		};
		if (/one-time-code|cc-csc|cc-number|cc-exp/.test(ac) || /(^|[^a-z])(otp|cvc|cvv|pin)([^a-z]|$)/i.test(id)) return {
			code: "secret",
			reason: "secret: one-time code or card data"
		};
		if (kind === "hidden") return {
			code: "hidden",
			reason: "hidden field"
		};
		if (kind === "file") return {
			code: "file",
			reason: "file input (documents are Phase 8)"
		};
		if (input.disabled) return {
			code: "disabled",
			reason: "disabled"
		};
		if (input.readOnly && [
			"text",
			"textarea",
			"email",
			"tel",
			"number",
			"date"
		].includes(kind)) return {
			code: "read_only",
			reason: "read-only"
		};
		return null;
	}
	// packages/form-engine/src/text.ts
	/** Text helpers. Unicode-safe: accents are folded ONLY on Latin letters; Arabic, Cyrillic, CJK are never altered (OB-08). */
	function collapse(s) {
		return (s ?? "").normalize("NFKC").replace(/\s+/g, " ").trim();
	}
	/** Lower-case + accent folding on Latin letters, for MATCHING only (never for values that are written). */
	function fold(s) {
		return collapse(s).normalize("NFD").replace(/(?<=\p{Script=Latin})\p{M}+/gu, "").normalize("NFC").toLocaleLowerCase();
	}
	// packages/form-engine/src/semantic.ts
	/** `secret`: never filled, stored or sent. `sensitive`: needs explicit human validation before any use. */
	var SECRET = /* @__PURE__ */ new Set([
		"password",
		"one_time_code",
		"card_number",
		"card_security_code"
	]);
	/**
	* When the label ALSO carries one of these words, the rule's type is the wrong referent (a property of the thing, a document
	* date, a network address...): that rule is skipped, and the field stays `unknown` unless another rule fits.
	* Folded (lower-case, no accents) text.
	*/
	/** Contact details that belong to an organisation or a place that is not the user's ("employer's address", "host city"). */
	var OTHER_ENTITY = /\b(employeur|employer|etablissement|institution|school|ecole|university|universite|entreprise|company|societe|siege|accueil|host|destination|recruteur|recruiter)\b/;
	/** A workplace or a trip leg is not where the user lives. */
	var ELSEWHERE = /\b(work|workplace|travail|professionnel|professionnelle|professional|business|office|bureau|depart|departure|arrivee|arrival|retour|return|escale|stopover|transit)\b/;
	var either = (a, b) => new RegExp(`${a.source}|${b.source}`);
	either(/\b(ip|mac|web|website|site|url|email|mail|wallet|portefeuille|blockchain|head office|siege|street name|street number|nom de la (rue|voie)|numero de (la )?rue)\b/, either(OTHER_ENTITY, ELSEWHERE)), either(OTHER_ENTITY, ELSEWHERE), either(OTHER_ENTITY, ELSEWHERE), either(either(/\b(origine|origin|accueil|host|destination)\b/, OTHER_ENTITY), ELSEWHERE), either(either(/\b(country|pays)\b/, OTHER_ENTITY), ELSEWHERE), either(/\b(code|indicatif|prefix|prefixe|birth|naissance|issue|emission|delivrance|origin|origine|accueil|host|destination)\b/, either(OTHER_ENTITY, ELSEWHERE));
	// packages/form-engine/src/classify-llm.ts
	var ASKABLE = [
		"first_name",
		"last_name",
		"full_name",
		"email",
		"phone",
		"date_of_birth",
		"place_of_birth",
		"nationality",
		"civility",
		"gender",
		"marital_status",
		"address_line1",
		"address_line2",
		"postal_code",
		"city",
		"region",
		"country",
		"company",
		"job_title",
		"website",
		"linkedin",
		"username",
		"national_id",
		"passport_number",
		"tax_id",
		"iban",
		"salary",
		"degree",
		"institution",
		"graduation_year",
		"cover_letter",
		"resume_file",
		"consent",
		"password",
		"one_time_code",
		"card_number",
		"card_security_code",
		"unknown"
	].filter((t) => !SECRET.has(t) && t !== "unknown");
	new Set(ASKABLE);
	// packages/form-writer/src/write.ts
	/**
	* Writes one value into one field, then READS IT BACK and compares canonical values (OB-05), without rewriting a field
	* that already holds the exact value (OB-06), with the combobox protocol (OB-07) and Unicode-safe matching (OB-08).
	* Result statuses: written (set AND read back equal) · already-correct (nothing written) · failed (explicit reason, never
	* a guess) · refused (a field the product must never fill). A "written" claim must be true in the page's own state:
	* a mismatch would be a SILENT FAILURE, the one outcome this module must never produce.
	*/
	var sleep = (ms) => new Promise((r) => setTimeout(r, ms));
	var tick = () => sleep(40);
	function toIsoDate(s) {
		if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
		const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s);
		return m ? `${m[3]}-${(m[2] ?? "").padStart(2, "0")}-${(m[1] ?? "").padStart(2, "0")}` : null;
	}
	/** Canonical form per field type: comparisons never use prefixes or "any option". */
	function canonical(kind, v) {
		const s = collapse(String(v ?? ""));
		switch (kind) {
			case "email": return s.toLowerCase();
			case "tel": {
				const d = s.replace(/[^\d+]/g, "");
				return d.startsWith("00") ? "+" + d.slice(2) : d;
			}
			case "number": {
				const n = Number(s.replace(/\s/g, "").replace(",", "."));
				return s !== "" && Number.isFinite(n) ? String(n) : s;
			}
			case "date": return toIsoDate(s) ?? s;
			default: return s;
		}
	}
	var winOf = (el) => el.ownerDocument.defaultView ?? window;
	function setNative(el, v) {
		const proto = Object.getPrototypeOf(el);
		(Object.getOwnPropertyDescriptor(proto, "value") ?? Object.getOwnPropertyDescriptor(winOf(el).HTMLInputElement.prototype, "value"))?.set?.call(el, v);
	}
	function fireInput(el, data) {
		const w = winOf(el);
		el.dispatchEvent(new w.InputEvent("input", {
			bubbles: true,
			cancelable: false,
			inputType: "insertText",
			data: data ?? null
		}));
	}
	function fireChange(el) {
		el.dispatchEvent(new (winOf(el)).Event("change", {
			bubbles: true,
			cancelable: false
		}));
	}
	function blur(el) {
		const w = winOf(el);
		el.dispatchEvent(new w.FocusEvent("blur"));
		el.dispatchEvent(new w.FocusEvent("focusout", { bubbles: true }));
	}
	/** Pressing like a user would. Callers must have checked `pressesCommitControl` first. */
	function pointerSequence(el) {
		const w = winOf(el);
		for (const t of [
			"pointerdown",
			"mousedown",
			"pointerup",
			"mouseup",
			"click"
		]) el.dispatchEvent(new w.MouseEvent(t, {
			bubbles: true,
			cancelable: true,
			view: w,
			button: 0,
			buttons: t.endsWith("down") ? 1 : 0
		}));
	}
	var done = (kind, code = "ok", extra = {}) => ({
		status: code === "already_correct" ? "already-correct" : "written",
		kind,
		code,
		...extra
	});
	var fail = (kind, code, reason, extra = {}) => ({
		status: "failed",
		kind,
		code,
		reason,
		...extra
	});
	async function writeText(el, kind, value, opts) {
		const ck = kind === "textarea" || kind === "datetime-local" ? "text" : kind;
		const target = canonical(ck, value);
		if (canonical(ck, el.value) === target && el.checkValidity()) return done(kind, "already_correct");
		let toSet = String(value);
		if (kind === "date") {
			const iso = toIsoDate(collapse(value));
			if (!iso && !opts.restore) return fail(kind, "not_a_date", `not a date: ${value}`);
			toSet = iso ?? value;
		}
		if (kind === "number") toSet = canonical("number", value);
		if (!opts.restore && el.maxLength >= 0 && toSet.length > el.maxLength) return fail(kind, "maxlength", `value is ${toSet.length} characters, longer than maxlength=${el.maxLength}`);
		const previous = el.value;
		const apply = (v) => {
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
			const why = el.validationMessage;
			apply(previous);
			return fail(kind, "invalid_value", `the value is invalid for this field (${why}); previous value restored`);
		}
		return done(kind);
	}
	function matchByText(items, textOf, value) {
		const t = canonical("text", value);
		const exact = items.filter((i) => textOf(i).some((x) => canonical("text", x) === t));
		if (exact.length === 1) return { item: exact[0] };
		if (exact.length > 1) return {
			error: `ambiguous: ${exact.length} exact matches`,
			code: "ambiguous"
		};
		const f = fold(value);
		const loose = items.filter((i) => textOf(i).some((x) => fold(x) === f));
		if (loose.length === 1) return {
			item: loose[0],
			loose: true
		};
		return loose.length ? {
			error: `ambiguous: ${loose.length} case/accent-insensitive matches`,
			code: "ambiguous"
		} : {
			error: "no matching option",
			code: "no_option"
		};
	}
	async function writeSelect(el, value) {
		const r = matchByText(Array.from(el.options), (o) => [
			o.value,
			o.label,
			o.textContent ?? ""
		], value);
		if (!("item" in r)) return fail("select", r.code, r.error);
		if (r.item.value === "" && collapse(value) !== "") return fail("select", "placeholder_option", "matched the empty placeholder option");
		if (el.selectedOptions[0] === r.item && el.checkValidity()) return done("select", "already_correct");
		el.focus();
		el.value = r.item.value;
		fireInput(el);
		fireChange(el);
		await tick();
		if (el.selectedOptions[0] !== r.item) return fail("select", "readback_mismatch", "read-back mismatch: another option is selected");
		return done("select");
	}
	function groupOf(el) {
		const root = el.getRootNode();
		if (el.name) return Array.from(root.querySelectorAll("input[type=radio]")).filter((r) => r.name === el.name);
		const grp = el.closest("[role=radiogroup],fieldset,.ant-radio-group,.MuiFormGroup-root");
		return grp ? Array.from(grp.querySelectorAll("input[type=radio]")) : [el];
	}
	var labelText = (el) => el.labels && el.labels[0] ? el.labels[0].textContent ?? "" : el.closest("label")?.textContent ?? "";
	async function writeRadio(el, value) {
		const r = matchByText(groupOf(el), (i) => [i.value, labelText(i)], value === true ? el.value : String(value));
		if (!("item" in r)) return fail("radio", r.code, r.error);
		if (r.item.checked) return done("radio", "already_correct");
		r.item.click();
		await tick();
		if (!r.item.checked) return fail("radio", "not_selected", "read-back mismatch: the radio is not checked");
		return done("radio");
	}
	async function writeCheckbox(el, value) {
		const want = value === true || /^(true|1|yes|oui|on|y)$/i.test(String(value));
		if (el.checked === want) return done("checkbox", "already_correct");
		el.click();
		await tick();
		if (el.checked !== want) return fail("checkbox", "readback_mismatch", "read-back mismatch: state did not change");
		return done("checkbox");
	}
	async function writeRichtext(el, value) {
		const w = winOf(el);
		el.focus();
		const sel = w.getSelection();
		sel?.removeAllRanges();
		const range = el.ownerDocument.createRange();
		range.selectNodeContents(el);
		sel?.addRange(range);
		const doc = el.ownerDocument;
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
	var OPTION_SEL = "[role=\"option\"], .ant-select-item-option";
	function visibleOptions(scope) {
		return Array.from(scope.querySelectorAll(OPTION_SEL)).filter((o) => {
			const r = o.getBoundingClientRect();
			return r.width > 0 && r.height > 0 && winOf(o).getComputedStyle(o).visibility !== "hidden";
		});
	}
	var optionText = (o) => collapse(o.getAttribute("aria-label") || o.textContent);
	/** The popup of a combobox: the element named by aria-controls/aria-owns when present, else null (use a baseline diff). */
	function popupOf(el) {
		const id = el.getAttribute("aria-controls") || el.getAttribute("aria-owns");
		if (!id) return null;
		return el.getRootNode().getElementById?.(id) ?? el.ownerDocument.getElementById(id);
	}
	/** Bounded wait for options to appear and stop changing (async lists, portals). Only options of THIS combobox count. */
	async function waitOptions(doc, maxMs, popup, baseline) {
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
	function chooseOption(options, value) {
		const f = fold(value);
		const exact = options.filter((o) => fold(optionText(o)) === f);
		if (exact.length === 1) return { opt: exact[0] };
		if (exact.length > 1) return {
			error: `ambiguous: ${exact.length} exact options`,
			code: "ambiguous"
		};
		const partial = options.filter((o) => fold(optionText(o)).includes(f));
		if (partial.length === 1) return {
			opt: partial[0],
			partial: true
		};
		return partial.length ? {
			error: `ambiguous: ${partial.length} options contain "${collapse(value)}"`,
			code: "ambiguous"
		} : {
			error: "no option matches",
			code: "no_option"
		};
	}
	async function writeCombobox(el, kind, value) {
		const doc = el.ownerDocument;
		const input = kind === "combobox-input" ? el : el.querySelector("input");
		const typed = collapse(value);
		let options = [];
		const baseline = new Set(visibleOptions(doc));
		const popup = (input ? popupOf(input) : null) ?? popupOf(el);
		if (kind === "combobox") {
			el.focus();
			pointerSequence(el);
			options = await waitOptions(doc, 1500, popupOf(el), baseline);
		} else if (input) {
			input.focus();
			for (const q of [typed, typed.length > 3 ? typed.slice(0, 3) : null]) {
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
		if (pressesCommitControl(c.opt)) return {
			status: "refused",
			kind,
			code: "commit_control",
			reason: "the option sits inside a button or link: the product never presses controls"
		};
		pointerSequence(c.opt);
		await sleep(300);
		const stillOpen = visibleOptions(popup ?? doc).filter((o) => popup || !baseline.has(o)).length > 0 && el.getAttribute("aria-expanded") !== "false";
		let shown = input !== null && collapse(input.value) === chosen || collapse(el.textContent).includes(chosen);
		for (let z = input ?? el, i = 0; !shown && i < 4 && z?.parentElement; i++, z = z.parentElement) shown = collapse(z.parentElement?.textContent).includes(chosen);
		if (stillOpen) return fail(kind, "still_open", "the list is still open after the click: selection not confirmed");
		if (!shown) return fail(kind, "label_not_shown", `the chosen label "${chosen}" is not displayed: selection not confirmed`);
		return done(kind, "ok", c.partial ? { partial: true } : {});
	}
	async function writeListbox(el, value) {
		const c = chooseOption(Array.from(el.querySelectorAll("[role=\"option\"]")), value);
		if (!("opt" in c)) return fail("listbox", c.code, c.error);
		if (c.opt.getAttribute("aria-selected") === "true") return done("listbox", "already_correct");
		if (pressesCommitControl(c.opt)) return {
			status: "refused",
			kind: "listbox",
			code: "commit_control",
			reason: "the option sits inside a button or link"
		};
		pointerSequence(c.opt);
		await tick();
		if (c.opt.getAttribute("aria-selected") !== "true") return fail("listbox", "not_selected", "read-back mismatch: the option is not selected");
		return done("listbox");
	}
	async function writeElement(el, value, opts = {}) {
		const kind = kindOf(el);
		const g = guard(el, kind);
		if (g) return {
			status: "refused",
			kind,
			code: g.code,
			reason: g.reason
		};
		try {
			switch (kind) {
				case "text":
				case "textarea":
				case "email":
				case "tel":
				case "number":
				case "date":
				case "datetime-local": return await writeText(el, kind, String(value), opts);
				case "select": return await writeSelect(el, String(value));
				case "radio": return await writeRadio(el, value);
				case "checkbox": return await writeCheckbox(el, value);
				case "richtext": return await writeRichtext(el, String(value));
				case "combobox":
				case "combobox-input": return await writeCombobox(el, kind, String(value));
				case "listbox": return await writeListbox(el, String(value));
				default: return fail(kind, "unsupported", "unsupported field type");
			}
		} catch (e) {
			return fail(kind, "exception", `exception: ${e instanceof Error ? e.message : String(e)}`);
		}
	}
	// spikes/s5-writer-product/shim.js
	(() => {
		if (globalThis.__efWriter) return;
		const rootOf = (el) => el.shadowRoot || (typeof chrome !== "undefined" && chrome.dom && chrome.dom.openOrClosedShadowRoot ? chrome.dom.openOrClosedShadowRoot(el) : null);
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
		async function writeField(spec, value) {
			const el = resolve(spec);
			if (!el) return {
				status: "failed",
				kind: "unknown",
				reason: "field not found"
			};
			const r = await writeElement(el, value);
			return {
				status: r.status,
				kind: r.kind,
				reason: r.reason ?? r.code,
				code: r.code
			};
		}
		const resolveSpec = (t) => resolve({
			host: t.host,
			sel: t.sel
		});
		function readTruth(t) {
			const text = (sel) => {
				const e = document.querySelector(sel);
				return e ? e.textContent : null;
			};
			switch (t.kind) {
				case "state": try {
					return JSON.parse(text("#state"))[t.key];
				} catch {
					return;
				}
				case "state-text": return text("#state");
				case "dom": return text(t.sel);
				case "field": {
					const e = resolveSpec(t);
					return e ? e[t.prop || "value"] : void 0;
				}
				case "checked": {
					const e = document.querySelector(t.sel);
					return e ? e.checked : void 0;
				}
				default: return;
			}
		}
		globalThis.__efWriter = {
			writeField,
			readTruth
		};
	})();
})();
