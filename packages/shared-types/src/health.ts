import { z } from "zod";

/**
 * Contract of `GET /health` on the backend.
 * `database` reports the connection state only; it never carries connection details.
 */
export const HealthResponseSchema = z.object({
  status: z.literal("ok"),
  version: z.string().min(1),
  database: z.enum(["ok", "unconfigured", "unreachable"]),
});

export type HealthResponse = z.infer<typeof HealthResponseSchema>;
