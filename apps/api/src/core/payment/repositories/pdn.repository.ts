import { Prisma } from "@prisma/client";
import { getPrisma } from "@api/shared/database";
import { createModuleLogger } from "@api/shared/logs";
import type { PdnStatus } from "@api/core/payment/types";

const log = createModuleLogger("payment:pdn-repo");

/** Prisma's unique-constraint-violation code. */
const UNIQUE_VIOLATION = "P2002";

/**
 * Repo-local projection of a `pdn_notifications` row. `status` is widened to
 * `string` deliberately, as on every other row type here — it keeps the service
 * and facade layers Prisma-free (arch-boundaries.json enforces this) and means a
 * new provider status needs no migration and no type change.
 */
export interface PdnRow {
  id: string;
  mandateId: string;
  userId: string;
  cycleDate: Date;
  referenceId: string;
  presentationSequenceId: string | null;
  amountPaise: number;
  /**
   * The earliest instant this provider will accept a presentation, or `null`
   * when none is known yet. NEVER seeded — a non-null value is always real, and
   * `canPresentDebit` enforces it verbatim (TAM-164).
   */
  scheduledDebitAt: Date | null;
  status: string;
  attempts: number;
  failureReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Columns every read returns. `rawCreateResponse` / `rawLatestStatus` are
 * EXCLUDED: they are forensic blobs read by a human with psql during an
 * incident, and shipping them on every sweep row would put the provider's whole
 * response into memory for a hundred mandates at a time to no purpose.
 */
const PDN_FIELDS = {
  id: true,
  mandateId: true,
  userId: true,
  cycleDate: true,
  referenceId: true,
  presentationSequenceId: true,
  amountPaise: true,
  scheduledDebitAt: true,
  status: true,
  attempts: true,
  failureReason: true,
  createdAt: true,
  updatedAt: true,
} as const;

/**
 * Persistence for THE pre-debit notification.
 *
 * This table owns the NOTIFICATION; `transactions` owns MONEY and keeps sole
 * custody of the anti-double-charge guarantee. A row here authorises nothing —
 * money moves only in the presentation, which is driven off a `transactions`
 * query, so this sits upstream of that gate and cannot bypass it.
 *
 * The one invariant worth stating twice: a notification is ADDRESSABLE only when
 * it holds a `presentationSequenceId`, and `status = 'accepted'` is exactly the
 * claim that it does. `pdn_notifications_accepted_has_sequence_id` enforces that
 * in the database; every write path below normalises rather than relying on the
 * CHECK to reject, because a rejected write inside a billing tick is an outage
 * and a downgraded status is a log line.
 */
export class PdnRepository {
  /**
   * Get this cycle's notification, creating it if this is the first tick to
   * reach it. Idempotent by construction.
   *
   * INSERT-first against the full unique `(mandate_id, cycle_date)`, catching
   * P2002 and re-reading — the same shape as `claimRecurringCycle`, and for the
   * same reason: two scheduler tasks waking together must not both create one,
   * and a `SELECT` then `INSERT` leaves exactly the window where they would.
   *
   * Note the caller must have claimed the cycle in `transactions` FIRST. That
   * ordering is what stops a losing run from minting a reference id (and burning
   * a provider-side reference) for a cycle it does not own.
   */
  async findOrCreateForCycle(input: {
    mandateId: string;
    userId: string;
    cycleDate: Date;
    referenceId: string;
    amountPaise: number;
  }): Promise<PdnRow> {
    try {
      return await getPrisma().paymentPdnNotification.create({
        data: { ...input, status: "pending" },
        select: PDN_FIELDS,
      });
    } catch (err) {
      if (
        !(err instanceof Prisma.PrismaClientKnownRequestError) ||
        err.code !== UNIQUE_VIOLATION
      ) {
        throw err;
      }
      // Someone else created it between our INSERT and now. Their row is as good
      // as ours would have been, and `referenceId` is theirs — ours is discarded
      // unused, which costs nothing because it was never sent anywhere.
      const existing = await this.findForCycle(input.mandateId, input.cycleDate);
      if (!existing) throw err;
      return existing;
    }
  }

  async findForCycle(mandateId: string, cycleDate: Date): Promise<PdnRow | null> {
    return getPrisma().paymentPdnNotification.findUnique({
      where: { mandateId_cycleDate: { mandateId, cycleDate } },
      select: PDN_FIELDS,
    });
  }

  async findById(id: string): Promise<PdnRow | null> {
    return getPrisma().paymentPdnNotification.findUnique({
      where: { id },
      select: PDN_FIELDS,
    });
  }

  /** OUR reference — unique, and what a callback for this notification carries. */
  async findByReferenceId(referenceId: string): Promise<PdnRow | null> {
    return getPrisma().paymentPdnNotification.findUnique({
      where: { referenceId },
      select: PDN_FIELDS,
    });
  }

  /**
   * THEIRS — present only once the notification was accepted.
   *
   * Newest-first rather than `findUnique`: the column is unique per mandate, not
   * globally, so in principle two mandates could be handed the same id by the
   * provider. Taking the most recent is the same choice the reference
   * implementation makes, and a wrong match here costs one wasted status read
   * (the value we then write comes from that read, never from the callback).
   */
  async findByPresentationSequenceId(
    presentationSequenceId: string,
  ): Promise<PdnRow | null> {
    return getPrisma().paymentPdnNotification.findFirst({
      where: { presentationSequenceId },
      orderBy: { createdAt: "desc" },
      select: PDN_FIELDS,
    });
  }

  /**
   * Notifications the provider accepted but never issued a sequence id for.
   *
   * THE query that makes an asynchronous notify workable: without it a
   * notification that came back with no id has no path to becoming presentable.
   *
   * `updatedAt < staleBefore` keeps the poll from racing the webhook, which is
   * usually faster and arrives with the same answer. `cycleDate >= onOrAfterCycle`
   * drops cycles whose debit date has already passed — re-notifying for a day
   * that is gone cannot produce a valid debit, so polling for it is pure cost.
   */
  async findAwaitingSequenceId(
    staleBefore: Date,
    onOrAfterCycle: Date,
    limit = 100,
  ): Promise<PdnRow[]> {
    return getPrisma().paymentPdnNotification.findMany({
      where: {
        status: { in: ["pending", "sent"] },
        presentationSequenceId: null,
        updatedAt: { lt: staleBefore },
        cycleDate: { gte: onOrAfterCycle },
      },
      orderBy: { updatedAt: "asc" },
      take: limit,
      select: PDN_FIELDS,
    });
  }

  /**
   * Notifications whose debit date has PASSED without ever becoming addressable.
   *
   * The counterpart to `findAwaitingSequenceId`, which deliberately drops these
   * (`cycleDate >= onOrAfterCycle`) because re-notifying for a day that is gone
   * cannot produce a debit. True — but nothing then looked at them either, and
   * `findDueForPdn` only reaches three days ahead, so a cycle that deferred
   * through its whole window simply fell off the edge: no failed row, no error
   * log, no counter. A subscriber silently stopped being billed and the run that
   * dropped them reported success.
   *
   * That is the shape of the incident this module keeps having, so it gets a
   * query. Deferring is safe precisely BECAUSE something eventually notices.
   */
  async findAbandonedCycles(
    beforeCycle: Date,
    limit = 100,
  ): Promise<PdnRow[]> {
    return getPrisma().paymentPdnNotification.findMany({
      where: {
        status: { in: ["pending", "sent"] },
        presentationSequenceId: null,
        cycleDate: { lt: beforeCycle },
      },
      orderBy: { cycleDate: "asc" },
      take: limit,
      select: PDN_FIELDS,
    });
  }

  /**
   * Record what the dispatch call answered, including the raw body.
   *
   * `rawCreateResponse` is stored REDACTED (the caller passes it through
   * `redactPayload`) — the module never persists a payer handle in the clear, and
   * this table would otherwise be the one exception.
   */
  async applyDispatchResult(
    id: string,
    input: {
      status: PdnStatus;
      presentationSequenceId: string | null;
      failureReason?: string | null;
      /**
       * The SYNTHESISED debit instant, for a gateway that reports none of its
       * own (`MandateProvider.presentationTatHours`). Dispatch is the only
       * moment it can be computed, because it is measured from the
       * notification — which is why this field is on dispatch and not only on
       * the status read. Undefined for a gateway that reports its own; that one
       * arrives later, through `applyStatus`.
       */
      scheduledDebitAt?: Date | null;
      rawCreateResponse?: unknown;
    },
  ): Promise<PdnRow | null> {
    return this.write(id, input, "rawCreateResponse", input.rawCreateResponse);
  }

  /** Record what a status read answered. Same normalisation as dispatch. */
  async applyStatus(
    id: string,
    input: {
      status: PdnStatus;
      presentationSequenceId: string | null;
      failureReason?: string | null;
      /**
       * The provider's own debit instant, when it reported one. Replaces the
       * cycle-date midnight this row was created with — see
       * `PreDebitStatusResult.scheduledDebitAt`. Undefined leaves it alone.
       */
      scheduledDebitAt?: Date | null;
      rawLatestStatus?: unknown;
    },
  ): Promise<PdnRow | null> {
    return this.write(id, input, "rawLatestStatus", input.rawLatestStatus);
  }

  /**
   * Re-arm for another dispatch attempt — four fields that must move together.
   *
   * Not a plain status reset. The provider rejects a reused reference id, so a
   * fresh one is required, and a stale sequence id must be cleared or a later
   * poll resolves the PREVIOUS attempt. Keeping them in one method is what stops
   * a call site re-arming partially.
   *
   * GUARDED ON `presentationSequenceId: null`, and that guard is load-bearing. An
   * unrecognised provider status maps to `failed`, which is the deliberate
   * fail-loud choice — but a false `failed` on a notification that DOES hold a
   * valid sequence id must never clear it, because that cancels a live
   * notification and loses the cycle's money. A row holding an id can be marked
   * failed; it cannot be re-armed. Returns whether this call was the one that
   * re-armed it.
   */
  async rearm(
    id: string,
    input: { referenceId: string; currentAttempts: number },
  ): Promise<boolean> {
    const res = await getPrisma().paymentPdnNotification.updateMany({
      where: { id, presentationSequenceId: null },
      data: {
        status: "pending",
        referenceId: input.referenceId,
        presentationSequenceId: null,
        failureReason: null,
        // Cleared with the rest of the previous attempt's state. The turnaround
        // is measured from the NOTIFICATION, so a fresh notification restarts
        // the clock and the old instant is not merely stale, it is wrong. The
        // next dispatch mints a new one.
        scheduledDebitAt: null,
        attempts: input.currentAttempts + 1,
      },
    });
    if (res.count === 0) {
      log.warn(
        { event: "pdn_rearm_refused", pdn_id: id },
        "refused to re-arm a notification that already holds a sequence id — a valid notification must not be cancelled",
      );
    }
    return res.count > 0;
  }

  /**
   * Swap in a fresh wire reference, touching nothing else.
   *
   * Decentro burns a `reference_id` on EVERY request, including one it rejects —
   * so the next attempt must carry a new one or it is refused as a duplicate
   * rather than genuinely retried. `rearm` already rotates, but it also bumps
   * `attempts`, and the DEFER paths (too-soon, window-not-open) must not consume
   * the retry budget for what is only "ask again later". This is the rotation
   * without the accounting.
   *
   * Same `presentationSequenceId: null` guard as `rearm`, for the same reason:
   * once a notification is addressable, our stored reference is how a status read
   * finds it when the id is unavailable. Rotating then would orphan it.
   *
   * Returns the reference now on the row — the caller must send THIS, not the one
   * it passed in, since a refused rotation leaves the previous value standing.
   */
  async rotateReference(id: string, referenceId: string): Promise<string | null> {
    const res = await getPrisma().paymentPdnNotification.updateMany({
      where: { id, presentationSequenceId: null },
      data: { referenceId },
    });
    if (res.count > 0) return referenceId;
    // Not an error: a notification holding a sequence id is addressable and
    // should not be re-dispatched at all. Hand back what it actually holds so the
    // caller stays consistent with the row.
    const current = await this.findById(id);
    return current?.referenceId ?? null;
  }

  /** Terminal failure with a reason, leaving any held sequence id untouched. */
  async markFailed(id: string, failureReason: string): Promise<void> {
    await getPrisma().paymentPdnNotification.updateMany({
      where: { id },
      data: { status: "failed", failureReason },
    });
  }

  /** Count dispatches so far, for the re-arm budget. */
  async attemptsFor(id: string): Promise<number | null> {
    const row = await getPrisma().paymentPdnNotification.findUnique({
      where: { id },
      select: { attempts: true },
    });
    return row?.attempts ?? null;
  }

  // ---- internals -------------------------------------------------------------

  /**
   * The one write path for a provider-reported outcome, shared by dispatch and
   * status so the two can never normalise differently.
   *
   * Two rules, both there to keep the database's CHECK from ever firing inside a
   * billing tick:
   *
   *  1. A null incoming sequence id NEVER clears one we hold. Prisma treats
   *     `undefined` as "leave alone" and `null` as "set null", and the difference
   *     is the whole point: a status read that simply did not echo the id must
   *     not erase it. Only `rearm` clears, and only when none is held.
   *  2. `accepted` requires an id. If the provider claims accepted while we hold
   *     nothing, the honest status is `sent` — accepted means ADDRESSABLE, and a
   *     row we cannot address is not that. Downgraded here and logged, rather
   *     than sent to the database to be rejected.
   */
  private async write(
    id: string,
    input: {
      status: PdnStatus;
      presentationSequenceId: string | null;
      failureReason?: string | null;
      scheduledDebitAt?: Date | null;
    },
    rawColumn: "rawCreateResponse" | "rawLatestStatus",
    raw?: unknown,
  ): Promise<PdnRow | null> {
    const current = await getPrisma().paymentPdnNotification.findUnique({
      where: { id },
      select: { presentationSequenceId: true },
    });
    if (!current) return null;

    const effectiveSequenceId =
      input.presentationSequenceId ?? current.presentationSequenceId;

    let status: PdnStatus = input.status;
    if (status === "accepted" && !effectiveSequenceId) {
      log.warn(
        { event: "pdn_accepted_without_sequence_id", pdn_id: id },
        "provider reported the notification accepted but issued no presentation sequence id — recording it as sent, since a debit cannot be addressed without one",
      );
      status = "sent";
    }

    return getPrisma().paymentPdnNotification.update({
      where: { id },
      data: {
        status,
        // `undefined`, not `null` — see rule 1 above.
        presentationSequenceId: input.presentationSequenceId ?? undefined,
        failureReason: input.failureReason ?? undefined,
        // Same rule, third field: a read that reported no debit instant must not
        // erase one we already learned. Since TAM-164 the fallback is NULL
        // ("not known yet") rather than the cycle date's midnight, which is what
        // lets `canPresentDebit` trust any value it does find.
        scheduledDebitAt: input.scheduledDebitAt ?? undefined,
        ...(raw === undefined
          ? {}
          : { [rawColumn]: raw as Prisma.InputJsonValue }),
      },
      select: PDN_FIELDS,
    });
  }
}
