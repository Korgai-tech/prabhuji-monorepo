import { performServiceCall } from "@api/shared/workspace";
import { resolveProEntitlement } from "@api/shared/entitlement";
import { createModuleLogger } from "@api/shared/logs";
import { buildPage, decodeCursor, type CursorKey } from "@api/shared/pagination";
import { AppError, ValidationError } from "@api/shared/errors";
import { LABEL_FALLBACK_LOCALE, resolveLocalizedLabel } from "@api/shared/i18n";
import type {
  CategoryRow,
  MantraRow,
  MantrasRepository,
  RecentlyPlayedRow,
} from "@api/core/mantras/repositories";
import {
  DEFAULT_REPEAT_TARGET,
  MANTRAS_CONTENT_TYPE,
  MANTRA_REPEAT_TARGETS,
  type CategoryCard,
  type CounterPreference,
  type DeityCard,
  type DownloadSource,
  type LikeResult,
  type MantraDetail,
  type MantraDetailResult,
  type MantraListItem,
  type MantraListPage,
  type MantraPlaylistSource,
  type MantraPreview,
  type MantraRepeatTarget,
  type MantraSection,
  type MantraShareInfo,
  type MantraSortMode,
  type MantraSummary,
  type PlaylistResult,
  type RecentlyPlayedResult,
  type SectionItem,
} from "@api/core/mantras/types";

const log = createModuleLogger("mantras:service");

/** Max items rendered inside a single homepage section. */
const SECTION_ITEM_LIMIT = 10;

type NonRecentSort = Exclude<MantraSortMode, "recent">;

/**
 * The effective ordering of ONE listing page. `curated` (TAM-160) is a
 * service-level mode only — it never reaches the repository's `itemSortClause`,
 * because a curated page is read straight off the ordered join table.
 */
type ListingSort = MantraSortMode | "curated";

/** Resolved engagement for a batch of item ids (counts + this-user like set). */
interface EngagementBatch {
  counts: Record<
    string,
    { likeCount: number; viewCount: number; shareCount: number }
  >;
  liked: Set<string>;
}

/**
 * Mantras & Stutis business logic (TAM-65) — Prisma-free. A structural sibling
 * of `AartiService`; DISCOVERY IS FREE, PLAYBACK IS PRO. Responsibilities:
 *   1. #EXPORT_CRITICAL entitlement gate — Pro is resolved server-side ONCE per
 *      request via the `subscription` facade (fail-CLOSED: any error → treat as
 *      free, never fail open). `audioUrl` is nulled for non-Pro callers on EVERY
 *      surface (detail, listing, section previews, playlist) before
 *      serialization.
 *   2. Homepage section assembly — skip empty sections; skip `recently_played`
 *      entirely when the caller has no history (never fabricated).
 *   3. Reusable listing resolution (category / deity-slug / section) with keyset
 *      pagination; at most one primary filter → else `ValidationError`. The flat
 *      listing is a stable shuffle by id (no client-facing sort param).
 *   4. Server-side playlist resolution (§6 `playlist_behavior.source_rules`) —
 *      deity/category tap resolves to the first item of the group + the rest as
 *      the ordered playlist.
 *   5. Engagement enrichment (like/view/share counts + `likedByMe`) via the
 *      `engagement` facade in ONE batch call per request — no N+1. Likes toggle
 *      through the SAME facade (contentType "mantra"); no local like table.
 *   6. Recently-played write + like toggle are Pro-only (free → `403`, no write).
 *   7. Per-user japa counter-preference persistence (exact enum, default 7).
 *
 * Deity tags reference TAM-57's taxonomy by SLUG; cards are resolved through the
 * `deity` facade.
 */
export class MantrasService {
  constructor(private readonly repo: MantrasRepository) {}

  // ---- homepage sections --------------------------------------------------

  /**
   * Ordered homepage sections for the caller (`GET /mantras/sections`).
   *
   * TAM-110: `locale` (the caller's selected content language, reused as the
   * label locale) localizes the section `title`, the category-card `name` and
   * the deity-card `displayName` against their per-locale OVERRIDE rows, falling
   * back to the base column when no override exists. Absent `locale` ⇒ base
   * columns.
   */
  async getSections(
    userId: string,
    locale?: string
  ): Promise<{ sections: MantraSection[] }> {
    const isPro = await this.resolveEntitlement(userId);
    const sectionRows = await this.repo.findActiveSections(locale);

    interface Draft {
      sectionId: string;
      sectionType: MantraSection["sectionType"];
      title: string;
      layoutType: MantraSection["layoutType"];
      showAllEnabled: boolean;
      sortOrder: number;
      itemRows?: MantraRow[];
      staticItems?: SectionItem[];
    }
    const drafts: Draft[] = [];
    const allItemRows: MantraRow[] = [];

    for (const s of sectionRows) {
      const base = {
        sectionId: s.id,
        sectionType: s.sectionType,
        // TAM-110: localized section title (override for `locale` ?? base).
        title: resolveLocalizedLabel(
          s.title,
          s.translations,
          locale,
          (t) => t.title
        ),
        layoutType: s.layoutType,
        showAllEnabled: s.showAllEnabled,
        sortOrder: s.sortOrder,
      };
      if (s.sectionType === "recently_played") {
        const rows = (
          await this.repo.findRecentlyPlayedPage({
            userId,
            limit: SECTION_ITEM_LIMIT,
          })
        ).slice(0, SECTION_ITEM_LIMIT);
        if (rows.length === 0) continue; // hide-when-empty (never fabricated)
        drafts.push({ ...base, itemRows: rows });
        allItemRows.push(...rows);
      } else if (s.sectionType === "deities") {
        const items = await this.getDeityCards(locale);
        if (items.length === 0) continue;
        drafts.push({ ...base, staticItems: items });
      } else if (s.sectionType === "categories") {
        const cats = await this.repo.findActiveCategories(locale);
        if (cats.length === 0) continue;
        drafts.push({
          ...base,
          staticItems: cats.map((c) => toCategoryCard(c, locale)),
        });
      } else if (s.sectionType === "curated") {
        // TAM-160: the CMS-authored kind — this section's hand-picked items in
        // the saved `position` order, capped at the shared preview limit. The
        // rows go through the SAME `toPreview` mapper as every other audio
        // section, so the #EXPORT_CRITICAL Pro gate on `audioUrl` covers them
        // with no new gating code.
        const rows = (
          await this.repo.findSectionItemsPage({
            sectionId: s.id,
            limit: SECTION_ITEM_LIMIT,
          })
        ).slice(0, SECTION_ITEM_LIMIT);
        if (rows.length === 0) continue; // hide-when-empty
        drafts.push({ ...base, itemRows: rows });
        allItemRows.push(...rows);
      } else {
        // newly_added — newest items.
        const rows = (
          await this.repo.findItemPage({ sort: "newest", limit: SECTION_ITEM_LIMIT })
        ).slice(0, SECTION_ITEM_LIMIT);
        if (rows.length === 0) continue;
        drafts.push({ ...base, itemRows: rows });
        allItemRows.push(...rows);
      }
    }

    const eng = await this.buildEngagement(
      userId,
      allItemRows.map((r) => r.id)
    );

    const sections: MantraSection[] = drafts.map((d) => ({
      sectionId: d.sectionId,
      sectionType: d.sectionType,
      title: d.title,
      layoutType: d.layoutType,
      showAllEnabled: d.showAllEnabled,
      sortOrder: d.sortOrder,
      items: d.itemRows
        ? d.itemRows.map((r) => this.toPreview(r, isPro, eng))
        : (d.staticItems ?? []),
    }));

    log.info(
      { event: "mantras_sections", user_id: userId, sections: sections.length, is_pro: isPro },
      "mantras sections assembled"
    );
    return { sections };
  }

  // ---- reusable listing ---------------------------------------------------

  /** `GET /mantras/items` — one keyset page, gated + engagement-enriched. */
  async listItems(params: {
    userId: string;
    categoryId?: string;
    deityId?: string; // a deity SLUG (clients never hold a deity uuid)
    // TAM-108: LANGUAGE MEMBERSHIP filter — an ISO 639-1 locale. Returned items
    // are those whose `languages` set contains it, plus items with an empty set
    // (available in ALL languages). Not a "primary" filter — combinable.
    locale?: string;
    sectionType?: "recently_played" | "newly_added";
    /**
     * TAM-160: a CURATED section's id — the Show-all filter for a hand-picked
     * list. A primary filter (#PATH_DECISION 2): `sectionType=curated` would be
     * ambiguous once there are many curated sections. An unknown or non-curated
     * id simply has no membership rows ⇒ an empty page, never a 500.
     */
    sectionId?: string;
    cursor?: string;
    limit: number;
  }): Promise<MantraListPage> {
    const {
      userId,
      categoryId,
      deityId,
      locale,
      sectionType,
      sectionId,
      cursor,
      limit,
    } = params;

    const primaries = [categoryId, deityId, sectionType, sectionId].filter(
      (v) => v !== undefined
    );
    if (primaries.length > 1) {
      throw new ValidationError(
        "Provide at most one of categoryId, deityId, sectionType, sectionId",
        "INVALID_FILTER_COMBINATION"
      );
    }

    const afterKey = cursor ? decodeCursor(cursor) : undefined;
    const isPro = await this.resolveEntitlement(userId);

    const wantsRecent = sectionType === "recently_played";
    let rows: (MantraRow | RecentlyPlayedRow)[];
    let effectiveSort: ListingSort;

    if (sectionId) {
      effectiveSort = "curated";
      rows = await this.repo.findSectionItemsPage({
        sectionId,
        locale,
        limit,
        afterKey,
      });
    } else if (wantsRecent) {
      effectiveSort = "recent";
      rows = await this.repo.findRecentlyPlayedPage({ userId, limit, afterKey });
    } else {
      const sort = resolveSort(sectionType);
      effectiveSort = sort;
      rows = await this.repo.findItemPage({
        sort,
        categoryId,
        deitySlug: deityId,
        locale,
        limit,
        afterKey,
      });
    }

    const page = buildPage(rows, limit, (row) => sortKey(row, effectiveSort));
    const eng = await this.buildEngagement(
      userId,
      page.items.map((r) => r.id)
    );
    return {
      items: page.items.map((r) => this.toListItem(r, isPro, eng)),
      nextCursor: page.nextCursor,
    };
  }

  // ---- detail + playlist --------------------------------------------------

  /**
   * `GET /mantras/items/:id` — full detail (404 for unknown/inactive) plus the
   * ordered playlist it was opened from. `source`/`sourceId` name the surface;
   * the SERVER resolves the group so ordering never drifts across platforms.
   */
  async getItemDetail(params: {
    id: string;
    userId: string;
    /** Tolerant by contract (see `MantraDetailQuery`): an unrecognised surface
     * name resolves to the default playlist instead of erroring. */
    source?: string;
    sourceId?: string;
    /** TAM-110: caller's content language, reused to localize framing labels. */
    locale?: string;
  }): Promise<MantraDetailResult> {
    const { id, userId, source, sourceId, locale } = params;
    const row = await this.repo.findItemById(id);
    if (!row) throw new AppError("Mantra not found", 404, "NOT_FOUND");

    const isPro = await this.resolveEntitlement(userId);

    const { rows: playlistRows, playlistSource } =
      await this.resolvePlaylistRows({ item: row, userId, source, sourceId });

    // ONE engagement batch across the detail item + the whole playlist.
    const ids = [id, ...playlistRows.map((r) => r.id)];
    const eng = await this.buildEngagement(userId, ids);

    const categories = await this.repo.findCategoriesByIds(
      row.categoryIds,
      locale
    );
    const deity = await this.resolveDeityCard(row.deitySlug, locale);
    const base = this.toListItem(row, isPro, eng);

    const item: MantraDetail = {
      ...base,
      // #EXPORT_CRITICAL — mantraText verbatim; line breaks preserved.
      mantraText: row.mantraText,
      transliterationText: row.transliterationText,
      description: row.description,
      deepLinkUrl: row.deepLinkUrl,
      publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null,
      // TAM-110: category labels localized for `locale` (override ?? base).
      categoryTags: categories.map((c) => toCategoryCard(c, locale)),
      deity,
    };

    return {
      item,
      playlist: playlistRows.map((r) => this.toListItem(r, isPro, eng)),
      playlistSource,
    };
  }

  /** `GET /mantras/deities/:deityId/playlist` — deity tap → first item + group. */
  async getDeityPlaylist(
    deitySlug: string,
    userId: string
  ): Promise<PlaylistResult> {
    const deity = await performServiceCall(
      "deity",
      (api) => api.getBySlug(deitySlug),
      "mantras:deity-playlist",
      "failed to resolve deity"
    );
    if (!deity) throw new AppError("Deity not found", 404, "NOT_FOUND");

    const rows = await this.repo.findPlaylistByDeity(deitySlug);
    return this.buildPlaylistResult(rows, "deity", userId);
  }

  /** `GET /mantras/categories/:categoryId/playlist` — category tap → group. */
  async getCategoryPlaylist(
    categoryId: string,
    userId: string
  ): Promise<PlaylistResult> {
    const category = await this.repo.findCategoryById(categoryId);
    if (!category) throw new AppError("Category not found", 404, "NOT_FOUND");

    const rows = await this.repo.findPlaylistByCategory(categoryId);
    return this.buildPlaylistResult(rows, "category", userId);
  }

  // ---- writes -------------------------------------------------------------

  /**
   * `POST /mantras/items/:id/recently-played` — Pro-only. Free callers get `403`
   * and NO history write. Pro callers upsert history + increment `playCount`.
   */
  async recordRecentlyPlayed(params: {
    id: string;
    userId: string;
    lastProgressSeconds?: number;
  }): Promise<RecentlyPlayedResult> {
    const isPro = await this.resolveEntitlement(params.userId);
    if (!isPro) {
      // Gate BEFORE any existence check or write.
      throw new AppError("Playback is a Pro benefit", 403, "FORBIDDEN");
    }
    const gate = await this.repo.findItemGateById(params.id);
    if (!gate) throw new AppError("Mantra not found", 404, "NOT_FOUND");

    const res = await this.repo.recordRecentlyPlayed({
      userId: params.userId,
      itemId: params.id,
      lastProgressSeconds: params.lastProgressSeconds,
    });
    log.info(
      { event: "mantras_recently_played", user_id: params.userId, item_id: params.id },
      "recently-played recorded"
    );
    return {
      itemId: params.id,
      playCount: res.playCount,
      lastPlayedAt: res.lastPlayedAt.toISOString(),
      lastProgressSeconds: res.lastProgressSeconds,
    };
  }

  /**
   * `POST /mantras/items/:id/like` (toggle) — Pro-only. Delegates to the shared
   * `engagement` facade (contentType "mantra"); no local like table. Returns the
   * new `liked` state + `likeCount`.
   */
  async toggleLike(id: string, userId: string): Promise<LikeResult> {
    const isPro = await this.resolveEntitlement(userId);
    if (!isPro) {
      throw new AppError("Liking is a Pro benefit", 403, "FORBIDDEN");
    }
    const gate = await this.repo.findItemGateById(id);
    if (!gate) throw new AppError("Mantra not found", 404, "NOT_FOUND");

    const likedIds = await performServiceCall(
      "engagement",
      (api) =>
        api.getUserLikes({
          userId,
          contentType: MANTRAS_CONTENT_TYPE,
          contentIds: [id],
        }),
      "mantras:like",
      "failed to resolve like state"
    );
    const alreadyLiked = likedIds.includes(id);

    const state = await performServiceCall(
      "engagement",
      (api) =>
        alreadyLiked
          ? api.unlike({ userId, contentType: MANTRAS_CONTENT_TYPE, contentId: id })
          : api.like({ userId, contentType: MANTRAS_CONTENT_TYPE, contentId: id }),
      "mantras:like",
      "failed to toggle like"
    );
    log.info(
      { event: "mantras_like_toggled", user_id: userId, item_id: id, liked: state.liked },
      "mantra like toggled"
    );
    return { itemId: id, liked: state.liked, likeCount: state.likeCount };
  }

  // ---- counter preference -------------------------------------------------

  /**
   * `GET /mantras/counter-preference` — the stored target (or the default `7`)
   * PLUS the selectable option list, so the client's picker is server-driven.
   */
  async getCounterPreference(userId: string): Promise<CounterPreference> {
    const stored = await this.repo.getCounterPreference(userId);
    return toCounterPreference(normalizeTarget(stored));
  }

  /** `PUT /mantras/counter-preference` — persist a valid target (Zod-guarded). */
  async setCounterPreference(
    userId: string,
    repeatTarget: MantraRepeatTarget
  ): Promise<CounterPreference> {
    const saved = await this.repo.setCounterPreference(userId, repeatTarget);
    return toCounterPreference(normalizeTarget(saved));
  }

  // ---- facade -------------------------------------------------------------

  /** Compact summary for cross-module callers. Never a stream URL. */
  async getItemSummary(id: string): Promise<MantraSummary | null> {
    const row = await this.repo.findItemById(id);
    if (!row) return null;
    return {
      id: row.id,
      title: row.title,
      type: row.type,
      artworkUrl: row.artworkUrl,
    };
  }

  /** Share metadata for cross-module callers (e.g. Home share sheet). */
  async getItemForShare(id: string): Promise<MantraShareInfo | null> {
    const row = await this.repo.findItemById(id);
    if (!row) return null;
    return {
      id: row.id,
      title: row.title,
      type: row.type,
      artworkUrl: row.artworkUrl,
      deepLinkUrl: row.deepLinkUrl,
    };
  }

  /**
   * Cross-module playlist resolution — returns the ordered group's compact
   * summaries (no stream URLs; the owner gates them per request). Sibling
   * modules use this to prefetch "what plays next" without an HTTP hop.
   */
  async resolvePlaylist(params: {
    source: MantraPlaylistSource;
    sourceId?: string;
    userId: string;
  }): Promise<MantraSummary[]> {
    const { source, sourceId, userId } = params;
    const rows = await this.playlistRowsForSource(source, sourceId, userId);
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      type: r.type,
      artworkUrl: r.artworkUrl,
    }));
  }

  /**
   * TAM-125 downloads: resolve the object key + size / duration / checksum for
   * a mantra id, or `null` if unknown/inactive.
   *
   * Sibling of `AartiService.getDownloadSource` (identical shape, separate
   * table). Same rules apply:
   *   - The downloads service enforces the entitlement gate BEFORE calling.
   *   - URL→key translation goes through the `media` facade (`IMediaApi.toKey`).
   *   - `sizeBytes` narrows from `BigInt?` to `number` with a safe-integer
   *     check; missing size ⇒ `null` return (→ 404 in downloads).
   */
  async getDownloadSource(id: string): Promise<DownloadSource | null> {
    const row = await this.repo.findDownloadSourceById(id);
    if (!row) return null;
    // sizeBytes nullable on the wire — matches the aarti facade + downloads
    // Zod schema. 0 signals "unknown; client derives from bytes streamed".
    let sizeBytesNum = 0;
    if (row.sizeBytes !== null) {
      const narrowed = Number(row.sizeBytes);
      if (Number.isSafeInteger(narrowed) && narrowed > 0) {
        sizeBytesNum = narrowed;
      } else {
        log.warn(
          { event: "mantras_download_size_unsafe", mantra_id: id, size_bytes: String(row.sizeBytes) },
          "download source size_bytes is not a safe positive integer — falling back to 0"
        );
      }
    }
    const objectKey = await performServiceCall(
      "media",
      (api) => api.toKey(row.audioUrl),
      "mantras:download",
      "failed to resolve media object key"
    );
    return {
      objectKey,
      sizeBytes: sizeBytesNum,
      durationMs: row.durationMs,
      checksum: row.checksum,
      contentType: "mantra",
    };
  }

  // ---- internals ----------------------------------------------------------

  /**
   * Resolve Pro entitlement server-side (#EXPORT_CRITICAL). FAIL-CLOSED: any
   * error resolving the subscription facade → treat as free (no stream URL),
   * never fail open.
   */
  /** FAIL-CLOSED via the shared gate — never fail open. */
  private async resolveEntitlement(userId: string): Promise<boolean> {
    return resolveProEntitlement(userId, "mantras:entitlement");
  }

  /** #EXPORT_CRITICAL — the stream URL is returned ONLY to Pro callers. */
  private gate(row: MantraRow, isPro: boolean): string | null {
    return isPro ? row.audioUrl : null;
  }

  /**
   * Resolve the ordered playlist rows for the detail surface. `source` names the
   * rule; deity/category derive their group id from `sourceId` (falling back to
   * the opened item's own first tag), everything else uses a global ordering.
   */
  private async resolvePlaylistRows(params: {
    item: MantraRow;
    userId: string;
    /** Tolerant: anything not matched below falls through to `listing`. */
    source?: string;
    sourceId?: string;
  }): Promise<{ rows: MantraRow[]; playlistSource: MantraPlaylistSource }> {
    const { item, userId, source, sourceId } = params;

    if (source === "deity") {
      const slug = sourceId ?? item.deitySlug ?? undefined;
      if (slug) {
        return { rows: await this.repo.findPlaylistByDeity(slug), playlistSource: "deity" };
      }
    } else if (source === "category") {
      const catId = sourceId ?? item.categoryIds[0];
      if (catId) {
        return { rows: await this.repo.findPlaylistByCategory(catId), playlistSource: "category" };
      }
    } else if (source === "newly_added") {
      return { rows: await this.repo.findPlaylistBySort("newest"), playlistSource: "newly_added" };
    } else if (source === "recently_played") {
      return {
        rows: await this.repo.findRecentlyPlayedPlaylist(userId),
        playlistSource: "recently_played",
      };
    }
    // Default: the listing surface (default order) IS the playlist.
    return { rows: await this.repo.findPlaylistBySort("default"), playlistSource: "listing" };
  }

  /** Playlist rows for the dedicated facade/endpoints (no fallback item). */
  private async playlistRowsForSource(
    source: MantraPlaylistSource,
    sourceId: string | undefined,
    userId: string
  ): Promise<MantraRow[]> {
    switch (source) {
      case "deity":
        return sourceId ? this.repo.findPlaylistByDeity(sourceId) : [];
      case "category":
        return sourceId ? this.repo.findPlaylistByCategory(sourceId) : [];
      case "newly_added":
        return this.repo.findPlaylistBySort("newest");
      case "recently_played":
        return this.repo.findRecentlyPlayedPlaylist(userId);
      default:
        return this.repo.findPlaylistBySort("default");
    }
  }

  /** Assemble a `{ firstItem, playlist }` result, gated + engagement-enriched. */
  private async buildPlaylistResult(
    rows: MantraRow[],
    playlistSource: MantraPlaylistSource,
    userId: string
  ): Promise<PlaylistResult> {
    const isPro = await this.resolveEntitlement(userId);
    const eng = await this.buildEngagement(
      userId,
      rows.map((r) => r.id)
    );
    const playlist = rows.map((r) => this.toListItem(r, isPro, eng));
    return { firstItem: playlist[0] ?? null, playlist, playlistSource };
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
        api.getCounts({
          contentType: MANTRAS_CONTENT_TYPE,
          contentIds: uniqueIds,
        }),
      "mantras:engagement",
      "failed to load engagement counts"
    );
    const likedIds = await performServiceCall(
      "engagement",
      (api) =>
        api.getUserLikes({
          userId,
          contentType: MANTRAS_CONTENT_TYPE,
          contentIds: uniqueIds,
        }),
      "mantras:engagement",
      "failed to load like state"
    );
    return { counts, liked: new Set(likedIds) };
  }

  /**
   * The deity cards for the `deities` section, localized for the CALLER'S
   * locale. This used to pass `DEFAULT_MAIN_LOCALE` unconditionally, so deity
   * names stayed English even when every other label on the section localized.
   * `undefined` still resolves to the `en` fallback inside the deity facade
   * (`toLocalized`: requested → en → slug), so an absent locale is unchanged.
   */
  private async getDeityCards(locale?: string): Promise<DeityCard[]> {
    const deities = await performServiceCall(
      "deity",
      (api) => api.getActiveDeities({ locale: locale ?? LABEL_FALLBACK_LOCALE }),
      "mantras:deities",
      "failed to load deities"
    );
    return deities.map((d) => ({
      kind: "deity",
      slug: d.slug,
      displayName: d.displayName,
      iconUrl: d.iconUrl,
    }));
  }

  /**
   * TAM-108: resolve the item's SINGLE deity card from its `deitySlug` through
   * the deity facade (the taxonomy owner). Returns `null` when the item has no
   * deity or its slug resolves to no ACTIVE deity (`getActiveDeities` is the
   * localized source of `displayName` + `iconUrl`; a deactivated deity is not
   * rendered, matching the prior behaviour). Localized for the caller's
   * `locale` — see `getDeityCards` for why this is not the default locale.
   */
  private async resolveDeityCard(
    slug: string | null,
    locale?: string
  ): Promise<DeityCard | null> {
    if (!slug) return null;
    const all = await performServiceCall(
      "deity",
      (api) => api.getActiveDeities({ locale: locale ?? LABEL_FALLBACK_LOCALE }),
      "mantras:deities",
      "failed to load deities"
    );
    const d = all.find((x) => x.slug === slug);
    if (!d) return null;
    return {
      kind: "deity",
      slug: d.slug,
      displayName: d.displayName,
      iconUrl: d.iconUrl,
    };
  }

  private toPreview(
    row: MantraRow,
    isPro: boolean,
    eng: EngagementBatch
  ): MantraPreview {
    const c = eng.counts[row.id];
    return {
      kind: "mantra",
      id: row.id,
      title: row.title,
      type: row.type,
      artworkUrl: row.artworkUrl,
      singerName: row.singerName,
      audioUrl: this.gate(row, isPro),
      playCount: row.playCount,
      likeCount: c?.likeCount ?? 0,
      shareCount: c?.shareCount ?? 0,
      likedByMe: eng.liked.has(row.id),
    };
  }

  private toListItem(
    row: MantraRow,
    isPro: boolean,
    eng: EngagementBatch
  ): MantraListItem {
    const c = eng.counts[row.id];
    return {
      id: row.id,
      title: row.title,
      type: row.type,
      artworkUrl: row.artworkUrl,
      singerName: row.singerName,
      composerName: row.composerName,
      languages: row.languages,
      audioUrl: this.gate(row, isPro),
      playCount: row.playCount,
      likeCount: c?.likeCount ?? 0,
      viewCount: c?.viewCount ?? 0,
      shareCount: c?.shareCount ?? 0,
      likedByMe: eng.liked.has(row.id),
    };
  }
}

/**
 * Effective non-recent sort, derived from the section: `newly_added` → `newest`,
 * everything else → the `default` stable shuffle by id. The public `sort` query
 * param was removed, so the flat listing is never explicitly ordered.
 */
function resolveSort(
  sectionType: "recently_played" | "newly_added" | undefined
): NonRecentSort {
  if (sectionType === "newly_added") return "newest";
  return "default";
}

/** Stable `(value, id)` keyset key for a row under the effective sort. */
function sortKey(
  row: MantraRow | RecentlyPlayedRow,
  sort: ListingSort
): CursorKey {
  switch (sort) {
    case "curated":
      // TAM-160: curated pages key on the saved `position` (carried onto the row
      // by `findSectionItemsPage`); the id is the tiebreak.
      return { sortOrder: row.position ?? 0, id: row.id };
    case "most_played":
      return { sortOrder: row.playCount, id: row.id };
    case "newest":
      return {
        sortOrder: (row.publishedAt ?? row.createdAt).getTime(),
        id: row.id,
      };
    case "recent":
      return {
        sortOrder: (row as RecentlyPlayedRow).lastPlayedAt.getTime(),
        id: row.id,
      };
    default:
      // Default listing is a stable shuffle by id — the keyset is id-only, so
      // the numeric part of the cursor key is a constant placeholder.
      return { sortOrder: 0, id: row.id };
  }
}

/** Coerce a stored/looked-up value to a valid target, defaulting to `7`. */
/**
 * Build the counter-preference wire shape. `availableTargets` is derived from
 * `MANTRA_REPEAT_TARGETS` — the SAME constant `repeatTargetSchema` validates the
 * `PUT` body against — so the server-owned option list and the accepted set can
 * never drift, and the client never hardcodes the options.
 */
function toCounterPreference(repeatTarget: MantraRepeatTarget): CounterPreference {
  return { repeatTarget, availableTargets: [...MANTRA_REPEAT_TARGETS] };
}

function normalizeTarget(value: number | null): MantraRepeatTarget {
  if (value !== null && (MANTRA_REPEAT_TARGETS as readonly number[]).includes(value)) {
    return value as MantraRepeatTarget;
  }
  return DEFAULT_REPEAT_TARGET;
}

/**
 * TAM-110: build a category card, localizing `name` against the category's
 * per-locale `displayName` OVERRIDE rows for `locale` (override ?? base). An
 * absent `locale` (or no override) yields the base `name`, so the wire shape
 * is unchanged for callers that omit it.
 */
function toCategoryCard(cat: CategoryRow, locale?: string): CategoryCard {
  return {
    kind: "category",
    id: cat.id,
    slug: cat.slug,
    name: resolveLocalizedLabel(
      cat.name,
      cat.translations,
      locale,
      (t) => t.displayName
    ),
    imageUrl: cat.imageUrl,
    backgroundColorToken: cat.backgroundColorToken,
  };
}
