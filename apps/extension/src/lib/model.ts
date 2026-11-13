import type { ModelCall } from "@exponent-fill/form-engine";

/**
 * The optional model that reclassifies fields the taxonomy left `unknown` (ADR-022). The user brings their OWN key (D1);
 * the provider adapter, the key storage and the optional host permission for the provider are spike S9 and are NOT built.
 * Until then there is no model: the panel works with the deterministic classification only, and the pipeline calls this
 * one function, so plugging a provider in later changes nothing else.
 */
export async function getModelCall(): Promise<ModelCall | null> {
  return null;
}
