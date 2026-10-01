import type { StepConfigRow } from "@api/core/horoscope/repositories";
import {
  GENERATION_LOCALES,
  type GenerationLocale,
} from "@api/core/horoscope/types";

/**
 * The daily-horoscope prompt + its runtime JSON Schema.
 *
 * ## One call per sign, all locales at once
 *
 * The source spec describes one call per `(sign, language)` returning flat
 * single-language JSON. We group by SIGN instead: one call returns every
 * section in every locale. That cuts 12x4 calls to 12, and — the reason that
 * actually matters — it makes the four locales of a section *translations of
 * one another* rather than four independent generations that can disagree about
 * what today is like for Taurus.
 *
 * ## The schema is built from the step config, not hardcoded
 *
 * `buildResultSchema` reads the ENABLED step catalogue and derives the schema
 * from each row's `providerMapping` (the key the model answers under) and
 * `contentType` (the value shape). This preserves the module's "steps are data,
 * not code" property (PRD §6.5): add, rename, reorder or disable a step in the
 * CMS and the next generation follows it with no release. Nothing here knows
 * that there are eight steps or what they are called.
 *
 * The spec's multilingual zodiac-input normalization is deliberately absent:
 * generation only ever runs from the canonical `ZODIAC_SLUGS`, so free-text sign
 * input never reaches the model and no alias table is needed.
 */

/** `contentType: "number"` answers with a bare integer, not a locale map. */
const NUMBER_SCHEMA = {
  type: "integer",
  minimum: 1,
  maximum: 99,
} as const;

/**
 * Build the Structured-Outputs schema for one sign's generation.
 *
 * Every object carries `additionalProperties: false` and lists every property
 * in `required` — both are hard requirements of `strict: true` mode, and a
 * schema that omits either is rejected by the provider rather than silently
 * relaxed.
 */
export function buildResultSchema(
  steps: StepConfigRow[]
): Record<string, unknown> {
  const localized = {
    type: "object",
    additionalProperties: false,
    required: [...GENERATION_LOCALES],
    properties: Object.fromEntries(
      GENERATION_LOCALES.map((l) => [l, { type: "string" }])
    ),
  };

  const properties: Record<string, unknown> = {};
  for (const step of steps) {
    properties[step.providerMapping] =
      step.contentType === "number" ? NUMBER_SCHEMA : localized;
  }

  return {
    type: "object",
    additionalProperties: false,
    required: steps.map((s) => s.providerMapping),
    properties,
  };
}

/**
 * The system prompt — the spec's Master Prompt, with the LANGUAGE and OUTPUT
 * FORMAT blocks adapted to the all-locales-at-once response shape, and the
 * per-section rules generated from the step catalogue rather than hardcoded.
 */
export function buildSystemPrompt(steps: StepConfigRow[]): string {
  const localeList = GENERATION_LOCALES.map(
    (l) => `${l} (${LOCALE_NAMES[l]})`
  ).join(", ");

  return `You are the daily astrologer for Prabhuji, an Indian devotional app for Indian users.

Generate all daily horoscope sections for the supplied zodiac sign and date. Return every user-facing value in ALL of the requested languages.

LANGUAGES
- Produce every text value in each of these languages: ${localeList}.
- Each section is an object keyed by language code. The value for a language must be written in that language.
- Use the natural script, vocabulary, grammar, punctuation, and respectful speaking style of each language.
${crossLanguageRules()}- Keep the language simple enough for mass-market Indian users and text-to-speech.
- Do not mix English into a non-English value unless a word is commonly used that way by speakers of that language.
- Keep the JSON keys in English exactly as specified. Never translate the keys.

VOICE AND TONE
- Write like a warm, experienced human astrologer.
- Sound calm, helpful, positive, practical, and culturally familiar.
- Treat astrology as daily guidance, not as a guaranteed prediction.
- Avoid jargon, poetic riddles, corporate language, repetitive templates, and robotic phrasing.
- Make the sections feel consistent with one another for the same sign and date.
- Vary ideas and sentence openings across zodiac signs and dates.

SECTION RULES
${steps.map(sectionRule).join("\n")}

SAFETY
- Do not make medical, legal, relationship, career, or financial guarantees.
- Do not use fear, panic, threats, curses, or unavoidable claims.
- Do not recommend gambling, betting, loans, investments, expensive rituals, gemstones, paid pujas, fasting, or extreme behaviour.
- Do not claim that planets, gods, or rituals guarantee a result.
- Do not say that a bad event will happen.
- Do not predict accidents, loss, illness, betrayal, death, or disaster.

OUTPUT FORMAT
- Return exactly one valid JSON object matching the supplied schema.
- Do not translate, rename, omit, or add keys.
- Do not include Markdown, code fences, comments, labels, explanations, or text outside the JSON object.
- Do not include newline characters inside string values.
- Do not use em dashes or en dashes in any value.

QUALITY CHECK BEFORE ANSWERING
Silently confirm that the zodiac sign was interpreted correctly, every value uses its own language and script, every key is present exactly once, numeric values are integers, one-word values are single words, the JSON parses successfully, and all content follows the safety and length rules.`;
}

/**
 * The per-request inputs. The backend supplies the canonical sign — never user
 * text.
 *
 * `localizedZodiacNames` are the CMS-seeded sign labels. They are supplied
 * because asking the model to translate the sign name itself was observed to
 * produce the WRONG SIGN — a Taurus reading that greeted the user as मिथुन
 * (Gemini). The names are already stored, correct and native-reviewed; a
 * generated reading naming the wrong sign is the one content error a user
 * cannot fail to notice. Only the generated locales are listed, so this stays a
 * few tokens rather than a table of every language in the database.
 */
export function buildUserPrompt(params: {
  zodiacDisplayName: string;
  localizedZodiacNames?: Record<string, string>;
  dateIst: string;
}): string {
  const named = GENERATION_LOCALES.map((l) => [l, params.localizedZodiacNames?.[l]] as const)
    .filter((entry): entry is readonly [GenerationLocale, string] => Boolean(entry[1]))
    .map(([l, name]) => `- ${l}: ${name}`);

  const namesBlock = named.length
    ? `\nUse EXACTLY these names for the sign in each language. Do not translate the sign name yourself:\n${named.join("\n")}\n`
    : "";

  return `INPUT
Zodiac sign: ${params.zodiacDisplayName}
Date in IST: ${params.dateIst}
${namesBlock}
Generate today's reading for this sign. Use this date as the day being described; do not rely on your own notion of the current date.`;
}

/**
 * One section's rule line, derived from its config row. `contentType` picks the
 * shape rule and the word band, so a CMS-added step gets a sensible instruction
 * without anyone editing this file.
 */
function sectionRule(step: StepConfigRow): string {
  const key = step.providerMapping;
  switch (step.contentType) {
    case "number":
      return `- ${key}: Return one integer from 1 to 99. This value is NOT localized — return a single number, not an object.`;
    case "color":
      return `- ${key}: Return one common colour name in each language. It must be ONE word in the natural writing system of that language.`;
    case "text":
    default:
      return `- ${key} ("${step.title}"): ${SECTION_GUIDANCE[key] ?? "Warm, practical daily guidance for this section."} Keep each language version to roughly 16 to 32 words.`;
  }
}

/**
 * The script/disambiguation rules that only mean something when more than one
 * locale is generated. `GENERATION_LOCALES` is Hindi-only today, and telling a
 * single-language generation "write genuine Marathi, not Hindi" or "the four
 * versions must express the same guidance" is instruction the model has to
 * reconcile against a schema that has no such keys — noise at best, and at worst
 * an invitation to emit a language nobody asked for.
 *
 * Each line is emitted only when the locales it talks about are actually being
 * generated, so restoring `mr`/`te`/`en` to the tuple restores its rule with it.
 */
function crossLanguageRules(): string {
  const locales = new Set<string>(GENERATION_LOCALES);
  if (locales.size < 2) return "";

  const lines: string[] = [];
  if (locales.has("hi") && locales.has("mr")) {
    lines.push(
      "- Hindi and Marathi both use Devanagari but are DIFFERENT languages. Write genuine Marathi, not Hindi with Marathi spelling."
    );
  }
  if (locales.has("te")) {
    lines.push("- Telugu must use Telugu script.");
  }
  if (locales.has("en")) {
    lines.push("- English must use Latin script.");
  }
  lines.push(
    `- The ${locales.size} language versions of a section must express the SAME guidance, not ${locales.size} unrelated readings.`
  );
  return `${lines.join("\n")}\n`;
}

/** Human-readable language names — the model writes better with the name than the code. */
const LOCALE_NAMES: Record<string, string> = {
  en: "English",
  hi: "Hindi",
  mr: "Marathi",
  te: "Telugu",
};

/**
 * Per-section guidance from the spec, keyed by `providerMapping`. A step whose
 * mapping is not listed still generates — it falls back to the generic line in
 * `sectionRule` — so adding a step in the CMS never breaks generation, it just
 * produces less specific copy until someone adds a line here.
 */
const SECTION_GUIDANCE: Record<string, string> = {
  namaste:
    "A friendly daily overview. Mention the natural localized zodiac name once.",
  good_time_today:
    "Suggest a useful time of day or suitable activity. Do not invent an exact minute; general periods such as morning, late morning, afternoon and evening are allowed.",
  be_careful:
    "One calm, practical caution. Do not predict accidents, loss, illness, betrayal, death or disaster.",
  work_and_money:
    "Balanced guidance about work, business, money, planning, spending or communication. Never promise profit, promotion, a job, investment returns or financial success.",
  health_care:
    "Ordinary wellbeing habits only. Do not diagnose, recommend medicine or treatment, promise a cure, or tell the user to ignore professional care.",
  todays_solution:
    "One simple devotional or reflective action — a short prayer, mantra, diya, flowers, gratitude, charity or quiet reflection. Keep it free or inexpensive. Never say harm will occur if it is not performed.",
};
