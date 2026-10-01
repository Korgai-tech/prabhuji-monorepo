import { randomUUID } from "node:crypto";
import { createModuleLogger, redactPayload } from "@api/shared/logs";
import type { MandateRow } from "@api/core/payment/repositories/mandate.repository.js";
import type { PdnRepository, PdnRow } from "@api/core/payment/repositories/pdn.repository.js";
import type {
  RecurringDebitRow,
  TransactionsRepository,
} from "@api/core/payment/repositories/transactions.repository.js";
import type {
  MandateProvider,
  ProviderResolver,
} from "@api/core/payment/mandate.provider.js";
import {
  DuplicateReferenceError,
  NoSuchDebitError,
  PreDebitTooSoonError,
} from "@api/core/payment/mandate.provider.js";
import { TERMINAL_PDN_STATUSES } from "@api/core/payment/types";
import type { PdnStatus } from "@api/core/payment/types";
import { isoDay, safeFailureMessage, paymentTrace, PAYMENT_STAGE } from "./payment-log.js";
import {
  paymentLedgerAnalytics,
  type LedgerEventSource,
} from "./payment-ledger-analytics.service.js";

const log = createModuleLogger("payment:pdn");

/**
 * How many times one cycle's notification may be re-armed before we give up.
 *
 * In code rather than env, matching how this module already keeps its
 * presentation retry budget. Finite because a re-arm mints a fresh provider-side
 * reference each time, and an unbounded loop would burn them on a cycle that is
 * never going to work while looking, from the outside, like progress.
 */
export const MAX_PDN_DISPATCH_ATTEMPTS = 3;

/** A notification whose sequence id has not arrived is polled no sooner than this. */
export const PDN_SEQUENCE_ID_STALE_MS = 10 * 60_000;

/**
 * Safety margin added on top of a gateway's declared notice period.
 *
 * THE BUG THIS FIXES. Razorpay's rule is "debit can be attempted 25 hours
 * AFTER sending the pre-debit notification" — strictly after. We sent
 * `payment_after = notifiedAt + exactly 25h`, which is not after, and Razorpay
 * rejected the whole notification order with
 * `400 input_validation_failed: "Debit can be attempted 25 hours after sending
 * the pre-debit notification"`. No order meant no `order_id`, no
 * `presentation_sequence_id`, and a cycle that could never be presented — it
 * simply polled every thirty minutes until its cycle date passed and it was
 * written off. 162 notifications went that way in a day, silently, because a
 * cycle nothing ever claimed leaves no failed row to find.
 *
 * A margin measured in MINUTES is what the boundary actually needs — strict
 * inequality, plus clock skew between our host and the gateway's, plus request
 * latency (478ms on the rejection we diagnosed). An hour is deliberately more
 * than that, and the extra is insurance for a different unknown: the notice
 * period runs from DELIVERY to the payer, not from our API call, so a dispatch
 * that is never followed by an `order.notification.delivered` webhook is
 * optimistic by however long delivery took. `recordNotificationDelivered`
 * corrects that when the webhook lands; this covers the case where it does not.
 *
 * IT IS NOT FREE. The margin comes straight off D+1 coverage: the cutoff for a
 * same-next-day debit is `48h − notice − margin − activation delay`, so every
 * hour here moves that cutoff an hour earlier and pushes the evening's signups
 * to D+2. At one hour the cutoff is ~21:50 IST. Do not reach for more without
 * checking what it costs — three hours would have moved it to 19:50 and taken
 * roughly a sixth of a day's registrations with it.
 */
export const PRESENTATION_NOTICE_MARGIN_MS = 60 * 60_000;

/**
 * The earliest instant this gateway will accept a presentation, DERIVED — for
 * the gateways that report none of their own.
 *
 * `null` for a gateway that does report one (Decentro). Its answer arrives
 * later, on the status read, and pre-empting it with a guess would put our
 * arithmetic where the vendor's fact belongs — and the two would silently
 * diverge the day the vendor changed its turnaround.
 *
 * Measured from the NOTIFICATION, which is why this is computed at dispatch and
 * nowhere else: by the time the presentation sweep looks at the row, the
 * instant the clock started is no longer available to it.
 */
function synthesiseDebitInstant(
  provider: MandateProvider,
  notifiedAt: Date,
): Date | null {
  const tatHours = provider.presentationTatHours;
  // `typeof`, not `=== null`. The interface says `number | null`, but an adapter
  // built through a cast — every test fake, and any future partial mock — can
  // present `undefined` here, and `undefined * 3_600_000` is NaN. An Invalid
  // Date written to `scheduled_debit_at` compares false against everything, so
  // the presentation gate would silently pass or fail at random. Absent is
  // treated as "declares none", which is the safe reading.
  if (typeof tatHours !== "number") return null;
  // The margin is added HERE, not at the wire, so the instant stored on the row
  // and the one sent as the gateway's "not before" stay the same value. Adding
  // it only on the wire would make the ledger and the gateway disagree about
  // when the debit becomes presentable — which is the divergence this whole
  // single-value design exists to prevent.
  return new Date(
    notifiedAt.getTime() +
      tatHours * 3_600_000 +
      PRESENTATION_NOTICE_MARGIN_MS
  );
}

/** What a dispatch or a refresh did, for the caller's report counters. */
export interface PdnOutcome {
  /** The notification is addressable — a debit can now be presented. */
  accepted: boolean;
  /** Accepted, but no sequence id yet. Normal, and resolved by poll or webhook. */
  awaitingSequenceId: boolean;
  /** Terminal for this cycle. */
  failed: boolean;
  /** Premature, or otherwise worth retrying unchanged on a later tick. */
  deferred: boolean;
  rearmed: boolean;
}

const NOTHING: PdnOutcome = {
  accepted: false,
  awaitingSequenceId: false,
  failed: false,
  deferred: false,
  rearmed: false,
};

/**
 * Did a status read report a presentation instant different from the one held?
 * Narrows `reported` so the caller can use it as a `Date`.
 */
function hasDebitInstantMoved(
  held: Date | null,
  reported: Date | null | undefined
): reported is Date {
  return reported != null && held?.getTime() !== reported.getTime();
}

/**
 * The pre-debit notification state machine, and THE single writer of
 * `presentation_sequence_id`.
 *
 * Extracted from `BillingCycleService` rather than added to it, for two reasons.
 * The obvious one is size — that class is already the longest in the module. The
 * load-bearing one is that a sequence id can arrive by THREE routes (the dispatch
 * response, a status poll, a webhook), and having one owner is what stops the
 * three disagreeing. Two of them come from outside the billing tick entirely.
 *
 * All three routes converge on {@link refreshFromProvider}, so the value written
 * ALWAYS comes from a provider READ. A callback is a trigger to look, never a fact
 * — the same posture `CallbackService` takes for mandate state, and the reason a
 * forged callback body achieves nothing here but one wasted status call.
 */
export class PdnService {
  /**
   * Resolved per row, never injected as one gateway: a notification belongs to
   * a mandate, and that mandate's gateway is the only one that can answer for
   * it. `dispatch` resolves from the mandate; `refreshFromProvider` from the
   * ledger row it is advancing, which carries the same value denormalised.
   */
  constructor(
    private readonly pdns: PdnRepository,
    private readonly transactions: TransactionsRepository,
    private readonly resolve: ProviderResolver
  ) {}

  /** A fresh provider-side reference. Never reused — the gateway rejects that. */
  static newReferenceId(): string {
    return `pj_pdn_${randomUUID()}`;
  }

  /**
   * Ensure this cycle has a notification row, then dispatch it.
   *
   * The caller must ALREADY have claimed the cycle in `transactions`. That
   * ordering matters: a run that lost the claim must not reach here, because
   * creating the notification would mint a provider-side reference for a cycle it
   * does not own.
   */
  async dispatch(
    mandate: MandateRow,
    debit: RecurringDebitRow,
    now: Date
  ): Promise<PdnOutcome> {
    const pdn = await this.pdns.findOrCreateForCycle({
      mandateId: mandate.id,
      userId: mandate.userId,
      cycleDate: debit.cycleDate,
      referenceId: PdnService.newReferenceId(),
      amountPaise: debit.amountPaise,
    });
    await this.transactions.linkPdn(debit.id, pdn.id);

    if (!mandate.providerMandateId) {
      // Unreachable via the due-mandates query, which requires an active mandate.
      // Guarded anyway because the alternative is a non-null assertion on the wire.
      await this.fail(pdn, debit, "mandate has no provider id", "scheduler");
      return { ...NOTHING, failed: true };
    }

    // ROTATE BEFORE EVERY SEND, not just on re-arm. Decentro burns a
    // `reference_id` on any request it sees, including one it rejects, so a
    // second dispatch carrying the first attempt's reference comes back
    // `error_duplicate_reference_id` instead of being retried. `rearm` covered
    // the failure path; the DEFER paths returned without writing and re-sent the
    // same value on the next tick — which is how a cycle rejected once as
    // premature could never recover.
    //
    // Done HERE rather than in each error branch so no future branch can forget:
    // one place mints, one place sends, and they are the same statement. Written
    // BEFORE the call, so a send that times out still leaves the row holding the
    // reference that went out — which is what `getPreDebitStatus` looks up by
    // when it has no sequence id.
    const notificationRef =
      (await this.pdns.rotateReference(pdn.id, PdnService.newReferenceId())) ??
      pdn.referenceId;

    // The row as it now stands. `pdn` was read BEFORE the rotation, so its
    // `referenceId` is a value no longer on the row and no longer on the wire —
    // and `handleDispatchError` hands it to `refreshFromProvider`, which looks a
    // notification up BY that reference when it holds no sequence id. Reconciling
    // a duplicate-reference rejection against the pre-rotation value asks the
    // gateway about the wrong notification, gets "no such record", and defers a
    // cycle that may well have landed. Everything downstream takes this instead.
    const armed = { ...pdn, referenceId: notificationRef };

    // Minted ONCE, before the call, and then used twice: on the wire and on the
    // row. `now` is the notification instant this cycle's turnaround is measured
    // from, and it is the last moment that instant is knowable — the presentation
    // sweep sees only the row.
    const provider = this.resolve(mandate.provider);
    const notBefore = synthesiseDebitInstant(provider, now);

    try {
      const result = await provider.notifyPreDebit({
        // The mandate's reference identifies the subscription to the gateway; the
        // notification's is what goes on the wire as `reference_id`. Two fields
        // because the two gateways need different things — see `PreDebitInput`.
        referenceId: mandate.referenceId,
        notificationRef,
        providerMandateId: mandate.providerMandateId,
        amountPaise: debit.amountPaise,
        currency: debit.currency,
        cycleDate: debit.cycleDate,
        notBefore,
      });

      await this.pdns.applyDispatchResult(armed.id, {
        status: result.status,
        presentationSequenceId: result.presentationSequenceId,
        // NULL for a gateway that reports its own instant — `applyStatus` writes
        // that one when the status read learns it, and a null here is "leave it
        // alone", never "erase it".
        scheduledDebitAt: notBefore,
        rawCreateResponse: redactPayload(result.raw),
      });
      const sentAt = new Date();

      const outcome = await this.reconcileLedger(
        armed,
        debit,
        mandate,
        now,
        {
          status: result.status,
          presentationSequenceId: result.presentationSequenceId,
          providerTxnId: result.providerTxnId,
          failureMessage: null,
        },
        "scheduler"
      );
      await paymentLedgerAnalytics.trackPdnSent({
        mandate,
        txn: debit,
        pdn: armed,
        notificationRef,
        providerStatus: result.status,
        hasSequenceId: result.presentationSequenceId !== null,
        occurredAt: sentAt,
      });
      return outcome;
    } catch (err) {
      return this.handleDispatchError(err, armed, debit, mandate, now);
    }
  }

  /**
   * A delivery confirmation moves the presentation instant to
   * `deliveredAt + TAT` — but ONLY ever LATER.
   *
   * The turnaround runs from when the notification reached the payer, and the
   * best figure available at dispatch is our own call instant, which is earlier
   * by however long delivery took. That makes the stored instant optimistic, and
   * optimistic is the expensive direction: presenting before the gateway will
   * accept it spends the order, burns `MAX_PRESENTATION_RETRIES`, settles the
   * cycle failed, and NPCI revokes a mandate whose FIRST debit fails.
   *
   * MONOTONIC, deliberately. A redelivered or out-of-order webhook can only push
   * the window out, never pull it in, so no sequence of callbacks can cause an
   * early charge. Combined with `cycleDate` still being a hard floor in
   * `canPresentDebit`, there is no input to this method that can make a debit
   * happen sooner than it already would.
   *
   * A no-op for a gateway that reports its own instant (`presentationTatHours`
   * null): its answer is a fact and must not be displaced by our arithmetic.
   */
  async recordNotificationDelivered(
    pdn: PdnRow,
    providerName: string,
    deliveredAt: Date
  ): Promise<void> {
    let provider: MandateProvider;
    try {
      provider = this.resolve(providerName);
    } catch {
      // A callback from a gateway this build cannot construct. The sweep already
      // reports that loudly, every tick, for as long as it lasts; failing the
      // callback here would only turn a logged condition into a 500.
      return;
    }

    const derived = synthesiseDebitInstant(provider, deliveredAt);
    if (!derived) return;
    if (pdn.scheduledDebitAt && pdn.scheduledDebitAt >= derived) return;

    await this.pdns.applyStatus(pdn.id, {
      // Unchanged — this call is about the instant and nothing else. Passing the
      // row's own values keeps `applyStatus`'s "null means leave it alone" rule
      // from touching either.
      status: pdn.status as PdnStatus,
      presentationSequenceId: null,
      scheduledDebitAt: derived,
    });
    log.info(
      {
        ...paymentTrace({
          stage: PAYMENT_STAGE.pdn,
          userId: pdn.userId,
          mandateId: pdn.mandateId,
          referenceId: pdn.referenceId,
          pdnId: pdn.id,
          provider: provider.name,
        }),
        event: "pdn_delivery_confirmed",
        cycle_date: isoDay(pdn.cycleDate),
        delivered_at: deliveredAt.toISOString(),
        scheduled_debit_at: derived.toISOString(),
      },
      "notification delivery confirmed — presentation held until the gateway's turnaround from THAT instant"
    );
    // Only ever reached from a gateway callback (`CallbackService`). The debit
    // row is read so both events carry its `attempt_number` (and ids); a failed
    // read costs those properties, never the callback.
    const debit = await this.findDebitForAnalytics(pdn.id);
    await paymentLedgerAnalytics.trackPdnStatus({
      pdn,
      txn: debit,
      provider: provider.name,
      status: "delivered",
      source: "webhook",
    });
    await paymentLedgerAnalytics.trackPaymentScheduled({
      pdn,
      txn: debit,
      provider: provider.name,
      reason: "notification_delivered",
      scheduledFor: derived,
      previousScheduledFor: pdn.scheduledDebitAt,
      source: "webhook",
    });
  }

  /**
   * Ask the provider what became of a notification, and act on the answer.
   *
   * THE convergence point for the status poll and the webhook, and the only place a
   * sequence id is written from a provider read.
   */
  async refreshFromProvider(
    pdn: PdnRow,
    now: Date,
    /** How this read was triggered — reported on the ledger events it causes. */
    source: LedgerEventSource = "poll"
  ): Promise<PdnOutcome> {
    const debit = await this.transactions.findByPdnId(pdn.id);
    if (!debit) {
      // The money row was superseded out from under this notification. Nothing to
      // advance; the replacement claim carries its own dispatch.
      return NOTHING;
    }

    let status;
    try {
      status = await this.resolve(debit.provider).getPreDebitStatus({
        referenceId: pdn.referenceId,
        presentationSequenceId: pdn.presentationSequenceId,
      });
    } catch (err) {
      if (err instanceof NoSuchDebitError) {
        // The gateway looked and has nothing. The one answer that makes a stranded
        // cycle safely re-claimable — surfaced to the caller, which owns the
        // supersede decision because it owns the money row.
        log.warn(
          {
            ...paymentTrace({
              stage: PAYMENT_STAGE.pdn,
              mandateId: pdn.mandateId,
              referenceId: pdn.referenceId,
              transactionId: debit.id,
              pdnId: pdn.id,
              provider: debit.provider,
            }),
            event: "pdn_not_found_at_provider",
            cycle_date: isoDay(pdn.cycleDate),
          },
          "provider has no record of this notification — the cycle can be superseded"
        );
        throw err;
      }
      // Fail SOFT. A provider blip must not advance anything: the row keeps its
      // state and the next sweep asks again.
      log.warn(
        {
          ...paymentTrace({
            stage: PAYMENT_STAGE.pdn,
            mandateId: pdn.mandateId,
            referenceId: pdn.referenceId,
            transactionId: debit.id,
            pdnId: pdn.id,
            provider: debit.provider,
          }),
          event: "pdn_status_poll_failed",
          cycle_date: isoDay(pdn.cycleDate),
          reason: safeFailureMessage(err),
        },
        "pre-debit notification status poll failed — leaving it unresolved"
      );
      return { ...NOTHING, deferred: true };
    }

    await this.pdns.applyStatus(pdn.id, {
      status: status.status,
      presentationSequenceId: status.presentationSequenceId,
      failureReason: status.failureMessage,
      // The provider's own debit instant, once it reports one. This is the ONLY
      // place it can be learned — it exists on the status read, not the dispatch
      // response — which is why the row is seeded with the cycle date's midnight
      // and corrected here.
      scheduledDebitAt: status.scheduledDebitAt ?? undefined,
      rawLatestStatus: redactPayload(status.raw),
    });

    // The notification already carries both ids `reconcileLedger` needs, so there
    // is no reason to re-read the mandate here — and no cast, because that
    // parameter is a `Pick` precisely so this path does not have to pretend to
    // hold a whole row.
    const outcome = await this.reconcileLedger(
      pdn,
      debit,
      { id: pdn.mandateId, userId: pdn.userId },
      now,
      {
        status: status.status,
        presentationSequenceId: status.presentationSequenceId,
        providerTxnId: null,
        failureMessage: status.failureMessage,
      },
      source
    );
    if (hasDebitInstantMoved(pdn.scheduledDebitAt, status.scheduledDebitAt)) {
      await paymentLedgerAnalytics.trackPaymentScheduled({
        txn: debit,
        pdn,
        reason: "provider_reported",
        scheduledFor: status.scheduledDebitAt,
        previousScheduledFor: pdn.scheduledDebitAt,
        source,
      });
    }
    return outcome;
  }

  /**
   * Poll every notification still waiting on a sequence id.
   *
   * The stage that makes an asynchronous notify workable at all. Returns the
   * per-outcome counts the billing report surfaces.
   */
  async resolvePendingSequenceIds(
    now: Date,
    onOrAfterCycle: Date,
    only: string | null = null
  ): Promise<{ resolved: number; rearmed: number; deferred: number }> {
    const stale = new Date(now.getTime() - PDN_SEQUENCE_ID_STALE_MS);
    const waiting = await this.pdns.findAwaitingSequenceId(stale, onOrAfterCycle);

    let resolved = 0;
    let rearmed = 0;
    let deferred = 0;
    for (const pdn of waiting) {
      // `pdn_notifications` carries no provider column, so a scoped run has to
      // filter through the ledger row. Worth the extra read: this stage is NOT
      // read-only despite polling a status — `refreshFromProvider` can re-arm a
      // notification (spending one of a finite budget) or write the cycle off
      // entirely, and a run scoped to one gateway during an incident must not
      // be doing either to another gateway's cycles.
      if (only !== null) {
        const debit = await this.transactions.findByPdnId(pdn.id);
        if (!debit || debit.provider !== only) continue;
      }
      try {
        const outcome = await this.refreshFromProvider(pdn, now);
        if (outcome.accepted) resolved += 1;
        if (outcome.rearmed) rearmed += 1;
        if (outcome.deferred || outcome.awaitingSequenceId) deferred += 1;
      } catch (err) {
        if (err instanceof NoSuchDebitError) {
          // Left for `recoverFailedNotifications`, which owns supersede because it
          // owns the money row. Counted as deferred rather than silently dropped.
          deferred += 1;
          continue;
        }
        throw err;
      }
    }
    return { resolved, rearmed, deferred };
  }

  /**
   * Resolve the notification a callback is about, by OUR reference first.
   *
   * Order matters and the first lookup is the one that makes this work: a PDN
   * callback carries the NOTIFICATION's `reference_id`, not the mandate's. Looking
   * the mandate up by that reference — which is what the callback path did before
   * this method existed — misses every time, so every PDN callback was dropped as
   * an unknown reference and it looked exactly like the provider not sending them.
   */
  async findForCallback(ref: {
    referenceId: string | null;
    presentationSequenceId: string | null;
  }): Promise<PdnRow | null> {
    if (ref.referenceId) {
      const byOurs = await this.pdns.findByReferenceId(ref.referenceId);
      if (byOurs) return byOurs;
    }
    if (ref.presentationSequenceId) {
      return this.pdns.findByPresentationSequenceId(ref.presentationSequenceId);
    }
    return null;
  }

  // ---- internals -------------------------------------------------------------

  /** The notification's debit row, for analytics decoration only — `null` on any failure. */
  private async findDebitForAnalytics(pdnId: string): Promise<RecurringDebitRow | null> {
    try {
      return await this.transactions.findByPdnId(pdnId);
    } catch (err) {
      log.warn(
        { err, event: "pdn_debit_lookup_failed", pdn_id: pdnId },
        "could not read the debit row for a ledger event — attempt_number omitted"
      );
      return null;
    }
  }

  /**
   * Bring the money row into line with what the provider said about the
   * notification. One place, so dispatch and refresh can never diverge.
   */
  private async reconcileLedger(
    pdn: PdnRow,
    debit: RecurringDebitRow,
    mandate: Pick<MandateRow, "id" | "userId">,
    now: Date,
    result: {
      status: string;
      presentationSequenceId: string | null;
      providerTxnId: string | null;
      failureMessage: string | null;
    },
    source: LedgerEventSource
  ): Promise<PdnOutcome> {
    const base = {
      ...paymentTrace({
        stage: PAYMENT_STAGE.pdn,
        mandateId: mandate.id,
        userId: mandate.userId,
        // The notification's own reference — what the gateway and its webhooks
        // key this cycle on — not the mandate's.
        referenceId: pdn.referenceId,
        transactionId: debit.id,
        pdnId: pdn.id,
        provider: debit.provider,
      }),
      cycle_date: isoDay(pdn.cycleDate),
    };

    if (result.presentationSequenceId) {
      await this.transactions.markNotified(debit.id, {
        presentationSequenceId: result.presentationSequenceId,
        gatewayPaymentId: result.providerTxnId,
        at: now,
      });
      log.info(
        {
          ...base,
          event: "pdn_accepted",
          presentation_sequence_id: result.presentationSequenceId,
        },
        "pre-debit notification is addressable — a debit can be presented"
      );
      await paymentLedgerAnalytics.trackPdnStatus({ txn: debit, pdn, status: "accepted", source });
      return { ...NOTHING, accepted: true };
    }

    if (TERMINAL_PDN_STATUSES.includes(result.status as never)) {
      return this.failOrRearm(pdn, debit, mandate, result.failureMessage, source);
    }

    // Accepted, no id yet. The normal asynchronous answer.
    await this.transactions.markNotifyAccepted(debit.id, { at: now });
    log.info(
      { ...base, event: "pdn_awaiting_sequence_id", pdn_status: result.status },
      "notification accepted; waiting on the presentation sequence id"
    );
    await paymentLedgerAnalytics.trackPdnStatus({
      txn: debit,
      pdn,
      status: "awaiting_sequence_id",
      source,
    });
    return { ...NOTHING, awaitingSequenceId: true };
  }

  /**
   * Terminal notification: re-arm if there is budget AND no sequence id is held,
   * otherwise write the cycle off.
   *
   * The "no sequence id held" half is enforced inside `PdnRepository.rearm` rather
   * than trusted here, and it is what makes an unrecognised provider status safe to
   * read as `failed`: a spurious failure can never clear a valid notification.
   */
  private async failOrRearm(
    pdn: PdnRow,
    debit: RecurringDebitRow,
    mandate: Pick<MandateRow, "id" | "userId">,
    failureMessage: string | null,
    source: LedgerEventSource
  ): Promise<PdnOutcome> {
    const reason = failureMessage ?? "provider reported the notification failed";

    if (pdn.attempts + 1 < MAX_PDN_DISPATCH_ATTEMPTS) {
      const rearmed = await this.pdns.rearm(pdn.id, {
        referenceId: PdnService.newReferenceId(),
        currentAttempts: pdn.attempts,
      });
      if (rearmed) {
        log.warn(
          {
            ...paymentTrace({
              stage: PAYMENT_STAGE.pdn,
              userId: mandate.userId,
              mandateId: mandate.id,
              // The reference the FAILED attempt went out under; `rearm` has
              // already rotated the row to a fresh one for the next send.
              referenceId: pdn.referenceId,
              transactionId: debit.id,
              pdnId: pdn.id,
              provider: debit.provider,
            }),
            event: "pdn_rearmed",
            cycle_date: isoDay(pdn.cycleDate),
            attempts: pdn.attempts + 1,
            reason,
          },
          "notification re-armed for another dispatch attempt"
        );
        await paymentLedgerAnalytics.trackPdnStatus({
          txn: debit,
          pdn,
          status: "rearmed",
          source,
          failureReason: reason,
        });
        return { ...NOTHING, rearmed: true };
      }
    }

    await this.fail(pdn, debit, reason, source);
    return { ...NOTHING, failed: true };
  }

  /** Write the cycle off on both rows, with the same reason on each. */
  private async fail(
    pdn: PdnRow,
    debit: RecurringDebitRow,
    reason: string,
    source: LedgerEventSource
  ): Promise<void> {
    await this.pdns.markFailed(pdn.id, reason);
    await this.transactions.markNotifyFailed(debit.id, {
      failureCode: "PDN_ERROR",
      failureMessage: reason,
    });
    log.error(
      {
        ...paymentTrace({
          stage: PAYMENT_STAGE.pdn,
          userId: pdn.userId,
          mandateId: pdn.mandateId,
          referenceId: pdn.referenceId,
          transactionId: debit.id,
          pdnId: pdn.id,
          provider: debit.provider,
        }),
        event: "pdn_failed",
        cycle_date: isoDay(pdn.cycleDate),
        amount_paise: debit.amountPaise,
        failure_code: "PDN_ERROR",
        failure_message: reason,
        recoverable: false,
        next_step: "no_debit_this_cycle",
      },
      // ERROR, not warn: this is lost revenue and a user who silently stops being
      // Pro.
      "pre-debit notification FAILED — no debit is possible this cycle"
    );
    await paymentLedgerAnalytics.trackPdnStatus({
      txn: debit,
      pdn,
      status: "failed",
      source,
      failureReason: reason,
    });
  }

  /**
   * Translate a dispatch failure into the right action.
   *
   * Three provider answers need three different responses, and conflating them is
   * how a working cycle gets abandoned:
   *
   *   TOO SOON   premature in the 24–48h window. DEFER — the row keeps its state
   *              and the next tick, 30 minutes later, is inside the window.
   *              Recording it as a failure would burn a re-arm and eventually
   *              abandon a cycle nothing was ever wrong with.
   *   DUPLICATE  the gateway has already seen our reference, so the PREVIOUS
   *              attempt landed. RECONCILE by reading status — never re-arm, which
   *              would abandon a notification the gateway considers live.
   *   anything   a real failure.
   */
  private async handleDispatchError(
    err: unknown,
    pdn: PdnRow,
    debit: RecurringDebitRow,
    mandate: MandateRow,
    now: Date
  ): Promise<PdnOutcome> {
    if (err instanceof PreDebitTooSoonError) {
      log.info(
        {
          ...paymentTrace({
            stage: PAYMENT_STAGE.pdn,
            mandate,
            referenceId: pdn.referenceId,
            transactionId: debit.id,
            pdnId: pdn.id,
          }),
          event: "pdn_deferred_too_soon",
          cycle_date: isoDay(pdn.cycleDate),
        },
        "provider says it is too early for this notification — deferring to a later tick"
      );
      await paymentLedgerAnalytics.trackPdnStatus({
        mandate,
        txn: debit,
        pdn,
        status: "deferred",
        source: "scheduler",
      });
      return { ...NOTHING, deferred: true };
    }

    if (err instanceof DuplicateReferenceError) {
      log.warn(
        {
          ...paymentTrace({ stage: PAYMENT_STAGE.pdn, mandate, pdnId: pdn.id }),
          event: "pdn_duplicate_reference",
          cycle_date: isoDay(pdn.cycleDate),
        },
        "provider already has this reference — reconciling by status rather than re-arming"
      );
      try {
        return await this.refreshFromProvider(pdn, now, "scheduler");
      } catch {
        // Including NoSuchDebitError: contradictory, and not ours to resolve here.
        return { ...NOTHING, deferred: true };
      }
    }

    const reason = safeFailureMessage(err);
    await this.pdns.applyDispatchResult(pdn.id, {
      status: "failed",
      presentationSequenceId: null,
      failureReason: reason,
    });
    return this.failOrRearm(pdn, debit, mandate, reason, "scheduler");
  }
}
