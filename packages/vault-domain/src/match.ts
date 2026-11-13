import type { FormField } from "@exponent-fill/form-engine";
import type { FieldMatch, MatchField } from "@exponent-fill/shared-types";

/**
 * Form STRUCTURE -> match request. No value of the page and no value of the vault ever travels here (ADR-005).
 * Secrets, disabled and read-only fields are not even asked about.
 */
/** The part of a scanned field that the match request needs (a validated subset is enough, e.g. after crossing a message boundary). */
export type MatchableField = Pick<FormField, "id" | "kind" | "label" | "section" | "required" | "disabled" | "readOnly" | "options" | "semantic">;

export function toMatchFields(fields: readonly MatchableField[]): MatchField[] {
  return fields
    .filter((f) => !f.semantic.secret && !f.disabled && !f.readOnly && f.kind !== "file" && f.kind !== "password")
    .map((f) => ({
      id: f.id,
      semantic_type: f.semantic.type,
      kind: f.kind,
      label: f.label.text || null,
      options: f.options ? f.options.map((o) => o.label) : null,
      section: f.section,
      required: f.required,
    }));
}

export interface FillItem {
  fieldId: string;
  value: string | boolean;
  factId: string | null;
  trust: string;
}
export interface NeedsUserItem {
  fieldId: string;
  reason: string;
  /** What the user could confirm. May be null (sensitive, hidden). */
  suggestion: string | boolean | null;
  trust: string | null;
}
export interface FillPlan {
  fill: FillItem[];
  needsUser: NeedsUserItem[];
  untouched: string[];
}

/** Only `fill` decisions become automatic; `suggest` is shown to the user, `none` leaves the field empty. */
export function planFill(matches: readonly FieldMatch[]): FillPlan {
  const plan: FillPlan = { fill: [], needsUser: [], untouched: [] };
  for (const m of matches) {
    const top = m.candidates[0];
    if (m.decision === "fill" && top && top.usable && top.value !== null) {
      plan.fill.push({ fieldId: m.field_id, value: top.value, factId: top.fact_id, trust: top.trust_class });
    } else if (m.decision === "suggest" && top) {
      plan.needsUser.push({ fieldId: m.field_id, reason: m.reason, suggestion: top.value, trust: top.trust_class });
    } else {
      plan.untouched.push(m.field_id);
    }
  }
  return plan;
}
