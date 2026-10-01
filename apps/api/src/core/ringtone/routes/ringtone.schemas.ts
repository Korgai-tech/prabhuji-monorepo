import { z } from "zod";
import { localeQuery, mediaUrl } from "@api/shared/schemas";
import { RINGTONE_SET_TARGETS } from "@api/core/ringtone/types";

/**
 * Zod schemas for the Ringtone module (TAM-67) — the single source of truth for
 * the OpenAPI contract emitted by `pnpm nx run api:openapi` and the generated
 * TS + Dart clients.
 *
 * #EXPORT_CRITICAL: the FREE grid/search CARD schema has NO `audioUrl` field at
 * all — discovery cannot leak a playable URL because the shape has nowhere to
 * put one. On the DETAIL schema `audioUrl` is `mediaUrl.nullable()`; the service
 * nulls it for non-Pro callers before serialization — this nullable response
 * schema is the second, contract-level guard.
 *
 * #EXPORT_CRITICAL: `setTarget` is the EXACT set {phone_ringtone}; alarm/
 * notification/contact are rejected here (→ 400).
 */

// ---- request --------------------------------------------------------------

/**
 * `GET /ringtones` grid query. `deityId` is a deity SLUG (TAM-57 convention).
 * `locale` (TAM-108) is an optional language filter: when present, only rows
 * whose `languages` set CONTAINS it — OR whose set is EMPTY (available in all
 * languages) — are returned. Absent → no language filtering.
 */
export const RingtoneGridQuery = z.object({
  deityId: z.string().min(1).optional(),
  ...localeQuery.shape,
  cursor: z.string().optional(),
  limit: z.coerce.number().int().positive().max(50).default(20),
});
export type RingtoneGridQueryInput = z.infer<typeof RingtoneGridQuery>;

/**
 * `GET /ringtones/search` query. Empty/absent `q` → the unfiltered grid.
 * `locale` (TAM-108) applies the same language-membership filter as the grid.
 */
export const RingtoneSearchQuery = z.object({
  q: z.string().max(200).optional(),
  ...localeQuery.shape,
  cursor: z.string().optional(),
  limit: z.coerce.number().int().positive().max(50).default(20),
});
export type RingtoneSearchQueryInput = z.infer<typeof RingtoneSearchQuery>;

/** `:id` path param (detail / write paths). */
export const RingtoneIdParam = z.object({ id: z.uuid() });
export type RingtoneIdParamInput = z.infer<typeof RingtoneIdParam>;

/**
 * `POST /ringtones/:id/play-count` body — the client asserts elapsed playback;
 * the SERVER validates it against the ≥3s / ≥25% rule. `sessionToken` dedupes a
 * replay/retry so a play is counted at most once per session.
 */
export const PlayCountBody = z
  .object({
    sessionToken: z.string().min(1).max(200),
    playbackPositionSeconds: z.number().nonnegative(),
  })
  .meta({ id: "RingtonePlayCountBody" });
export type PlayCountBodyInput = z.infer<typeof PlayCountBody>;

/**
 * `POST /ringtones/:id/set-count` body. #EXPORT_CRITICAL — `setTarget` is
 * `phone_ringtone` ONLY in Phase 1; anything else is rejected here (→ 400).
 */
export const SetCountBody = z
  .object({
    setTarget: z.enum(RINGTONE_SET_TARGETS),
  })
  .meta({ id: "RingtoneSetCountBody" });
export type SetCountBodyInput = z.infer<typeof SetCountBody>;

// ---- response components --------------------------------------------------

/** FREE grid/search card — metadata + thumbnail only; NO audio/preview URL. */
export const RingtoneCardSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    thumbnailImageUrl: mediaUrl,
    playCount: z.number().int(),
    setCount: z.number().int(),
    // `deityId` is the deity SLUG (the only deity id on the wire).
    deityId: z.string(),
    deityName: z.string(),
  })
  .meta({ id: "RingtoneCard" });

export const RingtoneGridResponse = z
  .object({
    success: z.literal(true),
    message: z.string(),
    data: z.object({
      items: z.array(RingtoneCardSchema),
      nextCursor: z.string().nullable(),
    }),
  })
  .meta({ id: "RingtoneGridResponse" });

export const RingtoneSearchResponse = z
  .object({
    success: z.literal(true),
    message: z.string(),
    data: z.object({
      items: z.array(RingtoneCardSchema),
      nextCursor: z.string().nullable(),
      resultCount: z.number().int(),
    }),
  })
  .meta({ id: "RingtoneSearchResponse" });

/** Full detail. #EXPORT_CRITICAL — audioUrl null for free users. */
export const RingtoneDetailSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    thumbnailImageUrl: mediaUrl,
    // #EXPORT_CRITICAL — null for free users.
    audioUrl: mediaUrl.nullable(),
    playCount: z.number().int(),
    setCount: z.number().int(),
    likeCount: z.number().int(),
    shareCount: z.number().int(),
    likedByMe: z.boolean(),
    deityId: z.string(),
    deityName: z.string(),
    // TAM-108 multi-language availability set; `[]` = all languages.
    languages: z.array(z.string()),
  })
  .meta({ id: "RingtoneDetail" });

export const RingtoneDetailResponse = z
  .object({
    success: z.literal(true),
    message: z.string(),
    data: RingtoneDetailSchema,
  })
  .meta({ id: "RingtoneDetailResponse" });

export const RingtonePlayCountResult = z
  .object({
    ringtoneId: z.string(),
    counted: z.boolean(),
    playCount: z.number().int(),
  })
  .meta({ id: "RingtonePlayCountResult" });

export const RingtonePlayCountResponse = z
  .object({
    success: z.literal(true),
    message: z.string(),
    data: RingtonePlayCountResult,
  })
  .meta({ id: "RingtonePlayCountResponse" });

export const RingtoneSetCountResult = z
  .object({
    ringtoneId: z.string(),
    setCount: z.number().int(),
  })
  .meta({ id: "RingtoneSetCountResult" });

export const RingtoneSetCountResponse = z
  .object({
    success: z.literal(true),
    message: z.string(),
    data: RingtoneSetCountResult,
  })
  .meta({ id: "RingtoneSetCountResponse" });

export const RingtoneLikeResult = z
  .object({
    ringtoneId: z.string(),
    liked: z.boolean(),
    likeCount: z.number().int(),
  })
  .meta({ id: "RingtoneLikeResult" });

export const RingtoneLikeResponse = z
  .object({
    success: z.literal(true),
    message: z.string(),
    data: RingtoneLikeResult,
  })
  .meta({ id: "RingtoneLikeResponse" });

export const RingtoneShareCountResult = z
  .object({
    ringtoneId: z.string(),
    shareCount: z.number().int(),
  })
  .meta({ id: "RingtoneShareCountResult" });

export const RingtoneShareCountResponse = z
  .object({
    success: z.literal(true),
    message: z.string(),
    data: RingtoneShareCountResult,
  })
  .meta({ id: "RingtoneShareCountResponse" });

export const ErrorEnvelope = z
  .object({
    success: z.literal(false),
    message: z.string(),
    data: z.null(),
    errorCode: z.string().optional(),
  })
  .meta({ id: "RingtoneErrorEnvelope" });
