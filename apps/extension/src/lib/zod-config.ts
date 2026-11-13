import { z } from "zod";

/**
 * Must be the FIRST import of an entry file. Zod 4 compiles object parsers with `new Function`; the CSP of extension pages
 * (`script-src 'self'`) blocks it and REPORTS the probe as a violation (an error in chrome://extensions) even though zod falls
 * back to its interpreter. `jitless` skips the probe. It has to be set before any schema is built, and ES modules evaluate
 * imports in order.
 */
z.config({ jitless: true });
