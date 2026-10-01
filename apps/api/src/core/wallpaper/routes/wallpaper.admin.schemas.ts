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
  WALLPAPER_MEDIA_TYPES,
  WALLPAPER_ROW_SORT_FIELDS,
  WALLPAPER_ROW_TYPES,
  WALLPAPER_SORT_FIELDS,
} from "@api/core/wallpaper/types";

/**
 * Zod schemas for the `/admin/wallpapers/*` write surface (TAM-96; ADR §C1–C5).
 * Single source of truth for the OpenAPI contract emitted by
 * `pnpm nx run api:openapi` and the generated TS client — every operation here
 * is tagged `admin` by `registerAdminRoute`, so TAM-85's filter drops it from
 * `openapi.public.json` (it must never reach the mobile Dart codegen).
 *
 * Mirrors the deity exemplar (TAM-88): `.strict()` write bodies (server-
 * authoritative fields rejected, not stripped), an `updatedAt` precondition on
 * every mutating write, immutable business keys absent from the PATCH body, a
 * Zod-enum `sort` allowlist, and per-entity list envelopes.
 *
 * WALLPAPER SPECIFICS (all #EXPORT_CRITICAL):
 *   - NO entitlement gate anywhere in this module (discovery is free; the Pro
 *     Set-Wallpaper action is client-side, TAM-70). The subscription facade is
 *     never called.
 *   - `mediaType` and `rowType` are immutable in PATCH (both silently change
 *     what a row IS).
 *   - Five media fields, each `validateOwnedUrl`-checked in the service with its
 *     own registry triple; `liveWallpaperPackage` and `iconKey` are NOT URLs
 *     and never go through `validateOwnedUrl`.
 *   - `setCount` is server-authoritative and rejected in every write body.
 */

// ---------------------------------------------------------------------------
// primitives
// ---------------------------------------------------------------------------

/**
 * `slug` — the stable, URL-safe content tag (idempotent seed key). Validated on
 * POST and DELIBERATELY ABSENT from the PATCH body (immutable business key).
 */
export const wallpaperSlug = z
  .string()
  .min(1)
  .max(80)
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "slug must be lowercase alphanumerics separated by single hyphens, with no whitespace"
  );

/** `row_key` — the homepage row's stable idempotent config key (same shape as slug). */
export const rowKey = wallpaperSlug;

export const title = z.string().trim().min(1).max(200);

/**
 * A deity slug (TAM-108) — the logical reference to `deities.slug` (TAM-57), NO
 * DB FK. Shape-checked here; EXISTENCE is validated through the deity facade in
 * the admin service on create and on every patch that sets it. #EXPORT_CRITICAL.
 */
export const deitySlugRef = z.string().trim().min(1).max(64);

/**
 * The language-availability set (TAM-108) — the eight Phase-1 `LanguageCode`s,
 * de-duplicated. EMPTY = available in ALL languages (matches wallpaper's
 * pre-TAM-108 behaviour, when it had no language column). Bounded at 8 (the full
 * code set) so a runaway payload can't degrade the array column.
 */
export const languages = z
  .array(LanguageCodeSchema)
  .max(8)
  .transform((v) => [...new Set(v)]);

/**
 * `iconKey` — a STABLE KEY the client resolves to a BUNDLED asset (NOT a URL,
 * never an upload target, never through `validateOwnedUrl`). #EXPORT_CRITICAL.
 * The seed uses `live | trending | new | festival | heart`. We validate it as a
 * key-SHAPED string (lowercase, hyphenated) rather than pinning the five seed
 * keys as an enum: the client's bundled-icon set can grow without an app
 * release, so an over-strict allowlist would block legitimate new rows
 * (#PLAN_UNCERTAINTY — no confirmed fixed client resolver allowlist exists).
 */
export const iconKey = z
  .string()
  .min(1)
  .max(64)
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "iconKey must be a lowercase, hyphenated bundled-asset key (not a URL)"
  );

/**
 * `liveWallpaperPackage` — an Android package identifier, NOT a URL. Validated
 * as a dotted package name; never routed through `validateOwnedUrl`.
 */
export const androidPackage = z
  .string()
  .min(3)
  .max(255)
  .regex(
    /^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/,
    "must be a valid Android package name (e.g. com.example.wallpaper)"
  );

/** `dominant_color` — a hex placeholder-tint token (#rgb or #rrggbb). */
export const hexColor = z
  .string()
  .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "must be a hex color like #1a2b3c");

/** `alt_text` — a bounded accessibility string. */
export const altText = z.string().trim().min(1).max(500);

/** A normalized crop-focus point (both axes 0..1). Shape-validated — never `z.any()`. */
export const FocalPointSchema = z
  .object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) })
  .strict()
  .meta({ id: "AdminWallpaperFocalPoint" });

/** Clock/status-bar/icon safe-area insets (each 0..1). Shape-validated. */
export const SafeAreaMetadataSchema = z
  .object({
    top: z.number().min(0).max(1),
    bottom: z.number().min(0).max(1),
    left: z.number().min(0).max(1),
    right: z.number().min(0).max(1),
  })
  .strict()
  .meta({ id: "AdminWallpaperSafeAreaMetadata" });

/** Bounded, trimmed, de-duplicated android version hints (live wallpapers). */
export const supportedAndroidVersions = z
  .array(z.string().trim().min(1).max(20))
  .max(20)
  .transform((v) => [...new Set(v)]);

export const displayOrder = z.number().int();
export const maxItems = z.number().int().positive().max(100);

export const mediaTypeEnum = z.enum(WALLPAPER_MEDIA_TYPES);
export const rowTypeEnum = z.enum(WALLPAPER_ROW_TYPES);

/**
 * The optimistic-concurrency precondition (ADR §C3): the client's last-known
 * `updatedAt`, echoed on every mutating write. The repository puts it in the
 * `WHERE` of an `updateMany`; a 0-count → 404-or-409 (STALE_WRITE).
 */
export const expectedUpdatedAt = z.string().datetime();

// ---------------------------------------------------------------------------
// request — params
// ---------------------------------------------------------------------------

export const AdminWallpaperIdParams = z.object({ id: z.uuid() });
export type AdminWallpaperIdParamsInput = z.infer<typeof AdminWallpaperIdParams>;

export const AdminWallpaperRowIdParams = z.object({ id: z.uuid() });
export type AdminWallpaperRowIdParamsInput = z.infer<
  typeof AdminWallpaperRowIdParams
>;

// ---------------------------------------------------------------------------
// request — list queries
// ---------------------------------------------------------------------------

/**
 * `GET /admin/wallpapers` list query. Offset pagination + `sort` enum allowlist
 * + explicit filters. Inline (un-`.meta`-tagged) because `@fastify/swagger`
 * can't resolve named refs for querystring params. Booleans arrive as the
 * strings `"true"`/`"false"` and are transformed so the service never
 * string-compares.
 */
export const AdminWallpaperListQuery = adminPaginationQuery
  .extend(sortQuery(WALLPAPER_SORT_FIELDS).shape)
  .extend({
    q: z.string().trim().min(1).max(100).optional(),
    isActive: z
      .enum(["true", "false"])
      .transform((v) => v === "true")
      .optional(),
    mediaType: mediaTypeEnum.optional(),
    deitySlug: wallpaperSlug.optional(),
  });
export type AdminWallpaperListQueryInput = z.infer<typeof AdminWallpaperListQuery>;

/** `GET /admin/wallpapers/rows` list query. */
export const AdminWallpaperRowListQuery = adminPaginationQuery
  .extend(sortQuery(WALLPAPER_ROW_SORT_FIELDS).shape)
  .extend({
    q: z.string().trim().min(1).max(100).optional(),
    rowType: rowTypeEnum.optional(),
    isActive: z
      .enum(["true", "false"])
      .transform((v) => v === "true")
      .optional(),
  });
export type AdminWallpaperRowListQueryInput = z.infer<
  typeof AdminWallpaperRowListQuery
>;

// ---------------------------------------------------------------------------
// request — wallpaper write bodies
// ---------------------------------------------------------------------------

/**
 * The `mediaType`-discriminated field-applicability rule (AC (d);
 * #PLAN_UNCERTAINTY resolved). Enforced on CREATE, where `mediaType` and the
 * asset set arrive together. The DOCUMENTED rule:
 *
 *   `static` →
 *     - satisfied by the always-required `previewImageUrl` (the merged
 *       preview/apply image — the device-set image for a static wallpaper);
 *     - REJECTS the live-only fields `previewVideoUrl`, `liveWallpaperAssetUrl`,
 *       `liveWallpaperPackage`, `fallbackStaticThumbnailUrl` (a static
 *       wallpaper has no video).
 *   `live` →
 *     - REQUIRES `previewVideoUrl` (the looping preview clip);
 *     - REQUIRES at least ONE of `liveWallpaperAssetUrl` / `liveWallpaperPackage`
 *       (the device-set asset — TAM-69 stores BOTH approaches because the final
 *       device method is Engineering's call in TAM-70, so we require one, not a
 *       specific one — over-strict validation would block legitimate content).
 *   BOTH → `thumbnailUrl` + `previewImageUrl` are always required (non-nullable).
 *
 * A misconfiguration renders as a broken card with NO server error, hence the
 * boundary guard rather than trusting the editor.
 */
function applyMediaTypeRule(
  v: {
    mediaType: (typeof WALLPAPER_MEDIA_TYPES)[number];
    previewVideoUrl?: string;
    liveWallpaperAssetUrl?: string;
    liveWallpaperPackage?: string;
    fallbackStaticThumbnailUrl?: string;
  },
  ctx: z.RefinementCtx
): void {
  if (v.mediaType === "static") {
    const liveOnly: [string, unknown][] = [
      ["previewVideoUrl", v.previewVideoUrl],
      ["liveWallpaperAssetUrl", v.liveWallpaperAssetUrl],
      ["liveWallpaperPackage", v.liveWallpaperPackage],
      ["fallbackStaticThumbnailUrl", v.fallbackStaticThumbnailUrl],
    ];
    for (const [field, value] of liveOnly) {
      if (value !== undefined) {
        ctx.addIssue({
          code: "custom",
          path: [field],
          message: `${field} is a live-only field and must be omitted for a static wallpaper`,
        });
      }
    }
  } else {
    if (v.previewVideoUrl === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["previewVideoUrl"],
        message: "a live wallpaper requires previewVideoUrl (the looping preview clip)",
      });
    }
    if (v.liveWallpaperAssetUrl === undefined && v.liveWallpaperPackage === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["liveWallpaperAssetUrl"],
        message:
          "a live wallpaper requires liveWallpaperAssetUrl or liveWallpaperPackage (the device-set asset)",
      });
    }
  }
}

/**
 * `POST /admin/wallpapers`. `.strict()` — a body carrying a server-authoritative
 * field (`id`, `createdAt`, `updatedAt`, `setCount`) is a 400, not a silent
 * strip. TAM-108: a single `deitySlug` (nullable; validated through the deity
 * facade in the service) + a `languages` availability set (empty = all) are set
 * HERE — the old many-to-many `PUT …/deity-tags` sub-resource is gone.
 */
export const AdminWallpaperCreateBody = z
  .object({
    slug: wallpaperSlug,
    title,
    mediaType: mediaTypeEnum,
    deitySlug: deitySlugRef.nullable().default(null),
    languages: languages.default([]),
    thumbnailUrl: mediaUrl,
    previewImageUrl: mediaUrl,
    previewVideoUrl: mediaUrl.optional(),
    liveWallpaperAssetUrl: mediaUrl.optional(),
    liveWallpaperPackage: androidPackage.optional(),
    fallbackStaticThumbnailUrl: mediaUrl.optional(),
    altText: altText.optional(),
    dominantColor: hexColor.optional(),
    supportedAndroidVersions: supportedAndroidVersions.optional().default([]),
    focalPoint: FocalPointSchema.optional(),
    safeAreaMetadata: SafeAreaMetadataSchema.optional(),
    isActive: z.boolean().default(true),
  })
  .strict()
  .superRefine(applyMediaTypeRule)
  .meta({ id: "AdminWallpaperCreateBody" });
export type AdminWallpaperCreateInput = z.infer<typeof AdminWallpaperCreateBody>;

/**
 * `PATCH /admin/wallpapers/:id`. Partial update + the `updatedAt` precondition.
 * `.strict()` + the DELIBERATE ABSENCE of `slug`, `mediaType` and `setCount`
 * make any attempt to set them a 400 at the boundary. Optional media/metadata
 * columns accept `null` to clear them. The `mediaType`-discriminated rule is
 * NOT re-run here: `mediaType` is immutable and not present in the body, so the
 * asset combination cannot be re-validated at the boundary without the stored
 * row — individual media fields are still `validateOwnedUrl`-checked in the
 * service.
 */
export const AdminWallpaperPatchBody = z
  .object({
    expectedUpdatedAt,
    title: title.optional(),
    // TAM-108: `null` clears the deity; a whole `languages` array replaces the
    // set (empty = all). Both validated in the service (deity facade).
    deitySlug: deitySlugRef.nullable().optional(),
    languages: languages.optional(),
    thumbnailUrl: mediaUrl.optional(),
    previewImageUrl: mediaUrl.optional(),
    previewVideoUrl: mediaUrl.nullable().optional(),
    liveWallpaperAssetUrl: mediaUrl.nullable().optional(),
    liveWallpaperPackage: androidPackage.nullable().optional(),
    fallbackStaticThumbnailUrl: mediaUrl.nullable().optional(),
    altText: altText.nullable().optional(),
    dominantColor: hexColor.nullable().optional(),
    supportedAndroidVersions: supportedAndroidVersions.optional(),
    focalPoint: FocalPointSchema.nullable().optional(),
    safeAreaMetadata: SafeAreaMetadataSchema.nullable().optional(),
    isActive: z.boolean().optional(),
    // NO `slug` / `mediaType` (immutable) and NO `setCount` (server-authoritative).
  })
  .strict()
  .meta({ id: "AdminWallpaperPatchBody" });
export type AdminWallpaperPatchInput = z.infer<typeof AdminWallpaperPatchBody>;

/** `DELETE /admin/wallpapers/:id` — a deactivation (`isActive = false`). */
export const AdminWallpaperDeleteBody = z
  .object({ expectedUpdatedAt })
  .strict()
  .meta({ id: "AdminWallpaperDeleteBody" });
export type AdminWallpaperDeleteInput = z.infer<typeof AdminWallpaperDeleteBody>;

// ---------------------------------------------------------------------------
// request — homepage row write bodies
// ---------------------------------------------------------------------------

/**
 * The one localized field of a homepage row: its `title` (TAM-111). Seeded on
 * create and replace-set on update via the embedded `translations` array, built
 * from the shared `translationInput` builder (`@api/shared/schemas`).
 */
const rowTitleField = { title: z.string().trim().min(1).max(200) };

/**
 * `POST /admin/wallpapers/rows`. `rowKey` + `rowType` are set here and immutable
 * thereafter. Only `custom` rows use curated items; the other four resolve
 * server-side. `sortRule` is NOT a field (no such column — see
 * `AdminWallpaperRowUpdateInput`). TAM-111: per-locale `title` overrides are
 * seeded HERE (`translations`, default `[]`) — the standalone
 * `…/rows/:id/translations` sub-resource is gone (single-author publishing tool).
 */
export const AdminWallpaperRowCreateBody = z
  .object({
    rowKey,
    title,
    rowType: rowTypeEnum,
    iconKey: iconKey.optional(),
    mediaTypeFilter: mediaTypeEnum.optional(),
    deityTagFilter: wallpaperSlug.optional(),
    maxItems: maxItems.default(20),
    displayOrder: displayOrder.default(0),
    isActive: z.boolean().default(true),
    translations: z.array(translationInput(rowTitleField)).default([]),
  })
  .strict()
  .meta({ id: "AdminWallpaperRowCreateBody" });
export type AdminWallpaperRowCreateInput = z.infer<
  typeof AdminWallpaperRowCreateBody
>;

/**
 * `PATCH /admin/wallpapers/rows/:id`. Partial + `updatedAt` precondition.
 * `rowKey` and `rowType` are ABSENT (immutable — each changes what the row IS).
 * Optional filter columns accept `null` to clear.
 */
export const AdminWallpaperRowPatchBody = z
  .object({
    expectedUpdatedAt,
    title: title.optional(),
    iconKey: iconKey.nullable().optional(),
    mediaTypeFilter: mediaTypeEnum.nullable().optional(),
    deityTagFilter: wallpaperSlug.nullable().optional(),
    maxItems: maxItems.optional(),
    displayOrder: displayOrder.optional(),
    isActive: z.boolean().optional(),
    // TAM-111: `undefined` leaves the translation set untouched; any provided
    // array (incl. `[]`) REPLACES the whole set in one transaction.
    translations: z.array(translationInput(rowTitleField)).optional(),
    // NO `rowKey` / `rowType` (immutable).
  })
  .strict()
  .meta({ id: "AdminWallpaperRowPatchBody" });
export type AdminWallpaperRowPatchInput = z.infer<
  typeof AdminWallpaperRowPatchBody
>;

/** `DELETE /admin/wallpapers/rows/:id` — a deactivation (`isActive = false`). */
export const AdminWallpaperRowDeleteBody = z
  .object({ expectedUpdatedAt })
  .strict()
  .meta({ id: "AdminWallpaperRowDeleteBody" });
export type AdminWallpaperRowDeleteInput = z.infer<
  typeof AdminWallpaperRowDeleteBody
>;

/**
 * `PUT /admin/wallpapers/rows/:id/items` — REPLACE the row's curated items in
 * array order (`position` = array index), in one `$transaction`. Only permitted
 * against a `custom` row (400 otherwise). Unknown `wallpaperId` → 400, whole set
 * rejected. Duplicate ids are rejected at the boundary (a duplicate would break
 * the `(rowId, wallpaperId)` primary key).
 */
export const AdminWallpaperRowItemsBody = z
  .object({
    wallpaperIds: z
      .array(z.uuid())
      .max(200)
      .refine((ids) => new Set(ids).size === ids.length, {
        message: "wallpaperIds must not contain duplicates",
      }),
  })
  .strict()
  .meta({ id: "AdminWallpaperRowItemsBody" });
export type AdminWallpaperRowItemsInput = z.infer<
  typeof AdminWallpaperRowItemsBody
>;

// ---------------------------------------------------------------------------
// response components
// ---------------------------------------------------------------------------

export const AdminWallpaperListItem = z
  .object({
    id: z.string(),
    slug: z.string(),
    title: z.string(),
    mediaType: mediaTypeEnum,
    thumbnailUrl: mediaUrl,
    previewImageUrl: mediaUrl,
    // On the list so the admin grid can PLAY a live wallpaper's loop in its
    // card instead of showing a still it cannot judge. Null for `static`.
    previewVideoUrl: mediaUrl.nullable(),
    setCount: z.number().int(),
    isActive: z.boolean(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    deitySlug: z.string().nullable(),
    languages: z.array(z.string()),
  })
  .meta({ id: "AdminWallpaperListItem" });

export const AdminWallpaperDetail = AdminWallpaperListItem.extend({
  liveWallpaperAssetUrl: mediaUrl.nullable(),
  liveWallpaperPackage: z.string().nullable(),
  fallbackStaticThumbnailUrl: mediaUrl.nullable(),
  altText: z.string().nullable(),
  dominantColor: z.string().nullable(),
  supportedAndroidVersions: z.array(z.string()),
  focalPoint: FocalPointSchema.nullable(),
  safeAreaMetadata: SafeAreaMetadataSchema.nullable(),
}).meta({ id: "AdminWallpaperDetail" });

export const AdminWallpaperRowItem = z
  .object({ wallpaperId: z.string(), position: z.number().int() })
  .meta({ id: "AdminWallpaperRowItem" });

export const AdminWallpaperRowListItem = z
  .object({
    id: z.string(),
    rowKey: z.string(),
    title: z.string(),
    rowType: rowTypeEnum,
    iconKey: z.string().nullable(),
    mediaTypeFilter: mediaTypeEnum.nullable(),
    deityTagFilter: z.string().nullable(),
    maxItems: z.number().int(),
    displayOrder: z.number().int(),
    isActive: z.boolean(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .meta({ id: "AdminWallpaperRowListItem" });

/**
 * One `(locale, title)` override row as the row detail returns it (TAM-111; NOT
 * localized — every locale is listed). `title` is a plain `z.string()` on the
 * response (the write bodies carry the length constraints).
 */
export const AdminWallpaperRowTranslationView = translationView({
  title: z.string(),
}).meta({ id: "AdminWallpaperRowTranslationView" });

export const AdminWallpaperRowDetail = AdminWallpaperRowListItem.extend({
  items: z.array(AdminWallpaperRowItem),
  // TAM-111: the row's per-locale `title` overrides, embedded in the entity
  // (the standalone translations sub-resource is gone).
  translations: z.array(AdminWallpaperRowTranslationView),
}).meta({ id: "AdminWallpaperRowDetail" });

// ---------------------------------------------------------------------------
// response envelopes
// ---------------------------------------------------------------------------

/**
 * Single-item admin success envelope. Defined locally (rather than importing
 * `auth`'s `envelope`) so the wallpaper module owns its own contract and does
 * not reach into another module's route schemas.
 */
function adminEnvelope<T extends z.ZodTypeAny>(data: T) {
  return z.object({ success: z.literal(true), message: z.string(), data });
}

export const AdminWallpaperListResponse = adminPagedEnvelope(
  AdminWallpaperListItem
).meta({ id: "AdminWallpaperListResponse" });
export const AdminWallpaperDetailResponse = adminEnvelope(
  AdminWallpaperDetail
).meta({ id: "AdminWallpaperDetailResponse" });
export const AdminWallpaperRowListResponse = adminPagedEnvelope(
  AdminWallpaperRowListItem
).meta({ id: "AdminWallpaperRowListResponse" });
export const AdminWallpaperRowDetailResponse = adminEnvelope(
  AdminWallpaperRowDetail
).meta({ id: "AdminWallpaperRowDetailResponse" });
export const AdminWallpaperRowItemsResponse = adminEnvelope(
  z.array(AdminWallpaperRowItem)
).meta({ id: "AdminWallpaperRowItemsResponse" });

export const ErrorEnvelope = z
  .object({
    success: z.literal(false),
    message: z.string(),
    data: z.null(),
    errorCode: z.string().optional(),
  })
  .meta({ id: "AdminWallpaperErrorEnvelope" });
