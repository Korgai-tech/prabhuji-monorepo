import { performServiceCall } from "@api/shared/workspace";
import { resolveProEntitlement } from "@api/shared/entitlement";
import { createModuleLogger } from "@api/shared/logs";
import { buildPage, decodeCursor, type CursorKey } from "@api/shared/pagination";
import { rotate, rotationPage } from "@api/shared/rotation";
import { AppError } from "@api/shared/errors";
import type {
  RingtoneRepository,
  RingtoneRow,
} from "@api/core/ringtone/repositories";
import {
  RINGTONE_CONTENT_TYPE,
  type LikeResult,
  type PlayCountResult,
  type RingtoneCard,
  type RingtoneCardPage,
  type RingtoneDetail,
  type RingtonePreview,
  type RingtoneSearchPage,
  type RingtoneShareInfo,
  type SetCountResult,
  type ShareCountResult,
} from "@api/core/ringtone/types";

const log = createModuleLogger("ringtone:service");

/** Locale used to resolve deity display names on cards. */
const DEFAULT_LOCALE = "en";

/** The play-count rule (#EXPORT_CRITICAL): a play counts at ≥ this many seconds. */
const PLAY_COUNT_MIN_SECONDS = 3;

/** Resolved slug → localized display name lookup for card enrichment. */
type DeityNameMap = Map<string, string>;

/**
 * Whether an elapsed `playbackPositionSeconds` satisfies the play-count rule:
 * counts at `≥3s`. Exported for unit coverage.
 */
export function meetsPlayCountRule(playbackPositionSeconds: number): boolean {
  return playbackPositionSeconds >= PLAY_COUNT_MIN_SECONDS;
}

/**
 * Ringtone business logic (TAM-67) — Prisma-free. A structural sibling of the
 * aarti/mantras services, but a browse-first Pro-conversion UTILITY:
 *   1. #EXPORT_CRITICAL entitlement gate — Pro is resolved server-side ONCE per
 *      request via the `subscription` facade (fail-CLOSED: any error → treat as
 *      free, never fail open). On the DETAIL surface `audioUrl` is nulled for
 *      non-Pro callers before serialization. The FREE grid/search cards carry
 *      only `thumbnailImageUrl` — no audio URL is ever assembled for discovery.
 *   2. Home grid — keyset-paginated, optional deity-slug filter, invalid rows
 *      (missing title/thumbnail/audio) excluded server-side.
 *   3. Search — partial ILIKE across title / deity (slug + NAME) / tags /
 *      searchKeywords; empty query → the unfiltered grid; NEVER leaks audioUrl or
 *      triggers an entitlement write; returns `resultCount`.
 *   4. Play-count rule (≥3s) validated server-side + deduped per play
 *      session; set-count on set; like/share via the shared `engagement` facade —
 *      ALL Pro-only (free → 403).
 *
 * Deity references use the TAM-57 taxonomy by SLUG (the only deity id clients
 * ever see); display names resolve through the `deity` facade.
 */
export class RingtoneService {
  constructor(private readonly repo: RingtoneRepository) {}

  // ---- discovery (FREE) ---------------------------------------------------

  /**
   * `GET /ringtones` — one page of the home grid (optional deity filter +
   * optional `locale` language-membership filter, TAM-108) in the ROTATED order
   * for the current refresh epoch (TAM-150): ~65% of the catalogue shown,
   * reshuffled every 12h, with the most played/set ringtones periodically
   * resurfaced. The epoch rides in the cursor, so a refresh never reorders a
   * grid the user is already scrolling.
   */
  async getGrid(params: {
    deityId?: string; // a deity SLUG (clients never hold a deity uuid)
    locale?: string; // TAM-108: ISO 639-1 code; row matches if in `languages` OR set empty
    cursor?: string;
    limit: number;
  }): Promise<RingtoneCardPage> {
    const page = await rotationPage({
      key: `ringtone:${params.deityId ?? "*"}:${params.locale ?? "*"}`,
      cursor: params.cursor,
      limit: params.limit,
      buildPlan: async (epoch) =>
        rotate(
          await this.repo.listRotationCandidates({
            deitySlug: params.deityId,
            locale: params.locale,
          }),
          epoch
        ),
      hydrate: (ids) => this.repo.findByIds(ids),
    });
    const names = await this.resolveDeityNames();
    return {
      items: page.items.filter(isValidRow).map((r) => this.toCard(r, names)),
      nextCursor: page.nextCursor,
    };
  }

  /**
   * `GET /ringtones/search?q=` — partial search across title / deity / tags /
   * keywords; an empty/blank query falls back to the unfiltered grid. Returns the
   * card page plus the total `resultCount`. NEVER leaks `audioUrl` and NEVER
   * triggers an entitlement side effect.
   */
  async search(params: {
    q?: string;
    locale?: string; // TAM-108: optional language-membership filter
    cursor?: string;
    limit: number;
  }): Promise<RingtoneSearchPage> {
    const q = params.q?.trim() ?? "";
    if (q.length === 0) {
      // Empty query → unfiltered home list (§6.2), still locale-filtered.
      const grid = await this.getGrid({
        locale: params.locale,
        cursor: params.cursor,
        limit: params.limit,
      });
      const resultCount = await this.repo.countActive(undefined, params.locale);
      return { ...grid, resultCount };
    }

    const afterKey = params.cursor ? decodeCursor(params.cursor) : undefined;
    const deitySlugMatches = await this.resolveDeityNameMatches(q);
    const rows = await this.repo.searchPage({
      q,
      deitySlugMatches,
      locale: params.locale,
      limit: params.limit,
      afterKey,
    });
    const valid = rows.filter(isValidRow);
    const page = buildPage(valid, params.limit, gridSortKey);
    const resultCount = await this.repo.searchCount({
      q,
      deitySlugMatches,
      locale: params.locale,
    });
    const names = await this.resolveDeityNames();
    log.info(
      { event: "ringtone_search", query_len: q.length, result_count: resultCount },
      "ringtone search executed"
    );
    return {
      items: page.items.map((r) => this.toCard(r, names)),
      nextCursor: page.nextCursor,
      resultCount,
    };
  }

  /**
   * `GET /ringtones/:id` — full detail (404 for unknown/inactive). Discovery
   * fields stay visible to free users; #EXPORT_CRITICAL `audioUrl` is non-null
   * ONLY for Pro callers.
   */
  async getDetail(id: string, userId: string): Promise<RingtoneDetail> {
    const row = await this.repo.findById(id);
    if (!row) throw new AppError("Ringtone not found", 404, "NOT_FOUND");

    const isPro = await this.resolveEntitlement(userId);
    const counts = await performServiceCall(
      "engagement",
      (api) =>
        api.getCounts({ contentType: RINGTONE_CONTENT_TYPE, contentIds: [id] }),
      "ringtone:engagement",
      "failed to load engagement counts"
    );
    const likedIds = await performServiceCall(
      "engagement",
      (api) =>
        api.getUserLikes({
          userId,
          contentType: RINGTONE_CONTENT_TYPE,
          contentIds: [id],
        }),
      "ringtone:engagement",
      "failed to load like state"
    );
    const names = await this.resolveDeityNames();
    const c = counts[id];

    return {
      id: row.id,
      title: row.title,
      thumbnailImageUrl: row.thumbnailImageUrl,
      // #EXPORT_CRITICAL — audio returned ONLY to Pro callers.
      audioUrl: isPro ? row.audioUrl : null,
      playCount: row.playCount,
      setCount: row.setCount,
      likeCount: c?.likeCount ?? 0,
      shareCount: c?.shareCount ?? 0,
      likedByMe: likedIds.includes(id),
      deityId: row.deitySlug,
      deityName: names.get(row.deitySlug) ?? row.deitySlug,
      tags: row.tags,
      languages: row.languages,
      artistOrSource: row.artistOrSource,
    };
  }

  // ---- writes (PRO-ONLY) --------------------------------------------------

  /**
   * `POST /ringtones/:id/play-count` — Pro-only. Validates the play-count rule
   * (≥3s) server-side, then counts idempotently per play session. Free callers
   * get `403` and NO write; a below-threshold assertion or a replayed session
   * token returns `counted: false` with the count unchanged.
   */
  async recordPlayCount(params: {
    id: string;
    userId: string;
    sessionToken: string;
    playbackPositionSeconds: number;
  }): Promise<PlayCountResult> {
    const isPro = await this.resolveEntitlement(params.userId);
    if (!isPro) {
      throw new AppError("Playback is a Pro benefit", 403, "FORBIDDEN");
    }
    const gate = await this.repo.findGateById(params.id);
    if (!gate) throw new AppError("Ringtone not found", 404, "NOT_FOUND");

    if (!meetsPlayCountRule(params.playbackPositionSeconds)) {
      // Below the threshold — do not count, do not write a session row.
      const row = await this.repo.findById(params.id);
      return {
        ringtoneId: params.id,
        counted: false,
        playCount: row?.playCount ?? 0,
      };
    }

    const res = await this.repo.countPlay({
      userId: params.userId,
      ringtoneId: params.id,
      sessionToken: params.sessionToken,
    });
    log.info(
      {
        event: "ringtone_play_count",
        user_id: params.userId,
        ringtone_id: params.id,
        counted: res.counted,
      },
      "play-count asserted"
    );
    return {
      ringtoneId: params.id,
      counted: res.counted,
      playCount: res.playCount,
    };
  }

  /**
   * `POST /ringtones/:id/set-count` — Pro-only; increments `setCount` on a
   * successful phone-ringtone set. The `set_target` enum is guarded at the Zod
   * boundary (`phone_ringtone` only). Free → `403`, no write.
   */
  async recordSetCount(id: string, userId: string): Promise<SetCountResult> {
    const isPro = await this.resolveEntitlement(userId);
    if (!isPro) {
      throw new AppError("Setting a ringtone is a Pro benefit", 403, "FORBIDDEN");
    }
    const gate = await this.repo.findGateById(id);
    if (!gate) throw new AppError("Ringtone not found", 404, "NOT_FOUND");

    const res = await this.repo.incrementSetCount(id);
    log.info(
      { event: "ringtone_set_count", user_id: userId, ringtone_id: id },
      "set-count incremented"
    );
    return { ringtoneId: id, setCount: res.setCount };
  }

  /**
   * `POST /ringtones/:id/like` (toggle) — Pro-only. Delegates to the shared
   * `engagement` facade (contentType "ringtone"); no local like table.
   */
  async toggleLike(id: string, userId: string): Promise<LikeResult> {
    const isPro = await this.resolveEntitlement(userId);
    if (!isPro) throw new AppError("Liking is a Pro benefit", 403, "FORBIDDEN");
    const gate = await this.repo.findGateById(id);
    if (!gate) throw new AppError("Ringtone not found", 404, "NOT_FOUND");

    const likedIds = await performServiceCall(
      "engagement",
      (api) =>
        api.getUserLikes({
          userId,
          contentType: RINGTONE_CONTENT_TYPE,
          contentIds: [id],
        }),
      "ringtone:like",
      "failed to resolve like state"
    );
    const alreadyLiked = likedIds.includes(id);
    const state = await performServiceCall(
      "engagement",
      (api) =>
        alreadyLiked
          ? api.unlike({ userId, contentType: RINGTONE_CONTENT_TYPE, contentId: id })
          : api.like({ userId, contentType: RINGTONE_CONTENT_TYPE, contentId: id }),
      "ringtone:like",
      "failed to toggle like"
    );
    log.info(
      { event: "ringtone_like_toggled", user_id: userId, ringtone_id: id, liked: state.liked },
      "ringtone like toggled"
    );
    return { ringtoneId: id, liked: state.liked, likeCount: state.likeCount };
  }

  /**
   * `POST /ringtones/:id/share-count` — Pro-only. Increments the shared
   * `engagement` share counter (contentType "ringtone"). Free → `403`, no write.
   */
  async recordShare(id: string, userId: string): Promise<ShareCountResult> {
    const isPro = await this.resolveEntitlement(userId);
    if (!isPro) throw new AppError("Sharing is a Pro benefit", 403, "FORBIDDEN");
    const gate = await this.repo.findGateById(id);
    if (!gate) throw new AppError("Ringtone not found", 404, "NOT_FOUND");

    const state = await performServiceCall(
      "engagement",
      (api) => api.recordShare({ contentType: RINGTONE_CONTENT_TYPE, contentId: id }),
      "ringtone:share",
      "failed to record share"
    );
    log.info(
      { event: "ringtone_share_count", user_id: userId, ringtone_id: id },
      "share-count incremented"
    );
    return { ringtoneId: id, shareCount: state.shareCount };
  }

  // ---- facade -------------------------------------------------------------

  /** Compact cross-module preview (never a media URL), or `null` if unknown. */
  async getPreview(id: string): Promise<RingtonePreview | null> {
    const row = await this.repo.findById(id);
    if (!row) return null;
    return {
      id: row.id,
      title: row.title,
      thumbnailImageUrl: row.thumbnailImageUrl,
      deityId: row.deitySlug,
    };
  }

  /** Cross-module share metadata (never an audio URL), or `null` if unknown. */
  async getForShare(id: string): Promise<RingtoneShareInfo | null> {
    const row = await this.repo.findById(id);
    if (!row) return null;
    return {
      id: row.id,
      title: row.title,
      thumbnailImageUrl: row.thumbnailImageUrl,
      deepLinkUrl: row.deepLinkUrl,
      shareTitle: row.shareTitle,
      shareDescription: row.shareDescription,
    };
  }

  // ---- internals ----------------------------------------------------------

  /**
   * Resolve Pro entitlement server-side (#EXPORT_CRITICAL). FAIL-CLOSED: any
   * error resolving the subscription facade → treat as free (no audio/preview
   * URL), never fail open.
   */
  /** FAIL-CLOSED via the shared gate — never fail open. */
  private async resolveEntitlement(userId: string): Promise<boolean> {
    return resolveProEntitlement(userId, "ringtone:entitlement");
  }

  /** Batch slug → localized display-name map from the deity facade (one call). */
  private async resolveDeityNames(): Promise<DeityNameMap> {
    const deities = await performServiceCall(
      "deity",
      (api) => api.getActiveDeities({ locale: DEFAULT_LOCALE }),
      "ringtone:deities",
      "failed to load deities"
    );
    return new Map(deities.map((d) => [d.slug, d.displayName]));
  }

  /**
   * Deity slugs whose slug OR display name partially matches `q` (case-
   * insensitive) — lets a text search hit a deity by NAME, not just by the raw
   * slug stored on the row.
   */
  private async resolveDeityNameMatches(q: string): Promise<string[]> {
    const deities = await performServiceCall(
      "deity",
      (api) => api.getActiveDeities({ locale: DEFAULT_LOCALE }),
      "ringtone:deities",
      "failed to load deities"
    );
    const needle = q.toLowerCase();
    return deities
      .filter(
        (d) =>
          d.slug.toLowerCase().includes(needle) ||
          d.displayName.toLowerCase().includes(needle)
      )
      .map((d) => d.slug);
  }

  private toCard(row: RingtoneRow, names: DeityNameMap): RingtoneCard {
    return {
      id: row.id,
      title: row.title,
      thumbnailImageUrl: row.thumbnailImageUrl,
      playCount: row.playCount,
      setCount: row.setCount,
      deityId: row.deitySlug,
      deityName: names.get(row.deitySlug) ?? row.deitySlug,
    };
  }
}

/**
 * Server-side validity filter (§data_requirements.validation_rules): a card is
 * only shown when its required fields are present. The columns are NOT NULL so
 * this is defensive, but it guarantees a malformed row is never surfaced.
 */
function isValidRow(row: RingtoneRow): boolean {
  return (
    row.id.length > 0 &&
    row.title.trim().length > 0 &&
    row.thumbnailImageUrl.length > 0 &&
    row.audioUrl.length > 0
  );
}

/**
 * Stable keyset key for a grid/search row. Ringtones order by `id` alone (no
 * sort column), so `sortOrder` is a constant placeholder to satisfy the shared
 * `CursorKey` shape — only `id` drives the keyset.
 */
function gridSortKey(row: RingtoneRow): CursorKey {
  return { sortOrder: 0, id: row.id };
}
