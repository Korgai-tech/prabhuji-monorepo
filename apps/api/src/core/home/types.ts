/**
 * Home module public types (TAM-61).
 *
 * Home is the primary discovery surface: CMS-driven hero BANNERS + a mixed,
 * cursor-paginated devotional FEED, plus engagement WRITE forwarders. The core
 * rule (PRD §5, §10) is that RANKING IS IDENTICAL FOR FREE AND PRO — nothing in
 * this module branches on subscription status. Home shows the same UI to every
 * authenticated user; the only Pro-conditional signal is the server-authored
 * `isProFeatureDiscovery` banner flag the CLIENT resolves into a paywall route
 * (TAM-58). There is NO server entitlement gate on banners or feed content.
 *
 * A HomeFeedItem is DENORMALIZED display + routing data (NOT a foreign key into
 * the wallpaper/status/aarti/mantra/ringtone tables). Its `contentType` is
 * DISPLAY/routing metadata; engagement (like/view/share + likedByMe) is keyed on
 * the shared TAM-57 engagement tables under a CONSTANT contentType `home_item`
 * with the feed item id as the contentId — Home never stores counts itself.
 *
 * These are the wire-facing shapes the service assembles and the controller
 * sends; they are validated on the way out by the Zod response schemas in
 * `routes/home.schemas.ts` (the OpenAPI source of truth).
 */

/**
 * The engagement `contentType` token Home uses to KEY a feed card's engagement
 * (see `shared/schemas/engagement.ts`). Distinct from a feed item's own
 * `contentType` display field — the home CARD is its own engageable entity.
 */
export const HOME_CONTENT_TYPE = "home_item";

/** Banner media kind — `image` (still) or `video` (looping hero). */
export const BANNER_MEDIA_TYPES = ["image", "video"] as const;
export type BannerMediaType = (typeof BANNER_MEDIA_TYPES)[number];

/**
 * Banner tap destination kind.
 *   - `linked_module`   → open a module (destinationValue = module key)
 *   - `content_detail`  → open a content detail (destinationValue = id/deeplink)
 *   - `pro_paywall`     → open the paywall (destinationValue = paywall id;
 *                         forces `isProFeatureDiscovery = true`)
 *   - `informational`   → non-navigable (destinationValue is always null)
 */
export const BANNER_DESTINATION_TYPES = [
  "linked_module",
  "content_detail",
  "pro_paywall",
  "informational",
] as const;
export type BannerDestinationType = (typeof BANNER_DESTINATION_TYPES)[number];

/** The five feed content kinds (the DISPLAY/routing metadata on a feed item). */
export const FEED_CONTENT_TYPES = [
  "wallpaper",
  "status",
  "aarti",
  "mantra",
  "ringtone",
] as const;
export type FeedContentType = (typeof FEED_CONTENT_TYPES)[number];

/**
 * Auto-feed sync input. A content module (aarti/mantra/ringtone/wallpaper/
 * status) passes this to `IHomeApi.upsertContentFeedCard` right after it creates
 * or updates an item, so newly added content auto-appears in the Home feed
 * WITHOUT a separate CMS authoring step. Home owns the card shape (CTA, share,
 * ordering); the caller supplies only the content facts. Idempotent — keyed on a
 * deterministic slug derived from `(contentType, contentSlug)`.
 */
export interface ContentFeedCardInput {
  contentType: FeedContentType;
  contentId: string;
  contentSlug: string;
  title: string;
  /** The item's own thumbnail/cover — reused verbatim as the feed hero. */
  heroImageUrl: string;
  /** Only for audio kinds (aarti/mantra/ringtone); null otherwise. */
  audioPreviewUrl?: string | null;
  /**
   * TAM-175 — the source content's deity, a logical reference to
   * `deities.slug` (never the uuid; every content table stores the slug).
   *
   * REQUIRED but nullable, deliberately. Three of the five producer tables
   * allow a null `deity_slug`, so null is a real answer — but making the field
   * optional would let a new producer forget it silently and quietly strand its
   * cards in the "any god" pool forever. The compiler asking the question at
   * every call site is the point.
   */
  deitySlug: string | null;
  /**
   * TAM-176 — the source content's live state, mirrored onto its card.
   *
   * The feed reads ONLY `home_feed_items.is_active`; it never joins back to the
   * content a card points at. So without this, deactivating a status left a
   * live card whose CTA opened deleted content. Carrying the flag makes the
   * card's lifecycle follow its content's, in both directions.
   */
  isActive: boolean;
}

/** Optional feed-card badge. `null` when absent. */
export const FEED_BADGES = ["trending", "suggested"] as const;
export type FeedBadge = (typeof FEED_BADGES)[number];

/**
 * Shortcut tap destination kind — deliberately the SAME vocabulary as a banner's
 * (`BANNER_DESTINATION_TYPES`), so the client has ONE allowlist resolver for
 * every CMS-authored destination on Home.
 */
export const SHORTCUT_DESTINATION_TYPES = BANNER_DESTINATION_TYPES;
export type ShortcutDestinationType = BannerDestinationType;

/** Content types whose feed cards carry an inline audio preview. */
export const AUDIO_FEED_CONTENT_TYPES: readonly FeedContentType[] = [
  "aarti",
  "mantra",
  "ringtone",
];

/**
 * A hero banner (`GET /home/banners`). `mediaUrl` is the image or video;
 * `thumbnailUrl` is the video still (null for image banners). `destinationValue`
 * is null for `informational` rows (non-navigable by contract).
 */
export interface HomeBanner {
  id: string;
  mediaType: BannerMediaType;
  mediaUrl: string;
  thumbnailUrl: string | null;
  title: string | null;
  destinationType: BannerDestinationType;
  destinationValue: string | null;
  isProFeatureDiscovery: boolean;
  sortOrder: number;
}

/**
 * A feature-shortcut tile (`GET /home/shortcuts`) — the 2×2 grid under the hero
 * banners. LABEL and ORDER are CMS-owned (they used to be an app constant), so
 * ops can rename/reorder/deactivate a tile without an app release.
 *
 * #EXPORT_CRITICAL — DESTINATION SAFETY. `destinationValue` is a STABLE KEY
 * (module key such as "wallpaper"/"aarti"/"mantras"/"ringtone", a content id, or
 * a paywall id) — NEVER a URL, path or raw deep link. The client resolves it
 * through its own hardcoded route ALLOWLIST and no-ops on an unknown key, so an
 * untrusted CMS string can never become a navigable link. Same contract guards as
 * a banner: `informational` rows are non-navigable (`destinationValue` null);
 * `pro_paywall` rows carry the paywall id.
 *
 * `iconKey` is likewise a stable key resolved to a BUNDLED client asset — the one
 * thing the product constraint allows to stay static in the app — not an image URL.
 */
/**
 * TAM-174 — a shortcut tile's CMS-owned palette.
 *
 * PRESENTATIONAL ONLY. Unlike `destinationValue` and `iconKey` — which are
 * allowlisted KEYS precisely because a CMS string must never become a navigable
 * route or a fetched URL — these are plain values. The worst a bad one can do is
 * render an ugly tile, and the client falls back to its shipped gradient when a
 * value fails to parse.
 *
 * The STOPS are Figma gradient-handle fractions and are deliberately NOT clamped
 * to [0,1]: `set_wallpaper` is authored 0.14734 → 1.4734. The client maps them to
 * `Alignment` (which accepts out-of-range values) rather than to Flutter's
 * `stops` (which rejects them).
 */
export interface HomeShortcutTheme {
  /** `#RRGGBB` — the gradient's top colour. */
  backgroundFrom: string;
  /** Fraction down the card at which `backgroundFrom` sits. May be < 0. */
  backgroundFromStop: number;
  /** `#RRGGBB` — the gradient's bottom colour. */
  backgroundTo: string;
  /** Fraction down the card at which `backgroundTo` sits. May be > 1. */
  backgroundToStop: number;
  /** `#RRGGBB` — the tile label's colour, tuned per palette for contrast. */
  labelColor: string;
}

export interface HomeShortcut {
  id: string;
  key: string;
  label: string;
  destinationType: ShortcutDestinationType;
  destinationValue: string | null;
  iconKey: string | null;
  /**
   * TAM-132 — CMS-owned live icon URL. Null ⇒ the client falls back to the
   * bundled asset keyed by `iconKey`. Distinct concern from `iconKey` (a
   * bundled-asset slug) — deliberately not collapsed.
   */
  iconUrl: string | null;
  /**
   * TAM-174 — the tile's palette, or `null`.
   *
   * Null carries THREE distinct states, all of which the client renders the same
   * way (the shipped flat gradient), which is why they are not distinguished on
   * the wire:
   *   1. the caller is in the experiment's CONTROL arm;
   *   2. the experiment is off entirely (`shortcutGridGradientEnabled = false`);
   *   3. the caller is in the gradient arm but ops has not themed THIS row.
   *
   * Collapsing them is deliberate: the client has no decision to make that
   * depends on which it is, and publishing the arm would hand it a branch it
   * does not need — see the spec's "variant as data, not a flag" decision.
   */
  theme: HomeShortcutTheme | null;
  sortOrder: number;
}

/** Cross-module / client share payload assembled from the feed item's columns. */
export interface ShareMetadata {
  title: string;
  text: string;
  deepLink: string;
  thumbnailUrl: string | null;
}

/**
 * A mixed-feed card (`GET /home/feed`). Carries display + routing metadata, the
 * assembled `shareMetadata`, the resolved engagement counts + `likedByMe`, and
 * the `trendingScore` the client needs for §18 analytics. All fields are
 * returned to any authenticated user — Home is never Pro-gated.
 */
export interface HomeFeedItem {
  id: string;
  contentType: FeedContentType;
  module: string;
  title: string;
  subtitle: string | null;
  mediaUrl: string;
  audioPreviewUrl: string | null;
  ctaLabel: string;
  ctaDestinationType: string;
  ctaDestinationValue: string;
  /**
   * UUID of the underlying content the CTA opens — a side-car to
   * `ctaDestinationValue`. Populated by the auto-feed sync
   * (`upsertContentFeedCard`) from `ContentFeedCardInput.contentId`.
   *
   * Why it exists alongside `ctaDestinationValue`: the latter is a
   * human-readable slug (deterministic, stable across id churn, good for URLs
   * and share links); but the mobile app's per-content deep-link routes
   * (`/aarti-bhajans/audio/:audioId`, `/mantras/audio/:itemId`) and the
   * downstream `GET /aarti/audios/:id` / `GET /mantras/items/:id` lookups
   * accept only the id (no slug fallback), so the client needs the id
   * explicitly to open the play screen. Absent (`null`) ⇒ the client falls
   * back to opening the owning module (never 404s on a slug).
   */
  ctaContentId: string | null;
  headerDestinationModule: string;
  label: string | null;
  badge: FeedBadge | null;
  /**
   * CMS-owned DISPLAY COPY for `badge` (e.g. "TRENDING") — the app must never
   * hardcode badge copy. Non-null EXACTLY when `badge` is non-null (the service
   * enforces the invariant both ways).
   */
  badgeLabel: string | null;
  likeCount: number;
  viewCount: number;
  shareCount: number;
  likedByMe: boolean;
  shareMetadata: ShareMetadata;
  trendingScore: number | null;
}

/** A page of feed items (cursor pagination). */
export interface HomeFeedPage {
  items: HomeFeedItem[];
  nextCursor: string | null;
}

/** Result of an engagement like toggle (`POST /home/engagement/like`). */
export interface HomeLikeResult {
  liked: boolean;
  likeCount: number;
}

/** Result of an engagement view record (`POST /home/engagement/view`). */
export interface HomeViewResult {
  viewCount: number;
}

/** Result of an engagement share record (`POST /home/engagement/share`). */
export interface HomeShareResult {
  shareCount: number;
}

/**
 * Minimal cross-module preview published on `IHomeApi.getBannerCount` — Phase-1
 * Home has no consumers, so the facade surface is intentionally tiny. Kept so a
 * later module (or a health check) can reference Home content without importing
 * this module's internals.
 */
export interface HomeBannerSummary {
  activeBannerCount: number;
}

// ===========================================================================
// ADMIN write surface (TAM-104). These types are wire shapes for the
// `/admin/home/*` CRUD surface — the full DB rows (an editor sees what they
// edit), with `createdAt`/`updatedAt` as ISO strings. They never reach the
// mobile client (the admin operations are `admin`-tagged, so TAM-85 drops them
// from `openapi.public.json`).
// ===========================================================================

/**
 * The module-key ALLOWLIST for every CMS-authored destination key on Home —
 * `destinationValue` (for `linked_module`), a feed item's `module` and
 * `headerDestinationModule`, and a `linked_module` `ctaDestinationValue`.
 *
 * #EXPORT_CRITICAL — this list MIRRORS the client's hardcoded allowlist
 * `HomeDestinations._moduleRoutes` (`apps/mobile/lib/features/home/destinations.dart`)
 * EXACTLY. A server list stricter than the client's blocks legitimate content;
 * looser lets dead tiles through. Keep the two in lockstep: both `aarti` +
 * `aarti-bhajans`, `mantra` + `mantras`, and `ringtone` + `ringtones` appear
 * because a feed item's singular `contentType` and its `module` key can differ.
 */
export const HOME_MODULE_KEYS = [
  "wallpaper",
  "status",
  "aarti",
  "aarti-bhajans",
  "mantra",
  "mantras",
  "ringtone",
  "ringtones",
  "horoscope",
  "books",
] as const;
export type HomeModuleKey = (typeof HOME_MODULE_KEYS)[number];

/** Admin banner list/detail sort allowlist (indexed columns + timestamps). */
export const BANNER_SORT_FIELDS = [
  "sortOrder",
  "mediaType",
  "isActive",
  "createdAt",
  "updatedAt",
] as const;
export type BannerSortField = (typeof BANNER_SORT_FIELDS)[number];

/** Admin feed-item list/detail sort allowlist. */
export const FEED_SORT_FIELDS = [
  "title",
  "trendingScore",
  "badge",
  "isActive",
  "createdAt",
  "updatedAt",
] as const;
export type FeedSortField = (typeof FEED_SORT_FIELDS)[number];

/** Admin shortcut list/detail sort allowlist. */
export const SHORTCUT_SORT_FIELDS = [
  "key",
  "label",
  "sortOrder",
  "isActive",
  "createdAt",
  "updatedAt",
] as const;
export type ShortcutSortField = (typeof SHORTCUT_SORT_FIELDS)[number];

/** Full banner row for the admin surface (not Pro-gated). */
export interface AdminHomeBannerView {
  id: string;
  mediaType: BannerMediaType;
  mediaUrl: string;
  thumbnailUrl: string | null;
  title: string | null;
  destinationType: BannerDestinationType;
  destinationValue: string | null;
  isProFeatureDiscovery: boolean;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Full feed-item row for the admin surface. */
export interface AdminHomeFeedView {
  id: string;
  slug: string;
  contentType: FeedContentType;
  module: string;
  /** TAM-175 — deity slug this card belongs to; null = "no god". */
  deitySlug: string | null;
  title: string;
  subtitle: string | null;
  label: string | null;
  badge: FeedBadge | null;
  badgeLabel: string | null;
  heroImageUrl: string;
  audioPreviewUrl: string | null;
  ctaLabel: string;
  ctaDestinationType: string;
  ctaDestinationValue: string;
  /** Side-car UUID; see the same field on `HomeFeedItem` for the contract. */
  ctaContentId: string | null;
  headerDestinationModule: string;
  shareTitle: string;
  shareText: string;
  shareDeepLink: string;
  shareThumbnailUrl: string | null;
  trendingScore: number | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Full shortcut row for the admin surface. */
export interface AdminHomeShortcutView {
  id: string;
  key: string;
  label: string;
  destinationType: ShortcutDestinationType;
  destinationValue: string | null;
  iconKey: string | null;
  /** TAM-132 — CMS-owned live icon URL (nullable; BC fallback is `iconKey`). */
  iconUrl: string | null;
  /**
   * TAM-132 backwards-compat gate — minimum mobile `app_version` at which this
   * shortcut is visible on the public wire. Null ⇒ no gate. Server-side only —
   * the public wire never projects it, but ops sees + edits it here.
   */
  minAppVersion: string | null;
  /**
   * TAM-174 — every A/B arm's presentation overrides, so ops edits all of them
   * from one form. Ordered by `variant` for a stable form layout.
   */
  variants: AdminHomeShortcutVariantView[];
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Per-locale label overrides carried on an admin DETAIL view (TAM-113). Every
 * entity's create/update body embeds these, and the detail response echoes the
 * whole set back. Symmetric with the `<Entity>TranslationView` Zod schemas.
 */
export interface HomeBannerTranslationView {
  locale: string;
  title: string;
}

export interface HomeFeedTranslationView {
  locale: string;
  title: string;
  subtitle?: string;
  label?: string;
  ctaLabel: string;
  badgeLabel?: string;
}

export interface HomeShortcutTranslationView {
  locale: string;
  label: string;
}

/** Banner detail — the admin row plus ALL its per-locale label overrides. */
export interface AdminHomeBannerDetailView extends AdminHomeBannerView {
  translations: HomeBannerTranslationView[];
}

/** Feed-item detail — the admin row plus ALL its per-locale framing overrides. */
export interface AdminHomeFeedDetailView extends AdminHomeFeedView {
  translations: HomeFeedTranslationView[];
}

/** Shortcut detail — the admin row plus ALL its per-locale label overrides. */
export interface AdminHomeShortcutDetailView extends AdminHomeShortcutView {
  translations: HomeShortcutTranslationView[];
}

/**
 * TAM-174 — one A/B arm's presentation overrides, as the admin surface sees it.
 *
 * Independently nullable (rather than a resolved `HomeShortcutTheme | null`)
 * because this is the EDITING surface: a form mid-edit legitimately holds some
 * palette fields and not others, and the all-or-nothing invariant is asserted
 * on SAVE by `home.admin.service.ts` rather than modelled as an unrepresentable
 * state here. A null presentation field means "inherit the base row".
 */
export interface AdminHomeShortcutVariantView {
  variant: string;
  label: string | null;
  iconUrl: string | null;
  /** The minimum mobile `app_version` that can render this arm. Null ⇒ no gate. */
  minAppVersion: string | null;
  themeBackgroundFrom: string | null;
  themeBackgroundFromStop: number | null;
  themeBackgroundTo: string | null;
  themeBackgroundToStop: number | null;
  themeLabelColor: string | null;
}

/** The singleton settings row for the admin surface. */
export interface AdminHomeSettingsView {
  id: string;
  key: string;
  feedTrendingFirst: boolean;
  /**
   * TAM-174 — the shortcut-grid gradient experiment's master switch. False ⇒
   * nobody is bucketed, the abtest service is never consulted, and every caller
   * is served `theme: null`. Deliberately separate from the traffic split (which
   * lives in the A/B console, or in `home.buckets.ts` when that is unconfigured)
   * so that STOPPING the experiment never depends on the service being reachable.
   */
  shortcutGridGradientEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}
