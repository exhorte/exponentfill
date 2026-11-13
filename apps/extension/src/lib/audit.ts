import type { FieldState, ReviewItem } from "@exponent-fill/vault-domain";
import type { KeyValueStore } from "./vault/service";

/**
 * Basic audit history (FR-16, ADR-014: local, no telemetry). It records WHAT happened to WHICH field and from WHICH fact,
 * never a value: no field value, no fact value, no writer reason (those may quote a value). Capped and clearable.
 */
const KEY = "ef.audit";
export const AUDIT_MAX = 200;

export interface AuditField {
  /** Page text, shortened. Untrusted: render it as text only. */
  label: string;
  semantic: string;
  state: FieldState;
  /** Writer status, or "not-written" when the user did not approve the field. */
  status: string;
  /** Machine code of the outcome (never a value). */
  code: string;
  factId: string | null;
  trust: string | null;
  /** The user approved an inferred / to-confirm proposal for this fill. */
  approvedUnconfirmed: boolean;
}
export interface AuditEntry {
  id: string;
  ts: string;
  host: string;
  fields: AuditField[];
  written: number;
  alreadyCorrect: number;
  failed: number;
  refused: number;
  undone: boolean;
}

export interface FillOutcome {
  fieldId: string;
  status: string;
  code: string;
}

export function buildEntry(host: string, items: readonly ReviewItem[], approved: ReadonlySet<string>, outcomes: readonly FillOutcome[], now: Date, id: string): AuditEntry {
  const by = new Map(outcomes.map((o) => [o.fieldId, o]));
  const fields: AuditField[] = items
    .filter((i) => i.state !== "skipped" || by.has(i.fieldId))
    .map((i) => {
      const o = by.get(i.fieldId);
      return {
        label: i.label.slice(0, 120),
        semantic: i.semanticType,
        state: i.state,
        status: o?.status ?? "not-written",
        code: o?.code ?? (approved.has(i.fieldId) ? "not_attempted" : "not_approved"),
        factId: i.factId,
        trust: i.trust,
        approvedUnconfirmed: i.state === "inferred" && approved.has(i.fieldId),
      };
    });
  const count = (s: string) => outcomes.filter((o) => o.status === s).length;
  return { id, ts: now.toISOString(), host: host.slice(0, 200), fields, written: count("written"), alreadyCorrect: count("already-correct"), failed: count("failed"), refused: count("refused"), undone: false };
}

export async function readAudit(store: KeyValueStore): Promise<AuditEntry[]> {
  const raw = await store.get(KEY);
  return Array.isArray(raw) ? (raw as AuditEntry[]) : [];
}

export async function appendAudit(store: KeyValueStore, entry: AuditEntry): Promise<AuditEntry[]> {
  const next = [entry, ...(await readAudit(store))].slice(0, AUDIT_MAX);
  await store.set(KEY, next);
  return next;
}

export async function markUndone(store: KeyValueStore, id: string): Promise<AuditEntry[]> {
  const next = (await readAudit(store)).map((e) => (e.id === id ? { ...e, undone: true } : e));
  await store.set(KEY, next);
  return next;
}

export async function clearAudit(store: KeyValueStore): Promise<void> {
  await store.remove(KEY);
}
