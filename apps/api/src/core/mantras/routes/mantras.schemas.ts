import { z } from "zod";
import { localeQuery, mediaUrl } from "@api/shared/schemas";
import {
  MANTRA_AUDIO_SECTION_TYPES,
  MANTRA_LAYOUT_TYPES,
  MANTRA_PLAYLIST_SOURCES,
  MANTRA_REPEAT_TARGETS,
  MANTRA_SECTION_TYPES,
} from "@api/core/mantras/types";
import type { MantraRepeatTarget } from "@api/core/mantras/types";

/**
 * The japa target is the EXACT set {7,11,21,108,1008}. Modeled as a plain
 * integer with a type-predicate refinement (not a literal union) so the emitted
 * OpenAPI stays `type: integer` — an integer `enum` breaks the Dart client
 * generator (int enums emit an unusable class). Runtime validation is identical:
 * anything outside the set is rejected → 400.
 */
const repeatTargetSchema = z
  .number()
  .int()
  .refine(
    (v): v is MantraRepeatTarget =>
      (MANTRA_REPEAT_TARGETS as readonly number[]).includes(v),
    { message: "repeatTarget must be one of 7, 11, 21, 108, 1008" }
  );

/**
 * Zod schemas for the Mantras & Stutis module (TAM-65) — the single source of
 * truth for the OpenAPI contract emitted by `pnpm nx run api:openapi` and the
 * generated TS + Dart clients.
 *
 * #EXPORT_CRITICAL: `audioUrl` is modelled as `mediaUrl.nullable()` on EVERY
 * audio-bearing shape. The service nulls it for non-Pro callers before
 * serialization; this nullable response schema is the second, contract-level
 * guard — a leaked URL for a free user is impossible without also regressing
 * this schema AND the service simultaneously.
 *
 * #EXPORT_CRITICAL: `mantraText` is a plain `z.string()` (no `.trim()`, no
 * transform) so the Devanagari line breaks round-trip byte-for-byte.
 */

// ---- request --------------------------------------------------------------

/**
 * `GET /mantras/items` listing query. Plain (un-`.meta`-tagged) ZodObject —
 * `@fastify/swagger` can't resolve named component refs for querystring params.
 * The "at most one primary filter" rule is enforced in the SERVICE.
 */
export const MantraListQuery = z.object({
  categoryId: z.uuid().optional(),
  // A deity SLUG (e.g. "shiva") — TAM-57 exposes only slugs to clients.
  deityId: z.string().min(1).optional(),
  // TAM-108: LANGUAGE MEMBERSHIP filter. Returns items whose `languages` set
  // contains this locale, plus items with an empty set (= all languages).
  // Combinable with a primary filter. Was `language` until the platform-wide
  // `locale` standardization — the shared fragment is now the only definition.
  ...localeQuery.shape,
  sectionType: z.enum(MANTRA_AUDIO_SECTION_TYPES).optional(),
  // TAM-160: Show-all for ONE curated section — its hand-picked list in the
  // saved order. A PRIMARY filter (mutually exclusive with categoryId /
  // deityId / sectionType); an unknown or non-curated id yields an empty page.
  sectionId: z.uuid().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().positive().max(30).default(20),
});
export type MantraListQueryInput = z.infer<typeof MantraListQuery>;

/**
 * `GET /mantras/items/:id` query — names the playlist surface the item was
 * opened from so the SERVER resolves the ordered group.
 *
 * TAM-110: `locale` (the caller's content language) is REUSED as the label
 * locale — it localizes the detail's category-tag labels against their
 * per-locale overrides. Optional: absent ⇒ the base labels.
 */
export const MantraDetailQuery = z.object({
  // TOLERANT on purpose (the `locale` rule in apps/api/CLAUDE.md, applied to
  // this param): an UNRECOGNISED source is a no-match that falls back to the
  // default `listing` playlist, never a 400. A strict enum here meant any app
  // build naming a surface this server predates lost playback entirely rather
  // than degrading — exactly what TAM-160's `curated` rows hit. The RESPONSE's
  // `playlistSource` stays a strict enum: the server only ever reports a source
  // it actually resolved.
  source: z.string().min(1).max(40).optional(),
  sourceId: z.string().min(1).optional(),
  ...localeQuery.shape,
});
export type MantraDetailQueryInput = z.infer<typeof MantraDetailQuery>;

/**
 * `GET /mantras/sections` query. TAM-110: `locale` (the caller's content
 * language) is REUSED as the label locale — it localizes the section titles and
 * category-card names against their per-locale overrides. Optional: absent ⇒ the
 * base labels.
 */
export const MantraSectionsQuery = z.object({
  ...localeQuery.shape,
});
export type MantraSectionsQueryInput = z.infer<typeof MantraSectionsQuery>;

/** `:id` path param (item detail / write paths). */
export const ItemIdParam = z.object({ id: z.uuid() });
export type ItemIdParamInput = z.infer<typeof ItemIdParam>;

/** `:deityId` (a deity SLUG) path param for the deity playlist. */
export const DeityPlaylistParam = z.object({ deityId: z.string().min(1) });
export type DeityPlaylistParamInput = z.infer<typeof DeityPlaylistParam>;

/** `:categoryId` (uuid) path param for the category playlist. */
export const CategoryPlaylistParam = z.object({ categoryId: z.uuid() });
export type CategoryPlaylistParamInput = z.infer<typeof CategoryPlaylistParam>;

/** `POST /mantras/items/:id/recently-played` body — all fields optional. */
export const RecentlyPlayedBody = z
  .object({
    lastProgressSeconds: z.number().int().nonnegative().optional(),
  })
  .meta({ id: "MantraRecentlyPlayedBody" });
export type RecentlyPlayedBodyInput = z.infer<typeof RecentlyPlayedBody>;

/**
 * `PUT /mantras/counter-preference` body. #EXPORT_CRITICAL — the japa target is
 * the EXACT set {7,11,21,108,1008}; anything else is rejected here (→ 400).
 */
export const CounterPreferenceBody = z
  .object({
    repeatTarget: repeatTargetSchema,
  })
  .meta({ id: "MantraCounterPreferenceBody" });
export type CounterPreferenceBodyInput = z.infer<typeof CounterPreferenceBody>;

// ---- response components --------------------------------------------------

/** Compact mantra card inside a homepage section (union member). */
export const MantraPreviewSchema = z
  .object({
    kind: z.literal("mantra"),
    id: z.string(),
    title: z.string(),
    artworkUrl: mediaUrl,
    singerName: z.string().nullable(),
    // #EXPORT_CRITICAL — null for free users (this nulling IS the pro gate; lock
    // badges are banned on discovery cards and the app reads URL nullness).
    audioUrl: mediaUrl.nullable(),
    likeCount: z.number().int(),
    shareCount: z.number().int(),
    likedByMe: z.boolean(),
  })
  .meta({ id: "MantraPreview" });

/** Deity taxonomy card (TAM-57 deity facade). */
export const MantraDeityCard = z
  .object({
    kind: z.literal("deity"),
    slug: z.string(),
    displayName: z.string(),
    iconUrl: mediaUrl,
  })
  .meta({ id: "MantraDeityCard" });

/** Browse-category card. */
export const MantraCategoryCard = z
  .object({
    kind: z.literal("category"),
    id: z.string(),
    slug: z.string(),
    name: z.string(),
    imageUrl: mediaUrl.nullable(),
    backgroundColorToken: z.string().nullable(),
  })
  .meta({ id: "MantraCategoryCard" });

/** A section's typed item — discriminated on `kind`. */
export const MantraSectionItem = z.discriminatedUnion("kind", [
  MantraPreviewSchema,
  MantraDeityCard,
  MantraCategoryCard,
]);

/** One ordered homepage section. */
export const MantraSectionSchema = z
  .object({
    // TAM-160: present on EVERY section (mirrors `WallpaperHomeRow.rowId`) — the
    // app passes it back as `?sectionId=` to page a curated section's Show-all.
    sectionId: z.string(),
    sectionType: z.enum(MANTRA_SECTION_TYPES),
    title: z.string(),
    layoutType: z.enum(MANTRA_LAYOUT_TYPES),
    showAllEnabled: z.boolean(),
    sortOrder: z.number().int(),
    items: z.array(MantraSectionItem),
  })
  .meta({ id: "MantraSection" });

export const MantraSectionsResponse = z
  .object({
    success: z.literal(true),
    message: z.string(),
    data: z.object({ sections: z.array(MantraSectionSchema) }),
  })
  .meta({ id: "MantraSectionsResponse" });

/** A row of the reusable `/mantras/items` listing (also the playlist element). */
export const MantraListItemSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    artworkUrl: mediaUrl,
    singerName: z.string().nullable(),
    // TAM-108: availability language set (`[]` = all languages).
    languages: z.array(z.string()),
    // #EXPORT_CRITICAL — null for free users (the pro gate; see MantraPreview).
    audioUrl: mediaUrl.nullable(),
    likeCount: z.number().int(),
    shareCount: z.number().int(),
    likedByMe: z.boolean(),
  })
  .meta({ id: "MantraListItem" });

export const MantraListResponse = z
  .object({
    success: z.literal(true),
    message: z.string(),
    data: z.object({
      items: z.array(MantraListItemSchema),
      nextCursor: z.string().nullable(),
    }),
  })
  .meta({ id: "MantraListResponse" });

/** Full mantra detail. `mantraText` is verbatim Devanagari (line breaks intact). */
export const MantraDetailSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    artworkUrl: mediaUrl,
    singerName: z.string().nullable(),
    // TAM-108: availability language set (`[]` = all languages).
    languages: z.array(z.string()),
    // #EXPORT_CRITICAL — null for free users (the pro gate; see MantraPreview).
    audioUrl: mediaUrl.nullable(),
    likeCount: z.number().int(),
    shareCount: z.number().int(),
    likedByMe: z.boolean(),
    // #EXPORT_CRITICAL — line breaks preserved; NOT trimmed/normalized.
    mantraText: z.string(),
    transliterationText: z.string().nullable(),
    deepLinkUrl: z.string().nullable(),
    // TAM-108: the SINGLE deity (resolved from `deitySlug`), or null.
    deity: MantraDeityCard.nullable(),
  })
  .meta({ id: "MantraDetail" });

export const MantraDetailResponse = z
  .object({
    success: z.literal(true),
    message: z.string(),
    data: z.object({
      item: MantraDetailSchema,
      playlist: z.array(MantraListItemSchema),
      playlistSource: z.enum(MANTRA_PLAYLIST_SOURCES),
    }),
  })
  .meta({ id: "MantraDetailResponse" });

export const MantraPlaylistResponse = z
  .object({
    success: z.literal(true),
    message: z.string(),
    data: z.object({
      firstItem: MantraListItemSchema.nullable(),
      playlist: z.array(MantraListItemSchema),
      playlistSource: z.enum(MANTRA_PLAYLIST_SOURCES),
    }),
  })
  .meta({ id: "MantraPlaylistResponse" });

export const MantraRecentlyPlayedResult = z
  .object({
    itemId: z.string(),
    playCount: z.number().int(),
    lastPlayedAt: z.string().datetime(),
    lastProgressSeconds: z.number().int().nullable(),
  })
  .meta({ id: "MantraRecentlyPlayedResult" });

export const MantraRecentlyPlayedResponse = z
  .object({
    success: z.literal(true),
    message: z.string(),
    data: MantraRecentlyPlayedResult,
  })
  .meta({ id: "MantraRecentlyPlayedResponse" });

export const MantraLikeResult = z
  .object({
    itemId: z.string(),
    liked: z.boolean(),
    likeCount: z.number().int(),
  })
  .meta({ id: "MantraLikeResult" });

export const MantraLikeResponse = z
  .object({
    success: z.literal(true),
    message: z.string(),
    data: MantraLikeResult,
  })
  .meta({ id: "MantraLikeResponse" });

/**
 * The japa counter preference: the caller's CHOSEN target plus the full list of
 * selectable targets, so the client renders the option picker from the server's
 * `MANTRA_REPEAT_TARGETS` instead of hardcoding `[7, 11, 21, 108, 1008]`.
 *
 * #EXPORT_CRITICAL — BOTH fields are plain integers / an integer ARRAY, NOT an
 * OpenAPI integer `enum` (same reason as `repeatTargetSchema` above: an int enum
 * emits an unusable class from the Dart client generator). The set is still
 * server-authoritative — `availableTargets` is sourced from
 * `MANTRA_REPEAT_TARGETS`, the same constant the write path validates against, so
 * the picker can never offer a value the `PUT` would reject with a 400.
 */
export const MantraCounterPreferenceResult = z
  .object({
    repeatTarget: z.number().int(),
    availableTargets: z
      .array(z.number().int())
      .describe(
        "Every selectable japa target, in display order — the server-owned option list for the counter picker (currently 7, 11, 21, 108, 1008). Sourced from the same constant the PUT validates against; the client must render this list, never a hardcoded one."
      ),
  })
  .meta({ id: "MantraCounterPreferenceResult" });

export const MantraCounterPreferenceResponse = z
  .object({
    success: z.literal(true),
    message: z.string(),
    data: MantraCounterPreferenceResult,
  })
  .meta({ id: "MantraCounterPreferenceResponse" });

export const ErrorEnvelope = z
  .object({
    success: z.literal(false),
    message: z.string(),
    data: z.null(),
    errorCode: z.string().optional(),
  })
  .meta({ id: "MantraErrorEnvelope" });
