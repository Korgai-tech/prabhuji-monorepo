import { z } from "zod";
import { localeQuery, mediaUrl } from "@api/shared/schemas";
import {
  WALLPAPER_COUNT_TYPES,
  WALLPAPER_MEDIA_TYPES,
  WALLPAPER_ROW_TYPES,
} from "@api/core/wallpaper/types";

/**
 * Zod schemas for the Wallpaper module (TAM-69) — the single source of truth for
 * the OpenAPI contract emitted by `pnpm nx run api:openapi` and the generated
 * TS + Dart clients.
 *
 * DISCOVERY IS FREE: there is NO entitlement gate and NO Pro-only field. Every
 * preview + apply asset URL is present in the response for any authenticated
 * user (the device Set action is Pro but gated CLIENT-SIDE, TAM-70). All routes
 * still require the JWT guard.
 */

const mediaType = z.enum(WALLPAPER_MEDIA_TYPES);
const rowType = z.enum(WALLPAPER_ROW_TYPES);

// ---- request --------------------------------------------------------------

/**
 * `GET /wallpaper/home` query — optional deity-slug narrowing plus an optional
 * `locale` language filter (TAM-108). When `locale` is supplied, an item is
 * shown only if its `languages` set contains it OR is empty (empty = all).
 */
export const WallpaperHomeQuery = z.object({
  deityId: z.string().min(1).optional(),
  ...localeQuery.shape,
});
export type WallpaperHomeQueryInput = z.infer<typeof WallpaperHomeQuery>;

/**
 * `GET /wallpaper/list` query — filter by `deityId` OR `rowId` (at most one),
 * plus an optional `locale` language filter (TAM-108; empty-`languages` items
 * are always shown).
 */
export const WallpaperListQuery = z.object({
  deityId: z.string().min(1).optional(),
  rowId: z.uuid().optional(),
  ...localeQuery.shape,
  cursor: z.string().optional(),
  limit: z.coerce.number().int().positive().max(50).default(20),
});
export type WallpaperListQueryInput = z.infer<typeof WallpaperListQuery>;

/** `:id` path param (detail / write paths). */
export const WallpaperIdParam = z.object({ id: z.uuid() });
export type WallpaperIdParamInput = z.infer<typeof WallpaperIdParam>;

/** `POST /wallpaper/:id/count` body — `share` or `set` (never `like`). */
export const WallpaperCountBody = z
  .object({ type: z.enum(WALLPAPER_COUNT_TYPES) })
  .meta({ id: "WallpaperCountBody" });
export type WallpaperCountBodyInput = z.infer<typeof WallpaperCountBody>;

// ---- response components --------------------------------------------------

/** A two-column-grid card — carries `mediaType` for the LIVE badge. */
export const WallpaperCardSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    mediaType,
    thumbnailUrl: mediaUrl,
    previewImageUrl: mediaUrl,
    deitySlug: z.string().nullable(),
    setCount: z.number().int(),
    likeCount: z.number().int(),
    shareCount: z.number().int(),
    likedByMe: z.boolean(),
  })
  .meta({ id: "WallpaperCard" });

const FocalPointSchema = z
  .object({ x: z.number(), y: z.number() })
  .meta({ id: "WallpaperFocalPoint" });

const SafeAreaSchema = z
  .object({
    top: z.number(),
    bottom: z.number(),
    left: z.number(),
    right: z.number(),
  })
  .meta({ id: "WallpaperSafeArea" });

const WallpaperDeitySchema = z
  .object({
    slug: z.string(),
    displayName: z.string(),
    iconUrl: mediaUrl,
  })
  .meta({ id: "WallpaperDeity" });

/** Full detail — every preview + apply asset field (all FREE). */
export const WallpaperDetailSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    mediaType,
    thumbnailUrl: mediaUrl,
    previewImageUrl: mediaUrl,
    previewVideoUrl: mediaUrl.nullable(),
    liveWallpaperAssetUrl: mediaUrl.nullable(),
    liveWallpaperPackage: z.string().nullable(),
    fallbackStaticThumbnailUrl: mediaUrl.nullable(),
    altText: z.string().nullable(),
    dominantColor: z.string().nullable(),
    supportedAndroidVersions: z.array(z.string()),
    focalPoint: FocalPointSchema.nullable(),
    safeAreaMetadata: SafeAreaSchema.nullable(),
    deity: WallpaperDeitySchema.nullable(),
    languages: z.array(z.string()),
    setCount: z.number().int(),
    likeCount: z.number().int(),
    shareCount: z.number().int(),
    likedByMe: z.boolean(),
    createdAt: z.string(),
  })
  .meta({ id: "WallpaperDetail" });

const WallpaperHomeRowSchema = z
  .object({
    rowId: z.string(),
    title: z.string(),
    rowType,
    iconKey: z.string().nullable(),
    items: z.array(WallpaperCardSchema),
  })
  .meta({ id: "WallpaperHomeRow" });

// ---- response envelopes ---------------------------------------------------

export const WallpaperHomeResponse = z
  .object({
    success: z.literal(true),
    message: z.string(),
    data: z.object({
      rows: z.array(WallpaperHomeRowSchema),
    }),
  })
  .meta({ id: "WallpaperHomeResponse" });

export const WallpaperListResponse = z
  .object({
    success: z.literal(true),
    message: z.string(),
    data: z.object({
      items: z.array(WallpaperCardSchema),
      nextCursor: z.string().nullable(),
    }),
  })
  .meta({ id: "WallpaperListResponse" });

export const WallpaperDetailResponse = z
  .object({
    success: z.literal(true),
    message: z.string(),
    data: WallpaperDetailSchema,
  })
  .meta({ id: "WallpaperDetailResponse" });

export const WallpaperLikeResult = z
  .object({
    wallpaperId: z.string(),
    liked: z.boolean(),
    likeCount: z.number().int(),
  })
  .meta({ id: "WallpaperLikeResult" });

export const WallpaperLikeResponse = z
  .object({
    success: z.literal(true),
    message: z.string(),
    data: WallpaperLikeResult,
  })
  .meta({ id: "WallpaperLikeResponse" });

export const WallpaperCountResult = z
  .object({
    wallpaperId: z.string(),
    type: z.enum(WALLPAPER_COUNT_TYPES),
    count: z.number().int(),
  })
  .meta({ id: "WallpaperCountResult" });

export const WallpaperCountResponse = z
  .object({
    success: z.literal(true),
    message: z.string(),
    data: WallpaperCountResult,
  })
  .meta({ id: "WallpaperCountResponse" });

export const ErrorEnvelope = z
  .object({
    success: z.literal(false),
    message: z.string(),
    data: z.null(),
    errorCode: z.string().optional(),
  })
  .meta({ id: "WallpaperErrorEnvelope" });
