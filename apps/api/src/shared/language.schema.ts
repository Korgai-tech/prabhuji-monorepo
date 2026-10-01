import { z } from "zod";

/**
 * Phase-1 supported UI languages (PRD §6.5 /
 * `screen-spec.yaml.language_behavior.phase_1_languages`).
 *
 * THE list. Adding a language = adding a row to `SUPPORTED_LANGUAGES` below —
 * `LanguageCodeSchema` is DERIVED from it, so the accepted code set and the
 * served option list can never disagree. Do NOT duplicate the list per module,
 * per app, or per client.
 *
 * Two consumers, and only two, hold a copy of anything language-shaped:
 *   1. this file — served to mobile over `GET /languages` (`core/languages`), so
 *      the app hardcodes NOTHING and picks up a new language with no release;
 *   2. `apps/admin/src/lib/languages.ts` — English labels only, keyed by a
 *      `Record<LanguageCode, string>` derived from the emitted contract, so a
 *      code added here fails the admin typecheck until its label is added.
 *
 * Codes are ISO 639-1 two-letter language codes. The native labels are the
 * strings the onboarding language grid renders and are part of the public
 * contract — treat them as user-facing copy, not incidental data.
 *
 * ## `enabled` — the backend-only on/off switch
 *
 * `enabled: false` HIDES a language from the picker (`GET /languages` omits it,
 * so no NEW user can choose it). It deliberately does NOT remove the code from
 * `LanguageCodeSchema`, because users who already picked it are GRANDFATHERED:
 *
 *   - their stored `selectedLanguage` stays valid, so `PATCH /users/me` keeps
 *     working (they can still edit their name without eating a 400);
 *   - their content keeps localizing — the read paths take a tolerant free
 *     string, and the translation rows are still in the database.
 *
 * So disabling is a *merchandising* decision, not a data migration: it stops the
 * bleeding without breaking anyone mid-flight. To retire a language for real,
 * disable it first, let the population drain, then delete the row.
 *
 * Flipping this flag is a code change + API deploy; nothing in the app or the
 * admin CMS needs to ship.
 */
export const SUPPORTED_LANGUAGES = [
  { code: "hi", nativeLabel: "हिंदी", englishLabel: "Hindi", enabled: true },
  { code: "mr", nativeLabel: "मराठी", englishLabel: "Marathi", enabled: true },
  { code: "gu", nativeLabel: "ગુજરાતી", englishLabel: "Gujarati", enabled: true },
  { code: "bn", nativeLabel: "বাংলা", englishLabel: "Bengali", enabled: true },
  { code: "or", nativeLabel: "ଓଡ଼ିଆ", englishLabel: "Odia", enabled: true },
  { code: "ta", nativeLabel: "தமிழ்", englishLabel: "Tamil", enabled: true },
  { code: "te", nativeLabel: "తెలుగు", englishLabel: "Telugu", enabled: true },
  { code: "kn", nativeLabel: "ಕನ್ನಡ", englishLabel: "Kannada", enabled: true },
] as const;

/**
 * The onboarding default when the user has not chosen a language yet. Served as
 * `defaultCode` on `GET /languages` so the app stops hardcoding `hi`.
 *
 * MUST name an ENABLED language — `languages.service.test.ts` asserts it, so
 * disabling the default fails `pnpm verify` before it can ship.
 */
export const DEFAULT_LANGUAGE_CODE = "hi";

/**
 * EVERY code, enabled or not — the ACCEPTED set.
 *
 * `LanguageCodeSchema` is built from this rather than from the enabled subset on
 * purpose: a disabled language must stay writable for the users already on it
 * (see the `enabled` note above). It is also what keeps the admin CMS able to
 * author translations for a disabled language.
 */
export const LANGUAGE_CODES = SUPPORTED_LANGUAGES.map((l) => l.code);

/**
 * The SELECTABLE subset, in display order — what `GET /languages` serves and
 * therefore the only languages a new user can pick.
 */
export const ENABLED_LANGUAGES = SUPPORTED_LANGUAGES.filter((l) => l.enabled);

export const LanguageCodeSchema = z
  .enum(LANGUAGE_CODES as unknown as [LanguageCode, ...LanguageCode[]])
  .meta({ id: "LanguageCode" });

export type LanguageCode = (typeof SUPPORTED_LANGUAGES)[number]["code"];
