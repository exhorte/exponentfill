import { SECRET, SENSITIVE } from "./semantic";
import { LLM_SYSTEM_RULES, type LlmField } from "./serialize";
import { escapeUntrusted } from "./text";
import { SEMANTIC_TYPES, type FormField, type SemanticType } from "./types";

/**
 * Optional second pass (ADR-022): a model reclassifies ONLY the fields the deterministic taxonomy left `unknown`.
 * It sees form STRUCTURE (never a personal value), its answer is validated strictly and then FILTERED; any doubt
 * keeps the field `unknown`, which means "leave it empty". The network call itself is injected (`ModelCall`):
 * the user's own key (D1) never enters this package.
 */

/** What this pass needs from a scanned field (a validated subset is enough after a message boundary). */
export type ClassifiableField = Pick<FormField, "id" | "kind" | "label" | "section" | "required" | "disabled" | "readOnly" | "options" | "semantic"> & {
  constraints?: Partial<FormField["constraints"]>;
};

export interface ModelRequest {
  system: string;
  user: string;
}
export type ModelCall = (req: ModelRequest) => Promise<string>;

export interface ReclassifyRequest extends ModelRequest {
  /** The field ids that were sent, i.e. the only ids an answer may mention. */
  ids: string[];
}

export interface Reclassification {
  id: string;
  type: SemanticType;
  confidence: number;
}

/** Below this confidence a model answer is ignored. */
export const RECLASSIFY_MIN_CONFIDENCE = 0.75;
const MAX_FIELDS = 120;

const ASKABLE: readonly SemanticType[] = SEMANTIC_TYPES.filter((t) => !SECRET.has(t) && t !== "unknown");
const ASKABLE_SET: ReadonlySet<string> = new Set(ASKABLE);

const wrap = (s: string) => `<untrusted_text>${escapeUntrusted(s)}</untrusted_text>`;

function eligible(f: ClassifiableField): boolean {
  return f.semantic.type === "unknown" && !f.semantic.secret && !f.disabled && !f.readOnly && f.kind !== "file" && f.kind !== "password";
}

/** The request for the fields that are still `unknown`, or null when there is nothing to ask. */
export function buildReclassifyRequest(fields: readonly ClassifiableField[]): ReclassifyRequest | null {
  const picked = fields.filter(eligible).slice(0, MAX_FIELDS);
  if (picked.length === 0) return null;
  const payload: Omit<LlmField, "hint">[] = picked.map((f) => ({
    id: f.id,
    kind: f.kind,
    label: wrap(f.label.text),
    section: f.section ? wrap(f.section) : null,
    required: f.required,
    options: f.options ? f.options.slice(0, 40).map((o) => wrap(o.label)) : null,
    constraints: { maxLength: f.constraints?.maxLength ?? null, pattern: null, accept: null, multiple: f.constraints?.multiple ?? false },
  }));
  const system =
    `${LLM_SYSTEM_RULES} Task: for each form field, name the kind of information it asks for, chosen ONLY from this list: ${ASKABLE.join(", ")}. ` +
    `If you are not sure, leave the field out. Answer with JSON only: {"classifications":[{"id":"<field id>","type":"<one of the list>","confidence":<0..1>}]}`;
  const user = JSON.stringify({ fields: payload });
  return { system, user, ids: picked.map((f) => f.id) };
}

function extractJson(raw: string): unknown {
  const text = raw.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)```$/i.exec(text);
  const body = fenced?.[1]?.trim() ?? text;
  try {
    return JSON.parse(body);
  } catch {
    return undefined;
  }
}

/**
 * Validates an answer. A malformed answer (not JSON, wrong shape) is thrown away entirely (returns null);
 * inside a well-formed answer an invalid entry is simply ignored. Entries are dropped when: the id was not sent,
 * the type is outside the taxonomy or is a SECRET type, the confidence is below the threshold, or the same id is
 * given two different types (ambiguous).
 */
export function parseReclassification(raw: string, ids: readonly string[]): Reclassification[] | null {
  const doc = extractJson(raw);
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) return null;
  const list = (doc as { classifications?: unknown }).classifications;
  if (!Array.isArray(list) || list.length > 500) return null;
  const sent = new Set(ids);
  const seen = new Map<string, Reclassification | null>();
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const { id, type, confidence } = item as { id?: unknown; type?: unknown; confidence?: unknown };
    if (typeof id !== "string" || !sent.has(id) || typeof type !== "string" || typeof confidence !== "number") continue;
    if (!ASKABLE_SET.has(type) || !Number.isFinite(confidence) || confidence < RECLASSIFY_MIN_CONFIDENCE || confidence > 1) continue;
    const prev = seen.get(id);
    if (prev === null || (prev && prev.type !== type)) {
      seen.set(id, null); // two different answers for one field: ambiguous, drop it
      continue;
    }
    seen.set(id, { id, type: type as SemanticType, confidence });
  }
  return Array.from(seen.values()).filter((r): r is Reclassification => r !== null);
}

/** Applies validated answers to fields that are STILL unknown (a deterministic type is never overridden). */
export function applyReclassification<T extends ClassifiableField>(fields: readonly T[], results: readonly Reclassification[]): T[] {
  const by = new Map(results.map((r) => [r.id, r]));
  return fields.map((f) => {
    const r = by.get(f.id);
    if (!r || !eligible(f)) return f;
    return { ...f, semantic: { type: r.type, confidence: r.confidence, via: "model" as const, secret: false, sensitive: SENSITIVE.has(r.type) } };
  });
}

/** The whole pass. ANY failure of the model (error, timeout, bad answer) leaves the fields exactly as they were. */
export async function reclassifyUnknown<T extends ClassifiableField>(fields: readonly T[], call: ModelCall): Promise<{ fields: T[]; applied: number }> {
  const req = buildReclassifyRequest(fields);
  if (!req) return { fields: [...fields], applied: 0 };
  try {
    const raw = await call({ system: req.system, user: req.user });
    const parsed = parseReclassification(raw, req.ids);
    if (!parsed) return { fields: [...fields], applied: 0 };
    return { fields: applyReclassification(fields, parsed), applied: parsed.length };
  } catch {
    return { fields: [...fields], applied: 0 };
  }
}
