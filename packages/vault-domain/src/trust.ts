import type { Fact, TrustClass } from "@exponent-fill/shared-types";

/**
 * The client NEVER promotes trust. "Verified" is shown only when the server says so AND the fact's own fields agree
 * (a payload claiming `verified` with an unvalidated status or no verification level is displayed as what its origin is).
 */
export function displayTrust(f: Pick<Fact, "trust_class" | "validation_status" | "verification_level" | "origin">): TrustClass {
  if (f.trust_class === "verified") {
    const consistent = f.validation_status === "validated" && f.verification_level !== "none";
    return consistent ? "verified" : f.origin === "declared" ? "declared" : f.origin === "extracted" ? "extracted" : "inferred";
  }
  return f.trust_class;
}

export const TRUST_LABEL_KEYS: Record<TrustClass, string> = {
  declared: "trustDeclared",
  extracted: "trustExtracted",
  verified: "trustVerified",
  inferred: "trustInferred",
};

/** R4 as the client sees it: only what the server flags usable may be filled automatically. */
export function isAutoFillable(f: Pick<Fact, "usable" | "has_open_conflict" | "validation_status" | "deleted" | "masked">): boolean {
  return f.usable && !f.has_open_conflict && f.validation_status === "validated" && !f.deleted;
}
