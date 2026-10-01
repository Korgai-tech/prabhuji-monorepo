import { z } from "zod";
import { LanguageCodeSchema } from "@api/shared/language.schema";
import {
  adminPagedEnvelope,
  adminPaginationQuery,
  mediaUrl,
  sortQuery,
} from "@api/shared/schemas";
import { DEFAULT_DEITY_LOCALE, DEITY_SORT_FIELDS } from "@api/core/deity/types";

/**
 * Zod schemas for the `/admin/taxonomy/deities/*` write surface (TAM-88;
 * ADR §C1–C5). Single source of truth for the OpenAPI contract emitted by
 * `pnpm nx run api:openapi` and the generated TS client — every operation here
 * is tagged `admin` by `registerAdminRoute`, so TAM-85's filter drops it from
 * `openapi.public.json` (it must never reach the mobile Dart codegen).
 *
 * **EXEMPLAR NOTE (read before copying into the eight sibling module tickets):**
 * this file establishes the admin write-schema shape for the whole epic —
 * `.strict()` write bodies (server-authoritative fields rejected, not stripped),
 * an `updatedAt` precondition on every mutating write, an immutable business key
 * that is absent from the PATCH body, a Zod-enum `sort` allowlist, and a
 * per-entity list envelope. Replicate the SHAPE, not the field names.
 */

// ---------------------------------------------------------------------------
// primitives
// ---------------------------------------------------------------------------

/**
 * `slug` — the cross-module logical reference key. Five modules tag content
 * against a deity by THIS string with **no DB foreign key** (`AudioDeityTag`,
 * `MantraDeityTag`, `WallpaperDeityTag`, `StatusDeityTag`, `Ringtone.deitySlug`;
 * TAM-57). It is a URL-safe content tag, so its shape is part of the contract:
 * lowercase alphanumerics joined by single hyphens, no whitespace.
 *
 * It is validated on POST and **deliberately absent from the PATCH body** — a
 * rename is indistinguishable from delete+create to those five tag tables,
 * except it fails silently instead of loudly. #EXPORT_CRITICAL.
 */
export const deitySlug = z
  .string()
  .min(1)
  .max(64)
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "slug must be lowercase alphanumerics separated by single hyphens, with no whitespace"
  );

/** A per-`(deityId, locale)` display name (TAM-46 translation convention). */
export const displayName = z.string().trim().min(1).max(200);

/**
 * Admin-writable translation locales: the eight Phase-1 client languages plus
 * the `en` fallback the public read path resolves against (TAM-57). Reuses
 * `LanguageCodeSchema` as the single source of truth for the client set rather
 * than re-listing it. Prevents an editor writing a translation in a locale no
 * client can request.
 */
export const adminLocale = z
  .enum([DEFAULT_DEITY_LOCALE, ...LanguageCodeSchema.options])
  .meta({ id: "AdminDeityLocale" });

/**
 * The optimistic-concurrency precondition (ADR §C3): the client's last-known
 * `updatedAt`, echoed back on every mutating write. The repository puts it in
 * the `WHERE` of an `updateMany`; a 0-count means someone else wrote first →
 * 409 `STALE_WRITE`. ISO-8601 string on the wire; the service parses it to a
 * `Date`. This is the ONLY way `updatedAt` is ever client-supplied.
 */
export const expectedUpdatedAt = z.string().datetime();

// ---------------------------------------------------------------------------
// request — params
// ---------------------------------------------------------------------------

export const AdminDeityIdParams = z.object({ id: z.uuid() });
export type AdminDeityIdParamsInput = z.infer<typeof AdminDeityIdParams>;

// ---------------------------------------------------------------------------
// request — list query
// ---------------------------------------------------------------------------

/**
 * Offset pagination (ADR §C2) — inline (un-`.meta`-tagged) because
 * `@fastify/swagger` can't resolve named refs for querystring params. Composes
 * TAM-82's `adminPaginationQuery` (page/pageSize, clamped to 100) + `sortQuery`.
 * `active` arrives as the string `"true"`/`"false"` and is transformed to a
 * boolean so the service never string-compares.
 */
export const AdminDeityListQuery = adminPaginationQuery
  .extend(sortQuery(DEITY_SORT_FIELDS).shape)
  .extend({
    q: z.string().trim().min(1).max(100).optional(),
    active: z
      .enum(["true", "false"])
      .transform((v) => v === "true")
      .optional(),
  });
export type AdminDeityListQueryInput = z.infer<typeof AdminDeityListQuery>;

// ---------------------------------------------------------------------------
// request — write bodies
// ---------------------------------------------------------------------------

const translationInput = z.object({ locale: adminLocale, displayName });

/**
 * `POST /admin/taxonomy/deities`. `.strict()` — a body carrying a
 * server-authoritative field (`id`, `createdAt`, `updatedAt`) is a **400, not a
 * silent strip** (the AC requires rejection, not Zod's default drop). Optional
 * `translations` seed per-locale names in the same transaction as the row.
 */
export const AdminDeityCreateBody = z
  .object({
    slug: deitySlug,
    iconUrl: mediaUrl,
    sortOrder: z.number().int().default(0),
    active: z.boolean().default(true),
    translations: z.array(translationInput).default([]),
  })
  .strict()
  .meta({ id: "AdminDeityCreateBody" });
export type AdminDeityCreateInput = z.infer<typeof AdminDeityCreateBody>;

/**
 * `PATCH /admin/taxonomy/deities/:id`. Partial update + the `updatedAt`
 * precondition. `.strict()` + the **deliberate absence of `slug`** make a rename
 * attempt a 400 at the boundary. Reactivation is `{ active: true }` here — there
 * is no separate reactivate endpoint; deactivation is fully reversible.
 */
export const AdminDeityPatchBody = z
  .object({
    expectedUpdatedAt,
    iconUrl: mediaUrl.optional(),
    sortOrder: z.number().int().optional(),
    active: z.boolean().optional(),
    // Label translations ride in the body (like the five content modules):
    // omitted ⇒ left untouched; provided (incl. `[]`) ⇒ the whole per-locale
    // set is REPLACED in the same optimistic-lock transaction.
    translations: z.array(translationInput).optional(),
    // NO `slug`: immutable business key (see `deitySlug`). #EXPORT_CRITICAL.
  })
  .strict()
  .meta({ id: "AdminDeityPatchBody" });
export type AdminDeityPatchInput = z.infer<typeof AdminDeityPatchBody>;

/**
 * `DELETE /admin/taxonomy/deities/:id` — a **deactivation** (`active = false`),
 * never a hard delete (Deity is the cross-module taxonomy root). Carries the
 * same `updatedAt` precondition as PATCH, in the body.
 */
export const AdminDeityDeleteBody = z
  .object({ expectedUpdatedAt })
  .strict()
  .meta({ id: "AdminDeityDeleteBody" });
export type AdminDeityDeleteInput = z.infer<typeof AdminDeityDeleteBody>;

// ---------------------------------------------------------------------------
// response components
// ---------------------------------------------------------------------------

/** One `(locale, displayName)` row as embedded in the deity detail view. */
export const AdminDeityTranslationView = z
  .object({ locale: adminLocale, displayName: z.string() })
  .meta({ id: "AdminDeityTranslationView" });

/**
 * The admin list row — the full DB row (NOT Pro-gated; an editor sees what they
 * edit) minus translations, which the detail endpoint carries. `createdAt` /
 * `updatedAt` are ISO strings; the service maps the Prisma `Date`s.
 */
export const AdminDeityListItem = z
  .object({
    id: z.string(),
    slug: z.string(),
    iconUrl: mediaUrl,
    sortOrder: z.number().int(),
    active: z.boolean(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .meta({ id: "AdminDeityListItem" });

/** Detail — the list row plus ALL translations (every locale, not localized). */
export const AdminDeityDetail = AdminDeityListItem.extend({
  translations: z.array(AdminDeityTranslationView),
}).meta({ id: "AdminDeityDetail" });

// ---------------------------------------------------------------------------
// response envelopes
// ---------------------------------------------------------------------------

/**
 * Single-item admin success envelope. Defined locally (rather than importing
 * `auth`'s `envelope`) so the deity module owns its own contract and does not
 * reach into another module's route schemas.
 */
function adminEnvelope<T extends z.ZodTypeAny>(data: T) {
  return z.object({ success: z.literal(true), message: z.string(), data });
}

export const AdminDeityListResponse = adminPagedEnvelope(AdminDeityListItem).meta({
  id: "AdminDeityListResponse",
});
export const AdminDeityDetailResponse = adminEnvelope(AdminDeityDetail).meta({
  id: "AdminDeityDetailResponse",
});

export const ErrorEnvelope = z
  .object({
    success: z.literal(false),
    message: z.string(),
    data: z.null(),
    errorCode: z.string().optional(),
  })
  .meta({ id: "AdminDeityErrorEnvelope" });
