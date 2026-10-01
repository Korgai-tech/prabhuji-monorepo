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
  AARTI_SECTION_TYPES,
  AUDIO_CATEGORY_SORT_FIELDS,
  AUDIO_ITEM_SORT_FIELDS,
  HOMEPAGE_SECTION_SORT_FIELDS,
} from "@api/core/aarti/types";

/**
 * Zod schemas for the `/admin/aarti/*` write surface (TAM-90; ADR §C1–C5) —
 * the single source of truth for the OpenAPI contract emitted by
 * `pnpm nx run api:openapi`. Every operation here is tagged `admin` by
 * `registerAdminRoute`, so TAM-85's filter drops it from `openapi.public.json`
 * (admin write-schemas must never reach the mobile Dart codegen).
 *
 * Follows the TAM-88 deity exemplar's SHAPE verbatim: `.strict()` write bodies
 * (server-authoritative fields REJECTED, not stripped), an `updatedAt`
 * precondition on every mutating write, immutable business keys absent from the
 * PATCH body (`slug`, `sectionType`), a Zod-enum `sort` allowlist per entity,
 * and per-entity list envelopes.
 */

// ---------------------------------------------------------------------------
// primitives
// ---------------------------------------------------------------------------

/**
 * `slug` — a stable content tag and idempotent seed key (`AudioCategory.slug`,
 * `AudioItem.slug`; TAM-61 references audio by slug). URL-safe: lowercase
 * alphanumerics joined by single hyphens, no whitespace. Validated on POST and
 * DELIBERATELY ABSENT from every PATCH body (immutable; #EXPORT_CRITICAL).
 */
export const aartiSlug = z
  .string()
  .min(1)
  .max(96)
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "slug must be lowercase alphanumerics separated by single hyphens, with no whitespace"
  );

/**
 * `sectionType` — drives bespoke server-side resolution (`recently_played |
 * deities | browse_categories | newly_added | most_played`), or `curated`
 * (TAM-160) for a CMS hand-picked list. Validated against the KNOWN set on POST
 * (an unknown value would create a section the service cannot resolve). ABSENT
 * from PATCH — effectively immutable. The built-in types are still capped at one
 * row each by a PARTIAL unique index in the DB (→ 409); `curated` is not.
 */
export const aartiSectionType = z.enum(AARTI_SECTION_TYPES);

/**
 * TAM-108: a deity slug — the single-deity logical reference to `deities.slug`
 * (no DB FK). Shape-checked here; EXISTENCE is validated through the deity facade
 * in the admin service on every create and every update that sets it (unknown →
 * 400; a DEACTIVATED deity is permitted).
 */
export const deitySlugRef = z.string().trim().min(1).max(96);

/**
 * TAM-108: the item's language-availability set, validated against the 8
 * supported `LanguageCode`s. An EMPTY array means "available in all languages".
 */
export const aartiLanguages = z.array(LanguageCodeSchema);

/**
 * The optimistic-concurrency precondition (ADR §C3): the client's last-known
 * `updatedAt`, echoed on every mutating write. The repository puts it in the
 * `WHERE` of an `updateMany`; a 0-count means someone else wrote first →
 * 409 `STALE_WRITE`. ISO-8601 string on the wire; the service parses it. This
 * is the ONLY way `updatedAt` is ever client-supplied.
 */
export const expectedUpdatedAt = z.string().datetime();

/** A nullable ISO-8601 timestamp (e.g. `publishedAt`). */
const optionalNullableDateTime = z.string().datetime().nullable();

/** Bounded free-text search term shared by every list query. */
const searchTerm = z.string().trim().min(1).max(100).optional();

/** `isActive` filter — arrives as the string `"true"`/`"false"` on the query. */
const boolFilter = z
  .enum(["true", "false"])
  .transform((v) => v === "true")
  .optional();

// ---------------------------------------------------------------------------
// params
// ---------------------------------------------------------------------------

export const AdminAartiIdParams = z.object({ id: z.uuid() });
export type AdminAartiIdParamsInput = z.infer<typeof AdminAartiIdParams>;

// ---------------------------------------------------------------------------
// localized label fields + translation views (TAM-109)
// ---------------------------------------------------------------------------
// Translations are EMBEDDED in each entity's own create/update body — the
// standalone `/…/:id/translations` sub-resource is GONE (a single-author
// publishing tool publishes labels together with the entity). A module supplies
// only its localized-field shape; `translationInput` (the create/update array
// element) and `translationView` (the detail row) come from
// `@api/shared/schemas`. `<Entity>TranslationView` is KEPT — the DETAIL view
// carries the full set so the edit form can load current translations. Every
// `.meta({ id })` is entity-prefixed so the OpenAPI component ids stay unique.

/** Localized `AudioCategory` label fields (`name` required, `description` optional). */
const audioCategoryTranslationFields = {
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional(),
};

export const AdminAudioCategoryTranslationView = translationView({
  name: z.string(),
  description: z.string().nullable(),
}).meta({ id: "AartiAudioCategoryTranslationView" });

/** Localized `HomepageSection` label field (`title`). */
const homepageSectionTranslationFields = {
  title: z.string().trim().min(1).max(200),
};

export const AdminHomepageSectionTranslationView = translationView({
  title: z.string(),
}).meta({ id: "AartiHomepageSectionTranslationView" });

// ===========================================================================
// AudioCategory
// ===========================================================================

export const AdminAudioCategoryListQuery = adminPaginationQuery
  .extend(sortQuery(AUDIO_CATEGORY_SORT_FIELDS).shape)
  .extend({ q: searchTerm, isActive: boolFilter });
export type AdminAudioCategoryListQueryInput = z.infer<
  typeof AdminAudioCategoryListQuery
>;

export const AdminAudioCategoryCreateBody = z
  .object({
    slug: aartiSlug,
    name: z.string().trim().min(1).max(200),
    imageUrl: mediaUrl.nullish(),
    description: z.string().trim().max(2000).nullish(),
    displayColor: z.string().trim().max(32).nullish(),
    sortOrder: z.number().int().default(0),
    isActive: z.boolean().default(true),
    // TAM-109: per-locale label overrides seeded in the same write as the row.
    translations: z.array(translationInput(audioCategoryTranslationFields)).default([]),
  })
  .strict()
  .meta({ id: "AdminAudioCategoryCreateBody" });
export type AdminAudioCategoryCreateInput = z.infer<
  typeof AdminAudioCategoryCreateBody
>;

export const AdminAudioCategoryPatchBody = z
  .object({
    expectedUpdatedAt,
    name: z.string().trim().min(1).max(200).optional(),
    imageUrl: mediaUrl.nullish(),
    description: z.string().trim().max(2000).nullish(),
    displayColor: z.string().trim().max(32).nullish(),
    sortOrder: z.number().int().optional(),
    isActive: z.boolean().optional(),
    // TAM-109: undefined ⇒ leave translations untouched; provided (incl. []) ⇒
    // REPLACE the entire per-locale set.
    translations: z.array(translationInput(audioCategoryTranslationFields)).optional(),
    // NO `slug`: immutable business key (see `aartiSlug`). #EXPORT_CRITICAL.
  })
  .strict()
  .meta({ id: "AdminAudioCategoryPatchBody" });
export type AdminAudioCategoryPatchInput = z.infer<
  typeof AdminAudioCategoryPatchBody
>;

export const AdminAudioCategoryDeleteBody = z
  .object({ expectedUpdatedAt })
  .strict()
  .meta({ id: "AdminAudioCategoryDeleteBody" });
export type AdminAudioCategoryDeleteInput = z.infer<
  typeof AdminAudioCategoryDeleteBody
>;

export const AdminAudioCategoryView = z
  .object({
    id: z.string(),
    slug: z.string(),
    name: z.string(),
    imageUrl: mediaUrl.nullable(),
    description: z.string().nullable(),
    displayColor: z.string().nullable(),
    sortOrder: z.number().int(),
    isActive: z.boolean(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .meta({ id: "AdminAudioCategoryView" });

/** Detail — the row plus ALL its per-locale label overrides (every locale). */
export const AdminAudioCategoryDetailView = AdminAudioCategoryView.extend({
  translations: z.array(AdminAudioCategoryTranslationView),
}).meta({ id: "AdminAudioCategoryDetailView" });

// ===========================================================================
// AudioItem
// ===========================================================================

export const AdminAudioItemListQuery = adminPaginationQuery
  .extend(sortQuery(AUDIO_ITEM_SORT_FIELDS).shape)
  .extend({
    q: searchTerm,
    isActive: boolFilter,
    categoryId: z.uuid().optional(),
    deitySlug: z.string().trim().min(1).max(96).optional(),
    isFeatured: boolFilter,
    isPrabhujiOriginal: boolFilter,
  });
export type AdminAudioItemListQueryInput = z.infer<
  typeof AdminAudioItemListQuery
>;

export const AdminAudioItemCreateBody = z
  .object({
    slug: aartiSlug,
    title: z.string().trim().min(1).max(300),
    coverImageUrl: mediaUrl,
    audioStreamUrl: mediaUrl,
    singerName: z.string().trim().max(200).nullish(),
    composerNames: z.string().trim().max(500).nullish(),
    // TAM-108: single-deity (validated via the deity facade) + multi-language.
    deitySlug: deitySlugRef,
    languages: aartiLanguages.default([]),
    description: z.string().trim().max(4000).nullish(),
    publishedAt: optionalNullableDateTime.optional(),
    isFeatured: z.boolean().default(false),
    isPrabhujiOriginal: z.boolean().default(false),
    isActive: z.boolean().default(true),
    // NO `playCount`: server-authoritative, backs the "most played" keyset sort.
  })
  .strict()
  .meta({ id: "AdminAudioItemCreateBody" });
export type AdminAudioItemCreateInput = z.infer<
  typeof AdminAudioItemCreateBody
>;

export const AdminAudioItemPatchBody = z
  .object({
    expectedUpdatedAt,
    title: z.string().trim().min(1).max(300).optional(),
    coverImageUrl: mediaUrl.optional(),
    audioStreamUrl: mediaUrl.optional(),
    singerName: z.string().trim().max(200).nullish(),
    composerNames: z.string().trim().max(500).nullish(),
    // TAM-108: single-deity (validated via the deity facade) + multi-language.
    deitySlug: deitySlugRef.optional(),
    languages: aartiLanguages.optional(),
    description: z.string().trim().max(4000).nullish(),
    publishedAt: optionalNullableDateTime.optional(),
    isFeatured: z.boolean().optional(),
    isPrabhujiOriginal: z.boolean().optional(),
    isActive: z.boolean().optional(),
    // NO `slug` (immutable) and NO `playCount` (server-authoritative). #EXPORT_CRITICAL.
  })
  .strict()
  .meta({ id: "AdminAudioItemPatchBody" });
export type AdminAudioItemPatchInput = z.infer<typeof AdminAudioItemPatchBody>;

export const AdminAudioItemDeleteBody = z
  .object({ expectedUpdatedAt })
  .strict()
  .meta({ id: "AdminAudioItemDeleteBody" });
export type AdminAudioItemDeleteInput = z.infer<
  typeof AdminAudioItemDeleteBody
>;

/** `PUT /admin/aarti/items/:id/category-tags` — full replacement set. */
export const AdminAudioCategoryTagsBody = z
  .object({ categoryIds: z.array(z.uuid()) })
  .strict()
  .meta({ id: "AdminAudioCategoryTagsBody" });
export type AdminAudioCategoryTagsInput = z.infer<
  typeof AdminAudioCategoryTagsBody
>;

// TAM-108: the `PUT /admin/aarti/items/:id/deity-tags` sub-resource is REMOVED —
// deity is now the scalar `deitySlug` field on the create/patch body.

const AdminAudioCategoryTagView = z
  .object({ id: z.string(), slug: z.string(), name: z.string() })
  .meta({ id: "AdminAudioCategoryTagView" });

/** The admin audio row — `audioStreamUrl` in FULL (admin reads are not gated). */
export const AdminAudioItemView = z
  .object({
    id: z.string(),
    slug: z.string(),
    title: z.string(),
    coverImageUrl: mediaUrl,
    audioStreamUrl: mediaUrl,
    singerName: z.string().nullable(),
    composerNames: z.string().nullable(),
    // TAM-108: single-deity scalar + multi-language set.
    deitySlug: z.string().nullable(),
    languages: z.array(z.string()),
    description: z.string().nullable(),
    publishedAt: z.string().datetime().nullable(),
    playCount: z.number().int(),
    isFeatured: z.boolean(),
    isPrabhujiOriginal: z.boolean(),
    isActive: z.boolean(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .meta({ id: "AdminAudioItemView" });

/** Detail — the row plus its resolved category tag set (deity is now scalar). */
export const AdminAudioItemDetailView = AdminAudioItemView.extend({
  categoryTags: z.array(AdminAudioCategoryTagView),
}).meta({ id: "AdminAudioItemDetailView" });

// ===========================================================================
// HomepageSection
// ===========================================================================

export const AdminHomepageSectionListQuery = adminPaginationQuery
  .extend(sortQuery(HOMEPAGE_SECTION_SORT_FIELDS).shape)
  .extend({ q: searchTerm, isActive: boolFilter });
export type AdminHomepageSectionListQueryInput = z.infer<
  typeof AdminHomepageSectionListQuery
>;

export const AdminHomepageSectionCreateBody = z
  .object({
    sectionType: aartiSectionType,
    title: z.string().trim().min(1).max(200),
    sortOrder: z.number().int().default(0),
    isActive: z.boolean().default(true),
    itemQuery: z.string().trim().max(2000).nullish(),
    // TAM-109: per-locale title overrides seeded in the same write as the row.
    translations: z.array(translationInput(homepageSectionTranslationFields)).default([]),
  })
  .strict()
  .meta({ id: "AdminHomepageSectionCreateBody" });
export type AdminHomepageSectionCreateInput = z.infer<
  typeof AdminHomepageSectionCreateBody
>;

export const AdminHomepageSectionPatchBody = z
  .object({
    expectedUpdatedAt,
    title: z.string().trim().min(1).max(200).optional(),
    sortOrder: z.number().int().optional(),
    isActive: z.boolean().optional(),
    itemQuery: z.string().trim().max(2000).nullish(),
    // TAM-109: undefined ⇒ leave translations untouched; provided (incl. []) ⇒
    // REPLACE the entire per-locale set.
    translations: z.array(translationInput(homepageSectionTranslationFields)).optional(),
    // NO `sectionType`: effectively immutable (drives bespoke resolution). #EXPORT_CRITICAL.
  })
  .strict()
  .meta({ id: "AdminHomepageSectionPatchBody" });
export type AdminHomepageSectionPatchInput = z.infer<
  typeof AdminHomepageSectionPatchBody
>;

export const AdminHomepageSectionDeleteBody = z
  .object({ expectedUpdatedAt })
  .strict()
  .meta({ id: "AdminHomepageSectionDeleteBody" });
export type AdminHomepageSectionDeleteInput = z.infer<
  typeof AdminHomepageSectionDeleteBody
>;

/**
 * `PUT /admin/aarti/sections/:id/items` — REPLACE the section's curated items in
 * array order (`position` = array index), in one `$transaction`. Only permitted
 * against a `curated` section (400 otherwise). Unknown `audioId` → 400, whole set
 * rejected. Duplicate ids are rejected at the boundary (a duplicate would break
 * the `(sectionId, audioId)` primary key). NO `expectedUpdatedAt`: this is a
 * full-set replace that never touches the section row — last save wins (mirrors
 * `AdminWallpaperRowItemsBody`).
 */
export const AdminHomepageSectionItemsBody = z
  .object({
    audioIds: z
      .array(z.uuid())
      .max(200)
      .refine((ids) => new Set(ids).size === ids.length, {
        message: "audioIds must not contain duplicates",
      }),
  })
  .strict()
  .meta({ id: "AdminHomepageSectionItemsBody" });
export type AdminHomepageSectionItemsInput = z.infer<
  typeof AdminHomepageSectionItemsBody
>;

/**
 * One curated membership entry (`position` from the saved array index).
 *
 * `title`/`coverImageUrl` are DENORMALIZED on purpose: the CMS renders the saved
 * order as a list of names, and ids alone forced it to hunt for each title in
 * whatever catalogue page it happened to have loaded — a member outside that
 * page rendered as a raw uuid. Returning them here makes the editor
 * self-sufficient. They are display-only echoes of `audio_items`; nothing reads
 * them back, and the write path still takes ids alone.
 */
export const AdminHomepageSectionItem = z
  .object({
    audioId: z.string(),
    position: z.number().int(),
    title: z.string(),
    coverImageUrl: z.string(),
  })
  .meta({ id: "AdminHomepageSectionItem" });

export const AdminHomepageSectionView = z
  .object({
    id: z.string(),
    sectionType: z.string(),
    title: z.string(),
    sortOrder: z.number().int(),
    isActive: z.boolean(),
    itemQuery: z.string().nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .meta({ id: "AdminHomepageSectionView" });

/**
 * Detail — the row plus ALL its per-locale title overrides (every locale) and,
 * for a `curated` section, its ordered item membership (TAM-160; `[]` for a
 * built-in type) so the editor hydrates from the server.
 */
export const AdminHomepageSectionDetailView = AdminHomepageSectionView.extend({
  translations: z.array(AdminHomepageSectionTranslationView),
  items: z.array(AdminHomepageSectionItem),
}).meta({ id: "AdminHomepageSectionDetailView" });

// ===========================================================================
// response envelopes
// ===========================================================================

/**
 * Single-item admin success envelope. Defined locally (rather than importing
 * `auth`'s `envelope`) so the aarti module owns its own contract and does not
 * reach into another module's route schemas — mirrors the deity exemplar.
 */
function adminEnvelope<T extends z.ZodTypeAny>(data: T) {
  return z.object({ success: z.literal(true), message: z.string(), data });
}

export const AdminAudioCategoryListResponse = adminPagedEnvelope(
  AdminAudioCategoryView
).meta({ id: "AdminAudioCategoryListResponse" });
export const AdminAudioCategoryResponse = adminEnvelope(
  AdminAudioCategoryDetailView
).meta({ id: "AdminAudioCategoryResponse" });

export const AdminAudioItemListResponse = adminPagedEnvelope(
  AdminAudioItemView
).meta({ id: "AdminAudioItemListResponse" });
export const AdminAudioItemResponse = adminEnvelope(
  AdminAudioItemDetailView
).meta({ id: "AdminAudioItemResponse" });

export const AdminHomepageSectionListResponse = adminPagedEnvelope(
  AdminHomepageSectionView
).meta({ id: "AdminHomepageSectionListResponse" });
export const AdminHomepageSectionResponse = adminEnvelope(
  AdminHomepageSectionDetailView
).meta({ id: "AdminHomepageSectionResponse" });
export const AdminHomepageSectionItemsResponse = adminEnvelope(
  z.array(AdminHomepageSectionItem)
).meta({ id: "AdminHomepageSectionItemsResponse" });

export const ErrorEnvelope = z
  .object({
    success: z.literal(false),
    message: z.string(),
    data: z.null(),
    errorCode: z.string().optional(),
  })
  .meta({ id: "AdminAartiErrorEnvelope" });
