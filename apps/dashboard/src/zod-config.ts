import { z } from "zod";

/**
 * Must be the FIRST import of the entry file. Zod 4 compiles object parsers with `new Function`; under a strict Content-Security-Policy
 * (no `unsafe-eval`, see vercel.json) the probe is blocked and REPORTED as a violation even though zod falls back to its interpreter.
 * `jitless` skips the probe. It has to be set before any schema is built, and ES modules evaluate imports in order.
 */
z.config({ jitless: true });
