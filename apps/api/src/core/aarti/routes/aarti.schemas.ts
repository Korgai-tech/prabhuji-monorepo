import { z } from "zod";
import { localeQuery, mediaUrl } from "@api/shared/schemas";
import {
  AARTI_AUDIO_SECTION_TYPES,
  AARTI_SECTION_TYPES,
} from "@api/core/aarti/types";

/**
 * Zod schemas for the Aarti & Bhajans module (TAM-63) — the single source of
 * truth for the OpenAPI contract emitted by `pnpm nx run api:openapi` and the
 * generated TS + Dart clients.
 *
 * #EXPORT_CRITICAL: `audioStreamUrl` is modelled as `mediaUrl.nullable()` on
 * EVERY audio-bearing shape. The service nulls it for non-Pro callers before
 * serialization; this nullable response schema is the second, contract-level
 * guard — a leaked URL for a free user is impossible without also regressing
 * this schema AND the service simultaneously.
 */

// ---- request --------------------------------------------------------------

/**
 * `GET /aarti/audios` listing query. Plain (un-`.meta`-tagged) ZodObject —
 * `@fastify/swagger` can't resolve named component refs for querystring params.
 *
 * The flat listing is NO LONGER user-sortable — it always serves a stable-shuffle
 * order (id ASC), so there is no `sort` param. `sectionType` survives as a FILTER
 * only: `recently_played` still selects the caller's history; the other values no
 * longer drive ordering. `limit` is bounded 1..30 (default 20) per spec (tighter
 * than the shared pagination max). The "exactly one primary filter" rule
 * (`categoryId` | `deityId` | `sectionType` | `sectionId`) is enforced in the
 * SERVICE (→ `400 VALIDATION_ERROR`) rather than a Zod `.refine`, keeping this a
 * plain object so the OpenAPI querystring emitter stays happy.
 */
export const AartiListQuery = z.object({
  categoryId: z.uuid().optional(),
  // A deity SLUG (e.g. "shiva") — TAM-57 exposes only slugs to clients, never a
  // deity uuid; the param keeps its spec name `deityId` but carries the slug.
  deityId: z.string().min(1).optional(),
  sectionType: z.enum(AARTI_AUDIO_SECTION_TYPES).optional(),
  // TAM-160: the Show-all of ONE curated section — its own primary filter rather
  // than a `sectionType` value, because there are MANY curated sections
  // (#PATH_DECISION 2). An unknown/non-curated id serves an empty page.
  sectionId: z.uuid().optional(),
  // TAM-108: requested locale. An item matches when its `languages` set contains
  // this code OR is empty (empty = available in all languages). A free string
  // (not the LanguageCode enum) so an unsupported locale is a no-match, not a 400.
  ...localeQuery.shape,
  cursor: z.string().optional(),
  limit: z.coerce.number().int().positive().max(30).default(20),
});
export type AartiListQueryInput = z.infer<typeof AartiListQuery>;

/** `:id` path param for detail + play. */
export const AudioIdParam = z.object({ id: z.uuid() });
export type AudioIdParamInput = z.infer<typeof AudioIdParam>;

/**
 * TAM-109: optional label locale for framing-label localization on the reads
 * that return `AudioCategory` / `HomepageSection` labels (`/aarti/main`,
 * `/aarti/audios/:id`). A free string (mirrors the existing `/aarti/audios`
 * `locale`) so an unsupported locale is a NO-MATCH that resolves to the base
 * column, never a 400 — existing mobile calls WITHOUT it keep serving the base
 * label unchanged. Plain (un-`.meta`-tagged) ZodObject like the other querystrings.
 */
export const AartiLocaleQuery = z.object({
  ...localeQuery.shape,
});
export type AartiLocaleQueryInput = z.infer<typeof AartiLocaleQuery>;

/** `POST /aarti/audios/:id/play` body — all fields optional. */
export const AartiPlayBody = z
  .object({
    lastPositionSeconds: z.number().int().nonnegative().optional(),
  })
  .meta({ id: "AartiPlayBody" });
export type AartiPlayBodyInput = z.infer<typeof AartiPlayBody>;

// ---- response components --------------------------------------------------

/** Compact audio card inside a homepage section (union member). */
export const AartiAudioPreview = z
  .object({
    kind: z.literal("audio"),
    id: z.string(),
    title: z.string(),
    coverImageUrl: mediaUrl,
    singerName: z.string().nullable(),
    isPrabhujiOriginal: z.boolean(),
    // #EXPORT_CRITICAL — null for free users (this nulling IS the pro gate; the
    // app reads URL nullness, and lock badges are banned on discovery cards).
    audioStreamUrl: mediaUrl.nullable(),
    likeCount: z.number().int(),
    shareCount: z.number().int(),
    likedByMe: z.boolean(),
  })
  .meta({ id: "AartiAudioPreview" });

/** Deity taxonomy card (TAM-57 deity facade). */
export const AartiDeityCard = z
  .object({
    kind: z.literal("deity"),
    slug: z.string(),
    displayName: z.string(),
    iconUrl: mediaUrl,
  })
  .meta({ id: "AartiDeityCard" });

/** Browse-category card. */
export const AartiCategoryCard = z
  .object({
    kind: z.literal("category"),
    id: z.string(),
    slug: z.string(),
    name: z.string(),
    imageUrl: mediaUrl.nullable(),
  })
  .meta({ id: "AartiCategoryCard" });

/** A section's typed item — discriminated on `kind`. */
export const AartiSectionItem = z.discriminatedUnion("kind", [
  AartiAudioPreview,
  AartiDeityCard,
  AartiCategoryCard,
]);

/** One ordered homepage section. */
export const AartiSectionSchema = z
  .object({
    // TAM-160: on EVERY section (mirrors `WallpaperHomeRow.rowId`) — it is what
    // a curated section's Show-all pages by (`/aarti/audios?sectionId=`).
    sectionId: z.string(),
    sectionType: z.enum(AARTI_SECTION_TYPES),
    title: z.string(),
    sortOrder: z.number().int(),
    items: z.array(AartiSectionItem),
  })
  .meta({ id: "AartiSection" });

export const AartiMainResponse = z
  .object({
    success: z.literal(true),
    message: z.string(),
    data: z.object({ sections: z.array(AartiSectionSchema) }),
  })
  .meta({ id: "AartiMainResponse" });

/** A row of the reusable `/aarti/audios` listing. */
export const AartiAudioListItem = z
  .object({
    id: z.string(),
    title: z.string(),
    coverImageUrl: mediaUrl,
    singerName: z.string().nullable(),
    composerNames: z.string().nullable(),
    // TAM-108: language-availability set ([] = all languages); supersedes `language`.
    languages: z.array(z.string()),
    isPrabhujiOriginal: z.boolean(),
    // #EXPORT_CRITICAL — null for free users (the pro gate; see AartiAudioPreview).
    audioStreamUrl: mediaUrl.nullable(),
    likeCount: z.number().int(),
    shareCount: z.number().int(),
    likedByMe: z.boolean(),
  })
  .meta({ id: "AartiAudioListItem" });

export const AartiListResponse = z
  .object({
    success: z.literal(true),
    message: z.string(),
    data: z.object({
      items: z.array(AartiAudioListItem),
      nextCursor: z.string().nullable(),
    }),
  })
  .meta({ id: "AartiListResponse" });

/** Full audio detail. */
export const AartiAudioDetail = z
  .object({
    id: z.string(),
    title: z.string(),
    coverImageUrl: mediaUrl,
    singerName: z.string().nullable(),
    composerNames: z.string().nullable(),
    // TAM-108: language-availability set ([] = all languages); supersedes `language`.
    languages: z.array(z.string()),
    isPrabhujiOriginal: z.boolean(),
    // #EXPORT_CRITICAL — null for free users (the pro gate; see AartiAudioPreview).
    audioStreamUrl: mediaUrl.nullable(),
    likeCount: z.number().int(),
    shareCount: z.number().int(),
    likedByMe: z.boolean(),
    // TAM-108: the single deity (resolved from `deitySlug`), or null when unset.
    deity: AartiDeityCard.nullable(),
  })
  .meta({ id: "AartiAudioDetail" });

export const AartiDetailResponse = z
  .object({
    success: z.literal(true),
    message: z.string(),
    data: AartiAudioDetail,
  })
  .meta({ id: "AartiDetailResponse" });

export const AartiPlayResult = z
  .object({
    audioId: z.string(),
    playCount: z.number().int(),
    lastPlayedAt: z.string().datetime(),
    lastPositionSeconds: z.number().int().nullable(),
  })
  .meta({ id: "AartiPlayResult" });

export const AartiPlayResponse = z
  .object({
    success: z.literal(true),
    message: z.string(),
    data: AartiPlayResult,
  })
  .meta({ id: "AartiPlayResponse" });

export const AartiLikeResult = z
  .object({
    audioId: z.string(),
    liked: z.boolean(),
    likeCount: z.number().int(),
  })
  .meta({ id: "AartiLikeResult" });

export const AartiLikeResponse = z
  .object({
    success: z.literal(true),
    message: z.string(),
    data: AartiLikeResult,
  })
  .meta({ id: "AartiLikeResponse" });

export const ErrorEnvelope = z
  .object({
    success: z.literal(false),
    message: z.string(),
    data: z.null(),
    errorCode: z.string().optional(),
  })
  .meta({ id: "AartiErrorEnvelope" });
