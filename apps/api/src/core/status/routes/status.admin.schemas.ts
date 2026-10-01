import { z } from "zod";
import {
  adminPagedEnvelope,
  adminPaginationQuery,
  mediaUrl,
  sortQuery,
} from "@api/shared/schemas";
import { LanguageCodeSchema } from "@api/shared/language.schema";
import {
  STATUS_ITEM_SORT_FIELDS,
  STATUS_MEDIA_TYPES,
  STATUS_PERFORMANCE_DEITY_SORT_FIELDS,
  STATUS_PERFORMANCE_ITEM_SORT_FIELDS,
} from "@api/core/status/types";

/**
 * Zod schemas for the `/admin/status/*` write surface (TAM-98; ADR §C1–C5) —
 * the single source of truth for the OpenAPI contract emitted by
 * `pnpm nx run api:openapi`. Every operation here is tagged `admin` by
 * `registerAdminRoute`, so TAM-85's filter drops it from `openapi.public.json`
 * (admin write-schemas must never reach the mobile Dart codegen).
 *
 * Follows the TAM-88 deity / TAM-90 aarti / TAM-96 wallpaper exemplars' SHAPE
 * verbatim: `.strict()` write bodies (server-authoritative fields REJECTED, not
 * stripped), an `updatedAt` precondition on every mutating write, immutable
 * business keys (`slug`, `mediaType`) absent from the PATCH body, a Zod-enum
 * `sort` allowlist per entity, and per-entity list envelopes.
 *
 * One module-specific validation that is content-correctness, NOT decoration:
 *   - `overlaySafeArea` — a required `{top,bottom,left,right}` normalized-inset
 *     Json column. Validated for SHAPE **and** RANGES (each in `[0,1]`, and
 *     `top+bottom<1` / `left+right<1`) — a bad value renders the user's name
 *     over the deity's face on a publicly-shared image (AC (e)). Never `z.any()`.
 */

// ---------------------------------------------------------------------------
// primitives
// ---------------------------------------------------------------------------

/**
 * `slug` (StatusItem) — a stable content tag and idempotent seed key. URL-safe:
 * lowercase alphanumerics joined by single hyphens, no whitespace. Validated on
 * POST and DELIBERATELY ABSENT from every PATCH body (immutable; a rename would
 * silently orphan any external reference). #EXPORT_CRITICAL.
 */
export const statusSlug = z
  .string()
  .min(1)
  .max(96)
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "slug must be lowercase alphanumerics separated by single hyphens, with no whitespace"
  );

/**
 * `mediaType` — a TEXT column guarded at the Zod boundary against the exact set
 * `{image, video}`. Validated on POST; ABSENT from PATCH — changing it silently
 * invalidates the uploaded asset set (same rationale as TAM-96), so changing
 * type = a NEW row. #EXPORT_CRITICAL.
 */
export const statusMediaType = z.enum(STATUS_MEDIA_TYPES);

/** The item's single deity slug (LOGICAL reference; validated via the deity facade). */
export const statusDeitySlug = z.string().trim().min(1).max(96);

/**
 * `languages` (TAM-108) — the language availability set. Each entry is one of the
 * 8 Phase-1 `LanguageCode`s; `[]` = available in ALL languages. De-duplication is
 * the server's job (the array is bounded here). Supersedes the deprecated single
 * `language` column.
 */
export const statusLanguages = z.array(LanguageCodeSchema).max(8);

/**
 * The optimistic-concurrency precondition (ADR §C3): the client's last-known
 * `updatedAt`, echoed on every mutating write. The repository puts it in the
 * `WHERE` of an `updateMany`; a 0-count means someone else wrote first →
 * 409 `STALE_WRITE`. ISO-8601 string on the wire; the service parses it. This
 * is the ONLY way `updatedAt` is ever client-supplied.
 */
export const expectedUpdatedAt = z.string().datetime();

/** Bounded free-text search term shared by every list query. */
const searchTerm = z.string().trim().min(1).max(100).optional();

/** A boolean filter — arrives as the string `"true"`/`"false"` on the query. */
const boolFilter = z
  .enum(["true", "false"])
  .transform((v) => v === "true")
  .optional();

/** A normalized inset / coordinate — a fraction in `[0, 1]`. */
const normalizedUnit = z.number().min(0).max(1);

// ---------------------------------------------------------------------------
// overlaySafeArea — required Json, shape + RANGE validated (AC (e))
// ---------------------------------------------------------------------------

const overlaySafeAreaShape = {
  top: normalizedUnit,
  bottom: normalizedUnit,
  left: normalizedUnit,
  right: normalizedUnit,
} as const;

/**
 * Cross-field range guard: `top+bottom` and `left+right` must each be `< 1`,
 * otherwise the safe area collapses (or inverts) and the overlay has nowhere to
 * go — a content-correctness bug the client cannot report. Applied on the
 * WRITE bodies only (inline effects, so no OpenAPI component is emitted for the
 * refined variant — the emitter is opaque to `.superRefine`).
 */
function overlaySafeAreaCrossField(
  v: { top: number; bottom: number; left: number; right: number },
  ctx: z.RefinementCtx
): void {
  if (v.top + v.bottom >= 1) {
    ctx.addIssue({
      code: "custom",
      path: ["top"],
      message: "top + bottom must be < 1 (the overlay safe area would be empty)",
    });
  }
  if (v.left + v.right >= 1) {
    ctx.addIssue({
      code: "custom",
      path: ["left"],
      message: "left + right must be < 1 (the overlay safe area would be empty)",
    });
  }
}

/** WRITE variant — strict shape + range + the cross-field guard (inline). */
const overlaySafeAreaInput = z
  .object(overlaySafeAreaShape)
  .strict()
  .superRefine(overlaySafeAreaCrossField);

/** RESPONSE variant — the named component the generated clients see. */
export const OverlaySafeAreaView = z
  .object(overlaySafeAreaShape)
  .meta({ id: "AdminStatusOverlaySafeArea" });


// ---------------------------------------------------------------------------
// params
// ---------------------------------------------------------------------------

export const AdminStatusIdParams = z.object({ id: z.uuid() });
export type AdminStatusIdParamsInput = z.infer<typeof AdminStatusIdParams>;

// ===========================================================================
// StatusItem
// ===========================================================================

export const AdminStatusItemListQuery = adminPaginationQuery
  .extend(sortQuery(STATUS_ITEM_SORT_FIELDS).shape)
  .extend({
    q: searchTerm,
    isActive: boolFilter,
    mediaType: statusMediaType.optional(),
    deitySlug: statusDeitySlug.optional(),
    // TAM-108: filter by language MEMBERSHIP of the `languages` set.
    language: LanguageCodeSchema.optional(),
  });
export type AdminStatusItemListQueryInput = z.infer<
  typeof AdminStatusItemListQuery
>;

/**
 * The `mediaType`-discriminated field-applicability rule (AC (c)). Enforced on
 * CREATE, where `mediaType` and the asset set arrive together:
 *   - `image` → REQUIRES `imageUrl`; `videoUrl` must be absent/null.
 *   - `video` → REQUIRES `videoUrl`; `imageUrl` must be absent/null.
 *   - BOTH → `thumbnailUrl` is always required (the free feed card art) — that
 *     is enforced structurally by `thumbnailUrl: mediaUrl` (non-optional).
 */
function applyStatusMediaTypeRule(
  v: {
    mediaType: (typeof STATUS_MEDIA_TYPES)[number];
    imageUrl?: string | null;
    videoUrl?: string | null;
  },
  ctx: z.RefinementCtx
): void {
  if (v.mediaType === "image") {
    if (v.imageUrl === undefined || v.imageUrl === null) {
      ctx.addIssue({
        code: "custom",
        path: ["imageUrl"],
        message: "an image status requires imageUrl",
      });
    }
    if (v.videoUrl !== undefined && v.videoUrl !== null) {
      ctx.addIssue({
        code: "custom",
        path: ["videoUrl"],
        message: "videoUrl must be omitted for an image status",
      });
    }
  } else {
    if (v.videoUrl === undefined || v.videoUrl === null) {
      ctx.addIssue({
        code: "custom",
        path: ["videoUrl"],
        message: "a video status requires videoUrl",
      });
    }
    if (v.imageUrl !== undefined && v.imageUrl !== null) {
      ctx.addIssue({
        code: "custom",
        path: ["imageUrl"],
        message: "imageUrl must be omitted for a video status",
      });
    }
  }
}

export const AdminStatusItemCreateBody = z
  .object({
    slug: statusSlug,
    title: z.string().trim().min(1).max(300),
    mediaType: statusMediaType,
    // TAM-108: a single deity (validated via the deity facade) + a language set.
    deitySlug: statusDeitySlug,
    languages: statusLanguages.default([]),
    imageUrl: mediaUrl.nullish(),
    videoUrl: mediaUrl.nullish(),
    thumbnailUrl: mediaUrl,
    overlaySafeArea: overlaySafeAreaInput,
    shareCaption: z.string().trim().max(500).nullish(),
    isActive: z.boolean().default(true),
  })
  .strict()
  .superRefine(applyStatusMediaTypeRule)
  .meta({ id: "AdminStatusItemCreateBody" });
export type AdminStatusItemCreateInput = z.infer<
  typeof AdminStatusItemCreateBody
>;

export const AdminStatusItemPatchBody = z
  .object({
    expectedUpdatedAt,
    title: z.string().trim().min(1).max(300).optional(),
    // TAM-108: single deity + language set (both re-validated in the service).
    deitySlug: statusDeitySlug.optional(),
    languages: statusLanguages.optional(),
    imageUrl: mediaUrl.nullish(),
    videoUrl: mediaUrl.nullish(),
    thumbnailUrl: mediaUrl.optional(),
    overlaySafeArea: overlaySafeAreaInput.optional(),
    shareCaption: z.string().trim().max(500).nullish(),
    isActive: z.boolean().optional(),
    // NO `slug` and NO `mediaType`: both immutable business keys (a `mediaType`
    // flip silently invalidates the uploaded assets). #EXPORT_CRITICAL.
  })
  .strict()
  .meta({ id: "AdminStatusItemPatchBody" });
export type AdminStatusItemPatchInput = z.infer<typeof AdminStatusItemPatchBody>;

export const AdminStatusItemDeleteBody = z
  .object({ expectedUpdatedAt })
  .strict()
  .meta({ id: "AdminStatusItemDeleteBody" });
export type AdminStatusItemDeleteInput = z.infer<
  typeof AdminStatusItemDeleteBody
>;

/** The admin status row — every media + overlay field (status is never gated). */
export const AdminStatusItemView = z
  .object({
    id: z.string(),
    slug: z.string(),
    title: z.string(),
    mediaType: statusMediaType,
    imageUrl: mediaUrl.nullable(),
    videoUrl: mediaUrl.nullable(),
    thumbnailUrl: mediaUrl,
    overlaySafeArea: OverlaySafeAreaView,
    // TAM-108: the language availability set ([] = all languages). Lenient
    // `string[]` on READ (WRITE is strict `LanguageCode[]`) so legacy values
    // backfilled from the deprecated free-text `language` column still serialize.
    languages: z.array(z.string()),
    shareCaption: z.string().nullable(),
    isActive: z.boolean(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .meta({ id: "AdminStatusItemView" });

/** Detail — the row plus its single deity slug (TAM-108). */
export const AdminStatusItemDetailView = AdminStatusItemView.extend({
  deitySlug: z.string().nullable(),
}).meta({ id: "AdminStatusItemDetailView" });


// ===========================================================================
// response envelopes
// ===========================================================================

/**
 * Single-item admin success envelope. Defined locally (rather than importing
 * another module's `envelope`) so the status module owns its own contract and
 * does not reach into another module's route schemas — mirrors the exemplars.
 */
function adminEnvelope<T extends z.ZodTypeAny>(data: T) {
  return z.object({ success: z.literal(true), message: z.string(), data });
}

export const AdminStatusItemListResponse = adminPagedEnvelope(
  AdminStatusItemView
).meta({ id: "AdminStatusItemListResponse" });
export const AdminStatusItemResponse = adminEnvelope(
  AdminStatusItemDetailView
).meta({ id: "AdminStatusItemResponse" });

export const ErrorEnvelope = z
  .object({
    success: z.literal(false),
    message: z.string(),
    data: z.null(),
    errorCode: z.string().optional(),
  })
  .meta({ id: "AdminStatusErrorEnvelope" });

// ===========================================================================
// Status performance reporting (TAM-256) — READ-ONLY
// ===========================================================================
//
// A reporting surface, not a write surface: no `.strict()` bodies, no
// `updatedAt` precondition, no 409 path. Two tabs, each its own list route plus
// a CSV twin that shares these schemas so the two cannot diverge (D-11).
//
// Metric fields are `.nullable()` throughout and that is LOAD-BEARING (D-10):
// an undefined ratio (0 views, 0 intents) renders BLANK, never `0` — a zero
// share rate and an unmeasurable one are different facts about the content.
// The degraded case is NOT expressed as nulls: when the warehouse is
// unreachable the envelope's `warehouseAvailable` is false and the UI renders
// an explicit "unavailable" treatment, because an editor must never confuse
// "nobody shared this" with "we could not read the numbers" (D-2 condition 11).

/**
 * An IST calendar date, `YYYY-MM-DD`.
 *
 * The warehouse's `event_date` is already IST (`toDate(corrected_time,
 * 'Asia/Kolkata')`) and leads the sort key, so the window is expressed in IST
 * days and both ends are INCLUSIVE (D-6). Postgres `created_at` is UTC and is
 * converted to IST for display and for "Days live" — stated once here so the
 * two tabs cannot disagree by a day.
 */
const istDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "expected an IST calendar date as YYYY-MM-DD");

/**
 * The shared window + the rule that makes it safe.
 *
 * `dateTo` is clamped to today (IST) in the service, NOT here: events arrive
 * future-dated by client clock skew (measured 2026-09-22: `max(event_date)` was
 * six days ahead), so an unclamped "today" or "last 7 days" silently includes
 * them and the newest bucket reads wrong. The span bound is what stops a
 * single request scanning the whole table on a no-cache live-read design.
 */
const performanceWindow = z
  .object({
    dateFrom: istDate.optional(),
    dateTo: istDate.optional(),
  })
  .refine((v) => !v.dateFrom || !v.dateTo || v.dateFrom <= v.dateTo, {
    message: "dateFrom must not be after dateTo",
    path: ["dateFrom"],
  });

/**
 * The minimum-views floor (D-8) — a HARD filter, not a sort tiebreak.
 *
 * Default 100, and deliberately a visible, clearable parameter rather than an
 * invisible cutoff. Measured on 30 days of production data: 505 items had
 * views, 57 cleared 100, 164 cleared 50, median 34 — so the default shows
 * ~57 rows, and an editor who wants the long tail sets `minViews=0`.
 */
const minViewsFilter = z.coerce.number().int().nonnegative().default(100);

// ---- Tab 1: by item -------------------------------------------------------

export const AdminStatusPerformanceItemListQuery = adminPaginationQuery
  .extend(sortQuery(STATUS_PERFORMANCE_ITEM_SORT_FIELDS).shape)
  .extend(performanceWindow.shape)
  .extend({
    q: searchTerm,
    isActive: boolFilter,
    mediaType: statusMediaType.optional(),
    /** Accepts `STATUS_PERFORMANCE_NO_DEITY` to select unmapped items (D-9). */
    deitySlug: statusDeitySlug.optional(),
    minViews: minViewsFilter,
  });
export type AdminStatusPerformanceItemListQueryInput = z.infer<
  typeof AdminStatusPerformanceItemListQuery
>;

export const AdminStatusPerformanceItemView = z
  .object({
    id: z.string(),
    slug: z.string(),
    title: z.string(),
    thumbnailUrl: mediaUrl,
    deitySlug: z.string().nullable(),
    deityName: z.string().nullable(),
    mediaType: statusMediaType,
    isActive: z.boolean(),
    createdAt: z.string().datetime(),
    /** IST calendar days since `createdAt`. Never affected by the window (D-5). */
    daysLive: z.number().int().nonnegative(),
    /**
     * Editorial INTENT — `pinned_content.pinPosition` for an active pin. Blank
     * when unpinned, which is the common case. `statusPinPosition` prefers the
     * all-gods surface when an item holds both status pins (N-1); the CSV
     * carries them as separate columns so neither is lost.
     */
    statusPinPosition: z.number().int().nullable(),
    homepagePinPosition: z.number().int().nullable(),
    /**
     * Placement OUTCOME — `avg(position_index)` over `status_viewed` in the
     * window, **1-BASED for display** (`1.0` = top of feed) per D-1b, converted
     * once in the response mapper. Status-feed-scoped: `status_viewed` never
     * fires from Home (D-1a), and the average spans BOTH arms of the
     * `feed.deity_split` experiment (D-1c), so a shift here can be an
     * allocation change rather than a content outcome.
     */
    avgObservedPosition: z.number().nullable(),
    /** `HomeFeedItem.createdAt`. Blank does NOT mean "not on homepage". */
    onHomepageSince: z.string().datetime().nullable(),
    views: z.number().int().nonnegative(),
    /** `uniq(user_id)` — HLL, ~0.5% error. NOT summable across rows (D-7). */
    viewers: z.number().int().nonnegative(),
    /** Blank before `STATUS_SHARE_INTENT_AVAILABLE_FROM` — not zero. */
    shareIntents: z.number().int().nonnegative().nullable(),
    /** Successes only — `result = 'success'` (D-4). */
    shares: z.number().int().nonnegative(),
    /** shares / views. Blank when views is 0. */
    shareRate: z.number().nullable(),
    /** shares / shareIntents. Blank when intents are 0 or unavailable. */
    completion: z.number().nullable(),
  })
  .meta({ id: "AdminStatusPerformanceItemView" });

// ---- Tab 2: by deity ------------------------------------------------------

export const AdminStatusPerformanceDeityListQuery = adminPaginationQuery
  .extend(sortQuery(STATUS_PERFORMANCE_DEITY_SORT_FIELDS).shape)
  .extend(performanceWindow.shape)
  .extend({
    q: searchTerm,
    mediaType: statusMediaType.optional(),
  });
export type AdminStatusPerformanceDeityListQueryInput = z.infer<
  typeof AdminStatusPerformanceDeityListQuery
>;

/** The deity's best item by share rate — subject to the same 100-view floor (D-14). */
export const AdminStatusPerformanceBestItemView = z
  .object({
    id: z.string(),
    slug: z.string(),
    title: z.string(),
    shareRate: z.number(),
    views: z.number().int().nonnegative(),
  })
  .meta({ id: "AdminStatusPerformanceBestItemView" });

export const AdminStatusPerformanceDeityView = z
  .object({
    /** `STATUS_PERFORMANCE_NO_DEITY` for the unmapped bucket (D-9). */
    deitySlug: z.string(),
    /** `DeityTranslation.displayName` for `en`, falling back to the slug (D-13). */
    deityName: z.string(),
    totalItems: z.number().int().nonnegative(),
    activeItems: z.number().int().nonnegative(),
    itemsInFeed: z.number().int().nonnegative(),
    views: z.number().int().nonnegative(),
    /**
     * `uniq` over the deity's WHOLE item set — deliberately NOT the sum of the
     * item rows' viewers (one devotee viewing three of a deity's items is one
     * viewer, not three), so Tab 2 will not reconcile with Tab 1 by addition
     * (D-7, N-5).
     */
    viewers: z.number().int().nonnegative(),
    shareIntents: z.number().int().nonnegative().nullable(),
    shares: z.number().int().nonnegative(),
    shareRate: z.number().nullable(),
    completion: z.number().nullable(),
    /**
     * Views and Shares sum over ALL items; the divisor is ACTIVE items, per the
     * requirement as written. The asymmetry is deliberate — documented so it is
     * not "fixed" later.
     */
    viewsPerItem: z.number().nullable(),
    sharesPerItem: z.number().nullable(),
    /** Blank is the EXPECTED case for most deities — few items clear the floor. */
    bestItem: AdminStatusPerformanceBestItemView.nullable(),
  })
  .meta({ id: "AdminStatusPerformanceDeityView" });

// ---- response envelopes ---------------------------------------------------

/**
 * The paged envelope plus the four flags that keep a blank page honest.
 *
 * `warehouseAvailable: false` ⇒ render "unavailable", not blank, and refuse the
 * CSV export (D-2 condition 11). `metricsSuspect: true` is the silent-zero
 * canary (condition 12): the catalogue is non-empty yet every event count in
 * the window is zero, which is what an upstream rename of an
 * `event_properties` key or an `event_type` value looks like — it does not
 * error, it just returns nothing. A blank page must be unreachable without one
 * of these two flags set.
 */
function performanceEnvelope<T extends z.ZodTypeAny>(item: T) {
  const base = adminPagedEnvelope(item);
  return z.object({
    success: base.shape.success,
    message: base.shape.message,
    data: base.shape.data.extend({
      warehouseAvailable: z.boolean(),
      /** Some Home-feed shares could not be canonicalised to a status id (D-3). */
      partialAttribution: z.boolean(),
      metricsSuspect: z.boolean(),
      /** IST date from which Share intents / Completion have any data at all. */
      metricsAvailableFrom: istDate,
    }),
  });
}

export const AdminStatusPerformanceItemListResponse = performanceEnvelope(
  AdminStatusPerformanceItemView
).meta({ id: "AdminStatusPerformanceItemListResponse" });

export const AdminStatusPerformanceDeityListResponse = performanceEnvelope(
  AdminStatusPerformanceDeityView
).meta({ id: "AdminStatusPerformanceDeityListResponse" });

/** CSV export query — the list query minus paging: every matching row (D-11). */
export const AdminStatusPerformanceItemCsvQuery =
  AdminStatusPerformanceItemListQuery.omit({ page: true, pageSize: true });
export type AdminStatusPerformanceItemCsvQueryInput = z.infer<
  typeof AdminStatusPerformanceItemCsvQuery
>;

export const AdminStatusPerformanceDeityCsvQuery =
  AdminStatusPerformanceDeityListQuery.omit({ page: true, pageSize: true });
export type AdminStatusPerformanceDeityCsvQueryInput = z.infer<
  typeof AdminStatusPerformanceDeityCsvQuery
>;
