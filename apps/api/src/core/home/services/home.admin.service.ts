import { performServiceCall } from "@api/shared/workspace";
import { createModuleLogger } from "@api/shared/logs";
import { AppError, ValidationError } from "@api/shared/errors";
import type {
  BannerCreateData,
  BannerUpdateData,
  FeedCreateData,
  FeedUpdateData,
  HomeRepository,
  ShortcutCreateData,
  ShortcutUpdateData,
} from "@api/core/home/repositories";
import {
  AUDIO_FEED_CONTENT_TYPES,
  HOME_MODULE_KEYS,
  type AdminHomeBannerDetailView,
  type AdminHomeBannerView,
  type AdminHomeFeedDetailView,
  type AdminHomeFeedView,
  type AdminHomeSettingsView,
  type AdminHomeShortcutDetailView,
  type AdminHomeShortcutView,
  type BannerDestinationType,
  type BannerMediaType,
  type BannerSortField,
  type FeedBadge,
  type FeedContentType,
  type FeedSortField,
  type ShortcutDestinationType,
  type ShortcutSortField,
} from "@api/core/home/types";

const log = createModuleLogger("home:admin:service");

/** The media module tokens this service passes to `validateOwnedUrl` (TAM-84). */
const MEDIA_MODULE = "home";
const BANNER_ENTITY = "homeBanner";
const FEED_ENTITY = "homeFeedItem";
/** TAM-132 — shortcut `iconUrl` is a real ownable URL (unlike `iconKey`). */
const SHORTCUT_ENTITY = "homeShortcut";

const MODULE_KEY_SET = new Set<string>(HOME_MODULE_KEYS);

// --- parsed request shapes (Zod outputs; the service stays route-import-free) --

export interface AdminBannerListParams {
  page: number;
  pageSize: number;
  sort?: BannerSortField;
  order: "asc" | "desc";
  isActive?: boolean;
  mediaType?: BannerMediaType;
  destinationType?: BannerDestinationType;
}

export interface AdminBannerCreateParams {
  mediaType: BannerMediaType;
  mediaUrl: string;
  thumbnailUrl?: string | null;
  title?: string | null;
  destinationType: BannerDestinationType;
  destinationValue?: string | null;
  isProFeatureDiscovery: boolean;
  sortOrder: number;
  isActive: boolean;
  translations: BannerTranslationInput[];
}

export interface AdminBannerPatchParams {
  expectedUpdatedAt: string;
  mediaUrl?: string;
  thumbnailUrl?: string | null;
  title?: string | null;
  destinationType?: BannerDestinationType;
  destinationValue?: string | null;
  isProFeatureDiscovery?: boolean;
  sortOrder?: number;
  isActive?: boolean;
  /** undefined ⇒ untouched; provided (incl. `[]`) ⇒ REPLACE the whole set. */
  translations?: BannerTranslationInput[];
}

export interface AdminFeedListParams {
  page: number;
  pageSize: number;
  sort?: FeedSortField;
  order: "asc" | "desc";
  q?: string;
  isActive?: boolean;
  contentType?: FeedContentType;
  module?: string;
  deitySlug?: string;
  badge?: FeedBadge;
}

export interface AdminFeedCreateParams {
  slug: string;
  contentType: FeedContentType;
  module: string;
  deitySlug: string | null;
  title: string;
  subtitle?: string | null;
  label?: string | null;
  badge: FeedBadge | null;
  badgeLabel: string | null;
  heroImageUrl: string;
  audioPreviewUrl?: string | null;
  ctaLabel: string;
  ctaDestinationType: BannerDestinationType;
  ctaDestinationValue: string;
  headerDestinationModule: string;
  shareTitle: string;
  shareText: string;
  shareDeepLink: string;
  shareThumbnailUrl?: string | null;
  trendingScore?: number | null;
  isActive: boolean;
  translations: FeedTranslationInput[];
}

export interface AdminFeedPatchParams {
  expectedUpdatedAt: string;
  contentType?: FeedContentType;
  module?: string;
  deitySlug?: string | null;
  title?: string;
  subtitle?: string | null;
  label?: string | null;
  badge?: FeedBadge | null;
  badgeLabel?: string | null;
  heroImageUrl?: string;
  audioPreviewUrl?: string | null;
  ctaLabel?: string;
  ctaDestinationType?: BannerDestinationType;
  ctaDestinationValue?: string;
  headerDestinationModule?: string;
  shareTitle?: string;
  shareText?: string;
  shareDeepLink?: string;
  shareThumbnailUrl?: string | null;
  trendingScore?: number | null;
  isActive?: boolean;
  /** undefined ⇒ untouched; provided (incl. `[]`) ⇒ REPLACE the whole set. */
  translations?: FeedTranslationInput[];
}

export interface AdminShortcutListParams {
  page: number;
  pageSize: number;
  sort?: ShortcutSortField;
  order: "asc" | "desc";
  q?: string;
  isActive?: boolean;
}

export interface AdminShortcutCreateParams {
  key: string;
  label: string;
  destinationType: ShortcutDestinationType;
  destinationValue?: string | null;
  iconKey?: string | null;
  /** TAM-132 — CMS-owned live icon URL. Nullable; NOT the same as `iconKey`. */
  iconUrl?: string | null;
  /**
   * TAM-132 BC gate — nullable semver string. Null (or absent) ⇒ no gate.
   * Set to hide the row from any client whose `app_version` header parses
   * below this value.
   */
  minAppVersion?: string | null;
  /**
   * TAM-174 — per-A/B-arm presentation. Absent ⇒ no arm overrides, i.e. every
   * user sees the base tile (exactly the pre-TAM-174 behaviour).
   */
  variants?: ShortcutVariantInput[];
  sortOrder: number;
  isActive: boolean;
  translations: ShortcutTranslationInput[];
}

export interface AdminShortcutPatchParams {
  expectedUpdatedAt: string;
  label?: string;
  destinationType?: ShortcutDestinationType;
  destinationValue?: string | null;
  iconKey?: string | null;
  /** TAM-132 — undefined ⇒ untouched; explicit `null` clears the URL. */
  iconUrl?: string | null;
  /** TAM-132 BC gate — undefined ⇒ untouched; explicit `null` clears the gate. */
  minAppVersion?: string | null;
  /**
   * TAM-174 — undefined ⇒ arms untouched; provided (incl. `[]`) ⇒ REPLACE the
   * whole set, the same contract `translations` uses on this surface.
   */
  variants?: ShortcutVariantInput[];
  sortOrder?: number;
  isActive?: boolean;
  /** undefined ⇒ untouched; provided (incl. `[]`) ⇒ REPLACE the whole set. */
  translations?: ShortcutTranslationInput[];
}

export interface AdminSettingsPatchParams {
  expectedUpdatedAt: string;
  feedTrendingFirst: boolean;
  /** TAM-174 — the shortcut-grid gradient experiment's master switch. */
  shortcutGridGradientEnabled: boolean;
}

// --- embedded translation inputs (TAM-113; Zod-parsed body array elements) ----
// Each carries its `locale`; the entity's create seeds them and its update
// REPLACES the whole set (undefined ⇒ untouched). Optional feed fields absent
// ⇒ stored as SQL null (a blank override).

/** Banner label override — the overlay `title`. */
export interface BannerTranslationInput {
  locale: string;
  title: string;
}

/** Feed-card framing overrides — all localized copy in one row. */
export interface FeedTranslationInput {
  locale: string;
  title: string;
  subtitle?: string;
  label?: string;
  ctaLabel: string;
  badgeLabel?: string;
}

/** Shortcut label override — the tile `label`. */
export interface ShortcutTranslationInput {
  locale: string;
  label: string;
}

interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * TAM-174 — one A/B arm's presentation overrides, as a write accepts them.
 *
 * Every presentation field is optional/nullable and null means INHERIT the base
 * shortcut row, so an arm that only restyles need not re-state copy.
 */
export interface ShortcutVariantInput {
  variant: string;
  label?: string | null;
  iconUrl?: string | null;
  minAppVersion?: string | null;
  themeBackgroundFrom?: string | null;
  themeBackgroundFromStop?: number | null;
  themeBackgroundTo?: string | null;
  themeBackgroundToStop?: number | null;
  themeLabelColor?: string | null;
}

/**
 * The palette's five columns, in one place so the all-or-nothing check and the
 * write path cannot drift apart.
 */
const THEME_FIELDS = [
  "themeBackgroundFrom",
  "themeBackgroundFromStop",
  "themeBackgroundTo",
  "themeBackgroundToStop",
  "themeLabelColor",
] as const;

type ThemeField = (typeof THEME_FIELDS)[number];

/**
 * Assert a variant's palette is ALL-OR-NOTHING, and normalise it for storage.
 *
 * A half-set palette is unrenderable, so the public read discards it — which
 * means a tile would quietly stop being themed with no error anywhere. This
 * turns that silent degradation into a 400 the editor sees.
 *
 * Written field by field rather than mapped over `THEME_FIELDS`: the two colour
 * columns are `string` and the two stops are `number`, and a generic map
 * collapses them to a union Prisma will not accept.
 */
function normaliseVariant(input: ShortcutVariantInput): {
  variant: string;
  label: string | null;
  iconUrl: string | null;
  minAppVersion: string | null;
  themeBackgroundFrom: string | null;
  themeBackgroundFromStop: number | null;
  themeBackgroundTo: string | null;
  themeBackgroundToStop: number | null;
  themeLabelColor: string | null;
} {
  const set = THEME_FIELDS.filter((f: ThemeField) => {
    const v = input[f];
    return v !== undefined && v !== null;
  });
  if (set.length !== 0 && set.length !== THEME_FIELDS.length) {
    const missing = THEME_FIELDS.filter((f: ThemeField) => {
      const v = input[f];
      return v === undefined || v === null;
    });
    throw new ValidationError(
      `Variant "${input.variant}": a theme is all-or-nothing — set every palette field or none. Missing: ${missing.join(", ")}`
    );
  }
  return {
    variant: input.variant,
    label: input.label ?? null,
    iconUrl: input.iconUrl ?? null,
    minAppVersion: input.minAppVersion ?? null,
    themeBackgroundFrom: input.themeBackgroundFrom ?? null,
    themeBackgroundFromStop: input.themeBackgroundFromStop ?? null,
    themeBackgroundTo: input.themeBackgroundTo ?? null,
    themeBackgroundToStop: input.themeBackgroundToStop ?? null,
    themeLabelColor: input.themeLabelColor ?? null,
  };
}

/**
 * Validate + normalise a whole arm set, rejecting a duplicate arm.
 *
 * Two rows for one arm would hit the `(shortcut, variant)` unique index as a
 * P2002 deep inside a transaction; catching it here makes it a named 400.
 */
function normaliseVariants(
  inputs: ShortcutVariantInput[] | undefined
): ReturnType<typeof normaliseVariant>[] | undefined {
  if (inputs === undefined) return undefined;
  const seen = new Set<string>();
  for (const v of inputs) {
    if (seen.has(v.variant)) {
      throw new ValidationError(`Duplicate variant "${v.variant}" — one row per arm.`);
    }
    seen.add(v.variant);
  }
  return inputs.map(normaliseVariant);
}

interface ResolvedDestination {
  destinationValue: string | null;
  /** True only for `pro_paywall` — the banner's `isProFeatureDiscovery` is forced. */
  forcePro: boolean;
}

/**
 * Admin write-side service for the Home module (TAM-104) — **Prisma-free** (all
 * DB access goes through `HomeRepository`).
 *
 * Carries the module's defining rules:
 *   - **DESTINATION SAFETY** (#EXPORT_CRITICAL): `destinationValue` /
 *     `ctaDestinationValue` / `module` / `headerDestinationModule` are STABLE
 *     KEYS resolved against the client's allowlist — the Zod boundary rejects
 *     URL-shaped values; this service pins the key against `destinationType`
 *     (a `linked_module` value must be a known module key; `informational`
 *     carries none; `pro_paywall` forces `isProFeatureDiscovery`).
 *   - **The badge/badgeLabel pairing** is guarded at the Zod boundary; the
 *     public read-side null-both backstop stays.
 *   - **`iconKey` is a bundled-asset key, never a URL** — validated as a key,
 *     never through `validateOwnedUrl`.
 *   - **`validateOwnedUrl` before every media write** (five triples).
 *   - **`HomeSettings` is a singleton** — get-or-create on read, `PATCH` only.
 */
export class HomeAdminService {
  constructor(private readonly repo: HomeRepository) {}

  // =========================================================================
  // HomeBanner
  // =========================================================================

  async listBanners(params: AdminBannerListParams): Promise<Page<AdminHomeBannerView>> {
    const { items, total } = await this.repo.findAdminBannerPage(params);
    return { items, total, page: params.page, pageSize: params.pageSize };
  }

  async getBanner(id: string): Promise<AdminHomeBannerDetailView> {
    const row = await this.repo.findAdminBannerById(id);
    if (!row) throw new AppError("Banner not found", 404, "NOT_FOUND");
    return row;
  }

  async createBanner(params: AdminBannerCreateParams): Promise<AdminHomeBannerDetailView> {
    // mediaType discrimination: video → thumbnail required; image → none.
    const thumbnailUrl = params.thumbnailUrl ?? null;
    this.assertBannerThumbnail(params.mediaType, thumbnailUrl);
    await this.validateBannerMedia(params.mediaType, params.mediaUrl);
    if (thumbnailUrl !== null) await this.validateMedia(thumbnailUrl, BANNER_ENTITY, "thumbnailUrl");

    const destination = resolveDestination(params.destinationType, params.destinationValue ?? null);
    const data: BannerCreateData = {
      mediaType: params.mediaType,
      mediaUrl: params.mediaUrl,
      thumbnailUrl,
      title: params.title ?? null,
      destinationType: params.destinationType,
      destinationValue: destination.destinationValue,
      isProFeatureDiscovery: destination.forcePro ? true : params.isProFeatureDiscovery,
      sortOrder: params.sortOrder,
      isActive: params.isActive,
      translations: params.translations,
    };
    const row = await this.repo.createBanner(data);
    log.info({ event: "home_banner_created", id: row.id }, "banner created");
    return row;
  }

  async updateBanner(
    id: string,
    params: AdminBannerPatchParams
  ): Promise<AdminHomeBannerDetailView> {
    const existing = await this.repo.findAdminBannerById(id);
    if (!existing) throw new AppError("Banner not found", 404, "NOT_FOUND");

    const data: BannerUpdateData = {};

    // `mediaType` is immutable — validate media against the EXISTING type.
    if (params.mediaUrl !== undefined) {
      await this.validateBannerMedia(existing.mediaType, params.mediaUrl);
      data.mediaUrl = params.mediaUrl;
    }
    if (params.thumbnailUrl !== undefined) {
      this.assertBannerThumbnail(existing.mediaType, params.thumbnailUrl);
      if (params.thumbnailUrl !== null) {
        await this.validateMedia(params.thumbnailUrl, BANNER_ENTITY, "thumbnailUrl");
      }
      data.thumbnailUrl = params.thumbnailUrl;
    }

    // Destination safety.
    const effectiveType = params.destinationType ?? existing.destinationType;
    if (params.destinationType !== undefined || params.destinationValue !== undefined) {
      const effectiveValue =
        params.destinationValue !== undefined
          ? params.destinationValue
          : existing.destinationValue;
      const destination = resolveDestination(effectiveType, effectiveValue);
      if (params.destinationType !== undefined) data.destinationType = params.destinationType;
      data.destinationValue = destination.destinationValue;
    }
    if (effectiveType === "pro_paywall") {
      data.isProFeatureDiscovery = true; // forced, never trusted from the client
    } else if (params.isProFeatureDiscovery !== undefined) {
      data.isProFeatureDiscovery = params.isProFeatureDiscovery;
    }

    if (params.title !== undefined) data.title = params.title;
    if (params.sortOrder !== undefined) data.sortOrder = params.sortOrder;
    if (params.isActive !== undefined) data.isActive = params.isActive;

    const count = await this.repo.updateBannerWithPrecondition({
      id,
      expectedUpdatedAt: new Date(params.expectedUpdatedAt),
      data,
      translations: params.translations,
    });
    await this.finalizeWrite(count, () => this.repo.bannerExists(id), "Banner");
    log.info({ event: "home_banner_updated", id }, "banner updated");
    return this.getBanner(id);
  }

  async deactivateBanner(
    id: string,
    expectedUpdatedAt: string
  ): Promise<AdminHomeBannerDetailView> {
    const count = await this.repo.updateBannerWithPrecondition({
      id,
      expectedUpdatedAt: new Date(expectedUpdatedAt),
      data: { isActive: false },
    });
    await this.finalizeWrite(count, () => this.repo.bannerExists(id), "Banner");
    log.info({ event: "home_banner_deactivated", id }, "banner deactivated");
    return this.getBanner(id);
  }

  // =========================================================================
  // HomeFeedItem
  // =========================================================================

  async listFeedItems(params: AdminFeedListParams): Promise<Page<AdminHomeFeedView>> {
    const { items, total } = await this.repo.findAdminFeedPage(params);
    return { items, total, page: params.page, pageSize: params.pageSize };
  }

  async getFeedItem(id: string): Promise<AdminHomeFeedDetailView> {
    const row = await this.repo.findAdminFeedById(id);
    if (!row) throw new AppError("Feed item not found", 404, "NOT_FOUND");
    return row;
  }

  async createFeedItem(params: AdminFeedCreateParams): Promise<AdminHomeFeedDetailView> {
    const audioPreviewUrl = params.audioPreviewUrl ?? null;
    const shareThumbnailUrl = params.shareThumbnailUrl ?? null;

    this.assertAudioPreview(params.contentType, audioPreviewUrl);
    this.assertCtaKey(params.ctaDestinationType, params.ctaDestinationValue);

    await this.validateReusableMedia(params.heroImageUrl, FEED_ENTITY, "heroImageUrl");
    if (audioPreviewUrl !== null) await this.validateReusableMedia(audioPreviewUrl, FEED_ENTITY, "audioPreviewUrl");
    if (shareThumbnailUrl !== null) await this.validateReusableMedia(shareThumbnailUrl, FEED_ENTITY, "shareThumbnailUrl");

    const data: FeedCreateData = {
      slug: params.slug,
      contentType: params.contentType,
      module: params.module,
      deitySlug: params.deitySlug,
      title: params.title,
      subtitle: params.subtitle ?? null,
      label: params.label ?? null,
      badge: params.badge,
      badgeLabel: params.badgeLabel,
      heroImageUrl: params.heroImageUrl,
      audioPreviewUrl,
      ctaLabel: params.ctaLabel,
      ctaDestinationType: params.ctaDestinationType,
      ctaDestinationValue: params.ctaDestinationValue,
      headerDestinationModule: params.headerDestinationModule,
      shareTitle: params.shareTitle,
      shareText: params.shareText,
      shareDeepLink: params.shareDeepLink,
      shareThumbnailUrl,
      trendingScore: params.trendingScore ?? null,
      isActive: params.isActive,
      translations: params.translations,
    };
    const row = await this.repo.createFeedItem(data);
    log.info({ event: "home_feed_item_created", id: row.id, slug: row.slug }, "feed item created");
    return row;
  }

  async updateFeedItem(
    id: string,
    params: AdminFeedPatchParams
  ): Promise<AdminHomeFeedDetailView> {
    const existing = await this.repo.findAdminFeedById(id);
    if (!existing) throw new AppError("Feed item not found", 404, "NOT_FOUND");

    // audioPreviewUrl ↔ contentType correspondence, against the effective row.
    if (params.audioPreviewUrl !== undefined || params.contentType !== undefined) {
      const effectiveContentType = params.contentType ?? existing.contentType;
      const effectiveAudio =
        params.audioPreviewUrl !== undefined
          ? params.audioPreviewUrl
          : existing.audioPreviewUrl;
      this.assertAudioPreview(effectiveContentType, effectiveAudio);
    }
    // CTA destination-safety, against the effective row.
    if (params.ctaDestinationType !== undefined || params.ctaDestinationValue !== undefined) {
      const effectiveCtaType = params.ctaDestinationType ?? existing.ctaDestinationType;
      const effectiveCtaValue =
        params.ctaDestinationValue !== undefined
          ? params.ctaDestinationValue
          : existing.ctaDestinationValue;
      this.assertCtaKey(effectiveCtaType, effectiveCtaValue);
    }

    if (params.heroImageUrl !== undefined) {
      await this.validateReusableMedia(params.heroImageUrl, FEED_ENTITY, "heroImageUrl");
    }
    if (params.audioPreviewUrl !== undefined && params.audioPreviewUrl !== null) {
      await this.validateReusableMedia(params.audioPreviewUrl, FEED_ENTITY, "audioPreviewUrl");
    }
    if (params.shareThumbnailUrl !== undefined && params.shareThumbnailUrl !== null) {
      await this.validateReusableMedia(params.shareThumbnailUrl, FEED_ENTITY, "shareThumbnailUrl");
    }

    const data: FeedUpdateData = {};
    if (params.contentType !== undefined) data.contentType = params.contentType;
    if (params.module !== undefined) data.module = params.module;
    if (params.deitySlug !== undefined) data.deitySlug = params.deitySlug;
    if (params.title !== undefined) data.title = params.title;
    if (params.subtitle !== undefined) data.subtitle = params.subtitle;
    if (params.label !== undefined) data.label = params.label;
    if (params.badge !== undefined) data.badge = params.badge;
    if (params.badgeLabel !== undefined) data.badgeLabel = params.badgeLabel;
    if (params.heroImageUrl !== undefined) data.heroImageUrl = params.heroImageUrl;
    if (params.audioPreviewUrl !== undefined) data.audioPreviewUrl = params.audioPreviewUrl;
    if (params.ctaLabel !== undefined) data.ctaLabel = params.ctaLabel;
    if (params.ctaDestinationType !== undefined) data.ctaDestinationType = params.ctaDestinationType;
    if (params.ctaDestinationValue !== undefined) data.ctaDestinationValue = params.ctaDestinationValue;
    if (params.headerDestinationModule !== undefined) {
      data.headerDestinationModule = params.headerDestinationModule;
    }
    if (params.shareTitle !== undefined) data.shareTitle = params.shareTitle;
    if (params.shareText !== undefined) data.shareText = params.shareText;
    if (params.shareDeepLink !== undefined) data.shareDeepLink = params.shareDeepLink;
    if (params.shareThumbnailUrl !== undefined) data.shareThumbnailUrl = params.shareThumbnailUrl;
    if (params.trendingScore !== undefined) data.trendingScore = params.trendingScore;
    if (params.isActive !== undefined) data.isActive = params.isActive;

    const count = await this.repo.updateFeedWithPrecondition({
      id,
      expectedUpdatedAt: new Date(params.expectedUpdatedAt),
      data,
      translations: params.translations,
    });
    await this.finalizeWrite(count, () => this.repo.feedExists(id), "Feed item");
    log.info({ event: "home_feed_item_updated", id }, "feed item updated");
    return this.getFeedItem(id);
  }

  async deactivateFeedItem(
    id: string,
    expectedUpdatedAt: string
  ): Promise<AdminHomeFeedDetailView> {
    const count = await this.repo.updateFeedWithPrecondition({
      id,
      expectedUpdatedAt: new Date(expectedUpdatedAt),
      data: { isActive: false },
    });
    await this.finalizeWrite(count, () => this.repo.feedExists(id), "Feed item");
    log.info({ event: "home_feed_item_deactivated", id }, "feed item deactivated");
    return this.getFeedItem(id);
  }

  // =========================================================================
  // HomeShortcut
  // =========================================================================

  async listShortcuts(params: AdminShortcutListParams): Promise<Page<AdminHomeShortcutView>> {
    const { items, total } = await this.repo.findAdminShortcutPage(params);
    return { items, total, page: params.page, pageSize: params.pageSize };
  }

  async getShortcut(id: string): Promise<AdminHomeShortcutDetailView> {
    const row = await this.repo.findAdminShortcutById(id);
    if (!row) throw new AppError("Shortcut not found", 404, "NOT_FOUND");
    return row;
  }

  async createShortcut(
    params: AdminShortcutCreateParams
  ): Promise<AdminHomeShortcutDetailView> {
    const destination = resolveDestination(
      params.destinationType,
      params.destinationValue ?? null
    );
    // `iconKey` is a bundled-asset KEY — validated as a key at the Zod boundary
    // (never through `validateOwnedUrl`); nothing more to do here.
    //
    // TAM-132 — `iconUrl` IS a real ownable URL: validate as `mediaUrl` at the
    // Zod boundary AND gate through `validateOwnedUrl` here (URL must be one we
    // minted via `/admin/media/presign`).
    const iconUrl = params.iconUrl ?? null;
    if (iconUrl !== null) {
      await this.validateMedia(iconUrl, SHORTCUT_ENTITY, "iconUrl");
    }
    const data: ShortcutCreateData = {
      key: params.key,
      label: params.label,
      destinationType: params.destinationType,
      destinationValue: destination.destinationValue,
      iconKey: params.iconKey ?? null,
      iconUrl,
      // TAM-132 BC gate — plain passthrough; a garbled stored value hides the
      // row via `parseAppVersion`'s tolerant null return, never 500s the read.
      minAppVersion: params.minAppVersion ?? null,
      // TAM-174 — the arm rows, validated before anything is written.
      variants: normaliseVariants(params.variants) ?? [],
      sortOrder: params.sortOrder,
      isActive: params.isActive,
      translations: params.translations,
    };
    const row = await this.repo.createShortcut(data);
    log.info({ event: "home_shortcut_created", id: row.id, key: row.key }, "shortcut created");
    return row;
  }

  async updateShortcut(
    id: string,
    params: AdminShortcutPatchParams
  ): Promise<AdminHomeShortcutDetailView> {
    const existing = await this.repo.findAdminShortcutById(id);
    if (!existing) throw new AppError("Shortcut not found", 404, "NOT_FOUND");

    // TAM-132 — `iconUrl` (when non-null) must be a URL WE minted (owned-URL
    // gate). Explicit `null` clears the field; `undefined` leaves it untouched.
    if (params.iconUrl !== undefined && params.iconUrl !== null) {
      await this.validateMedia(params.iconUrl, SHORTCUT_ENTITY, "iconUrl");
    }

    const data: ShortcutUpdateData = {};
    if (params.destinationType !== undefined || params.destinationValue !== undefined) {
      const effectiveType = params.destinationType ?? existing.destinationType;
      const effectiveValue =
        params.destinationValue !== undefined
          ? params.destinationValue
          : existing.destinationValue;
      const destination = resolveDestination(effectiveType, effectiveValue);
      if (params.destinationType !== undefined) data.destinationType = params.destinationType;
      data.destinationValue = destination.destinationValue;
    }
    if (params.label !== undefined) data.label = params.label;
    if (params.iconKey !== undefined) data.iconKey = params.iconKey;
    if (params.iconUrl !== undefined) data.iconUrl = params.iconUrl;
    // TAM-132 BC gate — plain passthrough on PATCH (undefined ⇒ untouched;
    // explicit `null` clears the gate).
    if (params.minAppVersion !== undefined) data.minAppVersion = params.minAppVersion;
    if (params.sortOrder !== undefined) data.sortOrder = params.sortOrder;
    if (params.isActive !== undefined) data.isActive = params.isActive;

    const count = await this.repo.updateShortcutWithPrecondition({
      id,
      expectedUpdatedAt: new Date(params.expectedUpdatedAt),
      data,
      translations: params.translations,
      // TAM-174 — undefined ⇒ untouched; provided ⇒ REPLACE the whole arm set.
      variants: normaliseVariants(params.variants),
    });
    await this.finalizeWrite(count, () => this.repo.shortcutExists(id), "Shortcut");
    log.info({ event: "home_shortcut_updated", id }, "shortcut updated");
    return this.getShortcut(id);
  }

  async deactivateShortcut(
    id: string,
    expectedUpdatedAt: string
  ): Promise<AdminHomeShortcutDetailView> {
    const count = await this.repo.updateShortcutWithPrecondition({
      id,
      expectedUpdatedAt: new Date(expectedUpdatedAt),
      data: { isActive: false },
    });
    await this.finalizeWrite(count, () => this.repo.shortcutExists(id), "Shortcut");
    log.info({ event: "home_shortcut_deactivated", id }, "shortcut deactivated");
    return this.getShortcut(id);
  }

  // =========================================================================
  // HomeSettings — the singleton (`GET` + `PATCH` only)
  // =========================================================================

  /** Get-or-create the singleton — never 404s on a fresh DB (AC (g)). */
  async getSettings(): Promise<AdminHomeSettingsView> {
    return this.repo.getOrCreateSettings();
  }

  /**
   * Upsert the singleton under the `updatedAt` precondition. `key` is never
   * client-settable. The row is materialized first (get-or-create) so a fresh
   * DB `PATCH` behaves like every other; a 0-count is therefore unambiguously a
   * 409 `STALE_WRITE` (the row always exists by this point).
   */
  async updateSettings(
    params: AdminSettingsPatchParams
  ): Promise<AdminHomeSettingsView> {
    await this.repo.getOrCreateSettings();
    const count = await this.repo.updateSettingsWithPrecondition({
      expectedUpdatedAt: new Date(params.expectedUpdatedAt),
      feedTrendingFirst: params.feedTrendingFirst,
      shortcutGridGradientEnabled: params.shortcutGridGradientEnabled,
    });
    if (count === 0) {
      throw new AppError(
        "Settings were modified by someone else; reload and retry",
        409,
        "STALE_WRITE"
      );
    }
    log.info(
      {
        event: "home_settings_updated",
        feedTrendingFirst: params.feedTrendingFirst,
        // TAM-174 — logged because it starts/stops a live experiment, which is
        // the one settings change worth being able to correlate with a shift in
        // the funnel after the fact.
        shortcutGridGradientEnabled: params.shortcutGridGradientEnabled,
      },
      "home settings updated"
    );
    return this.repo.getOrCreateSettings();
  }

  // -------------------------------------------------------------------------
  // internals
  // -------------------------------------------------------------------------

  /**
   * Turn the `updateMany` count of 0 into the correct 404 vs 409 (ADR §C3). A
   * 0 is ambiguous — the row could be GONE (404) or the caller's `updatedAt`
   * STALE (409) — so a follow-up existence probe disambiguates.
   */
  private async finalizeWrite(
    count: number,
    exists: () => Promise<boolean>,
    label: string
  ): Promise<void> {
    if (count === 0) {
      if (!(await exists())) throw new AppError(`${label} not found`, 404, "NOT_FOUND");
      throw new AppError(
        `${label} was modified by someone else; reload and retry`,
        409,
        "STALE_WRITE"
      );
    }
  }

  /**
   * `validateOwnedUrl` before a media write (ADR §A4 / #EXPORT_CRITICAL) —
   * throws `ValidationError` (→ 400) and no row is written unless the URL was
   * minted by our presign flow AND the object exists with an allowlisted
   * content-type for the `(module, entity, field)` triple.
   */
  private async validateMedia(
    url: string,
    entity: string,
    field: string
  ): Promise<void> {
    await performServiceCall(
      "media",
      (m) => m.validateOwnedUrl({ url, module: MEDIA_MODULE, entity, field }),
      "home:admin:media",
      "media URL validation failed"
    );
  }

  /**
   * Feed-only: accept a media URL minted for ANOTHER field, so a feed card can
   * REUSE the source content's own image/audio instead of forcing a duplicate
   * re-upload under `home/home-feed-item/`. Same ownership + existence +
   * content-type guarantees as `validateMedia` — only the per-field key prefix is
   * relaxed (see MediaService.validateReusableUrl). Banners keep the strict path.
   */
  private async validateReusableMedia(
    url: string,
    entity: string,
    field: string
  ): Promise<void> {
    await performServiceCall(
      "media",
      (m) => m.validateReusableUrl({ url, module: MEDIA_MODULE, entity, field }),
      "home:admin:media",
      "media URL validation failed"
    );
  }

  /**
   * The banner `mediaUrl` allowlist depends on `mediaType` — the ONE conditional
   * field in the epic (#PLAN_UNCERTAINTY). The TAM-84 registry entry
   * `home.homeBanner.mediaUrl` accepts BOTH image and `video/mp4` (it cannot
   * express the conditional), so after `validateOwnedUrl` we HEAD the object and
   * pin the content-type to `mediaType`: `image` → an `image/*`; `video` →
   * `video/mp4`.
   */
  private async validateBannerMedia(
    mediaType: BannerMediaType,
    url: string
  ): Promise<void> {
    await this.validateMedia(url, BANNER_ENTITY, "mediaUrl");
    const head = await performServiceCall(
      "media",
      (m) => m.head(url),
      "home:admin:media-head",
      "media metadata lookup failed"
    );
    const contentType = head.contentType ?? "";
    const ok =
      mediaType === "image"
        ? contentType.startsWith("image/")
        : contentType === "video/mp4";
    if (!ok) {
      throw new ValidationError(
        `banner mediaUrl content-type "${contentType || "unknown"}" does not match mediaType "${mediaType}"`
      );
    }
  }

  /** `image` → no thumbnail; `video` → thumbnail required (schema comment). */
  private assertBannerThumbnail(
    mediaType: BannerMediaType,
    thumbnailUrl: string | null
  ): void {
    if (mediaType === "video" && thumbnailUrl === null) {
      throw new ValidationError("video banners require a thumbnailUrl (the video still)");
    }
    if (mediaType === "image" && thumbnailUrl !== null) {
      throw new ValidationError("image banners must not carry a thumbnailUrl");
    }
  }

  /** `audioPreviewUrl` present ONLY for aarti | mantra | ringtone content types. */
  private assertAudioPreview(
    contentType: FeedContentType,
    audioPreviewUrl: string | null
  ): void {
    if (audioPreviewUrl !== null && !AUDIO_FEED_CONTENT_TYPES.includes(contentType)) {
      throw new ValidationError(
        `audioPreviewUrl is only allowed for ${AUDIO_FEED_CONTENT_TYPES.join(", ")} content (not "${contentType}")`
      );
    }
  }

  /**
   * The feed CTA is a routing key (#EXPORT_CRITICAL). A `linked_module` CTA's
   * value MUST be a known module key; the URL-shape rejection already happened
   * at the Zod boundary.
   */
  private assertCtaKey(
    ctaDestinationType: string,
    ctaDestinationValue: string
  ): void {
    if (ctaDestinationType === "linked_module" && !MODULE_KEY_SET.has(ctaDestinationValue)) {
      throw new ValidationError(
        `ctaDestinationValue "${ctaDestinationValue}" is not a known module key`
      );
    }
  }
}

/**
 * Pin a CMS-authored destination key against its `destinationType`
 * (#EXPORT_CRITICAL). Shared by banners and shortcuts (they use one destination
 * vocabulary). URL-shape rejection already happened at the Zod boundary; this
 * enforces the correspondence the client's allowlist relies on:
 *   - `informational`   → NO value (the schema says `destinationValue` is null);
 *   - `pro_paywall`     → a paywall id + FORCE `isProFeatureDiscovery`;
 *   - `linked_module`   → a KNOWN module key (mirrors the client allowlist);
 *   - `content_detail`  → a content id/slug.
 */
function resolveDestination(
  type: BannerDestinationType,
  value: string | null
): ResolvedDestination {
  switch (type) {
    case "informational":
      if (value !== null) {
        throw new ValidationError(
          "informational destinations must not carry a destinationValue"
        );
      }
      return { destinationValue: null, forcePro: false };
    case "pro_paywall":
      if (!value) {
        throw new ValidationError("pro_paywall destinations require a paywall id");
      }
      return { destinationValue: value, forcePro: true };
    case "linked_module":
      if (!value || !MODULE_KEY_SET.has(value)) {
        throw new ValidationError(
          `linked_module destinationValue "${value ?? ""}" is not a known module key`
        );
      }
      return { destinationValue: value, forcePro: false };
    case "content_detail":
      if (!value) {
        throw new ValidationError("content_detail destinations require a content id/slug");
      }
      return { destinationValue: value, forcePro: false };
  }
}
