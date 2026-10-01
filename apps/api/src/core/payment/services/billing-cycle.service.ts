import { randomUUID } from "node:crypto";
import {
  FAILURE_SUB_CODE,
  type FailureSubCode,
} from "@api/core/payment/failure-sub-code";
import { createModuleLogger } from "@api/shared/logs";
import { performServiceCall } from "@api/shared/workspace";
import { reportTransactionConversion } from "./payment-conversions.js";
import type {
  MandateRepository,
  MandateRow,
} from "@api/core/payment/repositories/mandate.repository.js";
import type {
  RecurringDebitRow,
  TransactionRow,
  TransactionsRepository,
} from "@api/core/payment/repositories/transactions.repository.js";
import type {
  MandateProvider,
  PreDebitStatusResult,
  ProviderResolver,
} from "@api/core/payment/mandate.provider.js";
import {
  NoSuchDebitError,
  PreDebitTooSoonError,
} from "@api/core/payment/mandate.provider.js";
import type { MandateService } from "./mandate.service.js";
import type { PdnService } from "./pdn.service.js";
import type { PdnRepository } from "@api/core/payment/repositories/pdn.repository.js";
import type { BillingCycleReport } from "@api/core/payment/types";
import { isoDay, moneyLog, paymentTrace, safeFailureMessage, PAYMENT_STAGE } from "./payment-log.js";
import { paymentAnalytics } from "./payment-analytics.service.js";
import {
  paymentLedgerAnalytics,
  type LedgerEventSource,
} from "./payment-ledger-analytics.service.js";
import {
  addDays,
  addMonthClamped,
  canPresentDebit,
  canSendPreDebitNotification,
  isPdnBlackout,
  istDateOnly,
} from "./npci-window.js";

const log = createModuleLogger("payment:billing-cycle");

/**
 * What a settled debit leaves behind for reconciliation. Structural, so both a
 * `presentDebit` response and a `getDebitStatus` read satisfy it.
 */
interface SettlementTrail {
  /**
   * The GATEWAY's own payment id. Required on a settled row — the
   * `transactions_settled_has_gateway_id` CHECK refuses `succeeded` without it,
   * because money that moved and cannot be traced is the exact hole this ledger
   * was built to close. It arrives here rather than at notify time because some
   * gateways only mint it once the debit is actually presented.
   */
  providerTxnId: string | null;
  bankReferenceNumber: string | null;
  npciTransactionId: string | null;
}

/**
 * In-day presentation retries for a FIRST debit, before it is re-armed for a
 * fresh cycle tomorrow. Renewals no longer use this: each renewal failure is
 * one attempt per day, bounded by `RENEWAL_RETRY_DAYS` instead.
 */
export const MAX_PRESENTATION_RETRIES = 3;
/**
 * Characters Decentro rejects in a narration, with `error_unsanitized_values`.
 *
 * Note what is NOT here and matters: the HYPHEN is permitted, which is what lets an
 * ISO date be included below. The dot is not.
 */
const UNSANITIZED_NARRATION = /[.@#$%^&*!;:'"~`?=+()]/g;

/**
 * Decentro's own length window for this field, per its
 * `error_invalid_purpose_message_length`.
 */
const NARRATION_MIN = 5;
const NARRATION_MAX = 50;

/** Used when sanitising leaves too little to satisfy the minimum. */
const NARRATION_FALLBACK = "Prabhuji VIP renewal";

/**
 * Narration sent with the presentation, and shown to the payer by their bank.
 *
 * REQUIRED by Decentro's presentation endpoint — omitting it, which is what the
 * adapter did, rejects the call on a missing mandatory field. Built here rather than
 * in the adapter because it is a business string, not a wire concern.
 *
 * Both constraints are enforced rather than assumed, because a rejected presentation
 * is a lost billing cycle and this string is the only free-text field in the call.
 * The cycle date is included so a payer querying a charge can match it to a month;
 * `isoDay` uses hyphens, which Decentro permits.
 */
function presentationNarration(cycleDate: Date): string {
  const candidate = `Prabhuji VIP renewal ${isoDay(cycleDate)}`
    .replace(UNSANITIZED_NARRATION, "")
    .trim();
  const safe =
    candidate.length >= NARRATION_MIN ? candidate : NARRATION_FALLBACK;
  return safe.slice(0, NARRATION_MAX);
}

/**
 * A zeroed report.
 *
 * Extracted because `notifyFirstCycleNow` needs one too: it goes through the
 * same `claimAndNotify` as the sweep, and that path counts what it did. Its
 * counters are logged rather than returned — the caller is a user's mandate
 * approval, not a scheduler run — but they must still be counted somewhere
 * rather than passed a partial object that silently drops a field the next
 * counter adds.
 */
function emptyReport(now: Date, dryRun: boolean): BillingCycleReport {
  return {
    ranAt: now.toISOString(),
    expiredSwept: 0,
    pdnSent: 0,
    pdnFailed: 0,
    pdnAwaitingSequenceId: 0,
    pdnSequenceIdsResolved: 0,
    pdnRearmed: 0,
    pdnDeferred: 0,
    pdnAbandoned: 0,
    presentationsSent: 0,
    reconciled: 0,
    skippedOutsideWindow: 0,
    notificationsAdopted: 0,
    cyclesSuperseded: 0,
    dryRun,
    lockBusy: false,
  };
}

/**
 * How long after a mandate goes ACTIVE we wait before raising its first
 * notification (TAM-164).
 *
 * A gateway does not necessarily consider a just-approved mandate usable the
 * instant it tells us so. Razorpay's token is confirmed by webhook and read back
 * by listing the customer's tokens; creating a notification order against it in
 * the same breath can be refused, and a refusal is not free — a generic dispatch
 * failure spends one of `MAX_PDN_DISPATCH_ATTEMPTS`, so three of them write the
 * cycle off entirely. Ten minutes buys the token time to settle and costs
 * nothing: the debit itself is a day away, and the turnaround that governs it
 * (`presentationTatHours`) runs from the NOTIFICATION, so a later notification
 * simply moves the debit later by the same amount — it cannot bring it forward.
 *
 * NOT a correctness mechanism, and it must never become one. It is an in-process
 * delay, so a deploy or a crash inside the window drops it — which is fine,
 * because the sweep finds exactly the same mandate on its next tick and raises
 * exactly the same notification. The wait is a latency and success-rate
 * optimisation over a durable fallback, never a substitute for one.
 */
export const PDN_ACTIVATION_DELAY_MS = 10 * 60_000;

/**
 * Dunning window for a RENEWAL — how long the subscriber stays entitled after a
 * failed debit, and, identically, how long we keep retrying it.
 *
 * The two are deliberately ONE number. A grace period that outlasts the retries
 * gives away paid content nobody is still trying to charge for; retries that
 * outlast grace debit someone we have already locked out. Seven daily attempts
 * over seven entitled days keeps "we are still trying" and "you are still Pro"
 * the same statement.
 *
 * Counted from `findRenewalDunningAnchor` — the first failure of this sequence —
 * never from `now`, or each day's failure would push the deadline a day further
 * out and the window would never close.
 */
export const RENEWAL_RETRY_DAYS = 7;

/**
 * How long a declined FIRST full-price debit keeps being re-armed for a fresh
 * cycle before the subscription is written off, counted from the trial's end.
 *
 * The first ₹299 is the first time a trial user's account is touched for real
 * money, and "insufficient balance" on that day says nothing about the next.
 * NPCI revokes a mandate only when the execution that CREATED it fails — on
 * Razorpay that is the ₹2 authorization, which already succeeded — so after a
 * declined first debit the mandate is normally still live: 41 of 43 were, on
 * the day this was measured, and every one had been written off as "revoked
 * by NPCI, user must re-register". Three days mirrors `GRACE_DAYS` for
 * renewals; unlike grace it GRANTS nothing, because nothing was ever paid.
 */
export const FIRST_DEBIT_RETRY_DAYS = 3;

/**
 * The last cycle date a declined first debit may be re-armed for, or `null`
 * for a mandate that carries no trial end (legacy rows), which means no
 * re-arm at all — an open-ended retry against an unknown anchor would never
 * stop.
 */
function firstDebitRetryUntil(mandate: MandateRow): Date | null {
  if (!mandate.trialEndsAt) return null;
  return addDays(istDateOnly(mandate.trialEndsAt), FIRST_DEBIT_RETRY_DAYS);
}
/** A presentation with no settlement after this long gets reconciled. */
const UNSETTLED_AFTER_MS = 2 * 60 * 60_000;

/**
 * The recurring-debit engine. One `run()` = one scheduler tick.
 *
 * Runs every 30 minutes, and is mostly a no-op: the NPCI timing rules mean
 * only a few ticks a day are eligible to do anything. That is deliberate —
 * encoding the windows here rather than in a cron expression means the next
 * regulatory change is a deploy, not a `terraform apply`.
 *
 * Every step is safe to run twice. The scheduler is a one-off ECS task so
 * overlap should not happen, but "should not" is not a guarantee worth
 * betting a double charge on, and the `(mandateId, cycleDate)` unique
 * constraint makes it structurally impossible rather than merely unlikely.
 */
export class BillingCycleService {
  /**
   * NO injected gateway. The sweep is the one place that MUST be provider-blind
   * in its queries and provider-aware in its dispatch: `findDueForPdn`,
   * `findAwaitingSubmission`, `findUnsettled` and friends deliberately return
   * rows across every gateway — a mandate is due when it is due, whoever
   * registered it — and each row is then acted on through its OWN adapter,
   * resolved from `mandate.provider` / `transaction.provider`.
   *
   * This used to be a single injected `MandateProvider` used for every row.
   * With one gateway that was indistinguishable from correct; with two it means
   * the first tick after a gateway switch presents every existing mandate
   * against a gateway that has never seen its ids.
   */
  constructor(
    private readonly mandates: MandateRepository,
    private readonly transactions: TransactionsRepository,
    private readonly resolve: ProviderResolver,
    private readonly mandateService: MandateService,
    private readonly pdnService: PdnService,
    private readonly pdns: PdnRepository,
    private readonly options: { managedByProvider: boolean }
  ) {}

  /**
   * Rows this run is allowed to touch, when it is restricted to one gateway.
   *
   * Applied as an in-loop skip rather than a predicate on each finder query:
   * the queries are shared with the unrestricted run (the normal case), and a
   * filter that has to be remembered in five separate `where` clauses is a
   * filter that will eventually be forgotten in one of them. Skipping in the
   * loop cannot be partially applied.
   */
  private skips(only: string | null, provider: string): boolean {
    return only !== null && provider !== only;
  }

  async run(
    now: Date,
    dryRun = false,
    only: string | null = null
  ): Promise<BillingCycleReport> {
    const report = emptyReport(now, dryRun);

    // 1. Sweep lapsed subscriptions so `status` agrees with what the read path
    //    has already been reporting. Cosmetic for access control, load-bearing
    //    for admin views and analytics.
    if (!dryRun) {
      report.expiredSwept = await performServiceCall(
        "subscription",
        (api) => api.expireLapsed(now),
        "payment:billing-expire",
        "failed to sweep expired subscriptions"
      );
    }

    // 2+3. If the provider drives debits itself, ours must NOT — both firing
    //      would double-charge every user. Env-gated so the discovery that
    //      `is_managed_by_decentro` means what we think can be acted on
    //      without a code change.
    if (this.options.managedByProvider) {
      log.info(
        { event: "billing_cycle_delegated" },
        "provider manages debits — skipping PDN + presentation"
      );
    } else {
      await this.sendDuePreDebitNotifications(now, dryRun, report, only);
      // 2.5. Rescue cycles whose notification failed in TRANSPORT. Without this
      //      the cycle stays claimed forever: `claimRecurringCycle` is
      //      insert-first, so the failed row keeps the cycle and every later
      //      tick skips the mandate silently. That is not hypothetical — it
      //      stranded two live subscriptions in prod on 2026-07-29.
      await this.recoverFailedNotifications(now, dryRun, report, only);
      // 2.75. Resolve notifications the provider accepted but issued no sequence
      //       id for. BEFORE presentation, so an id arriving now can still be
      //       presented this tick instead of waiting another thirty minutes.
      await this.resolvePendingNotifications(now, dryRun, report, only);
      await this.presentDueDebits(now, dryRun, report, only);
      // 2.9. Write off cycles whose debit date passed without a usable
      //      notification. LAST among the PDN stages, so a cycle that became
      //      addressable earlier in this same tick is not swept out from under
      //      itself.
      await this.abandonLapsedCycles(now, dryRun, report, only);
    }

    // 4. Reconcile stragglers — the net for a callback that never arrived.
    await this.reconcileUnsettled(now, dryRun, report, only);
    await this.reconcileStaleMandates(now, dryRun, only);

    // WARN when the run left money on the table, so a failing cycle is visible
    // in a log viewer filtered to warn+ rather than buried in a stream of
    // identical successful ticks (they run every 30 minutes, all day).
    const degraded =
      report.pdnFailed > 0 ||
      report.cyclesSuperseded > 0 ||
      // Always a bug. A cycle reaching its debit date with no addressable
      // notification is revenue that will never be collected, and the whole
      // reason the 2026-08-03 stall ran for five days at `info` is that no
      // condition here covered it.
      report.pdnAbandoned > 0;
    const line = { event: "billing_cycle_complete", ...report };
    if (degraded) {
      log.warn(line, "billing cycle run — WITH FAILURES");
    } else {
      log.info(line, "billing cycle run");
    }
    return report;
  }

  /**
   * Get the debit registered 24–48h ahead, so its pre-debit notification can
   * reach the payer in time.
   *
   * WHO ACTUALLY NOTIFIES DEPENDS ON THE GATEWAY, and the two are not alike:
   *
   *   Cashfree — nobody here notifies. We SCHEDULE the charge
   *     (`POST /subscriptions/pay`, `payment_type: CHARGE`, with a
   *     `payment_schedule_date`); Cashfree registers it with NPCI, and the
   *     payer's own bank or UPI app delivers the notice ~24h before, as RBI
   *     requires. There is no merchant-facing "send a PDN" endpoint at all.
   *     Cashfree then executes on the scheduled date, which is why
   *     `presentDebit` is a READ for this adapter.
   *
   *   Decentro — we DO notify, explicitly (`POST /mandate/notify`), and money
   *     moves later on a separate presentation call.
   *
   * Either way the lead time is the point: RBI mandates 24h of notice, so a
   * debit whose notification never went out is refused outright, and a missed
   * one silently loses a month of revenue and lapses a paying user.
   *
   * `MandateProvider.chargePhase` is how the rest of this service tells the two
   * apart without branching on a provider name — for Cashfree the call below is
   * already the irreversible one.
   */
  private async sendDuePreDebitNotifications(
    now: Date,
    dryRun: boolean,
    report: BillingCycleReport,
    only: string | null
  ): Promise<void> {
    const today = istDateOnly(now);
    // ONE DAY BACK as well as three forward. The look-back exists for the
    // stranded-cycle repair below: a first cycle whose date has already passed
    // is exactly the one that needs moving, and a window that starts at today
    // could never see it — so a fix deployed after midnight would leave the
    // previous day's stranded mandates permanently unbillable. Harmless for
    // everything else in range: a lapsed cycle that IS presentable fails
    // `canSendPreDebitNotification` (negative lead) and is skipped as before,
    // and the repair's own gates refuse to move it.
    // The look-back reaches as far as a declined first debit may still be
    // re-armed, so a cycle written off before a fix landed is seen again.
    const due = await this.mandates.findDueForPdn(
      addDays(today, -FIRST_DEBIT_RETRY_DAYS),
      addDays(today, 3)
    );

    for (const mandate of due) {
      if (this.skips(only, mandate.provider)) continue;
      const cycleDate = mandate.nextDebitDate;
      if (!cycleDate) continue;
      // Resolved before the window check, because the window itself is
      // per-gateway: the 24h floor is regulation, but the ceiling is a vendor
      // contract and they disagree. Razorpay debits ~25h after the notification
      // is delivered, so a notification raised 48h out — fine for Decentro —
      // simply never becomes a debit there.
      let provider;
      try {
        provider = this.resolve(mandate.provider);
      } catch (err) {
        // A live mandate on a gateway this process cannot build. Never silent:
        // every affected subscriber stops being debited until it is configured.
        log.error(
          {
            err,
            ...paymentTrace({ stage: PAYMENT_STAGE.pdn, mandate }),
            event: "mandate_provider_unavailable",
          },
          "mandate names a gateway this build cannot resolve, or whose credentials are missing — skipping the row"
        );
        continue;
      }
      if (!canSendPreDebitNotification(cycleDate, now, provider.pdnLeadHours)) {
        // A cycle whose lead has fallen BELOW the floor can never recover on its
        // own: the lead only shrinks as the clock advances, so every later tick
        // asks the same question and gets the same no, forever. Nothing else
        // notices — the mandate stays `active`, no cycle is ever claimed, and
        // there is no failed row for anyone to find. The subscriber simply stops
        // being billed, silently and permanently.
        //
        // It could not happen while every trial was three days long: the sweep
        // had a three-day window to hit a one-day band. A ONE-day trial leaves no
        // slack at all — the notification must go out on the registration day
        // itself — so a mandate activated inside the 23:50 IST PDN blackout has
        // its only chance taken away, and by 00:05 the lead is already 0.
        //
        // Move the cycle instead of dropping it. The user gets one more free day
        // and is then billed normally; `trial_ends_at` is deliberately NOT
        // touched, so entitlement keeps whatever it was granted at registration
        // and the two can never disagree about a date the payer was shown.
        //
        // Guarded on this being the mandate's FIRST cycle. A renewal that has
        // gone stale is a different fault with a different fix, and moving its
        // date would quietly hand a paying subscriber free time every month.
        const leadMs = cycleDate.getTime() - istDateOnly(now).getTime();
        const isBelowFloor = leadMs < provider.pdnLeadHours.min * 3_600_000;

        // NEVER ACTUALLY CHARGED. `countSettledRecurringDebits` rather than
        // `countRecurringDebitsForMandate`, and the difference is the whole
        // point: the latter counts ATTEMPTS, so a cycle that was claimed and
        // then stranded reports 1 and disqualifies its own repair. That is
        // exactly how 162 notifications died in a day — claimed, notified,
        // rejected by the gateway, and then ineligible for the one mechanism
        // that could have moved them. Settled is the honest question: has this
        // subscriber ever actually paid?
        const neverCharged =
          (await this.transactions.countSettledRecurringDebits(mandate.id)) === 0;

        // AND the cycle standing in the way has no usable notification. This is
        // what keeps the repair to the failure it is for. A cycle whose debit
        // was genuinely DECLINED holds a real notification with a sequence id,
        // and moving its date would hand the payer another free day and restart
        // dunning — a different fault with a different fix. Only a cycle that
        // could never have been presented at all is moved.
        // Asked of the LEDGER row, not the notification. The ledger is what
        // `findAwaitingSubmission` reads to decide presentability, so it is the
        // authoritative answer — and an absent notification row must not be
        // mistaken for an unpresentable cycle, which is a different thing.
        const existing = await this.transactions.findRecurringForCycle(
          mandate.id,
          cycleDate
        );
        const unpresentable = !existing?.presentationSequenceId;

        // OR a renewal in dunning. The guard above says moving a renewal's
        // date hands a paying subscriber free time — true of a renewal that
        // merely went stale, and NOT true of one `onDebitFailed` re-armed for
        // tomorrow: that subscriber is `past_due`, grace is pinned to the first
        // failure, so moving the cycle a day extends nothing. What it does is
        // keep the seven daily retries at seven. A failure reconciled on the
        // last tick of the IST day (a 23:00 presentation, resolved 23:30) is
        // re-armed for "tomorrow", but its notification goes out on the NEXT
        // tick, which is past midnight — by then "tomorrow" is today and the
        // lead is 0h, so without this the cycle is stranded exactly like a
        // first cycle would be, and the subscriber gets one retry, not seven.
        // Bounded by the retry window: a cycle that would land past it is left
        // alone, since grace is about to lapse the subscription anyway and a
        // notification for a debit that will never be presented is noise.
        const dunningSince = neverCharged
          ? null
          : await this.transactions.findRenewalDunningAnchor(mandate.id);
        const movedTo = addDays(istDateOnly(now), 1);
        const inDunningWindow =
          dunningSince !== null &&
          movedTo.getTime() <= addDays(dunningSince, RENEWAL_RETRY_DAYS).getTime();

        if (isBelowFloor && (neverCharged || inDunningWindow) && unpresentable && !dryRun) {
          await this.mandates.setNextDebitDate(mandate.id, movedTo);
          log.warn(
            {
              event: neverCharged ? "first_cycle_lead_repaired" : "renewal_lead_repaired",
              stage: PAYMENT_STAGE.pdn,
              user_id: mandate.userId,
              mandate_id: mandate.id,
              reference_id: mandate.referenceId,
              provider: provider.name,
              cycle_date: isoDay(cycleDate),
              moved_to: isoDay(movedTo),
              lead_hours: leadMs / 3_600_000,
              min_lead_hours: provider.pdnLeadHours.min,
              dunning_since: isoDay(dunningSince),
            },
            neverCharged
              ? "first debit fell inside the notification lead and could never be sent — moved it forward a day rather than stranding the mandate"
              : "re-armed renewal fell inside the notification lead before its PDN went out — moved it forward a day rather than losing the retry"
          );
        }

        // A first cycle that was PRESENTED and DECLINED — a real notification,
        // a real bank answer — on a mandate that is still live. Written off
        // before `onDebitFailed` learned to re-arm (or its re-arm was missed),
        // so nothing will ever claim this mandate again: re-arm it for
        // tomorrow while the retry window is open. Only a row settled `failed`
        // WITH a sequence id qualifies; a stranded claim is the repair above,
        // and a mandate the provider has since ended is not `active` here.
        const declined =
          existing?.status === "failed" &&
          existing.presentationSequenceId !== null;
        const rearmTo = addDays(istDateOnly(now), 1);
        const retryUntil = firstDebitRetryUntil(mandate);
        if (
          isBelowFloor &&
          neverCharged &&
          declined &&
          mandate.state === "active" &&
          retryUntil !== null &&
          rearmTo.getTime() <= retryUntil.getTime() &&
          !dryRun
        ) {
          await this.mandates.setNextDebitDate(mandate.id, rearmTo);
          log.warn(
            {
              ...paymentTrace({ stage: PAYMENT_STAGE.dunning, mandate, transactionId: existing.id }),
              event: "first_debit_rearmed",
              source: "sweep",
              cycle_date: isoDay(cycleDate),
              moved_to: isoDay(rearmTo),
              retry_until: isoDay(retryUntil),
              failure_code: existing.failureCode,
            },
            "declined first cycle on a live mandate had been written off — re-armed for a fresh notification tomorrow"
          );
        }

        report.skippedOutsideWindow += 1;
        continue;
      }
      if (dryRun) {
        report.pdnSent += 1;
        continue;
      }

      await this.claimAndNotify(mandate, cycleDate, provider, now, report);
    }
  }

  /**
   * Raise a freshly-activated mandate's FIRST notification immediately, instead
   * of waiting for the next sweep tick.
   *
   * WHY THIS EXISTS (TAM-164). The lead band is sampled at DAY granularity, so
   * for a one-day trial the cycle is only ever notifiable on the activation day
   * itself: at the next IST midnight the lead drops to zero and
   * `canSendPreDebitNotification` refuses it forever. The sweep runs every
   * thirty minutes and stops notifying at the 23:50 blackout, so a mandate
   * approved after the last usable tick of the day had NO tick left — it took
   * the registration deposit, stayed active, and was never billed. Nothing
   * noticed, because no cycle was ever claimed: there is no failed row to find.
   * Dispatching at activation removes the dependence on a tick existing.
   *
   * BEST EFFORT, DELIBERATELY. Every failure path here is swallowed after
   * logging: this runs inside a user's mandate approval, and an approval must
   * not fail because a notification could not be raised. The sweep remains the
   * fallback for every case this skips — nothing here is load-bearing on its
   * own, it only makes the common case earlier and the late-night case possible.
   *
   * SAFE TO RACE THE SWEEP. Both paths claim through
   * `claimRecurringCycle`, whose `UNIQUE (mandate_id, cycle_date)` makes a
   * second claim impossible; the loser gets `null` and stops. This is the same
   * guarantee two concurrent sweep runs already rely on, not a new one.
   */
  async notifyFirstCycleNow(mandate: MandateRow, now: Date): Promise<void> {
    const cycleDate = mandate.nextDebitDate;
    if (!cycleDate) return;

    let provider;
    try {
      provider = this.resolve(mandate.provider);
    } catch (err) {
      // The sweep logs this loudly every tick for as long as it lasts; repeating
      // it at approval volume would add noise, not information.
      log.info(
        {
          err,
          ...paymentTrace({ stage: PAYMENT_STAGE.pdn, mandate }),
          event: "activation_notify_provider_unavailable",
          provider: mandate.provider,
        },
        "cannot resolve the gateway to notify at activation — leaving this cycle to the sweep"
      );
      return;
    }

    // The SAME gate the sweep applies. A cycle further out than this gateway's
    // ceiling (every trial longer than the band, and every renewal) is simply
    // not due yet, and the sweep will raise it on the right day. Not an error,
    // and not counted as a skip — nothing was due.
    if (!canSendPreDebitNotification(cycleDate, now, provider.pdnLeadHours)) {
      return;
    }

    // WAIT — unless waiting would cost the cycle.
    //
    // `PDN_ACTIVATION_DELAY_MS` gives the gateway time to make the just-approved
    // mandate usable. But at a 24h lead this cycle is notifiable ONLY today: at
    // the next IST midnight the lead is zero and `canSendPreDebitNotification`
    // refuses it forever, and from 23:50 the blackout refuses it too. So a wait
    // that would land past either boundary is not a wait, it is losing the
    // cycle — and the whole reason this method exists is that a cycle lost that
    // way is silent. The delay yields.
    const dispatchAt = new Date(now.getTime() + PDN_ACTIVATION_DELAY_MS);
    const stillNotifiableAfterWaiting =
      !isPdnBlackout(dispatchAt) &&
      canSendPreDebitNotification(cycleDate, dispatchAt, provider.pdnLeadHours);

    if (stillNotifiableAfterWaiting) {
      this.scheduleFirstNotification(mandate, cycleDate, provider, dispatchAt);
      return;
    }

    log.info(
      {
        ...paymentTrace({ stage: PAYMENT_STAGE.pdn, mandate }),
        event: "activation_notify_delay_skipped",
        cycle_date: isoDay(cycleDate),
        delay_ms: PDN_ACTIVATION_DELAY_MS,
      },
      "waiting would push this notification past the blackout or the IST day boundary, after which the cycle can never be notified — raising it now instead"
    );

    const report = emptyReport(now, false);
    try {
      await this.claimAndNotify(mandate, cycleDate, provider, now, report);
    } catch (err) {
      log.error(
        {
          err,
          ...paymentTrace({ stage: PAYMENT_STAGE.pdn, mandate }),
          event: "activation_notify_failed",
          provider: mandate.provider,
          cycle_date: isoDay(cycleDate),
        },
        "could not raise the first notification at activation — the sweep will retry, and will report it if it cannot"
      );
      return;
    }

    log.info(
      {
        ...paymentTrace({ stage: PAYMENT_STAGE.pdn, mandate }),
        event: "activation_notify_done",
        provider: mandate.provider,
        cycle_date: isoDay(cycleDate),
        pdn_sent: report.pdnSent,
        pdn_awaiting_sequence_id: report.pdnAwaitingSequenceId,
        pdn_deferred: report.pdnDeferred,
        pdn_failed: report.pdnFailed,
      },
      "raised the first pre-debit notification at activation"
    );
  }

  /**
   * Arm the delayed dispatch for a mandate that has just gone active.
   *
   * FIRE AND FORGET, and `unref`'d — this must never hold a process open. A
   * shutdown inside the window simply drops the timer, and the sweep raises the
   * notification on its next tick instead. That is the whole durability story:
   * nothing here is the only path to anything.
   *
   * THE MANDATE IS RE-READ when the timer fires, not closed over. Five minutes
   * is long enough for it to have been cancelled in the payer's UPI app, and
   * notifying a dead mandate would mint a provider-side reference for a cycle
   * that can never be charged. `claimAndNotify` is idempotent under the
   * `(mandate_id, cycle_date)` unique index either way, so a sweep tick landing
   * in the same window is safe — the loser of the claim simply stops.
   */
  private scheduleFirstNotification(
    mandate: MandateRow,
    cycleDate: Date,
    provider: MandateProvider,
    dispatchAt: Date
  ): void {
    const delayMs = Math.max(0, dispatchAt.getTime() - Date.now());
    const timer = setTimeout(() => {
      void (async () => {
        const report = emptyReport(dispatchAt, false);
        try {
          const fresh = await this.mandates.findById(mandate.id);
          if (!fresh || fresh.state !== "active") {
            log.info(
              {
                ...paymentTrace({ stage: PAYMENT_STAGE.pdn, mandate }),
                event: "activation_notify_abandoned",
                state: fresh?.state ?? "gone",
              },
              "mandate stopped being active during the notification delay — not notifying"
            );
            return;
          }
          await this.claimAndNotify(fresh, cycleDate, provider, dispatchAt, report);
          log.info(
            {
              ...paymentTrace({ stage: PAYMENT_STAGE.pdn, mandate }),
              event: "activation_notify_done",
              provider: mandate.provider,
              cycle_date: isoDay(cycleDate),
              delayed_ms: PDN_ACTIVATION_DELAY_MS,
              pdn_sent: report.pdnSent,
              pdn_awaiting_sequence_id: report.pdnAwaitingSequenceId,
              pdn_deferred: report.pdnDeferred,
              pdn_failed: report.pdnFailed,
            },
            "raised the first pre-debit notification after the activation delay"
          );
        } catch (err) {
          // Swallowed on purpose: there is no caller left to hand this to — the
          // approval returned minutes ago. The sweep is the fallback and will
          // report it if the cycle really cannot be notified.
          log.error(
            {
              err,
              ...paymentTrace({ stage: PAYMENT_STAGE.pdn, mandate }),
              event: "activation_notify_failed",
              provider: mandate.provider,
              cycle_date: isoDay(cycleDate),
            },
            "delayed first notification failed — the sweep will retry"
          );
        }
      })();
    }, delayMs);
    // Never keep the process alive for this. A one-off billing task that has
    // finished its run must be allowed to exit, and a rolling deploy must not
    // wait five minutes per pending approval.
    timer.unref();

    log.info(
      {
        ...paymentTrace({ stage: PAYMENT_STAGE.pdn, mandate }),
        event: "activation_notify_scheduled",
        provider: mandate.provider,
        cycle_date: isoDay(cycleDate),
        dispatch_at: dispatchAt.toISOString(),
        delay_ms: delayMs,
      },
      "first pre-debit notification scheduled for shortly after activation"
    );
  }

  /**
   * Claim one cycle and raise its notification. THE only place a cycle is
   * claimed and notified — the sweep below and `notifyFirstCycleNow` above both
   * come through here, so there is one implementation of "start this cycle" and
   * not two that can drift.
   *
   * The caller owns the window check. Both callers make it against the SAME
   * `canSendPreDebitNotification`, but they reach it differently: the sweep asks
   * once per due mandate per tick, activation asks once, at the instant the
   * mandate goes live.
   */
  private async claimAndNotify(
    mandate: MandateRow,
    cycleDate: Date,
    provider: MandateProvider,
    now: Date,
    report: BillingCycleReport
  ): Promise<void> {
    // Claim the cycle FIRST. If a concurrent run already has it, this
    // returns null and we skip — no second PDN, and critically no second
    // debit. A new PDN also cancels the provider's prior pending one, so
    // firing twice would invalidate the sequence id we already hold.
    //
    // The count MUST be kind-filtered: every mandate carries an
    // `initial_deposit` row from registration, so an unfiltered count would
    // report `isFirstDebit: false` on the genuine first cycle.
    //
    // "First" means the subscriber has never PAID full price — settled, not
    // attempted. Counted by attempts, a declined first debit re-armed for
    // tomorrow claims its second cycle as a "renewal" and takes the dunning
    // path, which hands a paying subscriber's grace to someone who has never
    // paid. Every attempt before the first success is a first debit.
    const isFirstDebit =
      (await this.transactions.countSettledRecurringDebits(mandate.id)) === 0;
    const debit = await this.transactions.claimRecurringCycle({
      mandateId: mandate.id,
      userId: mandate.userId,
      provider: provider.name,
      chargePhase: provider.chargePhase,
      cycleDate,
      amountPaise: mandate.amountPaise,
      currency: mandate.currency,
      isFirstDebit,
      // Persisted BEFORE dispatch and identical to what the adapter will send,
      // so a transport failure still leaves the key recovery asks about.
      gatewayRequestId: provider.debitRequestId(
        mandate.referenceId,
        cycleDate
      ),
      planId: mandate.planId,
      productId: mandate.productId,
    });
    if (!debit) {
      // Not an error: a concurrent run owns this cycle, or a previous failure
      // still holds the claim. Logged at debug volume because a sustained run
      // of these on ONE mandate is how a stranded cycle looks from outside —
      // the exact signature nobody could see during the prod incident.
      log.info(
        {
          ...paymentTrace({ stage: PAYMENT_STAGE.pdn, mandate }),
          event: "cycle_already_claimed",
          cycle_date: isoDay(cycleDate),
        },
        "cycle already claimed — skipping (concurrent run, or an earlier failure still holds it)"
      );
      return;
    }

    // Delegated to `PdnService`, which owns the notification state machine and
    // is the single writer of `presentation_sequence_id`. This used to be an
    // inline notify-then-markNotified, which assumed the sequence id arrives
    // synchronously — an assumption that is false for Decentro and is why every
    // cycle failed at notify. The three outcomes are now distinct states rather
    // than success-or-throw.
    const startedAt = Date.now();
    const outcome = await this.pdnService.dispatch(mandate, debit, now);
    await paymentLedgerAnalytics.trackPaymentScheduled({
      mandate,
      txn: debit,
      reason: "new_cycle",
      scheduledFor: cycleDate,
      source: "scheduler",
    });
    if (outcome.accepted) report.pdnSent += 1;
    if (outcome.awaitingSequenceId) report.pdnAwaitingSequenceId += 1;
    if (outcome.deferred) report.pdnDeferred += 1;
    if (outcome.rearmed) report.pdnRearmed += 1;
    if (outcome.failed) report.pdnFailed += 1;
    log.info(
      {
        ...moneyLog(mandate, debit, PAYMENT_STAGE.pdn),
        event: "pdn_dispatched",
        charge_phase: provider.chargePhase,
        latency_ms: Date.now() - startedAt,
        ...outcome,
      },
      "pre-debit notification dispatched"
    );
    // The recurring debit's "payment initiated" — the moment this cycle's
    // money is actually set in motion, mirroring the deposit's at
    // registration. Emitted HERE rather than at the claim above because a
    // claimed-but-unnotified row moves nothing; it is a stranded cycle, which
    // the ops logs own and a payment funnel must not count as an attempt.
    //
    // `deferred` and `rearmed` are not outcomes for a funnel: the first is
    // "too early, ask again in thirty minutes" and the second re-arms the
    // SAME cycle, and both dedupe onto the ledger row's key anyway.
    if (outcome.failed) {
      await paymentAnalytics.trackPaymentFailed({
        mandate,
        txn: debit,
        outcome: "retry_scheduled",
      });
    } else if (outcome.accepted || outcome.awaitingSequenceId) {
      await paymentAnalytics.trackPaymentInitiated({ mandate, txn: debit });
    }
  }


  /**
   * Poll notifications the provider accepted without issuing a sequence id.
   *
   * Placed BETWEEN the notify/recovery stages and `presentDueDebits`, deliberately:
   * an id that arrives during this tick can then be presented in the SAME tick if
   * an NPCI window is open, rather than waiting another thirty minutes.
   *
   * Filtered by `--provider` like every other stage, via a read through the
   * ledger row (`pdn_notifications` has no provider column of its own).
   *
   * It would be tempting to skip the filter here on the grounds that this stage
   * "only polls a status" — but that is not true, and the docstring used to say
   * it was. `refreshFromProvider` can RE-ARM a notification, spending one of a
   * finite `MAX_PDN_DISPATCH_ATTEMPTS` budget, or write the cycle off outright.
   * A run scoped to one gateway during an incident must not be doing either to
   * another gateway's subscribers.
   */
  private async resolvePendingNotifications(
    now: Date,
    dryRun: boolean,
    report: BillingCycleReport,
    only: string | null
  ): Promise<void> {
    if (dryRun) return;
    const counts = await this.pdnService.resolvePendingSequenceIds(
      now,
      istDateOnly(now),
      only
    );
    report.pdnSequenceIdsResolved += counts.resolved;
    report.pdnRearmed += counts.rearmed;
    report.pdnDeferred += counts.deferred;
  }

  /**
   * Write off cycles whose debit date passed with no addressable notification.
   *
   * THE BACKSTOP that makes deferring safe. Every "ask again later" path —
   * premature notification, presentation window not open, a rejected debit date —
   * deliberately costs no retry budget, which is correct on any single tick and
   * unbounded across all of them. `findDueForPdn` reaches only three days ahead,
   * so a cycle that deferred through its whole window stopped being selected and
   * left NOTHING behind: no failed row, no error, `pdnFailed: 0`, and a run that
   * logged at `info`. That is exactly how five days of total billing failure
   * looked healthy in prod.
   *
   * So the deferral is bounded not by a counter but by the calendar: once the day
   * is gone the cycle cannot be billed, and saying so out loud is the whole job.
   * Both rows are marked, because a notification written off while its money row
   * still reads `pending` would keep the cycle claimed and block the next one.
   */
  private async abandonLapsedCycles(
    now: Date,
    dryRun: boolean,
    report: BillingCycleReport,
    only: string | null
  ): Promise<void> {
    if (dryRun) return;
    const lapsed = await this.pdns.findAbandonedCycles(istDateOnly(now));

    for (const pdn of lapsed) {
      // The money row carries the gateway; the notification row does not. Read
      // it BEFORE writing anything, so a run restricted to one gateway cannot
      // write off another's cycle.
      //
      // A notification with NO money row is written off anyway, exactly as an
      // unrestricted run would: there is no gateway to mismatch, and marking it
      // moves no money. Skipping it instead would make `--provider` runs strand
      // rows that the backstop exists to catch — the superseded-claim case
      // leaves precisely this shape behind.
      const debit = await this.transactions.findByPdnId(pdn.id);
      if (debit && this.skips(only, debit.provider)) continue;
      const reason = "debit date passed with no usable notification";
      await this.pdns.markFailed(pdn.id, reason);
      if (debit) {
        await this.transactions.markNotifyFailed(debit.id, {
          failureCode: "PDN_ABANDONED",
          failureMessage: reason,
          // OURS, not the bank's — no money was ever presented, so there is no
          // provider answer to classify and nothing for the user to act on.
          // Deterministic rather than inferred (TAM-186 AC10): this is the one
          // sub-code we know without asking anyone.
          failureSubCode: FAILURE_SUB_CODE.PDN_ABANDONED,
        });
      }
      report.pdnAbandoned += 1;
      log.error(
        {
          ...paymentTrace({

            stage: PAYMENT_STAGE.pdn,

            userId: pdn.userId,

            mandateId: pdn.mandateId,

            referenceId: pdn.referenceId,

            transactionId: debit?.id ?? null,

            pdnId: pdn.id,

            provider: debit?.provider ?? null,

          }),

          event: "pdn_abandoned",

          cycle_date: isoDay(pdn.cycleDate),

          amount_paise: debit?.amountPaise ?? null,

          failure_code: "PDN_ABANDONED",

          failure_sub_code: FAILURE_SUB_CODE.PDN_ABANDONED,

          recoverable: false,

          next_step: "no_debit_this_cycle",
          attempts: pdn.attempts,
          last_status: pdn.status,
        },
        // ERROR for the same reason `pdn_failed` is: a subscriber silently
        // stopped being billed.
        "cycle ABANDONED — its debit date passed before the notification became addressable"
      );
    }
  }

  /**
   * Rescue cycles whose pre-debit notification failed in TRANSPORT.
   *
   * The problem this exists for: `claimRecurringCycle` is insert-first, so a
   * failed notification leaves a row that still owns the cycle. Every later tick
   * then tries to claim it, gets `null`, and skips the mandate — silently, and
   * forever. A transport failure becomes indistinguishable from a legitimate
   * concurrent claim, and the subscription just never renews.
   *
   * The fix is not to loosen the unique index. It is to ASK THE GATEWAY, which
   * is the same posture `CallbackService` already takes: our own record of what
   * happened is not authoritative, the gateway's is. Three outcomes:
   *
   *   ADOPT      the gateway has a payment under our request id ⇒ the
   *              notification landed and a charge is scheduled. Take the row
   *              back to `notified` in place. No new row, no second charge.
   *   SUPERSEDE  the gateway definitively has nothing ⇒ hand the cycle to a
   *              fresh row. Only reachable on an explicit negative.
   *   DEFER      anything ambiguous. The cycle stays claimed and we log, so an
   *              unresolvable row is visible rather than silent — which is
   *              precisely what was missing when this stranded prod.
   *
   * The double-charge guarantee is not weakened but strengthened: it moves from
   * "the DB forbids a second row" to "the DB forbids a second row unless the
   * gateway itself confirmed there is no first one". A row that failed at
   * `settle` (i.e. reached the bank) is not a candidate at all.
   */
  private async recoverFailedNotifications(
    now: Date,
    dryRun: boolean,
    report: BillingCycleReport,
    only: string | null
  ): Promise<void> {
    const today = istDateOnly(now);
    const stuck = await this.transactions.findRecoverableNotifyFailures(today);

    for (const row of stuck) {
      if (this.skips(only, row.provider)) continue;
      const cycleDate = row.cycleDate;
      if (!cycleDate || !row.mandateId) continue;

      const mandate = await this.mandates.findById(row.mandateId);
      // Only a live mandate can still be debited; a dead one is the mandate
      // recovery sweep's problem, not ours.
      if (!mandate || mandate.state !== "active" || !mandate.providerMandateId) {
        continue;
      }
      if (dryRun) continue;

      // We ask about the NOTIFICATION, so we need its row. Without one there is
      // nothing to ask about — a pre-TAM-141 failure has no notification record.
      if (!row.pdnId) {
        this.logRecoveryDeferred(row, "no_notification_record");
        continue;
      }
      const pdn = await this.pdns.findById(row.pdnId);
      if (!pdn) {
        this.logRecoveryDeferred(row, "no_notification_record");
        continue;
      }

      // THE corrected question. This used to call `getDebitStatus` — a
      // PRESENTATION status read — keyed with `gatewayRequestId`, which is a
      // NOTIFY key. It could never match, so recovery never adopted and never
      // superseded; every Decentro failure deferred forever on `no_request_id`
      // because that adapter also returned a null request id.
      let landed: PreDebitStatusResult;
      try {
        // The row's own gateway. Asking a DIFFERENT gateway "do you have this
        // notification?" reliably answers no — and that answer is the one input
        // to the supersede branch, i.e. to raising a second charge for the
        // cycle. Resolving from anything but the row here is a double charge.
        landed = await this.resolve(row.provider).getPreDebitStatus({
          referenceId: pdn.referenceId,
          presentationSequenceId: pdn.presentationSequenceId,
        });
      } catch (err) {
        if (err instanceof NoSuchDebitError) {
          // The gateway looked and has nothing. This is the ONLY path to a
          // second row for a cycle — and it is reachable for the first time now
          // that an adapter actually throws this.
          await this.supersedeCycle(row, mandate, cycleDate, report);
        } else {
          // Any other error tells us NOTHING about whether the original call
          // landed. Superseding here would be exactly the double charge this
          // mechanism exists to prevent.
          this.logRecoveryDeferred(row, "gateway_unreachable");
        }
        continue;
      }

      // The gateway answered, but "answered" is not "holds a usable notification":
      // without a sequence id there is nothing to present against, and adopting on
      // it would move the row to `notified` in a state that can never proceed.
      // Defer — the pending-sequence-id sweep owns that case.
      if (!landed.presentationSequenceId) {
        this.logRecoveryDeferred(row, "gateway_answer_ambiguous");
        continue;
      }

      // Record it on the notification too, so the two rows agree about which
      // sequence id this cycle is addressed by.
      await this.pdns.applyStatus(pdn.id, {
        status: "accepted",
        presentationSequenceId: landed.presentationSequenceId,
      });
      const adopted = await this.transactions.adoptNotification(row.id, {
        presentationSequenceId: landed.presentationSequenceId,
        gatewayPaymentId: null,
        at: now,
      });
      if (adopted) {
        report.notificationsAdopted += 1;
        log.warn(
          {
            ...moneyLog(mandate, row, PAYMENT_STAGE.recovery),
            event: "notification_adopted",
            presentation_sequence_id: landed.presentationSequenceId,
            recovered_from: row.failureCode,
            // WARN, not info: recovering is the right outcome, but it means a
            // dispatch failed earlier and nobody noticed until now. A steady
            // trickle of these is a gateway or network problem worth chasing.
          },
          "RECOVERED — the notification had landed after all, cycle resumed in place (no second charge)"
        );
      }
    }
  }

  private async supersedeCycle(
    row: TransactionRow,
    mandate: MandateRow,
    cycleDate: Date,
    report: BillingCycleReport
  ): Promise<void> {
    // The replacement claim inherits the ORIGINAL mandate's gateway, never the
    // currently active one: this is a second attempt at the same cycle for the
    // same subscriber, and it has to be raised where their consent lives.
    const provider = this.resolve(mandate.provider);
    const replacement = await this.transactions.supersedeCycleClaim({
      failedId: row.id,
      claim: {
        mandateId: mandate.id,
        userId: mandate.userId,
        provider: provider.name,
        chargePhase: provider.chargePhase,
        cycleDate,
        amountPaise: mandate.amountPaise,
        currency: mandate.currency,
        isFirstDebit: row.isFirstDebit,
        // A FRESH key: reusing the old one would collide at the gateway with
        // the very request we just confirmed it never received.
        gatewayRequestId: `${provider.debitRequestId(mandate.referenceId, cycleDate) ?? mandate.referenceId}_r${row.attemptNo + 1}`,
        planId: mandate.planId,
        productId: mandate.productId,
        attemptNo: row.attemptNo + 1,
      },
    });
    if (replacement) {
      report.cyclesSuperseded += 1;
      log.warn(
        {
          ...moneyLog(mandate, replacement, PAYMENT_STAGE.recovery),
          event: "cycle_superseded",
          superseded_transaction_id: row.id,
          superseded_failure_code: row.failureCode,
          // Only reachable on an explicit "no such payment" from the gateway.
          // If this ever appears without a preceding pdn_failed for the same
          // cycle, something has gone badly wrong with the recovery gate.
        },
        "RECOVERED — gateway never received the notification, cycle re-claimed under a fresh row"
      );
    }
  }

  private logRecoveryDeferred(row: TransactionRow, reason: string): void {
    log.error(
      {
        ...paymentTrace({

          stage: PAYMENT_STAGE.recovery,

          userId: row.userId,

          mandateId: row.mandateId,

          transactionId: row.id,

          pdnId: row.pdnId,

          provider: row.provider,

        }),

        event: "notification_recovery_deferred",

        cycle_date: isoDay(row.cycleDate),

        recoverable: false,

        next_step: "human_if_repeating",
        amount_paise: row.amountPaise,
        gateway_request_id: row.gatewayRequestId,
        failure_code: row.failureCode,
        failure_message: row.failureMessage,
        reason,
      },
      // ERROR because this is the shape of the prod incident: a cycle that
      // stays claimed, is skipped by every subsequent tick, and silently stops
      // renewing a paying subscriber. Deferring is the SAFE choice (guessing
      // risks a double charge) but it must never be a quiet one — the same row
      // appearing here tick after tick needs a human.
      "STRANDED — cannot determine whether the notification landed; cycle stays claimed and will be retried next tick"
    );
  }

  /** Present debits that hold a PDN, inside an NPCI window. */
  private async presentDueDebits(
    now: Date,
    dryRun: boolean,
    report: BillingCycleReport,
    only: string | null
  ): Promise<void> {
    const ready = await this.transactions.findAwaitingSubmission();

    for (const attempt of ready) {
      if (this.skips(only, attempt.provider)) continue;
      // The gateway's own debit instant, when the notification status read
      // learned one. Presenting before it is refused, so honouring it turns ~34
      // rejected calls a day into zero.
      //
      // The column is NOT NULL and seeded with the cycle date, so a row that
      // never learned one arrives here holding that seed rather than null —
      // `canPresentDebit` ignores anything at or before `cycleDate` for exactly
      // that reason.
      const pdn = attempt.pdnId ? await this.pdns.findById(attempt.pdnId) : null;
      if (!canPresentDebit(attempt.cycleDate, now, pdn?.scheduledDebitAt)) {
        report.skippedOutsideWindow += 1;
        continue;
      }
      if (dryRun) {
        report.presentationsSent += 1;
        continue;
      }

      const mandate = await this.mandates.findById(attempt.mandateId);
      if (!mandate || mandate.state !== "active") {
        // The mandate died underneath us — revoked while we held a PDN.
        await this.transactions.settle(attempt.id, {
          status: "abandoned",
          failureCode: "MANDATE_NOT_ACTIVE",
          failureMessage: "mandate no longer active at presentation time",
          at: now,
        });
        // A TERMINAL outcome for the row, so it gets its own line. This used to
        // be the one way a claimed cycle could end with nothing in the log, and
        // "the debit simply never happened" is exactly what an incident asks.
        // `moneyLog` needs the mandate row; when even that is gone, the trace
        // bundle carries what the ledger row knows.
        log.warn(
          {
            ...(mandate
              ? moneyLog(mandate, attempt, PAYMENT_STAGE.presentation)
              : {
                  ...paymentTrace({
                    stage: PAYMENT_STAGE.presentation,
                    userId: attempt.userId,
                    mandateId: attempt.mandateId,
                    transactionId: attempt.id,
                    provider: attempt.provider,
                  }),
                  amount_paise: attempt.amountPaise,
                  cycle_date: isoDay(attempt.cycleDate),
                }),
            event: "presentation_abandoned",
            mandate_state: mandate?.state ?? null,
            failure_code: "MANDATE_NOT_ACTIVE",
            recoverable: false,
            next_step: "user_must_re_register",
          },
          "debit ABANDONED — mandate no longer active at presentation time; nothing charged"
        );
        await paymentLedgerAnalytics.trackPaymentResult({
          mandate,
          txn: attempt,
          status: "abandoned",
          source: "scheduler",
          failureCode: "MANDATE_NOT_ACTIVE",
        });
        continue;
      }

      // Resolved from the LEDGER ROW, which snapshotted the gateway when the
      // cycle was claimed. Using the mandate's would agree today and diverge the
      // moment a mandate is ever re-pointed; the row is what the money was
      // claimed under, so the row is what presents it.
      let provider;
      try {
        provider = this.resolve(attempt.provider);
      } catch (err) {
        log.error(
          {
            err,
            ...moneyLog(mandate, attempt, PAYMENT_STAGE.presentation),
            event: "presentation_provider_unavailable",
            provider: attempt.provider,
          },
          "claimed debit names a gateway this build cannot resolve, or whose credentials are missing — skipping the row"
        );
        continue;
      }

      log.info(
        {
          ...moneyLog(mandate, attempt, PAYMENT_STAGE.presentation),
          event: "presentation_sent",
          charge_phase: provider.chargePhase,
        },
        // For Decentro this line is the last thing written before money moves;
        // for Cashfree the charge was already scheduled at notify time. The
        // `charge_phase` field says which, so a reader knows whether a missing
        // settlement after this point means "maybe charged" or "definitely not".
        "presenting debit to the gateway"
      );
      // Minted per ATTEMPT and persisted before dispatch. It cannot be derived
      // from `retryCount` because `markSubmitted` increments that counter in this
      // very call, so any derivation reads a stale value and hands two attempts the
      // same reference — which Decentro rejects outright.
      const presentationRef = `pj_prs_${randomUUID()}`;
      // CLAIM the presentation before making it. `markSubmitted` refuses a row
      // that is already `submitted`, so exactly one caller can win — and losing
      // means another sweep is already presenting this debit.
      //
      // This is the last gate before money moves and it is the only one that
      // covers the presentation itself: the `(mandate_id, cycle_date)` unique
      // index prevents a second CLAIM of the cycle, not a second presentation
      // of the row that was claimed once. Two concurrent sweeps are reachable
      // whenever a run outlives the Redis lock's TTL, which one slow provider
      // is enough to cause — and each mints its own `gatewayPresentationRef`,
      // which exists precisely so the gateway will NOT dedupe it.
      const claimed = await this.transactions.markSubmitted(attempt.id, {
        gatewayPaymentId: attempt.gatewayPaymentId,
        gatewayPresentationRef: presentationRef,
        at: now,
      });
      if (!claimed) {
        log.warn(
          {
            ...moneyLog(mandate, attempt, PAYMENT_STAGE.presentation),
            event: "presentation_already_claimed",
          },
          "another run is presenting this debit — skipping (a second presentation would be a second charge)"
        );
        continue;
      }
      report.presentationsSent += 1;

      try {
        const result = await provider.presentDebit({
          referenceId: mandate.referenceId,
          // THIS attempt's wire reference. Separate from the mandate's, which is
          // constant for its whole life and would be refused as a duplicate from
          // cycle 2 onward — but which Cashfree and the stub still need in order to
          // identify the subscription at all.
          presentationRef,
          providerMandateId: mandate.providerMandateId!,
          presentationSequenceId: attempt.presentationSequenceId!,
          amountPaise: attempt.amountPaise,
          currency: attempt.currency,
          cycleDate: attempt.cycleDate,
          attemptNo: attempt.attemptNo,
          // A business string, so it is built here rather than in the adapter.
          // REQUIRED by Decentro, whose presentation endpoint rejects a body
          // without it — which every presentation used to be.
          purposeMessage: presentationNarration(attempt.cycleDate),
        });
        const presentedAt = new Date();

        if (result.outcome === "succeeded") {
          await this.onDebitSucceeded(mandate, attempt, now, result, "scheduler");
        } else if (result.outcome === "failed") {
          await this.onDebitFailed(
            mandate,
            attempt,
            now,
            {
              code: result.failureCode ?? "DEBIT_FAILED",
              message: result.failureMessage ?? "bank declined the debit",
              subCode: result.failureSubCode,
            },
            "scheduler"
          );
        }
        // `pending` is the normal path — settlement arrives by callback, and
        // `reconcileUnsettled` catches it if that never happens.
        await paymentLedgerAnalytics.trackPaymentAttempted({
          mandate,
          txn: attempt,
          presentationRef,
          immediateResponse: result.outcome,
          occurredAt: presentedAt,
        });
      } catch (err) {
        // A DEFINITE refusal: the gateway rejected the request before doing
        // anything with it, so money certainly did not move. That is the one case
        // where rolling back is correct — `markForRetry` returns the row to
        // `notified`, keeping its presentation sequence id (the notification is
        // still valid for this cycle), so the next open window presents it again.
        //
        // Without this the row stayed `submitted` FOREVER: the reconciliation
        // sweep would poll a presentation the gateway never accepted, and the
        // cycle's money was simply never collected.
        if (err instanceof PreDebitTooSoonError) {
          await this.transactions.markForRetry(attempt.id, {
            failureCode: "PRESENTATION_WINDOW_CLOSED",
            failureMessage: safeFailureMessage(err),
          });
          log.warn(
            {
              ...moneyLog(mandate, attempt, PAYMENT_STAGE.presentation),
              event: "presentation_deferred",
              reason: safeFailureMessage(err),
            },
            "gateway refused the presentation as too early — returned to notified for the next window"
          );
          await paymentLedgerAnalytics.trackPaymentAttempted({
            mandate,
            txn: attempt,
            presentationRef,
            immediateResponse: "too_soon",
            occurredAt: now,
          });
          await paymentLedgerAnalytics.trackPaymentDeferred({
            mandate,
            txn: attempt,
            reason: "PRESENTATION_WINDOW_CLOSED",
          });
          continue;
        }

        // Anything else is AMBIGUOUS. Do NOT retry: a presentation that timed out
        // may well have reached the bank, and a second one is a second charge.
        // Leave the attempt `submitted` and let reconciliation resolve it from the
        // provider's own record.
        log.error(
          {
            ...moneyLog(mandate, attempt, PAYMENT_STAGE.presentation),
            event: "presentation_error",
            attempt_id: attempt.id,
            reason: safeFailureMessage(err),
            // Money MAY have moved. The row stays `submitted`, and
            // `reconcileUnsettled` asks the gateway once it is old enough.
            recoverable: true,
            next_step: "reconcile_from_provider",
          },
          "presentation errored — leaving unsettled for reconciliation, NOT retrying"
        );
        await paymentLedgerAnalytics.trackPaymentAttempted({
          mandate,
          txn: attempt,
          presentationRef,
          immediateResponse: "error",
          occurredAt: now,
        });
      }
    }
  }

  /** A debit settled successfully: extend entitlement, schedule the next one. */
  private async onDebitSucceeded(
    mandate: MandateRow,
    attempt: RecurringDebitRow,
    now: Date,
    trail: SettlementTrail,
    source: LedgerEventSource
  ): Promise<void> {
    // The row AS SETTLED, for the analytics calls at the end of this method.
    //
    // `settle` returns a boolean, not the updated row, so `attempt` on this
    // stack keeps its PRE-settlement nulls — and the gateway's payment id is
    // one of them, because some gateways only mint it once the debit is
    // actually presented. That is why every renewal in prod reported no
    // `gateway_payment_id` (0 of 78) despite the ledger holding one: analytics
    // was reading a row snapshotted before the id existed (TAM-163).
    //
    // `settledAt` is patched for the same reason — `renewal_date` falls back to
    // `updatedAt` without it, which is a near-miss rather than the settlement.
    //
    // Deliberately NOT patching `status`: `revenueIndex` documents that the
    // caller's reported outcome, never `txn.status`, is the discriminator, and
    // moving that field would quietly make the stale read it warns about look
    // safe. `bankReferenceNumber` / `npciTransactionId` are left stale too —
    // they go to the LEDGER below, which is what a dispute is answered from,
    // and no event needs them.
    const settledAttempt: RecurringDebitRow = {
      ...attempt,
      gatewayPaymentId: trail.providerTxnId ?? attempt.gatewayPaymentId,
      settledAt: now,
    };
    const settled = await this.transactions.settle(attempt.id, {
      status: "succeeded",
      // The gateway payment id, bank reference number and NPCI id are the ONLY
      // record of this debit outside the gateway's systems, and `transactions`
      // is what a disputed charge is answered from — so they are persisted here
      // rather than discarded with the rest of the response.
      gatewayPaymentId: settledAttempt.gatewayPaymentId,
      bankReferenceNumber: trail.bankReferenceNumber,
      npciTransactionId: trail.npciTransactionId,
      at: now,
    });
    // Already settled by a callback that beat us here — do not re-apply.
    if (!settled) return;

    // Derived from the cycle, never from "now + 1 month", so a replay lands on
    // the same value and grants nothing extra.
    //
    // For a renewal recovered mid-dunning, "the cycle" is the ORIGINAL one —
    // the day the money was first due — not the re-armed row that finally
    // settled. Each daily retry is a fresh cycle with a later date, and
    // measuring the period from it would move the billing anniversary forward
    // by however many days the bank took to say yes: a Tuesday decline settled
    // on Friday would hand over three free days and drift every later debit.
    // The old same-notification retry never moved the date, and the paid
    // period must not depend on how many attempts it took to collect it.
    // First debits keep their own date: the anchor is renewal-only.
    // Bounded to cycles BEFORE this one: the row just settled is now the
    // newest success, and an unbounded search would scope itself after it,
    // find nothing, and hand back the re-armed date — the drift itself.
    const dunningSince = attempt.isFirstDebit
      ? null
      : await this.transactions.findRenewalDunningAnchor(mandate.id, {
          before: attempt.cycleDate,
        });
    const periodEnd = addMonthClamped(dunningSince ?? attempt.cycleDate);

    await performServiceCall(
      "subscription",
      (api) =>
        api.applyDebitSucceeded({
          userId: mandate.userId,
          periodEnd,
          planId: mandate.planId,
          productId: mandate.productId,
        }),
      "payment:debit-succeeded",
      "failed to extend subscription"
    );
    await this.mandates.setNextDebitDate(mandate.id, periodEnd);
    await paymentLedgerAnalytics.trackPaymentResult({
      mandate,
      txn: settledAttempt,
      status: "success",
      source,
    });
    await paymentLedgerAnalytics.trackPaymentScheduled({
      mandate,
      txn: settledAttempt,
      reason: "next_cycle",
      scheduledFor: periodEnd,
      source,
    });

    log.info(
      {
        ...moneyLog(mandate, attempt, PAYMENT_STAGE.settlement),
        event: "debit_succeeded",
        // The gateway's id and the bank's reference are the ONLY record of this
        // money outside the gateway's systems. Logging them means a disputed
        // charge can be answered from the log line alone.
        gateway_payment_id: settledAttempt.gatewayPaymentId,
        bank_reference_number: trail.bankReferenceNumber,
        npci_transaction_id: trail.npciTransactionId,
        // What the user actually bought: access until this instant.
        period_end: periodEnd.toISOString(),
        plan_id: attempt.planId,
      },
      "MONEY IN — debit succeeded, subscription extended"
    );
    // Counted once and shared: this settlement is already included, so it is the
    // cycle number of the row we are reporting.
    const cyclesCompleted = await this.countSettledCycles(mandate.id);
    await paymentAnalytics.trackPaymentSuccess({
      mandate,
      txn: settledAttempt,
      cyclesCompleted,
    });
    // Every recurring debit is a renewal (`Purchase`): the registration deposit
    // was the first charge, reported at activation — cricsignal's cycle 0.
    void reportTransactionConversion(false, settledAttempt);
    // Is this the user's first full-price payment EVER? Computed once, because
    // it is exactly the line between the two events below — they are mutually
    // exclusive, and one predicate deciding both is what keeps them that way.
    //
    // `cyclesCompleted` short-circuits the common case for free: it already
    // counts this mandate's settled cycles including this one, so anything
    // above 1 means the user demonstrably paid before and no query is worth
    // spending. Null means the count itself failed, so fall through and let the
    // ledger check make its own (fail-closed) decision.
    const isFirstFullPricePayment =
      cyclesCompleted !== null && cyclesCompleted > 1
        ? false
        : await this.mandateService.isFirstFullPricePayment(mandate);
    // A RENEWAL is a cycle that recurs — so the first full-price payment is not
    // one, and does not report as one (TAM-163). On a trial that is the day-3
    // conversion; the next charge is thirty days later and every charge from
    // there is a renewal.
    //
    // Gated on the user's LEDGER rather than on `isFirstDebit`, which is
    // mandate-scoped and wrong at both ends: a no-trial registration takes the
    // full price as its `initial_deposit`, so its first recurring debit is
    // already the second payment and IS a renewal; and a re-registration after
    // an NPCI revoke mints a fresh mandate, so a subscriber of months reads
    // `isFirstDebit` true all over again.
    //
    // The fail-closed `false` above therefore degrades to the OLD behaviour
    // here — a renewal reported on a conversion — rather than silently dropping
    // a real one.
    if (!isFirstFullPricePayment) {
      await paymentAnalytics.trackSubscriptionRenewed({
        mandate,
        txn: settledAttempt,
        periodEnd,
        cyclesCompleted,
      });
    }
    // A converting trial becomes a paying customer HERE, and nowhere else. The
    // approval-time hook that emits `bk_subscription_started` cannot see it —
    // that mandate went live weeks ago at ₹2 — so until now a trial conversion
    // was reported only as a renewal, indistinguishable from a fourth-month
    // charge. This fires INSTEAD of the renewal: the conversion is a lifecycle
    // start, and counting it in both series inflated renewals to the point that
    // every renewal prod had ever recorded was in fact a first payment.
    await paymentAnalytics.trackSubscriptionStarted({
      mandate,
      txn: settledAttempt,
      now,
      cyclesCompleted,
      // NOT `mandate.nextDebitDate` — that is the cycle just charged. The row
      // was read before `setNextDebitDate` above advanced it, and that write
      // went to the database, not to this object.
      nextBillingDate: periodEnd,
      isFirstFullPricePayment,
    });
  }

  /**
   * A debit failed. Two policies, and picking the wrong one is expensive.
   *
   * FIRST debit: NPCI auto-revokes the mandate, so retrying is pointless —
   * there is nothing left to debit against. The user must re-consent. With a
   * day-3 trial debit this is elevated probability, not an edge case.
   *
   * RENEWAL: retry up to three times across successive windows, with the user
   * staying entitled through a grace window. A 3am insufficient-balance
   * failure must not lock out someone who has been paying for months.
   */
  private async onDebitFailed(
    mandate: MandateRow,
    attempt: RecurringDebitRow,
    now: Date,
    failure: {
      code: string;
      message: string;
      /**
       * WHY it died, in our vocabulary (TAM-186). Decided by the ADAPTER from
       * the provider's machine fields; this service only carries it. Optional
       * because a caller that genuinely has no provider answer (an internal
       * write-off) has nothing honest to put here.
       */
      subCode?: FailureSubCode | null;
    },
    source: LedgerEventSource
  ): Promise<void> {
    const reportResult = (): Promise<void> =>
      paymentLedgerAnalytics.trackPaymentResult({
        mandate,
        txn: attempt,
        status: "failed",
        source,
        failureCode: failure.code,
        failureReason: safeFailureMessage(failure.message),
      });
    // Another resolver moved the row first — a webhook and the sweep read the
    // same `submitted` attempt concurrently, and the ledger write is the only
    // arbiter. The loser must do NOTHING else: no re-arm, no dunning, no
    // analytics, or one decline is reported and dunned twice (TAM-260). The
    // same guard `onDebitSucceeded` has. A NEW, additive event name: the
    // winner still emits `debit_failed` / `first_debit_*` exactly once.
    const logAlreadySettled = (
      branch: "first_debit_retry" | "first_debit_settle" | "renewal"
    ): void => {
      log.info(
        {
          ...moneyLog(mandate, attempt, PAYMENT_STAGE.dunning),
          event: "debit_failed_already_settled",
          branch,
          source,
          failure_code: failure.code,
        },
        "debit failure already applied by another resolver — skipping side effects"
      );
    };
    if (attempt.isFirstDebit) {
      // Ask the provider whether the mandate survived rather than assuming it
      // did not. NPCI revokes a mandate only when the execution that CREATED
      // it fails; on Razorpay that was the ₹2 authorization, which succeeded,
      // so a declined first ₹299 normally leaves the token live. Only a
      // mandate the provider reports dead — or one whose retry window is over
      // — is written off below. See `FIRST_DEBIT_RETRY_DAYS`.
      const refreshed = await this.mandateService.refreshFromProvider(mandate, now);
      const live = refreshed.state === "active";
      const exhausted = attempt.retryCount >= MAX_PRESENTATION_RETRIES;

      if (live && !exhausted) {
        // The same window-by-window retry the renewal path uses, on the same
        // order — and nothing else. No grace, because nothing was ever paid;
        // no subscription change, because the trial lapses on its own date.
        const movedForRetry = await this.transactions.markForRetry(attempt.id, {
          failureCode: failure.code,
          failureMessage: failure.message,
          failureSubCode: failure.subCode,
        });
        if (!movedForRetry) {
          logAlreadySettled("first_debit_retry");
          return;
        }
        // ASK THE USER TO TOP UP (TAM-186). Fire-and-forget, and gated inside
        // `trackPaymentRecoveryDue` on the sub-code — a bank fault or a
        // not-permitted account sends nothing.
        //
        // Placed on the RETRY branch, not the write-off below: the point is to
        // reach them while another attempt is still coming. Once the mandate is
        // written off there is nothing left for a top-up to rescue.
        //
        // `trialEndsAt`, not a grace date — a first debit gets no grace (see
        // the comment above), so this is genuinely when access stops.
        void paymentAnalytics.trackPaymentRecoveryDue({
          mandate,
          txn: attempt,
          population: "first_debit",
          accessEndsAt: mandate.trialEndsAt,
          failureSubCode: failure.subCode ?? null,
        });
        log.warn(
          {
            ...moneyLog(mandate, attempt, PAYMENT_STAGE.dunning),
            event: "first_debit_retry_scheduled",
            failure_code: failure.code,
            failure_message: safeFailureMessage(failure.message),
            max_retries: MAX_PRESENTATION_RETRIES,
            recoverable: true,
            next_step: "retry_next_window",
          },
          "MONEY FAILED — first debit declined on a live mandate, retrying in a later window"
        );
        await paymentLedgerAnalytics.trackPaymentRetryScheduled({
          mandate,
          txn: attempt,
          retryKind: "next_window",
        });
        await reportResult();
        await paymentAnalytics.trackPaymentFailed({
          mandate,
          txn: attempt,
          failureCode: failure.code,
          failureReason: safeFailureMessage(failure.message),
          outcome: "retry_scheduled",
          cyclesCompleted: 0,
        });
        return;
      }

      const settledFirst = await this.transactions.settle(attempt.id, {
        status: "failed",
        failureCode: failure.code,
        failureMessage: failure.message,
        failureSubCode: failure.subCode,
        at: now,
      });
      if (!settledFirst) {
        logAlreadySettled("first_debit_settle");
        return;
      }

      const rearmTo = addDays(istDateOnly(now), 1);
      const retryUntil = firstDebitRetryUntil(mandate);
      if (live && retryUntil !== null && rearmTo.getTime() <= retryUntil.getTime()) {
        // Today's retries are spent but the mandate is live and the window is
        // open: give the cycle a fresh notification tomorrow. The sweep claims
        // the new cycle on its next tick exactly as it does after a lead
        // repair — as a first debit again, since nothing has settled — and
        // this row stays `failed` as the record of today's decline.
        await this.mandates.setNextDebitDate(mandate.id, rearmTo);
        log.warn(
          {
            ...moneyLog(mandate, attempt, PAYMENT_STAGE.dunning),
            event: "first_debit_rearmed",
            source: "settle",
            failure_code: failure.code,
            failure_message: safeFailureMessage(failure.message),
            moved_to: isoDay(rearmTo),
            retry_until: isoDay(retryUntil),
            recoverable: true,
            next_step: "fresh_notification_tomorrow",
          },
          "MONEY FAILED — first debit retries spent for today, re-armed for a fresh cycle tomorrow"
        );
        await paymentLedgerAnalytics.trackPaymentRetryScheduled({
          mandate,
          txn: attempt,
          retryKind: "next_day",
          nextRetryAt: rearmTo,
        });
        await reportResult();
        await paymentAnalytics.trackPaymentFailed({
          mandate,
          txn: attempt,
          failureCode: failure.code,
          failureReason: safeFailureMessage(failure.message),
          outcome: "retry_scheduled",
          cyclesCompleted: 0,
        });
        return;
      }

      // Dead at the provider, or the retry window is over. Nothing was ever
      // paid, so there is no period to stay entitled through: end it.
      await performServiceCall(
        "subscription",
        (api) =>
          api.applyMandateEnded({ userId: mandate.userId, reason: "expired", now }),
        "payment:first-debit-failed",
        "failed to end subscription"
      );
      log.error(
        {
          ...moneyLog(mandate, attempt, PAYMENT_STAGE.dunning),
          event: "first_debit_failed",
          failure_code: failure.code,
          failure_message: safeFailureMessage(failure.message),
          mandate_state: refreshed.state,
          retry_until: retryUntil ? isoDay(retryUntil) : null,
          recoverable: false,
          next_step: "user_must_re_register",
        },
        live
          ? "MONEY FAILED — first debit declined and the retry window is over, user must re-register"
          : "MONEY FAILED — first debit failed and the provider reports the mandate dead, user must re-register"
      );
      // Two events, because this one transition answers two different
      // questions. The decline belongs in the dunning numbers; the subscription
      // ending belongs in churn — and asking "who churned this week" must not
      // require knowing that a first-debit failure is also a churn.
      await reportResult();
      await paymentAnalytics.trackPaymentFailed({
        mandate,
        txn: attempt,
        failureCode: failure.code,
        failureReason: safeFailureMessage(failure.message),
        outcome: "expired",
      });
      await paymentAnalytics.trackSubscriptionEnded({
        mandate,
        txn: attempt,
        now,
        reason: "first_debit_failed",
        // Nobody chose this: the first debit never landed.
        source: "dunning",
        // Zero by construction, no query needed: this branch is `isFirstDebit`,
        // so no full-price cycle has ever settled against this mandate.
        cyclesCompleted: 0,
      });
      return;
    }

    // A renewal failure settles the row and buys a FRESH cycle tomorrow — one
    // attempt per day, never several in one day.
    //
    // The old shape retried the same presentation in the next NPCI window, up
    // to `MAX_PRESENTATION_RETRIES`. Because NPCI opens three execution windows
    // a day (00:00-10:00, 13:00-17:00, 21:30-24:00) and
    // `findAwaitingSubmission` has no per-day guard, all three attempts could
    // burn within hours of each other against the same bank balance — which is
    // the one thing least likely to have changed. Spreading them over seven
    // days is the point: "insufficient balance" on Tuesday says very little
    // about Friday, which is payday.
    //
    // Re-arming rather than re-presenting is what makes a NEXT-DAY attempt
    // legal at all. A retry needs a notification, a fresh notification needs
    // >= 24h of NPCI lead, and by the time a presentation has failed this
    // cycle's date has already arrived — so there is no lead left to give on
    // THIS cycle and re-presenting a spent one is refused (loudly on Razorpay,
    // which binds a debit to one `order_id`). Moving the mandate's next debit
    // to tomorrow instead lets the sweep claim a brand-new cycle with a brand-
    // new PDN, which satisfies the lead requirement honestly. It is exactly the
    // move `first_debit_rearmed` already makes, for the same reason.
    const settledRenewal = await this.transactions.settle(attempt.id, {
      status: "failed",
      failureCode: failure.code,
      failureMessage: failure.message,
      failureSubCode: failure.subCode,
      at: now,
    });
    if (!settledRenewal) {
      logAlreadySettled("renewal");
      return;
    }

    // Anchored on the FIRST failure of this sequence, never on `now`: the row
    // we just settled is included, so the first failure anchors on itself and
    // every later one inherits that date. Computing from `now` would push the
    // deadline a day further out on every failure and the window would never
    // close.
    const dunningSince =
      (await this.transactions.findRenewalDunningAnchor(mandate.id)) ??
      istDateOnly(attempt.cycleDate ?? now);
    const retryUntil = addDays(dunningSince, RENEWAL_RETRY_DAYS);
    // One number, two meanings, on purpose — see `RENEWAL_RETRY_DAYS`. Grace
    // ending is what lapses the subscription: the existing expiry sweep moves it
    // to `expired` once this date passes, so exhausting the retries needs no
    // separate cancellation path and cannot lapse someone we are still charging.
    const graceUntil = retryUntil;
    const rearmTo = addDays(istDateOnly(now), 1);

    // Bounded by the CALENDAR alone — deliberately not by a provider poll.
    //
    // Asking the gateway "is this mandate still alive?" on every failure reads
    // as prudent and is a trap here: the poll fails soft to the last known
    // state, an unknown or `pending` answer is indistinguishable from a dead
    // token, and treating either as dead collapses a seven-day window into a
    // one-day one — ending the subscription of someone whose bank was merely
    // slow. The downside of the other direction is six wasted notifications
    // against a revoked token, which move no money and cost nothing. The
    // first-debit branch polls because NPCI genuinely revokes on a failed
    // CREATING execution; a renewal failure carries no such signal.
    const exhausted = rearmTo.getTime() > retryUntil.getTime();

    if (!exhausted) {
      await this.mandates.setNextDebitDate(mandate.id, rearmTo);
    }

    // The changed-row count, not a void: the repository guards this transition
    // on `DUNNABLE_STATES`, so a row that was never dunnable is a no-op. Emitting
    // `bk_subscription_past_due` regardless would invent dunning that never
    // started, and dunning volume is exactly what that event exists to measure.
    // ASK THE USER TO TOP UP (TAM-186), while they are still entitled.
    //
    // Only when a retry is actually coming: once the window has closed there is
    // nothing a top-up can rescue, and telling someone to pay for access that
    // is ending anyway is worse than silence. Gated on the sub-code inside.
    if (!exhausted) {
      void paymentAnalytics.trackPaymentRecoveryDue({
        mandate,
        txn: attempt,
        population: "renewal",
        // A renewal DOES get a window, and it is the honest thing to promise:
        // the user stays Pro until this instant even though the money did not
        // arrive.
        accessEndsAt: graceUntil,
        failureSubCode: failure.subCode ?? null,
      });
    }

    const dunningStarted = await performServiceCall(
      "subscription",
      (api) => api.applyDebitFailed({ userId: mandate.userId, graceUntil }),
      "payment:debit-failed",
      "failed to start dunning"
    );

    // ONE line per failure, and the event name is UNCHANGED: `debit_failed`
    // is the name every existing alert and dashboard filters on, and renaming
    // it would silence them without anyone noticing. The outcome rides as a
    // field instead — filter `outcome=rearmed` for every retry,
    // `outcome=exhausted` for every lapse.
    log.warn(
      {
        ...moneyLog(mandate, attempt, PAYMENT_STAGE.dunning),
        event: "debit_failed",
        outcome: exhausted ? "exhausted" : "rearmed",
        failure_code: failure.code,
        failure_message: safeFailureMessage(failure.message),
        // Which day of the seven this is, so "it failed 4 times" is readable
        // off the line rather than counted across a week of logs.
        dunning_day: Math.floor((istDateOnly(now).getTime() - dunningSince.getTime()) / 86_400_000) + 1,
        retry_days: RENEWAL_RETRY_DAYS,
        dunning_since: isoDay(dunningSince),
        retry_until: isoDay(retryUntil),
        moved_to: exhausted ? null : isoDay(rearmTo),
        // The user stays Pro until this instant even though the money did not
        // arrive — a 3am insufficient-balance must not lock out someone who has
        // been paying for months.
        grace_until: graceUntil.toISOString(),
        recoverable: !exhausted,
        next_step: exhausted ? "lapse_after_grace" : "fresh_notification_tomorrow",
      },
      exhausted
        ? "MONEY FAILED — renewal retry window closed, subscription lapses after grace"
        : "MONEY FAILED — renewal declined, re-armed for a fresh cycle tomorrow"
    );
    const cyclesCompleted = await this.countSettledCycles(mandate.id);
    await reportResult();
    await paymentAnalytics.trackPaymentFailed({
      mandate,
      txn: attempt,
      failureCode: failure.code,
      failureReason: safeFailureMessage(failure.message),
      outcome: exhausted ? "cancelled" : "retry_scheduled",
      graceUntil,
      cyclesCompleted,
    });
    if (!exhausted) {
      await paymentLedgerAnalytics.trackPaymentRetryScheduled({
        mandate,
        txn: attempt,
        retryKind: "next_day",
        nextRetryAt: rearmTo,
      });
    }
    // The entitlement view of the same moment, and only when the row actually
    // moved. One per attempt that keeps them in dunning. `grace_until` is the
    // SAME instant on every one of the seven, because it is anchored on the
    // first failure rather than recomputed from `now`.
    if (dunningStarted > 0) {
      await paymentAnalytics.trackSubscriptionPastDue({
        mandate,
        txn: attempt,
        failureCode: failure.code,
        failureReason: safeFailureMessage(failure.message),
        graceUntil,
      });
    }
  }

  /**
   * Settled recurring debits for a mandate — the cycle count the analytics
   * events cannot compute for themselves.
   *
   * Lives here rather than in `PaymentAnalyticsService` because that service
   * never reads the database (which is also what keeps `repositories/` out of
   * it). Index-covered by `@@index([mandateId, kind, status])`, and best-effort:
   * a count that fails must not take down a billing tick, so it degrades to
   * `null` and the events omit the property rather than reporting a wrong cycle.
   */
  private async countSettledCycles(mandateId: string): Promise<number | null> {
    try {
      return await this.transactions.countSettledRecurringDebits(mandateId);
    } catch (err) {
      log.warn(
        { err, event: "settled_cycle_count_failed", mandate_id: mandateId },
        "failed to count settled cycles for analytics"
      );
      return null;
    }
  }

  /**
   * Resolve one presented-but-unsettled attempt by ASKING THE PROVIDER.
   *
   * The asynchronous half of the debit path. `presentDebit` answering
   * `pending` is the normal case, so without this an attempt would sit in
   * `presentation_sent` forever: the user is charged at the bank, the
   * subscription never extends, and `nextDebitDate` never advances.
   *
   * Deliberately routes into `onDebitSucceeded` / `onDebitFailed` rather than
   * settling here. Those already own every rule that matters — the
   * not-already-terminal guard in `settle`, the forward-only `expiresAt`
   * predicate, `periodEnd` derived from the cycle, and the first-debit vs
   * renewal split — and a second settlement path would be a second place for
   * those to drift.
   *
   * Returns whether the attempt reached a terminal state.
   */
  async resolvePayment(
    attempt: RecurringDebitRow,
    now: Date,
    /** How this read was triggered — reported on `bk_payment_result`. */
    source: LedgerEventSource = "poll"
  ): Promise<boolean> {
    if (!attempt.presentationSequenceId) {
      // No sequence id ⇒ nothing was presented under it, so there is no debit
      // to read. Should be unreachable: `findAwaitingPresentation` requires
      // one before a presentation can happen.
      this.logUnresolvable(attempt, null, "no_presentation_sequence_id");
      return false;
    }
    const mandate = await this.mandates.findById(attempt.mandateId);
    if (!mandate || !mandate.providerMandateId) {
      this.logUnresolvable(
        attempt,
        mandate,
        mandate ? "mandate_has_no_provider_id" : "mandate_missing"
      );
      return false;
    }

    let status;
    try {
      // The attempt's own gateway — the one the money was actually presented
      // to. This read is what turns a `pending` debit into `succeeded`, so
      // asking the wrong gateway leaves a charged user permanently unentitled.
      status = await this.resolve(attempt.provider).getDebitStatus({
        referenceId: mandate.referenceId,
        providerMandateId: mandate.providerMandateId,
        presentationSequenceId: attempt.presentationSequenceId,
        cycleDate: attempt.cycleDate,
      });
    } catch (err) {
      // Fail soft. A provider blip must not settle anything: the attempt keeps
      // its state and the next sweep asks again. Guessing "succeeded" grants
      // an unpaid month; guessing "failed" duns a user who actually paid.
      log.warn(
        {
          ...moneyLog(mandate, attempt, PAYMENT_STAGE.settlement),
          event: "debit_status_poll_failed",
          attempt_id: attempt.id,
          reason: safeFailureMessage(err),
        },
        "debit status poll failed — leaving attempt unsettled"
      );
      return false;
    }

    if (status.outcome === "succeeded") {
      await this.onDebitSucceeded(mandate, attempt, now, status, source);
      return true;
    }
    if (status.outcome === "failed") {
      await this.onDebitFailed(
        mandate,
        attempt,
        now,
        {
          code: status.failureCode ?? "DEBIT_FAILED",
          message: status.failureMessage ?? "bank declined the debit",
          subCode: status.failureSubCode,
        },
        source
      );
      return true;
    }

    // Still settling at the bank. Normal for a while; the sweep retries.
    // Logged so a row that stays here is visible as a DURATION rather than as
    // an absence: `pending_for_ms` is what a dashboard thresholds to separate
    // "settling" from "stuck".
    log.info(
      {
        ...moneyLog(mandate, attempt, PAYMENT_STAGE.settlement),
        event: "debit_still_pending",
        outcome: status.outcome,
        submitted_at: attempt.submittedAt?.toISOString() ?? null,
        pending_for_ms: attempt.submittedAt
          ? now.getTime() - attempt.submittedAt.getTime()
          : null,
      },
      "debit presented but not yet settled at the gateway — will ask again next sweep"
    );
    return false;
  }

  /**
   * A presented row whose outcome can never be asked for — the question cannot
   * even be formed. ERROR because the row sits in `submitted` forever and every
   * sweep lands here again: money may have moved and nothing will ever say so
   * without a human.
   */
  private logUnresolvable(
    attempt: RecurringDebitRow,
    mandate: Parameters<typeof moneyLog>[0] | null,
    reason: string
  ): void {
    log.error(
      {
        ...(mandate
          ? moneyLog(mandate, attempt, PAYMENT_STAGE.settlement)
          : {
              ...paymentTrace({
                stage: PAYMENT_STAGE.settlement,
                userId: attempt.userId,
                mandateId: attempt.mandateId,
                transactionId: attempt.id,
                provider: attempt.provider,
              }),
              amount_paise: attempt.amountPaise,
              cycle_date: isoDay(attempt.cycleDate),
            }),
        event: "debit_unresolvable",
        reason,
        recoverable: false,
        next_step: "human_reconciliation",
      },
      "STRANDED — presented debit cannot be resolved from the gateway; needs a human"
    );
  }

  /** Poll the provider for attempts that were presented but never settled. */
  private async reconcileUnsettled(
    now: Date,
    dryRun: boolean,
    report: BillingCycleReport,
    only: string | null
  ): Promise<void> {
    const stale = await this.transactions.findUnsettled(
      new Date(now.getTime() - UNSETTLED_AFTER_MS)
    );
    if (dryRun) {
      // Counted through the same filter as the live path, so a dry run of a
      // single-gateway sweep does not report the other gateway's backlog.
      report.reconciled = stale.filter(
        (a) => !this.skips(only, a.provider)
      ).length;
      return;
    }

    for (const attempt of stale) {
      if (this.skips(only, attempt.provider)) continue;
      const settled = await this.resolvePayment(attempt, now);
      if (!settled) {
        // The debit itself could not be resolved. Re-read the MANDATE as a
        // fallback: a revoked mandate underneath a stuck attempt is the case
        // that most needs noticing, and it is the only other signal available.
        const mandate = await this.mandates.findById(attempt.mandateId);
        if (mandate) await this.mandateService.refreshFromProvider(mandate, now);
      }
      report.reconciled += 1;
    }
  }

  /** Poll mandates the user may have approved without a callback reaching us. */
  private async reconcileStaleMandates(now: Date, dryRun: boolean, only: string | null): Promise<void> {
    if (dryRun) return;
    const stale = await this.mandates.findStalePending(
      new Date(now.getTime() - 5 * 60_000)
    );
    for (const mandate of stale) {
      if (this.skips(only, mandate.provider)) continue;
      await this.mandateService.refreshFromProvider(mandate, now);
    }
  }
}
