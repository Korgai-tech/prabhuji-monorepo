import { Prisma } from "@prisma/client";
import { v7 as uuidv7 } from "uuid";
import type { FailureSubCode } from "@api/core/payment/failure-sub-code";
import { getPrisma } from "@api/shared/database";
import type {
  ChargePhase,
  FailurePhase,
  TransactionKind,
  TransactionStatus,
} from "@api/core/payment/types";
import { TERMINAL_TRANSACTION_STATUSES } from "@api/core/payment/types.js";

export interface TransactionRow {
  id: string;
  userId: string;
  kind: string;
  provider: string;
  mandateId: string | null;
  amountPaise: number;
  currency: string;
  status: string;
  chargePhase: string;
  cycleDate: Date | null;
  isFirstDebit: boolean;
  attemptNo: number;
  retryCount: number;
  presentationSequenceId: string | null;
  /** The notification this row's presentation is made under. */
  pdnId: string | null;
  /** The per-attempt reference actually sent on the presentation. */
  gatewayPresentationRef: string | null;
  gatewayPaymentId: string | null;
  gatewayRequestId: string | null;
  bankReferenceNumber: string | null;
  npciTransactionId: string | null;
  notifiedAt: Date | null;
  submittedAt: Date | null;
  settledAt: Date | null;
  failurePhase: string | null;
  failureCode: string | null;
  failureMessage: string | null;
  /**
   * WHY it died, in our vocabulary (TAM-186). `failureCode` is the gateway's
   * string and groups 91.9% of declines into one meaningless bucket; this is
   * what a reader branches on. NULL on rows written before the column shipped.
   */
  failureSubCode: string | null;
  parentTransactionId: string | null;
  supersededAt: Date | null;
  supersededByTransactionId: string | null;
  planId: string | null;
  productId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * A row known to be a recurring debit, so `mandateId` and `cycleDate` are
 * non-null.
 *
 * The `transactions_recurring_shape` CHECK already guarantees this at the
 * database level — a `recurring_debit` cannot be written without both. Narrowing
 * once, here, keeps that guarantee visible in the type system instead of making
 * every billing-cycle call site re-check for a state the DB forbids.
 */
export type RecurringDebitRow = TransactionRow & {
  mandateId: string;
  cycleDate: Date;
};

/**
 * Narrow rows the query already restricted to `kind = "recurring_debit"`.
 *
 * The filter never actually drops anything (the CHECK sees to that); it exists
 * so the narrowing is sound rather than an `as` cast that would silently lie if
 * the constraint were ever dropped.
 */
function asRecurring(rows: TransactionRow[]): RecurringDebitRow[] {
  return rows.filter(
    (r): r is RecurringDebitRow => r.mandateId !== null && r.cycleDate !== null,
  );
}

/** Prisma's unique-constraint-violation code. */
const UNIQUE_VIOLATION = "P2002";

/**
 * The columns of the partial cycle index.
 *
 * Prisma reports a unique violation by COLUMN, not by index name — for this
 * index `meta.target` comes back as `["mandate_id", "cycle_date"]`, never
 * `"transactions_recurring_cycle_unique"`. Matching the name looks more precise
 * and silently never matches, which turns "someone else owns this cycle" into a
 * thrown error that aborts the whole billing run. Verified against Postgres 18
 * in `transactions.repository.integration.test.ts`.
 */
const CYCLE_INDEX_COLUMNS = ["mandate_id", "cycle_date"] as const;

/**
 * The other constraint that means the same thing.
 *
 * Not a coincidence: for a recurring debit `gateway_request_id` is DERIVED from
 * `(referenceId, cycleDate)` (see `MandateProvider.debitRequestId`), so a
 * collision on it says precisely "this cycle is already claimed". Postgres
 * reports whichever unique index it evaluates first, and under real concurrency
 * that is frequently this one.
 */
const CYCLE_REQUEST_KEY = "gateway_request_id";

const RECURRING: TransactionKind = "recurring_debit";

/**
 * Did this Prisma error come from a guard that means "cycle already claimed"?
 *
 * The old `payment_attempts` repository treated ANY P2002 as cycle-taken, which
 * was safe only because the table had exactly one unique constraint. This table
 * has three, and one of them — `gateway_payment_id` — carries the GATEWAY's id,
 * which arrives later and from a different source. Reading a duplicate there as
 * "someone else owns this cycle" would silently skip a debit for a completely
 * unrelated reason and leave nothing in the logs to explain it.
 *
 * So: the two cycle-derived constraints mean skip; anything else rethrows.
 */
function isCycleConflict(err: unknown): boolean {
  if (
    !(err instanceof Prisma.PrismaClientKnownRequestError) ||
    err.code !== UNIQUE_VIOLATION
  ) {
    return false;
  }
  const target = err.meta?.target;
  const columns = Array.isArray(target)
    ? target.map(String)
    : typeof target === "string"
      ? [target]
      : [];

  // The cycle index reports both of its columns together. Requiring BOTH keeps
  // this from matching some future single-column index on `mandate_id`.
  const isCycleIndex = CYCLE_INDEX_COLUMNS.every((c) => columns.includes(c));
  return isCycleIndex || columns.includes(CYCLE_REQUEST_KEY);
}

/**
 * THE money ledger — every movement, of every kind, in one table.
 *
 * `claimRecurringCycle` is the load-bearing method: it is what makes
 * double-charging structurally impossible rather than merely unlikely. The
 * guarantee is a DB predicate, not TypeScript, so it holds under concurrent
 * scheduler runs and when Redis (the coarse outer lock) is flushed.
 */
export class TransactionsRepository {
  // ---- recurring debits -----------------------------------------------------

  /**
   * Claim a billing cycle, or report that someone already has it.
   *
   * INSERT-FIRST, catching the unique violation. A read-then-write ("does a row
   * exist for this cycle? no → create") has a window two concurrent scheduler
   * runs will find, and the cost of losing that race is charging a user twice.
   * Letting the database arbitrate removes the window entirely.
   *
   * Returns `null` when the cycle is already claimed — the caller must treat
   * that as "someone else owns this debit", not as an error.
   */
  async claimRecurringCycle(input: {
    mandateId: string;
    userId: string;
    provider: string;
    chargePhase: ChargePhase;
    cycleDate: Date;
    amountPaise: number;
    currency: string;
    isFirstDebit: boolean;
    gatewayRequestId: string | null;
    planId: string | null;
    productId: string | null;
    attemptNo?: number;
  }): Promise<RecurringDebitRow | null> {
    try {
      const row = await getPrisma().transaction.create({
        data: { ...input, kind: RECURRING, status: "pending" },
      });
      return asRecurring([row])[0] ?? null;
    } catch (err) {
      if (isCycleConflict(err)) return null;
      throw err;
    }
  }

  async findById(id: string): Promise<TransactionRow | null> {
    return getPrisma().transaction.findUnique({ where: { id } });
  }

  /**
   * Has this mandate ever had a DEBIT attempted? Attempts, not outcomes.
   *
   * `isFirstDebit` is NOT derived from this any more — it asks
   * `countSettledRecurringDebits` ("has this subscriber ever paid?"), because a
   * declined first debit that is re-armed for tomorrow must claim its next
   * cycle as a first debit too, not as a renewal with a paying user's grace.
   *
   * The `kind` filter is not cosmetic. Every mandate has an `initial_deposit`
   * row from registration, so an unfiltered count reports 1 before the first
   * cycle has ever run.
   */
  async countRecurringDebitsForMandate(mandateId: string): Promise<number> {
    return getPrisma().transaction.count({
      where: { mandateId, kind: RECURRING },
    });
  }

  /**
   * How many full-price cycles this mandate has actually PAID — the analytics
   * `cycles_completed` / revenue `index`.
   *
   * Deliberately not `countRecurringDebitsForMandate`: that one counts attempts,
   * including the failed and the still-pending, and answers a different question
   * (`isFirstDebit`). A subscriber whose only cycle bounced has attempted one and
   * completed none, and reporting 1 would overstate revenue depth on exactly the
   * accounts churn analysis cares most about.
   *
   * The `initial_deposit` exclusion carries over for the same reason it exists
   * there: the ₹2 registration charge is not a cycle.
   *
   * Index-covered by `@@index([mandateId, kind, status])`.
   */
  async countSettledRecurringDebits(mandateId: string): Promise<number> {
    return getPrisma().transaction.count({
      where: { mandateId, kind: RECURRING, status: "succeeded" },
    });
  }

  /**
   * The cycle date of the EARLIEST failed renewal since the last one that
   * settled — the day dunning began for this subscriber.
   *
   * A stable anchor is the whole point. A renewal that keeps failing is
   * re-armed onto a FRESH cycle each day (`debit_failed` / `outcome: rearmed`), so
   * `attempt.cycleDate` moves forward every retry and cannot bound the window:
   * computing the deadline from it, or from `now`, slides it a day further on
   * every failure and the subscriber is retried and entitled forever. Anchoring
   * on the first failure instead makes "seven days of retries" mean seven days.
   *
   * Scoped AFTER the newest `succeeded` cycle so a subscriber who failed months
   * ago, recovered, and has now failed again starts a fresh seven-day window
   * rather than inheriting a deadline that expired long before.
   *
   * `null` when nothing has failed since the last success — the caller is
   * looking at the first failure of a new sequence and anchors on it directly.
   *
   * `before` bounds the search to cycles strictly earlier than that date. The
   * settle-success path needs it: by the time it derives the paid period, the
   * row it just settled IS the newest success, so an unbounded search would
   * scope itself after that row, find no failures, and fall back to the
   * re-armed date — the exact drift the anchor exists to prevent. Passing the
   * settling row's own cycle date asks "what was the dunning sequence that led
   * up to this?" rather than "what has failed since?".
   *
   * Index-covered by `@@index([mandateId, kind, status])`.
   */
  async findRenewalDunningAnchor(
    mandateId: string,
    opts: { before?: Date } = {}
  ): Promise<Date | null> {
    const bound = opts.before ? { cycleDate: { lt: opts.before } } : {};

    const lastSettled = await getPrisma().transaction.findFirst({
      where: { mandateId, kind: RECURRING, status: "succeeded", ...bound },
      orderBy: { cycleDate: "desc" },
      select: { cycleDate: true },
    });

    const firstFailed = await getPrisma().transaction.findFirst({
      where: {
        mandateId,
        kind: RECURRING,
        status: "failed",
        supersededAt: null,
        isFirstDebit: false,
        cycleDate: {
          ...(lastSettled?.cycleDate ? { gt: lastSettled.cycleDate } : {}),
          ...(opts.before ? { lt: opts.before } : {}),
        },
      },
      orderBy: { cycleDate: "asc" },
      select: { cycleDate: true },
    });

    return firstFailed?.cycleDate ?? null;
  }

  /**
   * Has this USER ever settled a full-price payment, counting the one that has
   * just been recorded? Answers `bk_subscription_started`'s "first time ever".
   *
   * Scoped to the user, NOT the mandate — which is the whole point. Every other
   * first-payment signal here (`isFirstDebit`, `is_first_payment`) is
   * mandate-scoped, and a mandate is per-consent: an NPCI auto-revoke plus
   * re-registration mints a fresh row, so those flags read `true` a second time
   * for someone who has been paying for months.
   *
   * Identified by WHAT THE ROW IS, never by an amount threshold.
   *
   * A full-price charge arrives under two kinds — a no-trial registration books
   * the plan price as `initial_deposit` (`createMandate` sends
   * `plan.amountPaise` when `trialDays === 0`), and every `recurring_debit` is
   * full price whenever it lands. Exactly one settled row is NOT full price:
   * the token deposit a TRIAL registration takes to prove the instrument. So
   * the predicate is "settled subscription money, except a trial's registration
   * deposit", and each clause below removes one thing that is not revenue.
   *
   * An earlier cut compared `amountPaise` against the plan's price instead.
   * That reintroduced the very double-count this method exists to prevent, in
   * two ways: raising the plan price made every earlier payment fall below the
   * floor, so a returning subscriber counted as brand new; and
   * `initial_deposit_paise` is CMS-editable, so an admin raising the trial token
   * to the plan price would have silently stopped the event firing on trial
   * conversions altogether. Both were invisible — no test could fail, the
   * numbers would just quietly be wrong. Identity has no such knob.
   *
   * `mandate.trialEndsAt` is written once at registration and never mutated
   * (nothing in `MandateRepository` updates it), so "was this a trial's deposit"
   * is a permanent fact about the row and not a race against conversion.
   *
   * Counts on `@@index([userId, createdAt])`'s `userId` prefix — a user's ledger
   * is tens of rows, so the residual filtering is free.
   */
  async countSettledFullPriceForUser(userId: string): Promise<number> {
    return getPrisma().transaction.count({
      where: {
        userId,
        status: "succeeded",
        // Subscription money only. Refunds and chargebacks are forced negative
        // by the `transactions_amount_sign` CHECK and would subtract, not add;
        // `one_time` has no writer today, and a future add-on purchase must not
        // silently suppress this event by looking like a subscription payment.
        kind: { in: ["initial_deposit", "recurring_debit"] },
        // The two rows that look like settled money but are not a full-price
        // payment. BOTH are scoped to `initial_deposit`, deliberately.
        NOT: [
          // Never actually charged. A gateway without `supportsInitialDeposit`
          // still books its deposit row at the full price — that flag only
          // downgrades `chargePhase` to `none` — and `settleDepositForMandate`
          // then marks it `succeeded` on approval with no phase filter.
          //
          // The `initial_deposit` scope is load-bearing, not tidiness:
          // `chargePhase` answers a DIFFERENT question on a recurring row,
          // where it names which of our calls is the irreversible one (see
          // `Transaction.chargePhase` in schema.prisma). Filtering it
          // unscoped would mean a future gateway that charges autonomously and
          // honestly declares `chargePhase = "none"` had every settled cycle
          // drop out of this count — so the event would never fire for any of
          // its users, silently.
          { kind: "initial_deposit", chargePhase: "none" },
          // The trial's token deposit — the ₹2 that proves the instrument.
          // Real settled money, but not a full-price payment.
          { kind: "initial_deposit", mandate: { trialEndsAt: { not: null } } },
        ],
      },
    });
  }

  /**
   * Attach this row to the notification its presentation will be made under.
   *
   * Guarded on `pdnId: null` so a re-link cannot silently repoint a money row at a
   * different notification — which would make the two disagree about which
   * notification authorised the debit.
   */
  async linkPdn(id: string, pdnId: string): Promise<boolean> {
    const res = await getPrisma().transaction.updateMany({
      where: { id, pdnId: null },
      data: { pdnId },
    });
    return res.count > 0;
  }

  /**
   * The notification was ACCEPTED but carries no sequence id yet.
   *
   * Stamps `notifiedAt` and leaves `status` at `pending`, which is exactly right
   * and needs no new status value: `findAwaitingSubmission` requires BOTH
   * `notified` and a non-null sequence id, so this row is structurally ineligible
   * for presentation on two counts, and `claimRecurringCycle` still returns null
   * for its cycle so no second notify is raised. What moves it forward is the PDN
   * table's own sweep, not anything on this row — which is the reason the
   * notification needed a table of its own.
   */
  async markNotifyAccepted(id: string, input: { at: Date }): Promise<boolean> {
    const res = await getPrisma().transaction.updateMany({
      where: { id, status: "pending", supersededAt: null },
      data: { notifiedAt: input.at },
    });
    return res.count > 0;
  }

  /**
   * The notification is addressable: record the sequence id and move to `notified`.
   *
   * GUARDED, where this was previously an unguarded `update`. It is now reachable
   * from three places — the dispatch response, the status poll and a webhook — so a
   * late arrival could otherwise flip a row that has since been superseded or
   * settled, resurrecting a cycle someone else already owns.
   */
  async markNotified(
    id: string,
    input: {
      presentationSequenceId: string;
      gatewayPaymentId: string | null;
      at: Date;
    },
  ): Promise<boolean> {
    const res = await getPrisma().transaction.updateMany({
      where: { id, status: "pending", supersededAt: null },
      data: {
        status: "notified",
        presentationSequenceId: input.presentationSequenceId,
        gatewayPaymentId: input.gatewayPaymentId,
        notifiedAt: input.at,
      },
    });
    return res.count > 0;
  }

  /** The live money row for a notification, if it still has one. */
  /**
   * The recurring row standing for one mandate's cycle, whatever state it is in.
   *
   * Exists for the stranded-cycle repair, which has to answer a question no
   * other finder does: is the cycle blocking this mandate one that COULD still
   * be presented, or one that never can? `findAwaitingSubmission` answers it in
   * aggregate for the sweep; this answers it for a single cycle, including rows
   * that finder deliberately excludes.
   */
  async findRecurringForCycle(
    mandateId: string,
    cycleDate: Date,
  ): Promise<RecurringDebitRow | null> {
    const row = await getPrisma().transaction.findFirst({
      where: { mandateId, kind: RECURRING, cycleDate, supersededAt: null },
      orderBy: { attemptNo: "desc" },
    });
    return row ? asRecurring([row])[0] ?? null : null;
  }

  async findByPdnId(pdnId: string): Promise<RecurringDebitRow | null> {
    const row = await getPrisma().transaction.findFirst({
      where: { pdnId, kind: RECURRING, supersededAt: null },
      orderBy: { attemptNo: "desc" },
    });
    return row ? (asRecurring([row])[0] ?? null) : null;
  }

  /**
   * The pre-debit notification did not go through.
   *
   * Guarded on `pending` (the old `markPdnFailed` was an unguarded `update`) so
   * a late error from a superseded dispatch cannot stamp a row that has since
   * been adopted or replaced.
   */
  async markNotifyFailed(
    id: string,
    input: {
      failureCode: string;
      failureMessage: string;
      /** Our vocabulary for WHY — see `core/payment/failure-sub-code.ts`. */
      failureSubCode?: FailureSubCode | null;
    },
  ): Promise<void> {
    await getPrisma().transaction.updateMany({
      where: { id, status: "pending" },
      data: { status: "failed", failurePhase: "notify", ...input },
    });
  }

  /**
   * Handed to the gateway.
   *
   * `gatewayPresentationRef` is the reference actually SENT on this attempt, and it
   * is written here — before dispatch — for the same reason `gatewayRequestId` is:
   * a timeout that loses the response must still leave the key that identifies the
   * call. It is minted fresh per attempt by the caller because the gateway rejects
   * a reused reference, which is why it cannot be derived from `retryCount`: this
   * method INCREMENTS that counter, so any derivation would read a stale value and
   * silently hand two attempts the same reference.
   */
  /**
   * CLAIM the presentation. Returns false if someone else already has it.
   *
   * GUARDED on the two statuses a submission can legitimately start from, like
   * every other transition in this file — and it is the one that most needs it,
   * because it is the write immediately before money moves.
   *
   * Both are real entry points: a recurring debit arrives here from `notified`
   * (it holds a pre-debit notification), and the registration deposit arrives
   * from `pending` (there is no notification for it). What the guard excludes is
   * a row ALREADY `submitted` — which is exactly the concurrent-presentation
   * case — and any terminal row.
   *
   * It was an unguarded `update({ where: { id } })`. That is safe only while
   * exactly one sweep can be in flight, and the Redis lock does NOT guarantee
   * that: it is `SET NX PX` with a 25-minute TTL against a 30-minute schedule,
   * so a run degraded past the TTL (one provider timing out at 10s across a
   * few hundred rows is enough) has its lock expire underneath it and the next
   * task starts while it is still working.
   *
   * Both runs then read the same row from `findAwaitingSubmission`, both
   * succeeded at this write, and both called `presentDebit` — with the same
   * `presentationSequenceId` but a FRESHLY MINTED per-attempt
   * `gatewayPresentationRef`, which exists precisely so the gateway does not
   * dedupe it. On Decentro that is two real debits against one payer for one
   * cycle.
   *
   * The `(mandate_id, cycle_date)` unique index does not cover this. It makes a
   * second CLAIM impossible; it says nothing about presenting the row that was
   * claimed once. The comments in `billing-lock.ts` and `payment.api.impl.ts`
   * that call that index the double-charge guarantee are describing the claim,
   * not the presentation — this guard is what makes them true of both.
   */
  async markSubmitted(
    id: string,
    input: {
      gatewayPaymentId: string | null;
      gatewayPresentationRef?: string | null;
      at: Date;
    },
  ): Promise<boolean> {
    const res = await getPrisma().transaction.updateMany({
      where: { id, status: { in: ["pending", "notified"] } },
      data: {
        status: "submitted",
        gatewayPaymentId: input.gatewayPaymentId ?? undefined,
        gatewayPresentationRef: input.gatewayPresentationRef ?? undefined,
        submittedAt: input.at,
        retryCount: { increment: 1 },
      },
    });
    return res.count > 0;
  }

  /** The dispatch itself threw — the gateway may never have seen it. */
  async markSubmitFailed(
    id: string,
    input: {
      failureCode: string;
      failureMessage: string;
      /** Our vocabulary for WHY — see `core/payment/failure-sub-code.ts`. */
      failureSubCode?: FailureSubCode | null;
    },
  ): Promise<void> {
    await getPrisma().transaction.updateMany({
      where: { id, status: { notIn: [...TERMINAL_TRANSACTION_STATUSES] } },
      data: { status: "failed", failurePhase: "submit", ...input },
    });
  }

  /**
   * Settle a row. Guarded on it NOT already being terminal, so a replayed
   * settlement callback cannot flip a `succeeded` row to `failed` (gateways
   * deliver retries out of order often enough to matter), and on it not being
   * superseded, so a late callback for a replaced claim cannot resurrect it.
   *
   * Returns whether this call was the one that settled it.
   */
  async settle(
    id: string,
    input: {
      status: Extract<TransactionStatus, "succeeded" | "failed" | "abandoned">;
      gatewayPaymentId?: string | null;
      bankReferenceNumber?: string | null;
      npciTransactionId?: string | null;
      failurePhase?: FailurePhase | null;
      failureCode?: string | null;
      failureMessage?: string | null;
      /** Our vocabulary for WHY — see `core/payment/failure-sub-code.ts`. */
      failureSubCode?: FailureSubCode | null;
      at: Date;
    },
  ): Promise<boolean> {
    const res = await getPrisma().transaction.updateMany({
      where: {
        id,
        status: { notIn: [...TERMINAL_TRANSACTION_STATUSES] },
        supersededAt: null,
      },
      data: {
        status: input.status,
        gatewayPaymentId: input.gatewayPaymentId ?? undefined,
        bankReferenceNumber: input.bankReferenceNumber ?? undefined,
        npciTransactionId: input.npciTransactionId ?? undefined,
        failurePhase: input.failurePhase ?? undefined,
        failureCode: input.failureCode ?? undefined,
        failureMessage: input.failureMessage ?? undefined,
        failureSubCode: input.failureSubCode ?? undefined,
        settledAt: input.at,
      },
    });
    return res.count > 0;
  }

  /**
   * Return a failed renewal to `notified` so a later window retries it.
   *
   * Deliberately NOT part of `settle`: settling is terminal, and letting a
   * caller pass a non-terminal status there would let a replayed callback
   * resurrect a row that had already been written off. Keeping the retry path a
   * separate, explicitly-named method makes that impossible.
   *
   * The presentation sequence id is preserved — it belongs to the notification,
   * which is still valid for this cycle, and re-notifying would cancel it.
   *
   * Returns whether this call was the one that moved the row, exactly like
   * `settle`: guarded on `submitted`, so when two resolvers read the same
   * attempt concurrently (a webhook and the sweep) only one of them gets
   * `true`, and only that one may run the retry's side effects (TAM-260).
   */
  async markForRetry(
    id: string,
    input: {
      failureCode: string;
      failureMessage: string;
      /** Our vocabulary for WHY — see `core/payment/failure-sub-code.ts`. */
      failureSubCode?: FailureSubCode | null;
    },
  ): Promise<boolean> {
    const res = await getPrisma().transaction.updateMany({
      where: { id, status: "submitted" },
      data: {
        status: "notified",
        failurePhase: "settle",
        failureCode: input.failureCode,
        failureMessage: input.failureMessage,
        failureSubCode: input.failureSubCode ?? undefined,
      },
    });
    return res.count > 0;
  }

  /** Rows holding a notification and waiting to be submitted. */
  async findAwaitingSubmission(limit = 500): Promise<RecurringDebitRow[]> {
    return asRecurring(
      await getPrisma().transaction.findMany({
        where: {
          kind: RECURRING,
          status: "notified",
          presentationSequenceId: { not: null },
          supersededAt: null,
        },
        orderBy: { cycleDate: "asc" },
        take: limit,
      }),
    );
  }

  /**
   * The newest submitted-but-unsettled DEBIT for a mandate.
   *
   * How a presentation callback finds the movement it is talking about. Callback
   * bodies carry the mandate's `reference_id` but no cycle date, and only one
   * cycle per mandate can be in flight at a time, so the newest unsettled row is
   * unambiguous.
   *
   * The `kind` filter matters as much as it does in
   * `countRecurringDebitsForMandate`: an `initial_deposit` row also sits in
   * `submitted` while awaiting UPI approval, and with a NULL `cycleDate` it
   * sorts unpredictably — without the filter a presentation callback could
   * settle the registration deposit instead of the debit.
   */
  async findLatestSubmittedForMandate(
    mandateId: string
  ): Promise<RecurringDebitRow | null> {
    const row = await getPrisma().transaction.findFirst({
      where: {
        mandateId,
        kind: RECURRING,
        status: "submitted",
        supersededAt: null,
      },
      orderBy: { cycleDate: "desc" },
    });
    return row ? (asRecurring([row])[0] ?? null) : null;
  }

  /**
   * The mandate's newest live recurring debit, whatever its status — the cycle
   * a mandate-level event (a state change, a callback) is "currently on".
   *
   * Read for analytics only (`bk_mandate_status` / `bk_webhook_received`
   * `attempt_number`, TAM-187). `kind`-filtered for the same reason as
   * `findLatestSubmittedForMandate`: the registration deposit is not a cycle.
   * Covered by `@@index([mandateId, kind, status])`.
   */
  async findLatestRecurringDebitForMandate(
    mandateId: string
  ): Promise<TransactionRow | null> {
    return getPrisma().transaction.findFirst({
      where: { mandateId, kind: RECURRING, supersededAt: null },
      orderBy: [{ cycleDate: "desc" }, { createdAt: "desc" }],
    });
  }

  /**
   * Submitted but never settled. The safety net for a callback that never
   * arrived — without this a silent gateway outage would leave users charged
   * but not entitled.
   */
  async findUnsettled(before: Date, limit = 200): Promise<RecurringDebitRow[]> {
    return asRecurring(
      await getPrisma().transaction.findMany({
        where: {
          kind: RECURRING,
          status: "submitted",
          submittedAt: { lt: before },
          supersededAt: null,
        },
        orderBy: { submittedAt: "asc" },
        take: limit,
      }),
    );
  }

  // ---- failed-notification recovery -----------------------------------------

  /**
   * Cycles whose notification failed in TRANSPORT and which are still worth
   * asking the gateway about.
   *
   * Only `failure_phase = "notify"` qualifies: a row that failed at `settle`
   * reached the bank, and re-claiming it would be a second charge. A past cycle
   * is excluded because re-notifying for a date already gone cannot produce a
   * valid debit.
   */
  async findRecoverableNotifyFailures(
    onOrAfterCycle: Date,
    limit = 100,
  ): Promise<RecurringDebitRow[]> {
    return asRecurring(
      await getPrisma().transaction.findMany({
        where: {
          kind: RECURRING,
          status: "failed",
          failurePhase: "notify",
          supersededAt: null,
          cycleDate: { gte: onOrAfterCycle },
        },
        orderBy: { cycleDate: "asc" },
        take: limit,
      }),
    );
  }

  /**
   * The notification DID land after all — take the row back to `notified` in
   * place. No new row, so no second charge.
   *
   * Guarded on the exact failure state it is allowed to reverse, so it can never
   * resurrect a bank-declined row.
   */
  async adoptNotification(
    id: string,
    input: {
      presentationSequenceId: string;
      gatewayPaymentId: string | null;
      at: Date;
    },
  ): Promise<boolean> {
    const res = await getPrisma().transaction.updateMany({
      where: {
        id,
        status: "failed",
        failurePhase: "notify",
        supersededAt: null,
      },
      data: {
        status: "notified",
        presentationSequenceId: input.presentationSequenceId,
        gatewayPaymentId: input.gatewayPaymentId ?? undefined,
        notifiedAt: input.at,
        failurePhase: null,
        failureCode: null,
        failureMessage: null,
      },
    });
    return res.count > 0;
  }

  /**
   * The gateway has definitively never seen this cycle — hand the claim to a
   * fresh row.
   *
   * ONE transaction, and the ordering inside it is load-bearing: the partial
   * unique index tolerates two rows for a cycle only once the old one carries
   * `superseded_at`, so that must be written before the insert commits. Callers
   * MUST only reach here on a definitive negative from the gateway; a transport
   * error is not one.
   *
   * Returns `null` if a concurrent recovery run won the race.
   */
  async supersedeCycleClaim(input: {
    failedId: string;
    claim: Parameters<TransactionsRepository["claimRecurringCycle"]>[0];
  }): Promise<RecurringDebitRow | null> {
    // The replacement's id is generated HERE rather than by the database,
    // because the two writes below are mutually dependent: the insert cannot
    // succeed until the old row is superseded (the partial index forbids two
    // live claims), and the old row cannot be marked superseded without naming
    // its replacement (`transactions_supersede_shape` forbids half of the
    // fact). Knowing the id up front breaks the cycle.
    //
    // `uuid`'s v7 and not `randomUUID`, because this bypasses `Transaction.id`'s
    // `@default(uuid(7))` — a v4 here would be the one row in the ledger that
    // silently breaks the convention. The package (not a hand-rolled helper)
    // because its v7 is monotonic within a millisecond; a naive
    // timestamp+random implementation is not, and two claims for the same
    // mandate can land in the same millisecond.
    const replacementId = uuidv7();
    try {
      return await getPrisma().$transaction(async (tx) => {
        // RELEASE FIRST. Doing the insert first fails outright: Postgres
        // evaluates the unique index at insert time, while the old row still
        // satisfies the predicate.
        const marked = await tx.transaction.updateMany({
          where: {
            id: input.failedId,
            status: "failed",
            failurePhase: "notify",
            supersededAt: null,
          },
          data: {
            supersededAt: new Date(),
            supersededByTransactionId: replacementId,
          },
        });
        // Someone else already superseded it (or it is not in a supersedable
        // state). Abort rather than leave two live claims; throwing rolls the
        // whole transaction back, so the release is undone too.
        if (marked.count === 0) throw new SupersedeRaceLost();

        const replacement = await tx.transaction.create({
          data: {
            ...input.claim,
            id: replacementId,
            kind: RECURRING,
            status: "pending",
          },
        });
        return asRecurring([replacement])[0] ?? null;
      });
    } catch (err) {
      if (err instanceof SupersedeRaceLost || isCycleConflict(err)) return null;
      throw err;
    }
  }

  // ---- registration deposit -------------------------------------------------

  /**
   * Record the charge taken at mandate registration, BEFORE it is dispatched.
   *
   * Persist-before-dispatch for the same reason `createInitiated` exists on the
   * mandate side: a timeout that loses the gateway's response must still leave a
   * key to reconcile against. This row is the thing whose absence meant the ₹2
   * deposit was recorded nowhere at all.
   */
  async recordInitialDeposit(input: {
    userId: string;
    mandateId: string;
    provider: string;
    chargePhase: ChargePhase;
    amountPaise: number;
    currency: string;
    gatewayRequestId: string | null;
    planId: string | null;
    productId: string | null;
  }): Promise<TransactionRow> {
    return getPrisma().transaction.create({
      data: { ...input, kind: "initial_deposit", status: "pending" },
    });
  }

  /**
   * The id of a mandate's registration deposit, or null when it has none.
   *
   * Published to the client as `paymentReferenceId` on every mandate response,
   * so it must name the same payment on every read: `createMandate` records
   * exactly one deposit per mandate, and the newest wins should that ever
   * change. Served by the `(mandate_id, kind, status)` index.
   */
  async findInitialDepositIdForMandate(mandateId: string): Promise<string | null> {
    const row = await getPrisma().transaction.findFirst({
      where: { mandateId, kind: "initial_deposit" },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    return row?.id ?? null;
  }

  /**
   * Settle a mandate's registration deposit. Called when the mandate reaches a
   * terminal state — the deposit's outcome IS the user approving or not.
   *
   * Returns whether a row was actually settled — false when the gateway takes
   * no registration deposit (`supportsInitialDeposit: false`, so none was ever
   * recorded), and ALSO false on a repeat, because the `notIn` guard skips a row
   * that is already terminal. A caller must therefore not read `false` as "no
   * money moved"; it means "this call changed nothing".
   *
   * Every provider we ship today sets `supportsInitialDeposit: true` — Decentro
   * included, which took both the ₹2 trial deposit and the ₹299 full price in
   * production.
   */
  async settleDepositForMandate(
    mandateId: string,
    input: {
      status: Extract<TransactionStatus, "succeeded" | "failed" | "abandoned">;
      gatewayPaymentId?: string | null;
      failurePhase?: FailurePhase | null;
      failureCode?: string | null;
      failureMessage?: string | null;
      at: Date;
    },
  ): Promise<boolean> {
    const res = await getPrisma().transaction.updateMany({
      where: {
        mandateId,
        kind: "initial_deposit",
        status: { notIn: [...TERMINAL_TRANSACTION_STATUSES] },
      },
      data: {
        status: input.status,
        gatewayPaymentId: input.gatewayPaymentId ?? undefined,
        failurePhase: input.failurePhase ?? undefined,
        failureCode: input.failureCode ?? undefined,
        failureMessage: input.failureMessage ?? undefined,
        settledAt: input.at,
      },
    });
    return res.count > 0;
  }

  // ---- reconciliation lookups -----------------------------------------------

  async findByGatewayRequestId(key: string): Promise<TransactionRow | null> {
    return getPrisma().transaction.findUnique({
      where: { gatewayRequestId: key },
    });
  }

  async findByGatewayPaymentId(id: string): Promise<TransactionRow | null> {
    return getPrisma().transaction.findUnique({
      where: { gatewayPaymentId: id },
    });
  }
}

/** Internal control-flow signal; never escapes `supersedeCycleClaim`. */
class SupersedeRaceLost extends Error {}
