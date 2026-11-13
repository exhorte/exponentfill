import { describe, expect, it } from "vitest";
import enums from "../contract/vault-enums.json";
import { ApiErrorSchema, CategorySchema, FactSchema, MatchOutSchema, OriginSchema, ScopeSchema, SensitivitySchema, SyncOutSchema, TrustClassSchema, ValidationStatusSchema, ValueTypeSchema, VerificationSchema, DocumentStatusSchema } from "./vault";

const fact = {
  id: "11111111-1111-1111-1111-111111111111", key: "personal.first_name", category: "personal", group_id: null, value: "Awa", masked: false, value_type: "text",
  origin: "declared", verification_level: "none", validation_status: "validated", sensitivity: "normal", ai_shareable: false, confidence: null, trust_class: "declared",
  usable: true, has_open_conflict: false, sources_count: 0, entered_at: "2026-11-12T10:00:00Z", extracted_at: null, validated_at: "2026-11-12T10:00:00Z",
  updated_at: "2026-11-12T10:00:00Z", version: 1, seq: 1, deleted: false,
};

describe("vault contract", () => {
  it("enumerations come from the shared JSON file (the backend tests check the same file)", () => {
    expect(OriginSchema.options).toEqual(enums.origin);
    expect(VerificationSchema.options).toEqual(enums.verification_level);
    expect(ValidationStatusSchema.options).toEqual(enums.validation_status);
    expect(CategorySchema.options).toEqual(enums.category);
    expect(TrustClassSchema.options).toEqual(enums.trust_class);
    expect(SensitivitySchema.options).toEqual(enums.sensitivity);
    expect(ValueTypeSchema.options).toEqual(enums.value_type);
    expect(DocumentStatusSchema.options).toEqual(enums.document_status);
    expect(ScopeSchema.options).toEqual(enums.scopes);
  });

  it("parses a backend fact and rejects an unknown trust class", () => {
    expect(FactSchema.parse(fact).trust_class).toBe("declared");
    expect(FactSchema.safeParse({ ...fact, trust_class: "certified" }).success).toBe(false);
    expect(FactSchema.safeParse({ ...fact, origin: "guessed" }).success).toBe(false);
  });

  it("parses match, sync and error payloads", () => {
    expect(MatchOutSchema.parse({ matches: [{ field_id: "f1", decision: "fill", reason: "usable", candidates: [{ fact_id: fact.id, key: fact.key, value: "Awa", trust_class: "declared", validation_status: "validated", usable: true, needs_confirmation: false, reason: "usable" }] }], seq: 3 }).seq).toBe(3);
    expect(SyncOutSchema.parse({ seq: 1, changes: [fact], more: false }).changes).toHaveLength(1);
    expect(ApiErrorSchema.parse({ error: { code: "stale_version", message: "x", details: { current_version: 2 } } }).error.code).toBe("stale_version");
  });
});
