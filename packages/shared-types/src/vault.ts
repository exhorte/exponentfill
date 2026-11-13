import { z } from "zod";
/**
 * Contracts of the identity / vault API (apps/backend/app/domains/*). The enumerations are written as literals (precise
 * types) and `vault.test.ts` checks them against `contract/vault-enums.json`, which the Python tests check against the backend.
 */
export const OriginSchema = z.enum(["declared", "extracted", "inferred"]);
export const VerificationSchema = z.enum(["none", "user_confirmed", "document_backed"]);
export const ValidationStatusSchema = z.enum(["pending_review", "validated", "rejected", "superseded"]);
export const SensitivitySchema = z.enum(["normal", "sensitive"]);
export const CategorySchema = z.enum(["personal", "contact", "professional", "academic", "skills", "certifications", "experience", "administrative", "other"]);
export const TrustClassSchema = z.enum(["declared", "extracted", "verified", "inferred"]);
export const ValueTypeSchema = z.enum(["text", "date", "number", "boolean"]);
export const DocumentStatusSchema = z.enum(["uploaded", "extracting", "extracted", "needs_review", "needs_ocr", "failed", "replaced", "deleted"]);
export const ScopeSchema = z.enum(["vault.read", "vault.write", "vault.propose", "vault.validate", "documents.read", "documents.write", "account.manage"]);

export type Origin = z.infer<typeof OriginSchema>;
export type Verification = z.infer<typeof VerificationSchema>;
export type ValidationStatus = z.infer<typeof ValidationStatusSchema>;
export type Category = z.infer<typeof CategorySchema>;
export type TrustClass = z.infer<typeof TrustClassSchema>;
export type Scope = z.infer<typeof ScopeSchema>;

const iso = z.string();
const uuid = z.string();

export const ApiErrorSchema = z.object({ error: z.object({ code: z.string(), message: z.string(), details: z.record(z.string(), z.unknown()).optional() }) });

export const UserSchema = z.object({
  id: uuid,
  email: z.string(),
  display_name: z.string(),
  locale: z.string(),
  email_verified: z.boolean(),
  status: z.string(),
  deletion_scheduled_for: iso.nullable(),
  created_at: iso,
});
export type User = z.infer<typeof UserSchema>;

export const AuthOutSchema = z.object({
  user: UserSchema,
  session: z.object({ id: uuid, kind: z.string(), scopes: z.array(z.string()), expires_at: iso }),
  csrf_token: z.string().nullable().optional(),
});
export type AuthOut = z.infer<typeof AuthOutSchema>;

export const SessionListItemSchema = z.object({
  id: uuid,
  kind: z.string(),
  label: z.string(),
  scopes: z.array(z.string()),
  created_at: iso,
  last_seen_at: iso,
  expires_at: iso,
  current: z.boolean(),
});
export const DeviceOutSchema = z.object({ id: uuid, label: z.string(), token: z.string(), scopes: z.array(z.string()), expires_at: iso });

export const FactSchema = z.object({
  id: uuid,
  key: z.string(),
  category: CategorySchema,
  group_id: z.string().nullable(),
  value: z.union([z.string(), z.boolean()]).nullable(),
  masked: z.boolean(),
  value_type: ValueTypeSchema,
  origin: OriginSchema,
  verification_level: VerificationSchema,
  validation_status: ValidationStatusSchema,
  sensitivity: SensitivitySchema,
  ai_shareable: z.boolean(),
  confidence: z.number().nullable(),
  trust_class: TrustClassSchema,
  usable: z.boolean(),
  has_open_conflict: z.boolean(),
  sources_count: z.number(),
  entered_at: iso,
  extracted_at: iso.nullable(),
  validated_at: iso.nullable(),
  updated_at: iso,
  version: z.number(),
  seq: z.number(),
  deleted: z.boolean(),
});
export type Fact = z.infer<typeof FactSchema>;
export const FactListSchema = z.object({ items: z.array(FactSchema), seq: z.number() });

export const VersionSchema = z.object({
  version: z.number(),
  value: z.union([z.string(), z.boolean()]).nullable(),
  masked: z.boolean(),
  origin: OriginSchema,
  verification_level: VerificationSchema,
  validation_status: ValidationStatusSchema,
  actor: z.string(),
  reason: z.string(),
  changed_at: iso,
});
export const SourceSchema = z.object({ document_id: uuid, document_type: z.string().nullable().optional(), locator: z.record(z.string(), z.unknown()), created_at: iso });

const ConflictSideSchema = z.object({ fact_id: uuid, value: z.union([z.string(), z.boolean()]).nullable(), masked: z.boolean(), trust_class: TrustClassSchema, validation_status: ValidationStatusSchema });
export const ConflictSchema = z.object({ id: uuid, kind: z.string(), key: z.string(), group_id: z.string().nullable(), status: z.string(), detected_at: iso, a: ConflictSideSchema, b: ConflictSideSchema });
export type Conflict = z.infer<typeof ConflictSchema>;
export const ReviewSchema = z.object({ facts: z.array(FactSchema), conflicts: z.array(ConflictSchema) });

export const DocumentSchema = z.object({
  id: uuid,
  filename: z.string(),
  mime: z.string(),
  kind: z.string(),
  size: z.number(),
  sha256: z.string(),
  status: DocumentStatusSchema,
  status_reason: z.string().nullable(),
  doc_type: z.string(),
  doc_type_confidence: z.number(),
  page_count: z.number(),
  language: z.string().nullable(),
  version: z.number(),
  replaces_id: uuid.nullable(),
  uploaded_at: iso,
  deleted_at: iso.nullable(),
  duplicate: z.boolean().optional(),
});
export type VaultDocument = z.infer<typeof DocumentSchema>;
export const DocumentTextSchema = z.object({ text: z.string(), truncated: z.boolean(), engine: z.string().nullable(), warnings: z.array(z.string()) });

export const PrivacySchema = z.object({
  ai_sharing_mode: z.enum(["none", "structure_only", "selected"]),
  ai_allowed_categories: z.array(z.string()),
  document_retention_days: z.number().nullable(),
  audit_retention_days: z.number().nullable(),
  require_validation_for_sensitive: z.boolean(),
  device_validation_allowed: z.boolean(),
  updated_at: iso,
});
export type Privacy = z.infer<typeof PrivacySchema>;
export const AiPreviewSchema = z.object({
  mode: z.string(),
  purpose: z.string(),
  shareable: z.array(z.object({ fact_id: z.string(), key: z.string(), category: z.string() })),
  excluded: z.record(z.string(), z.number()),
});
export const AuditEventSchema = z.object({
  id: z.number(),
  actor: z.string(),
  action: z.string(),
  subject_type: z.string().nullable(),
  subject_id: z.string().nullable(),
  outcome: z.string(),
  meta: z.record(z.string(), z.unknown()),
  created_at: iso,
});

// ---- matching and synchronisation (extension) -----------------------------------------------------------------
export const MatchFieldSchema = z.object({
  id: z.string(),
  semantic_type: z.string(),
  kind: z.string().default("text"),
  label: z.string().nullable().optional(),
  options: z.array(z.string()).nullable().optional(),
  section: z.string().nullable().optional(),
  required: z.boolean().default(false),
});
export type MatchField = z.infer<typeof MatchFieldSchema>;

export const CandidateSchema = z.object({
  fact_id: uuid.nullable(),
  key: z.string(),
  value: z.union([z.string(), z.boolean()]).nullable(),
  trust_class: TrustClassSchema,
  validation_status: ValidationStatusSchema,
  usable: z.boolean(),
  needs_confirmation: z.boolean(),
  reason: z.string(),
  sources_count: z.number().default(0),
});
export const FieldMatchSchema = z.object({ field_id: z.string(), decision: z.enum(["fill", "suggest", "none"]), reason: z.string(), candidates: z.array(CandidateSchema) });
export type FieldMatch = z.infer<typeof FieldMatchSchema>;
export const MatchOutSchema = z.object({ matches: z.array(FieldMatchSchema), seq: z.number() });
export const SyncOutSchema = z.object({ seq: z.number(), changes: z.array(FactSchema), more: z.boolean() });
export const SyncPushOutSchema = z.object({
  results: z.array(z.object({ client_id: z.string(), status: z.enum(["created", "exists", "updated", "deleted", "conflict", "forbidden", "invalid"]), fact: FactSchema.nullable().optional(), detail: z.string().nullable().optional() })),
  seq: z.number(),
});
