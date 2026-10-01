import { Prisma } from "@prisma/client";
import { getPrisma } from "@api/shared/database";

const UNIQUE_VIOLATION = "P2002";

/**
 * `kind` of the evidence rows `CallbackService.recordUnroutable` writes. They sit
 * in `received` forever by design (there is nothing to process), so no claim
 * may ever touch them.
 */
const UNROUTABLE_KIND = "unroutable";

/**
 * Repo-local projection of a `webhook_events` row.
 *
 * `payload` and `sourceIp` are deliberately ABSENT, as on the table this
 * supersedes: callers route on the extracted fields and must never be handed the
 * raw body back, which is how an untrusted payload ends up being believed.
 */
export interface WebhookEventRow {
  id: string;
  provider: string;
  kind: string;
  eventType: string | null;
  dedupeKey: string;
  referenceId: string | null;
  providerMandateId: string | null;
  presentationSequenceId: string | null;
  callbackAttempt: number | null;
  status: string;
  relatedMandateId: string | null;
  relatedPdnId: string | null;
  relatedTransactionId: string | null;
  receivedAt: Date;
  processedAt: Date | null;
  errorMessage: string | null;
}

const WEBHOOK_FIELDS = {
  id: true,
  provider: true,
  kind: true,
  eventType: true,
  dedupeKey: true,
  referenceId: true,
  providerMandateId: true,
  presentationSequenceId: true,
  callbackAttempt: true,
  status: true,
  relatedMandateId: true,
  relatedPdnId: true,
  relatedTransactionId: true,
  receivedAt: true,
  processedAt: true,
  errorMessage: true,
} as const;

/**
 * A `webhook_events` row as the TAM-260 callback worker sees it: the routing
 * projection plus the three inbox columns. Separate from `WebhookEventRow` on
 * purpose, so `ingest` and `listRecent` keep returning exactly what they did.
 * `payload` and `sourceIp` stay absent for the same reason as above: the worker
 * rebuilds its `CallbackRef` from columns, never from the body.
 */
export interface WebhookEventInboxRow extends WebhookEventRow {
  /** Lease start of the latest claim. NULL = never claimed. */
  claimedAt: Date | null;
  /** Claims so far, including the one that returned this row. */
  attempts: number;
  /** Razorpay `order.notification.delivered` only. Routing input, never state. */
  notificationDeliveredAt: Date | null;
}

const INBOX_FIELDS = {
  ...WEBHOOK_FIELDS,
  claimedAt: true,
  attempts: true,
  notificationDeliveredAt: true,
} as const;

/**
 * `RETURNING` list for the raw claim statements, aliased to the camelCase keys
 * of `WebhookEventInboxRow` and qualified with the `w` table alias (the batch
 * claim joins a CTE that also has an `id`). A fixed literal, never input.
 */
const INBOX_RETURNING = Prisma.raw(`
  w."id"::text                   AS "id",
  w."provider"                   AS "provider",
  w."kind"                       AS "kind",
  w."event_type"                 AS "eventType",
  w."dedupe_key"                 AS "dedupeKey",
  w."reference_id"               AS "referenceId",
  w."provider_mandate_id"        AS "providerMandateId",
  w."presentation_sequence_id"   AS "presentationSequenceId",
  w."callback_attempt"           AS "callbackAttempt",
  w."status"                     AS "status",
  w."related_mandate_id"::text   AS "relatedMandateId",
  w."related_pdn_id"::text       AS "relatedPdnId",
  w."related_transaction_id"::text AS "relatedTransactionId",
  w."received_at"                AS "receivedAt",
  w."processed_at"               AS "processedAt",
  w."error_message"              AS "errorMessage",
  w."claimed_at"                 AS "claimedAt",
  w."attempts"                   AS "attempts",
  w."notification_delivered_at"  AS "notificationDeliveredAt"
`);

/**
 * A lease or a limit that is not a positive integer is a caller bug, and on
 * this path a silent one: `leaseMs = 0` would let every claimer steal every
 * in-flight row. Refuse it loudly instead of clamping.
 */
function assertPositiveInt(name: string, value: number): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive integer, got ${value}`);
  }
}

/**
 * The claim a terminal write is fenced to (TAM-260): the `attempts` value the
 * worker's claim returned. Every claim bumps `attempts`, so a worker whose
 * lease expired and whose row was re-claimed elsewhere holds a stale value and
 * its terminal write matches nothing. `attempts`, not `claimed_at`: the latter
 * is a DB `now()` with microsecond precision that a JS `Date` truncates to
 * milliseconds, so an equality fence on it would never match.
 */
export interface ClaimFence {
  attempt: number;
}

export type IngestOutcome =
  | { kind: "accepted"; row: WebhookEventRow }
  | { kind: "duplicate" };

/**
 * THE inbox for inbound provider callbacks, and the single dedupe ledger.
 *
 * Supersedes `CallbackEventRepository`, which still exists so the rows written
 * before TAM-141 stay queryable but takes no new writes. There is exactly one
 * inbox on purpose: two would mean two dedupe ledgers, and an event deduped in
 * one could still be reprocessed through the other.
 *
 * Decentro retries a callback until it gets a 200, redelivering the same event
 * with an incrementing `callback_attempt`. Without dedupe, one "debit succeeded"
 * delivered three times is three trips through the entitlement write path.
 */
export class WebhookEventRepository {
  /**
   * Record a callback, or report it as already seen.
   *
   * INSERT-FIRST on the unique `dedupeKey`, catching the violation. The obvious
   * alternative — SELECT then INSERT — has a race that concurrent provider
   * retries hit routinely, because retries arrive in bursts rather than spread
   * out. Letting the unique index arbitrate makes dedupe atomic.
   */
  async ingest(input: {
    provider: string;
    kind: string;
    eventType: string | null;
    dedupeKey: string;
    referenceId: string | null;
    providerMandateId: string | null;
    presentationSequenceId: string | null;
    callbackAttempt: number | null;
    payload: unknown;
    sourceIp: string | null;
    /**
     * Razorpay `order.notification.delivered` only (TAM-260): the provider's
     * delivery time, lifted at ingest so a deferred worker rebuilds the
     * `CallbackRef` from columns. Optional, so every existing caller writes
     * NULL exactly as before. Routing input only, never state.
     */
    notificationDeliveredAt?: Date | null;
  }): Promise<IngestOutcome> {
    try {
      const row = await getPrisma().paymentWebhookEvent.create({
        data: {
          provider: input.provider,
          kind: input.kind,
          eventType: input.eventType,
          dedupeKey: input.dedupeKey,
          referenceId: input.referenceId,
          providerMandateId: input.providerMandateId,
          presentationSequenceId: input.presentationSequenceId,
          callbackAttempt: input.callbackAttempt,
          // Redacted by the caller before it gets here.
          payload: input.payload as Prisma.InputJsonValue,
          sourceIp: input.sourceIp,
          notificationDeliveredAt: input.notificationDeliveredAt ?? null,
          status: "received",
        },
        select: WEBHOOK_FIELDS,
      });
      return { kind: "accepted", row };
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === UNIQUE_VIOLATION
      ) {
        return { kind: "duplicate" };
      }
      throw err;
    }
  }

  /**
   * Processed, stamped with OUR ids for whatever the callback turned out to be
   * about.
   *
   * The `related_*` columns are what make this table answer "show me everything
   * that happened to this notification" without a text search over JSON — which
   * is the question an incident actually starts from. Logical links, no FK, so a
   * log of untrusted triggers can never block a delete elsewhere.
   *
   * FENCING (TAM-260), the same for all three terminal marks:
   *   - no `fence` (every inline caller): the unconditional `update` by id,
   *     exactly as before; resolves `true`.
   *   - `fence` (the deferred worker): writes only while the row is still
   *     `processing` under THAT claim (`attempts = fence.attempt`), and
   *     resolves whether it wrote. `false` = the lease expired and another
   *     claim owns the row now (or already stamped it); the stale writer's
   *     outcome is dropped instead of overwriting the owner's.
   */
  async markProcessed(
    id: string,
    at: Date,
    related: {
      mandateId?: string | null;
      pdnId?: string | null;
      transactionId?: string | null;
    } = {},
    fence?: ClaimFence | null,
  ): Promise<boolean> {
    if (!fence) {
      await getPrisma().paymentWebhookEvent.update({
        where: { id },
        data: {
          status: "processed",
          processedAt: at,
          relatedMandateId: related.mandateId ?? undefined,
          relatedPdnId: related.pdnId ?? undefined,
          relatedTransactionId: related.transactionId ?? undefined,
        },
      });
      return true;
    }
    const { count } = await getPrisma().paymentWebhookEvent.updateMany({
      where: { id, status: "processing", attempts: fence.attempt },
      data: {
        status: "processed",
        processedAt: at,
        relatedMandateId: related.mandateId ?? undefined,
        relatedPdnId: related.pdnId ?? undefined,
        relatedTransactionId: related.transactionId ?? undefined,
      },
    });
    return count > 0;
  }

  /**
   * Accepted but not resolvable to anything we know. Kept rather than dropped: a
   * burst of these is the signature of a mis-whitelisted callback URL or a
   * reference-id mismatch, and that is only diagnosable after the fact if the
   * rows exist. Fencing: see `markProcessed`.
   */
  async markIgnoredUnknown(
    id: string,
    at: Date,
    fence?: ClaimFence | null,
  ): Promise<boolean> {
    if (!fence) {
      await getPrisma().paymentWebhookEvent.update({
        where: { id },
        data: { status: "ignored_unknown", processedAt: at },
      });
      return true;
    }
    const { count } = await getPrisma().paymentWebhookEvent.updateMany({
      where: { id, status: "processing", attempts: fence.attempt },
      data: { status: "ignored_unknown", processedAt: at },
    });
    return count > 0;
  }

  /** Fencing: see `markProcessed`. */
  async markFailed(
    id: string,
    message: string,
    at: Date,
    fence?: ClaimFence | null,
  ): Promise<boolean> {
    if (!fence) {
      await getPrisma().paymentWebhookEvent.update({
        where: { id },
        data: { status: "failed", errorMessage: message, processedAt: at },
      });
      return true;
    }
    const { count } = await getPrisma().paymentWebhookEvent.updateMany({
      where: { id, status: "processing", attempts: fence.attempt },
      data: { status: "failed", errorMessage: message, processedAt: at },
    });
    return count > 0;
  }

  /**
   * Claim ONE row for processing under a lease (TAM-260), or null if it is not
   * claimable right now.
   *
   * Claimable = `received` (never claimed), or `processing` whose lease has
   * expired (`claimed_at < now() - leaseMs`: its worker died or stalled). A
   * claim moves the row to `processing`, stamps `claimed_at = now()` and bumps
   * `attempts`. One conditional UPDATE, not a read-then-write: Postgres
   * re-evaluates the predicate against the committed row after waiting on a
   * concurrent writer, so of two racing claimers exactly one gets the row and
   * the other gets null.
   *
   * `now()` is the DATABASE clock for both the stamp and the expiry test, so
   * clock skew between API tasks cannot shorten or stretch a lease.
   *
   * Terminal rows (`processed`, `ignored_unknown`, `ignored_duplicate`,
   * `failed`), a live lease and `unroutable` evidence rows are never claimed.
   *
   * CALLER CONTRACT: a row processed INLINE sits in `received` with no claim
   * for the whole request, so claiming it here would process it twice. Only
   * claim rows written in deferred mode (the kick right after `ingest`).
   */
  async claim(id: string, leaseMs: number): Promise<WebhookEventInboxRow | null> {
    assertPositiveInt("leaseMs", leaseMs);
    const rows = await getPrisma().$queryRaw<WebhookEventInboxRow[]>(Prisma.sql`
      UPDATE "webhook_events" AS w
      SET "status" = 'processing',
          "claimed_at" = now(),
          "attempts" = w."attempts" + 1
      WHERE w."id" = ${id}::uuid
        AND w."kind" <> ${UNROUTABLE_KIND}
        AND (
          w."status" = 'received'
          OR (
            w."status" = 'processing'
            AND w."claimed_at" < now() - (${leaseMs}::int * interval '1 millisecond')
          )
        )
      RETURNING ${INBOX_RETURNING}
    `);
    return rows[0] ?? null;
  }

  /**
   * The re-driver's claim: up to `limit` rows, oldest first, each claimed
   * exactly as `claim` does. `FOR UPDATE SKIP LOCKED` in the picking CTE means
   * concurrent re-drivers (one per API task) skip each other's rows instead of
   * queueing on them, so no row is ever returned to two callers.
   *
   * Two populations:
   *
   *   - `received` rows with `receivedSince <= received_at < olderThan`.
   *     `olderThan` (now minus the worker's min age) leaves a fresh row to its
   *     own kick. `receivedSince` is the LEGACY-ROW WINDOW, required on
   *     purpose: prod may hold `received` rows orphaned by crashes long ago,
   *     and the spec's decision (resolved 2026-09-25) is that the re-driver
   *     only takes rows from a rolling window (the worker passes `now - 24 h`
   *     on every pass); anything older is left for a human.
   *   - `processing` rows whose lease expired. NOT subject to either time
   *     bound: `processing` only exists since TAM-260, so no legacy row can be
   *     in it, and bounding it could strand a row a dead worker had claimed.
   *
   * `providers`, the DEFERRED set, restricts the `received` population ONLY.
   * A gateway still processed inline holds its row in `received`, unclaimed,
   * for the whole request, so a re-driver that took it would process it twice.
   * An empty list claims no `received` row at all (`= ANY('{}')` is false).
   *
   * Expired-lease `processing` rows are claimed for ANY provider, on purpose:
   * only a worker claim ever sets `processing`, so no inline row can be in it,
   * and this is what lets a rollback (a provider removed from the deferred set,
   * or the list emptied) still drain the rows its workers left in flight —
   * including a Razorpay PDN's delivered-at correction to
   * `scheduled_debit_at`, which nothing else re-applies.
   *
   * Both populations exclude `kind = 'unroutable'`: `recordUnroutable`
   * evidence rows stay `received` forever and are never claimed or re-statused.
   *
   * Covered by the (`status`, `received_at`) index; `processing` rows are
   * bounded by worker concurrency.
   */
  async claimBatch(
    limit: number,
    olderThan: Date,
    leaseMs: number,
    receivedSince: Date,
    providers: readonly string[],
  ): Promise<WebhookEventInboxRow[]> {
    assertPositiveInt("limit", limit);
    assertPositiveInt("leaseMs", leaseMs);
    const rows = await getPrisma().$queryRaw<WebhookEventInboxRow[]>(Prisma.sql`
      WITH picked AS (
        SELECT "id"
        FROM "webhook_events"
        WHERE "kind" <> ${UNROUTABLE_KIND}
          AND (
            (
              "status" = 'received'
              AND "provider" = ANY(${[...providers]}::text[])
              AND "received_at" < ${olderThan}::timestamptz
              AND "received_at" >= ${receivedSince}::timestamptz
            )
            OR (
              "status" = 'processing'
              AND "claimed_at" < now() - (${leaseMs}::int * interval '1 millisecond')
            )
          )
        ORDER BY "received_at" ASC, "id" ASC
        LIMIT ${limit}::int
        FOR UPDATE SKIP LOCKED
      )
      UPDATE "webhook_events" AS w
      SET "status" = 'processing',
          "claimed_at" = now(),
          "attempts" = w."attempts" + 1
      FROM picked
      WHERE w."id" = picked."id"
      RETURNING ${INBOX_RETURNING}
    `);
    // RETURNING order is unspecified; hand the worker oldest-first.
    return rows.sort(
      (a, b) =>
        a.receivedAt.getTime() - b.receivedAt.getTime() ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );
  }

  /** One row with the inbox columns, or null. Read-only: claims nothing. */
  async findById(id: string): Promise<WebhookEventInboxRow | null> {
    return getPrisma().paymentWebhookEvent.findUnique({
      where: { id },
      select: INBOX_FIELDS,
    });
  }

  async listRecent(limit = 50): Promise<WebhookEventRow[]> {
    return getPrisma().paymentWebhookEvent.findMany({
      orderBy: { receivedAt: "desc" },
      take: limit,
      select: WEBHOOK_FIELDS,
    });
  }
}
