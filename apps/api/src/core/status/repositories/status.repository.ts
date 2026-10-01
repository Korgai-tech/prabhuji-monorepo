import { Prisma } from "@prisma/client";
import { getPrisma } from "@api/shared/database";
import { AppError } from "@api/shared/errors";
import type {
  AdminStatusItemDetailView,
  AdminStatusItemPage,
  AdminStatusItemUpdateInput,
  AdminStatusItemView,
  OverlaySafeArea,
  StatusItemSortField,
  StatusMediaType,
  StatusProfileType,
} from "@api/core/status/types";

/**
 * Status module repository — the ONLY place `@prisma/client` is reached for this
 * module (arch-boundaries.json enforces it; the service stays Prisma-free).
 *
 * Owns: the CMS-curated feed query + keyset page (with the optional deity-slug
 * filter), item detail (for the like/view gate + cross-module preview), the
 * per-user overlay-profile read + upsert.
 * It does NOT touch the engagement / deity tables — those are other modules,
 * reached by the SERVICE via `performServiceCall`.
 *
 * KEYSET PAGINATION mirrors wallpaper/mantras: the feed orders by the stable
 * `id` key and fetches `limit + 1` rows so the service can tell whether a next
 * page exists. `id` ascends — a STABLE per-item shuffle now that the CMS
 * `sort_order` column has been dropped (`id` is the sole feed order).
 */

/** Raw status row — everything the service needs to build a feed card. */
export interface StatusRow {
  id: string;
  slug: string;
  title: string;
  mediaType: StatusMediaType;
  imageUrl: string | null;
  videoUrl: string | null;
  thumbnailUrl: string;
  overlaySafeArea: unknown;
  languages: string[];
  shareCaption: string | null;
  isActive: boolean;
  createdAt: Date;
  deitySlug: string | null;
}

/** Raw overlay-profile row (or `null` when the user has never saved one). */
export interface StatusProfileRow {
  activeProfileType: StatusProfileType;
  personalDisplayName: string | null;
  businessName: string | null;
  businessDetails: string | null;
  businessMobileNumber: string | null;
  avatarImageUrl: string | null;
  updatedAt: Date;
}

/** The fields a profile upsert writes (already Zod-validated at the route). */
export interface StatusProfileUpsertInput {
  activeProfileType: StatusProfileType;
  personalDisplayName?: string;
  businessName?: string;
  businessDetails?: string;
  businessMobileNumber?: string;
  avatarImageUrl?: string;
}

const STATUS_SELECT = {
  id: true,
  slug: true,
  title: true,
  mediaType: true,
  imageUrl: true,
  videoUrl: true,
  thumbnailUrl: true,
  overlaySafeArea: true,
  languages: true,
  shareCaption: true,
  isActive: true,
  createdAt: true,
  deitySlug: true,
} as const;

interface RawStatusRow {
  id: string;
  slug: string;
  title: string;
  mediaType: string;
  imageUrl: string | null;
  videoUrl: string | null;
  thumbnailUrl: string;
  overlaySafeArea: unknown;
  languages: string[];
  shareCaption: string | null;
  isActive: boolean;
  createdAt: Date;
  deitySlug: string | null;
}

function toRow(raw: RawStatusRow): StatusRow {
  return {
    id: raw.id,
    slug: raw.slug,
    title: raw.title,
    // `media_type` is a TEXT column guarded to {image,video} by the seed + Zod
    // boundary; the cast keeps the wire type precise without a runtime check.
    mediaType: raw.mediaType as StatusMediaType,
    imageUrl: raw.imageUrl,
    videoUrl: raw.videoUrl,
    thumbnailUrl: raw.thumbnailUrl,
    overlaySafeArea: raw.overlaySafeArea,
    languages: raw.languages,
    shareCaption: raw.shareCaption,
    isActive: raw.isActive,
    createdAt: raw.createdAt,
    deitySlug: raw.deitySlug,
  };
}

export class StatusRepository {
  /**
   * The active status catalogue (under the same deity/language filters as the
   * feed) as ROTATION candidates — the input for the twice-daily re-order
   * (TAM-150). No `take`: rotation slides a window over the whole ring.
   *
   * Read once per refresh epoch per filter combination, not per request.
   *
   * ponytail: whole-catalogue read, same bounded-catalogue assumption
   * `wallpaper.findAllActiveIds` makes. Push the hash into SQL if it grows.
   */
  async listRotationCandidates(params: {
    deitySlug?: string;
    locale?: string;
  }): Promise<{ id: string; createdAtMs: number }[]> {
    const { deitySlug, locale } = params;
    const rows = await getPrisma().statusItem.findMany({
      where: {
        isActive: true,
        ...(deitySlug ? { deitySlug } : {}),
        ...(locale
          ? { OR: [{ languages: { has: locale } }, { languages: { isEmpty: true } }] }
          : {}),
      },
      select: { id: true, createdAt: true },
    });
    return rows.map((r) => ({ id: r.id, createdAtMs: r.createdAt.getTime() }));
  }

  /**
   * Hydrate one slice of a rotation plan. Unordered by design — the plan owns
   * the order and the service restores it (`orderByPlan`). The `isActive` guard
   * stays so an item deactivated mid-epoch drops out of the page.
   */
  async findByIds(ids: string[]): Promise<StatusRow[]> {
    if (ids.length === 0) return [];
    const raws = await getPrisma().statusItem.findMany({
      where: { isActive: true, id: { in: ids } },
      select: STATUS_SELECT,
    });
    return raws.map(toRow);
  }

  /** One active status item by id (full row), or `null`. */
  async findById(id: string): Promise<StatusRow | null> {
    const raw = await getPrisma().statusItem.findFirst({
      where: { id, isActive: true },
      select: STATUS_SELECT,
    });
    return raw ? toRow(raw) : null;
  }

  /** Existence check for the write paths (avoids selecting the whole row). */
  async findGateById(id: string): Promise<{ id: string } | null> {
    return getPrisma().statusItem.findFirst({
      where: { id, isActive: true },
      select: { id: true },
    });
  }

  /** The user's overlay profile, or `null` if they have never saved one. */
  async findProfileByUserId(userId: string): Promise<StatusProfileRow | null> {
    const row = await getPrisma().userStatusProfile.findUnique({
      where: { userId },
      select: {
        activeProfileType: true,
        personalDisplayName: true,
        businessName: true,
        businessDetails: true,
        businessMobileNumber: true,
        avatarImageUrl: true,
        updatedAt: true,
      },
    });
    if (!row) return null;
    return {
      ...row,
      activeProfileType: row.activeProfileType as StatusProfileType,
    };
  }

  /**
   * Upsert the user's overlay profile. Only the fields present on `input` are
   * written (a persona save patches its own fields + flips `activeProfileType`);
   * undefined fields are left untouched on update.
   */
  async upsertProfile(
    userId: string,
    input: StatusProfileUpsertInput
  ): Promise<StatusProfileRow> {
    const data = {
      activeProfileType: input.activeProfileType,
      ...(input.personalDisplayName !== undefined
        ? { personalDisplayName: input.personalDisplayName }
        : {}),
      ...(input.businessName !== undefined
        ? { businessName: input.businessName }
        : {}),
      ...(input.businessDetails !== undefined
        ? { businessDetails: input.businessDetails }
        : {}),
      ...(input.businessMobileNumber !== undefined
        ? { businessMobileNumber: input.businessMobileNumber }
        : {}),
      ...(input.avatarImageUrl !== undefined
        ? { avatarImageUrl: input.avatarImageUrl }
        : {}),
    };
    const row = await getPrisma().userStatusProfile.upsert({
      where: { userId },
      update: data,
      create: { userId, ...data },
      select: {
        activeProfileType: true,
        personalDisplayName: true,
        businessName: true,
        businessDetails: true,
        businessMobileNumber: true,
        avatarImageUrl: true,
        updatedAt: true,
      },
    });
    return { ...row, activeProfileType: row.activeProfileType as StatusProfileType };
  }

  // =========================================================================
  // ADMIN write surface (TAM-98). Prisma stays confined here; the admin service
  // is Prisma-free. Unlike the public reads above, these methods do NOT filter
  // on `isActive` — an editor manages both active and deactivated rows (the
  // `isActive` filter is a query option). Mirrors the TAM-88/90/96 exemplars.
  // =========================================================================

  // ---- StatusItem ---------------------------------------------------------

  /** One OFFSET page of status items + the unpaginated `total` (ADR §C2). */
  async findAdminItemPage(params: {
    page: number;
    pageSize: number;
    sort?: StatusItemSortField;
    order: "asc" | "desc";
    q?: string;
    isActive?: boolean;
    mediaType?: StatusMediaType;
    deitySlug?: string;
    language?: string;
  }): Promise<AdminStatusItemPage> {
    const where: Prisma.StatusItemWhereInput = {
      ...(params.isActive !== undefined ? { isActive: params.isActive } : {}),
      ...(params.mediaType ? { mediaType: params.mediaType } : {}),
      // TAM-108: filter by language MEMBERSHIP of the `languages` set (not the
      // deprecated single `language ==` column).
      ...(params.language ? { languages: { has: params.language } } : {}),
      // TAM-108: single-deity direct column (not the `status_deity_tags` join).
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
      getPrisma().statusItem.findMany({
        where,
        orderBy: buildItemOrderBy(params.sort, params.order),
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
        select: ADMIN_ITEM_SELECT,
      }),
      getPrisma().statusItem.count({ where }),
    ]);
    return {
      items: rows.map(toAdminItem),
      total,
      page: params.page,
      pageSize: params.pageSize,
    };
  }

  /** Full status row + its resolved deity tag set by id, or `null`. */
  async findAdminItemById(
    id: string
  ): Promise<AdminStatusItemDetailView | null> {
    const row = await getPrisma().statusItem.findUnique({
      where: { id },
      select: ADMIN_ITEM_DETAIL_SELECT,
    });
    return row ? toAdminItemDetail(row) : null;
  }

  /** Cheap existence probe — backs the 404-vs-409 disambiguation (ADR §C3). */
  async itemExistsById(id: string): Promise<boolean> {
    const row = await getPrisma().statusItem.findUnique({
      where: { id },
      select: { id: true },
    });
    return row !== null;
  }

  /** Create a status item; a duplicate `slug` → 409 `SLUG_CONFLICT`, never a 500. */
  async createAdminItem(input: {
    slug: string;
    title: string;
    mediaType: StatusMediaType;
    deitySlug: string | null;
    imageUrl: string | null;
    videoUrl: string | null;
    thumbnailUrl: string;
    overlaySafeArea: OverlaySafeArea;
    languages: string[];
    shareCaption: string | null;
    isActive: boolean;
  }): Promise<AdminStatusItemDetailView> {
    try {
      const row = await getPrisma().statusItem.create({
        data: {
          slug: input.slug,
          title: input.title,
          mediaType: input.mediaType,
          deitySlug: input.deitySlug,
          imageUrl: input.imageUrl,
          videoUrl: input.videoUrl,
          thumbnailUrl: input.thumbnailUrl,
          overlaySafeArea: input.overlaySafeArea as unknown as Prisma.InputJsonValue,
          languages: input.languages,
          shareCaption: input.shareCaption,
          isActive: input.isActive,
        },
        select: ADMIN_ITEM_DETAIL_SELECT,
      });
      return toAdminItemDetail(row);
    } catch (err) {
      throw mapUniqueViolation(
        err,
        `A status item with slug "${input.slug}" already exists`
      );
    }
  }

  /** Optimistic-concurrency status-item write (ADR §C3). Returns the affected count. */
  async updateItemWithPrecondition(params: {
    id: string;
    expectedUpdatedAt: Date;
    data: AdminStatusItemUpdateInput;
  }): Promise<number> {
    const res = await getPrisma().statusItem.updateMany({
      where: { id: params.id, updatedAt: params.expectedUpdatedAt },
      data: toStatusItemWriteData(params.data),
    });
    return res.count;
  }

}

// ---------------------------------------------------------------------------
// admin selects + row mappers (kept out of the class body for readability)
// ---------------------------------------------------------------------------

/** Map a P2002 unique-constraint violation to a 409 `AppError`. */
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

/**
 * Map a partial admin StatusItem update to Prisma write data. `undefined`
 * fields are omitted (no change); an explicit `null` clears a nullable column.
 * `overlaySafeArea` is a required `Json` column — only ever replaced, never
 * cleared — so it is written directly as `InputJsonValue`.
 */
function toStatusItemWriteData(
  data: AdminStatusItemUpdateInput
): Prisma.StatusItemUpdateManyMutationInput {
  const out: Prisma.StatusItemUpdateManyMutationInput = {};
  if (data.title !== undefined) out.title = data.title;
  if (data.deitySlug !== undefined) out.deitySlug = data.deitySlug;
  if (data.imageUrl !== undefined) out.imageUrl = data.imageUrl;
  if (data.videoUrl !== undefined) out.videoUrl = data.videoUrl;
  if (data.thumbnailUrl !== undefined) out.thumbnailUrl = data.thumbnailUrl;
  if (data.overlaySafeArea !== undefined) {
    out.overlaySafeArea = data.overlaySafeArea as unknown as Prisma.InputJsonValue;
  }
  if (data.languages !== undefined) out.languages = data.languages;
  if (data.shareCaption !== undefined) out.shareCaption = data.shareCaption;
  if (data.isActive !== undefined) out.isActive = data.isActive;
  return out;
}

const ADMIN_ITEM_SELECT = {
  id: true,
  slug: true,
  title: true,
  mediaType: true,
  imageUrl: true,
  videoUrl: true,
  thumbnailUrl: true,
  overlaySafeArea: true,
  languages: true,
  shareCaption: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;

const ADMIN_ITEM_DETAIL_SELECT = {
  ...ADMIN_ITEM_SELECT,
  deitySlug: true,
} as const;

interface AdminItemRawRow {
  id: string;
  slug: string;
  title: string;
  mediaType: string;
  imageUrl: string | null;
  videoUrl: string | null;
  thumbnailUrl: string;
  overlaySafeArea: unknown;
  languages: string[];
  shareCaption: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

function toAdminItem(row: AdminItemRawRow): AdminStatusItemView {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    // `media_type` is guarded to {image,video} at the Zod boundary + seed; the
    // cast keeps the wire type precise without a runtime check.
    mediaType: row.mediaType as StatusMediaType,
    imageUrl: row.imageUrl,
    videoUrl: row.videoUrl,
    thumbnailUrl: row.thumbnailUrl,
    // Required `Json` column — pinned to `{top,bottom,left,right}` on write and
    // validated by the response schema on the way out.
    overlaySafeArea: row.overlaySafeArea as OverlaySafeArea,
    languages: row.languages,
    shareCaption: row.shareCaption,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toAdminItemDetail(
  row: AdminItemRawRow & { deitySlug: string | null }
): AdminStatusItemDetailView {
  return {
    ...toAdminItem(row),
    deitySlug: row.deitySlug,
  };
}



function buildItemOrderBy(
  sort: StatusItemSortField | undefined,
  order: "asc" | "desc"
): Prisma.StatusItemOrderByWithRelationInput[] {
  switch (sort) {
    // Default admin list order — newest first (the `sort_order` column is gone).
    case undefined:
      return [{ createdAt: "desc" }, { id: "asc" }];
    case "title":
      return [{ title: order }, { id: "asc" }];
    case "isActive":
      return [{ isActive: order }, { createdAt: "desc" }];
    case "createdAt":
      return [{ createdAt: order }];
    case "updatedAt":
      return [{ updatedAt: order }];
  }
}

