import { scanForm } from "@exponent-fill/form-engine";
import type { Fact, FieldMatch } from "@exponent-fill/shared-types";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { afterPush, applySync, emptyCache, enqueue, offlineMatch, planFill, toMatchFields } from "./index";
import { displayTrust, isAutoFillable } from "./trust";

const base: Fact = {
  id: "f1", key: "personal.first_name", category: "personal", group_id: null, value: "Awa", masked: false, value_type: "text", origin: "declared", verification_level: "none",
  validation_status: "validated", sensitivity: "normal", ai_shareable: false, confidence: null, trust_class: "declared", usable: true, has_open_conflict: false, sources_count: 0,
  entered_at: "2026-11-12T10:00:00Z", extracted_at: null, validated_at: "2026-11-12T10:00:00Z", updated_at: "2026-11-12T10:00:00Z", version: 1, seq: 1, deleted: false,
};
const fact = (o: Partial<Fact>): Fact => ({ ...base, ...o });

describe("trust display never promotes", () => {
  it("shows 'verified' only when the fact's own fields agree", () => {
    expect(displayTrust(fact({ trust_class: "verified", verification_level: "user_confirmed" }))).toBe("verified");
    expect(displayTrust(fact({ trust_class: "verified", verification_level: "none", origin: "extracted", validation_status: "validated" }))).toBe("extracted");
    expect(displayTrust(fact({ trust_class: "verified", verification_level: "user_confirmed", validation_status: "pending_review", origin: "inferred" }))).toBe("inferred");
  });
  it("auto-fill requires usable, validated, no conflict, not deleted", () => {
    expect(isAutoFillable(base)).toBe(true);
    expect(isAutoFillable(fact({ has_open_conflict: true }))).toBe(false);
    expect(isAutoFillable(fact({ usable: false }))).toBe(false);
    expect(isAutoFillable(fact({ validation_status: "pending_review" }))).toBe(false);
  });
});

describe("form structure -> match request", () => {
  const doc = new JSDOM(`<form><label for="a">First name</label><input id="a" name="a" value="PAGE-CANARY">
    <label for="p">Password</label><input id="p" type="password" name="p"><label for="e">Email</label><input id="e" type="email" name="e">
    <label for="c">Country</label><select id="c" name="c"><option value="">-</option><option>France</option><option>Senegal</option></select></form>`).window.document;
  const fields = toMatchFields(scanForm(doc).fields);
  it("asks about structure only: no secret field, no page value", () => {
    expect(fields.map((f) => f.semantic_type)).toEqual(["first_name", "email", "country"]);
    expect(JSON.stringify(fields)).not.toContain("CANARY");
    expect(fields[2]?.options).toEqual(["France", "Senegal"]);
  });
});

describe("fill plan", () => {
  const cand = (o: object) => ({ fact_id: "f1", key: "k", value: "v", trust_class: "declared" as const, validation_status: "validated" as const, usable: true, needs_confirmation: false, reason: "usable", sources_count: 0, ...o });
  const matches: FieldMatch[] = [
    { field_id: "a", decision: "fill", reason: "usable", candidates: [cand({})] },
    { field_id: "b", decision: "suggest", reason: "pending_review", candidates: [cand({ usable: false, needs_confirmation: true, value: "Dakar" })] },
    { field_id: "c", decision: "none", reason: "secret", candidates: [] },
    { field_id: "d", decision: "fill", reason: "usable", candidates: [cand({ value: null })] },
  ];
  it("only 'fill' with a usable value is automatic; suggestions go to the user; the rest stays empty", () => {
    const plan = planFill(matches);
    expect(plan.fill.map((f) => f.fieldId)).toEqual(["a"]);
    expect(plan.needsUser).toEqual([{ fieldId: "b", reason: "pending_review", suggestion: "Dakar", trust: "declared" }]);
    expect(plan.untouched).toEqual(["c", "d"]);
  });
});

describe("offline cache", () => {
  it("keeps only usable, non-sensitive facts and removes tombstones and conflicts", () => {
    let s = applySync(emptyCache(), { seq: 5, changes: [base, fact({ id: "f2", key: "contact.city", value: "Dakar" }), fact({ id: "f3", sensitivity: "sensitive", masked: true, value: null }), fact({ id: "f4", usable: false })] });
    expect(Object.keys(s.facts).sort()).toEqual(["f1", "f2"]);
    s = applySync(s, { seq: 9, changes: [fact({ id: "f2", deleted: true, value: null, usable: false }), fact({ id: "f1", has_open_conflict: true, usable: false })] });
    expect(s.facts).toEqual({});
    expect(s.seq).toBe(9);
  });
  it("matches offline conservatively (never a suggestion, exact option only)", () => {
    const s = applySync(emptyCache(), { seq: 1, changes: [base, fact({ id: "f2", key: "contact.country", value: "Sénégal" })] });
    const out = offlineMatch(s, [
      { id: "a", semantic_type: "first_name", kind: "text", required: false },
      { id: "b", semantic_type: "country", kind: "select", options: ["France", "Senegal"], required: false },
      { id: "c", semantic_type: "country", kind: "select", options: ["France", "Mali"], required: false },
      { id: "d", semantic_type: "iban", kind: "text", required: false },
    ]);
    expect(out.map((m) => `${m.field_id}:${m.decision}`)).toEqual(["a:fill", "b:fill", "c:none", "d:none"]);
    expect(out[1]?.candidates[0]?.value).toBe("Senegal");
  });
  it("queues proposals idempotently and clears them after a push", () => {
    let n = 0;
    const id = () => `c${++n}`;
    let q = enqueue([], { key: "contact.city", value: "Dakar" }, id);
    q = enqueue(q, { key: "contact.city", value: "Dakar" }, id);
    q = enqueue(q, { key: "contact.city", value: "Thiès" }, id);
    expect(q).toHaveLength(2);
    expect(afterPush(q, [{ client_id: "c1", status: "created" }])).toEqual([{ client_id: "c2", key: "contact.city", value: "Thiès" }]);
  });
});
