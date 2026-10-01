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
  BOOK_CATEGORIES,
  BOOK_CHAPTER_SORT_FIELDS,
  BOOK_CONTENT_SORT_FIELDS,
  BOOK_CONTENT_TYPES,
  BOOK_SECTION_KEYS,
  BOOK_SECTION_SORT_FIELDS,
  BOOK_SUB_BOOK_SORT_FIELDS,
} from "@api/core/books/types";

/**
 * Zod schemas for the `/admin/books/*` write surface (TAM-102; ADR §C1–C5) —
 * the single source of truth for the OpenAPI contract emitted by
 * `pnpm nx run api:openapi`. Every operation here is tagged `admin` by
 * `registerAdminRoute`, so TAM-85's filter drops it from `openapi.public.json`
 * (admin write-schemas must never reach the mobile Dart codegen).
 *
 * Follows the TAM-88 deity exemplar's SHAPE verbatim across the module's FOUR
 * entities: `.strict()` write bodies (server-authoritative fields REJECTED, not
 * stripped), an `updatedAt` precondition on every mutating write, immutable
 * business keys absent from the PATCH body (`slug`, `contentType`, `key`), a
 * Zod-enum `sort` allowlist per entity, and per-entity list envelopes.
 *
 * TWO-HIERARCHY NOTE: the discriminated invariants (`direct_scripture` requires
 * `contentBody` + a `category` and forbids sub-books/chapters/audio; `major_book`
 * forbids `contentBody`/`category`) are enforced in the SERVICE, not here — the
 * DB and a single flat body schema cannot express them. This file validates
 * shape and rejects the fields that must never be client-set.
 */

// ---------------------------------------------------------------------------
// primitives
// ---------------------------------------------------------------------------

/**
 * `slug` — a stable idempotent seed key and cross-module reference. URL-safe:
 * lowercase alphanumerics joined by single hyphens, no whitespace. Validated on
 * POST and DELIBERATELY ABSENT from every PATCH body (immutable — content slug
 * is `@unique`; sub-book/chapter slug is unique within its parent content).
 */
export const booksSlug = z
  .string()
  .min(1)
  .max(96)
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "slug must be lowercase alphanumerics separated by single hyphens, with no whitespace"
  );

/**
 * The optimistic-concurrency precondition (ADR §C3): the client's last-known
 * `updatedAt`, echoed on every mutating write. The repository puts it in the
 * `WHERE` of an `updateMany`/`deleteMany`; a 0-count means someone else wrote
 * first → 409 `STALE_WRITE`. ISO-8601 on the wire; the service parses it. This
 * is the ONLY way `updatedAt` is ever client-supplied.
 */
export const expectedUpdatedAt = z.string().datetime();

/**
 * Scripture / chapter text (`contentBody`, `bodyText`) — `@db.Text` Devanagari.
 * #EXPORT_CRITICAL: NO `.trim()`, no newline normalization, no HTML escaping —
 * it is scripture rendered verbatim by a Flutter text widget, so line breaks
 * MUST round-trip byte-for-byte (the same rule as TAM-92's `mantraText`). Only a
 * generous max is applied (a full chapter can be long).
 */
const scriptureText = z.string().min(1).max(500_000);

/** Two content hierarchies, discriminated on `content_type` (a real Prisma enum). */
const bookContentType = z.enum(BOOK_CONTENT_TYPES);

/** Direct-scripture taxonomy (null for major books; one of the four otherwise). */
const bookCategory = z.enum(BOOK_CATEGORIES);

/** The server-owned `book_sections.key` set (immutable once created). */
const bookSectionKey = z.enum(BOOK_SECTION_KEYS);

/**
 * The language-availability SET (TAM-108): the ISO 639-1 codes a book/scripture
 * is offered in, each validated against the eight Phase-1 client languages
 * (`LanguageCodeSchema`, the single source of truth). An EMPTY array means
 * "available in all languages". Supersedes the single `language` column (kept in
 * the DB until step 3 but no longer written by the admin surface).
 */
const bookLanguages = z.array(LanguageCodeSchema);

/** An ISO-8601 timestamp that may be explicitly nulled (`newlyAddedAt`). */
const nullableDateTime = z.string().datetime().nullable();

/** Bounded free-text search term shared by the content/section list queries. */
const searchTerm = z.string().trim().min(1).max(100).optional();

/** A boolean filter — arrives as the string `"true"`/`"false"` on the query. */
const boolFilter = z
  .enum(["true", "false"])
  .transform((v) => v === "true")
  .optional();

// ---------------------------------------------------------------------------
// params
// ---------------------------------------------------------------------------

export const AdminBooksIdParams = z.object({ id: z.uuid() });
export type AdminBooksIdParamsInput = z.infer<typeof AdminBooksIdParams>;

// ===========================================================================
// BookContent
// ===========================================================================

export const AdminBookContentListQuery = adminPaginationQuery
  .extend(sortQuery(BOOK_CONTENT_SORT_FIELDS).shape)
  .extend({
    q: searchTerm,
    isActive: boolFilter,
    contentType: bookContentType.optional(),
    category: bookCategory.optional(),
    // TAM-108: single-code language-membership filter — rows whose `languages`
    // set contains this code (or is empty = all languages). Validated against the
    // eight client languages.
    language: LanguageCodeSchema.optional(),
  });
export type AdminBookContentListQueryInput = z.infer<
  typeof AdminBookContentListQuery
>;

/**
 * `POST /admin/books/content`. `contentType` is REQUIRED and drives the
 * two-hierarchy invariants the SERVICE enforces (`direct_scripture` → a
 * `category` + `contentBody`; `major_book` → neither). `.strict()` rejects
 * server-authoritative fields (`id`, timestamps) as a 400, not a silent strip.
 */
export const AdminBookContentCreateBody = z
  .object({
    slug: booksSlug,
    contentType: bookContentType,
    category: bookCategory.nullish(),
    title: z.string().trim().min(1).max(300),
    coverImageUrl: mediaUrl,
    author: z.string().trim().max(200).nullish(),
    // TAM-108: availability SET (empty = all languages). Replaces the single
    // `language` default "hi".
    languages: bookLanguages.default([]),
    sortOrder: z.number().int().default(0),
    offlineCacheEligible: z.boolean().default(true),
    newlyAddedAt: nullableDateTime.optional(),
    // Untrimmed scripture text — required for direct_scripture, forbidden for
    // major_book (the service validates the correspondence).
    contentBody: scriptureText.nullish(),
  })
  .strict()
  .meta({ id: "AdminBookContentCreateBody" });
export type AdminBookContentCreateInput = z.infer<
  typeof AdminBookContentCreateBody
>;

/**
 * `PATCH /admin/books/content/:id`. Partial update + the `updatedAt`
 * precondition. `slug` and `contentType` are absent — both immutable
 * (`contentType` flip would orphan the whole child structure). The `category` /
 * `contentBody` correspondence is re-validated by the service against the row's
 * existing (unchangeable) `contentType`.
 */
export const AdminBookContentPatchBody = z
  .object({
    expectedUpdatedAt,
    category: bookCategory.nullish(),
    title: z.string().trim().min(1).max(300).optional(),
    coverImageUrl: mediaUrl.optional(),
    author: z.string().trim().max(200).nullish(),
    // TAM-108: replace the whole availability set (empty = all languages).
    languages: bookLanguages.optional(),
    sortOrder: z.number().int().optional(),
    offlineCacheEligible: z.boolean().optional(),
    newlyAddedAt: nullableDateTime.optional(),
    contentBody: scriptureText.nullish(),
    isActive: z.boolean().optional(),
    // NO `slug`, NO `contentType`: immutable. #EXPORT_CRITICAL.
  })
  .strict()
  .meta({ id: "AdminBookContentPatchBody" });
export type AdminBookContentPatchInput = z.infer<
  typeof AdminBookContentPatchBody
>;

export const AdminBookContentDeleteBody = z
  .object({ expectedUpdatedAt })
  .strict()
  .meta({ id: "AdminBookContentDeleteBody" });
export type AdminBookContentDeleteInput = z.infer<
  typeof AdminBookContentDeleteBody
>;

/** The admin content row — full, NOT Pro-gated (`contentBody` in full). */
export const AdminBookContentView = z
  .object({
    id: z.string(),
    slug: z.string(),
    contentType: bookContentType,
    category: bookCategory.nullable(),
    title: z.string(),
    coverImageUrl: mediaUrl,
    author: z.string().nullable(),
    languages: bookLanguages,
    sortOrder: z.number().int(),
    offlineCacheEligible: z.boolean(),
    newlyAddedAt: z.string().datetime().nullable(),
    contentBody: z.string().nullable(),
    isActive: z.boolean(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .meta({ id: "AdminBookContentView" });

// ===========================================================================
// BookSubBook (kanda)
// ===========================================================================

export const AdminBookSubBookListQuery = adminPaginationQuery
  .extend(sortQuery(BOOK_SUB_BOOK_SORT_FIELDS).shape)
  .extend({
    // Parent filter — an editor works within one book (AC (a)).
    contentId: z.uuid().optional(),
  });
export type AdminBookSubBookListQueryInput = z.infer<
  typeof AdminBookSubBookListQuery
>;

/**
 * `POST /admin/books/sub-books`. `contentId` must reference an existing
 * `major_book` (the service rejects a `direct_scripture` parent → 400).
 * `chapterCount` is NOT accepted — it is derived state, recomputed by the
 * service (`.strict()` rejects it).
 */
export const AdminBookSubBookCreateBody = z
  .object({
    contentId: z.uuid(),
    slug: booksSlug,
    title: z.string().trim().min(1).max(300),
    order: z.number().int().default(0),
  })
  .strict()
  .meta({ id: "AdminBookSubBookCreateBody" });
export type AdminBookSubBookCreateInput = z.infer<
  typeof AdminBookSubBookCreateBody
>;

export const AdminBookSubBookPatchBody = z
  .object({
    expectedUpdatedAt,
    title: z.string().trim().min(1).max(300).optional(),
    order: z.number().int().optional(),
    // NO `slug`, NO `contentId` (immutable), NO `chapterCount` (derived).
  })
  .strict()
  .meta({ id: "AdminBookSubBookPatchBody" });
export type AdminBookSubBookPatchInput = z.infer<
  typeof AdminBookSubBookPatchBody
>;

export const AdminBookSubBookDeleteBody = z
  .object({ expectedUpdatedAt })
  .strict()
  .meta({ id: "AdminBookSubBookDeleteBody" });
export type AdminBookSubBookDeleteInput = z.infer<
  typeof AdminBookSubBookDeleteBody
>;

export const AdminBookSubBookView = z
  .object({
    id: z.string(),
    contentId: z.string(),
    slug: z.string(),
    title: z.string(),
    order: z.number().int(),
    chapterCount: z.number().int(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .meta({ id: "AdminBookSubBookView" });

/** Sub-book hard-delete result — surfaces the cascade loss so the UI can warn. */
export const AdminBookSubBookDeleteResult = z
  .object({ id: z.string(), deletedChapterCount: z.number().int() })
  .meta({ id: "AdminBookSubBookDeleteResult" });

// ===========================================================================
// BookChapter
// ===========================================================================

export const AdminBookChapterListQuery = adminPaginationQuery
  .extend(sortQuery(BOOK_CHAPTER_SORT_FIELDS).shape)
  .extend({
    // Parent filters — an editor works within one book / one kanda (AC (a)).
    contentId: z.uuid().optional(),
    subBookId: z.uuid().optional(),
  });
export type AdminBookChapterListQueryInput = z.infer<
  typeof AdminBookChapterListQuery
>;

/**
 * `POST /admin/books/chapters`. `contentId` must reference a `major_book`
 * (never a `direct_scripture` — the service rejects it). `subBookId`, if set,
 * MUST belong to the SAME `contentId` (two independent FKs let the DB accept a
 * cross-book chapter; the service validates it). `audioUrl` is the ONLY audio in
 * the module (r7); `bodyText` is untrimmed scripture.
 */
export const AdminBookChapterCreateBody = z
  .object({
    contentId: z.uuid(),
    subBookId: z.uuid().nullish(),
    slug: booksSlug,
    title: z.string().trim().min(1).max(300),
    order: z.number().int().default(0),
    bodyText: scriptureText,
    audioUrl: mediaUrl.nullish(),
  })
  .strict()
  .meta({ id: "AdminBookChapterCreateBody" });
export type AdminBookChapterCreateInput = z.infer<
  typeof AdminBookChapterCreateBody
>;

/**
 * `PATCH /admin/books/chapters/:id`. `subBookId` IS editable (re-parent within
 * the SAME content, or null for a loose chapter) — the service re-validates
 * same-content and recomputes the old + new sub-book `chapterCount`
 * transactionally. `slug` and `contentId` are immutable (absent).
 */
export const AdminBookChapterPatchBody = z
  .object({
    expectedUpdatedAt,
    subBookId: z.uuid().nullish(),
    title: z.string().trim().min(1).max(300).optional(),
    order: z.number().int().optional(),
    bodyText: scriptureText.optional(),
    audioUrl: mediaUrl.nullish(),
    // NO `slug`, NO `contentId` (immutable). #EXPORT_CRITICAL.
  })
  .strict()
  .meta({ id: "AdminBookChapterPatchBody" });
export type AdminBookChapterPatchInput = z.infer<
  typeof AdminBookChapterPatchBody
>;

export const AdminBookChapterDeleteBody = z
  .object({ expectedUpdatedAt })
  .strict()
  .meta({ id: "AdminBookChapterDeleteBody" });
export type AdminBookChapterDeleteInput = z.infer<
  typeof AdminBookChapterDeleteBody
>;

/** The admin chapter row — `bodyText` in full, `audioUrl` present (not gated). */
export const AdminBookChapterView = z
  .object({
    id: z.string(),
    contentId: z.string(),
    subBookId: z.string().nullable(),
    slug: z.string(),
    title: z.string(),
    order: z.number().int(),
    bodyText: z.string(),
    audioUrl: mediaUrl.nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .meta({ id: "AdminBookChapterView" });

/** Chapter hard-delete result. */
export const AdminBookChapterDeleteResult = z
  .object({ id: z.string() })
  .meta({ id: "AdminBookChapterDeleteResult" });

// ===========================================================================
// BookSection
// ===========================================================================

/**
 * The single localized field of a `BookSection` — the section heading copy.
 * TAM-112: label translations live INLINE on the section create/update bodies
 * (the admin is a single-author publishing tool), NOT a standalone sub-resource.
 */
const sectionTitleField = { title: z.string().trim().min(1).max(200) } as const;

/**
 * `{ locale, title }` — one per-locale override, carried in the section's
 * `translations` array (create/update) and echoed in the detail view (an admin
 * sees every locale). Component id kept unique per the OpenAPI contract.
 */
export const BookSectionTranslationView = translationView(
  sectionTitleField
).meta({ id: "BookSectionTranslationView" });

/**
 * One inline `translations[]` element on a section write body — `{ locale,
 * title }`, un-`.strict()` (the shared `translationInput`). Providing the array
 * REPLACES the whole override set; omitting it (PATCH) leaves it untouched.
 */
const sectionTranslationInput = translationInput(sectionTitleField);

export const AdminBookSectionListQuery = adminPaginationQuery
  .extend(sortQuery(BOOK_SECTION_SORT_FIELDS).shape)
  .extend({ q: searchTerm, isActive: boolFilter });
export type AdminBookSectionListQueryInput = z.infer<
  typeof AdminBookSectionListQuery
>;

/**
 * `POST /admin/books/sections`. `key` is `@unique` + validated against the
 * known set (an unknown key creates a section the service cannot resolve) →
 * a duplicate is a 409. `CATEGORY_TITLE`/`DEFAULT_SECTION_TITLE` stay
 * server-owned constants and are OUT OF SCOPE (no CRUD here).
 */
export const AdminBookSectionCreateBody = z
  .object({
    key: bookSectionKey,
    title: z.string().trim().min(1).max(200),
    sortOrder: z.number().int().default(0),
    isActive: z.boolean().default(true),
    // TAM-112: seed the per-locale `title` overrides in the same write. Empty
    // (default) means no overrides — the public read falls back to `title`.
    translations: z.array(sectionTranslationInput).default([]),
  })
  .strict()
  .meta({ id: "AdminBookSectionCreateBody" });
export type AdminBookSectionCreateInput = z.infer<
  typeof AdminBookSectionCreateBody
>;

export const AdminBookSectionPatchBody = z
  .object({
    expectedUpdatedAt,
    title: z.string().trim().min(1).max(200).optional(),
    sortOrder: z.number().int().optional(),
    isActive: z.boolean().optional(),
    // TAM-112: REPLACE the whole `title`-override set. `undefined` ⇒ untouched;
    // provided (including `[]`) ⇒ delete-then-recreate the full set.
    translations: z.array(sectionTranslationInput).optional(),
    // NO `key`: immutable business key. #EXPORT_CRITICAL.
  })
  .strict()
  .meta({ id: "AdminBookSectionPatchBody" });
export type AdminBookSectionPatchInput = z.infer<
  typeof AdminBookSectionPatchBody
>;

export const AdminBookSectionDeleteBody = z
  .object({ expectedUpdatedAt })
  .strict()
  .meta({ id: "AdminBookSectionDeleteBody" });
export type AdminBookSectionDeleteInput = z.infer<
  typeof AdminBookSectionDeleteBody
>;

export const AdminBookSectionView = z
  .object({
    id: z.string(),
    key: z.string(),
    title: z.string(),
    sortOrder: z.number().int(),
    isActive: z.boolean(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .meta({ id: "AdminBookSectionView" });

/**
 * Section DETAIL (TAM-112) — the list row plus ALL `title` overrides (every
 * locale, NOT localized) so the admin edit form loads them. Returned by section
 * get/create/update; the list endpoint returns the lighter `AdminBookSectionView`.
 */
export const AdminBookSectionDetail = AdminBookSectionView.extend({
  translations: z.array(BookSectionTranslationView),
}).meta({ id: "AdminBookSectionDetail" });

// ===========================================================================
// response envelopes
// ===========================================================================

/**
 * Single-item admin success envelope. Defined locally (rather than importing
 * `auth`'s `envelope`) so the books module owns its own contract and does not
 * reach into another module's route schemas — mirrors the deity exemplar.
 */
function adminEnvelope<T extends z.ZodTypeAny>(data: T) {
  return z.object({ success: z.literal(true), message: z.string(), data });
}

export const AdminBookContentListResponse = adminPagedEnvelope(
  AdminBookContentView
).meta({ id: "AdminBookContentListResponse" });
export const AdminBookContentResponse = adminEnvelope(AdminBookContentView).meta(
  { id: "AdminBookContentResponse" }
);

export const AdminBookSubBookListResponse = adminPagedEnvelope(
  AdminBookSubBookView
).meta({ id: "AdminBookSubBookListResponse" });
export const AdminBookSubBookResponse = adminEnvelope(AdminBookSubBookView).meta(
  { id: "AdminBookSubBookResponse" }
);
export const AdminBookSubBookDeleteResponse = adminEnvelope(
  AdminBookSubBookDeleteResult
).meta({ id: "AdminBookSubBookDeleteResponse" });

export const AdminBookChapterListResponse = adminPagedEnvelope(
  AdminBookChapterView
).meta({ id: "AdminBookChapterListResponse" });
export const AdminBookChapterResponse = adminEnvelope(AdminBookChapterView).meta(
  { id: "AdminBookChapterResponse" }
);
export const AdminBookChapterDeleteResponse = adminEnvelope(
  AdminBookChapterDeleteResult
).meta({ id: "AdminBookChapterDeleteResponse" });

export const AdminBookSectionListResponse = adminPagedEnvelope(
  AdminBookSectionView
).meta({ id: "AdminBookSectionListResponse" });
// Detail-shaped (carries `translations`) — returned by get/create/update.
export const AdminBookSectionResponse = adminEnvelope(
  AdminBookSectionDetail
).meta({ id: "AdminBookSectionResponse" });

export const ErrorEnvelope = z
  .object({
    success: z.literal(false),
    message: z.string(),
    data: z.null(),
    errorCode: z.string().optional(),
  })
  .meta({ id: "AdminBooksErrorEnvelope" });
