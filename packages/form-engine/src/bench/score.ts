import { classifySemantic } from "../semantic";
import type { FieldKind, SemanticType } from "../types";

export type Verdict = "exact" | "false_positive" | "missed" | "secret_leak" | "over_protected";

export interface Scored {
  label: string;
  expected: SemanticType;
  got: SemanticType;
  verdict: Verdict;
}

export interface Metrics {
  total: number;
  exact: number;
  /** A type was proposed although the truth is another type or `unknown`: the dangerous error (NFR-03). */
  falsePositive: number;
  /** The truth is a known type and `unknown` was returned: acceptable, the field stays empty. */
  missed: number;
  /** A field that is truly a secret was not flagged `secret`. Must be 0. */
  secretLeaks: number;
  /** Not a secret, but treated as one (never filled): harmless, reported for information. */
  overProtected: number;
  /** Fraction of fields that do NOT end up with a wrong proposal. */
  safety: number;
  /** Among the fields that have a vault key, the fraction answered correctly. */
  recall: number;
  failures: Scored[];
}

const SECRET_TYPES: ReadonlySet<SemanticType> = new Set(["password", "one_time_code", "card_number", "card_security_code"]);

/** Verdict for one field. `unknown` expected + `unknown` got is "exact": leaving it empty is right. */
export function judge(expected: SemanticType, got: SemanticType, flaggedSecret: boolean): Verdict {
  if (SECRET_TYPES.has(expected) && !flaggedSecret) return "secret_leak";
  if (got === expected) return "exact";
  if (got === "unknown") return "missed";
  // Treating a field as a secret when it is not one only means it is never filled: over-cautious, never harmful.
  if (SECRET_TYPES.has(got) && flaggedSecret) return "over_protected";
  return "false_positive";
}

export interface SampleLike {
  l: string;
  t: SemanticType;
  k?: FieldKind;
  n?: string;
  ac?: string;
}

export function scoreSamples(samples: readonly SampleLike[]): Metrics {
  const failures: Scored[] = [];
  let exact = 0, fp = 0, missed = 0, leaks = 0, over = 0, known = 0, knownRight = 0;
  for (const s of samples) {
    const g = classifySemantic({ kind: s.k ?? "text", autocomplete: s.ac ?? null, label: s.l, name: s.n ?? null, htmlId: null, placeholder: null });
    const verdict = judge(s.t, g.type, g.secret);
    if (s.t !== "unknown") {
      known++;
      if (verdict === "exact") knownRight++;
    }
    if (verdict === "exact") exact++;
    else {
      if (verdict === "false_positive") fp++;
      else if (verdict === "missed") missed++;
      else if (verdict === "over_protected") over++;
      else leaks++;
      failures.push({ label: s.l || `[${s.n ?? s.ac ?? ""}]`, expected: s.t, got: g.type, verdict });
    }
  }
  const total = samples.length;
  return { total, exact, falsePositive: fp, missed, secretLeaks: leaks, overProtected: over, safety: total ? 1 - fp / total : 1, recall: known ? knownRight / known : 1, failures };
}

export const fmt = (m: Metrics) =>
  `n=${m.total} exact=${m.exact} falsePositive=${m.falsePositive} missed=${m.missed} secretLeaks=${m.secretLeaks} overProtected=${m.overProtected} safety=${(m.safety * 100).toFixed(1)}% recall=${(m.recall * 100).toFixed(1)}%`;
