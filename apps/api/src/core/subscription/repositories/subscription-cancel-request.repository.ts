import { Prisma } from "@prisma/client";
import { getPrisma } from "@api/shared/database";

/**
 * Prisma-level projection of a `subscription_cancellation_requests` row —
 * kept repo-local so the service + facade layers stay Prisma-free
 * (`arch-boundaries.json` enforces this).
 */
export interface CancellationRequestRow {
  id: string;
  userId: string;
  subscriptionId: string;
  status: string;
  reason: string | null;
  notes: string | null;
  requestedAt: Date;
  processedAt: Date | null;
  processedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const SELECT = {
  id: true,
  userId: true,
  subscriptionId: true,
  status: true,
  reason: true,
  notes: true,
  requestedAt: true,
  processedAt: true,
  processedBy: true,
  createdAt: true,
  updatedAt: true,
} as const;

/**
 * Thrown by the repository when a `pending` request already exists for the
 * user. The service maps this to a `409 PENDING_REQUEST_EXISTS`.
 *
 * A named error (rather than returning a discriminated union) matches how
 * `AppError` bubbles from the service — the controller catches at the
 * service layer, not here.
 */
export class PendingRequestExistsError extends Error {
  readonly existingRequestId: string;

  constructor(existingRequestId: string) {
    super(`A pending cancellation request already exists (${existingRequestId})`);
    this.name = "PendingRequestExistsError";
    this.existingRequestId = existingRequestId;
  }
}

/**
 * Repository for `subscription_cancellation_requests` (TAM-125).
 *
 * The ONLY place in this module (besides the existing subscription repo) that
 * may import `@prisma/client`. Three surfaces:
 *
 *   1. `createIfNoPending` — a `$transaction` that `SELECT ... FOR UPDATE`s
 *      an existing pending row for the user before inserting a new one.
 *      Combined with the partial unique index on the table, this is
 *      defence-in-depth against duplicate `pending` rows: the tx gate gives
 *      the app a clean `409 PENDING_REQUEST_EXISTS`; the DB index catches
 *      races and any hypothetical write path that bypasses the service.
 *   2. `markProcessed` — stamps the outcome of the revoke the service drives.
 *   3. `findLatestForUser` — a plain read used by the `GET /me` endpoint.
 *
 * The table is an AUDIT TRAIL, not a work queue — it was the latter under the
 * original TAM-125 shape, where a row was all a cancellation produced. The
 * provider revoke now runs inline in the service, and these rows record what
 * happened rather than what someone still has to do.
 *
 * Still no provider call and no touch of `subscriptions.status` /
 * `mandates.state` FROM HERE: those belong to `core/payment`, which the
 * service reaches through `performServiceCall`. This file stays Prisma-and-one-
 * table.
 */
export class SubscriptionCancelRequestRepository {
  /**
   * The most recent request for `userId`, or `null` if none. Used by both the
   * `GET /me` endpoint and, indirectly, by callers wanting to observe a state
   * change without another round trip.
   */
  async findLatestForUser(
    userId: string
  ): Promise<CancellationRequestRow | null> {
    return getPrisma().subscriptionCancellationRequest.findFirst({
      where: { userId },
      orderBy: { requestedAt: "desc" },
      select: SELECT,
    });
  }

  /**
   * Race-safe create: `SELECT ... FOR UPDATE` any existing `pending` row for
   * the user inside a `$transaction`; if one exists, throw
   * `PendingRequestExistsError`; otherwise, insert.
   *
   * The `FOR UPDATE` runs against the primary key of any existing pending row,
   * so two concurrent creates serialize on the row lock instead of racing to
   * INSERT. If no pending row exists, the two callers still race — the
   * partial unique index (`... WHERE status = 'pending'`) is what catches the
   * dead heat and rejects the loser with `P2002`. The service maps both
   * paths to the same 409.
   */
  async createIfNoPending(input: {
    userId: string;
    subscriptionId: string;
    reason: string | null;
  }): Promise<CancellationRequestRow> {
    const prisma = getPrisma();
    try {
      return await prisma.$transaction(async (tx) => {
        // Lock any pending row for this user before we peek. `$queryRaw` because
        // Prisma's typed API can't express `FOR UPDATE`, and the returned row
        // (if any) exists solely to say "there IS one — 409".
        const locked = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
          SELECT "id"
          FROM "subscription_cancellation_requests"
          WHERE "user_id" = ${input.userId}::uuid
            AND "status" = 'pending'
          FOR UPDATE
        `);
        if (locked.length > 0) {
          throw new PendingRequestExistsError(locked[0].id);
        }

        return tx.subscriptionCancellationRequest.create({
          data: {
            userId: input.userId,
            subscriptionId: input.subscriptionId,
            reason: input.reason,
          },
          select: SELECT,
        });
      });
    } catch (err) {
      // The partial unique index is a second gate. Two concurrent transactions
      // whose FOR UPDATE returned nothing (because the pending row was inserted
      // AFTER they started) race to INSERT; one wins, the other trips this.
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        // Re-read to surface the existing id, so the error message matches
        // the FOR UPDATE branch.
        const existing = await this.findLatestForUser(input.userId);
        throw new PendingRequestExistsError(existing?.id ?? "unknown");
      }
      throw err;
    }
  }

  /**
   * Close out a request: stamp its terminal status, `processedAt`, and an
   * optional ops note.
   *
   * `processedBy` is deliberately left NULL — it means "the ops agent who
   * fulfilled this", and nobody did; the API did it inline. A future admin
   * surface that rejects a request by hand is what should set it.
   *
   * Called AFTER `createIfNoPending`'s transaction has committed, never inside
   * it. The revoke it reports on is a network call to the gateway plus an
   * entitlement write through another module's facade, and holding the row lock
   * across that would keep a Postgres transaction open for the length of a
   * third-party HTTP round trip.
   */
  async markProcessed(input: {
    id: string;
    status: "completed" | "rejected";
    notes: string | null;
  }): Promise<CancellationRequestRow> {
    return getPrisma().subscriptionCancellationRequest.update({
      where: { id: input.id },
      data: {
        status: input.status,
        notes: input.notes,
        processedAt: new Date(),
      },
      select: SELECT,
    });
  }
}
