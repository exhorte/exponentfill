import { readFixture } from "@exponent-fill/fixtures";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { FillSession, writeElement } from "./index";

const page = (body: string) => new JSDOM(`<!doctype html><form id="f">${body}</form>`, { runScripts: "outside-only" }).window.document;
const q = <T extends Element>(d: Document, sel: string): T => {
  const e = d.querySelector<T>(sel);
  if (!e) throw new Error(`missing ${sel}`);
  return e;
};

describe("native text fields: write, read back, idempotence", () => {
  it("writes, fires input/change and reads the value back", async () => {
    const d = page(`<input id="a" name="a" type="text">`);
    const a = q<HTMLInputElement>(d, "#a");
    const events: string[] = [];
    for (const t of ["input", "change", "blur"]) a.addEventListener(t, () => events.push(t));
    const r = await writeElement(a, "Awa Ndiaye-Lé");
    expect(r).toMatchObject({ status: "written", code: "ok", kind: "text" });
    expect(a.value).toBe("Awa Ndiaye-Lé");
    expect(events).toEqual(["input", "change", "blur"]);
  });

  it("does not rewrite a field that already holds the exact value (no events), also across canonical forms", async () => {
    const d = page(`<input id="e" type="email" value="Awa@Example.com"><input id="t" type="tel" value="+33612345678">`);
    const e = q<HTMLInputElement>(d, "#e");
    let touched = 0;
    e.addEventListener("input", () => touched++);
    expect((await writeElement(e, "awa@example.com")).status).toBe("already-correct");
    expect((await writeElement(q(d, "#t"), "+33 6 12 34 56 78")).status).toBe("already-correct");
    expect(touched).toBe(0);
  });

  it("converts a day-first date to ISO for a native date input, and fails explicitly on a non-date", async () => {
    const d = page(`<input id="d" type="date">`);
    const el = q<HTMLInputElement>(d, "#d");
    expect((await writeElement(el, "13/04/1999")).status).toBe("written");
    expect(el.value).toBe("1999-04-13");
    const bad = await writeElement(q(d, "#d"), "next Tuesday");
    expect(bad).toMatchObject({ status: "failed", code: "not_a_date" });
    expect(el.value).toBe("1999-04-13"); // untouched
  });

  it("checks maxlength BEFORE writing (programmatic writes bypass it) and leaves the field alone", async () => {
    const d = page(`<input id="n" maxlength="5" value="old">`);
    const r = await writeElement(q(d, "#n"), "far too long");
    expect(r).toMatchObject({ status: "failed", code: "maxlength" });
    expect(q<HTMLInputElement>(d, "#n").value).toBe("old");
  });

  it("rolls back and fails when the value is invalid for the field (pattern)", async () => {
    const d = page(`<input id="z" pattern="[0-9]{5}" value="75001">`);
    const r = await writeElement(q(d, "#z"), "ABCDE");
    expect(r).toMatchObject({ status: "failed", code: "invalid_value" });
    expect(q<HTMLInputElement>(d, "#z").value).toBe("75001"); // the previous value is restored
  });

  it("reports a read-back mismatch when the page rewrites the value, never 'written'", async () => {
    const d = page(`<input id="m" type="text">`);
    const m = q<HTMLInputElement>(d, "#m");
    m.addEventListener("input", () => { m.value = m.value.toUpperCase(); }); // a page that mangles input
    const r = await writeElement(m, "awa");
    expect(r).toMatchObject({ status: "failed", code: "readback_mismatch" });
  });

  it("goes through the prototype setter, so a framework value tracker on the instance is bypassed", async () => {
    const d = page(`<input id="t">`);
    const t = q<HTMLInputElement>(d, "#t");
    let shadowSets = 0;
    Object.defineProperty(t, "value", { configurable: true, get: () => "shadow", set: () => { shadowSets++; } });
    await writeElement(t, "x"); // read-back sees the shadowed getter ("shadow"): the write is reported as a failure, not a success
    expect(shadowSets).toBe(0);
  });
});

describe("select, radio, checkbox", () => {
  const html = `<select id="c"><option value="">Choose…</option><option value="SN">Senegal</option><option value="FR">France</option><option value="CI">Côte d'Ivoire</option></select>
    <input type="radio" name="s" value="student" id="r1"><label for="r1">Student</label><input type="radio" name="s" value="employed" id="r2"><label for="r2">Employed</label>
    <input type="checkbox" id="k">`;
  it("selects a unique option by label, value, or accent/case-insensitive text; fails explicitly otherwise", async () => {
    const d = page(html);
    const c = q<HTMLSelectElement>(d, "#c");
    expect((await writeElement(c, "Senegal")).status).toBe("written");
    expect(c.value).toBe("SN");
    expect((await writeElement(c, "SN")).status).toBe("already-correct");
    expect((await writeElement(c, "cote d'ivoire")).status).toBe("written");
    expect(c.value).toBe("CI");
    expect(await writeElement(c, "Atlantis")).toMatchObject({ status: "failed", code: "no_option" });
    expect(await writeElement(c, "Choose…")).toMatchObject({ status: "failed", code: "placeholder_option" });
    expect(c.value).toBe("CI"); // never "some option"
  });
  it("checks a radio by value or label and reads the state back", async () => {
    const d = page(html);
    expect((await writeElement(q(d, "#r1"), "Employed")).status).toBe("written");
    expect(q<HTMLInputElement>(d, "#r2").checked).toBe(true);
    expect((await writeElement(q(d, "#r1"), "employed")).status).toBe("already-correct");
    expect((await writeElement(q(d, "#r1"), "retired")).code).toBe("no_option");
  });
  it("sets and clears a checkbox idempotently", async () => {
    const d = page(html);
    const k = q<HTMLInputElement>(d, "#k");
    expect((await writeElement(k, true)).status).toBe("written");
    expect(k.checked).toBe(true);
    expect((await writeElement(k, true)).status).toBe("already-correct");
    expect((await writeElement(k, "non")).status).toBe("written");
    expect(k.checked).toBe(false);
  });
});

describe("refusals: secrets, unusable fields and every commit control", () => {
  const html = `<input id="pw" type="password"><input id="otp" name="otp"><input id="cc" autocomplete="cc-number"><input id="cvc" name="cvc"><input id="h" type="hidden" value="x">
    <input id="ro" readonly value="keep"><input id="dis" disabled value="keep"><input id="up" type="file">
    <button id="b" type="submit">Pay</button><input id="s" type="submit" value="Go"><a id="a" href="/delete">Delete</a><div id="rb" role="button">Sign</div>
    <div id="hp" role="button" aria-haspopup="listbox">menu</div>`;
  const cases: [string, string][] = [["pw", "secret"], ["otp", "secret"], ["cc", "secret"], ["cvc", "secret"], ["h", "hidden"], ["ro", "read_only"], ["dis", "disabled"], ["up", "file"], ["b", "commit_control"], ["s", "commit_control"], ["a", "commit_control"], ["rb", "commit_control"]];
  for (const [id, code] of cases) {
    it(`refuses #${id} (${code}) and leaves it untouched`, async () => {
      const d = page(html);
      const el = q<HTMLInputElement>(d, `#${id}`);
      const before = el.value;
      const r = await writeElement(el, "ATTACK");
      expect(r).toMatchObject({ status: "refused", code });
      expect(el.value).toBe(before);
    });
  }
  it("does not treat a role=button that opens a list as a commit control", async () => {
    const d = page(html);
    const r = await writeElement(q(d, "#hp"), "x"); // unsupported kind here, but NOT refused as a commit control
    expect(r.code).not.toBe("commit_control");
  });
  it("a listbox option nested in a button is never pressed", async () => {
    const d = page(`<div role="listbox" id="lb"><button type="submit"><span role="option" id="o">Pay now</span></button></div>`);
    let pressed = 0;
    q(d, "#o").addEventListener("click", () => pressed++);
    const r = await writeElement(q(d, "#lb"), "Pay now");
    expect(r).toMatchObject({ status: "refused", code: "commit_control" });
    expect(pressed).toBe(0);
  });
});

describe("FillSession: results per field and one-level undo", () => {
  const html = `<input id="a" value="old-a"><select id="s"><option value="">-</option><option value="1">One</option><option value="2">Two</option></select>
    <input type="checkbox" id="k"><input type="radio" name="r" id="r1" value="x"><input type="radio" name="r" id="r2" value="y"><input id="pw" type="password">
    <button id="go" type="submit">Submit</button>`;
  const make = () => {
    const d = page(html);
    const map: Record<string, Element> = { a: q(d, "#a"), s: q(d, "#s"), k: q(d, "#k"), r: q(d, "#r1"), pw: q(d, "#pw"), go: q(d, "#go") };
    return { d, session: new FillSession((id) => map[id] ?? null), map };
  };

  it("returns one result per field and never writes a refused or missing field", async () => {
    const { session, d } = make();
    const out = await session.fill([
      { fieldId: "a", value: "new-a" }, { fieldId: "s", value: "Two" }, { fieldId: "pw", value: "hunter2" }, { fieldId: "go", value: "x" }, { fieldId: "ghost", value: "y" },
    ]);
    expect(out.map((r) => [r.fieldId, r.status, r.code])).toEqual([
      ["a", "written", "ok"], ["s", "written", "ok"], ["pw", "refused", "secret"], ["go", "refused", "commit_control"], ["ghost", "failed", "not_found"],
    ]);
    expect(q<HTMLInputElement>(d, "#pw").value).toBe("");
  });

  it("undo restores every written field to its previous state, in reverse order, once", async () => {
    const { session, d } = make();
    await session.fill([{ fieldId: "a", value: "new-a" }, { fieldId: "s", value: "Two" }, { fieldId: "k", value: true }, { fieldId: "r", value: "y" }]);
    expect(session.hasUndo()).toBe(true);
    const undone = await session.undo();
    expect(undone.map((u) => u.status)).toEqual(["restored", "restored", "restored", "restored"]);
    expect(q<HTMLInputElement>(d, "#a").value).toBe("old-a");
    expect(q<HTMLSelectElement>(d, "#s").selectedIndex).toBe(0);
    expect(q<HTMLInputElement>(d, "#k").checked).toBe(false);
    expect(q<HTMLInputElement>(d, "#r1").checked).toBe(false);
    expect(q<HTMLInputElement>(d, "#r2").checked).toBe(false);
    expect(session.hasUndo()).toBe(false);
    expect(await session.undo()).toEqual([]);
  });

  it("a field that was already correct is not part of the undo; a removed field is reported as skipped", async () => {
    const { session, d } = make();
    await session.fill([{ fieldId: "a", value: "old-a" }]); // already correct
    expect(session.hasUndo()).toBe(false);
    await session.fill([{ fieldId: "a", value: "z" }]);
    d.querySelector("#a")?.remove();
    expect((await session.undo()).map((u) => u.status)).toEqual(["skipped"]);
  });

  it("a new fill replaces the previous undo point (one level)", async () => {
    const { session, d } = make();
    await session.fill([{ fieldId: "a", value: "first" }]);
    await session.fill([{ fieldId: "a", value: "second" }]);
    await session.undo();
    expect(q<HTMLInputElement>(d, "#a").value).toBe("first");
  });
});

describe("trap fixture: the writer can never commit", () => {
  it("filling and trying to press every control leaves the page's commit counter at zero", async () => {
    const dom = new JSDOM(readFixture("trap-submit"), { runScripts: "dangerously" });
    const d = dom.window.document;
    const session = new FillSession((id) => d.querySelector(`#${id}`));
    const out = await session.fill([
      { fieldId: "holder", value: "Awa Ndiaye" }, { fieldId: "cc", value: "4242424242424242" }, { fieldId: "cvc", value: "123" },
      { fieldId: "pay", value: "x" }, { fieldId: "delete", value: "x" }, { fieldId: "sign", value: "x" },
    ]);
    const by = Object.fromEntries(out.map((r) => [r.fieldId, r.code]));
    expect(by).toMatchObject({ cc: "secret", cvc: "secret", pay: "commit_control", delete: "commit_control", sign: "commit_control" });
    expect(d.body.dataset.commits ?? "0").toBe("0");
    expect(d.getElementById("count")?.textContent).toBe("0");
    expect(q<HTMLInputElement>(d, "#cc").value).toBe("");
    dom.window.close();
  });
});
