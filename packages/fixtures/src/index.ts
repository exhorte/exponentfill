import { readFileSync } from "node:fs";
import path from "node:path";

/** Absolute path of the fixture pages directory. */
export const pagesDir = path.resolve(import.meta.dirname, "../pages");

/** Names of the available fixture pages (without extension). */
export const FIXTURES = [
  "form-basic",
  "form-fr",
  "form-multistep",
  "form-combobox",
  "form-iframe",
  "shadow-closed",
  "shadow-open",
  "upload",
  "richtext",
  "trap-submit",
] as const;
export type FixtureName = (typeof FIXTURES)[number];

/** HTML source of a fixture page. */
export function readFixture(name: FixtureName): string {
  return readFileSync(path.join(pagesDir, `${name}.html`), "utf8");
}
