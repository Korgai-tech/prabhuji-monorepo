import { z } from "zod";
import { LanguageCodeSchema } from "@api/shared/language.schema";

/**
 * Zod schemas for `GET /languages` — the single source of truth for the OpenAPI
 * contract emitted by `pnpm nx run api:openapi` and the generated TS + Dart
 * clients.
 *
 * `code` is `LanguageCodeSchema` (not a bare string) on purpose: it makes the
 * emitted contract carry the exact union, which is what lets
 * `apps/admin/src/lib/languages.ts` derive its `Record<LanguageCode, string>`
 * from the generated types and fail `tsc` the moment a ninth language is added
 * here without an admin label.
 */

// ---- response components ---------------------------------------------------

export const LanguageOptionView = z
  .object({
    code: LanguageCodeSchema,
    /** The language's own name, e.g. `हिंदी` — what the client renders. */
    nativeLabel: z.string(),
    /** The English exonym, e.g. `Hindi`. */
    englishLabel: z.string(),
  })
  .meta({ id: "LanguageOptionView" });

export const LanguageCatalogResponse = z
  .object({
    success: z.literal(true),
    message: z.string(),
    data: z.object({
      /** Every selectable language, in display order. */
      languages: z.array(LanguageOptionView),
      /** Pre-select this when the user has not chosen a language yet. */
      defaultCode: LanguageCodeSchema,
    }),
  })
  .meta({ id: "LanguageCatalogResponse" });

export const ErrorEnvelope = z
  .object({
    success: z.literal(false),
    message: z.string(),
    data: z.null(),
    errorCode: z.string().optional(),
  })
  .meta({ id: "LanguagesErrorEnvelope" });
