import { performServiceCall } from "@api/shared/workspace";
import { resolveProEntitlement } from "@api/shared/entitlement";
import { createModuleLogger } from "@api/shared/logs";
import { buildPage, decodeCursor, type CursorKey } from "@api/shared/pagination";
import { AppError, ValidationError } from "@api/shared/errors";
import { LABEL_FALLBACK_LOCALE, resolveLocalizedLabel } from "@api/shared/i18n";
import type {
  AartiRepository,
  AudioRow,
  CategoryRow,
  RecentlyPlayedRow,
} from "@api/core/aarti/repositories";
import {
  AARTI_CONTENT_TYPE,
  type AartiSection,
  type AartiSortMode,
  type AudioDetail,
  type AudioListItem,
  type AudioListPage,
  type AudioPreview,
  type AudioSummary,
  type CategoryCard,
  type DeityCard,
  type DownloadSource,
  type LikeResult,
  type PlayResult,
  type SectionItem,
} from "@api/core/aarti/types";

const log = createModuleLogger("aarti:service");

/** Max items rendered inside a single homepage section. */
const SECTION_ITEM_LIMIT = 10;

type NonRecentSort = Exclude<AartiSortMode, "recent">;

/**
 * TAM-160: the listing's effective ordering. `curated` is a service-only mode —
 * the rows come from the section join (already ordered by the editor's saved
 * `position`), so it never reaches the repo's `AartiSortMode` sort clause.
 */
type ListSortMode = AartiSortMode | "curated";

/** Resolved engagement for a batch of audio ids (counts + this-user like set). */
interface EngagementBatch {
  counts: Record<
    string,
    { likeCount: number; viewCount: number; shareCount: number }
  >;
  liked: Set<string>;
}

/**
 * Aarti & Bhajans business logic (TAM-63) — Prisma-free.
 *
 * DISCOVERY IS FREE, PLAYBACK IS PRO. Responsibilities:
 *   1. #EXPORT_CRITICAL entitlement gate — Pro is resolved server-side ONCE per
 *      request via the `subscription` facade (fail-CLOSED: any error → treat as
 *      free, never fail open). `audioStreamUrl` is nulled for non-Pro callers on
 *      EVERY surface (detail, listing, section previews) before serialization.
 *   2. Homepage section assembly — skip empty sections; skip `recently_played`
 *      entirely when the caller has no history (never fabricated).
 *   3. Reusable listing resolution (category / deity-slug / section + sort) with
 *      keyset pagination; at most one primary filter → else `ValidationError`.
 *   4. Engagement enrichment (like/view/share counts + `likedByMe`) via the
 *      `engagement` facade in ONE batch call per request — no N+1.
 *   5. Playback-history write on `/play` (Pro-only; free → `403` with NO write).
 *
 * Deity tags reference TAM-57's taxonomy by SLUG (the only deity identifier
 * clients ever see); cards are resolved through the `deity` facade.
 */
export class AartiService {
  constructor(private readonly repo: AartiRepository) {}

  // ---- homepage sections --------------------------------------------------

  /**
   * Ordered homepage sections for the caller (`GET /aarti/main`). TAM-109:
   * `locale` (optional) localizes the section `title` and browse-category `name`
   * framing labels; absent ⇒ the base columns are served unchanged (non-breaking).
   */
  async getMain(
    userId: string,
    locale?: string
  ): Promise<{ sections: AartiSection[] }> {
    const isPro = await this.resolveEntitlement(userId);
    const sectionRows = await this.repo.findActiveSections(locale);

    // Assemble raw content first, collecting every audio id so engagement is
    // resolved in ONE batch across the whole page.
    interface Draft {
      sectionId: string;
      sectionType: AartiSection["sectionType"];
      title: string;
      sortOrder: number;
      audioRows?: AudioRow[];
      staticItems?: SectionItem[];
    }
    const drafts: Draft[] = [];
    const allAudioRows: AudioRow[] = [];

    for (const s of sectionRows) {
      const base = {
        // TAM-160: present on EVERY section, not just curated ones.
        sectionId: s.id,
        sectionType: s.sectionType,
        // TAM-109: requested-locale title override, else the base column.
        title: resolveLocalizedLabel(
          s.title,
          s.translations,
          locale,
          (t) => t.title
        ),
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
        drafts.push({ ...base, audioRows: rows });
        allAudioRows.push(...rows);
      } else if (s.sectionType === "deities") {
        const items = await this.getDeityCards(locale);
        if (items.length === 0) continue;
        drafts.push({ ...base, staticItems: items });
      } else if (s.sectionType === "browse_categories") {
        const cats = await this.repo.findActiveCategories(locale);
        if (cats.length === 0) continue;
        drafts.push({
          ...base,
          staticItems: cats.map((c) => toCategoryCard(c, locale)),
        });
      } else if (s.sectionType === "curated") {
        // TAM-160: CMS hand-picked, in the editor's saved `position` order.
        // Routed through the SAME `toAudioPreview` path below as every other
        // audio section, so the #EXPORT_CRITICAL Pro gate covers it with no new
        // gating code.
        const rows = (
          await this.repo.findSectionItemsPage({
            sectionId: s.id,
            limit: SECTION_ITEM_LIMIT,
          })
        ).slice(0, SECTION_ITEM_LIMIT);
        if (rows.length === 0) continue; // hide-when-empty
        drafts.push({ ...base, audioRows: rows });
        allAudioRows.push(...rows);
      } else {
        // newly_added | most_played — dynamic audio sets.
        const sort: NonRecentSort =
          s.sectionType === "most_played" ? "most_played" : "newest";
        const rows = (
          await this.repo.findAudioPage({ sort, limit: SECTION_ITEM_LIMIT })
        ).slice(0, SECTION_ITEM_LIMIT);
        if (rows.length === 0) continue;
        drafts.push({ ...base, audioRows: rows });
        allAudioRows.push(...rows);
      }
    }

    const eng = await this.buildEngagement(
      userId,
      allAudioRows.map((r) => r.id)
    );

    const sections: AartiSection[] = drafts.map((d) => ({
      sectionId: d.sectionId,
      sectionType: d.sectionType,
      title: d.title,
      sortOrder: d.sortOrder,
      items: d.audioRows
        ? d.audioRows.map((r) => this.toAudioPreview(r, isPro, eng))
        : (d.staticItems ?? []),
    }));

    log.info(
      { event: "aarti_main", user_id: userId, sections: sections.length, is_pro: isPro },
      "aarti main assembled"
    );
    return { sections };
  }

  // ---- reusable listing ---------------------------------------------------

  /**
   * `GET /aarti/audios` — one keyset page, gated + engagement-enriched. The flat
   * list is NOT user-sortable: it always serves the stable-shuffle `default`
   * order (id ASC). `sectionType: "recently_played"` still selects the caller's
   * playback history; every other `sectionType` (a leftover client filter) serves
   * the same flat list — sectionType no longer drives ordering. TAM-160:
   * `sectionId` selects ONE curated section's full list in the editor's saved
   * `position` order; an unknown or non-curated id is simply an empty page.
   */
  async listAudios(params: {
    userId: string;
    categoryId?: string;
    deityId?: string; // a deity SLUG (clients never hold a deity uuid)
    sectionType?: "recently_played" | "newly_added" | "most_played";
    /** TAM-160: a `curated` section's id — the Show-all of a CMS-authored row. */
    sectionId?: string;
    /** TAM-108: requested locale — filters by language membership on the listing. */
    locale?: string;
    cursor?: string;
    limit: number;
  }): Promise<AudioListPage> {
    const {
      userId,
      categoryId,
      deityId,
      sectionType,
      sectionId,
      locale,
      cursor,
      limit,
    } = params;

    // At most one primary filter.
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
    let rows: (AudioRow | RecentlyPlayedRow)[];
    let effectiveSort: ListSortMode;

    if (sectionId !== undefined) {
      // TAM-160: the curated Show-all — keyset over `(position, id)`.
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
      // Flat stable-shuffle list (id ASC); no user sort.
      effectiveSort = "default";
      rows = await this.repo.findAudioPage({
        sort: effectiveSort,
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

  // ---- detail -------------------------------------------------------------

  /**
   * `GET /aarti/audios/:id` — full detail (404 for unknown/inactive). TAM-109:
   * `locale` (optional) localizes the category-tag `name` labels; absent ⇒ the
   * base columns are served unchanged (non-breaking).
   */
  async getAudioDetail(
    id: string,
    userId: string,
    locale?: string
  ): Promise<AudioDetail> {
    const row = await this.repo.findAudioById(id);
    if (!row) throw new AppError("Audio not found", 404, "NOT_FOUND");

    const isPro = await this.resolveEntitlement(userId);
    const eng = await this.buildEngagement(userId, [id]);
    const categories = await this.repo.findCategoriesByIds(row.categoryIds, locale);
    const deity = await this.resolveDeityCard(row.deitySlug, locale);
    const base = this.toListItem(row, isPro, eng);

    return {
      ...base,
      description: row.description,
      publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null,
      categoryTags: categories.map((c) => toCategoryCard(c, locale)),
      deity,
    };
  }

  // ---- playback -----------------------------------------------------------

  /**
   * `POST /aarti/audios/:id/play` — Pro-only. Free callers get `403` and NO
   * history write. Pro callers upsert history + increment `playCount`.
   */
  async recordPlay(params: {
    id: string;
    userId: string;
    lastPositionSeconds?: number;
  }): Promise<PlayResult> {
    const isPro = await this.resolveEntitlement(params.userId);
    if (!isPro) {
      // Gate BEFORE any existence check or write — a free caller never records
      // playback and is not told whether the id exists.
      throw new AppError("Playback is a Pro benefit", 403, "FORBIDDEN");
    }
    const gate = await this.repo.findAudioGateById(params.id);
    if (!gate) throw new AppError("Audio not found", 404, "NOT_FOUND");

    const res = await this.repo.recordPlay({
      userId: params.userId,
      audioId: params.id,
      lastPositionSeconds: params.lastPositionSeconds,
    });
    log.info(
      { event: "aarti_play", user_id: params.userId, audio_id: params.id },
      "playback recorded"
    );
    return {
      audioId: params.id,
      playCount: res.playCount,
      lastPlayedAt: res.lastPlayedAt.toISOString(),
      lastPositionSeconds: res.lastPositionSeconds,
    };
  }

  // ---- like ---------------------------------------------------------------

  /**
   * `POST /aarti/audios/:id/like` (toggle) — Pro-only. Delegates to the shared
   * `engagement` facade (contentType "aarti"); no local like table. Returns the
   * new `liked` state + `likeCount`. Mirrors `MantrasService.toggleLike`.
   */
  async toggleLike(id: string, userId: string): Promise<LikeResult> {
    const isPro = await this.resolveEntitlement(userId);
    if (!isPro) {
      throw new AppError("Liking is a Pro benefit", 403, "FORBIDDEN");
    }
    const gate = await this.repo.findAudioGateById(id);
    if (!gate) throw new AppError("Audio not found", 404, "NOT_FOUND");

    const likedIds = await performServiceCall(
      "engagement",
      (api) =>
        api.getUserLikes({
          userId,
          contentType: AARTI_CONTENT_TYPE,
          contentIds: [id],
        }),
      "aarti:like",
      "failed to resolve like state"
    );
    const alreadyLiked = likedIds.includes(id);

    const state = await performServiceCall(
      "engagement",
      (api) =>
        alreadyLiked
          ? api.unlike({ userId, contentType: AARTI_CONTENT_TYPE, contentId: id })
          : api.like({ userId, contentType: AARTI_CONTENT_TYPE, contentId: id }),
      "aarti:like",
      "failed to toggle like"
    );
    log.info(
      { event: "aarti_like_toggled", user_id: userId, audio_id: id, liked: state.liked },
      "aarti like toggled"
    );
    return { audioId: id, liked: state.liked, likeCount: state.likeCount };
  }

  // ---- facade -------------------------------------------------------------

  /** Compact summary for cross-module callers (Home/TAM-61). Never a stream URL. */
  async getAudioSummary(id: string): Promise<AudioSummary | null> {
    const row = await this.repo.findAudioById(id);
    if (!row) return null;
    return {
      id: row.id,
      title: row.title,
      coverImageUrl: row.coverImageUrl,
    };
  }

  /**
   * TAM-125 downloads: resolve the object key + size / duration / checksum for
   * an aarti/bhajan id, or `null` if unknown/inactive.
   *
   * The downloads service does the entitlement gate BEFORE calling this — this
   * method is entitlement-agnostic (it's a facade lookup, not a public read).
   * URL-to-key translation goes through the `media` facade (`IMediaApi.toKey`)
   * so the `MEDIA_PUBLIC_BASE_URL` string strip is not duplicated per module.
   * `contentType` is echoed back verbatim: aarti and bhajan share a single
   * `AudioItem` table (no DB discriminator), so the DISPLAY label lives with
   * the client.
   *
   * `sizeBytes` narrows from the schema's `BigInt?` to `number` — the audio
   * blobs cap under the 200 MB media class ceiling, well below `Number.MAX_SAFE_INTEGER`
   * — with a defensive `Number.isSafeInteger` check. If the backfill hasn't
   * populated the columns yet, `sizeBytes` is null in the DB and this method
   * returns `null` (treated as NOT_FOUND by the downloads service).
   */
  async getDownloadSource(
    id: string,
    contentType: "aarti" | "bhajan"
  ): Promise<DownloadSource | null> {
    const row = await this.repo.findDownloadSourceById(id);
    if (!row) return null;
    // sizeBytes is NULLABLE on the wire (post-TAM-125 change). If the
    // backfill script hasn't populated this row yet on stage/prod, emit 0
    // — the mobile client treats 0 as "unknown size", downloads the file
    // regardless, and uses the actual bytes-streamed count to derive the
    // real size after completion. UX degradation is bounded to an
    // indeterminate progress ring during the download.
    let sizeBytesNum = 0;
    if (row.sizeBytes !== null) {
      const narrowed = Number(row.sizeBytes);
      if (Number.isSafeInteger(narrowed) && narrowed > 0) {
        sizeBytesNum = narrowed;
      } else {
        log.warn(
          { event: "aarti_download_size_unsafe", audio_id: id, size_bytes: String(row.sizeBytes) },
          "download source size_bytes is not a safe positive integer — falling back to 0"
        );
      }
    }
    const objectKey = await performServiceCall(
      "media",
      (api) => api.toKey(row.audioStreamUrl),
      "aarti:download",
      "failed to resolve media object key"
    );
    return {
      objectKey,
      sizeBytes: sizeBytesNum,
      durationMs: row.durationMs,
      checksum: row.checksum,
      contentType,
    };
  }

  // ---- internals ----------------------------------------------------------

  /**
   * Resolve Pro entitlement server-side (#EXPORT_CRITICAL). Delegates to the
   * shared gate, which is FAIL-CLOSED: any error resolving the subscription
   * facade → treat as free (no stream URL), never fail open
   * (#PLAN_UNCERTAINTY q3).
   */
  private async resolveEntitlement(userId: string): Promise<boolean> {
    return resolveProEntitlement(userId, "aarti:entitlement");
  }

  /** #EXPORT_CRITICAL — the stream URL is returned ONLY to Pro callers. */
  private gate(row: AudioRow, isPro: boolean): string | null {
    return isPro ? row.audioStreamUrl : null;
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
          contentType: AARTI_CONTENT_TYPE,
          contentIds: uniqueIds,
        }),
      "aarti:engagement",
      "failed to load engagement counts"
    );
    const likedIds = await performServiceCall(
      "engagement",
      (api) =>
        api.getUserLikes({
          userId,
          contentType: AARTI_CONTENT_TYPE,
          contentIds: uniqueIds,
        }),
      "aarti:engagement",
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
      "aarti:deities",
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
   * TAM-108: resolve the item's SINGLE deity card from its `deitySlug` via the
   * deity facade (mirrors how ringtone resolves its scalar `deitySlug`). Returns
   * `null` when the item has no deity or the slug is not an active deity.
   * Localized for the caller's `locale` — see `getDeityCards`.
   */
  private async resolveDeityCard(
    slug: string | null,
    locale?: string
  ): Promise<DeityCard | null> {
    if (!slug) return null;
    const all = await performServiceCall(
      "deity",
      (api) => api.getActiveDeities({ locale: locale ?? LABEL_FALLBACK_LOCALE }),
      "aarti:deities",
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

  private toAudioPreview(
    row: AudioRow,
    isPro: boolean,
    eng: EngagementBatch
  ): AudioPreview {
    const c = eng.counts[row.id];
    return {
      kind: "audio",
      id: row.id,
      title: row.title,
      coverImageUrl: row.coverImageUrl,
      singerName: row.singerName,
      isPrabhujiOriginal: row.isPrabhujiOriginal,
      audioStreamUrl: this.gate(row, isPro),
      playCount: row.playCount,
      likeCount: c?.likeCount ?? 0,
      shareCount: c?.shareCount ?? 0,
      likedByMe: eng.liked.has(row.id),
    };
  }

  private toListItem(
    row: AudioRow,
    isPro: boolean,
    eng: EngagementBatch
  ): AudioListItem {
    const c = eng.counts[row.id];
    return {
      id: row.id,
      title: row.title,
      coverImageUrl: row.coverImageUrl,
      singerName: row.singerName,
      composerNames: row.composerNames,
      languages: row.languages,
      isPrabhujiOriginal: row.isPrabhujiOriginal,
      audioStreamUrl: this.gate(row, isPro),
      playCount: row.playCount,
      likeCount: c?.likeCount ?? 0,
      viewCount: c?.viewCount ?? 0,
      shareCount: c?.shareCount ?? 0,
      likedByMe: eng.liked.has(row.id),
    };
  }
}

/** Stable `(value, id)` keyset key for a row under the effective sort. */
function sortKey(
  row: AudioRow | RecentlyPlayedRow,
  sort: ListSortMode
): CursorKey {
  switch (sort) {
    case "curated":
      // TAM-160: the curated order IS the editor's saved `position`, carried
      // onto the row by `findSectionItemsPage` (mirrors the wallpaper custom row).
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
      // `default` is a stable-shuffle order keyed on id alone; the numeric slot
      // is unused filler (the repo's keyset predicate compares `id` only).
      return { sortOrder: 0, id: row.id };
  }
}

function toCategoryCard(cat: CategoryRow, locale?: string): CategoryCard {
  return {
    kind: "category",
    id: cat.id,
    slug: cat.slug,
    // TAM-109: requested-locale name override, else the base column.
    name: resolveLocalizedLabel(cat.name, cat.translations, locale, (t) => t.name),
    imageUrl: cat.imageUrl,
  };
}
