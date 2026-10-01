import type { StepConfigRow } from "@api/core/horoscope/repositories";
import {
  GENERATION_LOCALES,
  type GenerationLocale,
} from "@api/core/horoscope/types";

/**
 * FORMAT validation of a raw model response — shape only.
 *
 * This answers exactly one question: did we get back the structure we asked
 * for, so it can be mapped onto stored steps without crashing or writing
 * garbage columns? Keys, types, and non-emptiness. Nothing else.
 *
 * It deliberately does NOT judge the content. No language detection, no word
 * counts, no punctuation or markup rules — the prompt states those
 * requirements and the model is trusted to follow them. Checking them here
 * bought rejections and regenerations, not correctness.
 *
 * Structured Outputs with `strict: true` already makes most of these failures
 * impossible at the provider. This is the assertion that the guarantee held,
 * because the failure it catches — a drifted payload stored as a day's content
 * for every sign — is invisible until users read it.
 *
 * Content SAFETY is a separate concern and still enforced, by
 * `content-safety.ts` on both the generation and the serve path.
 */

/** One validated section, keyed in the result by its `providerMapping`. */
export type GeneratedSection =
  | { kind: "localized"; values: Record<GenerationLocale, string> }
  | { kind: "number"; value: number };

export interface ValidationOk {
  ok: true;
  sections: Map<string, GeneratedSection>;
}

export interface ValidationFailure {
  ok: false;
  reason: string;
}

export type ValidationResult = ValidationOk | ValidationFailure;

export function validateGeneratedResult(
  raw: unknown,
  steps: StepConfigRow[]
): ValidationResult {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, reason: "response was not a JSON object" };
  }
  const obj = raw as Record<string, unknown>;

  const expected = new Set(steps.map((s) => s.providerMapping));
  for (const key of Object.keys(obj)) {
    if (!expected.has(key)) {
      return { ok: false, reason: `unexpected key "${key}" in response` };
    }
  }

  const sections = new Map<string, GeneratedSection>();

  for (const step of steps) {
    const key = step.providerMapping;
    const value = obj[key];
    if (value === undefined) {
      return { ok: false, reason: `missing key "${key}"` };
    }

    if (step.contentType === "number") {
      if (typeof value !== "number" || !Number.isInteger(value)) {
        return {
          ok: false,
          reason: `"${key}" must be a JSON integer, got ${typeof value}`,
        };
      }
      if (value < 1 || value > 99) {
        return { ok: false, reason: `"${key}" must be between 1 and 99` };
      }
      sections.set(key, { kind: "number", value });
      continue;
    }

    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      return { ok: false, reason: `"${key}" must be an object of locale values` };
    }
    const byLocale = value as Record<string, unknown>;

    const values = {} as Record<GenerationLocale, string>;
    for (const locale of GENERATION_LOCALES) {
      const text = byLocale[locale];
      if (typeof text !== "string" || text.trim() === "") {
        return { ok: false, reason: `"${key}.${locale}" is missing or empty` };
      }
      values[locale] = text.trim();
    }
    sections.set(key, { kind: "localized", values });
  }

  return { ok: true, sections };
}
