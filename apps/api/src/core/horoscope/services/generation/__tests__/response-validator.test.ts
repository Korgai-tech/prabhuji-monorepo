import { describe, expect, test } from "vitest";
import type { StepConfigRow } from "../../../repositories/horoscope.repository.js";
import { GENERATION_LOCALES } from "../../../types.js";
import { validateGeneratedResult } from "../response-validator.js";

/**
 * Unit coverage for FORMAT validation of a raw model response — shape only.
 *
 * Structured Outputs is supposed to make most of these impossible; these tests
 * pin the behaviour for when it does not, because the failure being guarded
 * against — a malformed payload silently stored as a day's content for every
 * sign — is invisible until users read it.
 *
 * The validator deliberately does NOT check language, length, punctuation or
 * markup: the prompt states those requirements and the model is trusted with
 * them. The tests below assert that non-interference as much as the shape
 * rules, so nobody reintroduces content rules here by accident.
 */

function step(overrides: Partial<StepConfigRow> = {}): StepConfigRow {
  return {
    stepId: "namaste",
    modeId: "daily_horoscope",
    title: "Namaste",
    localizedTitle: { en: "Namaste", hi: "नमस्ते" },
    order: 0,
    contentType: "text",
    providerMapping: "namaste",
    ttsEnabled: true,
    safetyCategory: "greeting",
    ...overrides,
  };
}

/** Sample copy per locale, so a locale returning to the tuple needs no fixture. */
const SAMPLE_TEXT: Record<string, string> = {
  en: "Today brings steady focus and a calm mind for finishing pending work well.",
  hi: "आज मन स्थिर रहेगा और अधूरे काम पूरे करने का अच्छा अवसर मिलेगा जरूर।",
  mr: "आज मन स्थिर राहील आणि अपूर्ण कामे पूर्ण करण्याची चांगली संधी मिळेल.",
  te: "ఈరోజు మనసు స్థిరంగా ఉంటుంది మరియు పెండింగ్ పనులు పూర్తి చేయడానికి మంచి అవకాశం.",
};

/** A well-formed localized value for exactly the generated locales. */
function localized(overrides: Partial<Record<string, string>> = {}) {
  return {
    ...Object.fromEntries(GENERATION_LOCALES.map((l) => [l, SAMPLE_TEXT[l]])),
    ...overrides,
  };
}

const TEXT_STEP = step();
const NUMBER_STEP = step({
  stepId: "lucky_number",
  providerMapping: "lucky_number",
  contentType: "number",
  order: 6,
});
const COLOR_STEP = step({
  stepId: "lucky_colour",
  providerMapping: "lucky_colour",
  contentType: "color",
  order: 7,
});

describe("validateGeneratedResult — well-formed payloads", () => {
  test("accepts a complete payload and keys sections by providerMapping", () => {
    const result = validateGeneratedResult(
      {
        namaste: localized(),
        lucky_number: 6,
        lucky_colour: { en: "green", hi: "हरा", mr: "हिरवा", te: "ఆకుపచ్చ" },
      },
      [TEXT_STEP, NUMBER_STEP, COLOR_STEP]
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Keyed by providerMapping, NOT stepId — that indirection is the whole
    // point of the column.
    expect([...result.sections.keys()]).toEqual([
      "namaste",
      "lucky_number",
      "lucky_colour",
    ]);
    expect(result.sections.get("lucky_number")).toEqual({
      kind: "number",
      value: 6,
    });
  });

  test("providerMapping that differs from stepId is what the model answers under", () => {
    const goodTime = step({
      stepId: "good_time",
      providerMapping: "good_time_today",
    });
    const result = validateGeneratedResult(
      { good_time_today: localized() },
      [goodTime]
    );
    expect(result.ok).toBe(true);
  });

  test("content is not policed — length, script, punctuation and markup pass", () => {
    // Each of these was previously a rejection. They are accepted now BY
    // DESIGN: the prompt asks for the right language, length and punctuation,
    // and re-checking it here only bought regenerations.
    const cases: Record<string, string> = {
      short: "Short.",
      veryLong: "word ".repeat(80).trim(),
      emDash: "Today is calm — stay steady and finish what you started.",
      markdown: "**Focus** today on what is already begun.",
      wrongScript: "Aaj mann sthir rahega aur kaam poore honge.",
    };
    for (const [label, text] of Object.entries(cases)) {
      const result = validateGeneratedResult(
        { namaste: localized({ en: text }) },
        [TEXT_STEP]
      );
      expect(result.ok, `expected ${label} to be accepted`).toBe(true);
    }
  });

  test("Hindi text in the Marathi slot is accepted — language is the prompt's job", () => {
    const result = validateGeneratedResult(
      { namaste: localized({ mr: localized().hi }) },
      [TEXT_STEP]
    );
    expect(result.ok).toBe(true);
  });
});

describe("validateGeneratedResult — malformed payloads are rejected", () => {
  test("a non-object response", () => {
    expect(validateGeneratedResult("not json", [TEXT_STEP])).toMatchObject({
      ok: false,
    });
  });

  test("an unexpected key", () => {
    const result = validateGeneratedResult(
      { namaste: localized(), surprise: "extra" },
      [TEXT_STEP]
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain("surprise");
  });

  test("a missing key", () => {
    const result = validateGeneratedResult({}, [TEXT_STEP]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain("namaste");
  });

  test("a missing locale within a section", () => {
    // Drops whichever locale the pipeline currently generates, so the test
    // keeps testing the rule rather than a locale that is no longer required.
    const [locale] = GENERATION_LOCALES;
    const partial = localized();
    delete (partial as Record<string, unknown>)[locale];
    const result = validateGeneratedResult({ namaste: partial }, [TEXT_STEP]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain(`namaste.${locale}`);
  });

  test("an empty string value", () => {
    const result = validateGeneratedResult(
      { namaste: localized({ hi: "   " }) },
      [TEXT_STEP]
    );
    expect(result.ok).toBe(false);
  });

  test("lucky_number as a quoted string", () => {
    const result = validateGeneratedResult({ lucky_number: "6" }, [NUMBER_STEP]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain("integer");
  });

  test("lucky_number out of the 1-99 range", () => {
    expect(validateGeneratedResult({ lucky_number: 0 }, [NUMBER_STEP]).ok).toBe(
      false
    );
    expect(
      validateGeneratedResult({ lucky_number: 100 }, [NUMBER_STEP]).ok
    ).toBe(false);
  });
});
