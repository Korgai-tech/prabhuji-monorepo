import { z } from "zod";
import {
  adminPagedEnvelope,
  adminPaginationQuery,
  gradientStop,
  hexColor,
  mediaUrl,
  sortQuery,
  translationInput,
  translationView,
} from "@api/shared/schemas";
import {
  BANNER_DESTINATION_TYPES,
  BANNER_MEDIA_TYPES,
  BANNER_SORT_FIELDS,
  FEED_BADGES,
  FEED_CONTENT_TYPES,
  FEED_SORT_FIELDS,
  HOME_MODULE_KEYS,
  SHORTCUT_DESTINATION_TYPES,
  SHORTCUT_SORT_FIELDS,
} from "@api/core/home/types";

/**
 * Zod schemas for the `/admin/home/*` write surface (TAM-104; ADR §C1–C5). The
 * single source of truth for the OpenAPI contract — every operation here is
 * tagged `admin` by `registerAdminRoute`, so TAM-85's filter drops it from
 * `openapi.public.json` (it must never reach the mobile Dart codegen).
 *
 * This module's DEFINING concern is DESTINATION SAFETY (#EXPORT_CRITICAL):
 * `destinationValue`, `ctaDestinationValue`, `module` and
 * `headerDestinationModule` are STABLE KEYS the client resolves through its own
 * hardcoded allowlist — NEVER URLs/paths/deep links. The Zod boundary rejects
 * anything URL-shaped outright (`stableKey`); the service pins the key against
 * `destinationType` (a `linked_module` value must be a known module key, an
 * `informational` row carries none, …). `shareDeepLink` is the ONE
 * routing-adjacent field that IS legitimately a URL (it is shared externally),
 * so it is validated as an absolute URL, not a key.
 *
 * The shape mirrors the epic exemplar (`deity.admin.schemas.ts`): `.strict()`
 * write bodies (server-authoritative fields rejected, not stripped), an
 * `updatedAt` precondition on every mutating write, immutable business keys
 * absent from the PATCH body (`slug`/`key`/`mediaType`), Zod-enum `sort`
 * allowlists, and per-entity list envelopes.
 */

// ---------------------------------------------------------------------------
// primitives
// ---------------------------------------------------------------------------

/**
 * The optimistic-concurrency precondition (ADR §C3): the client's last-known
 * `updatedAt`, echoed on every mutating write and put in the `WHERE` of an
 * `updateMany`. A 0-count means someone else wrote first → 409 `STALE_WRITE`.
 */
export const expectedUpdatedAt = z.string().datetime();

/**
 * True when a string is URL/path/deep-link shaped and therefore MUST NOT be
 * stored as a stable destination key. The schema calls such a value "by
 * definition a misconfiguration" (#EXPORT_CRITICAL). We reject a value that
 *   - contains `://` (an absolute URL / deep link), or
 *   - starts with `/` (an absolute path), or
 *   - carries a URI scheme prefix (`mailto:`, `app:`, `https:` …).
 * A module key (`aarti-bhajans`) or content slug (`hanuman-chalisa`) matches
 * none of these.
 */
function isUrlShaped(value: string): boolean {
  return (
    value.includes("://") ||
    value.startsWith("/") ||
    /^[a-z][a-z0-9+.-]*:/i.test(value)
  );
}

/**
 * A CMS-authored STABLE KEY (#EXPORT_CRITICAL). Non-empty, bounded, and — the
 * load-bearing rule — NOT URL-shaped. The per-`destinationType` correspondence
 * (a `linked_module` value must be a known module key, etc.) is pinned in the
 * service against the effective row.
 */
export const stableKey = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .refine((v) => !isUrlShaped(v), {
    message:
      "must be a stable key resolved by the client allowlist, never a URL, path or deep link",
  });

/** A module key from the allowlist mirroring the client's `_moduleRoutes`. */
export const moduleKey = z.enum(HOME_MODULE_KEYS);

/**
 * `slug` (feed items) / `key` (shortcuts) — the stable, idempotent-seed
 * business key. URL-safe: lowercase alphanumerics + single hyphens/underscores,
 * no whitespace. Immutable — validated on POST, deliberately ABSENT from PATCH.
 */
export const businessKey = z
  .string()
  .min(1)
  .max(96)
  .regex(
    /^[a-z0-9]+(?:[_-][a-z0-9]+)*$/,
    "must be lowercase alphanumerics separated by single hyphens or underscores, with no whitespace"
  );

/**
 * `shareDeepLink` — the ONE routing-adjacent field that IS a real URL (it is
 * shared externally, e.g. `https://example.com/prabhuji/app/<module>/<id>`).
 * Validated as an absolute URL, NOT rejected as URL-shaped. #PLAN_UNCERTAINTY:
 * confirmed against `home.seed.ts` (absolute `https` deep link).
 */
export const shareDeepLink = z.url().max(500);

/** `title`/`label`/`subtitle` free text — trimmed and bounded. */
const shortText = z.string().trim().min(1).max(200);

/** CMS display copy for a badge (e.g. "TRENDING"). */
const badgeLabel = z.string().trim().min(1).max(60);

// ---------------------------------------------------------------------------
// shared param + pairing helpers
// ---------------------------------------------------------------------------

export const AdminHomeIdParams = z.object({ id: z.uuid() });
export type AdminHomeIdParamsInput = z.infer<typeof AdminHomeIdParams>;

/**
 * `DELETE /admin/home/{entity}/:id` — a **deactivation** (`isActive = false`),
 * never a hard delete (ADR §C4). Carries the same `updatedAt` precondition as
 * PATCH, in the body. Reactivation is `PATCH { isActive: true }`.
 */
export const AdminHomeDeleteBody = z
  .object({ expectedUpdatedAt })
  .strict()
  .meta({ id: "AdminHomeDeleteBody" });
export type AdminHomeDeleteInput = z.infer<typeof AdminHomeDeleteBody>;

/**
 * The paired badge invariant (#EXPORT_CRITICAL): `badgeLabel` is CMS-owned
 * display copy and must be non-null EXACTLY when `badge` is non-null — an
 * unlabelled badge cannot be drawn without the client inventing copy, which the
 * product forbids. Enforced at the Zod boundary both ways.
 *
 * On CREATE both default to `null`, so the check is a simple both-or-neither.
 * On PATCH the two must be updated together (both present or both absent) so a
 * partial update can never leave the pairing broken.
 */
function refineBadgePairing(
  data: { badge?: unknown; badgeLabel?: unknown },
  ctx: z.RefinementCtx
): void {
  const hasBadge = data.badge !== undefined;
  const hasLabel = data.badgeLabel !== undefined;
  if (hasBadge !== hasLabel) {
    ctx.addIssue({
      code: "custom",
      message:
        "badge and badgeLabel must be provided together (both set or both cleared)",
      path: [hasBadge ? "badgeLabel" : "badge"],
    });
    return;
  }
  if (!hasBadge) return;
  const badgeNull = data.badge === null;
  const labelNull = data.badgeLabel === null;
  if (badgeNull !== labelNull) {
    ctx.addIssue({
      code: "custom",
      message:
        "badgeLabel must be non-null exactly when badge is non-null (an unlabelled badge cannot be drawn)",
      path: ["badgeLabel"],
    });
  }
}

// ===========================================================================
// HomeBanner
// ===========================================================================

export const AdminBannerListQuery = adminPaginationQuery
  .extend(sortQuery(BANNER_SORT_FIELDS).shape)
  .extend({
    isActive: z
      .enum(["true", "false"])
      .transform((v) => v === "true")
      .optional(),
    mediaType: z.enum(BANNER_MEDIA_TYPES).optional(),
    destinationType: z.enum(BANNER_DESTINATION_TYPES).optional(),
  });
export type AdminBannerListQueryInput = z.infer<typeof AdminBannerListQuery>;

/**
 * Banner label override — the nullable overlay `title` (TAM-113). Embedded in
 * the banner's own create/update body and echoed on the detail view; there is no
 * standalone translations sub-resource (the admin is a single-author tool).
 */
const bannerTranslationFields = { title: z.string().trim().min(1).max(200) };

export const AdminBannerTranslationView = translationView(
  bannerTranslationFields
).meta({ id: "AdminHomeBannerTranslationView" });

export const AdminBannerCreateBody = z
  .object({
    mediaType: z.enum(BANNER_MEDIA_TYPES),
    mediaUrl,
    thumbnailUrl: mediaUrl.nullable().optional(),
    title: shortText.nullable().optional(),
    destinationType: z.enum(BANNER_DESTINATION_TYPES),
    destinationValue: stableKey.nullable().optional(),
    isProFeatureDiscovery: z.boolean().default(false),
    sortOrder: z.number().int().default(0),
    isActive: z.boolean().default(true),
    translations: z.array(translationInput(bannerTranslationFields)).default([]),
  })
  .strict()
  .meta({ id: "AdminHomeBannerCreateBody" });
export type AdminBannerCreateInput = z.infer<typeof AdminBannerCreateBody>;

// NO `mediaType` (immutable — same rationale as slug/key). The thumbnail↔media
// correspondence is enforced in the service against the row's existing type.
export const AdminBannerPatchBody = z
  .object({
    expectedUpdatedAt,
    mediaUrl: mediaUrl.optional(),
    thumbnailUrl: mediaUrl.nullable().optional(),
    title: shortText.nullable().optional(),
    destinationType: z.enum(BANNER_DESTINATION_TYPES).optional(),
    destinationValue: stableKey.nullable().optional(),
    isProFeatureDiscovery: z.boolean().optional(),
    sortOrder: z.number().int().optional(),
    isActive: z.boolean().optional(),
    // undefined ⇒ translations untouched; provided (incl. `[]`) ⇒ REPLACE the set.
    translations: z.array(translationInput(bannerTranslationFields)).optional(),
  })
  .strict()
  .meta({ id: "AdminHomeBannerPatchBody" });
export type AdminBannerPatchInput = z.infer<typeof AdminBannerPatchBody>;

export const AdminBannerView = z
  .object({
    id: z.string(),
    mediaType: z.enum(BANNER_MEDIA_TYPES),
    mediaUrl,
    thumbnailUrl: mediaUrl.nullable(),
    title: z.string().nullable(),
    destinationType: z.enum(BANNER_DESTINATION_TYPES),
    destinationValue: z.string().nullable(),
    isProFeatureDiscovery: z.boolean(),
    sortOrder: z.number().int(),
    isActive: z.boolean(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .meta({ id: "AdminHomeBannerView" });

/** Detail — the admin row plus ALL its per-locale label overrides (every locale). */
export const AdminBannerDetailView = AdminBannerView.extend({
  translations: z.array(AdminBannerTranslationView),
}).meta({ id: "AdminHomeBannerDetailView" });

// ===========================================================================
// HomeFeedItem
// ===========================================================================

/**
 * TAM-175 — a deity slug REFERENCE (`deities.slug`), not an enum. Mirrors
 * `mantras.admin.schemas.ts`: the deity list is CMS data, so validating it as a
 * closed set here would mean a deploy every time ops adds a god.
 */
const deitySlugRef = z.string().trim().min(1).max(64);

export const AdminFeedListQuery = adminPaginationQuery
  .extend(sortQuery(FEED_SORT_FIELDS).shape)
  .extend({
    q: z.string().trim().min(1).max(100).optional(),
    isActive: z
      .enum(["true", "false"])
      .transform((v) => v === "true")
      .optional(),
    contentType: z.enum(FEED_CONTENT_TYPES).optional(),
    module: moduleKey.optional(),
    deitySlug: deitySlugRef.optional(),
    badge: z.enum(FEED_BADGES).optional(),
  });
export type AdminFeedListQueryInput = z.infer<typeof AdminFeedListQuery>;

/**
 * Feed-card framing overrides — all localized copy in ONE row (TAM-113).
 * Embedded in the feed item's own create/update body and echoed on the detail
 * view; no standalone translations sub-resource.
 */
const feedTranslationFields = {
  title: z.string().trim().min(1).max(200),
  subtitle: z.string().trim().max(500).optional(),
  label: z.string().trim().max(200).optional(),
  ctaLabel: z.string().trim().min(1).max(120),
  badgeLabel: z.string().trim().max(120).optional(),
};

export const AdminFeedTranslationView = translationView(
  feedTranslationFields
).meta({ id: "AdminHomeFeedItemTranslationView" });

export const AdminFeedCreateBody = z
  .object({
    slug: businessKey,
    contentType: z.enum(FEED_CONTENT_TYPES),
    module: moduleKey,
    /**
     * TAM-175 — the deity this card belongs to (a logical reference to
     * `deities.slug`, like every other content table). Null = "no god": the
     * card is only ever eligible for an "any god" slot in the split feed.
     *
     * Auto-generated cards inherit this from their source content at sync
     * time; this field exists so a hand-authored card can be tagged too.
     */
    deitySlug: deitySlugRef.nullable().default(null),
    title: shortText,
    subtitle: shortText.nullable().optional(),
    label: shortText.nullable().optional(),
    badge: z.enum(FEED_BADGES).nullable().default(null),
    badgeLabel: badgeLabel.nullable().default(null),
    heroImageUrl: mediaUrl,
    audioPreviewUrl: mediaUrl.nullable().optional(),
    ctaLabel: shortText,
    ctaDestinationType: z.enum(BANNER_DESTINATION_TYPES),
    ctaDestinationValue: stableKey,
    headerDestinationModule: moduleKey,
    shareTitle: shortText,
    shareText: z.string().trim().min(1).max(500),
    shareDeepLink,
    shareThumbnailUrl: mediaUrl.nullable().optional(),
    trendingScore: z.number().int().nullable().optional(),
    isActive: z.boolean().default(true),
    translations: z.array(translationInput(feedTranslationFields)).default([]),
  })
  .strict()
  .superRefine(refineBadgePairing)
  .meta({ id: "AdminHomeFeedItemCreateBody" });
export type AdminFeedCreateInput = z.infer<typeof AdminFeedCreateBody>;

// NO `slug` (immutable business key). `contentType` IS mutable, so the
// audioPreviewUrl↔contentType correspondence is checked in the service against
// the effective row.
export const AdminFeedPatchBody = z
  .object({
    expectedUpdatedAt,
    contentType: z.enum(FEED_CONTENT_TYPES).optional(),
    module: moduleKey.optional(),
    /** TAM-175 — omitted ⇒ untouched; explicit `null` clears the deity. */
    deitySlug: deitySlugRef.nullable().optional(),
    title: shortText.optional(),
    subtitle: shortText.nullable().optional(),
    label: shortText.nullable().optional(),
    badge: z.enum(FEED_BADGES).nullable().optional(),
    badgeLabel: badgeLabel.nullable().optional(),
    heroImageUrl: mediaUrl.optional(),
    audioPreviewUrl: mediaUrl.nullable().optional(),
    ctaLabel: shortText.optional(),
    ctaDestinationType: z.enum(BANNER_DESTINATION_TYPES).optional(),
    ctaDestinationValue: stableKey.optional(),
    headerDestinationModule: moduleKey.optional(),
    shareTitle: shortText.optional(),
    shareText: z.string().trim().min(1).max(500).optional(),
    shareDeepLink: shareDeepLink.optional(),
    shareThumbnailUrl: mediaUrl.nullable().optional(),
    trendingScore: z.number().int().nullable().optional(),
    isActive: z.boolean().optional(),
    // undefined ⇒ translations untouched; provided (incl. `[]`) ⇒ REPLACE the set.
    translations: z.array(translationInput(feedTranslationFields)).optional(),
  })
  .strict()
  .superRefine(refineBadgePairing)
  .meta({ id: "AdminHomeFeedItemPatchBody" });
export type AdminFeedPatchInput = z.infer<typeof AdminFeedPatchBody>;

export const AdminFeedView = z
  .object({
    id: z.string(),
    slug: z.string(),
    contentType: z.enum(FEED_CONTENT_TYPES),
    module: z.string(),
    deitySlug: z.string().nullable(),
    title: z.string(),
    subtitle: z.string().nullable(),
    label: z.string().nullable(),
    badge: z.enum(FEED_BADGES).nullable(),
    badgeLabel: z.string().nullable(),
    heroImageUrl: mediaUrl,
    audioPreviewUrl: mediaUrl.nullable(),
    ctaLabel: z.string(),
    ctaDestinationType: z.string(),
    ctaDestinationValue: z.string(),
    ctaContentId: z
      .string()
      .nullable()
      .optional()
      .describe(
        "UUID of the underlying content the CTA opens (side-car to `ctaDestinationValue`; see `HomeFeedItem.ctaContentId`). Read-only on the admin API — auto-populated by `upsertContentFeedCard`, not settable via CRUD. Marked `optional()` so older API builds that don't yet emit the key still parse on the client."
      ),
    headerDestinationModule: z.string(),
    shareTitle: z.string(),
    shareText: z.string(),
    shareDeepLink: z.string(),
    shareThumbnailUrl: mediaUrl.nullable(),
    trendingScore: z.number().int().nullable(),
    isActive: z.boolean(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .meta({ id: "AdminHomeFeedItemView" });

/** Detail — the admin row plus ALL its per-locale framing overrides (every locale). */
export const AdminFeedDetailView = AdminFeedView.extend({
  translations: z.array(AdminFeedTranslationView),
}).meta({ id: "AdminHomeFeedItemDetailView" });

// ===========================================================================
// HomeShortcut
// ===========================================================================

export const AdminShortcutListQuery = adminPaginationQuery
  .extend(sortQuery(SHORTCUT_SORT_FIELDS).shape)
  .extend({
    q: z.string().trim().min(1).max(100).optional(),
    isActive: z
      .enum(["true", "false"])
      .transform((v) => v === "true")
      .optional(),
  });
export type AdminShortcutListQueryInput = z.infer<typeof AdminShortcutListQuery>;

/**
 * `iconKey` is a STABLE KEY → a BUNDLED client asset (#EXPORT_CRITICAL). It is
 * NOT a URL and NEVER goes through `validateOwnedUrl`. Validated as a key
 * (non-URL-shaped) here.
 *
 * TAM-132 — `iconUrl` is a REAL URL served live from the CMS to the app,
 * validated as `mediaUrl` here AND passed through `validateOwnedUrl` in the
 * service (URL must be one WE minted via `/admin/media/presign`). `iconKey`
 * and `iconUrl` are DELIBERATELY NOT COLLAPSED: distinct concerns (bundled
 * BC-fallback slug vs. live URL), distinct validators — an operator pasting a
 * URL into `iconKey` would bypass the owned-URL gate, so the `stableKey`
 * refine on `iconKey` stays in place.
 */
/**
 * Shortcut label override — the tile `label` (TAM-113). Embedded in the
 * shortcut's own create/update body and echoed on the detail view; no standalone
 * translations sub-resource.
 */
const shortcutTranslationFields = { label: z.string().trim().min(1).max(120) };

export const AdminShortcutTranslationView = translationView(
  shortcutTranslationFields
).meta({ id: "AdminHomeShortcutTranslationView" });

/**
 * TAM-174 — one A/B arm's presentation overrides for a shortcut.
 *
 * `variant` is a free string, NOT an enum: the A/B console can name an arm this
 * deployment has never heard of, and the read path already treats an unknown
 * arm as "no overrides". A Zod enum would turn that into a CMS write failure
 * instead, which is the wrong place to find out.
 *
 * Every presentation field is optional and nullable; null (or absent) means
 * INHERIT the base shortcut row, which is what lets an arm restyle without
 * re-stating copy or artwork that has not changed.
 *
 * The palette's ALL-OR-NOTHING rule is enforced in `home.admin.service.ts`
 * rather than here: Zod would express it as a cross-field refine on an
 * all-optional object, which reports against the object rather than the
 * offending field and reads worse in the admin form.
 */
export const AdminShortcutVariantInput = z
  .object({
    variant: businessKey.describe(
      'The arm id — "control" or "gradient_v1" today. Must match the variant id the A/B console serves.'
    ),
    label: shortText.nullable().optional(),
    iconUrl: mediaUrl.nullable().optional(),
    minAppVersion: z
      .string()
      .trim()
      .min(1)
      .max(20)
      .nullable()
      .optional()
      .describe(
        "Minimum mobile `app_version` that can RENDER this arm (e.g. \"1.2.0\"). Null = no gate. A client below it is served the base tile instead of this arm's overrides, so an old build is never shown assets authored for a layout it does not have."
      ),
    themeBackgroundFrom: hexColor.nullable().optional(),
    themeBackgroundFromStop: gradientStop.nullable().optional(),
    themeBackgroundTo: hexColor.nullable().optional(),
    themeBackgroundToStop: gradientStop.nullable().optional(),
    themeLabelColor: hexColor.nullable().optional(),
  })
  .strict()
  .meta({ id: "AdminHomeShortcutVariantInput" });

/** The same shape on the READ side — see `AdminShortcutView` for why it is loose. */
export const AdminShortcutVariantView = z
  .object({
    variant: z.string(),
    label: z.string().nullable(),
    iconUrl: z.string().nullable(),
    minAppVersion: z.string().nullable(),
    themeBackgroundFrom: z.string().nullable(),
    themeBackgroundFromStop: z.number().nullable(),
    themeBackgroundTo: z.string().nullable(),
    themeBackgroundToStop: z.number().nullable(),
    themeLabelColor: z.string().nullable(),
  })
  .meta({ id: "AdminHomeShortcutVariantView" });

export const AdminShortcutCreateBody = z
  .object({
    key: businessKey,
    label: shortText,
    destinationType: z.enum(SHORTCUT_DESTINATION_TYPES),
    destinationValue: stableKey.nullable().optional(),
    iconKey: stableKey.nullable().optional(),
    iconUrl: mediaUrl.nullable().optional(),
    // TAM-132 BC gate — Semver-shaped gate; clients whose `app_version` header
    // parses below this value are filtered out server-side. Null = no gate
    // (visible to all versions). Deliberately unrefined here (any short string
    // is accepted) — the semver-parsing tolerance lives in `parseAppVersion`
    // so a garbled stored value hides the row rather than 500-ing the read.
    minAppVersion: z.string().trim().min(1).max(20).nullable().optional(),
    // TAM-174 — per-A/B-arm presentation. Omitted ⇒ no arm rows, i.e. every user
    // sees the base tile (exactly the pre-TAM-174 behaviour).
    variants: z.array(AdminShortcutVariantInput).default([]),
    sortOrder: z.number().int().default(0),
    isActive: z.boolean().default(true),
    translations: z
      .array(translationInput(shortcutTranslationFields))
      .default([]),
  })
  .strict()
  .meta({ id: "AdminHomeShortcutCreateBody" });
export type AdminShortcutCreateInput = z.infer<typeof AdminShortcutCreateBody>;

// NO `key` (immutable business key).
export const AdminShortcutPatchBody = z
  .object({
    expectedUpdatedAt,
    label: shortText.optional(),
    destinationType: z.enum(SHORTCUT_DESTINATION_TYPES).optional(),
    destinationValue: stableKey.nullable().optional(),
    iconKey: stableKey.nullable().optional(),
    iconUrl: mediaUrl.nullable().optional(),
    // TAM-132 BC gate — Semver-shaped gate; clients whose `app_version` header
    // parses below this value are filtered out server-side. Null = no gate
    // (visible to all versions). Omitted ⇒ untouched; explicit `null` clears
    // the gate.
    minAppVersion: z.string().trim().min(1).max(20).nullable().optional(),
    // TAM-174 — undefined ⇒ arms untouched; provided (incl. `[]`) ⇒ REPLACE the
    // whole set. Same contract as `translations` on this surface.
    variants: z.array(AdminShortcutVariantInput).optional(),
    sortOrder: z.number().int().optional(),
    isActive: z.boolean().optional(),
    // undefined ⇒ translations untouched; provided (incl. `[]`) ⇒ REPLACE the set.
    translations: z.array(translationInput(shortcutTranslationFields)).optional(),
  })
  .strict()
  .meta({ id: "AdminHomeShortcutPatchBody" });
export type AdminShortcutPatchInput = z.infer<typeof AdminShortcutPatchBody>;

export const AdminShortcutView = z
  .object({
    id: z.string(),
    key: z.string(),
    label: z.string(),
    destinationType: z.enum(SHORTCUT_DESTINATION_TYPES),
    destinationValue: z.string().nullable(),
    iconKey: z.string().nullable(),
    // TAM-132 — CMS-owned icon URL (`mediaUrl`-shaped when non-null); read-side
    // is intentionally `z.string().nullable()` (not `mediaUrl`) so a legacy
    // row's stored value round-trips even if its shape drifts from today's
    // stricter refine — the write path is the authoritative gate.
    iconUrl: z.string().nullable(),
    // TAM-132 BC gate — Semver-shaped gate; clients whose `app_version` header
    // parses below this value are filtered out server-side. Null = no gate
    // (visible to all versions). Server-side only — the public wire never
    // projects it, but ops sees + edits it here.
    minAppVersion: z.string().nullable(),
    // TAM-174 — every arm, so ops edits them all from one form. The read side
    // is deliberately loose (`z.string()` / `z.number()`, not `hexColor` /
    // `gradientStop`) for the same reason `iconUrl` is: a legacy or hand-edited
    // row must round-trip into the form so ops can SEE and fix it, rather than
    // 500-ing the admin read. The write path is the authoritative gate.
    variants: z.array(AdminShortcutVariantView),
    sortOrder: z.number().int(),
    isActive: z.boolean(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .meta({ id: "AdminHomeShortcutView" });

/** Detail — the admin row plus ALL its per-locale label overrides (every locale). */
export const AdminShortcutDetailView = AdminShortcutView.extend({
  translations: z.array(AdminShortcutTranslationView),
}).meta({ id: "AdminHomeShortcutDetailView" });

// ===========================================================================
// HomeSettings — the singleton (GET + PATCH only; no list/create/delete/:id)
// ===========================================================================

/**
 * `key` is NEVER client-settable — it is what keeps the row a singleton for the
 * idempotent upsert. Two editable fields, and BOTH have instant global blast
 * radius (note for TAM-105's confirmation UX):
 *   - `feedTrendingFirst` flips every user's home-feed ordering;
 *   - `shortcutGridGradientEnabled` (TAM-174) starts or stops the shortcut-grid
 *     gradient experiment for everyone at once. It is the kill switch, NOT the
 *     traffic split — the split lives in the A/B console (or, when that is
 *     unconfigured, in `home.buckets.ts`). Deliberately separate so stopping the
 *     experiment never depends on the abtest service being reachable.
 */
export const AdminSettingsPatchBody = z
  .object({
    expectedUpdatedAt,
    feedTrendingFirst: z.boolean(),
    shortcutGridGradientEnabled: z.boolean(),
  })
  .strict()
  .meta({ id: "AdminHomeSettingsPatchBody" });
export type AdminSettingsPatchInput = z.infer<typeof AdminSettingsPatchBody>;

export const AdminSettingsView = z
  .object({
    id: z.string(),
    key: z.string(),
    feedTrendingFirst: z.boolean(),
    shortcutGridGradientEnabled: z.boolean(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .meta({ id: "AdminHomeSettingsView" });

// ---------------------------------------------------------------------------
// response envelopes
// ---------------------------------------------------------------------------

/** Single-item admin success envelope (owned locally, not imported cross-module). */
function adminEnvelope<T extends z.ZodTypeAny>(data: T) {
  return z.object({ success: z.literal(true), message: z.string(), data });
}

export const AdminBannerListResponse = adminPagedEnvelope(AdminBannerView).meta({
  id: "AdminHomeBannerListResponse",
});
export const AdminBannerDetailResponse = adminEnvelope(AdminBannerDetailView).meta({
  id: "AdminHomeBannerDetailResponse",
});
export const AdminFeedListResponse = adminPagedEnvelope(AdminFeedView).meta({
  id: "AdminHomeFeedItemListResponse",
});
export const AdminFeedDetailResponse = adminEnvelope(AdminFeedDetailView).meta({
  id: "AdminHomeFeedItemDetailResponse",
});
export const AdminShortcutListResponse = adminPagedEnvelope(AdminShortcutView).meta({
  id: "AdminHomeShortcutListResponse",
});
export const AdminShortcutDetailResponse = adminEnvelope(
  AdminShortcutDetailView
).meta({ id: "AdminHomeShortcutDetailResponse" });
export const AdminSettingsResponse = adminEnvelope(AdminSettingsView).meta({
  id: "AdminHomeSettingsResponse",
});

export const ErrorEnvelope = z
  .object({
    success: z.literal(false),
    message: z.string(),
    data: z.null(),
    errorCode: z.string().optional(),
  })
  .meta({ id: "AdminHomeErrorEnvelope" });
