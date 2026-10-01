import { z } from "zod";
import { LanguageCodeSchema } from "@api/shared/language.schema";
import { LABEL_FALLBACK_LOCALE } from "@api/shared/i18n";

/**
 * TAM-108 — the reusable admin translations sub-resource Zod shape, lifted from
 * the deity exemplar (`deity.admin.schemas.ts`) so the eight per-module label
 * tickets (TAM-109…113) build their `/admin/<mod>/<entity>/:id/translations`
 * surface from ONE shape instead of copy-pasting it (design §4).
 *
 * A module ticket supplies only its localized-field Zod shape (a `ZodRawShape`,
 * e.g. `{ title: z.string().trim().min(1).max(200) }`) and gets the standard
 * `locale`-keyed, `.strict()` bodies + the `(id, locale)` params for free. Each
 * module `.meta({ id: "…" })`-tags the returned schemas itself (the OpenAPI
 * component id must be unique per module) — the builders return un-tagged
 * schemas deliberately.
 */

/**
 * Admin-writable translation locales: the eight Phase-1 client languages plus
 * the `en` label fallback (`LABEL_FALLBACK_LOCALE`). Reuses `LanguageCodeSchema`
 * as the single source of truth so an editor can never write a translation in a
 * locale no client can request. Semantically identical to the deity module's
 * `adminLocale`; a distinct component id keeps both in the OpenAPI doc.
 */
export const adminLocale = z
  .enum([LABEL_FALLBACK_LOCALE, ...LanguageCodeSchema.options])
  .meta({ id: "AdminLocale" });

/** `…/:id/translations/:locale` path params (locale constrained to `adminLocale`). */
export const adminTranslationParams = z.object({
  id: z.uuid(),
  locale: adminLocale,
});
export type AdminTranslationParamsInput = z.infer<typeof adminTranslationParams>;

/**
 * `{ locale, ...fields }` — one per-locale override, WITHOUT `.strict()`. Use as
 * the element of a create body's optional `translations: [...]` seed array (the
 * shape `AdminDeityCreateBody.translations` uses).
 */
export function translationInput<Fields extends z.ZodRawShape>(fields: Fields) {
  return z.object({ locale: adminLocale, ...fields });
}

/**
 * `POST …/:id/translations` upsert body — `{ locale, ...fields }`, `.strict()`
 * (a server-authoritative field is a 400, not a silent strip). Upsert on
 * `(entityId, locale)`: saving twice never duplicates.
 */
export function translationUpsertBody<Fields extends z.ZodRawShape>(
  fields: Fields
) {
  return z.object({ locale: adminLocale, ...fields }).strict();
}

/**
 * `PATCH …/:id/translations/:locale` body — the localized `fields` only,
 * `.strict()` (the locale is in the path, never the body).
 */
export function translationPatchBody<Fields extends z.ZodRawShape>(
  fields: Fields
) {
  return z.object(fields).strict();
}

/**
 * A translation row as embedded in an entity's admin detail view —
 * `{ locale, ...fields }` (NOT localized: an admin sees every locale). `locale`
 * is the `adminLocale` enum (not a bare string) so the generated client types it
 * as the exact locale union — the edit form maps a detail row straight into its
 * `translations` value with no cast. Symmetric with `translationInput`.
 */
export function translationView<Fields extends z.ZodRawShape>(fields: Fields) {
  return z.object({ locale: adminLocale, ...fields });
}
