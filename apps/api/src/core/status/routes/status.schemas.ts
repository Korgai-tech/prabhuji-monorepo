import { z } from "zod";
import { localeQuery, mediaUrl } from "@api/shared/schemas";
import {
  STATUS_MEDIA_TYPES,
  STATUS_PROFILE_LIMITS,
  STATUS_PROFILE_TYPES,
} from "@api/core/status/types";

/**
 * Zod schemas for the Status Sharing module (TAM-71) — the single source of
 * truth for the OpenAPI contract emitted by `pnpm nx run api:openapi` and the
 * generated TS + Dart clients.
 *
 * EVERYTHING IS FREE: there is NO entitlement gate and NO Pro-only field. Every
 * feed media URL is present in the response for any authenticated user (the
 * final Share render is Pro but gated CLIENT-SIDE, TAM-72). All routes still
 * require the JWT guard.
 *
 * The overlay-profile char limits + Indian 10-digit mobile are enforced HERE at
 * the route boundary (a violation → 400 `VALIDATION_ERROR` via the global error
 * handler); the DB stores exactly what Zod already validated. No OTP in Phase 1.
 */

const mediaType = z.enum(STATUS_MEDIA_TYPES);
const profileType = z.enum(STATUS_PROFILE_TYPES);

/** Indian mobile: exactly 10 digits, first digit 6-9. Basic validation, no OTP. */
const INDIAN_MOBILE_RE = /^[6-9]\d{9}$/;

// ---- request --------------------------------------------------------------

/**
 * `GET /status/feed` query — optional single deity-slug filter, optional
 * `locale` MEMBERSHIP filter (TAM-108: the item lists this language, OR lists
 * none = available in all languages), + cursor page. Was `language` until the
 * platform-wide `locale` standardization.
 *
 * `pinnedId` (TAM-166): when set on the FIRST page (`cursor` absent), that
 * status is prepended to position 0 and deduped out of the tail. Ignored on
 * subsequent pages so a chat-recommended status does not repeat on every
 * scroll. Fail-soft in the service: an unknown or filter-excluded id logs a
 * warning and returns the normal feed unchanged (never a 404 for the caller).
 */
export const StatusFeedQuery = z.object({
  deityId: z.string().min(1).optional(),
  ...localeQuery.shape,
  cursor: z.string().optional(),
  limit: z.coerce.number().int().positive().max(50).default(20),
  pinnedId: z.uuid().optional(),
});
export type StatusFeedQueryInput = z.infer<typeof StatusFeedQuery>;

/** `:id` path param (like / view paths). */
export const StatusIdParam = z.object({ id: z.uuid() });
export type StatusIdParamInput = z.infer<typeof StatusIdParam>;

/**
 * `PUT /status/profile` body — upsert the reusable overlay profile.
 *
 * `activeProfileType` is the persona being saved/selected (it becomes active).
 * All persona fields are optional EXCEPT `businessName`, which is required when
 * saving a `business` profile. Char limits: name ≤ 40, businessName ≤ 50,
 * businessDetails ≤ 80. `businessMobileNumber` is an optional Indian 10-digit
 * string (no OTP). `avatarImageUrl` is an optional served https URL — the
 * pragmatic avatar mechanism for this repo (no object storage; see the module
 * header), fully validated by the shared `mediaUrl` guard.
 */
export const StatusProfileBody = z
  .object({
    activeProfileType: profileType,
    // Every field is `.nullable().optional()` so the mobile client can send
    // `null` for the fields that belong to the OTHER tab (saving Personal
    // sends business* as null, and vice versa) without a schema failure.
    // `null` and `undefined` are treated equivalently by the service: skip,
    // don't overwrite. Explicit clearing is not a Phase-1 requirement (PRD
    // §6.6).
    personalDisplayName: z
      .string()
      .max(STATUS_PROFILE_LIMITS.personalDisplayName)
      .nullable()
      .optional(),
    businessName: z
      .string()
      .max(STATUS_PROFILE_LIMITS.businessName)
      .nullable()
      .optional(),
    businessDetails: z
      .string()
      .max(STATUS_PROFILE_LIMITS.businessDetails)
      .nullable()
      .optional(),
    businessMobileNumber: z
      .string()
      .regex(INDIAN_MOBILE_RE, "Must be a valid Indian 10-digit mobile number")
      .nullable()
      .optional(),
    avatarImageUrl: mediaUrl.nullable().optional(),
  })
  .refine(
    (v) =>
      v.activeProfileType !== "business" ||
      (v.businessName ?? "").trim().length > 0,
    {
      error: "businessName is required when saving a business profile",
      path: ["businessName"],
    }
  )
  .meta({ id: "StatusProfileBody" });
export type StatusProfileBodyInput = z.infer<typeof StatusProfileBody>;

// ---- response components --------------------------------------------------

const OverlaySafeAreaSchema = z
  .object({
    top: z.number(),
    bottom: z.number(),
    left: z.number(),
    right: z.number(),
  })
  .meta({ id: "StatusOverlaySafeArea" });

/**
 * Who the status is attributed to. TAM-N — always the house creator today (the
 * catalogue is CMS-authored), but modelled per card so real user-generated
 * status can vary it later without a wire change.
 *
 * `avatarUrl` is nullable and currently ships `null`: the real asset does not
 * exist yet and a URL that 404s would give every card a broken-image slot. The
 * app renders a generic glyph instead.
 */
const StatusCreatorSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    avatarUrl: mediaUrl.nullable(),
  })
  .meta({ id: "StatusCreator" });

/** A status feed card — every media + overlay field (all FREE). */
export const StatusCardSchema = z
  .object({
    id: z.string(),
    slug: z.string(),
    title: z.string(),
    mediaType,
    imageUrl: mediaUrl.nullable(),
    videoUrl: mediaUrl.nullable(),
    thumbnailUrl: mediaUrl,
    overlaySafeArea: OverlaySafeAreaSchema,
    // TAM-108: the deity SLUG (`deities.slug`) this status belongs to — the
    // stable content tag, never the internal deity uuid. Served alongside the
    // display name so the client can tag analytics (`deity_slug`) and route
    // without reverse-mapping a localized label.
    deitySlug: z.string().nullable(),
    // TAM-108: the resolved deity display name.
    deityName: z.string().nullable(),
    // TAM-108: the language availability set ([] = all languages). Lenient
    // `string[]` on READ (WRITE is strict `LanguageCode[]`) so legacy values
    // backfilled from the deprecated free-text `language` column still serialize.
    languages: z.array(z.string()),
    shareCaption: z.string().nullable(),
    creator: StatusCreatorSchema,
    likeCount: z.number().int(),
    viewCount: z.number().int(),
    likedByMe: z.boolean(),
  })
  .meta({ id: "StatusCard" });

/** The reusable overlay profile (nullable fields = not yet saved). */
export const StatusProfileSchema = z
  .object({
    activeProfileType: profileType,
    personalDisplayName: z.string().nullable(),
    businessName: z.string().nullable(),
    businessDetails: z.string().nullable(),
    businessMobileNumber: z.string().nullable(),
    avatarImageUrl: z.string().nullable(),
    updatedAt: z.string().nullable(),
  })
  .meta({ id: "StatusProfile" });

// ---- response envelopes ---------------------------------------------------

export const StatusFeedResponse = z
  .object({
    success: z.literal(true),
    message: z.string(),
    data: z.object({
      items: z.array(StatusCardSchema),
      nextCursor: z.string().nullable(),
    }),
  })
  .meta({ id: "StatusFeedResponse" });

/**
 * `GET /status/:id` — single-card response. The chat surface pushes the
 * status player over the shell after fetching by id (mirrors the wallpaper
 * detail deep-link path). Same card shape as the feed items so the mobile
 * player screen can reuse `StatusFeedItem.fromCard`.
 */
export const StatusCardResponse = z
  .object({
    success: z.literal(true),
    message: z.string(),
    data: StatusCardSchema,
  })
  .meta({ id: "StatusCardResponse" });

export const StatusProfileResponse = z
  .object({
    success: z.literal(true),
    message: z.string(),
    data: StatusProfileSchema,
  })
  .meta({ id: "StatusProfileResponse" });

export const StatusLikeResult = z
  .object({
    statusId: z.string(),
    liked: z.boolean(),
    likeCount: z.number().int(),
  })
  .meta({ id: "StatusLikeResult" });

export const StatusLikeResponse = z
  .object({
    success: z.literal(true),
    message: z.string(),
    data: StatusLikeResult,
  })
  .meta({ id: "StatusLikeResponse" });

export const StatusViewResult = z
  .object({
    statusId: z.string(),
    viewCount: z.number().int(),
  })
  .meta({ id: "StatusViewResult" });

export const StatusViewResponse = z
  .object({
    success: z.literal(true),
    message: z.string(),
    data: StatusViewResult,
  })
  .meta({ id: "StatusViewResponse" });

/**
 * `POST /status/profile/avatar/presign` body — the mobile user's avatar
 * upload path (TAM-71 gap #1 closer). The client sends only `contentType` +
 * `sizeBytes`; the `(module, entity, field)` triple is HARDCODED server-side
 * to `status.userStatusProfile.avatarImageUrl`. This keeps `/admin/media/presign`
 * admin-only while giving regular users a scoped, tightly-typed upload seam.
 *
 * The media allowlist (`media.allowlist.ts:110`) already registers that triple
 * as `image/png|jpeg|webp` with the 10 MB image cap — so a wrong content type
 * or an oversized image is rejected inside the shared presign path, not here.
 */
export const StatusAvatarPresignBody = z
  .object({
    contentType: z.string().min(1),
    sizeBytes: z.number().int().positive(),
  })
  .meta({ id: "StatusAvatarPresignBody" });
export type StatusAvatarPresignBodyInput = z.infer<
  typeof StatusAvatarPresignBody
>;

export const StatusAvatarPresignData = z
  .object({
    /** The presigned S3 PUT URL. 5-minute bearer write capability. */
    uploadUrl: z.url(),
    /** Durable public GET URL, built from MEDIA_PUBLIC_BASE_URL. Save this
     *  as `avatarImageUrl` on the next PUT /status/profile. */
    publicUrl: z.string(),
    key: z.string(),
    expiresAt: z.iso.datetime(),
    /** Headers the client PUT MUST carry verbatim — every one is signed. */
    headers: z.record(z.string(), z.string()),
  })
  .meta({ id: "StatusAvatarPresignData" });

export const StatusAvatarPresignResponse = z
  .object({
    success: z.literal(true),
    message: z.string(),
    data: StatusAvatarPresignData,
  })
  .meta({ id: "StatusAvatarPresignResponse" });

export const ErrorEnvelope = z
  .object({
    success: z.literal(false),
    message: z.string(),
    data: z.null(),
    errorCode: z.string().optional(),
  })
  .meta({ id: "StatusErrorEnvelope" });
