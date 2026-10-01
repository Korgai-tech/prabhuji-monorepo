import { Prisma } from "@prisma/client";
import { getPrisma } from "@api/shared/database";
import { AppError } from "@api/shared/errors";
import type { CursorKey } from "@api/shared/pagination";
import type {
  AdminMantraCategoryCreateInput,
  AdminMantraCategoryDetailView,
  AdminMantraCategoryUpdateInput,
  AdminMantraCategoryView,
  AdminMantraItemCreateInput,
  AdminMantraItemDetailView,
  AdminMantraItemListView,
  AdminMantraItemUpdateInput,
  AdminMantraSectionCreateInput,
  AdminMantraSectionDetailView,
  AdminMantraSectionItemView,
  AdminMantraSectionUpdateInput,
  AdminMantraSectionView,
  MantraCategorySortField,
  MantraItemSortField,
  MantraItemType,
  MantraLayoutType,
  MantraSectionSortField,
  MantraSectionType,
  MantraSortMode,
} from "@api/core/mantras/types";

/**
 * Mantras module repository — the ONLY place `@prisma/client` is reached for
 * this module (arch-boundaries.json enforces it; the service stays Prisma-free).
 *
 * Sibling of `AartiRepository`: owns item queries (by category / deity / section
 * / sort with keyset pagination), the category list, bounded playlist queries
 * (deity/category/newly-added/listing/recently-played), recently-played
 * read/write, and the per-user counter-preference read/write. It does NOT touch
 * engagement / deity / subscription tables — those are other modules, reached by
 * the SERVICE via `performServiceCall`.
 *
 * KEYSET PAGINATION mirrors aarti: every listing orders by a stable
 * `(value, id)` tuple where `value` is the sort column projected to a number.
 * The repo fetches `limit + 1` rows so the service can tell whether a next page
 * exists. Playlists are bounded (seed-scale groups) and fetched whole (capped by
 * `PLAYLIST_MAX`), not keyset-paginated.
 */

/** Max items returned for a single resolved playlist (bounded group). */
export const PLAYLIST_MAX = 100;

/** Raw mantra row + its tag ids, for the service to gate + enrich. */
export interface MantraRow {
  id: string;
  title: string;
  type: MantraItemType;
  artworkUrl: string;
  audioUrl: string;
  singerName: string | null;
  composerName: string | null;
  mantraText: string;
  transliterationText: string | null;
  /** TAM-108: availability language set (`[]` = all languages). */
  languages: string[];
  description: string | null;
  deepLinkUrl: string | null;
  publishedAt: Date | null;
  createdAt: Date;
  playCount: number;
  isFeatured: boolean;
  isActive: boolean;
  categoryIds: string[];
  /** TAM-108: the SINGLE deity slug (logical ref; `null` = no deity). */
  deitySlug: string | null;
  /**
   * TAM-160 curated-section keyset carrier: the row's
   * `MantraHomepageSectionItem.position`, populated ONLY by
   * `findSectionItemsPage` so the service's `curated` sort key can page by
   * `(position, id)`. Absent on every other read.
   */
  position?: number;
}

/** An active homepage section row (`GET /mantras/sections` ordering). */
export interface SectionRow {
  /** TAM-160: needed to resolve a `curated` section's items and to ride out on the wire. */
  id: string;
  sectionType: MantraSectionType;
  title: string;
  layoutType: MantraLayoutType;
  showAllEnabled: boolean;
  sortOrder: number;
  /**
   * TAM-110: per-locale `title` OVERRIDE rows for the requested locale (the
   * base `title` column is the `en` fallback). Empty when no `locale` was
   * requested or the section has no override for it — the SERVICE resolves.
   */
  translations: { locale: string; title: string }[];
}

/** A recently-played mantra row carries the caller's `lastPlayedAt`. */
export interface RecentlyPlayedRow extends MantraRow {
  lastPlayedAt: Date;
}

export interface CategoryRow {
  id: string;
  slug: string;
  name: string;
  imageUrl: string | null;
  backgroundColorToken: string | null;
  sortOrder: number;
  /**
   * TAM-110: per-locale `displayName` OVERRIDE rows for the requested locale
   * (the base `displayName` column, exposed as `name`, is the `en` fallback).
   * Empty when no `locale` was requested or the category has no override for
   * it — the SERVICE resolves the effective name.
   */
  translations: { locale: string; displayName: string }[];
}

/** Category `select` — the column is `displayName`; `CategoryRow.name` maps it. */
const CATEGORY_SELECT = {
  id: true,
  slug: true,
  displayName: true,
  imageUrl: true,
  backgroundColorToken: true,
  sortOrder: true,
} as const;

/**
 * TAM-110: the translations `include` for a category read. Only the requested
 * locale's OVERRIDE row is fetched — the base `displayName` column IS the `en`
 * fallback (`LABEL_FALLBACK_LOCALE`), so no fallback row is needed. An absent
 * `locale` matches nothing (no real locale is the empty string), so the base
 * column is returned unchanged — public reads that omit `locale` stay
 * byte-for-byte identical.
 */
function categoryTranslationInclude(locale: string | undefined) {
  return {
    where: { locale: locale ?? "" },
    select: { locale: true, displayName: true },
  } as const;
}

interface RawCategoryRow {
  id: string;
  slug: string;
  displayName: string;
  imageUrl: string | null;
  backgroundColorToken: string | null;
  sortOrder: number;
  translations: { locale: string; displayName: string }[];
}

function toCategoryRow(raw: RawCategoryRow): CategoryRow {
  return {
    id: raw.id,
    slug: raw.slug,
    name: raw.displayName,
    imageUrl: raw.imageUrl,
    backgroundColorToken: raw.backgroundColorToken,
    sortOrder: raw.sortOrder,
    translations: raw.translations,
  };
}

const ITEM_SELECT = {
  id: true,
  title: true,
  type: true,
  artworkUrl: true,
  audioUrl: true,
  singerName: true,
  composerName: true,
  mantraText: true,
  transliterationText: true,
  languages: true,
  description: true,
  deepLinkUrl: true,
  publishedAt: true,
  createdAt: true,
  playCount: true,
  isFeatured: true,
  isActive: true,
  deitySlug: true,
  categoryTags: { select: { categoryId: true } },
} as const;

interface RawItemRow {
  id: string;
  title: string;
  type: string;
  artworkUrl: string;
  audioUrl: string;
  singerName: string | null;
  composerName: string | null;
  mantraText: string;
  transliterationText: string | null;
  languages: string[];
  description: string | null;
  deepLinkUrl: string | null;
  publishedAt: Date | null;
  createdAt: Date;
  playCount: number;
  isFeatured: boolean;
  isActive: boolean;
  deitySlug: string | null;
  categoryTags: { categoryId: string }[];
}

function toItemRow(raw: RawItemRow): MantraRow {
  return {
    id: raw.id,
    title: raw.title,
    // `type` is a TEXT column guarded to {mantra,stuti} by the seed + Zod
    // boundary; the cast keeps the wire type precise without a runtime check.
    type: raw.type as MantraItemType,
    artworkUrl: raw.artworkUrl,
    audioUrl: raw.audioUrl,
    singerName: raw.singerName,
    composerName: raw.composerName,
    // #EXPORT_CRITICAL — mantraText is passed through verbatim (no trim/normalize).
    mantraText: raw.mantraText,
    transliterationText: raw.transliterationText,
    languages: raw.languages,
    description: raw.description,
    deepLinkUrl: raw.deepLinkUrl,
    publishedAt: raw.publishedAt,
    createdAt: raw.createdAt,
    playCount: raw.playCount,
    isFeatured: raw.isFeatured,
    isActive: raw.isActive,
    categoryIds: raw.categoryTags.map((t) => t.categoryId),
    deitySlug: raw.deitySlug,
  };
}

/**
 * TAM-108 LANGUAGE MEMBERSHIP predicate: an item matches a `locale` when the
 * locale is IN its `languages` set, OR its `languages` set is EMPTY (the item is
 * available in ALL languages). Returned as a standalone `OR` fragment so callers
 * can nest it under an `AND` and never collide with a keyset `OR`.
 */
function languageMembership(
  locale: string
): Prisma.MantraAudioItemWhereInput {
  return {
    OR: [{ languages: { has: locale } }, { languages: { isEmpty: true } }],
  };
}

/**
 * Build the keyset `WHERE` fragment + `orderBy` for a non-recently-played sort
 * (mirrors `AartiRepository.audioSortClause`). `default` is a STABLE SHUFFLE BY
 * `id` (the manual `sortOrder` column was dropped) — it ascends on `id` alone;
 * `most_played` descends on `(playCount, id)`; `newest` descends on
 * `(publishedAt, id)`. The tiebreak `id` always ascends.
 */
function itemSortClause(
  sort: Exclude<MantraSortMode, "recent">,
  afterKey?: CursorKey
): { where: object; orderBy: object[] } {
  if (sort === "default") {
    // Stable pseudo-random order: keyset on the primary key `id` only.
    return {
      orderBy: [{ id: "asc" }],
      where: afterKey ? { id: { gt: afterKey.id } } : {},
    };
  }
  if (sort === "most_played") {
    return {
      orderBy: [{ playCount: "desc" }, { id: "asc" }],
      where: afterKey
        ? {
            OR: [
              { playCount: { lt: afterKey.sortOrder } },
              {
                AND: [
                  { playCount: afterKey.sortOrder },
                  { id: { gt: afterKey.id } },
                ],
              },
            ],
          }
        : {},
    };
  }
  // newest — publishedAt DESC (epoch-ms key), id ASC tiebreak.
  const afterDate = afterKey ? new Date(afterKey.sortOrder) : undefined;
  return {
    orderBy: [{ publishedAt: "desc" }, { id: "asc" }],
    where: afterKey
      ? {
          OR: [
            { publishedAt: { lt: afterDate } },
            {
              AND: [{ publishedAt: afterDate }, { id: { gt: afterKey.id } }],
            },
          ],
        }
      : {},
  };
}

export class MantrasRepository {
  /**
   * Active homepage sections, ordered by `(sortOrder, id)`. TAM-110: includes
   * the requested `locale`'s `title` OVERRIDE rows (absent locale ⇒ none ⇒
   * the base `title` is served unchanged).
   */
  async findActiveSections(locale?: string): Promise<SectionRow[]> {
    const rows = await getPrisma().mantraHomepageSection.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      select: {
        id: true,
        sectionType: true,
        title: true,
        layoutType: true,
        showAllEnabled: true,
        sortOrder: true,
        translations: {
          where: { locale: locale ?? "" },
          select: { locale: true, title: true },
        },
      },
    });
    return rows as SectionRow[];
  }

  /**
   * Active categories ordered by `(sortOrder, id)` — backs the categories
   * section. TAM-110: includes the requested `locale`'s `displayName` OVERRIDE
   * rows (absent locale ⇒ none ⇒ the base name is served unchanged).
   */
  async findActiveCategories(locale?: string): Promise<CategoryRow[]> {
    const rows = await getPrisma().mantraCategory.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      select: { ...CATEGORY_SELECT, translations: categoryTranslationInclude(locale) },
    });
    return rows.map(toCategoryRow);
  }

  /**
   * Categories by id (detail tag resolution), ordered by sortOrder. TAM-110:
   * includes the requested `locale`'s `displayName` OVERRIDE rows.
   */
  async findCategoriesByIds(
    ids: string[],
    locale?: string
  ): Promise<CategoryRow[]> {
    if (ids.length === 0) return [];
    const rows = await getPrisma().mantraCategory.findMany({
      where: { id: { in: ids } },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      select: { ...CATEGORY_SELECT, translations: categoryTranslationInclude(locale) },
    });
    return rows.map(toCategoryRow);
  }

  /**
   * One active category by id (playlist-endpoint validation), or `null`. Its
   * label is not surfaced on the wire, so no `language` override is fetched
   * (`translations` is always empty here).
   */
  async findCategoryById(id: string): Promise<CategoryRow | null> {
    const raw = await getPrisma().mantraCategory.findFirst({
      where: { id, isActive: true },
      select: { ...CATEGORY_SELECT, translations: categoryTranslationInclude(undefined) },
    });
    return raw ? toCategoryRow(raw) : null;
  }

  /** One active item by id (or `null`). */
  async findItemById(id: string): Promise<MantraRow | null> {
    const raw = await getPrisma().mantraAudioItem.findFirst({
      where: { id, isActive: true },
      select: ITEM_SELECT,
    });
    return raw ? toItemRow(raw) : null;
  }

  /**
   * TAM-125 downloads: fetch the stored audio URL + the download metadata
   * columns (`sizeBytes`, `durationMs`, `checksum`) for one active row, or
   * `null` for an unknown/inactive row.
   *
   * Sibling of `AartiRepository.findDownloadSourceById` — same shape, separate
   * `mantra_audio_items` table. Columns remain nullable while the backfill
   * script is still running; the SERVICE narrows + validates before the wire.
   */
  async findDownloadSourceById(id: string): Promise<{
    audioUrl: string;
    sizeBytes: bigint | null;
    durationMs: number | null;
    checksum: string | null;
  } | null> {
    const row = await getPrisma().mantraAudioItem.findFirst({
      where: { id, isActive: true },
      select: {
        audioUrl: true,
        sizeBytes: true,
        durationMs: true,
        checksum: true,
      },
    });
    if (!row) return null;
    return {
      audioUrl: row.audioUrl,
      sizeBytes: row.sizeBytes,
      durationMs: row.durationMs,
      checksum: row.checksum,
    };
  }

  /** Existence check (active row) for the write path (avoids selecting the whole row). */
  async findItemGateById(id: string): Promise<{ id: string } | null> {
    return getPrisma().mantraAudioItem.findFirst({
      where: { id, isActive: true },
      select: { id: true },
    });
  }

  /**
   * One keyset page of active items for a non-recently-played sort, optionally
   * filtered to a single category or deity tag. Fetches `limit + 1` rows.
   */
  async findItemPage(params: {
    sort: Exclude<MantraSortMode, "recent">;
    categoryId?: string;
    deitySlug?: string;
    locale?: string;
    limit: number;
    afterKey?: CursorKey;
  }): Promise<MantraRow[]> {
    const { sort, categoryId, deitySlug, locale, limit, afterKey } = params;
    const clause = itemSortClause(sort, afterKey);
    const raws = await getPrisma().mantraAudioItem.findMany({
      where: {
        isActive: true,
        ...(categoryId ? { categoryTags: { some: { categoryId } } } : {}),
        // TAM-108: single-deity scalar filter (was the many-to-many join).
        ...(deitySlug ? { deitySlug } : {}),
        // TAM-108: LANGUAGE MEMBERSHIP — locale ∈ item.languages, OR the item
        // has an empty `languages` set (= available in ALL languages). Held in
        // an `AND` so it never collides with the keyset `OR` in `clause.where`.
        ...(locale ? { AND: [languageMembership(locale)] } : {}),
        ...clause.where,
      },
      orderBy: clause.orderBy,
      take: limit + 1,
      select: ITEM_SELECT,
    });
    return raws.map(toItemRow);
  }

  /**
   * TAM-160: one keyset page of a CURATED section's hand-picked items, ordered by
   * the saved `(position, itemId)`. Fetches `limit + 1` rows. Inactive items are
   * excluded (#EXPORT_CRITICAL — a deactivated mantra must not reappear through a
   * curated row) and the TAM-108 language-membership filter narrows the joined
   * item exactly as it does on the flat listing.
   *
   * The SAME method backs both curated surfaces: the `/mantras/sections` preview
   * (called with `limit = SECTION_ITEM_LIMIT`, no cursor) and the `?sectionId=`
   * Show-all page. A section that is unknown or non-curated simply has no join
   * rows, so it yields an empty page — never an error.
   */
  async findSectionItemsPage(params: {
    sectionId: string;
    limit: number;
    afterKey?: CursorKey;
    locale?: string;
  }): Promise<MantraRow[]> {
    const { sectionId, limit, afterKey, locale } = params;
    const rows = await getPrisma().mantraHomepageSectionItem.findMany({
      where: {
        sectionId,
        item: {
          isActive: true,
          ...(locale ? { AND: [languageMembership(locale)] } : {}),
        },
        ...(afterKey
          ? {
              OR: [
                { position: { gt: afterKey.sortOrder } },
                {
                  AND: [
                    { position: afterKey.sortOrder },
                    { itemId: { gt: afterKey.id } },
                  ],
                },
              ],
            }
          : {}),
      },
      orderBy: [{ position: "asc" }, { itemId: "asc" }],
      take: limit + 1,
      select: { position: true, item: { select: ITEM_SELECT } },
    });
    // Carry `position` onto the row so the shared `buildPage` can key off it
    // (see the service's `curated` sort key).
    return rows.map((r) => ({ ...toItemRow(r.item), position: r.position }));
  }

  /**
   * One keyset page of the caller's recently-played items, newest first, ordered
   * by `(lastPlayedAt DESC, itemId ASC)`. Fetches `limit + 1` rows.
   */
  async findRecentlyPlayedPage(params: {
    userId: string;
    limit: number;
    afterKey?: CursorKey;
  }): Promise<RecentlyPlayedRow[]> {
    const { userId, limit, afterKey } = params;
    const afterDate = afterKey ? new Date(afterKey.sortOrder) : undefined;
    const rows = await getPrisma().mantraRecentlyPlayed.findMany({
      where: {
        userId,
        item: { isActive: true },
        ...(afterKey
          ? {
              OR: [
                { lastPlayedAt: { lt: afterDate } },
                {
                  AND: [
                    { lastPlayedAt: afterDate },
                    { itemId: { gt: afterKey.id } },
                  ],
                },
              ],
            }
          : {}),
      },
      orderBy: [{ lastPlayedAt: "desc" }, { itemId: "asc" }],
      take: limit + 1,
      select: { lastPlayedAt: true, item: { select: ITEM_SELECT } },
    });
    return rows.map((r) => ({
      ...toItemRow(r.item),
      lastPlayedAt: r.lastPlayedAt,
    }));
  }

  /** Whether the user has any recently-played history (drives hide-when-empty). */
  async hasRecentlyPlayed(userId: string): Promise<boolean> {
    const count = await getPrisma().mantraRecentlyPlayed.count({
      where: { userId, item: { isActive: true } },
    });
    return count > 0;
  }

  // ---- bounded playlist queries -------------------------------------------

  /** Full deity group for a deity slug, id-ordered (stable shuffle; bounded). */
  async findPlaylistByDeity(deitySlug: string): Promise<MantraRow[]> {
    const raws = await getPrisma().mantraAudioItem.findMany({
      where: { isActive: true, deitySlug },
      orderBy: [{ id: "asc" }],
      take: PLAYLIST_MAX,
      select: ITEM_SELECT,
    });
    return raws.map(toItemRow);
  }

  /** Full category group for a category id, id-ordered (stable shuffle; bounded). */
  async findPlaylistByCategory(categoryId: string): Promise<MantraRow[]> {
    const raws = await getPrisma().mantraAudioItem.findMany({
      where: { isActive: true, categoryTags: { some: { categoryId } } },
      orderBy: [{ id: "asc" }],
      take: PLAYLIST_MAX,
      select: ITEM_SELECT,
    });
    return raws.map(toItemRow);
  }

  /** Bounded ordered group for a non-recently-played sort (newest/default). */
  async findPlaylistBySort(
    sort: Exclude<MantraSortMode, "recent">
  ): Promise<MantraRow[]> {
    const clause = itemSortClause(sort);
    const raws = await getPrisma().mantraAudioItem.findMany({
      where: { isActive: true },
      orderBy: clause.orderBy,
      take: PLAYLIST_MAX,
      select: ITEM_SELECT,
    });
    return raws.map(toItemRow);
  }

  /** Bounded recently-played group for a user (newest first). */
  async findRecentlyPlayedPlaylist(userId: string): Promise<MantraRow[]> {
    const rows = await getPrisma().mantraRecentlyPlayed.findMany({
      where: { userId, item: { isActive: true } },
      orderBy: [{ lastPlayedAt: "desc" }, { itemId: "asc" }],
      take: PLAYLIST_MAX,
      select: { item: { select: ITEM_SELECT } },
    });
    return rows.map((r) => toItemRow(r.item));
  }

  // ---- writes -------------------------------------------------------------

  /**
   * Record a play: upsert the `(userId, itemId)` recently-played row (bump
   * `lastPlayedAt`, set progress, increment `completedCount`) AND increment the
   * item's local `playCount` — both in ONE transaction so "most played" ordering
   * and history never diverge. Returns the fresh play state.
   */
  async recordRecentlyPlayed(params: {
    userId: string;
    itemId: string;
    lastProgressSeconds?: number;
  }): Promise<{
    playCount: number;
    lastPlayedAt: Date;
    lastProgressSeconds: number | null;
  }> {
    const { userId, itemId, lastProgressSeconds } = params;
    const now = new Date();
    return getPrisma().$transaction(async (tx) => {
      const history = await tx.mantraRecentlyPlayed.upsert({
        where: { mantra_recently_played_unique: { userId, itemId } },
        create: {
          userId,
          itemId,
          lastPlayedAt: now,
          lastProgressSeconds: lastProgressSeconds ?? null,
          completedCount: 0,
        },
        update: {
          lastPlayedAt: now,
          ...(lastProgressSeconds !== undefined ? { lastProgressSeconds } : {}),
          completedCount: { increment: 1 },
        },
        select: { lastPlayedAt: true, lastProgressSeconds: true },
      });
      const item = await tx.mantraAudioItem.update({
        where: { id: itemId },
        data: { playCount: { increment: 1 } },
        select: { playCount: true },
      });
      return {
        playCount: item.playCount,
        lastPlayedAt: history.lastPlayedAt,
        lastProgressSeconds: history.lastProgressSeconds,
      };
    });
  }

  // ---- counter preference -------------------------------------------------

  /** The stored japa target for a user, or `null` when unset. */
  async getCounterPreference(userId: string): Promise<number | null> {
    const row = await getPrisma().mantraCounterPreference.findUnique({
      where: { userId },
      select: { lastSelectedRepeatTarget: true },
    });
    return row?.lastSelectedRepeatTarget ?? null;
  }

  /** Upsert the stored japa target for a user; returns the persisted value. */
  async setCounterPreference(
    userId: string,
    repeatTarget: number
  ): Promise<number> {
    const row = await getPrisma().mantraCounterPreference.upsert({
      where: { userId },
      create: { userId, lastSelectedRepeatTarget: repeatTarget },
      update: { lastSelectedRepeatTarget: repeatTarget },
      select: { lastSelectedRepeatTarget: true },
    });
    return row.lastSelectedRepeatTarget;
  }

  // =========================================================================
  // ADMIN write surface (TAM-92; mirrors the deity exemplar, TAM-88). Prisma
  // stays confined here; the admin service is Prisma-free. These methods do NOT
  // filter on `isActive` — an editor manages both active and deactivated rows
  // (the `isActive` filter is a query option). The precondition writes use
  // `updateMany`-with-`updatedAt` so a concurrent write matches 0 rows; the
  // SERVICE turns a 0 into 404-or-409 after an existence check.
  // =========================================================================

  // ---- categories ---------------------------------------------------------

  async findAdminCategoryPage(params: {
    page: number;
    pageSize: number;
    sort?: MantraCategorySortField;
    order: "asc" | "desc";
    q?: string;
    isActive?: boolean;
  }): Promise<{ items: AdminMantraCategoryView[]; total: number }> {
    const where: Prisma.MantraCategoryWhereInput = {
      ...(params.isActive !== undefined ? { isActive: params.isActive } : {}),
      ...(params.q
        ? {
            OR: [
              { slug: { contains: params.q, mode: "insensitive" } },
              { displayName: { contains: params.q, mode: "insensitive" } },
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      getPrisma().mantraCategory.findMany({
        where,
        orderBy: buildCategoryOrderBy(params.sort, params.order),
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
        select: ADMIN_CATEGORY_SELECT,
      }),
      getPrisma().mantraCategory.count({ where }),
    ]);
    return { items: rows.map(toAdminCategory), total };
  }

  async findAdminCategoryById(
    id: string
  ): Promise<AdminMantraCategoryDetailView | null> {
    const row = await getPrisma().mantraCategory.findUnique({
      where: { id },
      select: ADMIN_CATEGORY_DETAIL_SELECT,
    });
    return row ? toAdminCategoryDetail(row) : null;
  }

  async categoryExistsById(id: string): Promise<boolean> {
    const row = await getPrisma().mantraCategory.findUnique({
      where: { id },
      select: { id: true },
    });
    return row !== null;
  }

  /** The subset of `ids` that reference an existing category (tag validation). */
  async findExistingCategoryIds(ids: string[]): Promise<string[]> {
    if (ids.length === 0) return [];
    const rows = await getPrisma().mantraCategory.findMany({
      where: { id: { in: ids } },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }

  async createAdminCategory(
    input: AdminMantraCategoryCreateInput
  ): Promise<AdminMantraCategoryDetailView> {
    try {
      const row = await getPrisma().mantraCategory.create({
        data: {
          slug: input.slug,
          displayName: input.displayName,
          imageUrl: input.imageUrl,
          backgroundColorToken: input.backgroundColorToken,
          sortOrder: input.sortOrder,
          isActive: input.isActive,
          // TAM-110: seed the per-locale `displayName` overrides in the same
          // implicit transaction as the row.
          translations: {
            create: input.translations.map((t) => ({
              locale: t.locale,
              displayName: t.displayName,
            })),
          },
        },
        select: ADMIN_CATEGORY_DETAIL_SELECT,
      });
      return toAdminCategoryDetail(row);
    } catch (err) {
      throw mapSlugConflict(err, input.slug, "category");
    }
  }

  /**
   * TAM-110: precondition write + optional translation REPLACE-SET in ONE
   * `$transaction`. `translations === undefined` ⇒ the set is left untouched;
   * provided (incl. `[]`) ⇒ the whole set is deleted and re-created. The scalar
   * `updateMany` matching 0 rows short-circuits (stale/gone) BEFORE any
   * translation write — the SERVICE turns the 0 into 404-or-409.
   */
  async updateCategoryWithPrecondition(params: {
    id: string;
    expectedUpdatedAt: Date;
    data: AdminMantraCategoryUpdateInput;
    translations?: { locale: string; displayName: string }[];
  }): Promise<number> {
    const { id, expectedUpdatedAt, data, translations } = params;
    return getPrisma().$transaction(async (tx) => {
      const { count } = await tx.mantraCategory.updateMany({
        where: { id, updatedAt: expectedUpdatedAt },
        data,
      });
      if (count === 0) return 0;
      if (translations !== undefined) {
        await tx.mantraCategoryTranslation.deleteMany({
          where: { mantraCategoryId: id },
        });
        if (translations.length > 0)
          await tx.mantraCategoryTranslation.createMany({
            data: translations.map((t) => ({
              mantraCategoryId: id,
              locale: t.locale,
              displayName: t.displayName,
            })),
          });
      }
      return count;
    });
  }

  // ---- audio items --------------------------------------------------------

  async findAdminItemPage(params: {
    page: number;
    pageSize: number;
    sort?: MantraItemSortField;
    order: "asc" | "desc";
    q?: string;
    isActive?: boolean;
    type?: MantraItemType;
    categoryId?: string;
    deitySlug?: string;
    language?: string;
    isFeatured?: boolean;
  }): Promise<{ items: AdminMantraItemListView[]; total: number }> {
    const where: Prisma.MantraAudioItemWhereInput = {
      ...(params.isActive !== undefined ? { isActive: params.isActive } : {}),
      ...(params.type ? { type: params.type } : {}),
      ...(params.isFeatured !== undefined
        ? { isFeatured: params.isFeatured }
        : {}),
      ...(params.categoryId
        ? { categoryTags: { some: { categoryId: params.categoryId } } }
        : {}),
      // TAM-108: single-deity scalar filter (was the many-to-many join).
      ...(params.deitySlug ? { deitySlug: params.deitySlug } : {}),
      // TAM-108: LANGUAGE MEMBERSHIP filter (locale ∈ languages, OR empty = all).
      ...(params.language
        ? { AND: [languageMembership(params.language)] }
        : {}),
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
      getPrisma().mantraAudioItem.findMany({
        where,
        orderBy: buildItemOrderBy(params.sort, params.order),
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
        select: ADMIN_ITEM_LIST_SELECT,
      }),
      getPrisma().mantraAudioItem.count({ where }),
    ]);
    return { items: rows.map(toAdminItemList), total };
  }

  async findAdminItemById(
    id: string
  ): Promise<AdminMantraItemDetailView | null> {
    const row = await getPrisma().mantraAudioItem.findUnique({
      where: { id },
      select: ADMIN_ITEM_DETAIL_SELECT,
    });
    return row ? toAdminItemDetail(row) : null;
  }

  async itemExistsById(id: string): Promise<boolean> {
    const row = await getPrisma().mantraAudioItem.findUnique({
      where: { id },
      select: { id: true },
    });
    return row !== null;
  }

  /**
   * TAM-160: the subset of `ids` that reference an existing item (any active
   * state) — the curated-membership validation probe. An editor may curate a
   * temporarily deactivated item; only a NON-EXISTENT id is a 400.
   */
  async findExistingItemIds(ids: string[]): Promise<string[]> {
    if (ids.length === 0) return [];
    const rows = await getPrisma().mantraAudioItem.findMany({
      where: { id: { in: ids } },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }

  async createAdminItem(
    input: AdminMantraItemCreateInput
  ): Promise<AdminMantraItemDetailView> {
    try {
      const row = await getPrisma().mantraAudioItem.create({
        data: {
          slug: input.slug,
          title: input.title,
          type: input.type,
          artworkUrl: input.artworkUrl,
          audioUrl: input.audioUrl,
          singerName: input.singerName,
          composerName: input.composerName,
          // #EXPORT_CRITICAL — scripture stored verbatim (no trim/normalize).
          mantraText: input.mantraText,
          transliterationText: input.transliterationText,
          deitySlug: input.deitySlug,
          languages: input.languages,
          description: input.description,
          deepLinkUrl: input.deepLinkUrl,
          publishedAt: input.publishedAt,
          isFeatured: input.isFeatured,
          isActive: input.isActive,
        },
        select: ADMIN_ITEM_DETAIL_SELECT,
      });
      return toAdminItemDetail(row);
    } catch (err) {
      throw mapSlugConflict(err, input.slug, "item");
    }
  }

  async updateItemWithPrecondition(params: {
    id: string;
    expectedUpdatedAt: Date;
    data: AdminMantraItemUpdateInput;
  }): Promise<number> {
    const res = await getPrisma().mantraAudioItem.updateMany({
      where: { id: params.id, updatedAt: params.expectedUpdatedAt },
      data: params.data,
    });
    return res.count;
  }

  /**
   * Replace the whole category-tag set in one `$transaction` (delete-all then
   * re-create). `MantraCategoryTag` has a real FK with `onDelete: Cascade`, so a
   * removed tag is a genuine, correct delete of a join row.
   */
  async setItemCategoryTags(
    itemId: string,
    categoryIds: string[]
  ): Promise<void> {
    await getPrisma().$transaction([
      getPrisma().mantraCategoryTag.deleteMany({ where: { itemId } }),
      getPrisma().mantraCategoryTag.createMany({
        data: categoryIds.map((categoryId) => ({ itemId, categoryId })),
        skipDuplicates: true,
      }),
    ]);
  }

  // ---- homepage sections --------------------------------------------------

  async findAdminSectionPage(params: {
    page: number;
    pageSize: number;
    sort?: MantraSectionSortField;
    order: "asc" | "desc";
    q?: string;
    isActive?: boolean;
  }): Promise<{ items: AdminMantraSectionView[]; total: number }> {
    const where: Prisma.MantraHomepageSectionWhereInput = {
      ...(params.isActive !== undefined ? { isActive: params.isActive } : {}),
      ...(params.q
        ? {
            OR: [
              { title: { contains: params.q, mode: "insensitive" } },
              { sectionType: { contains: params.q, mode: "insensitive" } },
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      getPrisma().mantraHomepageSection.findMany({
        where,
        orderBy: buildSectionOrderBy(params.sort, params.order),
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
        select: ADMIN_SECTION_SELECT,
      }),
      getPrisma().mantraHomepageSection.count({ where }),
    ]);
    return { items: rows.map(toAdminSection), total };
  }

  async findAdminSectionById(
    id: string
  ): Promise<AdminMantraSectionDetailView | null> {
    const row = await getPrisma().mantraHomepageSection.findUnique({
      where: { id },
      select: ADMIN_SECTION_DETAIL_SELECT,
    });
    return row ? toAdminSectionDetail(row) : null;
  }

  async sectionExistsById(id: string): Promise<boolean> {
    const row = await getPrisma().mantraHomepageSection.findUnique({
      where: { id },
      select: { id: true },
    });
    return row !== null;
  }

  /** TAM-160: the section's `sectionType` (any active state), or `null` if unknown. */
  async findSectionTypeById(id: string): Promise<MantraSectionType | null> {
    const row = await getPrisma().mantraHomepageSection.findUnique({
      where: { id },
      select: { sectionType: true },
    });
    return row ? (row.sectionType as MantraSectionType) : null;
  }

  async createAdminSection(
    input: AdminMantraSectionCreateInput
  ): Promise<AdminMantraSectionDetailView> {
    try {
      const row = await getPrisma().mantraHomepageSection.create({
        data: {
          sectionType: input.sectionType,
          title: input.title,
          layoutType: input.layoutType,
          showAllEnabled: input.showAllEnabled,
          sortOrder: input.sortOrder,
          isActive: input.isActive,
          // TAM-110: seed the per-locale `title` overrides in the same implicit
          // transaction as the row.
          translations: {
            create: input.translations.map((t) => ({
              locale: t.locale,
              title: t.title,
            })),
          },
        },
        select: ADMIN_SECTION_DETAIL_SELECT,
      });
      return toAdminSectionDetail(row);
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        throw new AppError(
          `A homepage section of type "${input.sectionType}" already exists`,
          409,
          "SECTION_TYPE_CONFLICT"
        );
      }
      throw err;
    }
  }

  /**
   * TAM-110: precondition write + optional translation REPLACE-SET in ONE
   * `$transaction` (see `updateCategoryWithPrecondition`). `translations ===
   * undefined` ⇒ untouched; provided (incl. `[]`) ⇒ the whole set is replaced.
   */
  async updateSectionWithPrecondition(params: {
    id: string;
    expectedUpdatedAt: Date;
    data: AdminMantraSectionUpdateInput;
    translations?: { locale: string; title: string }[];
  }): Promise<number> {
    const { id, expectedUpdatedAt, data, translations } = params;
    return getPrisma().$transaction(async (tx) => {
      const { count } = await tx.mantraHomepageSection.updateMany({
        where: { id, updatedAt: expectedUpdatedAt },
        data,
      });
      if (count === 0) return 0;
      if (translations !== undefined) {
        await tx.mantraHomepageSectionTranslation.deleteMany({
          where: { mantraHomepageSectionId: id },
        });
        if (translations.length > 0)
          await tx.mantraHomepageSectionTranslation.createMany({
            data: translations.map((t) => ({
              mantraHomepageSectionId: id,
              locale: t.locale,
              title: t.title,
            })),
          });
      }
      return count;
    });
  }

  /**
   * TAM-160: REPLACE a curated section's membership with `itemIds` in array
   * order (`position` = index) in ONE `$transaction`. The join has real FKs
   * (`onDelete: Cascade`), so this is a genuine delete+insert of join rows.
   * Returns the persisted rows in `position` order. Mirrors
   * `WallpaperRepository.replaceRowItems`.
   */
  async replaceSectionItems(
    sectionId: string,
    itemIds: string[]
  ): Promise<AdminMantraSectionItemView[]> {
    return getPrisma().$transaction(async (tx) => {
      await tx.mantraHomepageSectionItem.deleteMany({ where: { sectionId } });
      if (itemIds.length > 0) {
        await tx.mantraHomepageSectionItem.createMany({
          data: itemIds.map((itemId, position) => ({
            sectionId,
            itemId,
            position,
          })),
        });
      }
      const rows = await tx.mantraHomepageSectionItem.findMany({
        where: { sectionId },
        orderBy: { position: "asc" },
        select: {
          itemId: true,
          position: true,
          item: { select: { title: true, artworkUrl: true } },
        },
      });
      return rows.map((r) => ({
        itemId: r.itemId,
        position: r.position,
        title: r.item.title,
        artworkUrl: r.item.artworkUrl,
      }));
    });
  }
}

// ---------------------------------------------------------------------------
// admin selects + row mappers (TAM-92) — kept out of the class body.
// ---------------------------------------------------------------------------

const ADMIN_CATEGORY_SELECT = {
  id: true,
  slug: true,
  displayName: true,
  imageUrl: true,
  backgroundColorToken: true,
  sortOrder: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;

/** TAM-110: the list select + ALL per-locale `displayName` overrides. */
const ADMIN_CATEGORY_DETAIL_SELECT = {
  ...ADMIN_CATEGORY_SELECT,
  translations: {
    select: { locale: true, displayName: true },
    orderBy: { locale: "asc" },
  },
} as const;

const ADMIN_ITEM_LIST_SELECT = {
  id: true,
  slug: true,
  title: true,
  type: true,
  artworkUrl: true,
  audioUrl: true,
  singerName: true,
  composerName: true,
  languages: true,
  publishedAt: true,
  playCount: true,
  isFeatured: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;

const ADMIN_ITEM_DETAIL_SELECT = {
  ...ADMIN_ITEM_LIST_SELECT,
  mantraText: true,
  transliterationText: true,
  description: true,
  deepLinkUrl: true,
  deitySlug: true,
  categoryTags: { select: { categoryId: true } },
} as const;

const ADMIN_SECTION_SELECT = {
  id: true,
  sectionType: true,
  title: true,
  layoutType: true,
  showAllEnabled: true,
  sortOrder: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;

/**
 * TAM-110: the list select + ALL per-locale `title` overrides. TAM-160: plus the
 * curated membership in saved `position` order (always empty for a built-in
 * section) so the admin items editor hydrates from the server.
 */
const ADMIN_SECTION_DETAIL_SELECT = {
  ...ADMIN_SECTION_SELECT,
  translations: {
    select: { locale: true, title: true },
    orderBy: { locale: "asc" },
  },
  items: {
    select: {
          itemId: true,
          position: true,
          item: { select: { title: true, artworkUrl: true } },
        },
    orderBy: { position: "asc" },
  },
} as const;

interface AdminCategoryRaw {
  id: string;
  slug: string;
  displayName: string;
  imageUrl: string | null;
  backgroundColorToken: string | null;
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

function toAdminCategory(row: AdminCategoryRaw): AdminMantraCategoryView {
  return {
    id: row.id,
    slug: row.slug,
    displayName: row.displayName,
    imageUrl: row.imageUrl,
    backgroundColorToken: row.backgroundColorToken,
    sortOrder: row.sortOrder,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

interface AdminCategoryDetailRaw extends AdminCategoryRaw {
  translations: { locale: string; displayName: string }[];
}

function toAdminCategoryDetail(
  row: AdminCategoryDetailRaw
): AdminMantraCategoryDetailView {
  return {
    ...toAdminCategory(row),
    translations: row.translations.map((t) => ({
      locale: t.locale,
      displayName: t.displayName,
    })),
  };
}

interface AdminItemListRaw {
  id: string;
  slug: string;
  title: string;
  type: string;
  artworkUrl: string;
  audioUrl: string;
  singerName: string | null;
  composerName: string | null;
  languages: string[];
  publishedAt: Date | null;
  playCount: number;
  isFeatured: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

function toAdminItemList(row: AdminItemListRaw): AdminMantraItemListView {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    // `type` is a TEXT column guarded to {mantra,stuti} at the Zod boundary.
    type: row.type as MantraItemType,
    artworkUrl: row.artworkUrl,
    audioUrl: row.audioUrl,
    singerName: row.singerName,
    composerName: row.composerName,
    languages: row.languages,
    publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null,
    playCount: row.playCount,
    isFeatured: row.isFeatured,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

interface AdminItemDetailRaw extends AdminItemListRaw {
  mantraText: string;
  transliterationText: string | null;
  description: string | null;
  deepLinkUrl: string | null;
  deitySlug: string | null;
  categoryTags: { categoryId: string }[];
}

function toAdminItemDetail(row: AdminItemDetailRaw): AdminMantraItemDetailView {
  return {
    ...toAdminItemList(row),
    // #EXPORT_CRITICAL — mantraText passed through verbatim.
    mantraText: row.mantraText,
    transliterationText: row.transliterationText,
    description: row.description,
    deepLinkUrl: row.deepLinkUrl,
    categoryIds: row.categoryTags.map((t) => t.categoryId),
    deitySlug: row.deitySlug,
  };
}

interface AdminSectionRaw {
  id: string;
  sectionType: string;
  title: string;
  layoutType: string;
  showAllEnabled: boolean;
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

function toAdminSection(row: AdminSectionRaw): AdminMantraSectionView {
  return {
    id: row.id,
    // TEXT columns guarded to their known sets at the Zod boundary.
    sectionType: row.sectionType as MantraSectionType,
    title: row.title,
    layoutType: row.layoutType as MantraLayoutType,
    showAllEnabled: row.showAllEnabled,
    sortOrder: row.sortOrder,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

interface AdminSectionDetailRaw extends AdminSectionRaw {
  translations: { locale: string; title: string }[];
  items: {
    itemId: string;
    position: number;
    item: { title: string; artworkUrl: string };
  }[];
}

function toAdminSectionDetail(
  row: AdminSectionDetailRaw
): AdminMantraSectionDetailView {
  return {
    ...toAdminSection(row),
    translations: row.translations.map((t) => ({
      locale: t.locale,
      title: t.title,
    })),
    items: row.items.map((i) => ({
      itemId: i.itemId,
      position: i.position,
      title: i.item.title,
      artworkUrl: i.item.artworkUrl,
    })),
  };
}

/** Map a Prisma unique-violation on `slug` to a 409, else rethrow. */
function mapSlugConflict(
  err: unknown,
  slug: string,
  kind: "category" | "item"
): unknown {
  if (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    err.code === "P2002"
  ) {
    return new AppError(
      `A mantra ${kind} with slug "${slug}" already exists`,
      409,
      "SLUG_CONFLICT"
    );
  }
  return err;
}

function buildCategoryOrderBy(
  sort: MantraCategorySortField | undefined,
  order: "asc" | "desc"
): Prisma.MantraCategoryOrderByWithRelationInput[] {
  switch (sort) {
    case undefined:
      return [{ sortOrder: "asc" }, { id: "asc" }];
    case "slug":
      return [{ slug: order }];
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

function buildItemOrderBy(
  sort: MantraItemSortField | undefined,
  order: "asc" | "desc"
): Prisma.MantraAudioItemOrderByWithRelationInput[] {
  switch (sort) {
    case undefined:
      // The manual item `sortOrder` column was dropped — default to
      // newest-created (stable via the `id` tiebreak).
      return [{ createdAt: "desc" }, { id: "asc" }];
    case "title":
      return [{ title: order }, { id: "asc" }];
    case "playCount":
      return [{ playCount: order }, { id: "asc" }];
    case "publishedAt":
      return [{ publishedAt: order }, { id: "asc" }];
    case "isActive":
      return [{ isActive: order }, { id: "asc" }];
    case "createdAt":
      return [{ createdAt: order }];
    case "updatedAt":
      return [{ updatedAt: order }];
  }
}

function buildSectionOrderBy(
  sort: MantraSectionSortField | undefined,
  order: "asc" | "desc"
): Prisma.MantraHomepageSectionOrderByWithRelationInput[] {
  switch (sort) {
    case undefined:
      return [{ sortOrder: "asc" }, { id: "asc" }];
    case "sectionType":
      return [{ sectionType: order }];
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
