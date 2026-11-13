import type { FieldMatch } from "@exponent-fill/shared-types";
import { describe, expect, it } from "vitest";
import { buildReview, selectFillItems, type ReviewField } from "./review";

const field = (id: string, over: Partial<ReviewField> & { label?: string; type?: string; conf?: number; secret?: boolean } = {}): ReviewField => ({
  id,
  kind: over.kind ?? "text",
  label: { text: over.label ?? id, source: "label-for", confidence: 0.9, shared: false },
  required: over.required ?? false,
  disabled: over.disabled ?? false,
  readOnly: over.readOnly ?? false,
  hasValue: over.hasValue ?? false,
  semantic: { type: (over.type ?? "first_name") as never, confidence: over.conf ?? 0.85, via: "label", secret: over.secret ?? false, sensitive: false },
});

const cand = (o: Partial<FieldMatch["candidates"][number]> = {}): FieldMatch["candidates"][number] => ({
  fact_id: "11111111-1111-4111-8111-111111111111", key: "personal.first_name", value: "Awa", trust_class: "declared", validation_status: "validated", usable: true, needs_confirmation: false, reason: "usable", sources_count: 1, ...o,
});
const match = (field_id: string, decision: FieldMatch["decision"], reason: string, candidates = [cand()]): FieldMatch => ({ field_id, decision, reason, candidates });

describe("buildReview: states", () => {
  const fields = [
    field("known"), field("inferred"), field("conflict"), field("missing", { required: true, type: "unknown", conf: 0 }), field("empty", { type: "unknown", conf: 0 }),
    field("pw", { kind: "password", secret: true }), field("ro", { readOnly: true }), field("file", { kind: "file" }), field("consent", { type: "consent" }),
  ];
  const matches = [
    match("known", "fill", "usable"),
    match("inferred", "suggest", "pending_review", [cand({ usable: false, validation_status: "pending_review", trust_class: "extracted", reason: "pending_review" })]),
    match("conflict", "suggest", "open_conflict", [cand({ usable: false, reason: "open_conflict" })]),
    match("missing", "none", "no_mapping", []),
    match("empty", "none", "no_mapping", []),
    match("consent", "none", "consent_requires_user", []),
  ];
  const model = buildReview(fields, matches);
  const state = (id: string) => model.items.find((i) => i.fieldId === id)!;

  it("assigns the right state to each field", () => {
    expect(state("known").state).toBe("known");
    expect(state("inferred").state).toBe("inferred");
    expect(state("conflict").state).toBe("conflict");
    expect(state("missing").state).toBe("missing");
    expect(state("empty").state).toBe("empty");
    for (const id of ["pw", "ro", "file", "consent"]) expect(state(id).state, id).toBe("skipped");
    expect(model.counts).toEqual({ known: 1, inferred: 1, conflict: 1, missing: 1, empty: 1, skipped: 4 });
  });

  it("lists required fields with nothing to propose as 'to complete'", () => {
    expect(model.toComplete.map((i) => i.fieldId)).toEqual(["missing"]);
  });

  it("never exposes a value for a conflict and never pre-ticks anything but a sure, usable, empty field", () => {
    expect(state("conflict").value).toBeNull();
    expect(model.items.filter((i) => i.defaultChecked).map((i) => i.fieldId)).toEqual(["known"]);
    expect(state("inferred").defaultChecked).toBe(false);
  });

  it("does not pre-tick a field the user already filled, or a type recognised with low confidence", () => {
    const m = buildReview([field("a", { hasValue: true }), field("b", { conf: 0.6 })], [match("a", "fill", "usable"), match("b", "fill", "usable")]);
    expect(m.items.map((i) => i.defaultChecked)).toEqual([false, false]);
    expect(m.items[0]!.alreadyFilled).toBe(true);
  });

  it("treats a field absent from the match answer as missing or empty (vault unreachable, offline)", () => {
    const m = buildReview([field("a", { required: true }), field("b")], []);
    expect(m.items.map((i) => i.state)).toEqual(["missing", "empty"]);
  });
});

describe("selectFillItems", () => {
  const fields = [field("known"), field("inferred"), field("conflict"), field("pw", { kind: "password", secret: true })];
  const matches = [
    match("known", "fill", "usable"),
    match("inferred", "suggest", "pending_review", [cand({ value: "Awa", usable: false, validation_status: "pending_review", trust_class: "inferred", reason: "pending_review" })]),
    match("conflict", "suggest", "open_conflict", [cand({ usable: false, reason: "open_conflict" })]),
  ];
  const model = buildReview(fields, matches);

  it("writes only what the user ticked, and only what is fillable", () => {
    const all = new Set(["known", "inferred", "conflict", "pw", "ghost"]);
    expect(selectFillItems(model, all).map((i) => i.fieldId)).toEqual(["known", "inferred"]); // conflict, secret and unknown ids can never be selected
    expect(selectFillItems(model, new Set(["known"])).map((i) => i.fieldId)).toEqual(["known"]);
    expect(selectFillItems(model, new Set())).toEqual([]);
  });

  it("carries the fact id and the trust class so the audit can name the source without the value", () => {
    const [k] = selectFillItems(model, new Set(["known"]));
    expect(k).toMatchObject({ fieldId: "known", value: "Awa", factId: "11111111-1111-4111-8111-111111111111", trust: "declared" });
  });

  it("an inferred suggestion with a masked (null) value cannot be filled", () => {
    const m = buildReview([field("x")], [match("x", "suggest", "sensitive_unconfirmed", [cand({ value: null, usable: false })])]);
    expect(m.items[0]!.fillable).toBe(false);
    expect(selectFillItems(m, new Set(["x"]))).toEqual([]);
  });
});
