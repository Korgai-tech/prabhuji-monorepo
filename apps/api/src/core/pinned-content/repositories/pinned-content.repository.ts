import { Prisma, type PrismaClient } from "@prisma/client";
import { getPrisma } from "@api/shared/database";
import { AppError } from "@api/shared/errors";
import type {
  ActivePinnedId,
  PinSurface,
  PinnedContentActiveFilter,
  PinnedContentPage,
  PinnedContentView,
} from "@api/core/pinned-content/types";

/**
 * Prisma-facing pinned-content repository. The ONLY place `@prisma/client` is
 * reached for this module (arch-boundaries.json enforces it; the service stays
 * Prisma-free). Also owns the `P2002 → 409 pin_position_taken` translation, so
 * a caller never has to know a Prisma error type.
 */

/**
 * Prisma transaction client — a `Prisma.TransactionClient`. Broken out as a
 * type alias so the audit repo and the write methods share the same shape and
 * the service can pass one `tx` through both.
 */
export type PrismaTx = Prisma.TransactionClient;

const SELECT = {
  id: true,
  surface: true,
  deitySlug: true,
  contentId: true,
  pinPosition: true,
  startAt: true,
  endAt: true,
  createdAt: true,
  updatedAt: true,
  createdBy: true,
  updatedBy: true,
  deletedAt: true,
} as const;

/** Prisma row shape → wire-ready view. Timestamps → ISO strings. */
type RawRow = {
  id: string;
  surface: PinSurface;
  deitySlug: string | null;
  contentId: string;
  pinPosition: number;
  startAt: Date;
  endAt: Date;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  updatedBy: string;
  deletedAt: Date | null;
};

function toView(row: RawRow): PinnedContentView {
  return {
    id: row.id,
    surface: row.surface,
    deitySlug: row.deitySlug,
    contentId: row.contentId,
    pinPosition: row.pinPosition,
    startAt: row.startAt.toISOString(),
    endAt: row.endAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    deletedAt: row.deletedAt?.toISOString() ?? null,
  };
}

/** Insert / update payload; the service composes it, the repo persists it. */
export interface CreatePinInput {
  surface: PinSurface;
  deitySlug: string | null;
  contentId: string;
  pinPosition: number;
  startAt: Date;
  endAt: Date;
  createdBy: string;
}

export interface UpdatePinInput {
  contentId?: string;
  pinPosition?: number;
  startAt?: Date;
  endAt?: Date;
}

export class PinnedContentRepository {
  private db(tx?: PrismaTx): PrismaTx | PrismaClient {
    return tx ?? getPrisma();
  }

  /**
   * The write-side view — no `deletedAt IS NULL` filter, so the admin surface
   * sees deleted rows too (they render as `Deleted` in the CMS status column
   * with a Restore action).
   */
  async findById(
    id: string,
    tx?: PrismaTx
  ): Promise<PinnedContentView | null> {
    const row = await this.db(tx).pinnedContent.findUnique({
      where: { id },
      select: SELECT,
    });
    return row ? toView(row) : null;
  }

  /**
   * Admin list page + total (offset pagination, ADR §C2). `active` narrows to
   * one of the three temporal buckets; `any` returns every non-deleted pin.
   * Deleted rows are ALWAYS excluded from the list — a Restore action reaches
   * them via the audit trail's snapshot.
   */
  async listPage(params: {
    page: number;
    pageSize: number;
    surface?: PinSurface;
    deitySlug?: string;
    active: PinnedContentActiveFilter;
    now: Date;
  }): Promise<PinnedContentPage> {
    const { page, pageSize, surface, deitySlug, active, now } = params;
    const where: Prisma.PinnedContentWhereInput = {
      deletedAt: null,
      ...(surface ? { surface } : {}),
      ...(deitySlug ? { deitySlug } : {}),
      ...(active === "active"
        ? { startAt: { lte: now }, endAt: { gt: now } }
        : active === "scheduled"
        ? { startAt: { gt: now } }
        : active === "expired"
        ? { endAt: { lte: now } }
        : {}),
    };
    const [rows, total] = await Promise.all([
      getPrisma().pinnedContent.findMany({
        where,
        select: SELECT,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      getPrisma().pinnedContent.count({ where }),
    ]);
    return { items: rows.map(toView), total, page, pageSize };
  }

  /**
   * Read-path — the `IPinnedContentApi.getActivePinnedIds` implementation.
   * Uses `IS NOT DISTINCT FROM` semantics on `deity_slug` so a NULL match is
   * a real NULL match (not the default "NULL ≠ NULL" behaviour), because
   * `home` and `status_all_gods` pins have a real NULL `deity_slug`.
   */
  async findActive(params: {
    surface: PinSurface;
    deitySlug: string | null;
    at: Date;
  }): Promise<ActivePinnedId[]> {
    const { surface, deitySlug, at } = params;
    const rows = await getPrisma().pinnedContent.findMany({
      where: {
        surface,
        deitySlug,
        deletedAt: null,
        startAt: { lte: at },
        endAt: { gt: at },
      },
      select: {
        id: true,
        contentId: true,
        pinPosition: true,
      },
      orderBy: [{ pinPosition: "asc" }, { id: "asc" }],
    });
    return rows.map((r) => ({
      id: r.id,
      contentId: r.contentId,
      pinPosition: r.pinPosition,
    }));
  }

  async create(
    input: CreatePinInput,
    tx?: PrismaTx
  ): Promise<PinnedContentView> {
    try {
      const row = await this.db(tx).pinnedContent.create({
        data: {
          surface: input.surface,
          deitySlug: input.deitySlug,
          contentId: input.contentId,
          pinPosition: input.pinPosition,
          startAt: input.startAt,
          endAt: input.endAt,
          createdBy: input.createdBy,
          updatedBy: input.createdBy,
        },
        select: SELECT,
      });
      return toView(row);
    } catch (err) {
      throw mapPositionConflict(err);
    }
  }

  /**
   * Update a live pin under the `updatedAt` precondition. Returns the updated
   * view; a 0-count Prisma `updateMany` (someone wrote first) or a missing row
   * is `null` so the service can lift it to a 404-or-409 disambiguation.
   */
  async updateWithPrecondition(params: {
    id: string;
    expectedUpdatedAt: Date;
    data: UpdatePinInput;
    updatedBy: string;
    tx?: PrismaTx;
  }): Promise<PinnedContentView | null> {
    const { id, expectedUpdatedAt, data, updatedBy, tx } = params;
    try {
      const res = await this.db(tx).pinnedContent.updateMany({
        where: {
          id,
          updatedAt: expectedUpdatedAt,
          deletedAt: null,
        },
        data: { ...data, updatedBy },
      });
      if (res.count === 0) return null;
      return this.findById(id, tx);
    } catch (err) {
      throw mapPositionConflict(err);
    }
  }

  /**
   * Soft-delete under precondition. Sets `deleted_at = now()` (via server-side
   * `NOW()` — passed in as `now` so integration tests inject a stable clock).
   */
  async softDeleteWithPrecondition(params: {
    id: string;
    expectedUpdatedAt: Date;
    now: Date;
    deletedBy: string;
    tx?: PrismaTx;
  }): Promise<PinnedContentView | null> {
    const { id, expectedUpdatedAt, now, deletedBy, tx } = params;
    const res = await this.db(tx).pinnedContent.updateMany({
      where: {
        id,
        updatedAt: expectedUpdatedAt,
        deletedAt: null,
      },
      data: { deletedAt: now, updatedBy: deletedBy },
    });
    if (res.count === 0) return null;
    return this.findById(id, tx);
  }

  /**
   * Restore a soft-deleted pin under precondition — clears `deleted_at`. May
   * conflict with the partial-unique index if another pin has taken the
   * position in the meantime; that's a P2002 that maps to 409
   * `pin_position_taken` here too.
   */
  async restoreWithPrecondition(params: {
    id: string;
    expectedUpdatedAt: Date;
    updatedBy: string;
    tx?: PrismaTx;
  }): Promise<PinnedContentView | null> {
    const { id, expectedUpdatedAt, updatedBy, tx } = params;
    try {
      const res = await this.db(tx).pinnedContent.updateMany({
        where: {
          id,
          updatedAt: expectedUpdatedAt,
          deletedAt: { not: null },
        },
        data: { deletedAt: null, updatedBy },
      });
      if (res.count === 0) return null;
      return this.findById(id, tx);
    } catch (err) {
      throw mapPositionConflict(err);
    }
  }
}

/**
 * Translate a partial-unique-index violation to the caller's 409 shape. The
 * one index that can fail here is `pinned_content_position_uq`; any other
 * P2002 is bubbled up as-is (there are none in this schema, but the guard is
 * cheap and future-proofs against a new unique).
 */
function mapPositionConflict(err: unknown): unknown {
  if (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    err.code === "P2002"
  ) {
    const meta = err.meta as
      | { target?: string[] | string; constraint?: string }
      | undefined;
    const targetArr = Array.isArray(meta?.target)
      ? meta?.target
      : typeof meta?.target === "string"
      ? [meta?.target]
      : undefined;
    const constraint = meta?.constraint;
    const isPositionIndex =
      constraint === "pinned_content_position_uq" ||
      targetArr?.includes("pin_position") ||
      targetArr?.includes("pinned_content_position_uq");
    if (isPositionIndex !== false) {
      return new AppError(
        "pin position taken for this surface",
        409,
        "pin_position_taken"
      );
    }
  }
  return err;
}
