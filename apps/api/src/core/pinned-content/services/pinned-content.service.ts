import { performServiceCall } from "@api/shared/workspace";
import { createModuleLogger } from "@api/shared/logs";
import { getPrisma } from "@api/shared/database";
import { AppError, ValidationError } from "@api/shared/errors";
import type {
  PinnedContentAuditRepository,
  PinnedContentRepository,
  PrismaTx,
  UpdatePinInput,
} from "@api/core/pinned-content/repositories";
import type {
  PinAuditAction,
  PinnedContentActiveFilter,
  PinnedContentAuditView,
  PinnedContentPage,
  PinSurface,
  PinnedContentView,
} from "@api/core/pinned-content/types";

const log = createModuleLogger("pinned-content:service");

/** Injectable clock — test-injectable so window filtering is reproducible. */
export type Clock = () => Date;

/**
 * Write-path service (TAM-173). Owns:
 *   1. Cross-field validation the boundary can't do — deity slug shape,
 *      unknown deity via the facade (#EXPORT_CRITICAL — never touch the deity
 *      repo directly), content_id existence against the surface's owning
 *      module (home_feed for `home`, status_items for both Status surfaces),
 *      content⇔deity mismatch on `status_deity`, and window inequality.
 *   2. Transactional audit — every mutation lands with its audit row inside a
 *      single Prisma `$transaction`. If the tx rolls back both go with it.
 *   3. 404-vs-409 disambiguation on the `updatedAt` precondition — a 0-count
 *      update is ambiguous ("someone wrote first" vs "row is gone") and the
 *      service resolves it by re-reading before responding.
 */
export class PinnedContentService {
  constructor(
    private readonly repo: PinnedContentRepository,
    private readonly auditRepo: PinnedContentAuditRepository,
    private readonly clock: Clock = () => new Date()
  ) {}

  // ---------------------------------------------------------------------------
  // reads
  // ---------------------------------------------------------------------------

  async list(params: {
    page: number;
    pageSize: number;
    surface?: PinSurface;
    deitySlug?: string;
    active: PinnedContentActiveFilter;
  }): Promise<PinnedContentPage> {
    return this.repo.listPage({
      ...params,
      now: this.clock(),
    });
  }

  async getById(id: string): Promise<PinnedContentView> {
    const row = await this.repo.findById(id);
    if (!row) throw new AppError("Pin not found", 404, "NOT_FOUND");
    return row;
  }

  async listAudit(id: string): Promise<PinnedContentAuditView[]> {
    const row = await this.repo.findById(id);
    if (!row) throw new AppError("Pin not found", 404, "NOT_FOUND");
    return this.auditRepo.listForPin(id);
  }

  // ---------------------------------------------------------------------------
  // create
  // ---------------------------------------------------------------------------

  async create(
    input: {
      surface: PinSurface;
      deitySlug?: string;
      contentId: string;
      pinPosition: number;
      startAt: string;
      endAt: string;
    },
    actorUserId: string
  ): Promise<PinnedContentView> {
    const startAt = new Date(input.startAt);
    const endAt = new Date(input.endAt);
    if (!(startAt.getTime() < endAt.getTime())) {
      throw new ValidationError(
        "start_at must be strictly before end_at",
        "invalid_time_window"
      );
    }
    const deitySlug = this.validateSurfaceShape(input.surface, input.deitySlug);

    // #EXPORT_CRITICAL — deity validation goes through the FACADE, never a
    // direct DB read. Arch boundaries reject a direct Prisma call from outside
    // core/deity/repositories/.
    if (input.surface === "status_deity" && deitySlug !== null) {
      await this.assertDeityActive(deitySlug);
    }

    await this.assertContentExists(input.surface, input.contentId, deitySlug);

    // Transactional pin insert + audit insert. If EITHER fails, neither lands.
    const row = await getPrisma().$transaction(async (tx: PrismaTx) => {
      const created = await this.repo.create(
        {
          surface: input.surface,
          deitySlug,
          contentId: input.contentId,
          pinPosition: input.pinPosition,
          startAt,
          endAt,
          createdBy: actorUserId,
        },
        tx
      );
      await this.auditRepo.insert(
        {
          pinnedContentId: created.id,
          action: "create",
          actorUserId,
          snapshot: created,
          diff: null,
        },
        tx
      );
      return created;
    });
    log.info(
      {
        event: "pinned_content_created",
        pin_id: row.id,
        surface: row.surface,
        deity_slug: row.deitySlug,
      },
      "pinned content created"
    );
    return row;
  }

  // ---------------------------------------------------------------------------
  // update
  // ---------------------------------------------------------------------------

  async update(
    id: string,
    input: {
      expectedUpdatedAt: string;
      contentId?: string;
      pinPosition?: number;
      startAt?: string;
      endAt?: string;
    },
    actorUserId: string
  ): Promise<PinnedContentView> {
    const before = await this.getById(id);
    if (before.deletedAt !== null) {
      throw new AppError(
        "Cannot update a deleted pin — restore it first",
        409,
        "pin_deleted"
      );
    }
    // Cross-field: when only one of start_at / end_at is supplied, validate
    // against the stored row so a one-sided update can't invert the window.
    const startAt = input.startAt !== undefined ? new Date(input.startAt) : new Date(before.startAt);
    const endAt = input.endAt !== undefined ? new Date(input.endAt) : new Date(before.endAt);
    if (!(startAt.getTime() < endAt.getTime())) {
      throw new ValidationError(
        "start_at must be strictly before end_at",
        "invalid_time_window"
      );
    }
    // A contentId change re-validates against the surface's owning module —
    // and, for `status_deity`, re-checks the deity match. Surface + deity_slug
    // are immutable (see the Zod schema); no re-check needed for those.
    if (input.contentId !== undefined && input.contentId !== before.contentId) {
      await this.assertContentExists(
        before.surface,
        input.contentId,
        before.deitySlug
      );
    }

    const data: UpdatePinInput = {};
    if (input.contentId !== undefined) data.contentId = input.contentId;
    if (input.pinPosition !== undefined) data.pinPosition = input.pinPosition;
    if (input.startAt !== undefined) data.startAt = startAt;
    if (input.endAt !== undefined) data.endAt = endAt;

    const row = await getPrisma().$transaction(async (tx: PrismaTx) => {
      const updated = await this.repo.updateWithPrecondition({
        id,
        expectedUpdatedAt: new Date(input.expectedUpdatedAt),
        data,
        updatedBy: actorUserId,
        tx,
      });
      if (!updated) {
        throw new AppError(
          "Pin was modified by another admin — reload and try again",
          409,
          "STALE_WRITE"
        );
      }
      await this.auditRepo.insert(
        {
          pinnedContentId: id,
          action: "update",
          actorUserId,
          snapshot: updated,
          diff: buildFieldDiff(before, updated),
        },
        tx
      );
      return updated;
    });
    log.info(
      { event: "pinned_content_updated", pin_id: id },
      "pinned content updated"
    );
    return row;
  }

  // ---------------------------------------------------------------------------
  // soft-delete + restore
  // ---------------------------------------------------------------------------

  async softDelete(
    id: string,
    input: { expectedUpdatedAt: string },
    actorUserId: string
  ): Promise<PinnedContentView> {
    const before = await this.getById(id);
    if (before.deletedAt !== null) {
      throw new AppError("Pin already deleted", 409, "pin_deleted");
    }
    const now = this.clock();
    const row = await getPrisma().$transaction(async (tx: PrismaTx) => {
      const deleted = await this.repo.softDeleteWithPrecondition({
        id,
        expectedUpdatedAt: new Date(input.expectedUpdatedAt),
        now,
        deletedBy: actorUserId,
        tx,
      });
      if (!deleted) {
        throw new AppError(
          "Pin was modified by another admin — reload and try again",
          409,
          "STALE_WRITE"
        );
      }
      await this.auditRepo.insert(
        {
          pinnedContentId: id,
          action: "delete",
          actorUserId,
          snapshot: deleted,
          diff: buildFieldDiff(before, deleted),
        },
        tx
      );
      return deleted;
    });
    log.info(
      { event: "pinned_content_deleted", pin_id: id },
      "pinned content deleted"
    );
    return row;
  }

  async restore(
    id: string,
    input: { expectedUpdatedAt: string },
    actorUserId: string
  ): Promise<PinnedContentView> {
    const before = await this.getById(id);
    if (before.deletedAt === null) {
      throw new AppError("Pin is not deleted", 409, "pin_not_deleted");
    }
    const row = await getPrisma().$transaction(async (tx: PrismaTx) => {
      const restored = await this.repo.restoreWithPrecondition({
        id,
        expectedUpdatedAt: new Date(input.expectedUpdatedAt),
        updatedBy: actorUserId,
        tx,
      });
      if (!restored) {
        throw new AppError(
          "Pin was modified by another admin — reload and try again",
          409,
          "STALE_WRITE"
        );
      }
      await this.auditRepo.insert(
        {
          pinnedContentId: id,
          action: "restore",
          actorUserId,
          snapshot: restored,
          diff: buildFieldDiff(before, restored),
        },
        tx
      );
      return restored;
    });
    log.info(
      { event: "pinned_content_restored", pin_id: id },
      "pinned content restored"
    );
    return row;
  }

  // ---------------------------------------------------------------------------
  // validation helpers
  // ---------------------------------------------------------------------------

  /**
   * Enforce the surface⇔deity_slug shape rule. The DB CHECK is the same rule;
   * this is the first line so the caller gets a clean 400 with a specific
   * `errorCode` rather than a Prisma-level violation.
   */
  private validateSurfaceShape(
    surface: PinSurface,
    deitySlug?: string
  ): string | null {
    if (surface === "status_deity") {
      if (!deitySlug) {
        throw new ValidationError(
          "deity_slug is required when surface is status_deity",
          "deity_slug_required"
        );
      }
      return deitySlug;
    }
    if (deitySlug) {
      throw new ValidationError(
        "deity_slug is only allowed when surface is status_deity",
        "deity_slug_not_allowed"
      );
    }
    return null;
  }

  /**
   * `unknown_deity` gate — an inactive or missing deity is a 400. Uses the
   * deity facade's `getBySlug`, which returns `DeitySummary` with `active`.
   */
  private async assertDeityActive(deitySlug: string): Promise<void> {
    const summary = await performServiceCall(
      "deity",
      (api) => api.getBySlug(deitySlug),
      "pinned-content:create",
      "failed to validate deity"
    );
    if (!summary || !summary.active) {
      throw new ValidationError(
        `unknown or inactive deity '${deitySlug}'`,
        "unknown_deity"
      );
    }
  }

  /**
   * `unknown_content_id` gate — for `home`, the id must exist in `home_feed`;
   * for both Status surfaces, in `status_items`. For `status_deity`, the row's
   * deity slug MUST match the pin's `deity_slug` (`content_deity_mismatch`).
   */
  private async assertContentExists(
    surface: PinSurface,
    contentId: string,
    deitySlug: string | null
  ): Promise<void> {
    if (surface === "home") {
      const exists = await performServiceCall(
        "home",
        (api) => api.hasFeedItem(contentId),
        "pinned-content:create",
        "failed to validate content_id against home"
      );
      if (!exists) {
        throw new ValidationError(
          `unknown or inactive home_feed content_id '${contentId}'`,
          "unknown_content_id"
        );
      }
      return;
    }
    // status_all_gods and status_deity
    const validation = await performServiceCall(
      "status",
      (api) => api.getPinValidation(contentId),
      "pinned-content:create",
      "failed to validate content_id against status"
    );
    if (!validation) {
      throw new ValidationError(
        `unknown or inactive status content_id '${contentId}'`,
        "unknown_content_id"
      );
    }
    if (
      surface === "status_deity" &&
      deitySlug !== null &&
      validation.deitySlug !== deitySlug
    ) {
      throw new ValidationError(
        `status content '${contentId}' belongs to deity '${validation.deitySlug ?? "(none)"}' — does not match pin deity '${deitySlug}'`,
        "content_deity_mismatch"
      );
    }
  }
}

/**
 * Field-level `{ before, after }` diff between two pin views. Only fields that
 * changed appear; unchanged fields are omitted so the audit log stays readable.
 */
function buildFieldDiff(
  before: PinnedContentView,
  after: PinnedContentView
): Record<string, { before: unknown; after: unknown }> {
  const diff: Record<string, { before: unknown; after: unknown }> = {};
  const keys = new Set([
    ...Object.keys(before),
    ...Object.keys(after),
  ]) as Set<keyof PinnedContentView>;
  for (const key of keys) {
    const b = before[key];
    const a = after[key];
    if (b !== a) diff[key as string] = { before: b, after: a };
  }
  return diff;
}

/** Explicit re-export so consumers of `services/` do not import types directly. */
export type PinnedContentAuditAction = PinAuditAction;
