import { Prisma } from "@prisma/client";
import { getPrisma } from "@api/shared/database";
import type {
  PinAuditAction,
  PinnedContentAuditView,
} from "@api/core/pinned-content/types";
import type { PrismaTx } from "./pinned-content.repository.js";

/**
 * Prisma-facing audit repository — one write per mutating operation, inside
 * the SAME transaction as the pin mutation. Never let an audit row land
 * without its pin mutation, or vice versa; see the write-service.
 */
export class PinnedContentAuditRepository {
  /**
   * Insert one audit row. `snapshot` is the pin row AFTER the action; `diff`
   * is the field-level `{ before, after }` for update / delete / restore, and
   * NULL for a create. Both are JSON blobs — the wire shape is a black-box for
   * the client so it can grow without a migration.
   */
  async insert(
    input: {
      pinnedContentId: string;
      action: PinAuditAction;
      actorUserId: string;
      /** Any JSON-serializable value. Coerced through JSON on the way in so the
       * DB never sees a Date, Map, undefined-holed object, or other Prisma-hostile
       * value (a snapshot is meant to be a black-box blob anyway). */
      snapshot: unknown;
      diff: unknown;
    },
    tx: PrismaTx
  ): Promise<void> {
    await tx.pinnedContentAudit.create({
      data: {
        pinnedContentId: input.pinnedContentId,
        action: input.action,
        actorUserId: input.actorUserId,
        snapshot: JSON.parse(JSON.stringify(input.snapshot)) as Prisma.InputJsonValue,
        diff:
          input.diff === null
            ? Prisma.JsonNull
            : (JSON.parse(JSON.stringify(input.diff)) as Prisma.InputJsonValue),
      },
    });
  }

  /**
   * Newest-first audit trail for one pin. Backs
   * `GET /admin/pinned-content/:id/audit`.
   */
  async listForPin(pinnedContentId: string): Promise<PinnedContentAuditView[]> {
    const rows = await getPrisma().pinnedContentAudit.findMany({
      where: { pinnedContentId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
        pinnedContentId: true,
        action: true,
        actorUserId: true,
        snapshot: true,
        diff: true,
        createdAt: true,
      },
    });
    return rows.map((r) => ({
      id: r.id,
      pinnedContentId: r.pinnedContentId,
      action: r.action,
      actorUserId: r.actorUserId,
      snapshot: r.snapshot,
      diff: r.diff,
      createdAt: r.createdAt.toISOString(),
    }));
  }
}
