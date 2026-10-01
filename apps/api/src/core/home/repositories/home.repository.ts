import { Prisma } from "@prisma/client";
import { getPrisma } from "@api/shared/database";
import { AppError } from "@api/shared/errors";
import type { CursorKey } from "@api/shared/pagination";
import type {
  AdminHomeBannerDetailView,
  AdminHomeBannerView,
  AdminHomeFeedDetailView,
  AdminHomeFeedView,
  AdminHomeSettingsView,
  AdminHomeShortcutDetailView,
  AdminHomeShortcutView,
  BannerDestinationType,
  BannerMediaType,
  BannerSortField,
  FeedBadge,
  FeedContentType,
  FeedSortField,
  ShortcutDestinationType,
  ShortcutSortField,
} from "@api/core/home/types";

/**
 * Home module repository — the ONLY place `@prisma/client` is reached for this
 * module (arch-boundaries.json enforces it; the service stays Prisma-free).
 *
 * Owns: the active banner read (curated order), the active SHORTCUT read (curated
 * order), the mixed-feed keyset page in BOTH ordering modes (default id-ordered,
 * or trending-first), the feed item gate, and the single-row store
 * settings read. It does NOT touch the
 * engagement tables — like/view/share counts live in TAM-57 and are reached by
 * the SERVICE via `performServiceCall` (contentType "home_item").
 *
 * KEYSET PAGINATION mirrors status/wallpaper: every listing orders by a stable
 * `(value, id)` tuple and fetches `limit + 1` rows so the service can detect a
 * next page. In the default mode the feed keys purely on `id` (ASC — a stable,
 * effectively-random tail; the curated `sort_order` column was dropped). In
 * TRENDING-FIRST mode the feed is two independently-keyset segments served
 * back-to-back — the trending segment (`trending_score` non-null, DESC) then the
 * remaining id-ordered segment — so a single opaque cursor can page the whole mixed feed with no
 * grouping by content type (see `home.service.ts` for the composite key).
 */

/**
 * Per-(banner, locale) label OVERRIDE projection carried on a PUBLIC read
 * (TAM-113). The base `HomeBanner.title` column stays the `en` fallback; this is
 * the requested locale's override the service resolves against it.
 */
export interface HomeBannerTranslationRow {
  locale: string;
  title: string;
}

/** Per-(feed item, locale) label OVERRIDES — all framing fields in ONE row. */
export interface HomeFeedTranslationRow {
  locale: string;
  title: string;
  subtitle: string | null;
  label: string | null;
  ctaLabel: string;
  badgeLabel: string | null;
}

/** Per-(shortcut, locale) `label` override projection. */
export interface HomeShortcutTranslationRow {
  locale: string;
  label: string;
}

/** Raw banner row (active-only reads). */
export interface HomeBannerRow {
  id: string;
  mediaType: BannerMediaType;
  mediaUrl: string;
  thumbnailUrl: string | null;
  title: string | null;
  destinationType: BannerDestinationType;
  destinationValue: string | null;
  isProFeatureDiscovery: boolean;
  sortOrder: number;
  translations: HomeBannerTranslationRow[];
}

/** Raw shortcut row (active-only reads). */
/**
 * TAM-174 — one arm's presentation overrides for a shortcut.
 *
 * Every field except `variant` is nullable and null means INHERIT the base
 * `HomeShortcut` row, so an arm that only restyles does not have to re-state
 * copy or artwork that has not changed.
 */
export interface HomeShortcutVariantRow {
  variant: string;
  label: string | null;
  iconUrl: string | null;
  /**
   * The minimum mobile `app_version` that can RENDER this arm. NULL ⇒ no gate.
   * Applied by the SERVICE (it holds the request's version), which drops the
   * whole override set for a client below it — see `toShortcut`.
   */
  minAppVersion: string | null;
  themeBackgroundFrom: string | null;
  themeBackgroundFromStop: number | null;
  themeBackgroundTo: string | null;
  themeBackgroundToStop: number | null;
  themeLabelColor: string | null;
}

export interface HomeShortcutRow {
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
   * shortcut becomes visible (semver string, e.g. "1.1.0"). NULL ⇒ no gate.
   * The service filter reads this; the public wire never projects it.
   */
  minAppVersion: string | null;
  /**
   * TAM-174 — per-A/B-arm presentation overrides, 0..n (one row per arm).
   *
   * Carried as a LIST rather than pre-resolved because the repository does not
   * know the caller's arm — that is the service's decision, and keeping the
   * resolution there is what stops a Prisma-layer concern from needing the
   * abtesting client.
   */
  variants: HomeShortcutVariantRow[];
  sortOrder: number;
  translations: HomeShortcutTranslationRow[];
}

/** Raw feed-item row — everything the service needs to build a card. */
export interface HomeFeedRow {
  id: string;
  contentType: FeedContentType;
  module: string;
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
  ctaContentId: string | null;
  headerDestinationModule: string;
  shareTitle: string;
  shareText: string;
  shareDeepLink: string;
  shareThumbnailUrl: string | null;
  trendingScore: number | null;
  translations: HomeFeedTranslationRow[];
}

/**
 * Translation-relation `where` for a PUBLIC read (TAM-113): the requested locale
 * only. The base column is the guaranteed `en` fallback (the resolver reads it
 * when no override row matches), so — unlike deity, whose display name lives ONLY
 * in translation rows — home never needs to also fetch `en`. An ABSENT locale
 * matches no override rows, so the read resolves entirely to base columns and the
 * pre-localization contract is preserved (non-breaking for un-updated clients).
 */
function localeFilter(
  locale: string | undefined
): { locale: string } | { locale: { in: string[] } } {
  return locale === undefined ? { locale: { in: [] } } : { locale };
}

const BANNER_TRANSLATION_SELECT = {
  select: { locale: true, title: true },
} as const;

const FEED_TRANSLATION_SELECT = {
  select: {
    locale: true,
    title: true,
    subtitle: true,
    label: true,
    ctaLabel: true,
    badgeLabel: true,
  },
} as const;

const SHORTCUT_TRANSLATION_SELECT = {
  select: { locale: true, label: true },
} as const;

const BANNER_SELECT = {
  id: true,
  mediaType: true,
  mediaUrl: true,
  thumbnailUrl: true,
  title: true,
  destinationType: true,
  destinationValue: true,
  isProFeatureDiscovery: true,
  sortOrder: true,
} as const;

const SHORTCUT_SELECT = {
  id: true,
  key: true,
  label: true,
  destinationType: true,
  destinationValue: true,
  iconKey: true,
  iconUrl: true,
  // TAM-132 backwards-compat gate — the service filters on this against the
  // caller's `app_version` header; deliberately NOT projected on the wire.
  minAppVersion: true,
  // TAM-174 — EVERY arm's overrides are fetched, and the service picks one.
  // Selecting only the caller's arm would need the arm here, which would drag
  // the abtesting decision down into the repository.
  variants: {
    select: {
      variant: true,
      label: true,
      iconUrl: true,
      minAppVersion: true,
      themeBackgroundFrom: true,
      themeBackgroundFromStop: true,
      themeBackgroundTo: true,
      themeBackgroundToStop: true,
      themeLabelColor: true,
    },
  },
  sortOrder: true,
} as const;

const FEED_SELECT = {
  id: true,
  contentType: true,
  module: true,
  title: true,
  subtitle: true,
  label: true,
  badge: true,
  badgeLabel: true,
  heroImageUrl: true,
  audioPreviewUrl: true,
  ctaLabel: true,
  ctaDestinationType: true,
  ctaDestinationValue: true,
  ctaContentId: true,
  headerDestinationModule: true,
  shareTitle: true,
  shareText: true,
  shareDeepLink: true,
  shareThumbnailUrl: true,
  trendingScore: true,
} as const;

interface RawBannerRow {
  id: string;
  mediaType: string;
  mediaUrl: string;
  thumbnailUrl: string | null;
  title: string | null;
  destinationType: string;
  destinationValue: string | null;
  isProFeatureDiscovery: boolean;
  sortOrder: number;
  translations: HomeBannerTranslationRow[];
}

interface RawShortcutRow {
  id: string;
  key: string;
  label: string;
  destinationType: string;
  destinationValue: string | null;
  iconKey: string | null;
  iconUrl: string | null;
  minAppVersion: string | null;
  variants: HomeShortcutVariantRow[];
  sortOrder: number;
  translations: HomeShortcutTranslationRow[];
}

interface RawFeedRow {
  id: string;
  contentType: string;
  module: string;
  title: string;
  subtitle: string | null;
  label: string | null;
  badge: string | null;
  badgeLabel: string | null;
  heroImageUrl: string;
  audioPreviewUrl: string | null;
  ctaLabel: string;
  ctaDestinationType: string;
  ctaDestinationValue: string;
  ctaContentId: string | null;
  headerDestinationModule: string;
  shareTitle: string;
  shareText: string;
  shareDeepLink: string;
  shareThumbnailUrl: string | null;
  trendingScore: number | null;
  translations: HomeFeedTranslationRow[];
}

function toBanner(raw: RawBannerRow): HomeBannerRow {
  return {
    ...raw,
    // `media_type` / `destination_type` are TEXT columns guarded to their enums
    // by the seed + Zod boundary; the cast keeps the wire type precise.
    mediaType: raw.mediaType as BannerMediaType,
    destinationType: raw.destinationType as BannerDestinationType,
  };
}

function toShortcut(raw: RawShortcutRow): HomeShortcutRow {
  return {
    ...raw,
    // `destination_type` is a TEXT column guarded to its enum by the seed + the
    // Zod boundary; the cast keeps the wire type precise (mirrors `toBanner`).
    destinationType: raw.destinationType as ShortcutDestinationType,
  };
}

function toFeed(raw: RawFeedRow): HomeFeedRow {
  return {
    ...raw,
    contentType: raw.contentType as FeedContentType,
    badge: (raw.badge as FeedBadge | null) ?? null,
  };
}

export class HomeRepository {
  /**
   * Active banners in curated order `(sort_order, id)`, each with its requested-
   * locale `title` override included (TAM-113). An absent `locale` includes no
   * override rows so the service resolves to the base `title` column — the
   * pre-localization behaviour, unchanged.
   */
  async listActiveBanners(locale?: string): Promise<HomeBannerRow[]> {
    const raws = await getPrisma().homeBanner.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      select: {
        ...BANNER_SELECT,
        translations: { where: localeFilter(locale), ...BANNER_TRANSLATION_SELECT },
      },
    });
    return raws.map(toBanner);
  }

  /**
   * Active shortcuts in curated order `(sort_order, id)`, each with its requested-
   * locale `label` override included (TAM-113). Absent `locale` ⇒ base column.
   */
  async listActiveShortcuts(locale?: string): Promise<HomeShortcutRow[]> {
    const raws = await getPrisma().homeShortcut.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      select: {
        ...SHORTCUT_SELECT,
        translations: {
          where: localeFilter(locale),
          ...SHORTCUT_TRANSLATION_SELECT,
        },
      },
    });
    return raws.map(toShortcut);
  }

  /**
   * One keyset page of active feed items.
   *
   * `trendingFirst = false` (default mode): a single keyset over `id` ASC — a
   * stable, effectively-random tail (the curated `sort_order` was dropped). The
   * cursor key is `{ sortOrder: 0, id }`.
   *
   * `trendingFirst = true`: the feed is the trending segment (`trending_score`
   * non-null, `(trending_score DESC, id ASC)`) followed by the remaining
   * id-ordered segment (`trending_score` null, `id ASC`). The composite cursor
   * key encodes which segment the last row was in (a NEGATIVE `sortOrder` value =
   * trending segment; `>= 0` = the id-ordered segment) so a single opaque cursor
   * pages the whole mixed feed. Fetches `limit + 1` rows.
   */
  async listFeedPage(params: {
    trendingFirst: boolean;
    limit: number;
    afterKey?: CursorKey;
    locale?: string;
  }): Promise<HomeFeedRow[]> {
    const { trendingFirst, limit, afterKey, locale } = params;
    const take = limit + 1;

    if (!trendingFirst) {
      return this.cmsSegment(afterKey, take, locale);
    }

    // Trending-first. A negative composite key (or no cursor) means we are still
    // in — or starting — the trending segment; a non-negative key means the
    // trending segment is already exhausted and we page the CMS segment.
    const inTrendingPhase = !afterKey || afterKey.sortOrder < 0;
    if (!inTrendingPhase) {
      // CMS phase of a trending-first feed: only the non-trending remainder
      // (trending rows were already served in the leading segment).
      return this.cmsSegment(afterKey, take, locale, true);
    }

    const trendingAfter = afterKey ? decodeTrendingKey(afterKey) : undefined;
    const trending = await this.trendingSegment(trendingAfter, take, locale);
    if (trending.length >= take) return trending;

    // The trending segment ended within this page — fill from the START of the
    // remaining CMS segment (non-trending rows, not yet served).
    const remaining = take - trending.length;
    const cms = await this.cmsSegment(undefined, remaining, locale, true);
    return [...trending, ...cms];
  }

  /**
   * The whole active feed catalogue as ROTATION candidates (TAM-150) — the
   * input the twice-daily re-order is computed from. Two columns per row and no
   * `take`, because rotation needs the full ring to slide a window over.
   *
   * Read once per refresh epoch (the service caches the built plan), NOT per
   * request. Locale is irrelevant here: a feed item's availability never depends
   * on it — only its display labels do, and those are resolved at hydration.
   *
   * ponytail: whole-catalogue read, same bounded-catalogue assumption
   * `wallpaper.findAllActiveIds` already makes. If the feed ever reaches tens of
   * thousands of rows, push the hash into SQL (`ORDER BY md5(id || :seed)`).
   */
  async listFeedRotationCandidates(): Promise<
    {
      id: string;
      contentType: FeedContentType;
      deitySlug: string | null;
      createdAtMs: number;
    }[]
  > {
    const rows = await getPrisma().homeFeedItem.findMany({
      where: { isActive: true },
      select: { id: true, contentType: true, deitySlug: true, createdAt: true },
    });
    return rows.map((r) => ({
      id: r.id,
      contentType: r.contentType as FeedContentType,
      deitySlug: r.deitySlug,
      createdAtMs: r.createdAt.getTime(),
    }));
  }

  /**
   * Hydrate one slice of a rotation plan. Order is NOT set here — the plan owns
   * it and the service restores it (`orderByPlan`), because no SQL ordering can
   * reproduce a hash-shuffled window.
   */
  async findFeedByIds(ids: string[], locale?: string): Promise<HomeFeedRow[]> {
    if (ids.length === 0) return [];
    const raws = await getPrisma().homeFeedItem.findMany({
      where: { isActive: true, id: { in: ids } },
      select: {
        ...FEED_SELECT,
        translations: { where: localeFilter(locale), ...FEED_TRANSLATION_SELECT },
      },
    });
    return raws.map(toFeed);
  }

  /** Existence check for the (optional) home_item engagement gate. */
  async findFeedItemById(id: string): Promise<{ id: string } | null> {
    return getPrisma().homeFeedItem.findFirst({
      where: { id, isActive: true },
      select: { id: true },
    });
  }

  /**
   * The single-row store settings. Both flags default FALSE when the row is
   * unset, which for `shortcutGridGradientEnabled` (TAM-174) is the safe
   * direction: no settings row means no experiment, not an experiment nobody
   * can switch off.
   */
  async getSettings(): Promise<{
    feedTrendingFirst: boolean;
    shortcutGridGradientEnabled: boolean;
  }> {
    const row = await getPrisma().homeSettings.findFirst({
      select: { feedTrendingFirst: true, shortcutGridGradientEnabled: true },
      orderBy: [{ key: "asc" }],
    });
    return {
      feedTrendingFirst: row?.feedTrendingFirst ?? false,
      shortcutGridGradientEnabled: row?.shortcutGridGradientEnabled ?? false,
    };
  }

  // =========================================================================
  // ADMIN write surface (TAM-104). Prisma stays confined here; the admin
  // service is Prisma-free. Admin reads do NOT filter on `isActive` — an editor
  // manages both active and deactivated rows (the `isActive` filter is a query
  // option). Public reads above are untouched.
  // =========================================================================

  // ---- HomeBanner ---------------------------------------------------------

  async findAdminBannerPage(params: {
    page: number;
    pageSize: number;
    sort?: BannerSortField;
    order: "asc" | "desc";
    isActive?: boolean;
    mediaType?: BannerMediaType;
    destinationType?: BannerDestinationType;
  }): Promise<{ items: AdminHomeBannerView[]; total: number }> {
    const where: Prisma.HomeBannerWhereInput = {
      ...(params.isActive !== undefined ? { isActive: params.isActive } : {}),
      ...(params.mediaType !== undefined ? { mediaType: params.mediaType } : {}),
      ...(params.destinationType !== undefined
        ? { destinationType: params.destinationType }
        : {}),
    };
    const [rows, total] = await Promise.all([
      getPrisma().homeBanner.findMany({
        where,
        orderBy: bannerOrderBy(params.sort, params.order),
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
        select: BANNER_ADMIN_SELECT,
      }),
      getPrisma().homeBanner.count({ where }),
    ]);
    return { items: rows.map(toBannerView), total };
  }

  async findAdminBannerById(
    id: string
  ): Promise<AdminHomeBannerDetailView | null> {
    const row = await getPrisma().homeBanner.findUnique({
      where: { id },
      select: BANNER_ADMIN_DETAIL_SELECT,
    });
    return row ? toBannerDetailView(row) : null;
  }

  async bannerExists(id: string): Promise<boolean> {
    const row = await getPrisma().homeBanner.findUnique({
      where: { id },
      select: { id: true },
    });
    return row !== null;
  }

  /** Create a banner and (optionally) its label overrides in one transaction. */
  async createBanner(data: BannerCreateData): Promise<AdminHomeBannerDetailView> {
    const { translations, ...scalars } = data;
    const row = await getPrisma().homeBanner.create({
      data: {
        ...scalars,
        translations: {
          create: translations.map((t) => ({ locale: t.locale, title: t.title })),
        },
      },
      select: BANNER_ADMIN_DETAIL_SELECT,
    });
    return toBannerDetailView(row);
  }

  /**
   * Optimistic-concurrency write + optional translation REPLACE, in ONE
   * transaction. `translations === undefined` ⇒ the set is left untouched;
   * provided (incl. `[]`) ⇒ the whole `(bannerId, locale)` set is replaced. A
   * 0-count short-circuits before touching translations (the service maps it to
   * 404-or-409).
   */
  async updateBannerWithPrecondition(params: {
    id: string;
    expectedUpdatedAt: Date;
    data: BannerUpdateData;
    translations?: BannerTranslationData[];
  }): Promise<number> {
    const { id, expectedUpdatedAt, data, translations } = params;
    return getPrisma().$transaction(async (tx) => {
      const { count } = await tx.homeBanner.updateMany({
        where: { id, updatedAt: expectedUpdatedAt },
        // `data` IS LEGITIMATELY EMPTY when the edit only touched related rows —
        // a translations-only banner edit, a variants-only shortcut edit (ops
        // uploading an arm's artwork and nothing else). Prisma SKIPS the query
        // entirely for an empty `data` and returns `count: 0`, which the
        // service reads as "precondition failed" and turns into a 409
        // STALE_WRITE — "Modified by someone else" on a row nobody else
        // touched. Stamping `updatedAt` keeps the statement non-empty so the
        // precondition is actually evaluated.
        //
        // It is also the correct SEMANTICS, not just a workaround: the related
        // rows written below belong to this row's version, so changing them
        // must advance the concurrency token. Without it, two editors could
        // overwrite each other's translations and neither would see a conflict.
        data: { ...data, updatedAt: new Date() },
      });
      if (count === 0) return 0;
      if (translations !== undefined) {
        await tx.homeBannerTranslation.deleteMany({ where: { homeBannerId: id } });
        if (translations.length > 0) {
          await tx.homeBannerTranslation.createMany({
            data: translations.map((t) => ({
              homeBannerId: id,
              locale: t.locale,
              title: t.title,
            })),
          });
        }
      }
      return count;
    });
  }

  // ---- HomeFeedItem -------------------------------------------------------

  async findAdminFeedPage(params: {
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
  }): Promise<{ items: AdminHomeFeedView[]; total: number }> {
    const where: Prisma.HomeFeedItemWhereInput = {
      ...(params.isActive !== undefined ? { isActive: params.isActive } : {}),
      ...(params.contentType !== undefined
        ? { contentType: params.contentType }
        : {}),
      ...(params.module !== undefined ? { module: params.module } : {}),
      ...(params.deitySlug !== undefined ? { deitySlug: params.deitySlug } : {}),
      ...(params.badge !== undefined ? { badge: params.badge } : {}),
      ...(params.q
        ? {
            OR: [
              { title: { contains: params.q, mode: "insensitive" } },
              { slug: { contains: params.q, mode: "insensitive" } },
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      getPrisma().homeFeedItem.findMany({
        where,
        orderBy: feedOrderBy(params.sort, params.order),
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
        select: FEED_ADMIN_SELECT,
      }),
      getPrisma().homeFeedItem.count({ where }),
    ]);
    return { items: rows.map(toFeedView), total };
  }

  async findAdminFeedById(id: string): Promise<AdminHomeFeedDetailView | null> {
    const row = await getPrisma().homeFeedItem.findUnique({
      where: { id },
      select: FEED_ADMIN_DETAIL_SELECT,
    });
    return row ? toFeedDetailView(row) : null;
  }

  async feedExists(id: string): Promise<boolean> {
    const row = await getPrisma().homeFeedItem.findUnique({
      where: { id },
      select: { id: true },
    });
    return row !== null;
  }

  /**
   * Create a feed item and (optionally) its framing overrides in one
   * transaction. Duplicate `slug` → 409 `SLUG_CONFLICT`, never a 500. Optional
   * translation fields absent ⇒ stored as SQL null.
   */
  async createFeedItem(data: FeedCreateData): Promise<AdminHomeFeedDetailView> {
    const { translations, ...scalars } = data;
    try {
      const row = await getPrisma().homeFeedItem.create({
        data: {
          ...scalars,
          translations: {
            create: translations.map((t) => ({
              locale: t.locale,
              title: t.title,
              subtitle: t.subtitle,
              label: t.label,
              ctaLabel: t.ctaLabel,
              badgeLabel: t.badgeLabel,
            })),
          },
        },
        select: FEED_ADMIN_DETAIL_SELECT,
      });
      return toFeedDetailView(row);
    } catch (err) {
      throw mapUniqueViolation(err, `slug "${data.slug}"`, "SLUG_CONFLICT");
    }
  }

  /**
   * Auto-feed: idempotently upsert a content-derived feed card on its
   * deterministic `slug`. A re-import or content edit refreshes the same card
   * (title/hero/CTA/share) instead of creating a dupe, and re-activates a card
   * whose content was re-added.
   */
  async upsertContentFeedCard(card: ContentFeedCardData): Promise<void> {
    await getPrisma().homeFeedItem.upsert({
      where: { slug: card.slug },
      create: card,
      update: {
        title: card.title,
        // TAM-175 — refreshed on every sync: re-tagging a status to a different
        // god must move its feed card to that god's pool at the next refresh,
        // not leave it in the old one until someone notices.
        deitySlug: card.deitySlug,
        heroImageUrl: card.heroImageUrl,
        audioPreviewUrl: card.audioPreviewUrl,
        ctaLabel: card.ctaLabel,
        ctaDestinationType: card.ctaDestinationType,
        ctaDestinationValue: card.ctaDestinationValue,
        ctaContentId: card.ctaContentId,
        headerDestinationModule: card.headerDestinationModule,
        shareTitle: card.shareTitle,
        shareText: card.shareText,
        shareDeepLink: card.shareDeepLink,
        shareThumbnailUrl: card.shareThumbnailUrl,
        // TAM-176 — FOLLOWS THE CONTENT, both ways. This was a hardcoded `true`,
        // which was right for the only caller it had (create / re-import) and
        // wrong the moment update and deactivate started syncing too:
        // deactivating a status would have re-activated its card. The feed
        // never joins back to the source row, so this flag is the ONLY thing
        // keeping deleted content out of it.
        isActive: card.isActive,
      },
    });
  }

  /**
   * Optimistic-concurrency write + optional translation REPLACE, in ONE
   * transaction (see `updateBannerWithPrecondition`). The replaced rows carry
   * title/subtitle/label/ctaLabel/badgeLabel — optional fields simply absent
   * when not provided (⇒ SQL null).
   */
  async updateFeedWithPrecondition(params: {
    id: string;
    expectedUpdatedAt: Date;
    data: FeedUpdateData;
    translations?: FeedTranslationData[];
  }): Promise<number> {
    const { id, expectedUpdatedAt, data, translations } = params;
    return getPrisma().$transaction(async (tx) => {
      const { count } = await tx.homeFeedItem.updateMany({
        where: { id, updatedAt: expectedUpdatedAt },
        // `data` IS LEGITIMATELY EMPTY when the edit only touched related rows —
        // a translations-only banner edit, a variants-only shortcut edit (ops
        // uploading an arm's artwork and nothing else). Prisma SKIPS the query
        // entirely for an empty `data` and returns `count: 0`, which the
        // service reads as "precondition failed" and turns into a 409
        // STALE_WRITE — "Modified by someone else" on a row nobody else
        // touched. Stamping `updatedAt` keeps the statement non-empty so the
        // precondition is actually evaluated.
        //
        // It is also the correct SEMANTICS, not just a workaround: the related
        // rows written below belong to this row's version, so changing them
        // must advance the concurrency token. Without it, two editors could
        // overwrite each other's translations and neither would see a conflict.
        data: { ...data, updatedAt: new Date() },
      });
      if (count === 0) return 0;
      if (translations !== undefined) {
        await tx.homeFeedItemTranslation.deleteMany({
          where: { homeFeedItemId: id },
        });
        if (translations.length > 0) {
          await tx.homeFeedItemTranslation.createMany({
            data: translations.map((t) => ({
              homeFeedItemId: id,
              locale: t.locale,
              title: t.title,
              subtitle: t.subtitle,
              label: t.label,
              ctaLabel: t.ctaLabel,
              badgeLabel: t.badgeLabel,
            })),
          });
        }
      }
      return count;
    });
  }

  // ---- HomeShortcut -------------------------------------------------------

  async findAdminShortcutPage(params: {
    page: number;
    pageSize: number;
    sort?: ShortcutSortField;
    order: "asc" | "desc";
    q?: string;
    isActive?: boolean;
  }): Promise<{ items: AdminHomeShortcutView[]; total: number }> {
    const where: Prisma.HomeShortcutWhereInput = {
      ...(params.isActive !== undefined ? { isActive: params.isActive } : {}),
      ...(params.q
        ? {
            OR: [
              { label: { contains: params.q, mode: "insensitive" } },
              { key: { contains: params.q, mode: "insensitive" } },
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      getPrisma().homeShortcut.findMany({
        where,
        orderBy: shortcutOrderBy(params.sort, params.order),
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
        select: SHORTCUT_ADMIN_SELECT,
      }),
      getPrisma().homeShortcut.count({ where }),
    ]);
    return { items: rows.map(toShortcutView), total };
  }

  async findAdminShortcutById(
    id: string
  ): Promise<AdminHomeShortcutDetailView | null> {
    const row = await getPrisma().homeShortcut.findUnique({
      where: { id },
      select: SHORTCUT_ADMIN_DETAIL_SELECT,
    });
    return row ? toShortcutDetailView(row) : null;
  }

  async shortcutExists(id: string): Promise<boolean> {
    const row = await getPrisma().homeShortcut.findUnique({
      where: { id },
      select: { id: true },
    });
    return row !== null;
  }

  /** Create a shortcut and (optionally) its label overrides in one transaction. */
  async createShortcut(
    data: ShortcutCreateData
  ): Promise<AdminHomeShortcutDetailView> {
    const { translations, variants, ...scalars } = data;
    try {
      const row = await getPrisma().homeShortcut.create({
        data: {
          ...scalars,
          translations: {
            create: translations.map((t) => ({
              locale: t.locale,
              label: t.label,
            })),
          },
          // TAM-174 — the arm rows ride in the same INSERT, so a shortcut and
          // its arms are never briefly out of step.
          variants: { create: variants },
        },
        select: SHORTCUT_ADMIN_DETAIL_SELECT,
      });
      return toShortcutDetailView(row);
    } catch (err) {
      throw mapUniqueViolation(err, `key "${data.key}"`, "KEY_CONFLICT");
    }
  }

  /**
   * Optimistic-concurrency write + optional translation REPLACE, in ONE
   * transaction (see `updateBannerWithPrecondition`).
   */
  async updateShortcutWithPrecondition(params: {
    id: string;
    expectedUpdatedAt: Date;
    data: ShortcutUpdateData;
    translations?: ShortcutTranslationData[];
    variants?: ShortcutVariantData[];
  }): Promise<number> {
    const { id, expectedUpdatedAt, data, translations, variants } = params;
    return getPrisma().$transaction(async (tx) => {
      const { count } = await tx.homeShortcut.updateMany({
        where: { id, updatedAt: expectedUpdatedAt },
        // `data` IS LEGITIMATELY EMPTY when the edit only touched related rows —
        // a translations-only banner edit, a variants-only shortcut edit (ops
        // uploading an arm's artwork and nothing else). Prisma SKIPS the query
        // entirely for an empty `data` and returns `count: 0`, which the
        // service reads as "precondition failed" and turns into a 409
        // STALE_WRITE — "Modified by someone else" on a row nobody else
        // touched. Stamping `updatedAt` keeps the statement non-empty so the
        // precondition is actually evaluated.
        //
        // It is also the correct SEMANTICS, not just a workaround: the related
        // rows written below belong to this row's version, so changing them
        // must advance the concurrency token. Without it, two editors could
        // overwrite each other's translations and neither would see a conflict.
        data: { ...data, updatedAt: new Date() },
      });
      if (count === 0) return 0;
      if (translations !== undefined) {
        await tx.homeShortcutTranslation.deleteMany({
          where: { homeShortcutId: id },
        });
        if (translations.length > 0) {
          await tx.homeShortcutTranslation.createMany({
            data: translations.map((t) => ({
              homeShortcutId: id,
              locale: t.locale,
              label: t.label,
            })),
          });
        }
      }
      // TAM-174 — same REPLACE contract as translations above: undefined leaves
      // the arms alone, a provided array (including `[]`) becomes the whole set.
      // Delete-then-insert rather than a per-row upsert because "these are the
      // arms now" is the operation ops performs; a merge would strand an arm
      // they removed from the form.
      if (variants !== undefined) {
        await tx.homeShortcutVariant.deleteMany({ where: { homeShortcutId: id } });
        if (variants.length > 0) {
          await tx.homeShortcutVariant.createMany({
            data: variants.map((v) => ({ homeShortcutId: id, ...v })),
          });
        }
      }
      return count;
    });
  }

  // ---- HomeSettings (singleton, keyed `"default"`) ------------------------

  /**
   * Get the singleton settings row, CREATING it (keyed `"default"`) if it does
   * not exist yet (ADR §C / AC (g)). A settings endpoint that 404s on a fresh
   * DB is a broken admin panel — so the read materializes the row. `@updatedAt`
   * is NOT bumped on a plain read: we `findUnique` first and only `create` when
   * missing (a concurrent create races to a P2002, which we recover by re-read).
   */
  async getOrCreateSettings(): Promise<AdminHomeSettingsView> {
    const existing = await getPrisma().homeSettings.findUnique({
      where: { key: SETTINGS_KEY },
      select: SETTINGS_ADMIN_SELECT,
    });
    if (existing) return toSettingsView(existing);
    try {
      const created = await getPrisma().homeSettings.create({
        data: { key: SETTINGS_KEY },
        select: SETTINGS_ADMIN_SELECT,
      });
      return toSettingsView(created);
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        const row = await getPrisma().homeSettings.findUnique({
          where: { key: SETTINGS_KEY },
          select: SETTINGS_ADMIN_SELECT,
        });
        if (row) return toSettingsView(row);
      }
      throw err;
    }
  }

  async updateSettingsWithPrecondition(params: {
    expectedUpdatedAt: Date;
    feedTrendingFirst: boolean;
    shortcutGridGradientEnabled: boolean;
  }): Promise<number> {
    const res = await getPrisma().homeSettings.updateMany({
      where: { key: SETTINGS_KEY, updatedAt: params.expectedUpdatedAt },
      data: {
        feedTrendingFirst: params.feedTrendingFirst,
        shortcutGridGradientEnabled: params.shortcutGridGradientEnabled,
      },
    });
    return res.count;
  }

  // ---- segment queries ----------------------------------------------------

  /** One keyset page of the default segment, id-ordered (`id` ASC — a stable
   * shuffle; the curated `sort_order` column was dropped). */
  private async cmsSegment(
    afterKey: CursorKey | undefined,
    take: number,
    locale: string | undefined,
    onlyNullTrending = false
  ): Promise<HomeFeedRow[]> {
    const raws = await getPrisma().homeFeedItem.findMany({
      where: {
        isActive: true,
        ...(onlyNullTrending ? { trendingScore: null } : {}),
        // The default segment keys purely on `id`; the cursor's `sortOrder`
        // field is the constant 0 here (its sign only distinguishes segments).
        ...(afterKey ? { id: { gt: afterKey.id } } : {}),
      },
      orderBy: [{ id: "asc" }],
      take,
      select: {
        ...FEED_SELECT,
        translations: { where: localeFilter(locale), ...FEED_TRANSLATION_SELECT },
      },
    });
    return raws.map(toFeed);
  }

  /**
   * One keyset page of the trending segment (`trending_score` non-null, ordered
   * `(trending_score DESC, id ASC)`).
   */
  private async trendingSegment(
    afterKey: { score: number; id: string } | undefined,
    take: number,
    locale: string | undefined
  ): Promise<HomeFeedRow[]> {
    const raws = await getPrisma().homeFeedItem.findMany({
      where: {
        isActive: true,
        trendingScore: { not: null },
        ...(afterKey
          ? {
              OR: [
                { trendingScore: { lt: afterKey.score } },
                {
                  AND: [
                    { trendingScore: afterKey.score },
                    { id: { gt: afterKey.id } },
                  ],
                },
              ],
            }
          : {}),
      },
      orderBy: [{ trendingScore: "desc" }, { id: "asc" }],
      take,
      select: {
        ...FEED_SELECT,
        translations: { where: localeFilter(locale), ...FEED_TRANSLATION_SELECT },
      },
    });
    return raws.map(toFeed);
  }
}

/**
 * Recover the trending-segment sort key from a composite cursor key. In
 * trending-first mode a trending row's composite `sortOrder` is `-(score + 1)`
 * (see `home.service.ts#feedOrderKey`), so `score = -(sortOrder) - 1`.
 */
function decodeTrendingKey(key: CursorKey): { score: number; id: string } {
  return { score: -key.sortOrder - 1, id: key.id };
}

// ===========================================================================
// ADMIN write-surface data shapes, selects, mappers + order-by builders
// (TAM-104). Kept out of the class body for readability, mirroring the deity
// exemplar. `create*` data is FULLY RESOLVED by the service (Zod defaults +
// destination-safety already applied); `update*` data is a partial patch.
// ===========================================================================

/** The singleton settings key — never client-settable. */
const SETTINGS_KEY = "default";

/** One per-locale banner label override supplied on create/update. */
export interface BannerTranslationData {
  locale: string;
  title: string;
}

export interface BannerCreateData {
  mediaType: BannerMediaType;
  mediaUrl: string;
  thumbnailUrl: string | null;
  title: string | null;
  destinationType: BannerDestinationType;
  destinationValue: string | null;
  isProFeatureDiscovery: boolean;
  sortOrder: number;
  isActive: boolean;
  translations: BannerTranslationData[];
}

export interface BannerUpdateData {
  mediaUrl?: string;
  thumbnailUrl?: string | null;
  title?: string | null;
  destinationType?: BannerDestinationType;
  destinationValue?: string | null;
  isProFeatureDiscovery?: boolean;
  sortOrder?: number;
  isActive?: boolean;
}

/**
 * One per-locale feed framing override supplied on create/update. Optional
 * fields absent ⇒ stored as SQL null (a blank override).
 */
export interface FeedTranslationData {
  locale: string;
  title: string;
  subtitle?: string;
  label?: string;
  ctaLabel: string;
  badgeLabel?: string;
}

export interface FeedCreateData {
  slug: string;
  contentType: FeedContentType;
  module: string;
  /** TAM-175 — deity slug inherited from the source content; null = "no god". */
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
  headerDestinationModule: string;
  shareTitle: string;
  shareText: string;
  shareDeepLink: string;
  shareThumbnailUrl: string | null;
  trendingScore: number | null;
  isActive: boolean;
  translations: FeedTranslationData[];
}

/**
 * The scalar fields Home writes for an AUTO-generated feed card (the auto-feed
 * flow). A subset of `FeedCreateData` — no translations, badge or trendingScore
 * (auto-cards are untranslated, unbadged, in the default id-ordered segment).
 * Built in the service.
 */
export interface ContentFeedCardData {
  slug: string;
  contentType: FeedContentType;
  module: string;
  /** TAM-175 — the source content's deity slug; null when it has none. */
  deitySlug: string | null;
  /** TAM-176 — mirrors the source content's `is_active`. */
  isActive: boolean;
  title: string;
  heroImageUrl: string;
  audioPreviewUrl: string | null;
  ctaLabel: string;
  ctaDestinationType: string;
  ctaDestinationValue: string;
  ctaContentId: string | null;
  headerDestinationModule: string;
  shareTitle: string;
  shareText: string;
  shareDeepLink: string;
  shareThumbnailUrl: string | null;
}

export interface FeedUpdateData {
  contentType?: FeedContentType;
  module?: string;
  /** TAM-175 — omitted ⇒ untouched; explicit `null` clears the deity. */
  deitySlug?: string | null;
  title?: string;
  subtitle?: string | null;
  label?: string | null;
  badge?: FeedBadge | null;
  badgeLabel?: string | null;
  heroImageUrl?: string;
  audioPreviewUrl?: string | null;
  ctaLabel?: string;
  ctaDestinationType?: string;
  ctaDestinationValue?: string;
  headerDestinationModule?: string;
  shareTitle?: string;
  shareText?: string;
  shareDeepLink?: string;
  shareThumbnailUrl?: string | null;
  trendingScore?: number | null;
  isActive?: boolean;
}

/** One per-locale shortcut label override supplied on create/update. */
export interface ShortcutTranslationData {
  locale: string;
  label: string;
}

/** TAM-174 — one arm's presentation row, ready to persist. */
export interface ShortcutVariantData {
  variant: string;
  label: string | null;
  iconUrl: string | null;
  minAppVersion: string | null;
  themeBackgroundFrom: string | null;
  themeBackgroundFromStop: number | null;
  themeBackgroundTo: string | null;
  themeBackgroundToStop: number | null;
  themeLabelColor: string | null;
}

export interface ShortcutCreateData {
  key: string;
  label: string;
  destinationType: ShortcutDestinationType;
  destinationValue: string | null;
  iconKey: string | null;
  /** TAM-132 — nullable CMS-owned live icon URL. */
  iconUrl: string | null;
  /**
   * TAM-132 backwards-compat gate — nullable semver string. Null ⇒ visible to
   * every client; a set value hides the row from any `app_version` header
   * below it (or absent / malformed).
   */
  minAppVersion: string | null;
  /** TAM-174 — the arm rows to create alongside the shortcut (may be empty). */
  variants: ShortcutVariantData[];
  sortOrder: number;
  isActive: boolean;
  translations: ShortcutTranslationData[];
}

export interface ShortcutUpdateData {
  label?: string;
  destinationType?: ShortcutDestinationType;
  destinationValue?: string | null;
  iconKey?: string | null;
  /** TAM-132 — omitted ⇒ untouched; explicit `null` clears the URL. */
  iconUrl?: string | null;
  /** TAM-132 BC gate — omitted ⇒ untouched; explicit `null` clears the gate. */
  minAppVersion?: string | null;
  sortOrder?: number;
  isActive?: boolean;
}

const BANNER_ADMIN_SELECT = {
  id: true,
  mediaType: true,
  mediaUrl: true,
  thumbnailUrl: true,
  title: true,
  destinationType: true,
  destinationValue: true,
  isProFeatureDiscovery: true,
  sortOrder: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;

const FEED_ADMIN_SELECT = {
  id: true,
  slug: true,
  contentType: true,
  module: true,
  deitySlug: true,
  title: true,
  subtitle: true,
  label: true,
  badge: true,
  badgeLabel: true,
  heroImageUrl: true,
  audioPreviewUrl: true,
  ctaLabel: true,
  ctaDestinationType: true,
  ctaDestinationValue: true,
  ctaContentId: true,
  headerDestinationModule: true,
  shareTitle: true,
  shareText: true,
  shareDeepLink: true,
  shareThumbnailUrl: true,
  trendingScore: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;

const SHORTCUT_ADMIN_SELECT = {
  id: true,
  key: true,
  // TAM-174 — ops edits every arm from one form, so all of them are projected.
  variants: {
    select: {
      variant: true,
      label: true,
      iconUrl: true,
      minAppVersion: true,
      themeBackgroundFrom: true,
      themeBackgroundFromStop: true,
      themeBackgroundTo: true,
      themeBackgroundToStop: true,
      themeLabelColor: true,
    },
    orderBy: { variant: "asc" },
  },
  label: true,
  destinationType: true,
  destinationValue: true,
  iconKey: true,
  iconUrl: true,
  // TAM-132 backwards-compat gate — surfaced on the admin surface so ops can
  // review/tweak (public wire deliberately does not include it).
  minAppVersion: true,
  sortOrder: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;

const SETTINGS_ADMIN_SELECT = {
  id: true,
  key: true,
  feedTrendingFirst: true,
  shortcutGridGradientEnabled: true,
  createdAt: true,
  updatedAt: true,
} as const;

// Detail selects (TAM-113): the admin row PLUS every per-locale override, in
// locale order. Backs the create/update/get/delete responses that carry the
// whole translation set (there is no standalone sub-resource).

const BANNER_ADMIN_DETAIL_SELECT = {
  ...BANNER_ADMIN_SELECT,
  translations: {
    select: { locale: true, title: true },
    orderBy: { locale: "asc" },
  },
} as const;

const FEED_ADMIN_DETAIL_SELECT = {
  ...FEED_ADMIN_SELECT,
  translations: {
    select: {
      locale: true,
      title: true,
      subtitle: true,
      label: true,
      ctaLabel: true,
      badgeLabel: true,
    },
    orderBy: { locale: "asc" },
  },
} as const;

const SHORTCUT_ADMIN_DETAIL_SELECT = {
  ...SHORTCUT_ADMIN_SELECT,
  translations: {
    select: { locale: true, label: true },
    orderBy: { locale: "asc" },
  },
} as const;

interface RawBannerAdminRow {
  id: string;
  mediaType: string;
  mediaUrl: string;
  thumbnailUrl: string | null;
  title: string | null;
  destinationType: string;
  destinationValue: string | null;
  isProFeatureDiscovery: boolean;
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface RawFeedAdminRow {
  id: string;
  slug: string;
  contentType: string;
  module: string;
  deitySlug: string | null;
  title: string;
  subtitle: string | null;
  label: string | null;
  badge: string | null;
  badgeLabel: string | null;
  heroImageUrl: string;
  audioPreviewUrl: string | null;
  ctaLabel: string;
  ctaDestinationType: string;
  ctaDestinationValue: string;
  ctaContentId: string | null;
  headerDestinationModule: string;
  shareTitle: string;
  shareText: string;
  shareDeepLink: string;
  shareThumbnailUrl: string | null;
  trendingScore: number | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface RawShortcutAdminRow {
  id: string;
  key: string;
  label: string;
  destinationType: string;
  destinationValue: string | null;
  iconKey: string | null;
  iconUrl: string | null;
  minAppVersion: string | null;
  variants: HomeShortcutVariantRow[];
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface RawSettingsAdminRow {
  id: string;
  key: string;
  feedTrendingFirst: boolean;
  /** TAM-174 — the shortcut-grid gradient experiment's master switch. */
  shortcutGridGradientEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

function toBannerView(raw: RawBannerAdminRow): AdminHomeBannerView {
  return {
    ...raw,
    mediaType: raw.mediaType as BannerMediaType,
    destinationType: raw.destinationType as BannerDestinationType,
    createdAt: raw.createdAt.toISOString(),
    updatedAt: raw.updatedAt.toISOString(),
  };
}

function toFeedView(raw: RawFeedAdminRow): AdminHomeFeedView {
  return {
    ...raw,
    contentType: raw.contentType as FeedContentType,
    badge: (raw.badge as FeedBadge | null) ?? null,
    createdAt: raw.createdAt.toISOString(),
    updatedAt: raw.updatedAt.toISOString(),
  };
}

function toShortcutView(raw: RawShortcutAdminRow): AdminHomeShortcutView {
  return {
    ...raw,
    destinationType: raw.destinationType as ShortcutDestinationType,
    createdAt: raw.createdAt.toISOString(),
    updatedAt: raw.updatedAt.toISOString(),
  };
}

function toSettingsView(raw: RawSettingsAdminRow): AdminHomeSettingsView {
  return {
    ...raw,
    createdAt: raw.createdAt.toISOString(),
    updatedAt: raw.updatedAt.toISOString(),
  };
}

// Detail mappers (TAM-113): the admin view PLUS its per-locale overrides. The
// feed's nullable columns are surfaced as OMITTED optionals so they satisfy the
// `.optional()` response schema (a `null` would be rejected).

function toBannerDetailView(
  raw: RawBannerAdminRow & { translations: { locale: string; title: string }[] }
): AdminHomeBannerDetailView {
  const { translations, ...rest } = raw;
  return { ...toBannerView(rest), translations };
}

function toFeedDetailView(
  raw: RawFeedAdminRow & {
    translations: {
      locale: string;
      title: string;
      subtitle: string | null;
      label: string | null;
      ctaLabel: string;
      badgeLabel: string | null;
    }[];
  }
): AdminHomeFeedDetailView {
  const { translations, ...rest } = raw;
  return {
    ...toFeedView(rest),
    translations: translations.map((t) => ({
      locale: t.locale,
      title: t.title,
      subtitle: t.subtitle ?? undefined,
      label: t.label ?? undefined,
      ctaLabel: t.ctaLabel,
      badgeLabel: t.badgeLabel ?? undefined,
    })),
  };
}

function toShortcutDetailView(
  raw: RawShortcutAdminRow & { translations: { locale: string; label: string }[] }
): AdminHomeShortcutDetailView {
  const { translations, ...rest } = raw;
  return { ...toShortcutView(rest), translations };
}

function bannerOrderBy(
  sort: BannerSortField | undefined,
  order: "asc" | "desc"
): Prisma.HomeBannerOrderByWithRelationInput[] {
  switch (sort) {
    case undefined:
      return [{ sortOrder: "asc" }, { id: "asc" }];
    case "sortOrder":
      return [{ sortOrder: order }, { id: "asc" }];
    case "mediaType":
      return [{ mediaType: order }, { sortOrder: "asc" }];
    case "isActive":
      return [{ isActive: order }, { sortOrder: "asc" }];
    case "createdAt":
      return [{ createdAt: order }];
    case "updatedAt":
      return [{ updatedAt: order }];
  }
}

function feedOrderBy(
  sort: FeedSortField | undefined,
  order: "asc" | "desc"
): Prisma.HomeFeedItemOrderByWithRelationInput[] {
  switch (sort) {
    case undefined:
      return [{ id: "asc" }];
    case "title":
      return [{ title: order }, { id: "asc" }];
    case "trendingScore":
      // Nulls last on either direction keeps ranked rows grouped together.
      return [{ trendingScore: { sort: order, nulls: "last" } }, { id: "asc" }];
    case "badge":
      return [{ badge: { sort: order, nulls: "last" } }, { id: "asc" }];
    case "isActive":
      return [{ isActive: order }, { id: "asc" }];
    case "createdAt":
      return [{ createdAt: order }];
    case "updatedAt":
      return [{ updatedAt: order }];
  }
}

function shortcutOrderBy(
  sort: ShortcutSortField | undefined,
  order: "asc" | "desc"
): Prisma.HomeShortcutOrderByWithRelationInput[] {
  switch (sort) {
    case undefined:
      return [{ sortOrder: "asc" }, { id: "asc" }];
    case "key":
      return [{ key: order }];
    case "label":
      return [{ label: order }, { id: "asc" }];
    case "sortOrder":
      return [{ sortOrder: order }, { id: "asc" }];
    case "isActive":
      return [{ isActive: order }, { sortOrder: "asc" }];
    case "createdAt":
      return [{ createdAt: order }];
    case "updatedAt":
      return [{ updatedAt: order }];
  }
}

/** Map a Prisma unique-constraint violation (P2002) to a 409, else rethrow. */
function mapUniqueViolation(
  err: unknown,
  subject: string,
  errorCode: string
): unknown {
  if (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    err.code === "P2002"
  ) {
    return new AppError(`A home item with ${subject} already exists`, 409, errorCode);
  }
  return err;
}
