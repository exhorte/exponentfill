import { FIXTURES, readFixture, type FixtureName } from "@exponent-fill/fixtures";
import { writeFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { scanForm } from "../scan";
import type { SemanticType } from "../types";
import { CORPUS } from "./corpus";
import { BLIND } from "./corpus-blind";
import { HELDOUT } from "./corpus-heldout";
import { fmt, judge, scoreSamples, type Metrics } from "./score";

/**
 * Mapping benchmark (G4, NFR-03). THESE NUMBERS ARE IN-SAMPLE: the three corpora were used to tune the taxonomy
 * (see MAPPING_FILL_SPEC §6 for the out-of-sample reads taken before each tuning round). They are a REGRESSION GUARD,
 * not a quality claim about the real web. Set EF_BENCH_OUT to write a readable report.
 */
const corpora: [string, readonly (typeof CORPUS)[number][]][] = [["corpus", CORPUS], ["heldout", HELDOUT], ["blind", BLIND]];

describe("mapping benchmark: hand-labelled corpora (regression guard)", () => {
  const results = corpora.map(([name, c]) => [name, scoreSamples(c)] as [string, Metrics]);

  it("keeps the false-positive count at zero and never lets a secret through", () => {
    for (const [name, m] of results) {
      expect(m.falsePositive, `${name}: ${fmt(m)}\n${m.failures.filter((f) => f.verdict === "false_positive").map((f) => `${f.label} -> ${f.got} (expected ${f.expected})`).join("\n")}`).toBe(0);
      expect(m.secretLeaks, name).toBe(0);
    }
  });

  it("keeps a useful recall (a miss only leaves the field empty)", () => {
    for (const [name, m] of results) expect(m.recall, `${name}: ${fmt(m)}`).toBeGreaterThanOrEqual(0.95);
  });

  it("has enough labelled fields to mean something", () => {
    expect(CORPUS.length + HELDOUT.length + BLIND.length).toBeGreaterThan(350);
    // The corpora must keep a large share of traps (fields where the right answer is "leave it empty").
    const traps = [...CORPUS, ...HELDOUT, ...BLIND].filter((s) => s.t === "unknown").length;
    expect(traps).toBeGreaterThan(120);
  });

  if (process.env.EF_BENCH_OUT) {
    it("writes the report", () => {
      const lines = results.flatMap(([name, m]) => [`== ${name}: ${fmt(m)}`, ...m.failures.map((f) => `${f.verdict.padEnd(15)} ${JSON.stringify(f.label)} expected=${f.expected} got=${f.got}`)]);
      writeFileSync(process.env.EF_BENCH_OUT!, lines.join("\n"));
    });
  }
});

/** Truth for the fields of the fixture pages, labelled by hand from what the field MEANS for the user. Key: name, else html id. */
const FIXTURE_TRUTH: Partial<Record<FixtureName, Record<string, SemanticType>>> = {
  "form-basic": { first_name: "first_name", last_name: "last_name", middle: "unknown", dob: "date_of_birth", nickname: "unknown", email: "email", phone: "phone", age: "unknown", street: "address_line1", zip: "postal_code", city: "city", country: "country", status: "unknown", interest: "unknown", notes: "unknown", password: "password", otp: "one_time_code", ref: "unknown", disabled_field: "unknown", terms: "consent" },
  "form-fr": { civilite: "civility", nom: "last_name", prenom: "first_name", naissance: "date_of_birth", lieu_naissance: "place_of_birth", nationalite: "nationality", nom_origine: "unknown", adresse: "address_line1", code_postal: "postal_code", ville: "city", telephone: "phone", courriel: "email", situation: "marital_status", rgpd: "consent" },
  "form-combobox": { "city-input": "city", airport: "unknown", lang: "unknown", appointment: "unknown" },
  "form-iframe": { email: "email" },
  upload: { resume: "resume_file", photos: "unknown" },
  richtext: { editor: "cover_letter", summary: "unknown" },
  "trap-submit": { holder: "unknown", card: "card_number", cvc: "card_security_code" },
};

describe("mapping benchmark: fixture pages (every labelled field)", () => {
  it("classifies each fixture field as the truth says, with no false positive and no secret let through", () => {
    let n = 0;
    const wrong: string[] = [];
    for (const name of FIXTURES) {
      const truth = FIXTURE_TRUTH[name];
      if (!truth) continue; // shadow-* and multistep build their fields with scripts: covered by scan.test.ts
      const scan = scanForm(new JSDOM(readFixture(name)).window.document);
      for (const f of scan.fields) {
        const key = f.name ?? f.htmlId ?? "";
        const expected = truth[key];
        expect(expected, `${name}: field "${key}" has no hand-labelled truth: add it`).toBeDefined();
        n++;
        const verdict = judge(expected!, f.semantic.type, f.semantic.secret);
        if (verdict !== "exact") wrong.push(`${name}/${key}: expected ${expected}, got ${f.semantic.type} (${verdict})`);
      }
    }
    expect(n).toBeGreaterThan(40);
    expect(wrong).toEqual([]);
  });
});
