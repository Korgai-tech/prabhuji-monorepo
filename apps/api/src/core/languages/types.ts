import type { LanguageCode } from "@api/shared/language.schema";

/** One selectable content language, as served to clients. */
export interface LanguageOption {
  code: LanguageCode;
  /** The language's own name, e.g. `हिंदी` — what the onboarding grid renders. */
  nativeLabel: string;
  /** The English exonym, e.g. `Hindi` — for admin/debug surfaces. */
  englishLabel: string;
}

/** `GET /languages` payload. */
export interface LanguageCatalog {
  languages: LanguageOption[];
  /** The code a client should pre-select when the user has not chosen one. */
  defaultCode: LanguageCode;
}
