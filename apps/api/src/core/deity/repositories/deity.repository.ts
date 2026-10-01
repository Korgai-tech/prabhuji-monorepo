import { Prisma } from "@prisma/client";
import { getPrisma } from "@api/shared/database";
import { AppError } from "@api/shared/errors";
import type { CursorKey } from "@api/shared/pagination";
import {
  DEFAULT_DEITY_LOCALE,
  type AdminDeityDetailView,
  type AdminDeityListItemView,
  type AdminDeityUpdateInput,
  type DeitySortField,
  type DeitySummary,
} from "@api/core/deity/types";

/**
 * Deity module repository — the ONLY place `@prisma/client` is reached for this
 * module (arch-boundaries.json enforces it; the service stays Prisma-free).
 *
 * Reads are localized by including translations for BOTH the requested locale
 * and the `en` fallback (the deity translation table is tiny) — the service
 * picks the best available displayName. Ordering is the stable `(sortOrder,
 * id)` keyset so cursor pagination never skips/duplicates a row.
 */

/** A translation row projection (requested-locale + fallback candidates). */
export interface DeityTranslationRow {
  locale: string;
  displayName: string;
}

/** Raw deity row + its candidate translations, for the service to localize. */
export interface DeityRow {
  id: string;
  slug: string;
  iconUrl: string;
  sortOrder: number;
  active: boolean;
  translations: DeityTranslationRow[];
}

const TRANSLATION_SELECT = {
  select: { locale: true, displayName: true },
} as const;

function localeFilter(locale: string): { locale: { in: string[] } } {
  // De-dupe when the requested locale IS the fallback.
  const locales =
    locale === DEFAULT_DEITY_LOCALE ? [locale] : [locale, DEFAULT_DEITY_LOCALE];
  return { locale: { in: locales } };
}

export class DeityRepository {
  /**
   * All active deities (no pagination), ordered by `(sortOrder, id)`, with the
   * requested + fallback locale translations. Backs the facade's
   * `getActiveDeities` — module services want the full taxonomy in one call.
   */
  async findAllActive(locale: string): Promise<DeityRow[]> {
    return getPrisma().deity.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      include: {
        translations: { where: localeFilter(locale), ...TRANSLATION_SELECT },
      },
    });
  }

  /**
   * One page of active deities after `afterKey` (exclusive), ordered by the
   * stable `(sortOrder, id)` keyset. Fetches `limit + 1` rows so the service
   * can tell whether a next page exists. Backs the paginated `GET /deities`.
   */
  async findActivePage(params: {
    locale: string;
    limit: number;
    afterKey?: CursorKey;
  }): Promise<DeityRow[]> {
    const { locale, limit, afterKey } = params;
    return getPrisma().deity.findMany({
      where: {
        active: true,
        ...(afterKey
          ? {
              // (sortOrder, id) > (afterKey.sortOrder, afterKey.id)
              OR: [
                { sortOrder: { gt: afterKey.sortOrder } },
                {
                  AND: [
                    { sortOrder: afterKey.sortOrder },
                    { id: { gt: afterKey.id } },
                  ],
                },
              ],
            }
          : {}),
      },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      take: limit + 1,
      include: {
        translations: { where: localeFilter(locale), ...TRANSLATION_SELECT },
      },
    });
  }

  /**
   * The ACTIVE deities matching `slugs`, localized (TAM-175).
   *
   * Backs the chip row's "your gods first" hoist. Returned in the SAME
   * `(sortOrder, id)` order as every other listing — the caller re-orders into
   * preference order, because which of the two comes first is a product rule,
   * not a storage one.
   *
   * A slug that is unknown or deactivated simply does not come back. That is the
   * intended behaviour rather than an error: a preference derived from the
   * warehouse can name a god the CMS has since retired, and the chip row must
   * carry on without it.
   */
  async findActiveBySlugs(slugs: string[], locale: string): Promise<DeityRow[]> {
    if (slugs.length === 0) return [];
    return getPrisma().deity.findMany({
      where: { active: true, slug: { in: slugs } },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      include: {
        translations: { where: localeFilter(locale), ...TRANSLATION_SELECT },
      },
    });
  }

  /**
   * Locale-independent summary by slug — the facade's deity-tag validation
   * hook. Returns `null` for an unknown slug (active or not; the caller decides
   * whether inactive is acceptable).
   */
  async findBySlug(slug: string): Promise<DeitySummary | null> {
    const row = await getPrisma().deity.findUnique({
      where: { slug },
      select: {
        id: true,
        slug: true,
        iconUrl: true,
        sortOrder: true,
        active: true,
      },
    });
    return row;
  }

  // =========================================================================
  // ADMIN write surface (TAM-88). Prisma stays confined here; the admin service
  // is Prisma-free. These methods do NOT filter on `active` — an editor manages
  // both active and deactivated rows (the `active` filter is a query option).
  // =========================================================================

  /**
   * One OFFSET page of deities + the unpaginated `total` (a second `COUNT` in
   * the same call — accepted, ADR §C2; the deity table is tiny). `q` matches
   * `slug` OR any translation `displayName`, case-insensitively. `sort` is the
   * already-validated enum; absent → the natural `(sortOrder, id)` order.
   */
  async findAdminPage(params: {
    page: number;
    pageSize: number;
    sort?: DeitySortField;
    order: "asc" | "desc";
    q?: string;
    active?: boolean;
  }): Promise<{ items: AdminDeityListItemView[]; total: number }> {
    const where: Prisma.DeityWhereInput = {
      ...(params.active !== undefined ? { active: params.active } : {}),
      ...(params.q
        ? {
            OR: [
              { slug: { contains: params.q, mode: "insensitive" } },
              {
                translations: {
                  some: {
                    displayName: { contains: params.q, mode: "insensitive" },
                  },
                },
              },
            ],
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      getPrisma().deity.findMany({
        where,
        orderBy: buildAdminOrderBy(params.sort, params.order),
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
        select: ADMIN_ROW_SELECT,
      }),
      getPrisma().deity.count({ where }),
    ]);

    return { items: rows.map(toAdminListItem), total };
  }

  /** Full row + ALL translations by id, or `null` if it does not exist. */
  async findAdminById(id: string): Promise<AdminDeityDetailView | null> {
    const row = await getPrisma().deity.findUnique({
      where: { id },
      select: { ...ADMIN_ROW_SELECT, translations: ADMIN_TRANSLATION_SELECT },
    });
    return row ? toAdminDetail(row) : null;
  }

  /** Cheap existence probe — backs the 404-vs-409 disambiguation (ADR §C3). */
  async existsById(id: string): Promise<boolean> {
    const row = await getPrisma().deity.findUnique({
      where: { id },
      select: { id: true },
    });
    return row !== null;
  }

  /**
   * Create a deity and (optionally) its translations in one implicit
   * transaction (nested `create`). A duplicate `slug` surfaces as a **409
   * `SLUG_CONFLICT`**, never a 500 — the unique constraint is caught here.
   */
  async createAdmin(input: {
    slug: string;
    iconUrl: string;
    sortOrder: number;
    active: boolean;
    translations: { locale: string; displayName: string }[];
  }): Promise<AdminDeityDetailView> {
    try {
      const row = await getPrisma().deity.create({
        data: {
          slug: input.slug,
          iconUrl: input.iconUrl,
          sortOrder: input.sortOrder,
          active: input.active,
          translations: {
            create: input.translations.map((t) => ({
              locale: t.locale,
              displayName: t.displayName,
            })),
          },
        },
        select: { ...ADMIN_ROW_SELECT, translations: ADMIN_TRANSLATION_SELECT },
      });
      return toAdminDetail(row);
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        throw new AppError(
          `A deity with slug "${input.slug}" already exists`,
          409,
          "SLUG_CONFLICT"
        );
      }
      throw err;
    }
  }

  /**
   * Optimistic-concurrency write (ADR §C3): the client's last-known `updatedAt`
   * is in the `WHERE`, so a concurrent write makes this match 0 rows. Returns
   * the affected count; the SERVICE turns a 0 into 404-or-409 after an existence
   * check (a 0 is ambiguous between "stale" and "gone"). Deactivation is just
   * this method with `{ active: false }`.
   */
  async updateWithPrecondition(params: {
    id: string;
    expectedUpdatedAt: Date;
    data: AdminDeityUpdateInput;
    /** Omitted ⇒ translations untouched; provided (incl. `[]`) ⇒ replace the set. */
    translations?: { locale: string; displayName: string }[];
  }): Promise<number> {
    return getPrisma().$transaction(async (tx) => {
      const res = await tx.deity.updateMany({
        where: { id: params.id, updatedAt: params.expectedUpdatedAt },
        data: params.data,
      });
      if (res.count === 0) return 0; // stale-or-gone; the service disambiguates
      if (params.translations !== undefined) {
        await tx.deityTranslation.deleteMany({ where: { deityId: params.id } });
        if (params.translations.length > 0) {
          await tx.deityTranslation.createMany({
            data: params.translations.map((t) => ({
              deityId: params.id,
              locale: t.locale,
              displayName: t.displayName,
            })),
          });
        }
      }
      return res.count;
    });
  }
}

// ---------------------------------------------------------------------------
// admin selects + row mappers (kept out of the class body for readability)
// ---------------------------------------------------------------------------

const ADMIN_ROW_SELECT = {
  id: true,
  slug: true,
  iconUrl: true,
  sortOrder: true,
  active: true,
  createdAt: true,
  updatedAt: true,
} as const;

const ADMIN_TRANSLATION_SELECT = {
  select: { locale: true, displayName: true },
  orderBy: { locale: "asc" },
} as const;

interface AdminRawRow {
  id: string;
  slug: string;
  iconUrl: string;
  sortOrder: number;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

function toAdminListItem(row: AdminRawRow): AdminDeityListItemView {
  return {
    id: row.id,
    slug: row.slug,
    iconUrl: row.iconUrl,
    sortOrder: row.sortOrder,
    active: row.active,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toAdminDetail(
  row: AdminRawRow & { translations: { locale: string; displayName: string }[] }
): AdminDeityDetailView {
  return {
    ...toAdminListItem(row),
    translations: row.translations.map((t) => ({
      locale: t.locale,
      displayName: t.displayName,
    })),
  };
}

function buildAdminOrderBy(
  sort: DeitySortField | undefined,
  order: "asc" | "desc"
): Prisma.DeityOrderByWithRelationInput[] {
  switch (sort) {
    case undefined:
      // Natural admin order = the public listing order; stable id tiebreak.
      return [{ sortOrder: "asc" }, { id: "asc" }];
    case "slug":
      return [{ slug: order }];
    case "sortOrder":
      return [{ sortOrder: order }, { id: "asc" }];
    case "active":
      return [{ active: order }, { sortOrder: "asc" }];
    case "createdAt":
      return [{ createdAt: order }];
    case "updatedAt":
      return [{ updatedAt: order }];
  }
}
