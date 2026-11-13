import type { FormField } from "@exponent-fill/form-engine";
import type { FieldMatch, TrustClass } from "@exponent-fill/shared-types";
import type { FillItem } from "./match";
import { displayTrust } from "./trust";

/**
 * The review model (FR-08 to FR-10, ADR-022): what the side panel shows BEFORE anything is written to the page.
 * Pure function of (scanned fields, match answer). It never invents a value and never promotes trust.
 */

/** known: usable fact · inferred: needs the user's yes · conflict: sources disagree · missing: required, nothing proposed
 *  empty: optional, nothing proposed · skipped: must never be filled (secret, read-only, file, consent...). */
export type FieldState = "known" | "inferred" | "conflict" | "missing" | "empty" | "skipped";

/** A `known` proposal is pre-ticked only when the field's type was recognised with at least this confidence. */
export const AUTO_CHECK_MIN_CONFIDENCE = 0.8;

export type ReviewField = Pick<FormField, "id" | "kind" | "label" | "required" | "disabled" | "readOnly" | "semantic"> & { hasValue?: boolean };

export interface ReviewItem {
  fieldId: string;
  label: string;
  kind: string;
  semanticType: string;
  required: boolean;
  state: FieldState;
  /** Machine reason from the match answer (or from the field itself). Mapped to a translated text by the UI. */
  reason: string;
  /** The value that WOULD be written (null when masked or absent). Shown to the user, never sent to a model. */
  value: string | boolean | null;
  factId: string | null;
  trust: TrustClass | null;
  sourcesCount: number;
  /** The page field already holds something: it is not overwritten unless the user ticks it. */
  alreadyFilled: boolean;
  /** Recognition confidence of the field's type (0..1) and how it was obtained. */
  confidence: number;
  via: string;
  /** Something can be written if the user approves. */
  fillable: boolean;
  /** Pre-ticked in the review. */
  defaultChecked: boolean;
}

export interface ReviewModel {
  items: ReviewItem[];
  /** Required fields with nothing to propose: the user is asked to complete them. */
  toComplete: ReviewItem[];
  counts: Record<FieldState, number>;
}

const NEVER_FILL_KINDS: ReadonlySet<string> = new Set(["file", "password"]);

function skipReason(f: ReviewField): string | null {
  if (f.semantic.secret) return "secret";
  if (f.disabled) return "disabled";
  if (f.readOnly) return "read_only";
  if (NEVER_FILL_KINDS.has(f.kind)) return f.kind === "file" ? "file_not_supported" : "secret";
  return null;
}

export function buildReview(fields: readonly ReviewField[], matches: readonly FieldMatch[]): ReviewModel {
  const byId = new Map(matches.map((m) => [m.field_id, m]));
  const items: ReviewItem[] = fields.map((f) => {
    const base = {
      fieldId: f.id,
      label: f.label.text || f.semantic.type,
      kind: f.kind,
      semanticType: f.semantic.type,
      required: f.required,
      alreadyFilled: f.hasValue === true,
      confidence: f.semantic.confidence,
      via: f.semantic.via,
      value: null as string | boolean | null,
      factId: null as string | null,
      trust: null as TrustClass | null,
      sourcesCount: 0,
    };
    const skip = skipReason(f);
    if (skip) return { ...base, state: "skipped" as const, reason: skip, fillable: false, defaultChecked: false };

    const m = byId.get(f.id);
    const top = m?.candidates[0];
    if (!m) return { ...base, state: f.required ? ("missing" as const) : ("empty" as const), reason: "nothing_in_vault", fillable: false, defaultChecked: false };

    const trust = top ? displayTrust({ trust_class: top.trust_class, validation_status: top.validation_status, verification_level: top.trust_class === "verified" ? "user_confirmed" : "none", origin: top.trust_class === "inferred" ? "inferred" : top.trust_class === "extracted" ? "extracted" : "declared" }) : null;
    const withTop = { ...base, value: top?.value ?? null, factId: top?.fact_id ?? null, trust, sourcesCount: top?.sources_count ?? 0 };

    if (m.decision === "fill" && top && top.usable && top.value !== null) {
      const sure = f.semantic.confidence >= AUTO_CHECK_MIN_CONFIDENCE && !top.needs_confirmation;
      return { ...withTop, state: "known" as const, reason: m.reason, fillable: true, defaultChecked: sure && !base.alreadyFilled };
    }
    if (m.decision === "suggest") {
      if (m.reason === "open_conflict") return { ...withTop, value: null, state: "conflict" as const, reason: m.reason, fillable: false, defaultChecked: false };
      return { ...withTop, state: "inferred" as const, reason: m.reason, fillable: top?.value !== null && top?.value !== undefined, defaultChecked: false };
    }
    // decision "none"
    if (m.reason === "secret" || m.reason === "consent_requires_user") return { ...withTop, state: "skipped" as const, reason: m.reason, fillable: false, defaultChecked: false };
    return { ...withTop, state: f.required ? ("missing" as const) : ("empty" as const), reason: m.reason, fillable: false, defaultChecked: false };
  });

  const counts: Record<FieldState, number> = { known: 0, inferred: 0, conflict: 0, missing: 0, empty: 0, skipped: 0 };
  for (const i of items) counts[i.state]++;
  return { items, toComplete: items.filter((i) => i.state === "missing"), counts };
}

/**
 * What may be written: ONLY items the user ticked AND that are fillable. A `conflict`, `missing`, `empty` or `skipped` item can
 * never be selected, whatever the ids say. Ticking an `inferred` item approves it for THIS fill only: it does not validate
 * the fact in the vault (R2, ADR-023).
 */
export function selectFillItems(model: ReviewModel, approved: ReadonlySet<string>): FillItem[] {
  const out: FillItem[] = [];
  for (const i of model.items) {
    if (!approved.has(i.fieldId) || !i.fillable || i.value === null) continue;
    if (i.state !== "known" && i.state !== "inferred") continue;
    out.push({ fieldId: i.fieldId, value: i.value, factId: i.factId, trust: i.trust ?? "declared" });
  }
  return out;
}
