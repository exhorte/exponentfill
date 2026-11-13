import { z } from "zod";
import { HealthResponseSchema } from "./health";

/**
 * Typed messages exchanged inside the extension (see API_SPECIFICATION §A in the vault).
 * Every message is validated on receipt; anything that does not match is rejected.
 */
export const HealthCheckRequestSchema = z.object({ type: z.literal("health.check") }).strict();

export const ExtensionRequestSchema = z.discriminatedUnion("type", [HealthCheckRequestSchema]);
export type ExtensionRequest = z.infer<typeof ExtensionRequestSchema>;

export const HealthCheckResultSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), health: HealthResponseSchema }),
  z.object({
    ok: z.literal(false),
    error: z.enum(["unreachable", "timeout", "invalid_response"]),
  }),
]);
export type HealthCheckResult = z.infer<typeof HealthCheckResultSchema>;

/** Returned when a message is malformed or comes from an unexpected sender. */
export const RejectedSchema = z.object({ ok: z.literal(false), error: z.literal("rejected") });
export type Rejected = z.infer<typeof RejectedSchema>;

export const ExtensionResponseSchema = z.union([HealthCheckResultSchema, RejectedSchema]);
export type ExtensionResponse = z.infer<typeof ExtensionResponseSchema>;
