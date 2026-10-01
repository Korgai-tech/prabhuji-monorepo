import type { Prisma } from "@prisma/client";
import { getPrisma } from "@api/shared/database";
import {
  STATUS_PERFORMANCE_NO_DEITY,
  type StatusMediaType,
} from "@api/core/status/types";

/**
 * Postgres side of the admin status-performance report (TAM-256).
 *
 * Sibling to `status.repository.ts` rather than part of it: the report is a
 * read-only reporting surface with its own row shapes, and keeping it separate
 * makes the import-graph test in D-2 condition 2 meaningful — the warehouse
 * repository must be reachable from exactly one service, and that service's
 * Postgres half is this file.
 *
 * Owns FOUR reads, all of them CMS truth:
 *   1. the filtered item catalogue (the report's spine — the warehouse only
 *      ever contributes metrics keyed by id, never rows);
 *   2. the `status_items.id ⇄ home_feed_items.id` alias map, indexed BOTH ways;
 *   3. active pin positions for the home + both status surfaces;
 *   4. `HomeFeedItem.createdAt` per status item ("On homepage since").
 *
 * It does NOT read `deities` — deity display names come from the deity module
 * via `performServiceCall` in the service (arch boundaries forbid reaching into
 * another module's tables), and it does NOT touch ClickHouse.
 */

/** A catalogue row — CMS truth, before any metric is joined onto it. */
export interface StatusPerformanceCatalogueRow {
  id: string;
  slug: string;
  title: string;
  thumbnailUrl: string;
  deitySlug: string | null;
  mediaType: StatusMediaType;
  isActive: boolean;
  createdAt: Date;
}

/**
 * The Home-feed alias map, indexed both ways (D-3 + D-1's home pin lookup).
 *
 * **Why both directions, and why it is one build:**
 *   - FORWARD (`homeFeedIdToStatusId`) canonicalises share events. A share that
 *     originates on the Home feed emits `home_feed_items.id` in `status_id`
 *     (`_statusFeedItemFromHome()` passes `item.id`), so without this remap
 *     ~24.7% of shares — measured, 92 of 372 distinct ids over 30 days — never
 *     join to a status item and are silently lost.
 *   - INVERSE (`statusIdToHomeFeedId`) resolves "Homepage pin position".
 *     `pinned_content.content_id` means a DIFFERENT table per surface: a `home`
 *     pin holds a `home_feed_items.id`, while `status_all_gods` / `status_deity`
 *     pins hold a `status_items.id`.
 *
 * The map lives in Postgres, so the forward remap CANNOT be a join inside
 * ClickHouse, and it cannot be applied after aggregation either — `uniq()`
 * returns HLL sketches that cannot be merged across two raw ids in TypeScript.
 * It is therefore passed into the warehouse query and applied before GROUP BY.
 */
export interface StatusHomeFeedAliasMap {
  homeFeedIdToStatusId: Map<string, string>;
  statusIdToHomeFeedId: Map<string, string>;
}

/** Active pin positions for one status item, by surface. */
export interface StatusPinPositions {
  /** `status_all_gods` — preferred for the single on-screen cell (N-1). */
  statusAllGods: number | null;
  /** `status_deity` — exported as its own CSV column so neither is lost. */
  statusDeity: number | null;
  /** `home`, resolved through the inverse alias map. */
  home: number | null;
}

export interface StatusPerformanceCatalogueFilter {
  q?: string | undefined;
  deitySlug?: string | undefined;
  mediaType?: StatusMediaType | undefined;
  isActive?: boolean | undefined;
}

export class StatusPerformanceRepository {
  /**
   * The filtered item catalogue — EVERY matching row, not a page.
   *
   * Unpaged on purpose. The metric columns come from the warehouse and the
   * report sorts and pages on the joined result, so paging here would page the
   * wrong thing: page 1 by `createdAt` is not page 1 by share rate. Volumes
   * make this safe — the whole status catalogue is hundreds of rows, and D-2
   * condition 9 already requires the warehouse aggregate to be window-scoped
   * and page-independent for the same reason.
   */
  async listCatalogue(
    filter: StatusPerformanceCatalogueFilter,
  ): Promise<StatusPerformanceCatalogueRow[]> {
    const where: Prisma.StatusItemWhereInput = {};

    if (filter.mediaType) where.mediaType = filter.mediaType;
    if (filter.isActive !== undefined) where.isActive = filter.isActive;

    // The "(no deity)" sentinel selects the unmapped population (D-9). It is a
    // real editorial bucket, not an error state: `deity_slug` is nullable with
    // no FK, and excluding it would silently hide content from the report.
    if (filter.deitySlug === STATUS_PERFORMANCE_NO_DEITY) {
      where.deitySlug = null;
    } else if (filter.deitySlug) {
      where.deitySlug = filter.deitySlug;
    }

    if (filter.q) {
      where.OR = [
        { title: { contains: filter.q, mode: "insensitive" } },
        { slug: { contains: filter.q, mode: "insensitive" } },
      ];
    }

    const rows = await getPrisma().statusItem.findMany({
      where,
      select: {
        id: true,
        slug: true,
        title: true,
        thumbnailUrl: true,
        deitySlug: true,
        mediaType: true,
        isActive: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return rows.map((r) => ({
      ...r,
      mediaType: r.mediaType as StatusMediaType,
    }));
  }

  /**
   * Build the alias map once and index it both ways.
   *
   * Scoped to `contentType: 'status'` with a non-null `ctaContentId`. That
   * column is written by `upsertContentFeedCard()` in BOTH its create and
   * update branches, so pre-TAM-176 cards heal on their next re-sync rather
   * than staying null forever.
   *
   * Cards an editor hand-authored in the CMS carry `ctaContentId = null` (the
   * admin surface has no content-id concept) and are therefore absent from this
   * map — their shares stay unattributable. That is the `partialAttribution`
   * flag on the response, not a silent drop.
   */
  async buildHomeFeedAliasMap(
    statusIds: string[],
  ): Promise<StatusHomeFeedAliasMap> {
    const homeFeedIdToStatusId = new Map<string, string>();
    const statusIdToHomeFeedId = new Map<string, string>();

    if (statusIds.length === 0) {
      return { homeFeedIdToStatusId, statusIdToHomeFeedId };
    }

    const cards = await getPrisma().homeFeedItem.findMany({
      where: {
        contentType: "status",
        ctaContentId: { in: statusIds },
      },
      select: { id: true, ctaContentId: true, createdAt: true },
      // Oldest first: if a status item somehow has two cards, the FIRST one is
      // the one whose createdAt answers "On homepage since", and a later write
      // must not overwrite that with a newer date.
      orderBy: { createdAt: "asc" },
    });

    for (const card of cards) {
      if (!card.ctaContentId) continue;
      homeFeedIdToStatusId.set(card.id, card.ctaContentId);
      if (!statusIdToHomeFeedId.has(card.ctaContentId)) {
        statusIdToHomeFeedId.set(card.ctaContentId, card.id);
      }
    }

    return { homeFeedIdToStatusId, statusIdToHomeFeedId };
  }

  /**
   * "On homepage since" — `HomeFeedItem.createdAt` per status item.
   *
   * Blank does NOT mean "not on homepage": since TAM-176 every status write
   * auto-syncs a card, but an item created before that and never re-edited has
   * no card at all. The column help text has to say so.
   */
  async findHomeFeedCardDates(
    statusIds: string[],
  ): Promise<Map<string, Date>> {
    const dates = new Map<string, Date>();
    if (statusIds.length === 0) return dates;

    const cards = await getPrisma().homeFeedItem.findMany({
      where: { contentType: "status", ctaContentId: { in: statusIds } },
      select: { ctaContentId: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    });

    for (const card of cards) {
      if (!card.ctaContentId) continue;
      if (!dates.has(card.ctaContentId)) {
        dates.set(card.ctaContentId, card.createdAt);
      }
    }
    return dates;
  }

  /**
   * Active pin positions, keyed by `status_items.id`.
   *
   * "Active" is the full soft-delete + window predicate — `deletedAt IS NULL`
   * AND `startAt <= now < endAt` — matching the pin service's own live-pin
   * rule. A pin outside its window is not a current position and must render
   * blank, not stale.
   *
   * `now` is injected so the service can evaluate the whole report against one
   * instant; two reads a second apart must not disagree about a pin expiring.
   */
  async findActivePinPositions(
    statusIds: string[],
    alias: StatusHomeFeedAliasMap,
    now: Date,
  ): Promise<Map<string, StatusPinPositions>> {
    const byStatusId = new Map<string, StatusPinPositions>();
    if (statusIds.length === 0) return byStatusId;

    // A home pin names a home_feed_items.id, so look those up by the inverse
    // map and translate the results back to status ids.
    const homeCardIds = statusIds
      .map((id) => alias.statusIdToHomeFeedId.get(id))
      .filter((id): id is string => Boolean(id));

    const pins = await getPrisma().pinnedContent.findMany({
      where: {
        deletedAt: null,
        startAt: { lte: now },
        endAt: { gt: now },
        OR: [
          {
            surface: { in: ["status_all_gods", "status_deity"] },
            contentId: { in: statusIds },
          },
          ...(homeCardIds.length > 0
            ? [{ surface: "home" as const, contentId: { in: homeCardIds } }]
            : []),
        ],
      },
      select: { surface: true, contentId: true, pinPosition: true },
      // Lowest position wins when an item holds two pins on one surface — the
      // higher-placed pin is the one an editor means by "where is this pinned".
      orderBy: { pinPosition: "asc" },
    });

    const blank = (): StatusPinPositions => ({
      statusAllGods: null,
      statusDeity: null,
      home: null,
    });

    for (const pin of pins) {
      if (pin.surface === "home") {
        const statusId = alias.homeFeedIdToStatusId.get(pin.contentId);
        if (!statusId) continue;
        const entry = byStatusId.get(statusId) ?? blank();
        entry.home ??= pin.pinPosition;
        byStatusId.set(statusId, entry);
        continue;
      }

      const entry = byStatusId.get(pin.contentId) ?? blank();
      if (pin.surface === "status_all_gods") {
        entry.statusAllGods ??= pin.pinPosition;
      } else {
        entry.statusDeity ??= pin.pinPosition;
      }
      byStatusId.set(pin.contentId, entry);
    }

    return byStatusId;
  }
}
