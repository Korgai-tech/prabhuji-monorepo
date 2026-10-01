import {
  fetchLatestUtm,
  PAYMENT_ANALYTICS_EVENT as E,
  utmProperties,
  UTM_ANALYTICS_EVENT,
  type AnalyticsEventInput,
} from "@api/shared/analytics";
import { isRecoverableByTopUp } from "@api/core/payment/failure-sub-code";
import { createModuleLogger } from "@api/shared/logs";
import { performServiceCall } from "@api/shared/workspace";
import type { MandateRow } from "@api/core/payment/repositories/mandate.repository.js";
import type { TransactionRow } from "@api/core/payment/repositories/transactions.repository.js";
import type { PaymentOutcome } from "@api/core/payment/constants";
import { isoDay } from "./payment-log.js";
import { sendPaymentAnalytics } from "./payment-analytics-sender.js";

const log = createModuleLogger("payment:analytics");

/** Paise per rupee. Money is carried in both denominations — see `moneyProps`. */
const PAISE_PER_RUPEE = 100;

/** For `days_into_trial`. */
const MILLIS_PER_DAY = 86_400_000;

interface EventContext {
  mandate: MandateRow;
  /** The ledger row, when a specific movement is in play. */
  txn?: TransactionRow | null;
  failureCode?: string | null;
  failureReason?: string | null;
  /** Clock, when the caller has one — sharpens `type` on the txn-less events. */
  now?: Date;
  /** Settled recurring debits for this mandate, counted by the caller. */
  cyclesCompleted?: number | null;
}

/**
 * Money, in both denominations, on purpose.
 *
 * `amount` is rupees because that is the unit every chart, board deck and
 * finance export speaks in. `amount_paise` is the exact integer the ledger
 * holds, and is what a reconciliation must use — 299.00 has no exact binary
 * floating-point representation, so a sum over `amount` drifts while a sum over
 * `amount_paise` cannot.
 */
export const moneyProps = (
  amountPaise: number
): { amount: number; amount_paise: number } => ({
  amount: amountPaise / PAISE_PER_RUPEE,
  amount_paise: amountPaise,
});

/**
 * The property bag EVERY backend payment/subscription event carries.
 *
 * Built in one place so the keys cannot drift between events — a funnel filters
 * one property across several `event_type`s, and a key that means something
 * different on two of them is worse than a key that is missing.
 *
 * **Null keys do not survive the wire.** ClickHouse's JSON type drops
 * null-valued keys at ingest, so `x: null` here produces a row with no `x` at
 * all — this was verified in prod, where two hardcoded nulls appeared in 0 of
 * 55 rows. The nullable entries below are therefore honest "absent when it does
 * not apply", not a promise of presence. Nothing that CANNOT be populated is
 * listed at all; see the note in `shared/analytics/events.ts`.
 */
export const standardProps = ({
  mandate,
  txn,
  failureCode,
  failureReason,
  now,
  cyclesCompleted,
}: EventContext): Record<string, unknown> => ({
  // The plan CODE ("month"), never the `paywall_plans` uuid — `mandates.plan_id`
  // is plain TEXT holding the business slug the client sent.
  plan_id: mandate.planId,
  product_id: mandate.productId,
  mandate_id: mandate.id,
  provider: mandate.provider,
  // The instrument the standing consent is held against — "upi" today, and the
  // reason this is read off the mandate rather than hardcoded is that it will
  // not always be.
  payment_method: mandate.type,
  // Trial money or subscription money. On every event now, not just the revenue
  // record: a funnel that splits trial from paid needs the same discriminator at
  // each step, and re-deriving it per event is how two steps end up disagreeing.
  type: resolveType(mandate, txn, now),
  // Lifecycle position, on EVERY event rather than the revenue row alone — a
  // funnel that reads `index` at one step and not the next cannot follow a
  // cohort through. A trial charge is always 0; a full-price position needs the
  // caller's cycle count, and is absent (not guessed) without one. The revenue
  // row overrides this with its settled-vs-failed adjustment.
  ...lifecycleIndex(resolveType(mandate, txn, now), cyclesCompleted),
  // The cycle length the standing consent was registered for. Decorative today —
  // nothing reads it to derive a period (`addMonthClamped` hardcodes a month) —
  // but it is the honest answer to "what did the user agree to".
  billing_cycle: mandate.frequency,
  // OUR ledger row: the id every internal question about this money starts
  // from. The gateway's own id is a separate field, because a dispute starts
  // from theirs and reconciliation needs both.
  payment_id: txn?.id ?? null,
  gateway_payment_id: txn?.gatewayPaymentId ?? null,
  // The movement's amount when there is one, otherwise what the subscription is
  // worth per cycle.
  ...moneyProps(txn?.amountPaise ?? mandate.amountPaise),
  currency: txn?.currency ?? mandate.currency,
  // Both null on a mandate registered without a trial. `startDate` IS the trial
  // start: the mandate is always valid from the registration day (a trial is
  // expressed on `next_billing_date`, never by pushing the start date out — see
  // docs/PAYMENT-FLOW.md), so registration is the moment free access begins.
  //
  // Full ISO-8601, matching `trial_end_date`. These two used to disagree —
  // `2026-08-14` against `2026-08-17T18:30:00.000Z` in the SAME event — which
  // made any query that touched both parse two formats.
  trial_start_date: mandate.trialEndsAt ? mandate.startDate.toISOString() : null,
  trial_end_date: mandate.trialEndsAt?.toISOString() ?? null,
  failure_code: failureCode ?? txn?.failureCode ?? null,
  failure_reason: failureReason ?? txn?.failureMessage ?? null,
  // 1-based, and derived from `retryCount` rather than `attemptNo`: a human
  // asking "which attempt was this" means presentations of this cycle, while
  // `attemptNo` counts ledger rows superseded by the recovery sweep — an
  // internal bookkeeping number that jumps for reasons no funnel cares about.
  attempt_number: txn ? txn.retryCount + 1 : null,
});

/**
 * Dedup key, deterministic and keyed on the ENTITY rather than the attempt.
 *
 * A QUERY-TIME collapse key, NOT an ingest guarantee. The warehouse table is a
 * plain MergeTree with no dedupe (`apps/events/db/schema.sql`), so duplicates
 * are STORED and every read must carry `LIMIT 1 BY insert_id`. This used to
 * claim the warehouse deduped, which is false, and that is precisely how
 * `bk_trial_success` and `bk_subscription_trial_started` came to be emitted
 * from a re-entrant path with no gate of their own (TAM-181) — the key was
 * treated as the fix. An event that can fire twice needs a SEND-TIME gate;
 * this only makes what escapes collapsible.
 *
 * Two different scopes are in use here and mixing them up is expensive in both
 * directions — see the per-event notes.
 */
export const insertId = (eventType: string, ...parts: Array<string | null>): string =>
  [eventType, ...parts].filter(Boolean).join(":");

/**
 * Has this subscription never paid full price?
 *
 * Read off the trial window rather than by counting settled debits: inside it
 * no full-price debit CAN have settled, because the first one is only due at
 * `trialEndsAt`. So the predicate that costs no query is also the correct one.
 */
const isTrial = (mandate: MandateRow, now: Date): boolean =>
  mandate.trialEndsAt !== null && now.getTime() < mandate.trialEndsAt.getTime();

/**
 * Is this movement trial money or subscription money?
 *
 * Read off the LEDGER ROW, not the clock: the registration deposit on a trial
 * mandate IS the trial charge (the ₹2 that proves the instrument), and every
 * `recurring_debit` is full price no matter when it lands. That makes the answer
 * stable — a settlement reported twice, days apart, classifies the same both
 * times, which `isTrial`'s now-relative test could not promise.
 */
const paymentType = (
  mandate: MandateRow,
  txn: TransactionRow
): "trial" | "subscription" =>
  mandate.trialEndsAt !== null && txn.kind === "initial_deposit"
    ? "trial"
    : "subscription";

/**
 * `type` for ANY event, with or without a ledger row — the three ways of
 * answering the same question, in descending order of authority.
 *
 * 1. A ledger row settles the matter: `paymentType` reads the movement's `kind`,
 *    which cannot change after the fact.
 * 2. No row but a clock: `isTrial` asks whether the trial window is still open.
 * 3. Neither (only `trackSubscriptionAbandoned`, which reports a mandate that
 *    died before approval): fall back to whether a trial was ever configured.
 *    Nothing was charged, so no movement can contradict it.
 */
const resolveType = (
  mandate: MandateRow,
  txn: TransactionRow | null | undefined,
  now: Date | undefined
): "trial" | "subscription" => {
  if (txn) return paymentType(mandate, txn);
  if (now) return isTrial(mandate, now) ? "trial" : "subscription";
  return mandate.trialEndsAt !== null ? "trial" : "subscription";
};

/**
 * Lifecycle position of a terminal payment, for the revenue row's `index`.
 *
 * A trial charge is always 0 — it is the registration deposit, and there is only
 * ever one. A full-price debit is its cycle number, which needs a count only the
 * caller can supply.
 *
 * `cyclesCompleted` is the LIVE count of settled recurring debits at the moment
 * the caller read it, and whether this row is inside that count depends on how it
 * ended: the success path settles BEFORE reporting, so the row counts itself and
 * the count already IS its position; a failed row never settles, so it is the
 * next position after everything that did.
 *
 * The discriminator is the TERMINAL STATUS the caller is reporting, NOT
 * `txn.status`. That distinction is the whole correctness of this function:
 * `TransactionsRepository.settle` returns a boolean, not the updated row, so the
 * `txn` on the caller's stack still carries its pre-settlement status
 * (`submitted`) at the moment we report a success. Reading it here would take the
 * "not yet settled" branch on every settled renewal and report every cycle one
 * too high — a silent off-by-one across the entire revenue series.
 *
 * Falls back to the old best-effort answer (1 on a first debit, otherwise
 * unknown) when the caller has no count, so an unwired path degrades to what it
 * reported before rather than lying about a position.
 */
const revenueIndex = (
  type: "trial" | "subscription",
  txn: TransactionRow,
  status: "success" | "failed",
  cyclesCompleted: number | null | undefined
): number | null => {
  if (type === "trial") return 0;
  if (typeof cyclesCompleted === "number") {
    return status === "success" ? cyclesCompleted : cyclesCompleted + 1;
  }
  return txn.isFirstDebit ? 1 : null;
};

/**
 * WHO ended the subscription — the dimension `cancellation_reason` cannot carry
 * on its own, because "the bank revoked it" and "the user tapped cancel" are the
 * same churn row until you can tell them apart.
 *
 * - `user` — a deliberate in-app cancel.
 * - `provider` — the bank or the UPI app revoked the mandate; nobody here chose it.
 * - `dunning` — retries were exhausted, so the billing cycle ended it.
 * - `system` — anything else we caused, e.g. a stale registration swept away.
 */
export type CancellationSource = "user" | "provider" | "dunning" | "system";

/**
 * Best-effort source from the reason string, for callers that do not say.
 *
 * The reasons are inline literals at four call sites rather than an enum (see
 * `docs/PAYMENT-FLOW.md`), so this maps the two that are ours and treats
 * everything else as the provider's — which is true: every other value here is
 * `mandates.state_reason`, written from the gateway's own vocabulary. Callers
 * that KNOW should pass `source` and not rely on this.
 */
const cancellationSource = (reason: string): CancellationSource => {
  if (reason === "user_cancelled") return "user";
  if (reason === "first_debit_failed") return "dunning";
  return "provider";
};

/**
 * `index` for a non-revenue event, omitted when it cannot be answered.
 *
 * A trial is unambiguously position 0 — there is exactly one trial charge. A
 * subscription's position is its cycle number, which only the caller can count;
 * without one the key is dropped rather than sent as a null the warehouse would
 * discard anyway, so "absent" reads as "this row cannot say" instead of as 0.
 */
const lifecycleIndex = (
  type: "trial" | "subscription",
  cyclesCompleted: number | null | undefined
): Record<string, number> => {
  if (type === "trial") return { index: 0 };
  return typeof cyclesCompleted === "number" ? { index: cyclesCompleted } : {};
};

/**
 * `cycles_completed`, present only when the caller actually counted.
 *
 * Spread rather than assigned so an uncounted path OMITS the key instead of
 * sending `null` — a null never reaches the warehouse anyway (ClickHouse drops
 * null JSON keys), and a key that is sometimes a number and sometimes silently
 * missing is at least honest about which rows can answer the question.
 */
const cyclesProp = (
  cyclesCompleted: number | null | undefined
): Record<string, number> =>
  typeof cyclesCompleted === "number"
    ? { cycles_completed: cyclesCompleted }
    : {};

/**
 * Whole days elapsed since the trial began, floored.
 *
 * `startDate` is the trial start (registration day) — see `standardProps`.
 * Answers whether a trial is losing people on day 0 or on the eve of the first
 * debit, which `lifetime_seconds` alone cannot: that one is measured from
 * mandate CREATION, which is a different instant on a re-registration.
 */
const daysIntoTrial = (mandate: MandateRow, now: Date): number =>
  Math.max(
    0,
    Math.floor(
      (now.getTime() - mandate.startDate.getTime()) / MILLIS_PER_DAY
    )
  );

/**
 * Publishes the payment funnel to the analytics warehouse (TAM-145).
 *
 * Shapes events and hands them to `apps/events` — the SAME Amplitude V2 door
 * the Flutter SDK posts to, so client and server events land in one table and
 * one funnel can span both.
 *
 * Two properties are load-bearing:
 *
 * 1. **It never reads the database directly.** Every event is built from rows
 *    already on the caller's stack, so publishing adds no query to the billing
 *    path — and the arch boundary that keeps `repositories/` out of `services/`
 *    holds without an exception. The two exceptions are enrichments that no
 *    caller has on its stack and that both fail soft: `trackPurchaseUtm`'s
 *    outbound campaign lookup, and `paywallIdFor`'s cross-module hop for the
 *    A/B arm.
 * 2. **It never throws.** A dead collector, a DNS failure or a 500 must leave
 *    the payment outcome byte-identical, so every send is swallowed here.
 *
 * Because nothing here can reject, callers choose how to wait, and the two
 * runtimes want opposite answers:
 *
 * - `mandate.service.ts` runs inside a REQUEST. It `void`s these — a user who
 *   just tapped Pay must not wait out an analytics timeout, and with the
 *   collector down `ANALYTICS_EVENTS_TIMEOUT_MS` would land on their spinner.
 * - `billing-cycle.service.ts` runs in a ONE-OFF TASK that exits when the sweep
 *   returns. It `await`s them — a floating promise there is an event dropped at
 *   process exit, and nobody is waiting on the tick anyway.
 */
export class PaymentAnalyticsService {
  // ------------------------------------------------------- money movements

  /**
   * A debit is recorded and about to be attempted — the ₹2 registration deposit
   * at signup, or a monthly cycle once its pre-debit notification goes out.
   *
   * The denominator for every payment success rate. Emitted before the money
   * moves, so a charge that dies in transit is still countable.
   */
  async trackPaymentInitiated(input: {
    mandate: MandateRow;
    txn: TransactionRow;
  }): Promise<void> {
    await this.safeSend({
      event_type: E.PAYMENT_INITIATED,
      user_id: input.mandate.userId,
      // One initiation per LEDGER ROW. A recurring cycle re-arms its
      // notification across ticks and would otherwise report a fresh payment
      // attempt every thirty minutes.
      insert_id: insertId(E.PAYMENT_INITIATED, input.txn.id),
      event_properties: {
        ...standardProps(input),
        payment_type: input.txn.kind,
        cycle_date: isoDay(input.txn.cycleDate),
        is_first_debit: input.txn.isFirstDebit,
      },
    });
  }

  /**
   * The money arrived — `bk_payment_settled`.
   *
   * The narrow funnel step, not the revenue row: `bk_payment_success` fires
   * beside it (below) and is what a revenue query sums. Both names moved at the
   * TAM-145 cutover, so read the registry before writing a query against either.
   */
  async trackPaymentSuccess(input: {
    mandate: MandateRow;
    txn: TransactionRow;
    /** Settled recurring debits for this mandate, for the revenue row's `index`. */
    cyclesCompleted?: number | null;
  }): Promise<void> {
    await this.safeSend(
      {
        event_type: E.PAYMENT_SETTLED,
        user_id: input.mandate.userId,
        // A ledger row settles ONCE. Both the synchronous settlement and the
        // provider callback that repeats it land on this key, so revenue is not
        // counted twice.
        insert_id: insertId(E.PAYMENT_SETTLED, input.txn.id),
        event_properties: {
          ...standardProps(input),
          payment_type: input.txn.kind,
          cycle_date: isoDay(input.txn.cycleDate),
          due_date: isoDay(input.txn.cycleDate),
          is_first_debit: input.txn.isFirstDebit,
          bank_reference_number: input.txn.bankReferenceNumber,
          npci_transaction_id: input.txn.npciTransactionId,
        },
      },
      // "Fires alongside" is literal: same batch, one POST. A settlement on the
      // billing path already awaits the collector, and a second round trip to
      // say the same thing is latency for nothing.
      this.consolidated(input.mandate, input.txn, "success", {
        cyclesCompleted: input.cyclesCompleted,
      })
    );
  }

  /**
   * The money did not arrive — `bk_trial_failed` or `bk_subscription_failed`,
   * split on the same `type` discriminator every other event now carries.
   *
   * Replaces the single `bk_payment_failed` (TAM-145 cutover). The split is not
   * cosmetic: a declined ₹2 registration deposit and a declined ₹299 renewal are
   * different funnel leaks with different fixes, and averaging them hid both.
   * Old `bk_payment_failed` rows carry `payment_type`, so history can be split
   * the same way retroactively.
   */
  /**
   * THE USER COULD FIX THIS ONE THEMSELVES — ask them to (TAM-186).
   *
   * 91% of production debit declines are "insufficient balance": the user chose
   * the product, authorised the mandate, and simply had no money in the account
   * on the day we asked. Today they discover this by quietly losing access.
   * This event is the trigger for telling them instead.
   *
   * THE API OWNS THE DECISION, NOT THE DELIVERY. Who qualifies and how often is
   * decided here, where it is unit-tested and regress-guarded; sending is
   * downstream. The alternative — letting the campaign tool decide from raw
   * failure rows — puts "only insufficient balance" and "only once per cycle"
   * into external configuration that nothing in this repo can test, and those
   * two rules are the whole safety argument for an unsolicited message.
   *
   * GATED ON THE SUB-CODE, never on `failure_code`. `failure_code` is
   * `GATEWAY_ERROR` for 91.9% of these rows and would send this to everyone
   * whose bank merely hiccuped. `isRecoverableByTopUp` is exact — `UNCLASSIFIED`
   * does not qualify — because the cost of a false positive is wrong advice to
   * a real person who has no per-notification way to opt out.
   *
   * THE TWO POPULATIONS DIFFER AND THE MESSAGE MUST TOO:
   *
   *   * `renewal` — a paying subscriber. They stay entitled until `graceUntil`,
   *     so the honest message is "top up to KEEP your access".
   *   * `first_debit` — a trial converting. There is no grace (`onDebitFailed`
   *     returns before the dunning block: "No grace, because nothing was ever
   *     paid"), so access ends at `trialEndsAt` and the message cannot promise
   *     a window that does not exist.
   *
   * Most of the 91% are first debits, so a version of this that only fired for
   * renewals would miss almost everyone it was written for.
   */
  async trackPaymentRecoveryDue(input: {
    mandate: MandateRow;
    txn: TransactionRow;
    population: "renewal" | "first_debit";
    /** When access ends. `graceUntil` for a renewal, `trialEndsAt` for a trial. */
    accessEndsAt: Date | null;
    failureSubCode: string | null;
  }): Promise<void> {
    if (!isRecoverableByTopUp(input.failureSubCode)) return;
    await this.safeSend({
      event_type: E.PAYMENT_RECOVERY_DUE,
      user_id: input.mandate.userId,
      // ONE MESSAGE PER CYCLE, however many presentations that cycle makes.
      // Keyed on (mandate, cycle date) rather than on the attempt, because the
      // attempt is per PRESENTATION — `bk_subscription_past_due` keys that way
      // and so fires several times for one cycle, which is right for a dunning
      // metric and wrong for an outbound message. A re-armed cycle carries a
      // new `cycleDate` and is deliberately a new ask: by then a day has
      // passed and the balance may genuinely have changed.
      insert_id: insertId(
        E.PAYMENT_RECOVERY_DUE,
        input.mandate.id,
        isoDay(input.txn.cycleDate)
      ),
      event_properties: {
        ...standardProps(input),
        population: input.population,
        // What the message may promise. Null on a first debit with no trial end
        // recorded — the copy must then not mention a deadline at all.
        access_ends_at: input.accessEndsAt?.toISOString() ?? null,
        plan_amount_paise: input.mandate.amountPaise,
      },
    });
  }

  async trackPaymentFailed(input: {
    mandate: MandateRow;
    txn: TransactionRow;
    failureCode?: string | null;
    failureReason?: string | null;
    outcome: PaymentOutcome;
    graceUntil?: Date | null;
    /** Settled recurring debits for this mandate, for the revenue row's `index`. */
    cyclesCompleted?: number | null;
  }): Promise<void> {
    const eventType =
      paymentType(input.mandate, input.txn) === "trial"
        ? E.TRIAL_FAILED
        : E.SUBSCRIPTION_FAILED;
    const events: AnalyticsEventInput[] = [
      {
        event_type: eventType,
        user_id: input.mandate.userId,
        // Keyed on the ATTEMPT, unlike every other event here: three retries of
        // one cycle ARE three failures, and collapsing them would flatten the
        // dunning curve this event exists to measure. Carried over verbatim from
        // `bk_payment_failed` — the rename must not change the grain.
        insert_id: insertId(
          eventType,
          input.txn.id,
          String(input.txn.retryCount)
        ),
        event_properties: {
          ...standardProps(input),
          payment_type: input.txn.kind,
          cycle_date: isoDay(input.txn.cycleDate),
          // The same date under the name the analytics contract asks for. Kept
          // beside `cycle_date` rather than replacing it: the ledger calls it a
          // cycle date and renaming it here would break the join back.
          due_date: isoDay(input.txn.cycleDate),
          is_first_debit: input.txn.isFirstDebit,
          outcome: input.outcome,
          recoverable: input.outcome === "retry_scheduled",
          grace_until: input.graceUntil?.toISOString() ?? null,
        },
      },
    ];
    // A scheduled retry has NOT reached a terminal state — the cycle is still
    // live and the dunning run may yet collect it. Counting it as revenue lost
    // would double-count the cycle when the retry settles.
    if (input.outcome !== "retry_scheduled") {
      events.push(
        this.consolidated(input.mandate, input.txn, "failed", {
          failureCode: input.failureCode,
          failureReason: input.failureReason,
          cyclesCompleted: input.cyclesCompleted,
        })
      );
    }
    await this.safeSend(...events);
  }

  /**
   * `bk_trial_failed` for a ₹2 registration deposit the gateway DECLINED while
   * the mandate is still pending (TAM-188).
   *
   * The other `bk_trial_failed` source — `trackPaymentFailed` via a mandate that
   * dies unapproved — never fires on Razorpay, which keeps an unapproved mandate
   * `pending` rather than killing it, so every declined trial deposit there
   * emitted nothing.
   *
   * NOT `trackPaymentFailed`, on purpose:
   *   - `insert_id` is per GATEWAY PAYMENT: several declined tries share one
   *     deposit row and one `retryCount`, and each is a real failure.
   *   - No consolidated revenue row: nothing is terminal — the payer may retry
   *     in the same checkout, and the mandate's eventual death (if any) is still
   *     reported by the existing path.
   *
   * The caller moves no state; this reports and nothing else.
   */
  async trackTrialDepositDeclined(input: {
    mandate: MandateRow;
    txn: TransactionRow;
    gatewayPaymentId: string;
    failureCode: string | null;
    failureReason: string | null;
  }): Promise<void> {
    await this.safeSend({
      event_type: E.TRIAL_FAILED,
      user_id: input.mandate.userId,
      insert_id: insertId(E.TRIAL_FAILED, input.txn.id, input.gatewayPaymentId),
      event_properties: {
        ...standardProps(input),
        // The declined attempt's own id — the deposit row has none, since
        // nothing settled against it.
        gateway_payment_id: input.gatewayPaymentId,
        payment_type: input.txn.kind,
        is_first_debit: input.txn.isFirstDebit,
        outcome: "declined" satisfies PaymentOutcome,
        recoverable: true,
      },
    });
  }

  /**
   * A debit failed and DUNNING BEGAN — the subscription moved to `past_due` and
   * the user stays entitled until `grace_until`.
   *
   * Fires beside `bk_subscription_failed`, never instead of it. That one is the
   * MONEY view and there is one per attempt; this is the ENTITLEMENT view and
   * there is one per entry into dunning.
   *
   * The caller must only call this when the transition actually applied — the
   * subscription port returns the changed-row count precisely so a guard-rejected
   * no-op does not mint a phantom dunning event.
   */
  async trackSubscriptionPastDue(input: {
    mandate: MandateRow;
    txn: TransactionRow;
    failureCode?: string | null;
    failureReason?: string | null;
    graceUntil: Date;
  }): Promise<void> {
    await this.safeSend({
      event_type: E.SUBSCRIPTION_PAST_DUE,
      user_id: input.mandate.userId,
      // Keyed on the ATTEMPT, like the failure beside it: each retry that keeps
      // the row in dunning is a real dunning event, and a sliding grace window
      // means the two are not interchangeable.
      insert_id: insertId(
        E.SUBSCRIPTION_PAST_DUE,
        input.txn.id,
        String(input.txn.retryCount)
      ),
      event_properties: {
        ...standardProps(input),
        due_date: isoDay(input.txn.cycleDate),
        cycle_date: isoDay(input.txn.cycleDate),
        // RETRIES so far, 0 on the first failure of a cycle — the raw count the
        // contract asks for, and one less than `attempt_number` in the standard
        // bag by definition.
        //
        // `markSubmitted` increments `retryCount` in the same call that
        // dispatches, and the row on this stack was read BEFORE that (the
        // repository documents the staleness explicitly), so this is the count
        // as it stood going into the presentation being reported. That is the
        // value both numbers below are meant to describe.
        retry_count: input.txn.retryCount,
        // Derived, not stored — there is no dunning-stage column, and inventing
        // one to hold a number the ledger already implies would be a second
        // source of truth for the same fact.
        //
        // 1-BASED, matching `attempt_number`: the first failed debit opens
        // dunning and is `reminder_1`. A 0-based stage beside a 1-based attempt
        // number on the same row is the kind of mismatch that quietly makes a
        // dunning funnel off by one step.
        dunning_stage: `reminder_${input.txn.retryCount + 1}`,
        // NOTE: this SLIDES. It is recomputed as `now + 3 days` on every failure,
        // so it is not anchored to the first one — a query for "how long was the
        // grace window" must read the first past_due event, not the last.
        grace_until: input.graceUntil.toISOString(),
        subscription_start_date: input.mandate.startDate.toISOString(),
        next_billing_date: isoDay(input.mandate.nextDebitDate),
      },
    });
  }

  /**
   * The consolidated revenue record, built inside the two terminal trackers
   * rather than by their callers.
   *
   * There are five places money settles or dies for good, and every one already
   * routes through `trackPaymentSuccess` / `trackPaymentFailed`. Hooking the
   * pair is what makes "one row per terminal payment" an invariant instead of a
   * convention a sixth call site can forget.
   */
  private consolidated(
    mandate: MandateRow,
    txn: TransactionRow,
    status: "success" | "failed",
    extra?: {
      failureCode?: string | null;
      failureReason?: string | null;
      cyclesCompleted?: number | null;
    }
  ): AnalyticsEventInput {
    const type = paymentType(mandate, txn);
    return {
      event_type: E.PAYMENT_SUCCESS,
      user_id: mandate.userId,
      // The LEDGER ROW, with no status suffix: a row reaches exactly one
      // terminal state, so one row is one revenue record however many times the
      // settlement is reported.
      insert_id: insertId(E.PAYMENT_SUCCESS, txn.id),
      event_properties: {
        ...standardProps({
          mandate,
          txn,
          failureCode: extra?.failureCode,
          failureReason: extra?.failureReason,
        }),
        type,
        // Lifecycle position. A trial charge is always 0; a full-price debit is
        // its cycle number. The count is PASSED IN by the billing cycle (which
        // already holds the repository) rather than queried here — this service
        // never reads the database, and a field that silently stops counting at
        // 1 is worse than one that is absent.
        index: revenueIndex(type, txn, status, extra?.cyclesCompleted),
        payment_status: status,
        // When it reached that terminal state. `settledAt` on a settlement;
        // otherwise the write that killed it is the last one this row saw.
        payment_date: (txn.settledAt ?? txn.updatedAt).toISOString(),
        // The registration deposit is by definition the first money this user
        // ever paid us; so is a first debit on a mandate that took no deposit.
        // Previously sent as a hardcoded `null`, which the warehouse dropped —
        // the key existed in the code and in 0 of 55 rows.
        is_first_payment:
          txn.kind === "initial_deposit" || txn.isFirstDebit === true,
        // `trigger_module` is deliberately NOT here. The paywall's trigger never
        // leaves the phone, so the api cannot populate it; emitting it as null
        // only made a key that looks queryable and never is. The client's own
        // `payment` event carries it.
      },
    };
  }

  // -------------------------------------------------- entitlement lifecycle

  /**
   * A mandate row exists and the gateway call is about to go out. The funnel's
   * DENOMINATOR — without it, a registration that fails at the gateway is
   * indistinguishable from a user who never tapped Pay.
   */
  async trackSubscriptionInitiated(input: {
    mandate: MandateRow;
    txn: TransactionRow;
    trialDays: number;
  }): Promise<void> {
    await this.safeSend({
      event_type: E.SUBSCRIPTION_INITIATED,
      user_id: input.mandate.userId,
      insert_id: insertId(E.SUBSCRIPTION_INITIATED, input.mandate.id),
      event_properties: {
        ...standardProps(input),
        // The MANDATE's amount, beside the deposit `standardProps` reports from
        // the transaction: at signup those differ (₹2 vs ₹299) and a conversion
        // rate needs to weight by what the subscription is worth, not by the
        // token that proved the instrument works.
        plan_amount_paise: input.mandate.amountPaise,
        trial_days: input.trialDays,
        is_trial: input.trialDays > 0,
      },
    });
  }

  /**
   * A TRIAL registration is about to be dispatched to the gateway. Fires beside
   * `trackSubscriptionInitiated`, never instead of it — the trial funnel's own
   * denominator, and the server-side twin of the client's
   * `trial_payment_initiated` (which is lost whenever the app dies at the UPI
   * handoff). Caller decides whether it's a trial; nothing is emitted for a
   * direct-paid registration.
   */
  async trackTrialPaymentInitiated(input: {
    mandate: MandateRow;
    txn: TransactionRow;
    trialDays: number;
  }): Promise<void> {
    await this.safeSend({
      event_type: E.TRIAL_PAYMENT_INITIATED,
      user_id: input.mandate.userId,
      // One per MANDATE, same scope as `bk_subscription_initiated`: a retried
      // registration mints a new mandate row, so a genuine second attempt is a
      // second event while a replayed request is not.
      insert_id: insertId(E.TRIAL_PAYMENT_INITIATED, input.mandate.id),
      event_properties: {
        ...standardProps(input),
        // What the subscription is worth per cycle, beside the registration
        // deposit `standardProps` reports off the transaction (₹299 vs ₹2).
        plan_amount_paise: input.mandate.amountPaise,
        trial_days: input.trialDays,
      },
    });
  }

  /**
   * The user approved in their UPI app: the mandate is live.
   *
   * Splits into two event types because they are different products to a
   * funnel — a trial start is not revenue, and counting them together makes
   * every conversion rate wrong.
   */
  async trackMandateApproved(input: {
    mandate: MandateRow;
    txn?: TransactionRow | null;
    now: Date;
    /**
     * Does this user's ledger hold exactly one settled full-price payment — the
     * one this approval just took? Ignored on the trial branch, which is not
     * revenue and so has nothing to be "first" about.
     */
    isFirstFullPricePayment: boolean;
    /**
     * Did the grant that preceded this call stamp the user's one trial?
     *
     * Gates the TRIAL branch only (TAM-181). `onStateChanged`'s `active` branch
     * is re-entrant — callback racing poll, the self-heal re-run, a second
     * trial-bearing mandate — and each re-entry used to emit another
     * `bk_subscription_trial_started`. False suppresses that branch; the
     * full-price branch below is unaffected, because it has its own,
     * independent `isFirstFullPricePayment` gate and must keep firing for a
     * direct-paid registration.
     *
     * Defaults to true so the callers that cannot re-enter (none today) and the
     * tests that predate the gate keep their behaviour.
     */
    trialFirstConsumed?: boolean;
  }): Promise<void> {
    if (isTrial(input.mandate, input.now)) {
      if (input.trialFirstConsumed === false) return;
      await this.safeSend({
        event_type: E.SUBSCRIPTION_TRIAL_STARTED,
        user_id: input.mandate.userId,
        // The USER, not the mandate (TAM-181). A trial start is a fact about a
        // person and happens once for them, ever — keyed on the mandate, a user
        // who re-registers mints a new id and reads as a second trial start.
        // Matches `bk_trial_success`, which reports the same moment's money.
        insert_id: insertId(E.SUBSCRIPTION_TRIAL_STARTED, input.mandate.userId),
        event_properties: {
          ...standardProps(input),
          // What the subscription is worth per cycle. `amount` above is the
          // registration deposit on a trial signup, which is not the same number.
          plan_amount_paise: input.mandate.amountPaise,
          next_billing_date: isoDay(input.mandate.nextDebitDate),
          subscription_start_date: input.mandate.startDate.toISOString(),
        },
      });
      return;
    }
    // Registration took full price, so this approval IS a first payment if the
    // user has never made one. The rest of the decision lives in one place.
    await this.trackSubscriptionStarted(input);
  }

  /**
   * The user paid full price for the FIRST TIME EVER.
   *
   * Deliberately not "a mandate went live at full price", which is what this
   * event used to mean and which missed the single most valuable case: a trial
   * that converts. That conversion is a settled recurring debit, not an
   * approval, so no approval-time hook could ever see it — the trial's mandate
   * went live weeks earlier, at ₹2. Reported only as `bk_subscription_renewed`,
   * a converting trial was indistinguishable from a fourth-month renewal.
   *
   * So the event is keyed on the MONEY, and there are exactly two ways for a
   * user's first full-price payment to land:
   *
   *   * `direct_payment`   — registration charged the full price and the user
   *                          approved it (`MandateService.onStateChanged`).
   *   * `trial_conversion` — a trial mandate's debit settled
   *                          (`BillingCycleService.onDebitSucceeded`).
   *
   * Both call this; neither decides the event name. `isFirstFullPricePayment`
   * is computed by the caller against the USER'S ledger, because this service
   * never reads the database — see the class dartdoc.
   *
   * Note the trial-conversion branch does NOT consult `isTrial`. A first debit
   * can settle while the trial window is technically still open (the cycle is
   * scheduled on `nextDebitDate`, which is a `@db.Date` and so can land ahead of
   * a timestamped `trialEndsAt`), and that money is full price whatever the
   * clock says. Reading the clock there would misfile a real revenue start as a
   * trial start.
   */
  async trackSubscriptionStarted(input: {
    mandate: MandateRow;
    txn?: TransactionRow | null;
    now?: Date;
    isFirstFullPricePayment: boolean;
    cyclesCompleted?: number | null;
    /**
     * When the NEXT charge is due. Required from the debit path and there is no
     * safe default: `mandate.nextDebitDate` on that stack is the cycle being
     * charged RIGHT NOW, because the row was read before
     * `setNextDebitDate` advanced it — and that write lands in the database,
     * not in this object. Reading it there would report a conversion's next
     * billing date as the day it converted. `trackSubscriptionRenewed` carries
     * the same override for the same reason.
     */
    nextBillingDate?: Date;
  }): Promise<void> {
    // Every renewal after the first reaches here. Returning early rather than
    // letting `insert_id` absorb it keeps the collector's traffic proportional
    // to the thing being measured.
    if (!input.isFirstFullPricePayment) return;
    await this.safeSend({
      event_type: E.SUBSCRIPTION_STARTED,
      user_id: input.mandate.userId,
      // The USER, not the mandate. The event claims "this user's first
      // full-price payment", a fact about a person, so the key has to be the
      // person: keyed on the mandate, someone who re-consents after an NPCI
      // revoke mints a new id and a second "first" payment reads as distinct.
      //
      // NOTE this is a query-time key, NOT an ingest guarantee. `events` is a
      // plain MergeTree with no dedupe, so duplicates are STORED and every
      // read must carry `LIMIT 1 BY insert_id`. The send-time gate below is
      // what actually keeps the count honest; this only makes the duplicates
      // that do occur (the self-heal poll re-runs approval) collapsible.
      insert_id: insertId(E.SUBSCRIPTION_STARTED, input.mandate.userId),
      event_properties: {
        ...standardProps(input),
        // What the subscription is worth per cycle. `amount` above is the
        // movement that actually settled, which on a conversion is the same
        // number and on a registration need not be.
        plan_amount_paise: input.mandate.amountPaise,
        // Full ISO from BOTH CALLERS of this event — approval and debit —
        // matching `subscription_start_date` beside it. The approval path used
        // to send a bare `YYYY-MM-DD` while the renewal sent an instant, so one
        // column held two formats and could not be compared against itself.
        //
        // Scoped to THIS event: `bk_subscription_trial_started` above still
        // sends a bare date, and warehouse history for this event spans the
        // change — rows written before this deploy are `YYYY-MM-DD`. `toDate()`
        // reads both; string equality does not.
        next_billing_date:
          (input.nextBillingDate ?? input.mandate.nextDebitDate)?.toISOString() ??
          null,
        subscription_start_date: input.mandate.startDate.toISOString(),
        // How this entitlement came to be. There is no `restore` server-side —
        // nothing here replays a store purchase — so the value space is the two
        // ways a first full-price payment lands: a trial that converted, or
        // full price taken at registration.
        activation_source:
          input.mandate.trialEndsAt !== null
            ? "trial_conversion"
            : "direct_payment",
        // Which A/B paywall arm this user belongs to, so a conversion can be
        // attributed to the screen that produced it. Resolved here rather than
        // carried on the mandate: nothing persists the paywall a purchase came
        // from, and the assignment is a pure function of the phone number.
        paywall_id: await this.paywallIdFor(input.mandate.userId),
      },
    });
    // Which campaign this revenue came from. Deliberately INSIDE this method and
    // BELOW the `isFirstFullPricePayment` return above, so the two events share
    // one gate by construction: there is no second predicate to keep in sync, and
    // a renewal cannot reach it. Both this method's callers — registration and
    // the converting debit — are covered without either knowing UTM exists.
    void this.trackPurchaseUtm("sub", input.mandate.userId, input.mandate.userId);
  }

  /**
   * The trial is LIVE: the gateway settled the registration charge, the mandate
   * is approved, and the entitlement has been granted.
   *
   * Fires beside `trackMandateApproved`'s `bk_subscription_trial_started`, and
   * differs from it in the one way that matters to finance — `txn` is the
   * settled registration deposit, so `payment_id` / `gateway_payment_id` and
   * the amount describe the money that actually moved (₹2), not the plan's
   * per-cycle price. `plan_amount_paise` still carries the latter.
   *
   * Call it only once the entitlement grant has returned; emitting it beside
   * the settlement would report a trial that a failed grant never delivered.
   * No-ops outside the trial window — a full-price registration is
   * `bk_subscription_started`.
   */
  async trackTrialSuccess(input: {
    mandate: MandateRow;
    txn?: TransactionRow | null;
    now: Date;
  }): Promise<void> {
    if (!isTrial(input.mandate, input.now)) return;
    await this.safeSend({
      event_type: E.TRIAL_SUCCESS,
      user_id: input.mandate.userId,
      // The USER, not the mandate (TAM-181). This used to key on the mandate,
      // reasoning that "a trial starts once" — true of a mandate, false of a
      // person, and the person is what the event claims. A user with two
      // trial-bearing mandates (a retry, or a re-registration after the stale
      // one was retired) minted two ids and read as two trial starts, which no
      // query-time collapse could undo. The emit is now gated once per user by
      // `trialFirstConsumed`; this key is what makes any duplicate that still
      // escapes — or that predates the gate — collapsible.
      insert_id: insertId(E.TRIAL_SUCCESS, input.mandate.userId),
      event_properties: {
        ...standardProps(input),
        plan_amount_paise: input.mandate.amountPaise,
        // When the trial converts — the date every "will they stay" question is
        // anchored on.
        next_billing_date: isoDay(input.mandate.nextDebitDate),
        subscription_start_date: input.mandate.startDate.toISOString(),
        // See `trackSubscriptionStarted` — same dimension, so the two ends of
        // the trial funnel can be split by the same arm.
        paywall_id: await this.paywallIdFor(input.mandate.userId),
      },
    });
    // Inside the trial guard above for the same reason as `sub`: no second
    // predicate, and a full-price registration cannot mint a trial UTM row.
    void this.trackPurchaseUtm("trial", input.mandate.userId, input.mandate.userId);
  }

  /**
   * The user's A/B paywall arm, or `null` when it cannot be resolved.
   *
   * Delegates to the paywall module's own assignment logic rather than
   * re-deriving it here — a second copy of the bucket map is how the reported
   * arm and the served arm drift apart. Note the value is the ASSIGNMENT: it is
   * not gated on `app_version`, which no caller of these events has (see
   * `IPaywallApi.resolvePaywallIdForUser`).
   *
   * FAILS SOFT to `null`, which the warehouse drops rather than stores — a
   * paywall-module hiccup must not cost us the revenue event itself, and an
   * absent dimension is a better outcome than a wrong one.
   */
  private async paywallIdFor(userId: string): Promise<string | null> {
    try {
      return await performServiceCall(
        "paywall",
        (api) => api.resolvePaywallIdForUser(userId),
        "payment:analytics",
        "failed to resolve paywall id"
      );
    } catch (err) {
      log.warn({ err, event: "paywall_id_unresolved", user_id: userId }, "could not resolve paywall id for analytics");
      return null;
    }
  }

  /**
   * Reports the campaign standing at a settled purchase.
   *
   * Reads the user's newest attribution touch from the platform's referral
   * service — nothing about UTM is stored in this database, so the value is
   * whatever the campaign was at THIS moment, which is precisely what
   * `trial_utm_*` and `sub_utm_*` are supposed to mean.
   *
   * `void`ed by both callers rather than awaited, because it puts an outbound
   * HTTP round trip on a path that has just settled money.
   *
   * That `void` is why the whole body is wrapped: `fetchLatestUtm` is
   * contractually non-throwing and `safeSend` swallows its own send, so today
   * nothing in here can reject — but a floating promise has no caller to catch
   * it, so "cannot reject" would be a property maintained by every future edit to
   * two other files. An unhandled rejection on a settled-payment stack is not a
   * defect worth leaving to convention.
   *
   * No touch upstream, or a touch naming no campaign, emits NOTHING. A blank
   * triple would assert "this purchase came from no campaign", which is a
   * different and unsupported claim.
   *
   * `keyPart` mirrors the companion event's own `insert_id` so the pair collapses
   * identically at query time. BOTH now key on the USER (TAM-181): each is a
   * claim about a person — their one trial, their first full-price payment —
   * and neither is a claim about a mandate, which a retry mints a second of.
   */
  private async trackPurchaseUtm(
    moment: "trial" | "sub",
    userId: string,
    keyPart: string
  ): Promise<void> {
    try {
      const utm = await fetchLatestUtm(userId);
      if (!utm) return;
      const eventType =
        moment === "trial" ? UTM_ANALYTICS_EVENT.TRIAL : UTM_ANALYTICS_EVENT.SUB;
      await this.safeSend({
        event_type: eventType,
        user_id: userId,
        insert_id: insertId(eventType, keyPart),
        event_properties: utmProperties(moment, utm),
      });
    } catch (err) {
      log.warn({ err, event: "purchase_utm_report_failed", user_id: userId, moment }, "failed to report purchase utm");
    }
  }

  /**
   * The mandate died before approval — the link expired, or the user opened
   * their UPI app and changed their mind. The single biggest funnel leak, and
   * one no client event can see.
   */
  async trackSubscriptionAbandoned(input: {
    mandate: MandateRow;
    txn?: TransactionRow | null;
    reason: string;
  }): Promise<void> {
    await this.safeSend({
      event_type: E.SUBSCRIPTION_ABANDONED,
      user_id: input.mandate.userId,
      insert_id: insertId(E.SUBSCRIPTION_ABANDONED, input.mandate.id),
      event_properties: {
        ...standardProps({ ...input, failureReason: input.reason }),
        mandate_state: input.mandate.state,
      },
    });
  }

  /**
   * A renewal settled: entitlement extended to `validity_end`.
   *
   * A RECURRING cycle only. The caller withholds this on the user's first
   * full-price payment — a trial's day-3 conversion is a lifecycle start, not a
   * renewal, and `bk_subscription_started` reports it instead (TAM-163). The
   * two are mutually exclusive; before that split, every renewal prod had ever
   * recorded was in fact a first payment.
   */
  async trackSubscriptionRenewed(input: {
    mandate: MandateRow;
    txn: TransactionRow;
    periodEnd: Date;
    /** Settled recurring debits for this mandate, counted by the caller. */
    cyclesCompleted?: number | null;
  }): Promise<void> {
    await this.safeSend({
      event_type: E.SUBSCRIPTION_RENEWED,
      user_id: input.mandate.userId,
      // The CYCLE, not the attempt — a settlement seen twice (synchronously and
      // again by callback) must not count as two renewals.
      insert_id: insertId(
        E.SUBSCRIPTION_RENEWED,
        input.mandate.id,
        isoDay(input.txn.cycleDate)
      ),
      event_properties: {
        ...standardProps(input),
        cycle_date: isoDay(input.txn.cycleDate),
        due_date: isoDay(input.txn.cycleDate),
        is_first_debit: input.txn.isFirstDebit,
        validity_end: input.periodEnd.toISOString(),
        // The same instant as `validity_end`, under the contract's name: when
        // this renewal's paid period runs out is also when the next debit is due.
        next_billing_date: input.periodEnd.toISOString(),
        // When the money for THIS cycle actually landed.
        renewal_date: (input.txn.settledAt ?? input.txn.updatedAt).toISOString(),
        subscription_start_date: input.mandate.startDate.toISOString(),
        ...cyclesProp(input.cyclesCompleted),
      },
    });
  }

  /**
   * The subscription ended — cancelled by the user, revoked at the bank, or
   * lapsed after a terminal decline.
   *
   * Split on whether full price was ever paid, because "trials that never
   * converted" and "paying customers who left" are different churn numbers and
   * averaging them is worse than having neither.
   */
  async trackSubscriptionEnded(input: {
    mandate: MandateRow;
    txn?: TransactionRow | null;
    now: Date;
    reason: string;
    /** Who ended it — see `cancellationSource`. */
    source?: CancellationSource;
    /** Settled recurring debits for this mandate, counted by the caller. */
    cyclesCompleted?: number | null;
  }): Promise<void> {
    const eventType = isTrial(input.mandate, input.now)
      ? E.SUBSCRIPTION_TRIAL_CANCELLED
      : E.SUBSCRIPTION_CANCELLED;
    await this.safeSend({
      event_type: eventType,
      user_id: input.mandate.userId,
      // The MANDATE alone — deliberately no transaction suffix. A first-debit
      // failure ends the subscription along two paths that both fire:
      // `onDebitFailed` explicitly, and `refreshFromProvider` again when it
      // confirms NPCI's revoke. A subscription ends once, so both must collapse
      // to one row; a suffix on one of them would report two churns.
      insert_id: insertId(eventType, input.mandate.id),
      event_properties: {
        ...standardProps({ ...input, failureReason: input.reason }),
        plan_amount_paise: input.mandate.amountPaise,
        // How long they lasted — the number every retention chart starts from.
        lifetime_seconds: Math.max(
          0,
          Math.floor(
            (input.now.getTime() - input.mandate.createdAt.getTime()) / 1000
          )
        ),
        cancellation_date: input.now.toISOString(),
        // The same string `failure_reason` carries, under the name that reads
        // correctly for a churn query — a user who cancels has not "failed".
        // Both are sent: the pair keeps the old dashboards working across the
        // cutover while new ones use the honest name.
        cancellation_reason: input.reason,
        cancellation_source: input.source ?? cancellationSource(input.reason),
        subscription_start_date: input.mandate.startDate.toISOString(),
        // No `access_end_date` here, deliberately. Cancelling KEEPS both
        // deadlines (`computeIsEntitled` grants `cancelled` until the later of
        // them), but they live on `subscriptions` and this service never reads
        // the database — fetching them would put a cross-module query on the
        // cancel REQUEST path to decorate an event. `bk_subscription_expired`
        // carries the authoritative value when access actually ends; until
        // then, join on `user_id`.
        ...cyclesProp(input.cyclesCompleted),
      },
    });
  }

  /**
   * The user cancelled ON PURPOSE, while still inside the trial window.
   *
   * Fires beside `trackSubscriptionEnded` (which reports the same moment as
   * `bk_subscription_trial_cancelled`), never instead of it. The two are not
   * the same number: that one also counts trials killed by a declined first
   * debit, which nobody chose. Call it from user-initiated cancellation ONLY —
   * a bank revoke reaching the same code path must not land here.
   *
   * No-ops outside the trial window, so the caller does not repeat the
   * predicate: a paid subscriber's cancel is `bk_subscription_cancelled`.
   */
  async trackTrialCancelled(input: {
    mandate: MandateRow;
    txn?: TransactionRow | null;
    now: Date;
    reason: string;
    /** Who ended it — see `cancellationSource`. */
    source?: CancellationSource;
  }): Promise<void> {
    if (!isTrial(input.mandate, input.now)) return;
    await this.safeSend({
      event_type: E.TRIAL_CANCELLED,
      user_id: input.mandate.userId,
      // The MANDATE alone, same scope as `bk_subscription_trial_cancelled` —
      // a cancel is idempotent server-side and a repeated request must not
      // report a second churn.
      insert_id: insertId(E.TRIAL_CANCELLED, input.mandate.id),
      event_properties: {
        ...standardProps({ ...input, failureReason: input.reason }),
        plan_amount_paise: input.mandate.amountPaise,
        // How far into the free period they got — the number that says whether
        // the trial is losing people on day 0 or on the eve of the first debit.
        lifetime_seconds: Math.max(
          0,
          Math.floor(
            (input.now.getTime() - input.mandate.createdAt.getTime()) / 1000
          )
        ),
        // The same span in whole days, measured from the TRIAL start rather
        // than mandate creation — the two differ on a re-registration.
        days_into_trial: daysIntoTrial(input.mandate, input.now),
        cancellation_date: input.now.toISOString(),
        cancellation_reason: input.reason,
        cancellation_source: input.source ?? cancellationSource(input.reason),
      },
    });
  }

  /**
   * Analytics is strictly best-effort. A failure is logged with the event type
   * and never propagated into the payment flow that triggered it.
   */
  private async safeSend(...events: AnalyticsEventInput[]): Promise<void> {
    await sendPaymentAnalytics(...events);
  }
}

export const paymentAnalytics = new PaymentAnalyticsService();
