import { describe, expect, it } from "vitest";
import {
  ExtensionRequestSchema,
  ExtensionResponseSchema,
  HealthResponseSchema,
} from "./index";

describe("ExtensionRequestSchema", () => {
  it("accepts a health.check request", () => {
    expect(ExtensionRequestSchema.safeParse({ type: "health.check" }).success).toBe(true);
  });

  it("rejects unknown message types", () => {
    expect(ExtensionRequestSchema.safeParse({ type: "page.submit" }).success).toBe(false);
  });

  it("rejects extra fields (strict)", () => {
    expect(
      ExtensionRequestSchema.safeParse({ type: "health.check", url: "https://example.com" }).success,
    ).toBe(false);
  });

  it("rejects non-objects", () => {
    for (const value of [null, undefined, "health.check", 42, []]) {
      expect(ExtensionRequestSchema.safeParse(value).success).toBe(false);
    }
  });
});

describe("HealthResponseSchema", () => {
  it("accepts a valid payload", () => {
    const parsed = HealthResponseSchema.safeParse({ status: "ok", version: "0.0.0", database: "ok" });
    expect(parsed.success).toBe(true);
  });

  it("rejects an unknown database state", () => {
    const parsed = HealthResponseSchema.safeParse({ status: "ok", version: "0.0.0", database: "maybe" });
    expect(parsed.success).toBe(false);
  });
});

describe("ExtensionResponseSchema", () => {
  it("accepts a failure result and a rejection", () => {
    expect(ExtensionResponseSchema.safeParse({ ok: false, error: "timeout" }).success).toBe(true);
    expect(ExtensionResponseSchema.safeParse({ ok: false, error: "rejected" }).success).toBe(true);
  });
});
