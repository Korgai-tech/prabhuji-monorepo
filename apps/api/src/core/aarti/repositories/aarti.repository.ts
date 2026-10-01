import { Prisma } from "@prisma/client";
import { getPrisma } from "@api/shared/database";
import { AppError } from "@api/shared/errors";
import type { CursorKey } from "@api/shared/pagination";
import type {
  AdminAudioCategoryDetailView,
  AdminAudioCategoryPage,
  AdminAudioCategoryUpdateInput,
  AdminAudioCategoryView,
  AdminAudioItemDetailView,
  AdminAudioItemPage,
  AdminAudioItemUpdateInput,
  AdminAudioItemView,
  AdminHomepageSectionDetailView,
  AdminHomepageSectionItemView,
  AdminHomepageSectionPage,
  AdminHomepageSectionUpdateInput,
  AdminHomepageSectionView,
  AartiSectionType,
  AartiSortMode,
  AudioCategorySortField,
  AudioItemSortField,
  HomepageSectionSortField,
} from "@api/core/aarti/types";

/**
 * Aarti module repository — the ONLY place `@prisma/client` is reached for this
 * module (arch-boundaries.json enforces it; the service stays Prisma-free).
 *
 * Owns audio queries (by category / deity / section / sort with keyset
 * pagination), the category list, and playback-history read/write. It does NOT
 * touch engagement / deity / subscription tables — those are other modules,
 * reached by the SERVICE via `performServiceCall`.
 *
 * KEYSET PAGINATION: the named sorts order by a stable `(value, id)` tuple where
 * `value` is the sort column projected to a number (`playCount`, or `publishedAt`
 * epoch-ms, or `lastPlayedAt` epoch-ms for recently-played). The `default` listing
 * is a stable pseudo-random order — it keys on the uuid `id` alone (id ASC), so it
 * needs no projected value. The repo fetches `limit + 1` rows so the service can
 * tell whether a next page exists; the direction (`asc` for `default`, `desc` for
 * the rest) matches the `<`/`>` keyset comparator built here from the incoming
 * `afterKey`.
 */

/** Raw audio row + its tag ids, for the service to gate + enrich. */
export interface AudioRow {
  id: string;
  title: string;
  coverImageUrl: string;
  audioStreamUrl: string;
  singerName: string | null;
  composerNames: string | null;
  /** TAM-108: language-availability set ([] = all languages); supersedes `language`. */
  languages: string[];
  description: string | null;
  publishedAt: Date | null;
  createdAt: Date;
  playCount: number;
  isFeatured: boolean;
  isPrabhujiOriginal: boolean;
  isActive: boolean;
  categoryIds: string[];
  /** TAM-108: single-deity logical ref to `deities.slug` (no DB FK), or null. */
  deitySlug: string | null;
  /**
   * TAM-160 curated-section keyset carrier: the `HomepageSectionItem.position`
   * this row was joined at, so the service's `curated` sort key can page by
   * `(position, id)`. Absent on every other read (mirrors `WallpaperRow.position`).
   */
  position?: number;
}

/** A requested-locale `HomepageSection` title override (TAM-109). */
export interface SectionTranslationRow {
  locale: string;
  title: string;
}

/** An active homepage section row (`GET /aarti/main` ordering). */
export interface SectionRow {
  /** TAM-160: rides through to the wire `sectionId` on every section. */
  id: string;
  sectionType: AartiSectionType;
  title: string;
  sortOrder: number;
  /** TAM-109: requested-locale `title` override rows (empty ⇒ base column wins). */
  translations: SectionTranslationRow[];
}

/** A recently-played audio row carries the caller's `lastPlayedAt`. */
export interface RecentlyPlayedRow extends AudioRow {
  lastPlayedAt: Date;
}

/** A requested-locale `AudioCategory` label override (TAM-109). */
export interface CategoryTranslationRow {
  locale: string;
  name: string;
  description: string | null;
}

export interface CategoryRow {
  id: string;
  slug: string;
  name: string;
  imageUrl: string | null;
  description: string | null;
  displayColor: string | null;
  sortOrder: number;
  /** TAM-109: requested-locale label override rows (empty ⇒ base columns win). */
  translations: CategoryTranslationRow[];
}

const AUDIO_SELECT = {
  id: true,
  title: true,
  coverImageUrl: true,
  audioStreamUrl: true,
  singerName: true,
  composerNames: true,
  deitySlug: true,
  languages: true,
  description: true,
  publishedAt: true,
  createdAt: true,
  playCount: true,
  isFeatured: true,
  isPrabhujiOriginal: true,
  isActive: true,
  categoryTags: { select: { categoryId: true } },
} as const;

interface RawAudioRow {
  id: string;
  title: string;
  coverImageUrl: string;
  audioStreamUrl: string;
  singerName: string | null;
  composerNames: string | null;
  deitySlug: string | null;
  languages: string[];
  description: string | null;
  publishedAt: Date | null;
  createdAt: Date;
  playCount: number;
  isFeatured: boolean;
  isPrabhujiOriginal: boolean;
  isActive: boolean;
  categoryTags: { categoryId: string }[];
}

function toAudioRow(raw: RawAudioRow): AudioRow {
  return {
    id: raw.id,
    title: raw.title,
    coverImageUrl: raw.coverImageUrl,
    audioStreamUrl: raw.audioStreamUrl,
    singerName: raw.singerName,
    composerNames: raw.composerNames,
    languages: raw.languages,
    description: raw.description,
    publishedAt: raw.publishedAt,
    createdAt: raw.createdAt,
    playCount: raw.playCount,
    isFeatured: raw.isFeatured,
    isPrabhujiOriginal: raw.isPrabhujiOriginal,
    isActive: raw.isActive,
    categoryIds: raw.categoryTags.map((t) => t.categoryId),
    deitySlug: raw.deitySlug,
  };
}

/**
 * TAM-108 language-membership filter: an item matches a requested `locale` when
 * its `languages` set is EMPTY (empty = available in all languages) OR contains
 * the locale. Absent locale → no language constraint. Returned as a Prisma
 * `where` fragment (spread into the query alongside the other filters).
 */
function languageMembershipWhere(locale?: string): object {
  if (!locale) return {};
  return { OR: [{ languages: { isEmpty: true } }, { languages: { has: locale } }] };
}

/**
 * TAM-109 label-localization filter: include ONLY the requested-locale override
 * row (the base column is the guaranteed fallback, so no fallback row is loaded).
 * When no locale is requested, match NO rows (`{ in: [] }`) so the read serves
 * the base column unchanged — mirrors the deity exemplar's locale-scoped include.
 */
function labelTranslationWhere(locale?: string): { locale: string | { in: string[] } } {
  return locale ? { locale } : { locale: { in: [] } };
}

/**
 * Build the keyset `WHERE` fragment + `orderBy` for a non-recently-played sort.
 * `default` is a stable pseudo-random order — it ascends on the uuid `id` alone,
 * so its keyset is just `id > afterKey.id` (no projected value). `most_played`
 * descends on `(playCount, id)`; `newest` descends on `(publishedAt, id)`. The
 * tiebreak `id` always ascends so a page boundary is deterministic.
 */
function audioSortClause(
  sort: Exclude<AartiSortMode, "recent">,
  afterKey?: CursorKey
): { where: object; orderBy: object[] } {
  if (sort === "default") {
    // Stable-shuffle listing: order by the uuid `id` only (TAM: the flat audios
    // list is no longer user-sortable). The cursor's numeric slot is unused here.
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

export class AartiRepository {
  /**
   * Active homepage sections, ordered by `(sortOrder, id)` (`/aarti/main`).
   * TAM-109: includes the requested-locale `title` override (if any) so the
   * service can localize; absent `locale` ⇒ no override rows ⇒ base column wins.
   */
  async findActiveSections(locale?: string): Promise<SectionRow[]> {
    const rows = await getPrisma().homepageSection.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      select: {
        // TAM-160: the wire `sectionId` + the key a `curated` section's items
        // are fetched by.
        id: true,
        sectionType: true,
        title: true,
        sortOrder: true,
        translations: {
          where: labelTranslationWhere(locale),
          select: { locale: true, title: true },
        },
      },
    });
    return rows as SectionRow[];
  }

  /**
   * Active categories ordered by `(sortOrder, id)` — backs Browse Categories.
   * TAM-109: includes the requested-locale label override (if any).
   */
  async findActiveCategories(locale?: string): Promise<CategoryRow[]> {
    return getPrisma().audioCategory.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      select: {
        id: true,
        slug: true,
        name: true,
        imageUrl: true,
        description: true,
        displayColor: true,
        sortOrder: true,
        translations: {
          where: labelTranslationWhere(locale),
          select: { locale: true, name: true, description: true },
        },
      },
    });
  }

  /**
   * Categories by id (detail tag resolution) — active or not, ordered by
   * sortOrder. TAM-109: includes the requested-locale label override (if any).
   */
  async findCategoriesByIds(ids: string[], locale?: string): Promise<CategoryRow[]> {
    if (ids.length === 0) return [];
    return getPrisma().audioCategory.findMany({
      where: { id: { in: ids } },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      select: {
        id: true,
        slug: true,
        name: true,
        imageUrl: true,
        description: true,
        displayColor: true,
        sortOrder: true,
        translations: {
          where: labelTranslationWhere(locale),
          select: { locale: true, name: true, description: true },
        },
      },
    });
  }

  /** One active audio by id (or `null`). */
  async findAudioById(id: string): Promise<AudioRow | null> {
    const raw = await getPrisma().audioItem.findFirst({
      where: { id, isActive: true },
      select: AUDIO_SELECT,
    });
    return raw ? toAudioRow(raw) : null;
  }

  /**
   * TAM-125 downloads: fetch the stored audio URL + the download metadata
   * columns (`sizeBytes`, `durationMs`, `checksum`) for one active row, or
   * `null` for an unknown or inactive row (same contract as `findAudioById`).
   *
   * Reads through the typed Prisma client; the columns are `BigInt? / Int? /
   * String?` and remain nullable at the DB while the backfill script
   * (`apps/api/src/core/downloads/scripts/backfill-download-metadata.ts`) is
   * still running against a catalogue. The SERVICE narrows `sizeBytes` from
   * `BigInt` to `number` with a safe-integer check before it reaches the wire.
   */
  async findDownloadSourceById(id: string): Promise<{
    audioStreamUrl: string;
    sizeBytes: bigint | null;
    durationMs: number | null;
    checksum: string | null;
  } | null> {
    const row = await getPrisma().audioItem.findFirst({
      where: { id, isActive: true },
      select: {
        audioStreamUrl: true,
        sizeBytes: true,
        durationMs: true,
        checksum: true,
      },
    });
    if (!row) return null;
    return {
      audioStreamUrl: row.audioStreamUrl,
      sizeBytes: row.sizeBytes,
      durationMs: row.durationMs,
      checksum: row.checksum,
    };
  }

  /** Existence probe for `/play` (avoids selecting the whole row). */
  async findAudioGateById(id: string): Promise<{ id: string } | null> {
    return getPrisma().audioItem.findFirst({
      where: { id, isActive: true },
      select: { id: true },
    });
  }

  /**
   * One keyset page of active audios for a non-recently-played sort, optionally
   * filtered to a single category or deity tag. Fetches `limit + 1` rows.
   */
  async findAudioPage(params: {
    sort: Exclude<AartiSortMode, "recent">;
    categoryId?: string;
    deitySlug?: string;
    /** TAM-108: language-membership filter locale ([]=all matches any locale). */
    locale?: string;
    limit: number;
    afterKey?: CursorKey;
  }): Promise<AudioRow[]> {
    const { sort, categoryId, deitySlug, locale, limit, afterKey } = params;
    const clause = audioSortClause(sort, afterKey);
    // The keyset clause and the language-membership filter each carry their own
    // top-level `OR`, so they are combined under `AND` (spreading both would
    // clobber one another's `OR` key).
    const and: object[] = [];
    if (Object.keys(clause.where).length > 0) and.push(clause.where);
    const langWhere = languageMembershipWhere(locale);
    if (Object.keys(langWhere).length > 0) and.push(langWhere);
    const raws = await getPrisma().audioItem.findMany({
      where: {
        isActive: true,
        ...(categoryId ? { categoryTags: { some: { categoryId } } } : {}),
        // TAM-108: deity is now a scalar column (single-deity model).
        ...(deitySlug ? { deitySlug } : {}),
        ...(and.length > 0 ? { AND: and } : {}),
      },
      orderBy: clause.orderBy,
      take: limit + 1,
      select: AUDIO_SELECT,
    });
    return raws.map(toAudioRow);
  }

  /**
   * One keyset page of the caller's recently-played audios, newest first,
   * ordered by `(lastPlayedAt DESC, audioId ASC)`. Fetches `limit + 1` rows.
   */
  async findRecentlyPlayedPage(params: {
    userId: string;
    limit: number;
    afterKey?: CursorKey;
  }): Promise<RecentlyPlayedRow[]> {
    const { userId, limit, afterKey } = params;
    const afterDate = afterKey ? new Date(afterKey.sortOrder) : undefined;
    const rows = await getPrisma().userPlaybackHistory.findMany({
      where: {
        userId,
        audio: { isActive: true },
        ...(afterKey
          ? {
              OR: [
                { lastPlayedAt: { lt: afterDate } },
                {
                  AND: [
                    { lastPlayedAt: afterDate },
                    { audioId: { gt: afterKey.id } },
                  ],
                },
              ],
            }
          : {}),
      },
      orderBy: [{ lastPlayedAt: "desc" }, { audioId: "asc" }],
      take: limit + 1,
      select: { lastPlayedAt: true, audio: { select: AUDIO_SELECT } },
    });
    return rows.map((r) => ({
      ...toAudioRow(r.audio),
      lastPlayedAt: r.lastPlayedAt,
    }));
  }

  /**
   * TAM-160: one keyset page of a `curated` section's items in the editor's
   * saved order (`(position, audioId)`). Fetches `limit + 1` rows. Inactive
   * audios are excluded (#EXPORT_CRITICAL — a deactivated aarti must not
   * reappear through a curated row) and the language-membership filter narrows
   * the joined audio — mirrors `findCustomRowItemsPage`. An unknown or
   * non-curated `sectionId` simply matches no join rows (an empty page, never a
   * 404/500).
   *
   * ONE method serves both surfaces: `/aarti/main`'s preview calls it with
   * `limit: SECTION_ITEM_LIMIT` and no cursor (and slices the over-fetch, like
   * every other section), Show-all pages it with a cursor.
   */
  async findSectionItemsPage(params: {
    sectionId: string;
    limit: number;
    afterKey?: CursorKey;
    locale?: string;
  }): Promise<AudioRow[]> {
    const { sectionId, limit, afterKey, locale } = params;
    const rows = await getPrisma().homepageSectionItem.findMany({
      where: {
        sectionId,
        audio: { isActive: true, ...languageMembershipWhere(locale) },
        ...(afterKey
          ? {
              OR: [
                { position: { gt: afterKey.sortOrder } },
                {
                  AND: [
                    { position: afterKey.sortOrder },
                    { audioId: { gt: afterKey.id } },
                  ],
                },
              ],
            }
          : {}),
      },
      orderBy: [{ position: "asc" }, { audioId: "asc" }],
      take: limit + 1,
      select: { position: true, audio: { select: AUDIO_SELECT } },
    });
    // Carry `position` onto the row so the shared `buildPage` can key off it
    // (see the service's `curated` sort key).
    return rows.map((r) => ({ ...toAudioRow(r.audio), position: r.position }));
  }

  /** Whether the user has any playback history (drives the hide-when-empty rule). */
  async hasPlaybackHistory(userId: string): Promise<boolean> {
    const count = await getPrisma().userPlaybackHistory.count({
      where: { userId, audio: { isActive: true } },
    });
    return count > 0;
  }

  /**
   * Record a play: upsert the `(userId, audioId)` history row (bump
   * `lastPlayedAt`, set position, increment `completedCount`) AND increment the
   * audio's local `playCount` — both in ONE transaction so "most played"
   * ordering and history never diverge. Returns the fresh play state.
   */
  async recordPlay(params: {
    userId: string;
    audioId: string;
    lastPositionSeconds?: number;
  }): Promise<{ playCount: number; lastPlayedAt: Date; lastPositionSeconds: number | null }> {
    const { userId, audioId, lastPositionSeconds } = params;
    const now = new Date();
    return getPrisma().$transaction(async (tx) => {
      const history = await tx.userPlaybackHistory.upsert({
        where: { user_playback_history_unique: { userId, audioId } },
        create: {
          userId,
          audioId,
          lastPlayedAt: now,
          lastPositionSeconds: lastPositionSeconds ?? null,
          completedCount: 0,
        },
        update: {
          lastPlayedAt: now,
          ...(lastPositionSeconds !== undefined ? { lastPositionSeconds } : {}),
          completedCount: { increment: 1 },
        },
        select: { lastPlayedAt: true, lastPositionSeconds: true },
      });
      const audio = await tx.audioItem.update({
        where: { id: audioId },
        data: { playCount: { increment: 1 } },
        select: { playCount: true },
      });
      return {
        playCount: audio.playCount,
        lastPlayedAt: history.lastPlayedAt,
        lastPositionSeconds: history.lastPositionSeconds,
      };
    });
  }

  // =========================================================================
  // ADMIN write surface (TAM-90). Prisma stays confined here; the admin service
  // is Prisma-free. Unlike the public reads above, these methods do NOT filter
  // on `isActive` — an editor manages both active and deactivated rows (the
  // `isActive` filter is a query option). Mirrors the TAM-88 deity exemplar.
  // =========================================================================

  // ---- AudioCategory ------------------------------------------------------

  /** One OFFSET page of categories + the unpaginated `total` (ADR §C2). */
  async findAdminCategoryPage(params: {
    page: number;
    pageSize: number;
    sort?: AudioCategorySortField;
    order: "asc" | "desc";
    q?: string;
    isActive?: boolean;
  }): Promise<AdminAudioCategoryPage> {
    const where: Prisma.AudioCategoryWhereInput = {
      ...(params.isActive !== undefined ? { isActive: params.isActive } : {}),
      ...(params.q
        ? {
            OR: [
              { slug: { contains: params.q, mode: "insensitive" } },
              { name: { contains: params.q, mode: "insensitive" } },
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      getPrisma().audioCategory.findMany({
        where,
        orderBy: buildCategoryOrderBy(params.sort, params.order),
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
        select: ADMIN_CATEGORY_SELECT,
      }),
      getPrisma().audioCategory.count({ where }),
    ]);
    return {
      items: rows.map(toAdminCategory),
      total,
      page: params.page,
      pageSize: params.pageSize,
    };
  }

  /** Full category row + ALL its translations by id, or `null`. */
  async findAdminCategoryById(
    id: string
  ): Promise<AdminAudioCategoryDetailView | null> {
    const row = await getPrisma().audioCategory.findUnique({
      where: { id },
      select: ADMIN_CATEGORY_DETAIL_SELECT,
    });
    return row ? toAdminCategoryDetail(row) : null;
  }

  /** Cheap existence probe — backs the 404-vs-409 disambiguation (ADR §C3). */
  async categoryExistsById(id: string): Promise<boolean> {
    const row = await getPrisma().audioCategory.findUnique({
      where: { id },
      select: { id: true },
    });
    return row !== null;
  }

  /**
   * Create a category and (optionally) its per-locale label overrides in one
   * implicit transaction (nested `create`; TAM-109). A duplicate `slug` → 409
   * `SLUG_CONFLICT`, never a 500.
   */
  async createAdminCategory(input: {
    slug: string;
    name: string;
    imageUrl: string | null;
    description: string | null;
    displayColor: string | null;
    sortOrder: number;
    isActive: boolean;
    translations: { locale: string; name: string; description: string | null }[];
  }): Promise<AdminAudioCategoryDetailView> {
    const { translations, ...scalars } = input;
    try {
      const row = await getPrisma().audioCategory.create({
        data: {
          ...scalars,
          translations: {
            create: translations.map((t) => ({
              locale: t.locale,
              name: t.name,
              description: t.description,
            })),
          },
        },
        select: ADMIN_CATEGORY_DETAIL_SELECT,
      });
      return toAdminCategoryDetail(row);
    } catch (err) {
      throw slugConflict(err, `A category with slug "${input.slug}" already exists`);
    }
  }

  /**
   * Optimistic-concurrency category write (ADR §C3). Returns the affected count.
   * TAM-109: when `translations` is provided, REPLACE the entire per-locale set
   * inside the same `$transaction` as the scalar write (undefined ⇒ untouched).
   */
  async updateCategoryWithPrecondition(params: {
    id: string;
    expectedUpdatedAt: Date;
    data: AdminAudioCategoryUpdateInput;
    translations?: {
      locale: string;
      name: string;
      description: string | null;
    }[];
  }): Promise<number> {
    const { id, expectedUpdatedAt, data, translations } = params;
    return getPrisma().$transaction(async (tx) => {
      const { count } = await tx.audioCategory.updateMany({
        where: { id, updatedAt: expectedUpdatedAt },
        data,
      });
      if (count === 0) return 0; // service disambiguates 404 vs 409
      if (translations !== undefined) {
        await tx.audioCategoryTranslation.deleteMany({
          where: { audioCategoryId: id },
        });
        if (translations.length > 0) {
          await tx.audioCategoryTranslation.createMany({
            data: translations.map((t) => ({
              audioCategoryId: id,
              locale: t.locale,
              name: t.name,
              description: t.description,
            })),
          });
        }
      }
      return count;
    });
  }

  /** Which of the given category ids exist — backs tag-set validation (400 on unknown). */
  async findExistingCategoryIds(ids: string[]): Promise<string[]> {
    if (ids.length === 0) return [];
    const rows = await getPrisma().audioCategory.findMany({
      where: { id: { in: ids } },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }

  // ---- AudioItem ----------------------------------------------------------

  /** One OFFSET page of audio items + the unpaginated `total` (ADR §C2). */
  async findAdminItemPage(params: {
    page: number;
    pageSize: number;
    sort?: AudioItemSortField;
    order: "asc" | "desc";
    q?: string;
    isActive?: boolean;
    categoryId?: string;
    deitySlug?: string;
    isFeatured?: boolean;
    isPrabhujiOriginal?: boolean;
  }): Promise<AdminAudioItemPage> {
    const where: Prisma.AudioItemWhereInput = {
      ...(params.isActive !== undefined ? { isActive: params.isActive } : {}),
      ...(params.isFeatured !== undefined
        ? { isFeatured: params.isFeatured }
        : {}),
      ...(params.isPrabhujiOriginal !== undefined
        ? { isPrabhujiOriginal: params.isPrabhujiOriginal }
        : {}),
      ...(params.categoryId
        ? { categoryTags: { some: { categoryId: params.categoryId } } }
        : {}),
      // TAM-108: deity is now a scalar column (single-deity model).
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
      getPrisma().audioItem.findMany({
        where,
        orderBy: buildItemOrderBy(params.sort, params.order),
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
        select: ADMIN_ITEM_SELECT,
      }),
      getPrisma().audioItem.count({ where }),
    ]);
    return {
      items: rows.map(toAdminItem),
      total,
      page: params.page,
      pageSize: params.pageSize,
    };
  }

  /** Full audio row + its resolved tag sets by id, or `null`. */
  async findAdminItemById(id: string): Promise<AdminAudioItemDetailView | null> {
    const row = await getPrisma().audioItem.findUnique({
      where: { id },
      select: ADMIN_ITEM_DETAIL_SELECT,
    });
    return row ? toAdminItemDetail(row) : null;
  }

  /** Cheap existence probe — backs the 404-vs-409 disambiguation (ADR §C3). */
  async itemExistsById(id: string): Promise<boolean> {
    const row = await getPrisma().audioItem.findUnique({
      where: { id },
      select: { id: true },
    });
    return row !== null;
  }

  /** Create an audio item; a duplicate `slug` → 409 `SLUG_CONFLICT`. */
  async createAdminItem(input: {
    slug: string;
    title: string;
    coverImageUrl: string;
    audioStreamUrl: string;
    singerName: string | null;
    composerNames: string | null;
    // TAM-108: single-deity + multi-language content model.
    deitySlug: string;
    languages: string[];
    description: string | null;
    publishedAt: Date | null;
    isFeatured: boolean;
    isPrabhujiOriginal: boolean;
    isActive: boolean;
  }): Promise<AdminAudioItemDetailView> {
    try {
      const row = await getPrisma().audioItem.create({
        data: input,
        select: ADMIN_ITEM_DETAIL_SELECT,
      });
      return toAdminItemDetail(row);
    } catch (err) {
      throw slugConflict(err, `An audio item with slug "${input.slug}" already exists`);
    }
  }

  /** Optimistic-concurrency audio-item write (ADR §C3). Returns the affected count. */
  async updateItemWithPrecondition(params: {
    id: string;
    expectedUpdatedAt: Date;
    data: AdminAudioItemUpdateInput;
  }): Promise<number> {
    const res = await getPrisma().audioItem.updateMany({
      where: { id: params.id, updatedAt: params.expectedUpdatedAt },
      data: params.data,
    });
    return res.count;
  }

  /**
   * Replace an item's category tag set in ONE `$transaction` (delete-all +
   * insert-all). `AudioCategoryTag` has a real FK with `onDelete: Cascade`, so
   * removing a tag is a genuine, correct delete of a join row (ADR §C4).
   */
  async setCategoryTags(audioId: string, categoryIds: string[]): Promise<void> {
    await getPrisma().$transaction(async (tx) => {
      await tx.audioCategoryTag.deleteMany({ where: { audioId } });
      if (categoryIds.length > 0) {
        await tx.audioCategoryTag.createMany({
          data: categoryIds.map((categoryId) => ({ audioId, categoryId })),
          skipDuplicates: true,
        });
      }
    });
  }

  // ---- HomepageSection ----------------------------------------------------

  /** One OFFSET page of sections + the unpaginated `total` (ADR §C2). */
  async findAdminSectionPage(params: {
    page: number;
    pageSize: number;
    sort?: HomepageSectionSortField;
    order: "asc" | "desc";
    q?: string;
    isActive?: boolean;
  }): Promise<AdminHomepageSectionPage> {
    const where: Prisma.HomepageSectionWhereInput = {
      ...(params.isActive !== undefined ? { isActive: params.isActive } : {}),
      ...(params.q
        ? {
            OR: [
              { sectionType: { contains: params.q, mode: "insensitive" } },
              { title: { contains: params.q, mode: "insensitive" } },
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      getPrisma().homepageSection.findMany({
        where,
        orderBy: buildSectionOrderBy(params.sort, params.order),
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
        select: ADMIN_SECTION_SELECT,
      }),
      getPrisma().homepageSection.count({ where }),
    ]);
    return {
      items: rows.map(toAdminSection),
      total,
      page: params.page,
      pageSize: params.pageSize,
    };
  }

  /** Full section row + ALL its translations by id, or `null`. */
  async findAdminSectionById(
    id: string
  ): Promise<AdminHomepageSectionDetailView | null> {
    const row = await getPrisma().homepageSection.findUnique({
      where: { id },
      select: ADMIN_SECTION_DETAIL_SELECT,
    });
    return row ? toAdminSectionDetail(row) : null;
  }

  /** Cheap existence probe — backs the 404-vs-409 disambiguation (ADR §C3). */
  async sectionExistsById(id: string): Promise<boolean> {
    const row = await getPrisma().homepageSection.findUnique({
      where: { id },
      select: { id: true },
    });
    return row !== null;
  }

  /** TAM-160: the section's `sectionType`, or `null` if the section is unknown. */
  async findSectionTypeById(id: string): Promise<AartiSectionType | null> {
    const row = await getPrisma().homepageSection.findUnique({
      where: { id },
      select: { sectionType: true },
    });
    return row ? (row.sectionType as AartiSectionType) : null;
  }

  /** The subset of `ids` that exist (any active state) — for item-set validation. */
  async findExistingAudioIds(ids: string[]): Promise<string[]> {
    if (ids.length === 0) return [];
    const rows = await getPrisma().audioItem.findMany({
      where: { id: { in: ids } },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }

  /**
   * TAM-160: REPLACE a curated section's items with `audioIds` in array order
   * (`position` = index) in ONE `$transaction`. The join has real FKs
   * (`onDelete: Cascade`), so this is a genuine delete+insert of join rows.
   * Mirrors `WallpaperRepository.replaceRowItems`.
   */
  async replaceSectionItems(
    sectionId: string,
    audioIds: string[]
  ): Promise<AdminHomepageSectionItemView[]> {
    return getPrisma().$transaction(async (tx) => {
      await tx.homepageSectionItem.deleteMany({ where: { sectionId } });
      if (audioIds.length > 0) {
        await tx.homepageSectionItem.createMany({
          data: audioIds.map((audioId, position) => ({
            sectionId,
            audioId,
            position,
          })),
        });
      }
      const rows = await tx.homepageSectionItem.findMany({
        where: { sectionId },
        orderBy: { position: "asc" },
        select: {
          audioId: true,
          position: true,
          audio: { select: { title: true, coverImageUrl: true } },
        },
      });
      return rows.map((r) => ({
        audioId: r.audioId,
        position: r.position,
        title: r.audio.title,
        coverImageUrl: r.audio.coverImageUrl,
      }));
    });
  }

  /**
   * Create a section. TAM-160: the one-row-per-type cap now lives in a PARTIAL
   * unique index (`WHERE section_type <> 'curated'`, hand-written in the
   * migration — Prisma cannot express it), so a second BUILT-IN type still
   * raises P2002 → 409 `SECTION_TYPE_CONFLICT` while many `curated` rows are
   * allowed. The invariant stays atomic in the DB; there is no service-level
   * `findFirst`-then-`create` race (#PATH_DECISION 1).
   */
  async createAdminSection(input: {
    sectionType: AartiSectionType;
    title: string;
    sortOrder: number;
    isActive: boolean;
    itemQuery: string | null;
    translations: { locale: string; title: string }[];
  }): Promise<AdminHomepageSectionDetailView> {
    const { translations, ...scalars } = input;
    try {
      const row = await getPrisma().homepageSection.create({
        data: {
          ...scalars,
          translations: {
            create: translations.map((t) => ({
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
          `A section of type "${input.sectionType}" already exists`,
          409,
          "SECTION_TYPE_CONFLICT"
        );
      }
      throw err;
    }
  }

  /**
   * Optimistic-concurrency section write (ADR §C3). Returns the affected count.
   * TAM-109: when `translations` is provided, REPLACE the entire per-locale set
   * inside the same `$transaction` as the scalar write (undefined ⇒ untouched).
   */
  async updateSectionWithPrecondition(params: {
    id: string;
    expectedUpdatedAt: Date;
    data: AdminHomepageSectionUpdateInput;
    translations?: { locale: string; title: string }[];
  }): Promise<number> {
    const { id, expectedUpdatedAt, data, translations } = params;
    return getPrisma().$transaction(async (tx) => {
      const { count } = await tx.homepageSection.updateMany({
        where: { id, updatedAt: expectedUpdatedAt },
        data,
      });
      if (count === 0) return 0; // service disambiguates 404 vs 409
      if (translations !== undefined) {
        await tx.homepageSectionTranslation.deleteMany({
          where: { homepageSectionId: id },
        });
        if (translations.length > 0) {
          await tx.homepageSectionTranslation.createMany({
            data: translations.map((t) => ({
              homepageSectionId: id,
              locale: t.locale,
              title: t.title,
            })),
          });
        }
      }
      return count;
    });
  }
}

// ---------------------------------------------------------------------------
// admin selects + row mappers (kept out of the class body for readability)
// ---------------------------------------------------------------------------

/** Map a P2002 unique-constraint violation to a 409 `SLUG_CONFLICT`. */
function slugConflict(err: unknown, message: string): unknown {
  if (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    err.code === "P2002"
  ) {
    return new AppError(message, 409, "SLUG_CONFLICT");
  }
  return err;
}

const ADMIN_CATEGORY_SELECT = {
  id: true,
  slug: true,
  name: true,
  imageUrl: true,
  description: true,
  displayColor: true,
  sortOrder: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;

interface AdminCategoryRawRow {
  id: string;
  slug: string;
  name: string;
  imageUrl: string | null;
  description: string | null;
  displayColor: string | null;
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

function toAdminCategory(row: AdminCategoryRawRow): AdminAudioCategoryView {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    imageUrl: row.imageUrl,
    description: row.description,
    displayColor: row.displayColor,
    sortOrder: row.sortOrder,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Detail select — the row plus ALL its per-locale label overrides (TAM-109). */
const ADMIN_CATEGORY_DETAIL_SELECT = {
  ...ADMIN_CATEGORY_SELECT,
  translations: {
    orderBy: { locale: "asc" },
    select: { locale: true, name: true, description: true },
  },
} as const;

function toAdminCategoryDetail(
  row: AdminCategoryRawRow & {
    translations: { locale: string; name: string; description: string | null }[];
  }
): AdminAudioCategoryDetailView {
  return {
    ...toAdminCategory(row),
    translations: row.translations.map((t) => ({
      locale: t.locale,
      name: t.name,
      description: t.description,
    })),
  };
}

const ADMIN_ITEM_SELECT = {
  id: true,
  slug: true,
  title: true,
  coverImageUrl: true,
  audioStreamUrl: true,
  singerName: true,
  composerNames: true,
  deitySlug: true,
  languages: true,
  description: true,
  publishedAt: true,
  playCount: true,
  isFeatured: true,
  isPrabhujiOriginal: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;

const ADMIN_ITEM_DETAIL_SELECT = {
  ...ADMIN_ITEM_SELECT,
  categoryTags: {
    select: { category: { select: { id: true, slug: true, name: true } } },
  },
} as const;

interface AdminItemRawRow {
  id: string;
  slug: string;
  title: string;
  coverImageUrl: string;
  audioStreamUrl: string;
  singerName: string | null;
  composerNames: string | null;
  deitySlug: string | null;
  languages: string[];
  description: string | null;
  publishedAt: Date | null;
  playCount: number;
  isFeatured: boolean;
  isPrabhujiOriginal: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

function toAdminItem(row: AdminItemRawRow): AdminAudioItemView {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    coverImageUrl: row.coverImageUrl,
    audioStreamUrl: row.audioStreamUrl,
    singerName: row.singerName,
    composerNames: row.composerNames,
    deitySlug: row.deitySlug,
    languages: row.languages,
    description: row.description,
    publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null,
    playCount: row.playCount,
    isFeatured: row.isFeatured,
    isPrabhujiOriginal: row.isPrabhujiOriginal,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toAdminItemDetail(
  row: AdminItemRawRow & {
    categoryTags: { category: { id: string; slug: string; name: string } }[];
  }
): AdminAudioItemDetailView {
  return {
    ...toAdminItem(row),
    categoryTags: row.categoryTags.map((t) => ({
      id: t.category.id,
      slug: t.category.slug,
      name: t.category.name,
    })),
  };
}

const ADMIN_SECTION_SELECT = {
  id: true,
  sectionType: true,
  title: true,
  sortOrder: true,
  isActive: true,
  itemQuery: true,
  createdAt: true,
  updatedAt: true,
} as const;

interface AdminSectionRawRow {
  id: string;
  sectionType: string;
  title: string;
  sortOrder: number;
  isActive: boolean;
  itemQuery: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function toAdminSection(row: AdminSectionRawRow): AdminHomepageSectionView {
  return {
    id: row.id,
    sectionType: row.sectionType,
    title: row.title,
    sortOrder: row.sortOrder,
    isActive: row.isActive,
    itemQuery: row.itemQuery,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Detail select — the row plus ALL its per-locale title overrides (TAM-109) and
 * its ordered curated membership (TAM-160; empty for a built-in section).
 */
const ADMIN_SECTION_DETAIL_SELECT = {
  ...ADMIN_SECTION_SELECT,
  translations: {
    orderBy: { locale: "asc" },
    select: { locale: true, title: true },
  },
  items: {
    orderBy: { position: "asc" },
    select: {
      audioId: true,
      position: true,
      audio: { select: { title: true, coverImageUrl: true } },
    },
  },
} as const;

function toAdminSectionDetail(
  row: AdminSectionRawRow & {
    translations: { locale: string; title: string }[];
    items: {
      audioId: string;
      position: number;
      audio: { title: string; coverImageUrl: string };
    }[];
  }
): AdminHomepageSectionDetailView {
  return {
    ...toAdminSection(row),
    translations: row.translations.map((t) => ({
      locale: t.locale,
      title: t.title,
    })),
    items: row.items.map((i) => ({
      audioId: i.audioId,
      position: i.position,
      title: i.audio.title,
      coverImageUrl: i.audio.coverImageUrl,
    })),
  };
}

function buildCategoryOrderBy(
  sort: AudioCategorySortField | undefined,
  order: "asc" | "desc"
): Prisma.AudioCategoryOrderByWithRelationInput[] {
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
  sort: AudioItemSortField | undefined,
  order: "asc" | "desc"
): Prisma.AudioItemOrderByWithRelationInput[] {
  switch (sort) {
    case undefined:
      // AudioItem has no `sortOrder` column (dropped); default to newest-first.
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
  sort: HomepageSectionSortField | undefined,
  order: "asc" | "desc"
): Prisma.HomepageSectionOrderByWithRelationInput[] {
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
