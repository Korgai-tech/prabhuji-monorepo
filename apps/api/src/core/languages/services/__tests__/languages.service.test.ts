import { describe, expect, test } from "vitest";
import {
  DEFAULT_LANGUAGE_CODE,
  ENABLED_LANGUAGES,
  LanguageCodeSchema,
  SUPPORTED_LANGUAGES,
} from "@api/shared/language.schema";
import { LanguagesService } from "@api/core/languages/services";

const service = new LanguagesService();

describe("LanguagesService", () => {
  test("serves the ENABLED languages, in the constant's display order", () => {
    const { languages } = service.list();
    expect(languages.map((l) => l.code)).toEqual(
      ENABLED_LANGUAGES.map((l) => l.code)
    );
  });

  test("every entry carries a non-empty native + English label", () => {
    for (const l of service.list().languages) {
      expect(l.nativeLabel.length).toBeGreaterThan(0);
      expect(l.englishLabel.length).toBeGreaterThan(0);
    }
  });

  test("a disabled language is never offered to a new user", () => {
    const disabled = SUPPORTED_LANGUAGES.filter((l) => !l.enabled).map(
      (l) => l.code
    );
    const served = service.list().languages.map((l) => l.code);
    for (const code of disabled) {
      expect(served).not.toContain(code);
    }
  });

  /**
   * GRANDFATHERING — the reason `enabled` filters the SERVED list and not the
   * accepted one. Disabling hides a language from the picker; users already on
   * it keep a valid `selectedLanguage`, so `PATCH /users/me` still works for
   * them and their content keeps localizing. The invariant is
   * `served ⊆ accepted`, never `served === accepted`.
   */
  test("disabling hides a language WITHOUT making it un-writable", () => {
    const served = service.list().languages.map((l) => l.code);
    const accepted: readonly string[] = LanguageCodeSchema.options;

    for (const code of served) {
      expect(accepted).toContain(code);
    }
    for (const l of SUPPORTED_LANGUAGES) {
      expect(
        LanguageCodeSchema.safeParse(l.code).success,
        `${l.code} must stay writable even when disabled`
      ).toBe(true);
    }
  });

  /**
   * The guard that makes the flag safe to flip. Disabling the default would
   * otherwise serve a `defaultCode` the picker does not contain — this fails
   * `pnpm verify` before such a change can ship.
   */
  test("the configured default language is enabled", () => {
    expect(ENABLED_LANGUAGES.map((l) => l.code)).toContain(
      DEFAULT_LANGUAGE_CODE
    );
  });

  test("at least one language is enabled", () => {
    expect(ENABLED_LANGUAGES.length).toBeGreaterThan(0);
  });

  test("defaultCode is always present in the served list", () => {
    const { languages, defaultCode } = service.list();
    expect(defaultCode).toBe(DEFAULT_LANGUAGE_CODE);
    expect(languages.map((l) => l.code)).toContain(defaultCode);
  });
});
