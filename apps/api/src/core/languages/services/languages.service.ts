import {
  DEFAULT_LANGUAGE_CODE,
  ENABLED_LANGUAGES,
  SUPPORTED_LANGUAGES,
} from "@api/shared/language.schema";
import { createModuleLogger } from "@api/shared/logs";
import type { LanguageCatalog } from "@api/core/languages/types";

const log = createModuleLogger("languages:service");

/**
 * The supported-language catalogue (`GET /languages`).
 *
 * No repository: the catalogue IS `SUPPORTED_LANGUAGES` — the same constant
 * `LanguageCodeSchema` is derived from, and therefore the same constant every
 * write path validates against. That is deliberate and mirrors the mantras
 * counter-preference (`mantras.service.ts` `toCounterPreference`): the
 * server-owned option list and the accepted set are one thing, so they cannot
 * drift and no client ever hardcodes the options.
 *
 * Before this endpoint existed the mobile app had NO runtime knowledge of the
 * supported set — it shipped a compile-time `kSupportedLanguages` const, so a
 * language added to the API stayed invisible until the next release, and a
 * language added to the app was rejected by `PATCH /users/me`.
 */
export class LanguagesService {
  /**
   * The SELECTABLE languages, in display order, plus the pre-selection.
   *
   * Only `enabled` rows are served — a disabled language disappears from the
   * picker but stays valid for the users already on it (see
   * `shared/language.schema.ts`). Nothing here narrows what the WRITE path
   * accepts; grandfathering is the whole point.
   */
  list(): LanguageCatalog {
    return {
      languages: ENABLED_LANGUAGES.map((l) => ({
        code: l.code,
        nativeLabel: l.nativeLabel,
        englishLabel: l.englishLabel,
      })),
      defaultCode: this.resolveDefaultCode(),
    };
  }

  /**
   * The code a client pre-selects. Normally `DEFAULT_LANGUAGE_CODE`, but if that
   * language has been disabled we fall back to the first enabled one rather than
   * serve a `defaultCode` the picker itself does not contain.
   *
   * A unit test asserts the configured default is enabled, so this fallback
   * should never fire in practice — it exists so a misconfiguration degrades
   * instead of shipping a catalogue whose default is missing from its own list.
   */
  private resolveDefaultCode(): LanguageCatalog["defaultCode"] {
    const defaultIsEnabled = ENABLED_LANGUAGES.some(
      (l) => l.code === DEFAULT_LANGUAGE_CODE
    );
    if (defaultIsEnabled) return DEFAULT_LANGUAGE_CODE;

    const fallback = ENABLED_LANGUAGES[0]?.code;
    if (fallback) {
      log.warn(
        {
          event: "languages_default_disabled",
          configured_default: DEFAULT_LANGUAGE_CODE,
          served_default: fallback,
        },
        "DEFAULT_LANGUAGE_CODE is disabled — serving the first enabled language"
      );
      return fallback;
    }

    // Everything disabled: there is no selectable catalogue at all. Serve the
    // configured default so clients still get a usable code, and shout.
    log.error(
      { event: "languages_none_enabled" },
      "every language is disabled — GET /languages has no selectable options"
    );
    return SUPPORTED_LANGUAGES[0].code;
  }
}
