import type { Fact, FieldMatch, MatchField } from "@exponent-fill/shared-types";
import { isAutoFillable } from "./trust";

/**
 * Offline cache of the extension (ADR-019): ONLY facts that are usable and NOT sensitive. A sensitive value never
 * leaves the server through a sync (it arrives masked) and is never written to the local cache.
 */
export interface CacheState {
  seq: number;
  facts: Record<string, Fact>;
}
export const emptyCache = (): CacheState => ({ seq: 0, facts: {} });

export function cacheable(f: Fact): boolean {
  return !f.deleted && f.sensitivity === "normal" && !f.masked && f.value !== null && isAutoFillable(f);
}

export function applySync(state: CacheState, out: { seq: number; changes: readonly Fact[] }): CacheState {
  const facts = { ...state.facts };
  for (const f of out.changes) {
    if (cacheable(f)) facts[f.id] = f;
    else delete facts[f.id]; // tombstone, unvalidated, in conflict, sensitive...: it must not be filled offline
  }
  return { seq: Math.max(state.seq, out.seq), facts };
}

const SEMANTIC_KEYS: Record<string, string[]> = {
  first_name: ["personal.first_name"], last_name: ["personal.last_name"], civility: ["personal.civility"], email: ["contact.email"], phone: ["contact.phone"],
  address_line1: ["contact.address_line1"], address_line2: ["contact.address_line2"], postal_code: ["contact.postal_code"], city: ["contact.city"],
  region: ["contact.region"], country: ["contact.country"], company: ["professional.company", "experience.company"], job_title: ["professional.job_title", "experience.title"],
  website: ["professional.website"], linkedin: ["professional.linkedin"], degree: ["academic.degree"], institution: ["academic.institution"],
};

/** Offline fallback of `/vault/match`: conservative (only cached, usable, non-sensitive facts) and never a "suggest". */
export function offlineMatch(state: CacheState, fields: readonly MatchField[]): FieldMatch[] {
  const facts = Object.values(state.facts);
  return fields.map((fld) => {
    const keys = SEMANTIC_KEYS[fld.semantic_type] ?? [];
    const hits = facts.filter((f) => keys.includes(f.key) && typeof f.value === "string").sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    const top = hits[0];
    if (!top || typeof top.value !== "string") return { field_id: fld.id, decision: "none" as const, reason: keys.length ? "offline_nothing_cached" : "no_mapping", candidates: [] };
    let value = top.value;
    if (fld.options && fld.options.length) {
      const norm = (s: string) => s.normalize("NFD").replace(/(?<=\p{Script=Latin})\p{M}+/gu, "").toLocaleLowerCase().trim();
      const hit = fld.options.filter((o) => norm(o) === norm(value));
      if (hit.length !== 1 || hit[0] === undefined) return { field_id: fld.id, decision: "none" as const, reason: "no_matching_option", candidates: [] };
      value = hit[0];
    }
    return {
      field_id: fld.id, decision: "fill" as const, reason: "usable_from_cache",
      candidates: [{ fact_id: top.id, key: top.key, value, trust_class: top.trust_class, validation_status: top.validation_status, usable: true, needs_confirmation: false, reason: "usable_from_cache", sources_count: top.sources_count }],
    };
  });
}

// ---- proposals made while offline -----------------------------------------------------------------------------
export interface Proposal {
  client_id: string;
  key: string;
  value: string;
  group_id?: string | null;
}

/** Idempotent queue: the same key+value proposed twice is queued once. */
export function enqueue(queue: readonly Proposal[], p: Omit<Proposal, "client_id">, newId: () => string): Proposal[] {
  if (queue.some((q) => q.key === p.key && q.value === p.value && (q.group_id ?? null) === (p.group_id ?? null))) return [...queue];
  return [...queue, { ...p, client_id: newId() }];
}

/** After a push: keep only what must be retried (nothing: created/exists/invalid/forbidden/conflict are all final). */
export function afterPush(queue: readonly Proposal[], results: readonly { client_id: string; status: string }[]): Proposal[] {
  const done = new Set(results.map((r) => r.client_id));
  return queue.filter((q) => !done.has(q.client_id));
}
