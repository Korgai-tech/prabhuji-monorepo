import { describe, expect, test } from "vitest";
import type { StepConfigRow } from "../../../repositories/horoscope.repository.js";
import { GENERATION_LOCALES } from "../../../types.js";
import { buildResultSchema, buildSystemPrompt, buildUserPrompt } from "../prompt.js";

/**
 * Unit coverage for the prompt + runtime schema builder.
 *
 * The property under test throughout is that NOTHING here is hardcoded to the
 * eight seeded steps: the schema and the section rules are derived from the
 * step-config rows, so the CMS keeps its "steps are data, not code" guarantee
 * (PRD §6.5) across the generation path too.
 */

function step(overrides: Partial<StepConfigRow> = {}): StepConfigRow {
  return {
    stepId: "namaste",
    modeId: "daily_horoscope",
    title: "Namaste",
    localizedTitle: { en: "Namaste" },
    order: 0,
    contentType: "text",
    providerMapping: "namaste",
    ttsEnabled: true,
    safetyCategory: "greeting",
    ...overrides,
  };
}

interface SchemaShape {
  type: string;
  additionalProperties: boolean;
  required: string[];
  properties: Record<string, { type?: string; required?: string[] }>;
}

describe("buildResultSchema", () => {
  test("derives properties from providerMapping, not stepId", () => {
    const schema = buildResultSchema([
      step({ stepId: "good_time", providerMapping: "good_time_today" }),
      step({ stepId: "work_money", providerMapping: "work_and_money" }),
    ]) as unknown as SchemaShape;

    expect(Object.keys(schema.properties)).toEqual([
      "good_time_today",
      "work_and_money",
    ]);
    expect(schema.required).toEqual(["good_time_today", "work_and_money"]);
  });

  test("a `number` step is a bare integer, not a locale map", () => {
    const schema = buildResultSchema([
      step({ providerMapping: "lucky_number", contentType: "number" }),
    ]) as unknown as SchemaShape;

    expect(schema.properties.lucky_number).toMatchObject({
      type: "integer",
      minimum: 1,
      maximum: 99,
    });
  });

  test("`text` and `color` steps require every generated locale", () => {
    const schema = buildResultSchema([
      step(),
      step({ providerMapping: "lucky_colour", contentType: "color" }),
    ]) as unknown as SchemaShape;

    // Reads the tuple rather than restating it: the schema must ask for exactly
    // what the pipeline stores, and both sides moving together is the property.
    for (const key of ["namaste", "lucky_colour"]) {
      expect(schema.properties[key]?.type).toBe("object");
      expect(schema.properties[key]?.required).toEqual([...GENERATION_LOCALES]);
    }
  });

  test("strict-mode invariants hold at every level", () => {
    // `strict: true` REJECTS a schema that omits either — the provider errors
    // rather than relaxing, so getting this wrong breaks every generation.
    const schema = buildResultSchema([step()]) as unknown as SchemaShape;
    expect(schema.additionalProperties).toBe(false);
    expect(schema.required).toEqual(Object.keys(schema.properties));

    const localized = schema.properties.namaste as unknown as SchemaShape;
    expect(localized.additionalProperties).toBe(false);
    expect(localized.required).toEqual(Object.keys(localized.properties));
  });

  test("a CMS-added step appears in the schema with no code change", () => {
    const schema = buildResultSchema([
      step(),
      step({ stepId: "moon_phase", providerMapping: "moon_phase" }),
    ]) as unknown as SchemaShape;
    expect(schema.properties.moon_phase).toBeDefined();
  });
});

describe("buildSystemPrompt", () => {
  const LOCALE_NAMES: Record<string, string> = {
    en: "English",
    hi: "Hindi",
    mr: "Marathi",
    te: "Telugu",
  };

  test("names every generated language", () => {
    const prompt = buildSystemPrompt([step()]);
    for (const locale of GENERATION_LOCALES) {
      expect(prompt).toContain(LOCALE_NAMES[locale]);
    }
  });

  test("asks for ONLY the generated languages", () => {
    // The point of the Hindi-only narrowing: a language absent from the tuple
    // has no key in the schema, so asking for it can only produce output the
    // validator then rejects. Asserted on the LANGUAGES line specifically —
    // "English" legitimately appears further down, in the rule that keeps the
    // JSON keys untranslated.
    const line = buildSystemPrompt([step()])
      .split("\n")
      .find((l) => l.startsWith("- Produce every text value"));

    expect(line).toBeDefined();
    for (const [code, name] of Object.entries(LOCALE_NAMES)) {
      const generated = (GENERATION_LOCALES as readonly string[]).includes(code);
      expect(line?.includes(name)).toBe(generated);
    }
  });

  test("the Hindi-vs-Marathi warning appears only when BOTH are generated", () => {
    // The instruction does real work when both ship — they share Devanagari and
    // no script check can tell Hindi returned as Marathi apart. With Marathi
    // dropped it is an instruction about a key that does not exist.
    const prompt = buildSystemPrompt([step()]);
    const locales = GENERATION_LOCALES as readonly string[];
    const both = locales.includes("hi") && locales.includes("mr");
    expect(prompt.includes("Hindi and Marathi both use Devanagari")).toBe(both);
  });

  test("emits a rule line per step, keyed by providerMapping", () => {
    const prompt = buildSystemPrompt([
      step({ stepId: "good_time", providerMapping: "good_time_today" }),
      step({ providerMapping: "lucky_number", contentType: "number" }),
    ]);
    expect(prompt).toContain("good_time_today");
    expect(prompt).toContain("lucky_number");
    expect(prompt).toContain("NOT localized");
  });

  test("an unknown step still gets a usable generic rule", () => {
    const prompt = buildSystemPrompt([
      step({ stepId: "moon_phase", providerMapping: "moon_phase" }),
    ]);
    expect(prompt).toContain("moon_phase");
  });

  test("carries the PRD's safety prohibitions", () => {
    const prompt = buildSystemPrompt([step()]);
    for (const rule of ["guarantees", "fear", "gambling", "disaster"]) {
      expect(prompt.toLowerCase()).toContain(rule);
    }
  });
});

describe("buildUserPrompt", () => {
  test("pins the date and tells the model not to use its own", () => {
    const prompt = buildUserPrompt({
      zodiacDisplayName: "Taurus",
      dateIst: "2026-07-22",
    });
    expect(prompt).toContain("Taurus");
    expect(prompt).toContain("2026-07-22");
    expect(prompt).toContain("do not rely on your own notion of the current date");
  });

  test("supplies the seeded sign name for each generated locale", () => {
    // Left to translate the sign itself, the model named the WRONG sign —
    // a Taurus reading greeting the user as मिथुन (Gemini).
    const prompt = buildUserPrompt({
      zodiacDisplayName: "Taurus",
      localizedZodiacNames: { en: "Taurus", hi: "वृषभ", mr: "वृषभ", te: "వృషభం" },
      dateIst: "2026-07-22",
    });

    expect(prompt).toContain("Do not translate the sign name yourself");
    for (const locale of GENERATION_LOCALES) {
      expect(prompt).toContain(`- ${locale}: `);
    }
  });

  test("omits the block entirely when no localized name is seeded", () => {
    // A sign with no translations must not emit an empty instruction block —
    // the model reads a heading with nothing under it as a contradiction.
    const prompt = buildUserPrompt({
      zodiacDisplayName: "Taurus",
      localizedZodiacNames: {},
      dateIst: "2026-07-22",
    });
    expect(prompt).not.toContain("Do not translate the sign name yourself");
  });
});
