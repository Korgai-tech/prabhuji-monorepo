import { z } from "zod";
import {
  adminPagedEnvelope,
  adminPaginationQuery,
  mediaUrl,
  sortQuery,
  translationInput,
  translationView,
} from "@api/shared/schemas";
import { LanguageCodeSchema } from "@api/shared/language.schema";
import {
  MANTRA_CATEGORY_SORT_FIELDS,
  MANTRA_ITEM_SORT_FIELDS,
  MANTRA_ITEM_TYPES,
  MANTRA_LAYOUT_TYPES,
  MANTRA_SECTION_SORT_FIELDS,
  MANTRA_SECTION_TYPES,
} from "@api/core/mantras/types";

/**
 * Zod schemas for the `/admin/mantras/*` write surface (TAM-92) — the single
 * source of truth for the admin OpenAPI contract. Every operation here is tagged
 * `admin` by `registerAdminRoute`, so TAM-85's filter drops it from
 * `openapi.public.json` (it must never reach the mobile Dart codegen).
 *
 * **Deliberately the same SHAPE as the deity exemplar (TAM-88) and its near-twin
 * TAM-90:** `.strict()` write bodies (server-authoritative fields rejected, not
 * stripped), an `updatedAt` precondition on every mutating write, immutable
 * business keys ABSENT from the PATCH body (`slug`, `sectionType`), a Zod-enum
 * `sort` allowlist per entity, and a per-entity list envelope.
 *
 * #EXPORT_CRITICAL: `mantraText` / `transliterationText` are plain `z.string()`
 * (NO `.trim()`, NO transform) so the Devanagari line breaks round-trip
 * byte-for-byte. A `.trim()` here is a content-correctness bug.
 *
 * #EXPORT_CRITICAL: `playCount` is NOT present in any write body — it is a
 * server-authoritative column. `.strict()` turns an attempt to set it into a 400.
 */

// ---------------------------------------------------------------------------
// primitives
// ---------------------------------------------------------------------------

/**
 * `slug` — a stable, URL-safe content tag and the idempotent seed key. Validated
 * on POST and **deliberately absent from every PATCH body**: renaming it would
 * break the idempotent seed identity and any stored reference. #EXPORT_CRITICAL.
 */
export const mantraSlug = z
  .string()
  .min(1)
  .max(64)
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "slug must be lowercase alphanumerics separated by single hyphens, with no whitespace"
  );

/**
 * The optimistic-concurrency precondition (ADR §C3): the client's last-known
 * `updatedAt`, echoed back on every mutating write. The repository puts it in the
 * `WHERE` of an `updateMany`; a 0-count means someone else wrote first → 409
 * `STALE_WRITE`. ISO-8601 on the wire; the service parses it to a `Date`. This is
 * the ONLY way `updatedAt` is ever client-supplied.
 */
export const expectedUpdatedAt = z.string().datetime();

const itemType = z.enum(MANTRA_ITEM_TYPES);
const layoutType = z.enum(MANTRA_LAYOUT_TYPES);
const sectionType = z.enum(MANTRA_SECTION_TYPES);

/**
 * `mantraText` / `transliterationText` — a plain `z.string()`. #EXPORT_CRITICAL:
 * NO `.trim()`, NO newline normalization. This is scripture the user chants;
 * whitespace/newline mangling is a content bug, not a formatting nit.
 */
const scriptureText = z.string();

/**
 * `deepLinkUrl` is an app deep link, NOT uploadable media — it is deliberately
 * NOT routed through `validateOwnedUrl`. Validated as a plain URL string (any
 * scheme, e.g. `https://…` or a custom app scheme).
 */
const deepLinkUrl = z.url();

/**
 * TAM-108: a single deity SLUG (logical reference to `deities.slug`, NO DB FK —
 * validated through the deity facade in the service). Supersedes the old
 * many-to-many `/deity-tags` sub-resource.
 */
const deitySlugRef = z.string().trim().min(1).max(64);

/**
 * TAM-108: the availability language set — a list of the 8 supported ISO 639-1
 * codes (`LanguageCodeSchema`). An EMPTY array means "available in ALL
 * languages". Supersedes the old single `language` column.
 */
const languagesSet = z.array(LanguageCodeSchema);

const boolFilter = z
  .enum(["true", "false"])
  .transform((v) => v === "true")
  .optional();

// ---------------------------------------------------------------------------
// request — params
// ---------------------------------------------------------------------------

export const AdminMantraIdParams = z.object({ id: z.uuid() });
export type AdminMantraIdParamsInput = z.infer<typeof AdminMantraIdParams>;

// ---------------------------------------------------------------------------
// request — list queries
// ---------------------------------------------------------------------------

/**
 * `GET /admin/mantras/items` list query. Inline (un-`.meta`-tagged) — Fastify's
 * swagger emitter can't resolve named refs for querystring params. Composes
 * `adminPaginationQuery` (page/pageSize ≤ 100) + `sortQuery` + explicit filters.
 */
export const AdminMantraItemListQuery = adminPaginationQuery
  .extend(sortQuery(MANTRA_ITEM_SORT_FIELDS).shape)
  .extend({
    q: z.string().trim().min(1).max(100).optional(),
    isActive: boolFilter,
    type: itemType.optional(),
    categoryId: z.uuid().optional(),
    deitySlug: deitySlugRef.optional(),
    // TAM-108: LANGUAGE MEMBERSHIP filter (locale ∈ languages, OR empty = all).
    language: LanguageCodeSchema.optional(),
    isFeatured: boolFilter,
  });
export type AdminMantraItemListQueryInput = z.infer<
  typeof AdminMantraItemListQuery
>;

export const AdminMantraCategoryListQuery = adminPaginationQuery
  .extend(sortQuery(MANTRA_CATEGORY_SORT_FIELDS).shape)
  .extend({
    q: z.string().trim().min(1).max(100).optional(),
    isActive: boolFilter,
  });
export type AdminMantraCategoryListQueryInput = z.infer<
  typeof AdminMantraCategoryListQuery
>;

export const AdminMantraSectionListQuery = adminPaginationQuery
  .extend(sortQuery(MANTRA_SECTION_SORT_FIELDS).shape)
  .extend({
    q: z.string().trim().min(1).max(100).optional(),
    isActive: boolFilter,
  });
export type AdminMantraSectionListQueryInput = z.infer<
  typeof AdminMantraSectionListQuery
>;

// ---------------------------------------------------------------------------
// request — category write bodies
// ---------------------------------------------------------------------------

/** TAM-110: per-locale `displayName` override — the category label field. */
const categoryTranslationDisplayName = z.string().trim().min(1).max(200);

export const AdminMantraCategoryCreateBody = z
  .object({
    slug: mantraSlug,
    displayName: z.string().trim().min(1).max(200),
    imageUrl: mediaUrl.nullable().default(null),
    backgroundColorToken: z.string().trim().min(1).max(64).nullable().default(null),
    sortOrder: z.number().int().default(0),
    isActive: z.boolean().default(true),
    // TAM-110: per-locale `displayName` overrides published WITH the category
    // (the admin is a single-author tool — labels ship with the entity). Seeded
    // in the same transaction as the row.
    translations: z
      .array(translationInput({ displayName: categoryTranslationDisplayName }))
      .default([]),
  })
  .strict()
  .meta({ id: "AdminMantraCategoryCreateBody" });
export type AdminMantraCategoryCreateBodyInput = z.infer<
  typeof AdminMantraCategoryCreateBody
>;

export const AdminMantraCategoryPatchBody = z
  .object({
    expectedUpdatedAt,
    displayName: z.string().trim().min(1).max(200).optional(),
    imageUrl: mediaUrl.nullable().optional(),
    backgroundColorToken: z.string().trim().min(1).max(64).nullable().optional(),
    sortOrder: z.number().int().optional(),
    isActive: z.boolean().optional(),
    // TAM-110: undefined ⇒ leave the translation set untouched; provided (incl.
    // `[]`) ⇒ REPLACE the whole set.
    translations: z
      .array(translationInput({ displayName: categoryTranslationDisplayName }))
      .optional(),
    // NO `slug`: immutable business key.
  })
  .strict()
  .meta({ id: "AdminMantraCategoryPatchBody" });
export type AdminMantraCategoryPatchBodyInput = z.infer<
  typeof AdminMantraCategoryPatchBody
>;

// ---------------------------------------------------------------------------
// request — audio-item write bodies
// ---------------------------------------------------------------------------

export const AdminMantraItemCreateBody = z
  .object({
    slug: mantraSlug,
    title: z.string().trim().min(1).max(300),
    type: itemType,
    artworkUrl: mediaUrl,
    audioUrl: mediaUrl,
    singerName: z.string().trim().min(1).max(200).nullable().default(null),
    composerName: z.string().trim().min(1).max(200).nullable().default(null),
    // #EXPORT_CRITICAL — untrimmed scripture text (line breaks preserved).
    mantraText: scriptureText,
    transliterationText: scriptureText.nullable().default(null),
    // TAM-108: single deity slug (facade-validated) + language availability set.
    deitySlug: deitySlugRef.nullable().default(null),
    languages: languagesSet.default([]),
    description: z.string().nullable().default(null),
    deepLinkUrl: deepLinkUrl.nullable().default(null),
    publishedAt: z.string().datetime().nullable().default(null),
    isFeatured: z.boolean().default(false),
    isActive: z.boolean().default(true),
    // NO `playCount`: server-authoritative (rejected by `.strict()`).
  })
  .strict()
  .meta({ id: "AdminMantraItemCreateBody" });
export type AdminMantraItemCreateBodyInput = z.infer<
  typeof AdminMantraItemCreateBody
>;

export const AdminMantraItemPatchBody = z
  .object({
    expectedUpdatedAt,
    title: z.string().trim().min(1).max(300).optional(),
    type: itemType.optional(),
    artworkUrl: mediaUrl.optional(),
    audioUrl: mediaUrl.optional(),
    singerName: z.string().trim().min(1).max(200).nullable().optional(),
    composerName: z.string().trim().min(1).max(200).nullable().optional(),
    // #EXPORT_CRITICAL — untrimmed scripture text (line breaks preserved).
    mantraText: scriptureText.optional(),
    transliterationText: scriptureText.nullable().optional(),
    // TAM-108: single deity slug (facade-validated; null clears) + language set.
    deitySlug: deitySlugRef.nullable().optional(),
    languages: languagesSet.optional(),
    description: z.string().nullable().optional(),
    deepLinkUrl: deepLinkUrl.nullable().optional(),
    publishedAt: z.string().datetime().nullable().optional(),
    isFeatured: z.boolean().optional(),
    isActive: z.boolean().optional(),
    // NO `slug` (immutable), NO `playCount` (server-authoritative).
  })
  .strict()
  .meta({ id: "AdminMantraItemPatchBody" });
export type AdminMantraItemPatchBodyInput = z.infer<
  typeof AdminMantraItemPatchBody
>;

/** `PUT …/items/:id/category-tags` — replace the whole category-tag set. */
export const AdminMantraCategoryTagsBody = z
  .object({ categoryIds: z.array(z.uuid()) })
  .strict()
  .meta({ id: "AdminMantraCategoryTagsBody" });
export type AdminMantraCategoryTagsBodyInput = z.infer<
  typeof AdminMantraCategoryTagsBody
>;

// TAM-108: the `PUT …/items/:id/deity-tags` sub-resource is REMOVED. A mantra's
// deity is now the single `deitySlug` scalar set directly on the create/patch
// body (facade-validated in the service), mirroring the ringtone exemplar.

// ---------------------------------------------------------------------------
// request — section write bodies
// ---------------------------------------------------------------------------

/** TAM-110: per-locale `title` override — the section label field. */
const sectionTranslationTitle = z.string().trim().min(1).max(200);

export const AdminMantraSectionCreateBody = z
  .object({
    sectionType,
    title: z.string().trim().min(1).max(200),
    layoutType,
    showAllEnabled: z.boolean().default(true),
    sortOrder: z.number().int().default(0),
    isActive: z.boolean().default(true),
    // TAM-110: per-locale `title` overrides published WITH the section. Seeded
    // in the same transaction as the row.
    translations: z
      .array(translationInput({ title: sectionTranslationTitle }))
      .default([]),
  })
  .strict()
  .meta({ id: "AdminMantraSectionCreateBody" });
export type AdminMantraSectionCreateBodyInput = z.infer<
  typeof AdminMantraSectionCreateBody
>;

export const AdminMantraSectionPatchBody = z
  .object({
    expectedUpdatedAt,
    title: z.string().trim().min(1).max(200).optional(),
    layoutType: layoutType.optional(),
    showAllEnabled: z.boolean().optional(),
    sortOrder: z.number().int().optional(),
    isActive: z.boolean().optional(),
    // TAM-110: undefined ⇒ leave the translation set untouched; provided (incl.
    // `[]`) ⇒ REPLACE the whole set.
    translations: z
      .array(translationInput({ title: sectionTranslationTitle }))
      .optional(),
    // NO `sectionType`: immutable (each type has bespoke server-side resolution).
  })
  .strict()
  .meta({ id: "AdminMantraSectionPatchBody" });
export type AdminMantraSectionPatchBodyInput = z.infer<
  typeof AdminMantraSectionPatchBody
>;

/**
 * TAM-160 `PUT /admin/mantras/sections/:id/items` — REPLACE a curated section's
 * membership in array order (`position` = array index) in one `$transaction`.
 * Set semantics: `[]` clears the section. Only permitted against a `curated`
 * section (400 otherwise); unknown section → 404; unknown `itemId` → 400 with
 * the whole set rejected. Duplicates are rejected HERE at the boundary (a
 * duplicate would violate the `(section_id, item_id)` primary key).
 *
 * Deliberately NO `expectedUpdatedAt` — this is a full-set replace and the
 * section row's own `updatedAt` is untouched (same as the wallpaper custom row;
 * last save wins, and the UI copy says so).
 */
export const AdminMantraSectionItemsBody = z
  .object({
    itemIds: z
      .array(z.uuid())
      .max(200)
      .refine((ids) => new Set(ids).size === ids.length, {
        message: "itemIds must not contain duplicates",
      }),
  })
  .strict()
  .meta({ id: "AdminMantraSectionItemsBody" });
export type AdminMantraSectionItemsBodyInput = z.infer<
  typeof AdminMantraSectionItemsBody
>;

/** Shared delete body — the `updatedAt` precondition (DELETE = deactivate). */
export const AdminMantraDeleteBody = z
  .object({ expectedUpdatedAt })
  .strict()
  .meta({ id: "AdminMantraDeleteBody" });
export type AdminMantraDeleteBodyInput = z.infer<typeof AdminMantraDeleteBody>;

// ---------------------------------------------------------------------------
// response components
// ---------------------------------------------------------------------------

export const AdminMantraCategoryView = z
  .object({
    id: z.string(),
    slug: z.string(),
    displayName: z.string(),
    imageUrl: mediaUrl.nullable(),
    backgroundColorToken: z.string().nullable(),
    sortOrder: z.number().int(),
    isActive: z.boolean(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .meta({ id: "AdminMantraCategoryView" });

/**
 * TAM-110: an admin category translation row — the `displayName` override for one
 * locale (NOT localized: an editor sees every locale). Element of the detail
 * view's `translations` array.
 */
export const AdminMantraCategoryTranslationView = translationView({
  displayName: z.string(),
}).meta({ id: "MantraCategoryTranslationView" });

/**
 * Category detail — the row plus ALL per-locale `displayName` overrides (every
 * locale, not localized). TAM-110: single-item reads/writes carry `translations`
 * since the sub-resource is gone.
 */
export const AdminMantraCategoryDetail = AdminMantraCategoryView.extend({
  translations: z.array(AdminMantraCategoryTranslationView),
}).meta({ id: "AdminMantraCategoryDetail" });

/** The admin item list row — `audioUrl` returned IN FULL (admin is not gated). */
export const AdminMantraItemListItem = z
  .object({
    id: z.string(),
    slug: z.string(),
    title: z.string(),
    type: itemType,
    artworkUrl: mediaUrl,
    audioUrl: mediaUrl,
    singerName: z.string().nullable(),
    composerName: z.string().nullable(),
    // TAM-108: availability language set (`[]` = all languages).
    languages: z.array(z.string()),
    publishedAt: z.string().datetime().nullable(),
    playCount: z.number().int(),
    isFeatured: z.boolean(),
    isActive: z.boolean(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .meta({ id: "AdminMantraItemListItem" });

/** Detail — the list row plus scripture text + the tag sets. */
export const AdminMantraItemDetail = AdminMantraItemListItem.extend({
  // #EXPORT_CRITICAL — line breaks preserved; NOT trimmed/normalized.
  mantraText: z.string(),
  transliterationText: z.string().nullable(),
  description: z.string().nullable(),
  deepLinkUrl: z.string().nullable(),
  categoryIds: z.array(z.string()),
  // TAM-108: the SINGLE deity slug (logical ref; null = no deity).
  deitySlug: z.string().nullable(),
}).meta({ id: "AdminMantraItemDetail" });

export const AdminMantraSectionView = z
  .object({
    id: z.string(),
    sectionType,
    title: z.string(),
    layoutType,
    showAllEnabled: z.boolean(),
    sortOrder: z.number().int(),
    isActive: z.boolean(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .meta({ id: "AdminMantraSectionView" });

/**
 * TAM-110: an admin section translation row — the `title` override for one locale
 * (NOT localized: an editor sees every locale). Element of the detail view's
 * `translations` array.
 */
export const AdminMantraSectionTranslationView = translationView({
  title: z.string(),
}).meta({ id: "MantraHomepageSectionTranslationView" });

/**
 * TAM-160: one curated membership entry (`position` = the saved array index).
 *
 * `title`/`artworkUrl` are DENORMALIZED display-only echoes of
 * `mantra_audio_items`, mirroring `AdminHomepageSectionItem`: without them the
 * CMS had to hunt each title in whatever catalogue page it had loaded, and a
 * member outside that page rendered as a raw uuid. The write path still takes
 * ids alone and nothing reads these back.
 */
export const AdminMantraSectionItem = z
  .object({
    itemId: z.string(),
    position: z.number().int(),
    title: z.string(),
    artworkUrl: z.string(),
  })
  .meta({ id: "AdminMantraSectionItem" });

/**
 * Section detail — the row plus ALL per-locale `title` overrides (every locale,
 * not localized). TAM-110: single-item reads/writes carry `translations` since
 * the sub-resource is gone. TAM-160: plus the curated `items` in saved order
 * (always `[]` for a built-in section), so the editor hydrates from the server.
 */
export const AdminMantraSectionDetail = AdminMantraSectionView.extend({
  translations: z.array(AdminMantraSectionTranslationView),
  items: z.array(AdminMantraSectionItem),
}).meta({ id: "AdminMantraSectionDetail" });

// ---------------------------------------------------------------------------
// response envelopes
// ---------------------------------------------------------------------------

/**
 * Single-item admin success envelope. Defined locally so the mantras module owns
 * its own contract and does not reach into another module's route schemas.
 */
function adminEnvelope<T extends z.ZodTypeAny>(data: T) {
  return z.object({ success: z.literal(true), message: z.string(), data });
}

export const AdminMantraCategoryListResponse = adminPagedEnvelope(
  AdminMantraCategoryView
).meta({ id: "AdminMantraCategoryListResponse" });
/** Single-item category response — the DETAIL view (carries `translations`). */
export const AdminMantraCategoryResponse = adminEnvelope(
  AdminMantraCategoryDetail
).meta({ id: "AdminMantraCategoryResponse" });

export const AdminMantraItemListResponse = adminPagedEnvelope(
  AdminMantraItemListItem
).meta({ id: "AdminMantraItemListResponse" });
export const AdminMantraItemDetailResponse = adminEnvelope(
  AdminMantraItemDetail
).meta({ id: "AdminMantraItemDetailResponse" });

export const AdminMantraSectionListResponse = adminPagedEnvelope(
  AdminMantraSectionView
).meta({ id: "AdminMantraSectionListResponse" });
/** Single-item section response — the DETAIL view (carries `translations`). */
export const AdminMantraSectionResponse = adminEnvelope(
  AdminMantraSectionDetail
).meta({ id: "AdminMantraSectionResponse" });
/** TAM-160: the persisted curated membership, in `position` order. */
export const AdminMantraSectionItemsResponse = adminEnvelope(
  z.array(AdminMantraSectionItem)
).meta({ id: "AdminMantraSectionItemsResponse" });

export const ErrorEnvelope = z
  .object({
    success: z.literal(false),
    message: z.string(),
    data: z.null(),
    errorCode: z.string().optional(),
  })
  .meta({ id: "AdminMantraErrorEnvelope" });
