import { performServiceCall } from "@api/shared/workspace";
import { resolveProEntitlement } from "@api/shared/entitlement";
import { createModuleLogger } from "@api/shared/logs";
import { buildPage, decodeCursor, type CursorKey } from "@api/shared/pagination";
import { rotate, rotationPage } from "@api/shared/rotation";
import { AppError, ValidationError } from "@api/shared/errors";
import { resolveLocalizedLabel } from "@api/shared/i18n";
import type {
  WallpaperRepository,
  WallpaperRow,
  WallpaperRowConfig,
} from "@api/core/wallpaper/repositories";
import {
  WALLPAPER_CONTENT_TYPE,
  type FocalPoint,
  type SafeAreaMetadata,
  type WallpaperCard,
  type WallpaperCardPage,
  type WallpaperCountResult,
  type WallpaperCountType,
  type WallpaperDeity,
  type WallpaperDeityFilter,
  type WallpaperDetail,
  type WallpaperHome,
  type WallpaperHomeRow,
  type WallpaperLikeResult,
  type WallpaperPreview,
  type WallpaperRowType,
  type WallpaperShareInfo,
} from "@api/core/wallpaper/types";

const log = createModuleLogger("wallpaper:service");

/** Locale used to resolve deity display names + icons. */
const DEFAULT_LOCALE = "en";

/** Resolved engagement for a batch of ids (counts + this-user like set). */
interface EngagementBatch {
  counts: Record<
    string,
    { likeCount: number; viewCount: number; shareCount: number }
  >;
  liked: Set<string>;
}

/** slug → localized deity (display name + icon) lookup for enrichment. */
type DeityMap = Map<string, { displayName: string; iconUrl: string }>;

/**
 * Wallpaper business logic (TAM-69) — Prisma-free. A structural sibling of the
 * aarti/mantras/ringtone services, but with a KEY difference: DISCOVERY IS FREE.
 * Only two things are gated server-side (`liveWallpaperAssetUrl` and the `set`
 * counter); the STATIC apply path stays client-gated because its image already
 * ships on every free card. See the module docstring in `types.ts` for why that
 * boundary sits where it does. Responsibilities:
 *   1. Home assembly — resolve each active CMS row by its `row_type` query rules
 *      (top_live / new / trending / liked / custom), bounded by `maxItems`; omit
 *      EMPTY rows and hide the personalized `liked` row when the user has none.
 *      Also returns the deity filter chips (All Gods pinned first).
 *   2. Reusable listing — keyset-paginated by `deityId` OR `rowId` (at most one).
 *   3. Detail — every asset field + raw counts + `likedByMe`.
 *   4. Like toggle + share count delegate to the shared `engagement` facade
 *      (contentType "wallpaper"); `set` is a LOCAL server-authoritative counter.
 *
 * Deity tags reference the TAM-57 taxonomy by SLUG; names/icons resolve through
 * the `deity` facade.
 *
 * #DECISION — the `trending` row/listing orders by the LOCAL `set_count` (an
 * indexed, server-authoritative counter that can back a keyset cursor); the
 * engagement `like_count` is fetched for DISPLAY but is not part of the sort key
 * (it lives in another module and cannot back a stable keyset). A device-set is
 * also the strongest trending signal (higher intent than a like).
 */
export class WallpaperService {
  constructor(private readonly repo: WallpaperRepository) {}

  // ---- home ---------------------------------------------------------------

  /**
   * `GET /wallpaper/home` — the ordered active rows (empty rows omitted; `liked`
   * hidden when the user has none) + deity filter chips. An optional `deityId`
   * narrows every row to that deity.
   */
  async getHome(
    userId: string,
    deityId?: string,
    locale?: string
  ): Promise<WallpaperHome> {
    const deityMap = await this.resolveDeityMap();
    const deityFilters = this.buildDeityFilters(deityMap);

    const rowConfigs = await this.repo.findActiveRows(locale);
    const drafts: { config: WallpaperRowConfig; rows: WallpaperRow[] }[] = [];
    for (const config of rowConfigs) {
      const rows = (
        await this.rowsForConfig(config, {
          userId,
          limit: config.maxItems,
          deitySlug: deityId,
          locale,
        })
      ).slice(0, config.maxItems);
      if (rows.length === 0) continue; // omit empty rows (incl. empty `liked`)
      drafts.push({ config, rows });
    }

    const eng = await this.buildEngagement(
      userId,
      drafts.flatMap((d) => d.rows.map((r) => r.id))
    );

    const rows: WallpaperHomeRow[] = drafts.map((d) => ({
      rowId: d.config.id,
      rowKey: d.config.rowKey,
      // TAM-111: localize the row label — `translation[locale] ?? base title`.
      // An absent `locale` (no override rows) resolves to the base title, so
      // existing mobile calls without `locale` are unchanged.
      title: resolveLocalizedLabel(
        d.config.title,
        d.config.translations,
        locale,
        (t) => t.title
      ),
      rowType: d.config.rowType,
      iconKey: d.config.iconKey,
      items: d.rows.map((r) => this.toCard(r, eng)),
    }));

    log.info(
      { event: "wallpaper_home", user_id: userId, rows: rows.length },
      "wallpaper home assembled"
    );
    return { deityFilters, rows };
  }

  // ---- listing ------------------------------------------------------------

  /**
   * `GET /wallpaper/list` — one keyset page filtered by `deityId` OR `rowId` (at
   * most one; both → `ValidationError`). With neither, the default active
   * listing in a stable `id`-ordered (random-looking) shuffle.
   */
  async list(params: {
    userId: string;
    deityId?: string;
    rowId?: string;
    cursor?: string;
    limit: number;
    locale?: string;
  }): Promise<WallpaperCardPage> {
    const { userId, deityId, rowId, cursor, limit, locale } = params;
    if (deityId !== undefined && rowId !== undefined) {
      throw new ValidationError(
        "Provide at most one of deityId, rowId",
        "INVALID_FILTER_COMBINATION"
      );
    }

    const config =
      rowId === undefined ? null : await this.repo.findRowById(rowId, locale);
    if (rowId !== undefined && !config) {
      throw new AppError("Row not found", 404, "NOT_FOUND");
    }

    // The un-ranked surfaces — the plain listing and the `top_live` row — are
    // the ones that used to be a frozen `id` order, so they rotate (TAM-150).
    // `new` / `trending` / `custom` / `liked` are RANKED or curated: a shuffle
    // would fight the ordering that is the row's whole point.
    if (config === null || config.rowType === "top_live") {
      const rotated = await this.rotatedDefaultPage({
        mediaType: config === null ? undefined : "live",
        deitySlug: deityId ?? config?.deityTagFilter ?? undefined,
        locale,
        cursor,
        limit,
      });
      const eng = await this.buildEngagement(
        userId,
        rotated.items.map((r) => r.id)
      );
      return {
        items: rotated.items.map((r) => this.toCard(r, eng)),
        nextCursor: rotated.nextCursor,
      };
    }

    const afterKey = cursor ? decodeCursor(cursor) : undefined;
    const rows = await this.rowsForConfig(config, { userId, limit, afterKey, locale });
    const page = buildPage(rows, limit, (r) => rowSortKey(config.rowType, r));
    const eng = await this.buildEngagement(
      userId,
      page.items.map((r) => r.id)
    );
    return {
      items: page.items.map((r) => this.toCard(r, eng)),
      nextCursor: page.nextCursor,
    };
  }

  /**
   * One page of the ROTATED default order for the current refresh epoch: ~65%
   * of the (filtered) catalogue shown, reshuffled every 12h, with the most-set
   * wallpapers periodically resurfaced. Shared by the plain listing, the
   * `top_live` row's "see all", and the `top_live` shelf on Home — so a shelf
   * and its full listing always agree on the order.
   */
  private async rotatedDefaultPage(params: {
    mediaType?: "live";
    deitySlug?: string;
    locale?: string;
    cursor?: string;
    limit: number;
  }): Promise<{ items: WallpaperRow[]; nextCursor: string | null }> {
    const { mediaType, deitySlug, locale, cursor, limit } = params;
    return rotationPage({
      key: `wallpaper:${mediaType ?? "*"}:${deitySlug ?? "*"}:${locale ?? "*"}`,
      cursor,
      limit,
      buildPlan: async (epoch) =>
        rotate(
          await this.repo.listRotationCandidates({ mediaType, deitySlug, locale }),
          epoch
        ),
      hydrate: (ids) =>
        this.repo.findByIdsPage({ ids, limit: ids.length, deitySlug, locale }),
    });
  }

  // ---- detail -------------------------------------------------------------

  /** `GET /wallpaper/:id` — full detail (404 for unknown/inactive). */
  async getDetail(id: string, userId: string): Promise<WallpaperDetail> {
    const row = await this.repo.findById(id);
    if (!row) throw new AppError("Wallpaper not found", 404, "NOT_FOUND");

    const isPro = await resolveProEntitlement(userId, "wallpaper:detail");
    const eng = await this.buildEngagement(userId, [id]);
    const deityMap = await this.resolveDeityMap();
    const c = eng.counts[id];

    return {
      id: row.id,
      slug: row.slug,
      title: row.title,
      mediaType: row.mediaType,
      thumbnailUrl: row.thumbnailUrl,
      previewImageUrl: row.previewImageUrl,
      previewVideoUrl: row.previewVideoUrl,
      // The one asset on this screen with genuine Pro-only value, so the one
      // thing gated server-side. Note what is deliberately NOT gated:
      // `previewImageUrl` is already on every free grid card
      // (`WallpaperCardSchema`), and the static Set action applies exactly that
      // image — withholding it here would break the free full-screen preview
      // while protecting a file any free user already has.
      liveWallpaperAssetUrl: isPro ? row.liveWallpaperAssetUrl : null,
      liveWallpaperPackage: row.liveWallpaperPackage,
      fallbackStaticThumbnailUrl: row.fallbackStaticThumbnailUrl,
      altText: row.altText,
      dominantColor: row.dominantColor,
      supportedAndroidVersions: row.supportedAndroidVersions,
      focalPoint: coerceFocalPoint(row.focalPoint),
      safeAreaMetadata: coerceSafeArea(row.safeAreaMetadata),
      deity: this.toDeity(row.deitySlug, deityMap),
      languages: row.languages,
      setCount: row.setCount,
      likeCount: c?.likeCount ?? 0,
      shareCount: c?.shareCount ?? 0,
      likedByMe: eng.liked.has(id),
      createdAt: row.createdAt.toISOString(),
    };
  }

  // ---- writes -------------------------------------------------------------

  /**
   * `POST /wallpaper/:id/like` (toggle) — FREE. Delegates to the shared
   * `engagement` facade (contentType "wallpaper"); no local like table.
   */
  async toggleLike(id: string, userId: string): Promise<WallpaperLikeResult> {
    const gate = await this.repo.findGateById(id);
    if (!gate) throw new AppError("Wallpaper not found", 404, "NOT_FOUND");

    const likedIds = await performServiceCall(
      "engagement",
      (api) =>
        api.getUserLikes({
          userId,
          contentType: WALLPAPER_CONTENT_TYPE,
          contentIds: [id],
        }),
      "wallpaper:like",
      "failed to resolve like state"
    );
    const alreadyLiked = likedIds.includes(id);
    const state = await performServiceCall(
      "engagement",
      (api) =>
        alreadyLiked
          ? api.unlike({ userId, contentType: WALLPAPER_CONTENT_TYPE, contentId: id })
          : api.like({ userId, contentType: WALLPAPER_CONTENT_TYPE, contentId: id }),
      "wallpaper:like",
      "failed to toggle like"
    );
    log.info(
      { event: "wallpaper_like_toggled", user_id: userId, wallpaper_id: id, liked: state.liked },
      "wallpaper like toggled"
    );
    return { wallpaperId: id, liked: state.liked, likeCount: state.likeCount };
  }

  /**
   * `POST /wallpaper/:id/count` — increment a `share` (via the shared engagement
   * counter) or `set` (LOCAL server-authoritative counter). `set` is incremented
   * by the client ONLY after a confirmed successful device set (TAM-70); the
   * endpoint is a dumb increment. Returns the updated count of that type.
   */
  async recordCount(
    id: string,
    userId: string,
    type: WallpaperCountType
  ): Promise<WallpaperCountResult> {
    const gate = await this.repo.findGateById(id);
    if (!gate) throw new AppError("Wallpaper not found", 404, "NOT_FOUND");

    if (type === "set") {
      // Setting a wallpaper is the Pro action, so a free caller must not be able
      // to inflate the counter for it. This is a data-integrity fix as much as
      // an entitlement one: `setCount` orders the `trending` row and the admin
      // sort, so anyone with a JWT could previously push a wallpaper up the
      // home screen by POSTing in a loop.
      if (!(await resolveProEntitlement(userId, "wallpaper:set-count"))) {
        throw new AppError(
          "Setting a wallpaper is a Prabhuji Pro benefit",
          403,
          "FORBIDDEN"
        );
      }
      const res = await this.repo.incrementSetCount(id);
      log.info(
        { event: "wallpaper_set_count", user_id: userId, wallpaper_id: id },
        "set-count incremented"
      );
      return { wallpaperId: id, type, count: res.setCount };
    }

    const state = await performServiceCall(
      "engagement",
      (api) => api.recordShare({ contentType: WALLPAPER_CONTENT_TYPE, contentId: id }),
      "wallpaper:share",
      "failed to record share"
    );
    log.info(
      { event: "wallpaper_share_count", user_id: userId, wallpaper_id: id },
      "share-count incremented"
    );
    return { wallpaperId: id, type, count: state.shareCount };
  }

  // ---- facade -------------------------------------------------------------

  /** Compact cross-module preview, or `null` if unknown/inactive. */
  async getPreview(id: string): Promise<WallpaperPreview | null> {
    const row = await this.repo.findById(id);
    if (!row) return null;
    return {
      id: row.id,
      title: row.title,
      mediaType: row.mediaType,
      thumbnailUrl: row.thumbnailUrl,
      previewImageUrl: row.previewImageUrl,
    };
  }

  /** Cross-module share metadata (thumbnail only), or `null` if unknown. */
  async getForShare(id: string): Promise<WallpaperShareInfo | null> {
    const row = await this.repo.findById(id);
    if (!row) return null;
    return { id: row.id, title: row.title, thumbnailUrl: row.thumbnailUrl };
  }

  // ---- internals ----------------------------------------------------------

  /**
   * Resolve one row config's item window per its `row_type` query rules. An
   * optional `deitySlug` (home deity-filter tap) narrows the row further. Fetches
   * up to `limit + 1` rows for keyset detection.
   */
  private async rowsForConfig(
    config: WallpaperRowConfig,
    params: {
      userId: string;
      limit: number;
      afterKey?: CursorKey;
      deitySlug?: string;
      locale?: string;
    }
  ): Promise<WallpaperRow[]> {
    const { userId, limit, afterKey, deitySlug, locale } = params;
    const cfgDeity = deitySlug ?? config.deityTagFilter ?? undefined;

    switch (config.rowType) {
      case "top_live": {
        // Rotated (TAM-150) — `list()` handles the paged `?rowId=` case, so this
        // only ever serves the un-paged Home shelf.
        const page = await this.rotatedDefaultPage({
          mediaType: "live",
          deitySlug: cfgDeity,
          locale,
          limit,
        });
        return page.items;
      }
      case "new":
        return this.repo.findQueryRulePage({
          sort: "newest",
          mediaType: config.mediaTypeFilter ?? undefined,
          deitySlug: cfgDeity,
          locale,
          limit,
          afterKey,
        });
      case "trending":
        return this.repo.findQueryRulePage({
          sort: "trending",
          mediaType: config.mediaTypeFilter ?? undefined,
          deitySlug: cfgDeity,
          locale,
          limit,
          afterKey,
        });
      case "liked":
        return this.resolveLikedRows({ userId, limit, afterKey, deitySlug: cfgDeity, locale });
      case "custom": {
        const rows = await this.repo.findCustomRowItemsPage({
          rowId: config.id,
          limit,
          afterKey,
          locale,
        });
        // TAM-108: single-deity model — a scalar equality, not `includes`.
        return cfgDeity ? rows.filter((r) => r.deitySlug === cfgDeity) : rows;
      }
      default:
        return [];
    }
  }

  /**
   * Resolve the current user's liked wallpapers (a personalized row). The like
   * state lives in the shared `engagement` module, so we resolve it by asking
   * which of the bounded active catalogue the user has liked, then page over
   * that id set ordered by `id`.
   */
  private async resolveLikedRows(params: {
    userId: string;
    limit: number;
    afterKey?: CursorKey;
    deitySlug?: string;
    locale?: string;
  }): Promise<WallpaperRow[]> {
    const { userId, limit, afterKey, deitySlug, locale } = params;
    const allIds = await this.repo.findAllActiveIds();
    if (allIds.length === 0) return [];
    const likedIds = await performServiceCall(
      "engagement",
      (api) =>
        api.getUserLikes({
          userId,
          contentType: WALLPAPER_CONTENT_TYPE,
          contentIds: allIds,
        }),
      "wallpaper:liked-row",
      "failed to resolve liked wallpapers"
    );
    if (likedIds.length === 0) return [];
    return this.repo.findByIdsPage({ ids: likedIds, deitySlug, locale, limit, afterKey });
  }

  private async buildEngagement(
    userId: string,
    ids: string[]
  ): Promise<EngagementBatch> {
    const uniqueIds = [...new Set(ids)];
    if (uniqueIds.length === 0) return { counts: {}, liked: new Set() };
    const counts = await performServiceCall(
      "engagement",
      (api) =>
        api.getCounts({ contentType: WALLPAPER_CONTENT_TYPE, contentIds: uniqueIds }),
      "wallpaper:engagement",
      "failed to load engagement counts"
    );
    const likedIds = await performServiceCall(
      "engagement",
      (api) =>
        api.getUserLikes({
          userId,
          contentType: WALLPAPER_CONTENT_TYPE,
          contentIds: uniqueIds,
        }),
      "wallpaper:engagement",
      "failed to load like state"
    );
    return { counts, liked: new Set(likedIds) };
  }

  /** Batch slug → localized (display name + icon) map from the deity facade. */
  private async resolveDeityMap(): Promise<DeityMap> {
    const deities = await performServiceCall(
      "deity",
      (api) => api.getActiveDeities({ locale: DEFAULT_LOCALE }),
      "wallpaper:deities",
      "failed to load deities"
    );
    return new Map(
      deities.map((d) => [d.slug, { displayName: d.displayName, iconUrl: d.iconUrl }])
    );
  }

  /** Deity filter chips, All Gods pinned first. */
  private buildDeityFilters(deityMap: DeityMap): WallpaperDeityFilter[] {
    const chips: WallpaperDeityFilter[] = [
      { slug: "all", displayName: "All Gods", iconUrl: "", sortOrder: -1 },
    ];
    let order = 0;
    for (const [slug, d] of deityMap) {
      chips.push({
        slug,
        displayName: d.displayName,
        iconUrl: d.iconUrl,
        sortOrder: order++,
      });
    }
    return chips;
  }

  /** Resolve the single `deitySlug` to a localized deity, or `null` (TAM-108). */
  private toDeity(slug: string | null, deityMap: DeityMap): WallpaperDeity | null {
    if (!slug) return null;
    const d = deityMap.get(slug);
    return d ? { slug, displayName: d.displayName, iconUrl: d.iconUrl } : null;
  }

  private toCard(row: WallpaperRow, eng: EngagementBatch): WallpaperCard {
    const c = eng.counts[row.id];
    return {
      id: row.id,
      title: row.title,
      mediaType: row.mediaType,
      thumbnailUrl: row.thumbnailUrl,
      previewImageUrl: row.previewImageUrl,
      deitySlug: row.deitySlug,
      setCount: row.setCount,
      likeCount: c?.likeCount ?? 0,
      shareCount: c?.shareCount ?? 0,
      likedByMe: eng.liked.has(row.id),
    };
  }
}

/** Stable `(value, id)` keyset key for a row under its row/listing sort. */
function rowSortKey(
  rowType: WallpaperRowType | "default",
  row: WallpaperRow
): CursorKey {
  switch (rowType) {
    case "new":
      return { sortOrder: row.createdAt.getTime(), id: row.id };
    case "trending":
      return { sortOrder: row.setCount, id: row.id };
    case "custom":
      // Custom rows page by their curated `position` (carried onto the row by
      // `findCustomRowItemsPage`); the id is the tiebreak.
      return { sortOrder: row.position ?? 0, id: row.id };
    // top_live / liked / default — a stable `id`-only order (no numeric sort
    // key; the keyset predicate compares `id` alone), so `sortOrder` is unused.
    default:
      return { sortOrder: 0, id: row.id };
  }
}

/** Coerce a Prisma JSON value to a `{x,y}` focal point, or null. */
function coerceFocalPoint(value: unknown): FocalPoint | null {
  if (
    typeof value === "object" &&
    value !== null &&
    typeof (value as FocalPoint).x === "number" &&
    typeof (value as FocalPoint).y === "number"
  ) {
    const { x, y } = value as FocalPoint;
    return { x, y };
  }
  return null;
}

/** Coerce a Prisma JSON value to safe-area insets, or null. */
function coerceSafeArea(value: unknown): SafeAreaMetadata | null {
  if (
    typeof value === "object" &&
    value !== null &&
    typeof (value as SafeAreaMetadata).top === "number" &&
    typeof (value as SafeAreaMetadata).bottom === "number" &&
    typeof (value as SafeAreaMetadata).left === "number" &&
    typeof (value as SafeAreaMetadata).right === "number"
  ) {
    const { top, bottom, left, right } = value as SafeAreaMetadata;
    return { top, bottom, left, right };
  }
  return null;
}
