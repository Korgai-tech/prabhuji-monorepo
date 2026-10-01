import { z } from "zod";
import { gradientStop, hexColor, localeQuery, mediaUrl } from "@api/shared/schemas";
import { engagementContentType } from "@api/shared/schemas";
import {
  BANNER_DESTINATION_TYPES,
  BANNER_MEDIA_TYPES,
  FEED_BADGES,
  FEED_CONTENT_TYPES,
  SHORTCUT_DESTINATION_TYPES,
} from "@api/core/home/types";

/**
 * Zod schemas for the Home module (TAM-61) — the single source of truth for the
 * OpenAPI contract emitted by `pnpm nx run api:openapi` and the generated TS +
 * Dart clients.
 *
 * HOME IS NEVER PRO-GATED: banners, shortcuts + feed are served identically to
 * free and Pro users (PRD §5, §10). The only Pro-conditional signal is the server-authored
 * `isProFeatureDiscovery` banner flag the CLIENT resolves into a paywall route
 * (TAM-58) — it is authored in the seed, never sent by the client. All routes
 * require the JWT guard.
 *
 * The engagement WRITE bodies carry `(contentType, contentId)`; `contentType` is
 * validated against the shared engagement vocabulary and `contentId` is a uuid,
 * so a malformed body is a 400 at the boundary (never a 500). The feed cursor is
 * validated in the service (`decodeCursor`) — a stale/tampered cursor → 400.
 */

const bannerMediaType = z.enum(BANNER_MEDIA_TYPES);
const bannerDestinationType = z.enum(BANNER_DESTINATION_TYPES);
const shortcutDestinationType = z.enum(SHORTCUT_DESTINATION_TYPES);
const feedContentType = z.enum(FEED_CONTENT_TYPES);
const feedBadge = z.enum(FEED_BADGES);

// ---- request --------------------------------------------------------------

/**
 * `locale` content-language query (TAM-113) — OPTIONAL, one of the eight Phase-1
 * client languages (`LanguageCodeSchema`). When present the framing LABELS
 * (banner `title`, shortcut `label`, feed-card `title`/`subtitle`/`label`/
 * `ctaLabel`/`badgeLabel`) are resolved to that locale, falling back to the base
 * `en` column. When ABSENT the base columns are served unchanged, so existing
 * mobile calls that don't send it stay non-breaking. Inline (un-`.meta`-tagged) —
 * `@fastify/swagger` can't resolve named refs for querystring params.
 */
export const HomeLocaleQuery = z.object({
  ...localeQuery.shape,
});
export type HomeLocaleQueryInput = z.infer<typeof HomeLocaleQuery>;

/** `GET /home/feed` query — opaque cursor + bounded limit (1..30, default 10). */
export const HomeFeedQuery = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().positive().max(30).default(10),
  ...localeQuery.shape,
});
export type HomeFeedQueryInput = z.infer<typeof HomeFeedQuery>;

/**
 * `POST /home/engagement/like|view` body. `contentType` is restricted to the
 * shared engagement vocabulary (incl. `home_item` for a feed card); `contentId`
 * is a uuid. The JWT subject — never a body field — is the engagement identity.
 */
export const HomeEngagementBody = z
  .object({
    contentType: engagementContentType,
    contentId: z.uuid(),
  })
  .meta({ id: "HomeEngagementBody" });
export type HomeEngagementBodyInput = z.infer<typeof HomeEngagementBody>;

/** `POST /home/engagement/share` body — adds an optional analytics `channel`. */
export const HomeShareBody = z
  .object({
    contentType: engagementContentType,
    contentId: z.uuid(),
    channel: z.string().min(1).max(40).optional(),
  })
  .meta({ id: "HomeShareBody" });
export type HomeShareBodyInput = z.infer<typeof HomeShareBody>;

// ---- response components --------------------------------------------------

/** A hero banner. `informational` rows are non-navigable (`destinationValue`
 * null); `pro_paywall` rows carry the paywall id and force `isProFeatureDiscovery`. */
export const HomeBannerSchema = z
  .object({
    id: z.string(),
    mediaType: bannerMediaType.describe(
      "image | video. A `video` banner plays muted, looped and control-less behind its `thumbnailUrl` still; an `image` banner is just `mediaUrl`."
    ),
    mediaUrl,
    /**
     * The video still. Non-null for EVERY `video` row (the admin service refuses
     * to store a video banner without one) and null for every `image` row — the
     * two are validated as a pair in `home.admin.service.ts`.
     *
     * It is the client's first paint AND its failure fallback: the thumbnail
     * shows until the first video frame is ready, and stays up forever if the
     * video never decodes, so a broken banner still looks like a banner.
     */
    thumbnailUrl: mediaUrl
      .nullable()
      .describe(
        "Video still — non-null for `video` banners, null for `image` banners. The client paints it first and keeps it if the video fails to load."
      ),
    destinationType: bannerDestinationType.describe(
      "linked_module | content_detail | pro_paywall | informational. `informational` rows are non-navigable (destinationValue = null); `pro_paywall` rows carry the paywall id in destinationValue and force isProFeatureDiscovery."
    ),
    destinationValue: z
      .string()
      .nullable()
      .describe(
        "Module key, content id/deeplink, or paywall id. Always null for informational (non-navigable by contract)."
      ),
    isProFeatureDiscovery: z.boolean(),
    sortOrder: z.number().int(),
  })
  .meta({ id: "HomeBanner" });

/**
 * TAM-174 — a shortcut tile's CMS-owned palette: a vertical two-stop gradient
 * plus the label colour tuned to sit on it.
 *
 * A NAMED schema (not inlined) because it is a real wire object that the Dart
 * generator must emit as its own model — the client passes it around as a value.
 *
 * PRESENTATIONAL ONLY. Unlike `destinationValue` / `iconKey` these are plain
 * values rather than allowlisted keys; see `shared/schemas/color.ts` for why
 * that is safe here and is not a weakening of the destination-safety contract.
 */
export const HomeShortcutThemeSchema = z
  .object({
    backgroundFrom: hexColor.describe("Gradient top colour, `#RRGGBB`."),
    backgroundFromStop: gradientStop.describe(
      "Fraction down the card where `backgroundFrom` sits. May be negative."
    ),
    backgroundTo: hexColor.describe("Gradient bottom colour, `#RRGGBB`."),
    backgroundToStop: gradientStop.describe(
      "Fraction down the card where `backgroundTo` sits. MAY EXCEED 1 (e.g. 1.4734) — map to `Alignment`, never to Flutter `stops`."
    ),
    labelColor: hexColor.describe("Tile label colour, `#RRGGBB`."),
  })
  .meta({ id: "HomeShortcutTheme" });

/**
 * A feature-shortcut tile. Its `label` + `sortOrder` are CMS-owned (the app used
 * to hardcode both).
 *
 * #EXPORT_CRITICAL — `destinationValue` is a STABLE KEY, never a URL/path: the
 * client resolves it through a hardcoded route ALLOWLIST and no-ops on an unknown
 * key, so an untrusted CMS string can never become a raw deep link. `iconKey` is
 * a key into the client's BUNDLED icon assets (not an image URL).
 */
export const HomeShortcutSchema = z
  .object({
    id: z.string(),
    key: z
      .string()
      .describe(
        "Stable slug identifying the shortcut (e.g. `aarti_bhajans`). Also the client's icon-asset lookup key."
      ),
    label: z.string().describe("CMS-owned display copy — never hardcoded in the app."),
    destinationType: shortcutDestinationType.describe(
      "linked_module | content_detail | pro_paywall | informational — the SAME vocabulary as a banner's destination, so the client uses one allowlist resolver for both."
    ),
    destinationValue: z
      .string()
      .nullable()
      .describe(
        "A STABLE KEY the client resolves through its route allowlist (module key e.g. `wallpaper`/`aarti`/`mantras`/`ringtone`, content id, or paywall id) — NEVER a URL, path or raw deep link; an unknown key is a client no-op. Always null for informational (non-navigable by contract)."
      ),
    iconKey: z
      .string()
      .nullable()
      .describe(
        "Stable key → a bundled client icon asset (BC fallback for TAM-132's `iconUrl`). Not an image URL — distinct concern from `iconUrl` and deliberately NOT collapsed with it."
      ),
    // TAM-132 — CMS-owned icon URL. Nullable is load-bearing: it stays null for
    // pre-TAM-132 rows AND when ops has not yet populated a URL, and the client
    // falls back to the bundled `iconKey` asset in both cases. Validated as
    // `mediaUrl` (https-only in prod, https+localhost in dev).
    iconUrl: mediaUrl
      .nullable()
      .describe(
        "Wire-published CMS icon URL (TAM-132). Client priority is `iconUrl` → `iconKey`-keyed bundled asset → no art. Nullable so pre-TAM-132 rows still serve; validated as `mediaUrl` (https-only in prod)."
      ),
    // TAM-174 — per-tile palette, published only to the gradient arm of the
    // shortcut-grid experiment. Nullable is load-bearing and collapses THREE
    // states the client need not distinguish: control arm, experiment off, and
    // "gradient arm but this row is unthemed". All three render the app's
    // shipped flat gradient.
    theme: HomeShortcutThemeSchema.nullable().describe(
      "Per-tile gradient + label colour (TAM-174), or null. Null means the caller is in the experiment's control arm, the experiment is off, or this row has no palette — the client renders its shipped gradient for all three. Colours are `#RRGGBB`; PRESENTATIONAL ONLY (never a route or URL)."
    ),
    sortOrder: z.number().int().describe("CMS-owned grid order (ascending)."),
  })
  .meta({ id: "HomeShortcut" });

/** Assembled share payload for a feed card. */
export const ShareMetadataSchema = z
  .object({
    title: z.string(),
    text: z.string(),
    deepLink: z.string(),
    thumbnailUrl: mediaUrl.nullable(),
  })
  .meta({ id: "HomeShareMetadata" });

/** A mixed-feed card — every display/routing field + engagement + share meta. */
export const HomeFeedItemSchema = z
  .object({
    id: z.string(),
    contentType: feedContentType,
    module: z.string(),
    title: z.string(),
    subtitle: z.string().nullable(),
    mediaUrl,
    audioPreviewUrl: mediaUrl
      .nullable()
      .describe("Present only for aarti | mantra | ringtone cards."),
    ctaLabel: z.string(),
    ctaDestinationType: z.string(),
    ctaDestinationValue: z.string(),
    ctaContentId: z
      .string()
      .nullable()
      .optional()
      .describe(
        "UUID of the underlying content the CTA opens — a side-car to `ctaDestinationValue` (which stays a human-readable slug). Populated by the auto-feed sync so the client can build the correct by-id deep-link into per-content play screens (`/aarti-bhajans/audio/:id`, `/mantras/audio/:id`) that look up by id with no slug fallback. Absent / null on manually-authored admin cards ⇒ the client falls back to opening the owning module. Marked `optional()` so older server builds that don't yet emit this key still parse on the client without a schema break."
      ),
    headerDestinationModule: z.string(),
    label: z.string().nullable(),
    badge: feedBadge.nullable(),
    badgeLabel: z
      .string()
      .nullable()
      .describe(
        "CMS-owned DISPLAY COPY for `badge` (e.g. \"TRENDING\") — the client must render this string and never hardcode badge copy. Non-null EXACTLY when `badge` is non-null: a badged row whose CMS label is missing is served with BOTH fields null (an unlabelled badge is not renderable)."
      ),
    likeCount: z.number().int(),
    viewCount: z.number().int(),
    shareCount: z.number().int(),
    likedByMe: z.boolean(),
    shareMetadata: ShareMetadataSchema,
  })
  .meta({ id: "HomeFeedItem" });

// ---- response envelopes ---------------------------------------------------

export const HomeBannersResponse = z
  .object({
    success: z.literal(true),
    message: z.string(),
    data: z.object({ banners: z.array(HomeBannerSchema) }),
  })
  .meta({ id: "HomeBannersResponse" });

export const HomeShortcutsResponse = z
  .object({
    success: z.literal(true),
    message: z.string(),
    data: z.object({ shortcuts: z.array(HomeShortcutSchema) }),
  })
  .meta({ id: "HomeShortcutsResponse" });

export const HomeFeedResponse = z
  .object({
    success: z.literal(true),
    message: z.string(),
    data: z.object({
      items: z.array(HomeFeedItemSchema),
      nextCursor: z.string().nullable(),
    }),
  })
  .meta({ id: "HomeFeedResponse" });

export const HomeLikeResult = z
  .object({
    liked: z.boolean(),
    likeCount: z.number().int(),
  })
  .meta({ id: "HomeLikeResult" });

export const HomeLikeResponse = z
  .object({
    success: z.literal(true),
    message: z.string(),
    data: HomeLikeResult,
  })
  .meta({ id: "HomeLikeResponse" });

export const HomeViewResult = z
  .object({ viewCount: z.number().int() })
  .meta({ id: "HomeViewResult" });

export const HomeViewResponse = z
  .object({
    success: z.literal(true),
    message: z.string(),
    data: HomeViewResult,
  })
  .meta({ id: "HomeViewResponse" });

export const HomeShareResult = z
  .object({ shareCount: z.number().int() })
  .meta({ id: "HomeShareResult" });

export const HomeShareResponse = z
  .object({
    success: z.literal(true),
    message: z.string(),
    data: HomeShareResult,
  })
  .meta({ id: "HomeShareResponse" });

export const ErrorEnvelope = z
  .object({
    success: z.literal(false),
    message: z.string(),
    data: z.null(),
    errorCode: z.string().optional(),
  })
  .meta({ id: "HomeErrorEnvelope" });
