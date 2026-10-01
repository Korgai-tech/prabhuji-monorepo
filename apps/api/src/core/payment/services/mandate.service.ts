import { randomUUID } from "node:crypto";
import { AppError } from "@api/shared/errors";
import { createModuleLogger } from "@api/shared/logs";
import { performServiceCall } from "@api/shared/workspace";
import { PROVIDER } from "@api/shared/config/payment-providers.js";
import { requireProEntitlement } from "@api/shared/entitlement";
import { paymentTrace, PAYMENT_STAGE, safeFailureMessage } from "./payment-log.js";
import { paymentAnalytics } from "./payment-analytics.service.js";
import {
  paymentLedgerAnalytics,
  type LedgerEventSource,
} from "./payment-ledger-analytics.service.js";
import { resolveLatestAttemptNumber } from "./ledger-attempt-number.js";
import { reportTransactionConversion } from "./payment-conversions.js";
import type {
  MandateRepository,
  MandateRow,
} from "@api/core/payment/repositories/mandate.repository.js";
import type { TransactionsRepository } from "@api/core/payment/repositories/transactions.repository.js";
import type {
  MandateProvider,
  MandateStatusResult,
  PayerContact,
  ProviderResolver,
} from "@api/core/payment/mandate.provider.js";
import type { SubscriptionStatus } from "@api/shared/entitlement/types.js";
import type {
  RazorpayCheckout,
  MandateState,
  MandateView,
} from "@api/core/payment/types";
import { TERMINAL_MANDATE_STATES } from "@api/core/payment/types";
import {
  addDays,
  addMonthClamped,
  istDateOnly,
  istEndOfDay,
} from "./npci-window.js";

const log = createModuleLogger("payment:mandate");

/**
 * The unentitled shape `toView` seeds `subscription` with before the controller
 * replaces it. Fail-closed by construction.
 */
const FREE_SUBSCRIPTION_VIEW: SubscriptionStatus = {
  status: "free",
  isEntitled: false,
  entitledUntil: null,
  activePlanId: null,
  activeProductId: null,
  provider: null,
  expiresAt: null,
  trialEndsAt: null,
  startedAt: null,
};

/**
 * Mandates are registered for 5 years. NOT the provider maximum (30) — that
 * sits exactly on Razorpay's ceiling with zero margin, and `endDate` is built
 * from `istDateOnly(now)`, i.e. the IST calendar date stamped as UTC midnight.
 * Between 00:00 and 05:30 IST the IST date has rolled over but UTC has not, so
 * a 30-year `expire_at` lands up to 5.5h past Razorpay's real-time `now + 30y`
 * and every registration in that window is rejected with
 * "expire_at cannot be more than 30 years for upi". 5 leaves 25 years of slack.
 */
const MANDATE_TENURE_YEARS = 5;

/**
 * The consent shape every mandate is registered under. ONE object, spread into
 * both the row and the provider call, because those two used to be separate
 * literals — and a mandate whose stored terms disagree with what the payer
 * actually approved is unauditable.
 *
 * `AS_PRESENTED` is load-bearing. A calendar frequency anchors the mandate to a
 * recurrence cycle that the registration deposit already consumes, so no debit
 * date inside the trial is legal — Decentro refuses the notification with
 * `error_invalid_debit_date` and the subscriber is never billed. Merchant-
 * scheduled means the cadence lives in `BillingCycleService` and `nextDebitDate`
 * can be any date. The stored value is a LABEL: nothing reads it back to decide
 * a cycle (`BillingCycleService` advances on `addMonthClamped`), so monthly
 * billing is unchanged.
 *
 * `ruleType` applies only to the calendar frequencies — the Decentro adapter
 * drops it on `AS_PRESENTED`, where a recurrence rule is a 400. `AFTER` with no
 * day number, matching crickmate-monorepo's Decentro adapter, which sends
 * `rule_type` alone and has no `rule_value` anywhere in its codebase.
 *
 * `ruleValue` is retained ONLY because `mandates.rule_value` is NOT NULL. It is
 * no longer sent to any provider and no longer describes the consent; treat the
 * column as vestigial until a migration drops it.
 */
const MANDATE_CONSENT_TERMS = {
  frequency: "AS_PRESENTED",
  amountRule: "MAX",
  ruleType: "AFTER",
  ruleValue: 28,
} as const;

/**
 * Re-poll the provider at most this often per mandate. The client polls
 * aggressively after returning from its UPI app; without a throttle that
 * becomes one upstream call per client tick.
 */
const POLL_THROTTLE_MS = 3_000;

/** States a user can recover from by consenting again. */
const RE_REGISTRABLE: readonly MandateState[] = [
  "revoked",
  "rejected",
  "expired",
  "failed",
];

/**
 * Narrow `mandates.provider_checkout` — a `Json?` column — into the shape the
 * client is promised, or nothing.
 *
 * The single narrowing point for that column, and it is deliberately total: a
 * row written by an older build, half-populated by a partial migration, or
 * edited by hand must degrade to "no checkout available" (the app then shows a
 * re-register CTA) rather than reaching the wire as a checkout object with, say,
 * no `orderId` — which the SDK would open and fail on, with no way for the user
 * to tell why.
 *
 * Every field is required because every field is load-bearing at the SDK: there
 * is no useful partial checkout.
 */
function readRazorpayCheckout(value: unknown): RazorpayCheckout | null {
  if (typeof value !== "object" || value === null) return null;
  const c = value as Record<string, unknown>;
  const complete =
    typeof c.keyId === "string" &&
    typeof c.orderId === "string" &&
    typeof c.customerId === "string" &&
    typeof c.recurring === "string" &&
    c.orderId.length > 0 &&
    c.customerId.length > 0 &&
    c.keyId.length > 0;

  return complete ? (value as RazorpayCheckout) : null;
}

/**
 * The payer's no-reply address at a domain we own — the identity gateways get
 * when the real person has no email, which is every payer (phone accounts).
 *
 * KEYED ON THE PHONE NUMBER. It used to be the user id, which made the address
 * — and, on Razorpay, the customer NAME derived from its local part — a bare
 * UUID. That is unreadable on a gateway dashboard, on a receipt, and to whoever
 * is trying to match a support ticket to a payer, and the phone is the one
 * identifier a payment conversation actually starts from.
 *
 * No new disclosure: the same number is already sent to every gateway as the
 * payer's `contact`. Nothing delivers to this address; it exists so the
 * provider's customer records stay distinct and traceable.
 *
 * Falls back to the user id when the number is unknown — the only requirement
 * is that it be UNIQUE per payer, never the shared placeholder this replaced.
 */
function noReplyEmail(handle: string): string {
  return `${handle}@no-reply.prabhuji.app`;
}

export interface MandatePlan {
  planId: string;
  productId: string;
  amountPaise: number;
  currency: string;
  trialDays: number;
  /**
   * What to debit at registration while a trial runs. Sourced from
   * `paywall_plans.initial_deposit_paise`, so changing it is a data edit rather
   * than a deploy — it used to be a constant inside the Cashfree adapter.
   */
  initialDepositPaise: number;
}

/**
 * The one thing this service asks the billing engine to do, and nothing more.
 *
 * A mandate going active is the moment its first cycle becomes notifiable, and
 * for a trial as short as the gateway's lead band it is the ONLY day that cycle
 * can be notified at all — so the notification cannot wait for the next sweep
 * tick, which may not come before the day rolls over.
 *
 * A ONE-METHOD interface rather than a `BillingCycleService` reference, because
 * this direction of the dependency is the wrong way round: `BillingCycleService`
 * already depends on `MandateService`, and importing it back would be a cycle.
 * Narrowing it to the single call also keeps the ownership honest — claiming a
 * cycle stays the billing engine's job, and this service only says WHEN.
 *
 * Supplied as a THUNK (see `MandateService`'s constructor) purely so the
 * composition root can build the two in either order.
 */
export interface FirstCycleNotifier {
  notifyFirstCycleNow(mandate: MandateRow, now: Date): Promise<void>;
}

/**
 * Mandate lifecycle.
 *
 * Owns registration, the confirm-by-poll read, and translating provider state
 * into subscription transitions. It NEVER writes `subscriptions` directly —
 * that table belongs to `core/subscription` and is reached through the facade,
 * so all five Pro gates keep reading a single owner's writes.
 */
export class MandateService {
  /**
   * Two provider seams, and the split is the whole of "a user on gateway A
   * stays on gateway A".
   *
   * `activeProvider` is used by ONE method — `createMandate` — because that is
   * the only moment a gateway is chosen. Every other path acts on a row that
   * already names its own gateway, and resolves through `resolve` from
   * `row.provider`. Reaching for `activeProvider` anywhere else silently
   * re-points an existing subscriber at a gateway that has never seen their
   * mandate id.
   */
  constructor(
    private readonly repo: MandateRepository,
    private readonly transactions: TransactionsRepository,
    private readonly activeProvider: MandateProvider,
    private readonly resolve: ProviderResolver,
    private readonly config: { expiryMinutes: number; mandateName: string },
    /**
     * Resolved LAZILY, at call time, so the composition root can construct
     * `BillingCycleService` — which takes this service — afterwards. Optional so
     * every existing test constructs unchanged: an absent notifier means "leave
     * the first notification to the sweep", which is exactly the behaviour
     * before TAM-164.
     */
    private readonly firstCycleNotifier?: () => FirstCycleNotifier
  ) {}

  /**
   * The payer identity handed to the gateway.
   *
   * Every mandate used to carry the SAME hardcoded `9999999999` / shared email,
   * so at the provider all our customers were indistinguishable — which breaks
   * reconciliation and any dispute that starts from a phone number.
   *
   * Email is DERIVED, not fetched: every payer is a phone account (the paywall
   * lives in the mobile app; CMS accounts do not subscribe) and those rows have
   * no email by construction. A per-user no-reply address on a domain we own
   * keeps the provider's customer records unique and traceable back to a real
   * person, which a shared placeholder never could. `UserPublic` deliberately
   * excludes email, and this does not reopen that.
   *
   * KEYED ON THE PHONE NUMBER, not the user id — see `noReplyEmail`.
   *
   * Best-effort by design: a lookup failure must not block a payment the user
   * is actively trying to make, so it degrades to the derived identity rather
   * than throwing.
   */
  private async resolvePayer(userId: string): Promise<PayerContact> {
    try {
      const user = await performServiceCall(
        "users",
        (api) => api.getUserPublic(userId),
        `mandate:resolvePayer user=${userId}`,
        "failed to resolve payer contact"
      );
      const phone = user?.phoneNumber ?? null;
      // The phone when we have one, the user id when we do not — never a shared
      // constant, which is the whole point of deriving it at all.
      return { phone, email: noReplyEmail(phone ?? userId) };
    } catch (err) {
      log.warn(
        { err, event: "payer_contact_unresolved", user_id: userId },
        "could not resolve the payer's phone — registering the mandate without it"
      );
      return { phone: null, email: noReplyEmail(userId) };
    }
  }

  /**
   * The gateway's stored handle for this payer, if we have one.
   *
   * Fails SOFT: if the users facade is unreachable we register without it, and
   * the adapter creates a customer. On Razorpay that hits "Customer already
   * exists" for a returning payer — a failed registration the user can retry —
   * whereas throwing here would fail it just as surely while ALSO blocking
   * first-time payers, who have no handle to fetch. Degrading loses nothing that
   * hard-failing would have saved.
   */
  private async resolveProviderCustomerId(userId: string): Promise<string | null> {
    try {
      return await performServiceCall(
        "users",
        (api) => api.getRazorpayCustomerId(userId),
        `mandate:resolveProviderCustomerId user=${userId}`,
        "failed to resolve the stored gateway customer"
      );
    } catch (err) {
      log.warn(
        { err, event: "provider_customer_unresolved", user_id: userId },
        "could not read the stored gateway customer — registering without it"
      );
      return null;
    }
  }

  /**
   * Persist the handle the gateway used, so the NEXT registration skips the
   * create.
   *
   * Best-effort by design: the mandate is already registered and the user is
   * waiting on the approval sheet. Losing this write costs one redundant
   * create-customer call next time — which `fail_existing: "0"` absorbs — and is
   * not worth failing a live registration over.
   */
  private async rememberProviderCustomerId(
    userId: string,
    customerId: string | null | undefined
  ): Promise<void> {
    if (!customerId) return;
    try {
      await performServiceCall(
        "users",
        (api) => api.rememberRazorpayCustomerId(userId, customerId),
        `mandate:rememberProviderCustomerId user=${userId}`,
        "failed to store the gateway customer"
      );
    } catch (err) {
      log.warn(
        { err, event: "provider_customer_not_stored", user_id: userId },
        "could not store the gateway customer — the next registration will re-create it"
      );
    }
  }

  /**
   * Register a mandate for `userId`, or hand back the one already in flight.
   *
   * Reusing an in-flight mandate is not just an optimisation: minting a second
   * `referenceId` while the first is still pending orphans it at the provider
   * with no way to reconcile, and two live mandates for one user is a
   * double-charge waiting to happen.
   */
  async createMandate(input: {
    userId: string;
    plan: MandatePlan;
    now: Date;
  }): Promise<MandateView> {
    const { userId, plan, now } = input;

    const reusable = await this.repo.findReusableForUser(userId, now);
    if (reusable) {
      // Refresh an `active` mandate before trusting it. This also self-heals a
      // subscription that never received the authorization transition (see
      // `refreshFromProvider`).
      const refreshed =
        reusable.state === "active"
          ? await this.refreshFromProvider(reusable, now)
          : reusable;
      const view = this.toView(
        refreshed,
        now,
        await this.transactions.findInitialDepositIdForMandate(refreshed.id)
      );

      // Only hand back a mandate that can still take the user SOMEWHERE:
      // either they are already entitled, or there is a live link to approve
      // at. An `active` mandate whose approval link has expired and which is
      // granting nothing is a dead end — and because it stays `active` it
      // would be reused on every retry, so the user could never escape it.
      // That reproduced on-device as a permanent "payment link expired".
      // an SDK block counts as "somewhere to go" exactly as `authUrl` does — it IS
      // the approval affordance on an SDK gateway. Without this clause every
      // Razorpay retry would fall through to the retire-and-re-register path
      // below, abandoning a live order per tap and defeating the
      // one-mandate-in-flight invariant this whole block exists to hold.
      const entitled = await requireProEntitlement(userId, "payment:mandate-reuse");
      if (entitled || view.authUrl !== null || view.razorpay !== null) {
        log.info(
          {
            ...paymentTrace({ stage: PAYMENT_STAGE.registration, mandate: refreshed }),
            event: "mandate_reused",
            state: refreshed.state,
            entitled,
          },
          "returning in-flight mandate instead of minting a second"
        );
        return view;
      }

      // Retire it so it stops being selected, then fall through to register a
      // fresh mandate. `expired` (not `revoked`) because nothing was ever
      // approved against it from the user's point of view.
      await this.repo.setState(refreshed.id, "expired", "stale_no_auth_link");
      this.reportStateChange(
        { ...refreshed, state: "expired", stateReason: "stale_no_auth_link" },
        refreshed.state,
        "inline",
        now
      );
      log.warn(
        {
          ...paymentTrace({ stage: PAYMENT_STAGE.registration, mandate: refreshed }),
          event: "mandate_retired_stale",
          previous_state: refreshed.state,
        },
        "existing mandate grants nothing and has no live approval link — retiring it and registering a new one"
      );
    }

    // One free trial per user, ever. NPCI auto-revokes a mandate whose first
    // debit fails, so re-registration is a NORMAL path — and without this
    // check it would be an unlimited free-trial generator.
    const trialDays = (await this.hasConsumedTrial(userId)) ? 0 : plan.trialDays;
    const today = istDateOnly(now);

    // The mandate is valid from TODAY, always — even during a trial. Decentro
    // refuses `is_first_txn_amount` (the deposit taken with the UPI PIN) on a
    // mandate whose `start_date` is in the future, so the trial cannot be
    // expressed by pushing the start date out. It lives in `firstDebitDate`.
    const startDate = today;

    // When the first FULL-price debit is due.
    //
    // During a trial, the day it ends. WITHOUT one the registration charge is
    // already the full price and covers the current period, so the next debit
    // is a month out — this used to be `today`, which no cycle could ever
    // clear: `canSendPreDebitNotification` requires 24h of lead, so a
    // same-day cycle date is refused on every tick and the mandate sat active
    // and never billed again.
    const firstDebitDate =
      trialDays > 0 ? addDays(today, trialDays) : addMonthClamped(today);

    // The first cycle must be far enough out for THIS gateway's pre-debit
    // notification to fit in front of it, or it can never be billed.
    //
    // The lead is measured in whole days (`cycleDate - istDateOnly(now)`), so a
    // gateway with a 48h floor cannot notify a cycle only one day away: the
    // sweep reports `skippedOutsideWindow` on every tick and the mandate sits
    // active, having taken the registration deposit, and is never charged
    // again. Nothing else in the system notices — there is no failed row to
    // find, because no cycle is ever claimed.
    //
    // Refused at REGISTRATION, which is the only moment anyone can act on it:
    // the alternative is discovering it a trial later, per subscriber, from an
    // absence. Configuration error, so it is the plan that is rejected.
    const leadHours =
      (firstDebitDate.getTime() - today.getTime()) / 3_600_000;
    const { min: minLeadHours } = this.activeProvider.pdnLeadHours;
    if (leadHours < minLeadHours) {
      log.error(
        {
          event: "plan_trial_shorter_than_pdn_lead",
          user_id: userId,
          plan_id: plan.planId,
          provider: this.activeProvider.name,
          trial_days: trialDays,
          lead_hours: leadHours,
          min_lead_hours: minLeadHours,
        },
        "plan's first debit lands inside the gateway's notification lead time — it could never be billed"
      );
      throw new AppError(
        "This plan cannot be purchased on the current payment gateway",
        409,
        "PLAN_NOT_PURCHASABLE"
      );
    }

    // Pro granted by the trial runs to the END of the IST day the first debit
    // is attempted — NPCI's execution windows span that whole day, so ending it
    // any earlier would cut access off while the charge that renews it is still
    // in flight. Decided here, where `trialDays` has already been through the
    // one-trial-per-user rule and is authoritative; activation reads it back
    // rather than re-deriving it from a date.
    const trialEndsAt = trialDays > 0 ? istEndOfDay(firstDebitDate) : null;

    // Persist BEFORE calling the provider. If the call times out, the provider
    // may still have registered the mandate; this row (keyed by referenceId)
    // is the only way to find it again.
    const referenceId = `pj_mnd_${randomUUID()}`;
    const row = await this.repo.createInitiated({
      userId,
      type: "upi",
      provider: this.activeProvider.name,
      referenceId,
      planId: plan.planId,
      productId: plan.productId,
      amountPaise: plan.amountPaise,
      currency: plan.currency,
      ...MANDATE_CONSENT_TERMS,
      startDate,
      endDate: new Date(
        Date.UTC(
          today.getUTCFullYear() + MANDATE_TENURE_YEARS,
          today.getUTCMonth(),
          today.getUTCDate()
        )
      ),
      nextDebitDate: firstDebitDate,
      trialEndsAt,
    });

    // What registration itself will debit. During a trial this is the plan's
    // small deposit; otherwise the full price moves now. Decided HERE, not in
    // the adapter, because `trialDays` above already accounts for the
    // one-trial-per-user rule and is the authoritative answer — the adapter used
    // to re-derive it by comparing dates and substitute a hardcoded ₹2.
    const initialDepositPaise =
      trialDays > 0 ? plan.initialDepositPaise : plan.amountPaise;

    // Persist the money row BEFORE dispatch, for the same reason the mandate row
    // is: if the call times out, this is the only record that a charge may have
    // been taken. Its absence is why the ₹2 deposit was previously invisible.
    const deposit = await this.transactions.recordInitialDeposit({
      userId,
      mandateId: row.id,
      provider: this.activeProvider.name,
      chargePhase: this.activeProvider.supportsInitialDeposit ? "deposit" : "none",
      amountPaise: initialDepositPaise,
      currency: plan.currency,
      gatewayRequestId: referenceId,
      planId: plan.planId,
      productId: plan.productId,
    });

    log.info(
      {
        ...paymentTrace({
          stage: PAYMENT_STAGE.registration,
          mandate: row,
          transactionId: deposit.id,
        }),
        event: "initial_deposit_recorded",
        gateway_request_id: referenceId,
        amount_paise: initialDepositPaise,
        currency: plan.currency,
        plan_id: plan.planId,
        trial_days: trialDays,
        provider: this.activeProvider.name,
      },
      // The ₹2 registration charge used to leave no trace at all — not in the
      // database and not in the logs. It is real money; it gets a line.
      initialDepositPaise > 0
        ? "MONEY OUT (pending) — charging the registration deposit"
        : "registration takes no deposit on this gateway (₹0)"
    );
    // The funnel's denominator. Emitted BEFORE dispatch for the same reason the
    // two rows above are written before it: a registration that dies at the
    // gateway must still be countable, or it looks identical to a user who
    // never tapped Pay.
    //
    // `void`, not `await` — every analytics call in this file is on a REQUEST
    // path (registration here, the client's approval polling in
    // `onStateChanged`), and the user must not wait on the collector. The send
    // cannot reject, so there is no error to lose. The billing task awaits
    // instead; see PaymentAnalyticsService's note on the two runtimes.
    void paymentAnalytics.trackSubscriptionInitiated({
      mandate: row,
      txn: deposit,
      trialDays,
    });
    // The money half of the same moment, and a separate event because it
    // answers a separate question: this one is "did the ₹2 land", the one above
    // is "did a subscription get as far as being attempted". A gateway that
    // declines every deposit shows up here while the subscription funnel above
    // looks untouched.
    if (initialDepositPaise > 0) {
      void paymentAnalytics.trackPaymentInitiated({ mandate: row, txn: deposit });
    }
    // The trial funnel's own denominator, emitted here for the same reason as
    // the two above: BEFORE the gateway call, so a registration that dies in
    // dispatch is still counted as a trial attempt.
    if (trialDays > 0) {
      void paymentAnalytics.trackTrialPaymentInitiated({
        mandate: row,
        txn: deposit,
        trialDays,
      });
    }

    let registered;
    try {
      registered = await this.activeProvider.createMandate({
        referenceId,
        payer: await this.resolvePayer(userId),
        // The gateway's existing handle for this payer, so the adapter can skip
        // creating a customer it already created. Razorpay refuses a duplicate
        // outright, which is what made every re-registration fail before the
        // order was even reached.
        providerCustomerId: await this.resolveProviderCustomerId(userId),
        type: "upi",
        mandateName: this.config.mandateName,
        purposeMessage: this.config.mandateName,
        amountPaise: plan.amountPaise,
        initialDepositPaise,
        currency: plan.currency,
        ...MANDATE_CONSENT_TERMS,
        startDate,
        endDate: row.endDate,
        expiryMinutes: this.config.expiryMinutes,
      });

      // A registration the user cannot possibly approve — no link AND no SDK
      // handles — is worse than one that failed outright: the row would sit
      // `pending`, be reused on every retry, and the paywall would never open.
      //
      // Checked here rather than trusted from each adapter, because it is the
      // one invariant spanning all of them and a new gateway is exactly where it
      // gets missed. Inside the `try` on purpose: the catch below is what marks
      // the mandate failed and the deposit reconcilable, and a registration that
      // may have moved money must never escape that handling.
      if (registered.authUrl === null && !registered.razorpay) {
        throw new AppError(
          `${this.activeProvider.name} returned neither an approval link nor SDK checkout details`,
          502,
          "PROVIDER_RESPONSE_INVALID"
        );
      }
    } catch (err) {
      // Leave the row `initiated` rather than deleting it — the reconciliation
      // sweep polls these, and the provider may have succeeded on its side.
      await this.repo.setState(row.id, "failed", "provider_error");
      this.reportStateChange(
        { ...row, state: "failed", stateReason: "provider_error" },
        row.state,
        "inline",
        now
      );
      // Same reasoning for the ledger row: mark it failed at the dispatch phase
      // but KEEP it, carrying `gateway_request_id`, so a charge that landed
      // after our timeout is still reconcilable against the gateway.
      const failureMessage = safeFailureMessage(err);
      await this.transactions.markSubmitFailed(deposit.id, {
        failureCode: "REGISTRATION_ERROR",
        failureMessage,
      });
      log.error(
        {
          ...paymentTrace({
            stage: PAYMENT_STAGE.registration,
            mandate: row,
            transactionId: deposit.id,
          }),
          event: "initial_deposit_failed",
          gateway_request_id: referenceId,
          amount_paise: initialDepositPaise,
          failure_code: "REGISTRATION_ERROR",
          failure_message: failureMessage,
          // The dispatch threw, so we do NOT know whether the gateway took the
          // money. `gateway_request_id` is what to ask it with.
          recoverable: true,
          next_step: "reconcile_against_gateway_request_id",
        },
        "MONEY UNKNOWN — registration dispatch failed, deposit may or may not have been taken"
      );
      log.error(
        {
          ...paymentTrace({
            stage: PAYMENT_STAGE.registration,
            mandate: row,
            transactionId: deposit.id,
          }),
          event: "mandate_registration_failed",
          // The message only; never the provider's raw payload, which can
          // carry credentials or the payer's full handle.
          reason: failureMessage,
        },
        "mandate registration failed at the provider"
      );
      throw new AppError(
        "Could not start the payment setup. Please try again.",
        502,
        "PAYMENT_PROVIDER_UNAVAILABLE"
      );
    }

    // Before anything else that can fail: this is what stops the NEXT attempt
    // hitting "Customer already exists", so it must not sit behind a step that
    // might throw first.
    await this.rememberProviderCustomerId(userId, registered.providerCustomerId);

    const updated = await this.repo.applyRegistration(row.id, {
      state: registered.state,
      providerMandateId: registered.providerMandateId,
      providerTxnId: registered.providerTxnId,
      authUrl: registered.authUrl,
      providerCheckout: registered.razorpay ?? null,
      authExpiresAt: registered.authExpiresAt,
    });

    // The deposit is now with the gateway, awaiting the user's UPI approval —
    // which is exactly what `submitted` means. It settles when the mandate
    // reaches a terminal state (`onStateChanged`). This is also where the
    // gateway's own payment id first becomes knowable.
    await this.transactions.markSubmitted(deposit.id, {
      gatewayPaymentId: registered.providerTxnId,
      at: now,
    });

    // Records the provider handle so a callback carrying only a mandate id can
    // be traced back to a user. Grants nothing.
    await performServiceCall(
      "subscription",
      (api) =>
        api.applyPendingMandate({
          userId,
          provider: this.activeProvider.name,
          providerSubscriptionId: registered.providerMandateId ?? referenceId,
          planId: plan.planId,
          productId: plan.productId,
        }),
      "payment:mandate-create",
      "failed to record pending mandate"
    );

    log.info(
      {
        ...paymentTrace({
          stage: PAYMENT_STAGE.registration,
          mandate: updated,
          transactionId: deposit.id,
        }),
        event: "mandate_created",
        state: registered.state,
        provider_mandate_id: registered.providerMandateId ?? null,
        gateway_payment_id: registered.providerTxnId ?? null,
        amount_paise: initialDepositPaise,
        trial_days: trialDays,
        // Both, always. They are equal only when the plan has no trial, and the
        // whole class of bug this replaced came from reading one as the other.
        start_date: startDate.toISOString().slice(0, 10),
        first_debit_date: firstDebitDate.toISOString().slice(0, 10),
        trial_ends_at: trialEndsAt?.toISOString() ?? null,
      },
      "mandate registered — awaiting user approval"
    );
    void paymentLedgerAnalytics.trackMandateCreated({ mandate: updated });

    return this.toView(updated, now, deposit.id);
  }

  /**
   * Current mandate state for a user, refreshed from the provider when stale.
   *
   * This is the client's poll target. The confirm-by-poll happens HERE, on the
   * server, so the client never has to be trusted with an entitlement
   * decision — and a forged callback can't shortcut it.
   */
  async getMandateForUser(userId: string, now: Date): Promise<MandateView | null> {
    const row = await this.repo.findLatestForUser(userId);
    if (!row) return null;

    const refreshed = this.shouldPoll(row, now)
      ? await this.refreshFromProvider(row, now)
      : row;

    return this.toView(
      refreshed,
      now,
      await this.transactions.findInitialDepositIdForMandate(refreshed.id)
    );
  }

  /**
   * Pull authoritative state from the provider and apply any transition.
   *
   * The ONLY place mandate state is believed from. Callbacks route here rather
   * than carrying their own verdict, because the India v3 callbacks have no
   * signature — a forged body claiming `Active` must not grant anything.
   */
  async refreshFromProvider(
    row: MandateRow,
    now: Date,
    /** How this read was triggered — reported on `bk_mandate_status`. */
    source: LedgerEventSource = "poll"
  ): Promise<MandateRow> {
    let status;
    try {
      // The row's OWN gateway, not the active one — this poll is what mandate
      // state is believed from, and asking the wrong gateway about someone
      // else's mandate id answers "unknown", which maps to `pending` and would
      // strand an active subscriber.
      status = await this.resolve(row.provider).getMandateStatus({
        referenceId: row.referenceId,
        providerMandateId: row.providerMandateId,
        // The registration order — on Razorpay this is what identifies THIS
        // attempt, and the authorization payment hanging off it carries both the
        // token that activates the mandate and the payment id the deposit settle
        // below writes as `gateway_payment_id`. See the port's docblock.
        registrationRef: readRazorpayCheckout(row.providerCheckout)?.orderId ?? null,
      });
    } catch (err) {
      // Fail soft: a provider blip must not break the client's poll. The row
      // keeps its last known state and we try again next tick.
      log.warn(
        {
          ...paymentTrace({ stage: PAYMENT_STAGE.mandate, mandate: row }),
          event: "mandate_poll_failed",
          state: row.state,
          reason: safeFailureMessage(err),
        },
        "provider status poll failed — keeping last known state"
      );
      return row;
    }

    // A declined trial deposit on a mandate the gateway keeps `pending`
    // (Razorpay). Reported only on a WEBHOOK-triggered read: the gateway's
    // `payment.failed` delivery is the once-per-attempt moment, while the sweep
    // and the client's checkout poll re-read the same failed payment every few
    // minutes for as long as the mandate stays pending. Analytics only (TAM-188).
    if (
      source === "webhook" &&
      status.failedRegistrationPayment &&
      row.trialEndsAt !== null &&
      (row.state === "initiated" || row.state === "pending")
    ) {
      // Caught HERE: building the event runs outside the sender's own boundary,
      // and a rejection escaping a `void` would be unhandled — analytics must
      // never be able to take the process (or this poll) down with it.
      this.publishDepositDeclined(row, status.failedRegistrationPayment).catch(
        (err: unknown) => {
          log.warn(
            {
              ...paymentTrace({ stage: PAYMENT_STAGE.registration, mandate: row }),
              event: "trial_deposit_declined_report_failed",
              reason: safeFailureMessage(err),
            },
            "could not report the declined trial deposit — analytics only, state unaffected"
          );
        }
      );
    }

    const previous = row.state;

    // A REVOKED MANDATE IS NEVER RESURRECTED BY A POLL.
    //
    // Razorpay parks a cancelled token in `recurring_details.status =
    // "cancellation_initiated"` until NPCI confirms, and the adapter maps that
    // to `active` on purpose — treating an in-flight cancellation as terminal
    // would strip entitlement from a paying user whose cancellation may yet
    // fail. That mapping was written when cancellations only ever arrived from
    // OUTSIDE.
    //
    // Once we initiate the cancel ourselves, our own `PUT …/cancel` fires a
    // `token.cancellation_initiated` webhook. The callback correctly polls
    // rather than trusting the body, reads `cancellation_initiated` → `active`,
    // and one second later overwrites the `revoked` we just wrote — then
    // `onStateChanged` re-runs `mandate_authorized` and the subscription lands
    // back on `pending`. Observed in production: a user cancelled, the gateway
    // accepted it, and they lost the access they had paid for while our
    // scheduler still held a live mandate to bill.
    //
    // Guarding HERE rather than in the webhook handler because this is the one
    // funnel every state read routes through — the callback, the client's poll
    // and the straggler sweep all land on it, so a fix anywhere else leaves the
    // siblings broken.
    //
    // Deliberately `revoked` ALONE, not all of `TERMINAL_MANDATE_STATES`: a
    // revoke is final at NPCI and nothing legitimately un-revokes it, whereas
    // `expired` / `failed` rows CAN legitimately come back (an approval landing
    // after we gave up on a stale auth link is a real recovery, and blocking it
    // would strand a user who did pay). Widening this list is a decision, not a
    // tidy-up.
    //
    // If the cancellation later FAILS at NPCI the token returns to `confirmed`
    // and we stay `revoked` — we simply stop billing them. That direction is
    // safe (we under-charge rather than over-charge) and the warn below is what
    // makes it visible instead of silent.
    if (previous === "revoked" && status.state !== "revoked") {
      log.warn(
        {
          ...paymentTrace({ stage: PAYMENT_STAGE.mandate, mandate: row }),
          event: "mandate_revival_ignored",
          reported_state: status.state,
          state_reason: row.stateReason,
        },
        "provider reports a revoked mandate as live — keeping it revoked"
      );
      return row;
    }

    const updated = await this.repo.applyStatus(row.id, {
      state: status.state,
      stateReason: status.stateReason,
      providerMandateId: status.providerMandateId,
      providerTxnId: status.providerTxnId,
      npciTransactionId: status.npciTransactionId,
      payerHandleMasked: status.payerHandleMasked,
      payerNameMasked: status.payerNameMasked,
      nextDebitDate: status.nextDebitDate,
      polledAt: now,
    });

    if (previous !== status.state) {
      this.reportStateChange(updated, previous, source, now);
      await this.onStateChanged(updated, previous, now);
    } else if (updated.state === "active" && !(await requireProEntitlement(row.userId, "payment:self-heal"))) {
      // SELF-HEAL. Transitions previously fired only on a state CHANGE, so if
      // the authorization write was missed or applied wrongly the first time,
      // the subscription stayed stuck forever — the mandate is already
      // `active`, so it never changes again and never gets a second chance.
      //
      // That is not hypothetical: it produced a live `active` mandate against
      // a `pending` subscription, which the client rendered as a permanent
      // "payment link expired". The subscription writers are idempotent and
      // monotonic, so re-applying is always safe.
      log.warn(
        {
          ...paymentTrace({ stage: PAYMENT_STAGE.mandate, mandate: row }),
          event: "mandate_entitlement_reconciled",
          state: row.state,
        },
        "mandate is active but subscription is not entitled — re-applying authorization"
      );
      await this.onStateChanged(updated, previous, now);
    }
    return updated;
  }

  /** Revoke at the provider and end the subscription. */
  async cancelForUser(userId: string, now: Date): Promise<MandateView> {
    const row = await this.repo.findLatestForUser(userId);
    if (!row || !row.providerMandateId) {
      throw new AppError("No active subscription to cancel", 404, "NOT_FOUND");
    }
    if (TERMINAL_MANDATE_STATES.includes(row.state as MandateState)) {
      return this.toView(row, now, await this.transactions.findInitialDepositIdForMandate(row.id));
    }

    try {
      await this.resolve(row.provider).revokeMandate({
        referenceId: row.referenceId,
        providerMandateId: row.providerMandateId,
      });
    } catch (err) {
      // The user asked to leave and the gateway would not let go. Nothing is
      // written — they stay billable — so this must be LOUD: a subscriber who
      // "cancelled" and is charged next cycle is the complaint that follows.
      log.error(
        {
          ...paymentTrace({ stage: PAYMENT_STAGE.mandate, mandate: row }),
          event: "mandate_cancel_failed",
          state: row.state,
          provider_mandate_id: row.providerMandateId,
          reason: safeFailureMessage(err),
        },
        "user cancellation FAILED at the gateway — mandate stays live and billable"
      );
      throw err;
    }
    await this.repo.setState(row.id, "revoked", "user_cancelled");
    this.reportStateChange(
      { ...row, state: "revoked", stateReason: "user_cancelled" },
      row.state,
      "inline",
      now
    );

    // `cancelled`, not `expired`: they keep what they paid for until the
    // period ends. `computeIsEntitled` grants `cancelled` until `expiresAt`.
    await performServiceCall(
      "subscription",
      (api) => api.applyMandateEnded({ userId, reason: "cancelled", now }),
      "payment:mandate-cancel",
      "failed to end subscription"
    );

    log.info(
      {
        ...paymentTrace({ stage: PAYMENT_STAGE.mandate, mandate: row }),
        event: "mandate_cancelled",
        previous_state: row.state,
        provider_mandate_id: row.providerMandateId,
      },
      "user cancelled their mandate"
    );
    // How many full-price cycles they actually paid for before leaving — the
    // number that separates "churned after a year" from "churned on cycle 2".
    // Best-effort and index-covered; a count that fails must never fail a
    // cancellation, so it degrades to an absent property.
    let cyclesCompleted: number | null = null;
    try {
      cyclesCompleted = await this.transactions.countSettledRecurringDebits(row.id);
    } catch (err) {
      log.warn(
        { err, event: "settled_cycle_count_failed", mandate_id: row.id },
        "failed to count settled cycles for cancellation analytics"
      );
    }

    // `setState` above does not run `onStateChanged`, so this is the only place
    // a deliberate cancellation is observable — it does not arrive twice.
    void paymentAnalytics.trackSubscriptionEnded({
      mandate: row,
      now,
      reason: "user_cancelled",
      source: "user",
      cyclesCompleted,
    });
    // The deliberate-walk-away signal, and the reason it is emitted HERE rather
    // than inside `trackSubscriptionEnded`: this is the only cancellation a
    // human asked for. The same tracker also runs for bank revokes and failed
    // first debits, which are not decisions. No-ops outside the trial window.
    void paymentAnalytics.trackTrialCancelled({
      mandate: row,
      now,
      reason: "user_cancelled",
      source: "user",
    });

    const updated = await this.repo.findById(row.id);
    return this.toView(
      updated ?? row,
      now,
      await this.transactions.findInitialDepositIdForMandate(row.id)
    );
  }

  // ---- internals -----------------------------------------------------------

  /**
   * Apply the subscription-facing consequence of a mandate state change.
   *
   * Only transitions that change what the user can access are handled;
   * `paused` deliberately is not, because the user can resume it from their
   * UPI app and revoking access for a reversible state would be hostile.
   */
  /**
   * Publish the registration deposit's outcome as a payment event.
   *
   * Reads the row back because `settleDepositForMandate` answers a boolean —
   * it settles with a conditional `updateMany`, which is exactly what makes it
   * safe against a repeat, and changing it to return the row would cost a
   * second query on the money path for every caller, not just this one.
   *
   * The deposit's `gatewayRequestId` IS the mandate's reference (set at
   * registration), so the existing finder addresses it with no new repository
   * code. Best-effort like everything else here: no row found means no event,
   * never an error into the approval path.
   */
  private async publishDepositOutcome(
    row: MandateRow,
    status: "succeeded" | "abandoned"
  ): Promise<void> {
    const deposit = await this.transactions
      .findByGatewayRequestId(row.referenceId)
      .catch(() => null);
    if (!deposit) return;
    if (status === "succeeded") {
      await paymentAnalytics.trackPaymentSuccess({ mandate: row, txn: deposit });
      // The first charge (`StartTrial`) — cricsignal's cycle 0. Fires once:
      // this runs only when the deposit actually moved to `succeeded`.
      await reportTransactionConversion(true, deposit);
      return;
    }
    await paymentAnalytics.trackPaymentFailed({
      mandate: row,
      txn: deposit,
      outcome: "abandoned",
    });
  }

  /**
   * `bk_trial_failed` for a declined registration attempt — see
   * `PaymentAnalyticsService.trackTrialDepositDeclined`. Reads the deposit the
   * same way `publishDepositOutcome` does and writes nothing. Skipped once the
   * deposit has settled: a late redelivery about an earlier failed try must not
   * report a failure for a trial that has since succeeded.
   */
  private async publishDepositDeclined(
    row: MandateRow,
    payment: NonNullable<MandateStatusResult["failedRegistrationPayment"]>
  ): Promise<void> {
    const deposit = await this.transactions
      .findByGatewayRequestId(row.referenceId)
      .catch(() => null);
    if (!deposit || deposit.kind !== "initial_deposit" || deposit.status === "succeeded") {
      return;
    }
    await paymentAnalytics.trackTrialDepositDeclined({
      mandate: row,
      txn: deposit,
      gatewayPaymentId: payment.gatewayPaymentId,
      failureCode: payment.failureCode,
      failureReason: payment.failureReason,
    });
  }

  /**
   * Is the full-price payment that just settled this user's FIRST, ever?
   *
   * Counts the user's whole ledger rather than this mandate's, which is the
   * only scope that can answer it: a mandate is per-consent, so someone who
   * re-registers after an NPCI revoke starts a fresh one and every
   * mandate-scoped flag calls their next payment a first payment again.
   *
   * Exactly `1`, on both sides. The charge is already settled by the time this
   * runs — both callers write the money `succeeded` first (`onStateChanged`
   * settles the deposit, `onDebitSucceeded` settles the cycle) — so the user's
   * own payment is INSIDE the count, and one means "this one and no other".
   *
   * Zero is not a first payment, it is no payment. Reachable on a gateway
   * without `supportsInitialDeposit`, which approves a mandate having charged
   * nothing — its deposit row is still written at the full price and still
   * settles on approval, so only the `chargePhase: "none"` filter inside
   * `countSettledFullPriceForUser` keeps it out of the count. The old event
   * fired there anyway, on the theory that approval implied money; keyed on
   * money, it must not.
   *
   * Public because `BillingCycleService` asks the same question on the debit
   * path. It lives here rather than being copied there so the counting
   * convention and the fail-closed policy have exactly one definition.
   *
   * Best-effort, and fails CLOSED. Analytics must never take down an approval,
   * and between losing one event and reporting a second "first" payment for
   * someone who has been paying for months, the lost event is the cheaper
   * mistake — revenue-start counts are read as a cohort size.
   */
  async isFirstFullPricePayment(row: MandateRow): Promise<boolean> {
    try {
      const settled = await this.transactions.countSettledFullPriceForUser(row.userId);
      return settled === 1;
    } catch (err) {
      log.warn(
        { err, event: "first_payment_check_failed", user_id: row.userId, mandate_id: row.id },
        "failed to check first-payment history for analytics"
      );
      return false;
    }
  }

  /**
   * `bk_mandate_status` for a state that was just WRITTEN. Called only where a
   * write changed the state — never on a poll that read the same state back,
   * which is what keeps the self-heal re-apply out of the ledger.
   *
   * `void`: every caller is on a request path or ahead of billing work that
   * must not wait on the collector — nor on the attempt lookup, which is why
   * that read happens inside the fire-and-forget half. Neither step can reject.
   */
  private reportStateChange(
    mandate: MandateRow,
    previousStatus: string,
    source: LedgerEventSource,
    changedAt: Date
  ): void {
    void this.publishStateChange(mandate, previousStatus, source, changedAt);
  }

  private async publishStateChange(
    mandate: MandateRow,
    previousStatus: string,
    source: LedgerEventSource,
    changedAt: Date
  ): Promise<void> {
    const attemptNumber = await resolveLatestAttemptNumber(this.transactions, mandate.id);
    await paymentLedgerAnalytics.trackMandateStatusChanged({
      mandate,
      previousStatus,
      source,
      changedAt,
      attemptNumber,
    });
  }

  private async onStateChanged(
    row: MandateRow,
    previous: string,
    now: Date
  ): Promise<void> {
    log.info(
      {
        ...paymentTrace({ stage: PAYMENT_STAGE.mandate, mandate: row }),
        event: "mandate_state_changed",
        from: previous,
        to: row.state,
        state_reason: row.stateReason,
        provider_mandate_id: row.providerMandateId,
      },
      "mandate state changed"
    );

    if (row.state === "active") {
      // The user approved, so the registration deposit went through — that
      // approval IS the deposit's outcome. Settled here rather than at
      // registration because until now it was genuinely pending at the gateway.
      const settled = await this.transactions.settleDepositForMandate(row.id, {
        status: "succeeded",
        gatewayPaymentId: row.providerTxnId,
        at: now,
      });
      if (settled) {
        log.info(
          {
            ...paymentTrace({ stage: PAYMENT_STAGE.registration, mandate: row }),
            event: "initial_deposit_succeeded",
            // The deposit row is keyed on the mandate reference, so this is the
            // ledger lookup without a second read on the approval path.
            gateway_request_id: row.referenceId,
            gateway_payment_id: row.providerTxnId,
            plan_id: row.planId,
          },
          "MONEY IN — registration deposit settled (user approved the mandate)"
        );
        void this.publishDepositOutcome(row, "succeeded");
      }

      // Read back, not re-derived. This used to be
      // `startDate > now ? startDate : null`, which was wrong twice over:
      // `startDate` is now the registration day on every row, and the
      // comparison itself ended a one-day trial at 05:30 IST the next morning
      // because a `@db.Date` reads back as UTC midnight.
      //
      // Null on a mandate registered before the two dates were split — those
      // rows predate the column and their trial, if any, was already granted on
      // `subscriptions` at their own activation. Re-granting is not the job
      // here; `applyMandateAuthorized` is idempotent per mandate.
      const trialEndsAt =
        row.trialEndsAt !== null && row.trialEndsAt.getTime() > now.getTime()
          ? row.trialEndsAt
          : null;
      // The RESULT is captured, not discarded (TAM-181). `trialFirstConsumed`
      // is true only on the call that actually stamped `trialConsumedAt` — once
      // per user for all time — and it is what gates `bk_trial_success` below.
      const authorized = await performServiceCall(
        "subscription",
        (api) =>
          api.applyMandateAuthorized({
            userId: row.userId,
            providerSubscriptionId: row.providerMandateId ?? row.referenceId,
            planId: row.planId,
            productId: row.productId,
            trialEndsAt,
            startedAt: now,
          }),
        "payment:mandate-authorized",
        "failed to activate subscription"
      );

      // WITHOUT A TRIAL, REGISTRATION ALREADY TOOK THE FULL PRICE — so this
      // approval is not just consent, it is a paid period, and something has to
      // grant it. `applyMandateAuthorized` above writes `pending` for a null
      // `trialEndsAt` ("live mandate, nothing paid for yet"), which was true
      // back when registration charged ₹0 or the ₹2 trial deposit. It stopped
      // being true when `createMandate` made the no-trial deposit
      // `plan.amountPaise`. The gap was not theoretical: a user paid ₹299 and
      // stayed `pending` — unentitled — until the first CYCLE debit a month
      // later, because `applyDebitSucceeded` is the only writer of `active`.
      //
      // So call it here too. The registration deposit IS this mandate's first
      // debit, and that transition already means exactly this; reusing it
      // inherits its monotonic `expiresAt` guard rather than inventing a second
      // way to grant a period.
      //
      // `row.trialEndsAt`, NOT the `trialEndsAt` local above. The local is also
      // null for a mandate whose trial window has already closed, and that
      // mandate only ever paid the ₹2 deposit — granting it a full month would
      // hand out a month nobody bought.
      //
      // `supportsInitialDeposit` is the same value that chose `chargePhase` at
      // registration — read from THIS ROW's gateway, which is what registration
      // used, not from whichever gateway happens to be active now. It answers
      // "was a charge actually dispatched" without a
      // query. Gating on the deposit ROW's status instead would be circular: the
      // only path here runs through the `settleDepositForMandate` call above,
      // which writes `succeeded` from this very approval.
      //
      // `nextDebitDate` is read back, never recomputed — registration set it to
      // `addMonthClamped(today)`, the exact period this charge covers. That is
      // what makes a replay idempotent: same value in, and the `expiresAt <
      // periodEnd` guard no-ops. Null only on a pre-split row, which predates
      // full-price registration entirely, so it is correctly excluded.
      const paidPeriodEnd =
        row.trialEndsAt === null &&
        row.amountPaise > 0 &&
        this.resolve(row.provider).supportsInitialDeposit
          ? row.nextDebitDate
          : null;
      if (paidPeriodEnd) {
        await performServiceCall(
          "subscription",
          (api) =>
            api.applyDebitSucceeded({
              userId: row.userId,
              periodEnd: paidPeriodEnd,
              planId: row.planId,
              productId: row.productId,
            }),
          "payment:registration-debit",
          "failed to grant the registration period"
        );
        log.info(
          {
            ...paymentTrace({ stage: PAYMENT_STAGE.registration, mandate: row }),
            event: "registration_period_granted",
            gateway_request_id: row.referenceId,
            amount_paise: row.amountPaise,
            period_end: paidPeriodEnd.toISOString().slice(0, 10),
          },
          "no-trial registration charged the full price — granting the period it bought"
        );
      }

      // Registration writes `nextDebitDate`, so this fires only for a mandate
      // created before the split — where `startDate` still carried the old
      // today+trialDays meaning and so IS that row's first debit date. Keep it
      // until no such mandate can still be awaiting approval.
      if (!row.nextDebitDate) {
        await this.repo.setNextDebitDate(row.id, row.startDate);
      }
      // Skipped entirely on a live trial: that branch reports a trial start,
      // which is not revenue and has nothing to be "first" about, so the query
      // would be spent on a value the event never reads.
      const isFirstFullPricePayment = trialEndsAt
        ? false
        : await this.isFirstFullPricePayment(row);
      void paymentAnalytics.trackMandateApproved({
        mandate: row,
        now,
        isFirstFullPricePayment,
        // Gates its TRIAL branch only (`bk_subscription_trial_started`), which
        // shares this path's re-entrancy and so shared its duplicate. The
        // full-price branch is untouched — it has its own
        // `isFirstFullPricePayment` gate and must still fire for a direct-paid
        // registration, which consumes no trial and would be suppressed by a
        // gate applied to the whole call.
        trialFirstConsumed: authorized.trialFirstConsumed,
      });
      // The trial's own success event, emitted HERE rather than beside the
      // settlement above because it claims the entitlement was granted, and
      // `applyMandateAuthorized` is what grants it — a throw there must not
      // leave a `bk_trial_success` behind.
      //
      // `trialEndsAt` (the local, already narrowed to a LIVE window) gates the
      // deposit read, so a full-price registration pays for no extra query. The
      // read is what makes the event worth having: it carries the ids and the
      // real ₹2 amount that the client's `trial_success` reports as null.
      //
      // GATED ON THE GRANT'S OWN ANSWER, not on `trialEndsAt` alone (TAM-181).
      // This branch is re-entrant by design — a provider callback racing the
      // client's poll both see `pending → active`, the self-heal below re-runs
      // it outright, and a user with a second trial-bearing mandate reaches it
      // again — and every one of those used to emit another
      // `bk_trial_success`. `trialFirstConsumed` comes from a guarded
      // `UPDATE … WHERE trial_consumed_at IS NULL`, so exactly one caller ever
      // sees it true: the event now means "this user started their one trial",
      // once per user, which is what the funnel reads it as.
      if (trialEndsAt) {
        if (authorized.trialFirstConsumed) {
          const deposit = await this.transactions
            .findByGatewayRequestId(row.referenceId)
            .catch(() => null);
          void paymentAnalytics.trackTrialSuccess({ mandate: row, txn: deposit, now });
        } else {
          // VISIBLE, not silent. The gate can only ever DROP an event, so the
          // one failure mode it can produce is a missing trial start — and that
          // is answered from this line rather than guessed at.
          log.info(
            {
              ...paymentTrace({ stage: PAYMENT_STAGE.registration, mandate: row }),
              event: "trial_start_events_suppressed",
              reason: "trial_already_consumed",
            },
            "trial already consumed by an earlier grant — not re-emitting bk_trial_success / bk_subscription_trial_started"
          );
        }
      }

      // LAST, and awaited. Last because everything above is what the user is
      // actually waiting on — entitlement, the settled deposit — and a
      // notification for a cycle a day or more away must not delay any of it.
      // Awaited rather than fire-and-forget because this claims a cycle: a
      // floating promise here would let the request finish while a ledger write
      // was still in flight, and `no-floating-promises` is a lint rule in this
      // repo precisely because that is how writes get lost on shutdown.
      //
      // Only reached for a mandate that just went ACTIVE, which is the one
      // moment its first cycle becomes notifiable. Everything about whether a
      // notification is actually due — the gateway's band, the blackout, an
      // already-claimed cycle — is decided inside, against the same rules the
      // sweep uses. See `BillingCycleService.notifyFirstCycleNow`.
      //
      // CAUGHT HERE, not only inside the notifier. The implementation swallows
      // its own failures, but this service must not depend on that: the thunk
      // itself can throw, and a future notifier could too. What must never
      // happen is a user who paid ₹2, was granted their trial, and then saw the
      // approval fail — leaving the client to retry a mandate that is already
      // active. The sweep is the fallback for everything missed here.
      try {
        await this.firstCycleNotifier?.().notifyFirstCycleNow(row, now);
      } catch (err) {
        log.error(
          {
            err,
            ...paymentTrace({ stage: PAYMENT_STAGE.pdn, mandate: row }),
            event: "activation_notify_unhandled",
          },
          "raising the first notification threw at activation — the approval stands and the sweep will retry"
        );
      }
      return;
    }

    if (RE_REGISTRABLE.includes(row.state as MandateState)) {
      // The mandate died before approval, so the deposit never completed. It is
      // `abandoned`, not `failed`: nothing declined it — the user simply never
      // finished, or the link expired underneath them.
      const abandoned = await this.transactions.settleDepositForMandate(row.id, {
        status: "abandoned",
        failurePhase: "submit",
        failureCode: "MANDATE_NOT_AUTHORIZED",
        failureMessage: `mandate reached ${row.state} without approval`,
        at: now,
      });
      if (abandoned) {
        log.info(
          {
            ...paymentTrace({ stage: PAYMENT_STAGE.registration, mandate: row }),
            event: "initial_deposit_abandoned",
            gateway_request_id: row.referenceId,
            mandate_state: row.state,
            state_reason: row.stateReason,
            failure_code: "MANDATE_NOT_AUTHORIZED",
          },
          // Not an error: the overwhelmingly common cause is a user who opened
          // the UPI app and changed their mind, or let the 15-minute link die.
          "registration deposit abandoned — mandate never approved"
        );
        void this.publishDepositOutcome(row, "abandoned");
      }

      // A mandate that was LIVE and then ended is a cancellation, not an
      // abandonment — the user keeps the trial or the period they already have,
      // exactly as the in-app cancel path (`cancelForUser`) grants. One that
      // never reached `active` paid for nothing, so it ends immediately.
      //
      // This used to send `expired` unconditionally, which made the SAME user
      // action mean two different things depending on where they performed it:
      // cancelling in the app kept their access, while cancelling the mandate in
      // their UPI app — which arrives here as a `token.cancelled` webhook —
      // revoked it on the spot.
      //
      // `previous === "active"` is the whole test, and it needs no companion
      // guard for "but was anything actually paid": `computeIsEntitled` grants
      // `cancelled` only against a FUTURE `expiresAt`/`trialEndsAt`, and those
      // are written solely by a settled debit and a real approval. A mandate
      // NPCI auto-revoked after a failed first debit therefore lands on
      // `cancelled` with no live deadline and is denied anyway — same outcome as
      // `expired`, without needing to enumerate the reasons here.
      await performServiceCall(
        "subscription",
        (api) =>
          api.applyMandateEnded({
            userId: row.userId,
            reason: previous === "active" ? "cancelled" : "expired",
            now,
          }),
        "payment:mandate-ended",
        "failed to end subscription"
      );

      // Two very different things reach this branch, and a funnel must not
      // average them: a mandate that was never approved is an ABANDONED
      // purchase, while one that dies after going live is CHURN. `previous` is
      // the only thing that separates them — the deposit's fate cannot, since a
      // mandate revoked months later has a long-settled deposit.
      if (previous === "active") {
        void paymentAnalytics.trackSubscriptionEnded({
          mandate: row,
          now,
          reason: row.stateReason ?? `mandate_${row.state}`,
          // The bank or the UPI app killed the standing consent; `reason` is
          // the gateway's own vocabulary, not ours.
          source: "provider",
        });
      } else {
        void paymentAnalytics.trackSubscriptionAbandoned({
          mandate: row,
          reason: row.stateReason ?? `mandate_${row.state}_before_approval`,
        });
      }
    }
  }

  /**
   * May this user still have a free trial?
   *
   * Delegates to the subscription facade, which reads the write-once
   * `trialConsumedAt` stamp. Do NOT be tempted to infer this from `status`
   * instead: `createMandate` moves the subscription to `pending` before the
   * user has approved anything, so a first attempt that fails — no UPI app
   * installed, user cancelled, link expired, network dropped — would
   * permanently consume a trial they never received. That is a normal path,
   * not an edge case, and it was caught on-device exactly that way.
   */
  private async hasConsumedTrial(userId: string): Promise<boolean> {
    return performServiceCall(
      "subscription",
      (api) => api.hasConsumedTrial(userId),
      "payment:trial-check",
      "failed to read trial eligibility"
    );
  }

  private shouldPoll(row: MandateRow, now: Date): boolean {
    if (TERMINAL_MANDATE_STATES.includes(row.state as MandateState)) return false;
    if (row.state === "active") return false;
    if (!row.lastPolledAt) return true;
    return now.getTime() - row.lastPolledAt.getTime() > POLL_THROTTLE_MS;
  }

  private toView(
    row: MandateRow,
    now: Date,
    paymentReferenceId: string | null
  ): MandateView {
    // The APPROVAL WINDOW, independent of what fills it.
    //
    // This used to also require `row.authUrl !== null`, which conflated "the
    // window is open" with "the window is filled by a link". An SDK gateway
    // stores no link, so that form reported every Razorpay row dead on arrival:
    // no SDK block would ever reach the client and the reuse path would retire a
    // perfectly live mandate on the first retry.
    const approvalWindowOpen =
      row.authExpiresAt !== null && row.authExpiresAt.getTime() > now.getTime();
    const authLive = approvalWindowOpen && row.authUrl !== null;

    return {
      mandateId: row.id,
      paymentReferenceId,
      // The gateway that minted THIS mandate's approval link, straight off the
      // row — not the active gateway, which is a different question once two
      // are live. Sent alongside the link because the client's analytics and
      // its support/diagnostic surfaces both need to name the gateway a given
      // user is actually on, and the alternative (a hardcoded constant in the
      // app) is wrong for every user registered before the last switch.
      provider: row.provider,
      state: row.state as MandateState,
      // An expired approval URL is worse than none: launching it drops the
      // user into a dead provider page with no way back.
      authUrl: authLive ? row.authUrl : null,
      // Same window, same reasoning: opening a checkout sheet against an order
      // past its expiry can only end in a failure the user cannot act on. Read
      // back from the row rather than rebuilt, so a retry — or a GET after the
      // app was killed mid-approval — resumes THE SAME order.
      razorpay: approvalWindowOpen
        ? readRazorpayCheckout(row.providerCheckout)
        : null,
      // Decentro's block is DERIVED from the very columns `authUrl` comes from,
      // never stored — which is what makes it impossible for adding it to have
      // moved the existing intent-link flow. `authLive`, not
      // `approvalWindowOpen`, because `intentUrl` IS `authUrl`: the two must
      // appear and disappear together or a client reading one would see a live
      // link while the other reports none.
      decentro:
        authLive && row.provider === PROVIDER.DECENTRO
          ? {
              intentUrl: row.authUrl!,
              decentroMandateId: row.providerMandateId,
              decentroTxnId: row.providerTxnId,
              referenceId: row.referenceId,
            }
          : null,
      // The window itself, not the link's — an SDK row has an expiry to render a
      // countdown against even though `authUrl` is null.
      authExpiresAt: approvalWindowOpen ? row.authExpiresAt!.toISOString() : null,
      planId: row.planId,
      amountPaise: row.amountPaise,
      currency: row.currency,
      requiresReRegistration: RE_REGISTRABLE.includes(row.state as MandateState),
      // Placeholder — the controller overwrites this wholesale from the
      // subscription facade before the view reaches the wire. The free shape is
      // the safe default: if a future path ever forgot to fill it in, the client
      // sees "not entitled" rather than a spurious grant.
      subscription: FREE_SUBSCRIPTION_VIEW,
      nextDebitDate: row.nextDebitDate
        ? row.nextDebitDate.toISOString().slice(0, 10)
        : null,
      // TAM-125: sourced from `subscriptions.startedAt` in the controller's
      // `withSubscription` merge (same round trip that populates
      // `subscription`). Null here for the same defensive reason: a caller
      // that skips the merge sees "not a member yet" rather than a spurious
      // date.
      startedAt: null,
    };
  }
}
