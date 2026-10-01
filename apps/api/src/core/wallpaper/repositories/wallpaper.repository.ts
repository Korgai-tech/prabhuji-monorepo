import { Prisma } from "@prisma/client";
import { getPrisma } from "@api/shared/database";
import { AppError } from "@api/shared/errors";
import type { CursorKey } from "@api/shared/pagination";
import type {
  AdminWallpaperDetailView,
  AdminWallpaperListItemView,
  AdminWallpaperRowDetailView,
  AdminWallpaperRowItemView,
  AdminWallpaperRowListItemView,
  AdminWallpaperRowUpdateInput,
  AdminWallpaperUpdateInput,
  WallpaperMediaType,
  WallpaperRowSortField,
  WallpaperRowType,
  WallpaperSortField,
} from "@api/core/wallpaper/types";

/**
 * Wallpaper module repository — the ONLY place `@prisma/client` is reached for
 * this module (arch-boundaries.json enforces it; the service stays Prisma-free).
 *
 * Owns: the CMS row config read, the per-`row_type` query rules (top_live / new
 * / trending / default-with-filters), the explicit custom-row item join, the
 * deity-tag filter, keyset pagination, the "liked" set resolution helpers
 * (candidate id list + a keyset page over a bounded id set), item detail, and
 * the atomic `set_count` increment. It does NOT touch engagement / deity tables
 * — those are other modules, reached by the SERVICE via `performServiceCall`.
 *
 * KEYSET PAGINATION mirrors mantras: every listing orders by a stable
 * `(value, id)` tuple where `value` is the sort column projected to a number,
 * and fetches `limit + 1` rows so the service can tell whether a next page
 * exists. `default` is a stable `id`-ascending order (a random-looking shuffle
 * now that the per-item `display_order` column is gone); `newest` (created_at)
 * and `trending` (set_count) descend; the tiebreak `id` always ascends.
 */

/** Ordering rule for a query-rule (non-custom, non-liked) page. */
export type WallpaperListSort = "default" | "newest" | "trending";

/** A per-`(row, locale)` `title` OVERRIDE candidate (TAM-111). */
export interface WallpaperRowTranslationRow {
  locale: string;
  title: string;
}

/** A CMS home-row config row (drives `/wallpaper/home` ordering + rules). */
export interface WallpaperRowConfig {
  id: string;
  rowKey: string;
  title: string;
  rowType: WallpaperRowType;
  iconKey: string | null;
  mediaTypeFilter: WallpaperMediaType | null;
  deityTagFilter: string | null;
  maxItems: number;
  displayOrder: number;
  /**
   * TAM-111: the requested-locale `title` override rows (0 or 1 — the base
   * `title` column is the fallback, so no `en` fallback row is fetched). Empty
   * when no `locale` was supplied; the service resolves `override ?? base`.
   */
  translations: WallpaperRowTranslationRow[];
}

/** Raw wallpaper row — everything the service needs to build cards + detail. */
export interface WallpaperRow {
  id: string;
  slug: string;
  title: string;
  mediaType: WallpaperMediaType;
  thumbnailUrl: string;
  previewImageUrl: string;
  previewVideoUrl: string | null;
  liveWallpaperAssetUrl: string | null;
  liveWallpaperPackage: string | null;
  fallbackStaticThumbnailUrl: string | null;
  altText: string | null;
  dominantColor: string | null;
  supportedAndroidVersions: string[];
  focalPoint: unknown;
  safeAreaMetadata: unknown;
  setCount: number;
  isActive: boolean;
  createdAt: Date;
  deitySlug: string | null;
  languages: string[];
  /**
   * Custom-row keyset carrier: the curated `WallpaperRowItem.position` for this
   * item, populated ONLY by `findCustomRowItemsPage` so the service's custom
   * `rowSortKey` can page by `(position, id)`. Absent on every other read.
   */
  position?: number;
}

const WALLPAPER_SELECT = {
  id: true,
  slug: true,
  title: true,
  mediaType: true,
  thumbnailUrl: true,
  previewImageUrl: true,
  previewVideoUrl: true,
  liveWallpaperAssetUrl: true,
  liveWallpaperPackage: true,
  fallbackStaticThumbnailUrl: true,
  altText: true,
  dominantColor: true,
  supportedAndroidVersions: true,
  focalPoint: true,
  safeAreaMetadata: true,
  setCount: true,
  isActive: true,
  createdAt: true,
  deitySlug: true,
  languages: true,
} as const;

interface RawWallpaperRow {
  id: string;
  slug: string;
  title: string;
  mediaType: string;
  thumbnailUrl: string;
  previewImageUrl: string;
  previewVideoUrl: string | null;
  liveWallpaperAssetUrl: string | null;
  liveWallpaperPackage: string | null;
  fallbackStaticThumbnailUrl: string | null;
  altText: string | null;
  dominantColor: string | null;
  supportedAndroidVersions: string[];
  focalPoint: unknown;
  safeAreaMetadata: unknown;
  setCount: number;
  isActive: boolean;
  createdAt: Date;
  deitySlug: string | null;
  languages: string[];
}

function toRow(raw: RawWallpaperRow): WallpaperRow {
  return {
    id: raw.id,
    slug: raw.slug,
    title: raw.title,
    // `media_type` is a TEXT column guarded to {static,live} by the seed + Zod
    // boundary; the cast keeps the wire type precise without a runtime check.
    mediaType: raw.mediaType as WallpaperMediaType,
    thumbnailUrl: raw.thumbnailUrl,
    previewImageUrl: raw.previewImageUrl,
    previewVideoUrl: raw.previewVideoUrl,
    liveWallpaperAssetUrl: raw.liveWallpaperAssetUrl,
    liveWallpaperPackage: raw.liveWallpaperPackage,
    fallbackStaticThumbnailUrl: raw.fallbackStaticThumbnailUrl,
    altText: raw.altText,
    dominantColor: raw.dominantColor,
    supportedAndroidVersions: raw.supportedAndroidVersions,
    focalPoint: raw.focalPoint,
    safeAreaMetadata: raw.safeAreaMetadata,
    setCount: raw.setCount,
    isActive: raw.isActive,
    createdAt: raw.createdAt,
    deitySlug: raw.deitySlug,
    languages: raw.languages,
  };
}

/**
 * Language-membership filter (TAM-108): an item is shown to a `locale` when its
 * `languages` set CONTAINS that locale OR is EMPTY (empty = available in all
 * languages — this preserves wallpaper's pre-TAM-108 behaviour, when it had no
 * language column at all and every item was shown to everyone). Returns `{}`
 * when no locale is supplied, so the filter is opt-in.
 */
function languageWhere(locale?: string): Prisma.WallpaperWhereInput {
  if (!locale) return {};
  return { OR: [{ languages: { isEmpty: true } }, { languages: { has: locale } }] };
}

/**
 * TAM-111 label-localization: the `where` for the row-`title` override include.
 * ONLY the requested locale is fetched — the base `WallpaperHomepageRow.title`
 * column IS the fallback, so (unlike the deity taxonomy) no `en` fallback row is
 * needed. An absent `locale` yields `{ in: [] }` (matches nothing), so the
 * service resolves to the base title and existing mobile calls are unaffected.
 */
function rowTitleLocaleFilter(
  locale?: string
): Prisma.WallpaperHomepageRowTranslationWhereInput {
  return { locale: { in: locale ? [locale] : [] } };
}

/**
 * Build the keyset `WHERE` fragment + `orderBy` for a query-rule sort.
 * `default` ascends on `id` alone (a stable, random-looking order now that the
 * per-item display-order column is gone); `trending` descends on `(setCount,
 * id)`; `newest` descends on `(createdAt, id)`. The `id` tiebreak always ascends.
 */
function sortClause(
  sort: WallpaperListSort,
  afterKey?: CursorKey
): { where: object; orderBy: object[] } {
  if (sort === "default") {
    return {
      orderBy: [{ id: "asc" }],
      where: afterKey ? { id: { gt: afterKey.id } } : {},
    };
  }
  if (sort === "trending") {
    return {
      orderBy: [{ setCount: "desc" }, { id: "asc" }],
      where: afterKey
        ? {
            OR: [
              { setCount: { lt: afterKey.sortOrder } },
              {
                AND: [
                  { setCount: afterKey.sortOrder },
                  { id: { gt: afterKey.id } },
                ],
              },
            ],
          }
        : {},
    };
  }
  // newest — created_at DESC (epoch-ms key), id ASC tiebreak.
  const afterDate = afterKey ? new Date(afterKey.sortOrder) : undefined;
  return {
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    where: afterKey
      ? {
          OR: [
            { createdAt: { lt: afterDate } },
            { AND: [{ createdAt: afterDate }, { id: { gt: afterKey.id } }] },
          ],
        }
      : {},
  };
}

export class WallpaperRepository {
  /**
   * Active CMS home rows, ordered by `(displayOrder, id)`. TAM-111: includes the
   * requested-locale `title` override rows so the service can localize each row
   * label (`override ?? base`); an absent `locale` fetches no overrides.
   */
  async findActiveRows(locale?: string): Promise<WallpaperRowConfig[]> {
    const rows = await getPrisma().wallpaperHomepageRow.findMany({
      where: { isActive: true },
      orderBy: [{ displayOrder: "asc" }, { id: "asc" }],
      select: {
        id: true,
        rowKey: true,
        title: true,
        rowType: true,
        iconKey: true,
        mediaTypeFilter: true,
        deityTagFilter: true,
        maxItems: true,
        displayOrder: true,
        translations: {
          where: rowTitleLocaleFilter(locale),
          select: { locale: true, title: true },
        },
      },
    });
    return rows.map((r) => ({
      ...r,
      rowType: r.rowType as WallpaperRowType,
      mediaTypeFilter: (r.mediaTypeFilter as WallpaperMediaType | null) ?? null,
    }));
  }

  /** One active CMS row by id (backs `?rowId=` listing), or `null`. */
  async findRowById(id: string, locale?: string): Promise<WallpaperRowConfig | null> {
    const r = await getPrisma().wallpaperHomepageRow.findFirst({
      where: { id, isActive: true },
      select: {
        id: true,
        rowKey: true,
        title: true,
        rowType: true,
        iconKey: true,
        mediaTypeFilter: true,
        deityTagFilter: true,
        maxItems: true,
        displayOrder: true,
        translations: {
          where: rowTitleLocaleFilter(locale),
          select: { locale: true, title: true },
        },
      },
    });
    if (!r) return null;
    return {
      ...r,
      rowType: r.rowType as WallpaperRowType,
      mediaTypeFilter: (r.mediaTypeFilter as WallpaperMediaType | null) ?? null,
    };
  }

  /**
   * One keyset page of active wallpapers for a query-rule row/listing, with the
   * optional media-type / deity-slug filters applied. Fetches `limit + 1` rows.
   */
  async findQueryRulePage(params: {
    sort: WallpaperListSort;
    mediaType?: WallpaperMediaType;
    deitySlug?: string;
    locale?: string;
    limit: number;
    afterKey?: CursorKey;
  }): Promise<WallpaperRow[]> {
    const { sort, mediaType, deitySlug, locale, limit, afterKey } = params;
    const clause = sortClause(sort, afterKey);
    const raws = await getPrisma().wallpaper.findMany({
      where: {
        isActive: true,
        ...(mediaType ? { mediaType } : {}),
        // TAM-108: single-deity model — a scalar equality, not a join `some`.
        ...(deitySlug ? { deitySlug } : {}),
        // Combine the keyset predicate and the language-membership predicate
        // under `AND` — both may carry their own top-level `OR`, which cannot
        // coexist as sibling keys in one Prisma `where`.
        AND: [clause.where, languageWhere(locale)],
      },
      orderBy: clause.orderBy,
      take: limit + 1,
      select: WALLPAPER_SELECT,
    });
    return raws.map(toRow);
  }

  /**
   * One keyset page of a CUSTOM row's explicitly-joined items, ordered by
   * `(position, wallpaperId)`. Fetches `limit + 1` rows. Inactive wallpapers are
   * excluded.
   */
  async findCustomRowItemsPage(params: {
    rowId: string;
    limit: number;
    afterKey?: CursorKey;
    locale?: string;
  }): Promise<WallpaperRow[]> {
    const { rowId, limit, afterKey, locale } = params;
    const rows = await getPrisma().wallpaperRowItem.findMany({
      where: {
        rowId,
        // TAM-108: language membership narrows the joined wallpaper too.
        wallpaper: { isActive: true, ...languageWhere(locale) },
        ...(afterKey
          ? {
              OR: [
                { position: { gt: afterKey.sortOrder } },
                {
                  AND: [
                    { position: afterKey.sortOrder },
                    { wallpaperId: { gt: afterKey.id } },
                  ],
                },
              ],
            }
          : {}),
      },
      orderBy: [{ position: "asc" }, { wallpaperId: "asc" }],
      take: limit + 1,
      select: { position: true, wallpaper: { select: WALLPAPER_SELECT } },
    });
    // The keyset key uses `position` (see the service's custom sortKey); carry it
    // onto the row via the `position` field so the shared `buildPage` can key off it.
    return rows.map((r) => ({ ...toRow(r.wallpaper), position: r.position }));
  }

  /**
   * One keyset page over a bounded set of wallpaper ids (the "liked" set),
   * ordered by `id`. Fetches `limit + 1` rows.
   */
  async findByIdsPage(params: {
    ids: string[];
    limit: number;
    afterKey?: CursorKey;
    deitySlug?: string;
    locale?: string;
  }): Promise<WallpaperRow[]> {
    const { ids, limit, afterKey, deitySlug, locale } = params;
    if (ids.length === 0) return [];
    const clause = sortClause("default", afterKey);
    const raws = await getPrisma().wallpaper.findMany({
      where: {
        isActive: true,
        id: { in: ids },
        // TAM-108: single-deity scalar equality (not a join `some`).
        ...(deitySlug ? { deitySlug } : {}),
        AND: [clause.where, languageWhere(locale)],
      },
      orderBy: clause.orderBy,
      take: limit + 1,
      select: WALLPAPER_SELECT,
    });
    return raws.map(toRow);
  }

  /**
   * The active wallpaper catalogue (under the listing's media/deity/language
   * filters) as ROTATION candidates — the input for the twice-daily re-order
   * (TAM-150). No `take`: rotation slides a window over the whole ring.
   *
   * `setCount` IS the action-click signal the spec resurfaces on — the same
   * server-authoritative counter the `trending` row already sorts by (a device
   * set is the highest-intent action on a wallpaper). Read once per refresh
   * epoch per filter combination, not per request.
   *
   * ponytail: whole-catalogue read, the same bounded-catalogue assumption
   * `findAllActiveIds` below already makes.
   */
  async listRotationCandidates(params: {
    mediaType?: WallpaperMediaType;
    deitySlug?: string;
    locale?: string;
  }): Promise<{ id: string; createdAtMs: number; score: number }[]> {
    const { mediaType, deitySlug, locale } = params;
    const rows = await getPrisma().wallpaper.findMany({
      where: {
        isActive: true,
        ...(mediaType ? { mediaType } : {}),
        ...(deitySlug ? { deitySlug } : {}),
        AND: [languageWhere(locale)],
      },
      select: { id: true, createdAt: true, setCount: true },
    });
    return rows.map((r) => ({
      id: r.id,
      createdAtMs: r.createdAt.getTime(),
      score: r.setCount,
    }));
  }

  /** All active wallpaper ids (bounded catalogue) — candidates for like resolution. */
  async findAllActiveIds(): Promise<string[]> {
    const rows = await getPrisma().wallpaper.findMany({
      where: { isActive: true },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }

  /** One active wallpaper by id (full detail), or `null`. */
  async findById(id: string): Promise<WallpaperRow | null> {
    const raw = await getPrisma().wallpaper.findFirst({
      where: { id, isActive: true },
      select: WALLPAPER_SELECT,
    });
    return raw ? toRow(raw) : null;
  }

  /** Existence check for the write paths (avoids selecting the whole row). */
  async findGateById(id: string): Promise<{ id: string } | null> {
    return getPrisma().wallpaper.findFirst({
      where: { id, isActive: true },
      select: { id: true },
    });
  }

  /** Increment `set_count` on a confirmed device set; returns the fresh count. */
  async incrementSetCount(id: string): Promise<{ setCount: number }> {
    return getPrisma().wallpaper.update({
      where: { id },
      data: { setCount: { increment: 1 } },
      select: { setCount: true },
    });
  }

  // =========================================================================
  // ADMIN write surface (TAM-96). Prisma stays confined here; the admin service
  // is Prisma-free. These methods do NOT filter on `is_active` — an editor
  // manages both active and deactivated rows (the `isActive` filter is a query
  // option). `set_count` is NEVER written here (server-authoritative).
  // =========================================================================

  /**
   * One OFFSET page of wallpapers + the unpaginated `total` (a second `COUNT` in
   * the same call — ADR §C2). `q` matches `title` OR `slug` case-insensitively;
   * `mediaType` / `deitySlug` narrow the set.
   */
  async findAdminWallpaperPage(params: {
    page: number;
    pageSize: number;
    sort?: WallpaperSortField;
    order: "asc" | "desc";
    q?: string;
    isActive?: boolean;
    mediaType?: WallpaperMediaType;
    deitySlug?: string;
  }): Promise<{ items: AdminWallpaperListItemView[]; total: number }> {
    const where: Prisma.WallpaperWhereInput = {
      ...(params.isActive !== undefined ? { isActive: params.isActive } : {}),
      ...(params.mediaType ? { mediaType: params.mediaType } : {}),
      // TAM-108: single-deity scalar equality (not a join `some`).
      ...(params.deitySlug ? { deitySlug: params.deitySlug } : {}),
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
      getPrisma().wallpaper.findMany({
        where,
        orderBy: buildWallpaperOrderBy(params.sort, params.order),
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
        select: ADMIN_WALLPAPER_LIST_SELECT,
      }),
      getPrisma().wallpaper.count({ where }),
    ]);

    return { items: rows.map(toAdminWallpaperListItem), total };
  }

  /** Full wallpaper row + its deity slugs by id, or `null`. */
  async findAdminWallpaperById(
    id: string
  ): Promise<AdminWallpaperDetailView | null> {
    const row = await getPrisma().wallpaper.findUnique({
      where: { id },
      select: ADMIN_WALLPAPER_DETAIL_SELECT,
    });
    return row ? toAdminWallpaperDetail(row) : null;
  }

  /** Cheap existence probe — backs 404-vs-409 disambiguation (any active state). */
  async wallpaperExistsById(id: string): Promise<boolean> {
    const row = await getPrisma().wallpaper.findUnique({
      where: { id },
      select: { id: true },
    });
    return row !== null;
  }

  /** The subset of `ids` that exist (any active state) — for item-set validation. */
  async findExistingWallpaperIds(ids: string[]): Promise<string[]> {
    if (ids.length === 0) return [];
    const rows = await getPrisma().wallpaper.findMany({
      where: { id: { in: ids } },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }

  /** Create a wallpaper. Duplicate `slug` → 409 `SLUG_CONFLICT`, never a 500. */
  async createWallpaper(input: {
    slug: string;
    title: string;
    mediaType: WallpaperMediaType;
    deitySlug: string | null;
    languages: string[];
    thumbnailUrl: string;
    previewImageUrl: string;
    previewVideoUrl?: string;
    liveWallpaperAssetUrl?: string;
    liveWallpaperPackage?: string;
    fallbackStaticThumbnailUrl?: string;
    altText?: string;
    dominantColor?: string;
    supportedAndroidVersions: string[];
    focalPoint?: unknown;
    safeAreaMetadata?: unknown;
    isActive: boolean;
  }): Promise<AdminWallpaperDetailView> {
    try {
      const row = await getPrisma().wallpaper.create({
        data: {
          slug: input.slug,
          title: input.title,
          mediaType: input.mediaType,
          deitySlug: input.deitySlug,
          languages: input.languages,
          thumbnailUrl: input.thumbnailUrl,
          previewImageUrl: input.previewImageUrl,
          previewVideoUrl: input.previewVideoUrl ?? null,
          liveWallpaperAssetUrl: input.liveWallpaperAssetUrl ?? null,
          liveWallpaperPackage: input.liveWallpaperPackage ?? null,
          fallbackStaticThumbnailUrl: input.fallbackStaticThumbnailUrl ?? null,
          altText: input.altText ?? null,
          dominantColor: input.dominantColor ?? null,
          supportedAndroidVersions: input.supportedAndroidVersions,
          focalPoint: toJsonInput(input.focalPoint),
          safeAreaMetadata: toJsonInput(input.safeAreaMetadata),
          isActive: input.isActive,
        },
        select: ADMIN_WALLPAPER_DETAIL_SELECT,
      });
      return toAdminWallpaperDetail(row);
    } catch (err) {
      throw mapUniqueViolation(err, `A wallpaper with slug "${input.slug}" already exists`);
    }
  }

  /**
   * Optimistic-concurrency write (ADR §C3): the client's last-known `updatedAt`
   * is in the `WHERE`. Returns the affected count; the SERVICE turns a 0 into
   * 404-or-409. Deactivation is this method with `{ isActive: false }`.
   */
  async updateWallpaperWithPrecondition(params: {
    id: string;
    expectedUpdatedAt: Date;
    data: AdminWallpaperUpdateInput;
  }): Promise<number> {
    const res = await getPrisma().wallpaper.updateMany({
      where: { id: params.id, updatedAt: params.expectedUpdatedAt },
      data: toWallpaperWriteData(params.data),
    });
    return res.count;
  }

  // ---- homepage rows ------------------------------------------------------

  /** One OFFSET page of homepage rows + the unpaginated `total`. */
  async findAdminRowPage(params: {
    page: number;
    pageSize: number;
    sort?: WallpaperRowSortField;
    order: "asc" | "desc";
    q?: string;
    rowType?: WallpaperRowType;
    isActive?: boolean;
  }): Promise<{ items: AdminWallpaperRowListItemView[]; total: number }> {
    const where: Prisma.WallpaperHomepageRowWhereInput = {
      ...(params.isActive !== undefined ? { isActive: params.isActive } : {}),
      ...(params.rowType ? { rowType: params.rowType } : {}),
      ...(params.q
        ? {
            OR: [
              { title: { contains: params.q, mode: "insensitive" } },
              { rowKey: { contains: params.q, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      getPrisma().wallpaperHomepageRow.findMany({
        where,
        orderBy: buildRowOrderBy(params.sort, params.order),
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
        select: ADMIN_ROW_SELECT,
      }),
      getPrisma().wallpaperHomepageRow.count({ where }),
    ]);

    return { items: rows.map(toAdminRowListItem), total };
  }

  /** Full homepage-row + its ordered curated items by id, or `null`. */
  async findAdminRowById(id: string): Promise<AdminWallpaperRowDetailView | null> {
    const row = await getPrisma().wallpaperHomepageRow.findUnique({
      where: { id },
      select: {
        ...ADMIN_ROW_SELECT,
        items: {
          orderBy: { position: "asc" },
          select: { wallpaperId: true, position: true },
        },
        translations: ADMIN_ROW_TRANSLATION_SELECT,
      },
    });
    return row ? toAdminRowDetail(row) : null;
  }

  /** Cheap existence probe for a homepage row (any active state). */
  async rowExistsById(id: string): Promise<boolean> {
    const row = await getPrisma().wallpaperHomepageRow.findUnique({
      where: { id },
      select: { id: true },
    });
    return row !== null;
  }

  /** The row's `rowType` (any active state), or `null` if the row is unknown. */
  async findRowTypeById(id: string): Promise<WallpaperRowType | null> {
    const row = await getPrisma().wallpaperHomepageRow.findUnique({
      where: { id },
      select: { rowType: true },
    });
    return row ? (row.rowType as WallpaperRowType) : null;
  }

  /**
   * Create a homepage row and (optionally) its per-locale `title` translations
   * in one implicit transaction (nested `create`; TAM-111). Duplicate `rowKey`
   * → 409 `ROW_KEY_CONFLICT`.
   */
  async createRow(input: {
    rowKey: string;
    title: string;
    rowType: WallpaperRowType;
    iconKey?: string;
    mediaTypeFilter?: WallpaperMediaType;
    deityTagFilter?: string;
    maxItems: number;
    displayOrder: number;
    isActive: boolean;
    translations: { locale: string; title: string }[];
  }): Promise<AdminWallpaperRowDetailView> {
    try {
      const row = await getPrisma().wallpaperHomepageRow.create({
        data: {
          rowKey: input.rowKey,
          title: input.title,
          rowType: input.rowType,
          iconKey: input.iconKey ?? null,
          mediaTypeFilter: input.mediaTypeFilter ?? null,
          deityTagFilter: input.deityTagFilter ?? null,
          maxItems: input.maxItems,
          displayOrder: input.displayOrder,
          isActive: input.isActive,
          translations: {
            create: input.translations.map((t) => ({
              locale: t.locale,
              title: t.title,
            })),
          },
        },
        select: {
          ...ADMIN_ROW_SELECT,
          items: {
            orderBy: { position: "asc" },
            select: { wallpaperId: true, position: true },
          },
          translations: ADMIN_ROW_TRANSLATION_SELECT,
        },
      });
      return toAdminRowDetail(row);
    } catch (err) {
      throw mapUniqueViolation(
        err,
        `A homepage row with key "${input.rowKey}" already exists`,
        "ROW_KEY_CONFLICT"
      );
    }
  }

  /**
   * Optimistic-concurrency homepage-row write; returns the affected count.
   * TAM-111: when `translations` is provided, the scalar update and the
   * translation replace-set run in ONE `$transaction` — an untouched precondition
   * (0 count) leaves the translations alone. `undefined` never touches them; a
   * provided array (incl. `[]`) REPLACES the whole set.
   */
  async updateRowWithPrecondition(params: {
    id: string;
    expectedUpdatedAt: Date;
    data: AdminWallpaperRowUpdateInput;
    translations?: { locale: string; title: string }[];
  }): Promise<number> {
    const { id, expectedUpdatedAt, data, translations } = params;
    return getPrisma().$transaction(async (tx) => {
      const { count } = await tx.wallpaperHomepageRow.updateMany({
        where: { id, updatedAt: expectedUpdatedAt },
        data,
      });
      if (count === 0) return 0;
      if (translations !== undefined) {
        await tx.wallpaperHomepageRowTranslation.deleteMany({
          where: { wallpaperHomepageRowId: id },
        });
        if (translations.length > 0) {
          await tx.wallpaperHomepageRowTranslation.createMany({
            data: translations.map((t) => ({
              wallpaperHomepageRowId: id,
              locale: t.locale,
              title: t.title,
            })),
          });
        }
      }
      return count;
    });
  }

  /**
   * REPLACE a custom row's curated items with `wallpaperIds` in array order
   * (`position` = index) in ONE `$transaction` (ADR §C4). The join has real FKs
   * (`onDelete: Cascade`), so this is a genuine delete+insert of join rows.
   */
  async replaceRowItems(
    rowId: string,
    wallpaperIds: string[]
  ): Promise<AdminWallpaperRowItemView[]> {
    return getPrisma().$transaction(async (tx) => {
      await tx.wallpaperRowItem.deleteMany({ where: { rowId } });
      if (wallpaperIds.length > 0) {
        await tx.wallpaperRowItem.createMany({
          data: wallpaperIds.map((wallpaperId, position) => ({
            rowId,
            wallpaperId,
            position,
          })),
        });
      }
      const rows = await tx.wallpaperRowItem.findMany({
        where: { rowId },
        orderBy: { position: "asc" },
        select: { wallpaperId: true, position: true },
      });
      return rows.map((r) => ({ wallpaperId: r.wallpaperId, position: r.position }));
    });
  }

}

// ---------------------------------------------------------------------------
// admin selects + row mappers (kept out of the class body for readability)
// ---------------------------------------------------------------------------

const ADMIN_WALLPAPER_LIST_SELECT = {
  id: true,
  slug: true,
  title: true,
  mediaType: true,
  thumbnailUrl: true,
  previewImageUrl: true,
  previewVideoUrl: true,
  setCount: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  deitySlug: true,
  languages: true,
} as const;

const ADMIN_WALLPAPER_DETAIL_SELECT = {
  ...ADMIN_WALLPAPER_LIST_SELECT,
  liveWallpaperAssetUrl: true,
  liveWallpaperPackage: true,
  fallbackStaticThumbnailUrl: true,
  altText: true,
  dominantColor: true,
  supportedAndroidVersions: true,
  focalPoint: true,
  safeAreaMetadata: true,
} as const;

const ADMIN_ROW_SELECT = {
  id: true,
  rowKey: true,
  title: true,
  rowType: true,
  iconKey: true,
  mediaTypeFilter: true,
  deityTagFilter: true,
  maxItems: true,
  displayOrder: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;

/**
 * The row's per-locale `title` overrides (TAM-111), embedded in the row detail
 * (every locale — NOT localized). Ordered by locale for a stable admin view.
 */
const ADMIN_ROW_TRANSLATION_SELECT = {
  orderBy: { locale: "asc" },
  select: { locale: true, title: true },
} as const;

interface AdminWallpaperListRaw {
  id: string;
  slug: string;
  title: string;
  mediaType: string;
  thumbnailUrl: string;
  previewImageUrl: string;
  previewVideoUrl: string | null;
  setCount: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  deitySlug: string | null;
  languages: string[];
}

interface AdminWallpaperDetailRaw extends AdminWallpaperListRaw {
  liveWallpaperAssetUrl: string | null;
  liveWallpaperPackage: string | null;
  fallbackStaticThumbnailUrl: string | null;
  altText: string | null;
  dominantColor: string | null;
  supportedAndroidVersions: string[];
  focalPoint: unknown;
  safeAreaMetadata: unknown;
}

function toAdminWallpaperListItem(
  row: AdminWallpaperListRaw
): AdminWallpaperListItemView {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    mediaType: row.mediaType as WallpaperMediaType,
    thumbnailUrl: row.thumbnailUrl,
    previewImageUrl: row.previewImageUrl,
    previewVideoUrl: row.previewVideoUrl,
    setCount: row.setCount,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    deitySlug: row.deitySlug,
    languages: row.languages,
  };
}

function toAdminWallpaperDetail(
  row: AdminWallpaperDetailRaw
): AdminWallpaperDetailView {
  return {
    ...toAdminWallpaperListItem(row),
    liveWallpaperAssetUrl: row.liveWallpaperAssetUrl,
    liveWallpaperPackage: row.liveWallpaperPackage,
    fallbackStaticThumbnailUrl: row.fallbackStaticThumbnailUrl,
    altText: row.altText,
    dominantColor: row.dominantColor,
    supportedAndroidVersions: row.supportedAndroidVersions,
    focalPoint: (row.focalPoint as AdminWallpaperDetailView["focalPoint"]) ?? null,
    safeAreaMetadata:
      (row.safeAreaMetadata as AdminWallpaperDetailView["safeAreaMetadata"]) ?? null,
  };
}

interface AdminRowRaw {
  id: string;
  rowKey: string;
  title: string;
  rowType: string;
  iconKey: string | null;
  mediaTypeFilter: string | null;
  deityTagFilter: string | null;
  maxItems: number;
  displayOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

function toAdminRowListItem(row: AdminRowRaw): AdminWallpaperRowListItemView {
  return {
    id: row.id,
    rowKey: row.rowKey,
    title: row.title,
    rowType: row.rowType as WallpaperRowType,
    iconKey: row.iconKey,
    mediaTypeFilter: (row.mediaTypeFilter as WallpaperMediaType | null) ?? null,
    deityTagFilter: row.deityTagFilter,
    maxItems: row.maxItems,
    displayOrder: row.displayOrder,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toAdminRowDetail(
  row: AdminRowRaw & {
    items: { wallpaperId: string; position: number }[];
    translations: { locale: string; title: string }[];
  }
): AdminWallpaperRowDetailView {
  return {
    ...toAdminRowListItem(row),
    translations: row.translations.map((t) => ({
      locale: t.locale,
      title: t.title,
    })),
    items: row.items.map((i) => ({
      wallpaperId: i.wallpaperId,
      position: i.position,
    })),
  };
}

/**
 * Map a partial admin update to Prisma write data. `undefined` fields are
 * omitted (no change); an explicit `null` on a nullable column clears it. The
 * two `Json?` columns need `Prisma.DbNull` (not JS `null`) to store SQL NULL.
 */
function toWallpaperWriteData(
  data: AdminWallpaperUpdateInput
): Prisma.WallpaperUpdateManyMutationInput {
  const out: Prisma.WallpaperUpdateManyMutationInput = {};
  if (data.title !== undefined) out.title = data.title;
  // TAM-108: `deitySlug` is a nullable scalar (`null` clears the deity);
  // `languages` is a whole-array set (empty = all languages).
  if (data.deitySlug !== undefined) out.deitySlug = data.deitySlug;
  if (data.languages !== undefined) out.languages = data.languages;
  if (data.thumbnailUrl !== undefined) out.thumbnailUrl = data.thumbnailUrl;
  if (data.previewImageUrl !== undefined) out.previewImageUrl = data.previewImageUrl;
  if (data.previewVideoUrl !== undefined) out.previewVideoUrl = data.previewVideoUrl;
  if (data.liveWallpaperAssetUrl !== undefined)
    out.liveWallpaperAssetUrl = data.liveWallpaperAssetUrl;
  if (data.liveWallpaperPackage !== undefined)
    out.liveWallpaperPackage = data.liveWallpaperPackage;
  if (data.fallbackStaticThumbnailUrl !== undefined)
    out.fallbackStaticThumbnailUrl = data.fallbackStaticThumbnailUrl;
  if (data.altText !== undefined) out.altText = data.altText;
  if (data.dominantColor !== undefined) out.dominantColor = data.dominantColor;
  if (data.supportedAndroidVersions !== undefined)
    out.supportedAndroidVersions = data.supportedAndroidVersions;
  if (data.focalPoint !== undefined) out.focalPoint = toJsonInput(data.focalPoint);
  if (data.safeAreaMetadata !== undefined)
    out.safeAreaMetadata = toJsonInput(data.safeAreaMetadata);
  if (data.isActive !== undefined) out.isActive = data.isActive;
  return out;
}

/** A JS value for a `Json?` column: an object stores JSON; `null`/absent → SQL NULL. */
function toJsonInput(
  value: unknown
): Prisma.InputJsonValue | typeof Prisma.DbNull | undefined {
  if (value === undefined) return undefined;
  if (value === null) return Prisma.DbNull;
  return value;
}

/** Turn a Prisma unique-constraint (P2002) into a 409 `AppError`. */
function mapUniqueViolation(
  err: unknown,
  message: string,
  code = "SLUG_CONFLICT"
): unknown {
  if (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    err.code === "P2002"
  ) {
    return new AppError(message, 409, code);
  }
  return err;
}

function buildWallpaperOrderBy(
  sort: WallpaperSortField | undefined,
  order: "asc" | "desc"
): Prisma.WallpaperOrderByWithRelationInput[] {
  switch (sort) {
    case undefined:
      // Default admin order is newest-first (the per-item `display_order` column
      // is gone); `id` is the stable tiebreak.
      return [{ createdAt: "desc" }, { id: "asc" }];
    case "title":
      return [{ title: order }, { id: "asc" }];
    case "setCount":
      return [{ setCount: order }, { id: "asc" }];
    case "isActive":
      return [{ isActive: order }, { createdAt: "desc" }];
    case "createdAt":
      return [{ createdAt: order }];
    case "updatedAt":
      return [{ updatedAt: order }];
  }
}

function buildRowOrderBy(
  sort: WallpaperRowSortField | undefined,
  order: "asc" | "desc"
): Prisma.WallpaperHomepageRowOrderByWithRelationInput[] {
  switch (sort) {
    case undefined:
      return [{ displayOrder: "asc" }, { id: "asc" }];
    case "title":
      return [{ title: order }, { id: "asc" }];
    case "rowType":
      return [{ rowType: order }, { displayOrder: "asc" }];
    case "displayOrder":
      return [{ displayOrder: order }, { id: "asc" }];
    case "isActive":
      return [{ isActive: order }, { displayOrder: "asc" }];
    case "createdAt":
      return [{ createdAt: order }];
    case "updatedAt":
      return [{ updatedAt: order }];
  }
}
