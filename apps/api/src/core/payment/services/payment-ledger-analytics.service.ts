import { PAYMENT_ANALYTICS_EVENT as E, type AnalyticsEventInput } from "@api/shared/analytics";
import type { MandateRow } from "@api/core/payment/repositories/mandate.repository.js";
import type { PdnRow } from "@api/core/payment/repositories/pdn.repository.js";
import type { TransactionRow } from "@api/core/payment/repositories/transactions.repository.js";
import { insertId, moneyProps, standardProps } from "./payment-analytics.service.js";
import { createModuleLogger } from "@api/shared/logs";
import { sendPaymentAnalytics } from "./payment-analytics-sender.js";
import { isoDay } from "./payment-log.js";

const log = createModuleLogger("payment:analytics");

/**
 * How this estate learned of a ledger moment — the `source` property on every
 * `bk_*` ledger event.
 *
 * - `webhook`   a gateway callback triggered it
 * - `poll`      we asked the gateway (reconciliation sweep, client status poll)
 * - `scheduler` the billing task's own act (claim, notify, present)
 * - `inline`    a user request (registration, cancellation)
 */
export type LedgerEventSource = "webhook" | "poll" | "scheduler" | "inline";

/** `reason` on `bk_payment_scheduled` — why a debit date was written. */
export type PaymentScheduleReason =
  | "new_cycle"
  | "next_cycle"
  | "notification_delivered"
  | "provider_reported";

/** `status` on `bk_pdn_status`. */
export type PdnLedgerStatus =
  | "accepted"
  | "awaiting_sequence_id"
  | "delivered"
  | "deferred"
  | "rearmed"
  | "failed";

/** `immediate_response` on `bk_payment_attempted` — what the presentation call itself said. */
export type PresentationResponse = "succeeded" | "failed" | "pending" | "too_soon" | "error";

/** `payment_status` on `bk_payment_result`. */
export type PaymentResultStatus = "success" | "failed" | "abandoned";

/** `retry_kind` on `bk_payment_retry_scheduled`. */
export type RetryKind = "next_window" | "next_day";

/** `outcome` on `bk_webhook_received`. */
export type WebhookHandlingOutcome = "processed" | "failed";

/**
 * The rows a ledger event can be described from. Callers pass what they hold;
 * nothing here reads the database.
 *
 * A full `mandate` yields the standard payment property bag, identical to the
 * outcome events'. Some ledger moments (a PDN refreshed from a callback) hold
 * only the ledger row or the notification, and describe themselves from those.
 */
interface LedgerSubject {
  mandate?: MandateRow | null;
  txn?: TransactionRow | null;
  pdn?: PdnRow | null;
  /** The gateway, when neither the mandate nor the ledger row is in hand. */
  provider?: string | null;
  /**
   * `attempt_number` when no ledger row is in hand to derive it from — resolved
   * by the caller (see `resolveLatestAttemptNumber`). A row's own
   * `retryCount + 1` wins when both are present.
   */
  attemptNumber?: number | null;
}

type EventProperties = Record<string, unknown>;

/** What each tracker contributes on top of the shared base. */
interface LedgerEventDescription {
  /** The parts of the `insert_id` after the event name — what makes this moment unique. */
  key: Array<string | null>;
  properties: EventProperties;
  /** Backdates the event; see `publish`. */
  occurredAt?: Date;
}

/**
 * Drops null and undefined values.
 *
 * ClickHouse's JSON type discards null keys at ingest, so sending one only
 * pretends to report something (see `shared/analytics/events.ts`). New events
 * omit what they cannot populate instead.
 */
const withoutEmptyValues = (properties: EventProperties): EventProperties =>
  Object.fromEntries(
    Object.entries(properties).filter(([, value]) => value !== null && value !== undefined)
  );

/** Whose event this is. Every subject shape carries the user. */
const userIdOf = ({ mandate, txn, pdn }: LedgerSubject): string =>
  mandate?.userId ?? txn?.userId ?? pdn?.userId ?? "";

/**
 * The bag for a subject WITHOUT a mandate row: the same keys the standard bag
 * uses, read off the ledger row or the notification instead. Keys neither can
 * answer (`billing_cycle`, trial dates) are left out rather than guessed.
 */
const detachedSubjectProps = ({ txn, pdn, provider }: LedgerSubject): EventProperties => ({
  plan_id: txn?.planId,
  product_id: txn?.productId,
  mandate_id: txn?.mandateId ?? pdn?.mandateId,
  provider: txn?.provider ?? provider,
  // A recurring debit is full price whenever it lands — the same rule
  // `paymentType` applies to the outcome events.
  type: txn?.kind === "recurring_debit" ? "subscription" : undefined,
  payment_id: txn?.id,
  gateway_payment_id: txn?.gatewayPaymentId,
  ...moneyProps(txn?.amountPaise ?? pdn?.amountPaise ?? 0),
  currency: txn?.currency,
  attempt_number: txn ? txn.retryCount + 1 : undefined,
});

/** The base every ledger event carries: who, what money, which cycle, and how we learned of it. */
const ledgerBaseProps = (subject: LedgerSubject, source: LedgerEventSource): EventProperties => ({
  ...(subject.mandate
    ? standardProps({ mandate: subject.mandate, txn: subject.txn })
    : detachedSubjectProps(subject)),
  ...(subject.txn ? {} : { attempt_number: subject.attemptNumber }),
  cycle_date: isoDay(subject.txn?.cycleDate ?? subject.pdn?.cycleDate ?? null),
  pdn_id: subject.txn?.pdnId ?? subject.pdn?.id,
  source,
});

/**
 * Publishes the debit-attempt LEDGER (TAM-187): one `bk_*` event on every edge
 * of the recurring-debit lifecycle, beside — never instead of — the outcome
 * events `PaymentAnalyticsService` owns.
 *
 * Single responsibility: map a lifecycle moment to its event name, `insert_id`
 * and property bag. It decides nothing about billing, reads no rows and never
 * throws — every send goes through `sendPaymentAnalytics`, the shared
 * best-effort boundary. Callers on a request path `void` these; the billing
 * task `await`s them so a one-off process does not exit with a send in flight
 * (the same split `PaymentAnalyticsService` documents).
 */
export class PaymentLedgerAnalyticsService {
  /** `bk_mandate_created` — registration reached the gateway and the mandate awaits approval. */
  async trackMandateCreated(input: { mandate: MandateRow }): Promise<void> {
    // Always the first attempt: a retried registration mints a NEW mandate, so
    // no mandate is ever created twice.
    await this.publish(E.MANDATE_CREATED, { ...input, attemptNumber: 1 }, "inline", () => ({
      key: [input.mandate.id],
      properties: { status: input.mandate.state },
    }));
  }

  /** `bk_mandate_status` — the mandate's state actually changed. Callers must not report a no-op. */
  async trackMandateStatusChanged(input: {
    mandate: MandateRow;
    previousStatus: string;
    source: LedgerEventSource;
    changedAt: Date;
    /** The mandate's latest cycle attempt — see `resolveLatestAttemptNumber`. */
    attemptNumber?: number | null;
  }): Promise<void> {
    const { mandate, previousStatus, changedAt } = input;
    await this.publish(E.MANDATE_STATUS, input, input.source, () => ({
      key: [mandate.id, previousStatus, mandate.state, changedAt.toISOString()],
      properties: {
        previous_status: previousStatus,
        status: mandate.state,
        status_reason: mandate.stateReason,
      },
    }));
  }

  /** `bk_payment_scheduled` — a debit date was written or moved. */
  async trackPaymentScheduled(
    input: LedgerSubject & {
      reason: PaymentScheduleReason;
      scheduledFor: Date;
      previousScheduledFor?: Date | null;
      source: LedgerEventSource;
    }
  ): Promise<void> {
    await this.publish(E.PAYMENT_SCHEDULED, input, input.source, () => ({
      key: [
        input.txn?.id ?? input.pdn?.id ?? input.mandate?.id ?? null,
        input.reason,
        input.scheduledFor.toISOString(),
      ],
      properties: {
        reason: input.reason,
        scheduled_for: input.scheduledFor.toISOString(),
        previous_scheduled_for: input.previousScheduledFor?.toISOString(),
      },
    }));
  }

  /** `bk_pdn_sent` — the gateway answered a pre-debit notification send. */
  async trackPdnSent(input: {
    mandate: MandateRow;
    txn: TransactionRow;
    pdn: PdnRow;
    notificationRef: string;
    providerStatus: string;
    hasSequenceId: boolean;
    /** When the send happened — reported after the ledger write, so the event is backdated to it. */
    occurredAt: Date;
  }): Promise<void> {
    await this.publish(E.PDN_SENT, input, "scheduler", () => ({
      key: [input.notificationRef],
      occurredAt: input.occurredAt,
      properties: {
        notification_ref: input.notificationRef,
        provider_status: input.providerStatus,
        has_sequence_id: input.hasSequenceId,
        pdn_attempt: input.pdn.attempts + 1,
      },
    }));
  }

  /** `bk_pdn_status` — what became of a notification. */
  async trackPdnStatus(
    input: LedgerSubject & {
      pdn: PdnRow;
      status: PdnLedgerStatus;
      source: LedgerEventSource;
      failureReason?: string | null;
    }
  ): Promise<void> {
    await this.publish(E.PDN_STATUS, input, input.source, () => ({
      key: [input.pdn.id, input.status, input.pdn.referenceId],
      properties: {
        status: input.status,
        notification_ref: input.pdn.referenceId,
        pdn_attempt: input.pdn.attempts + 1,
        failure_reason: input.failureReason,
      },
    }));
  }

  /** `bk_payment_attempted` — a debit was presented to the gateway. */
  async trackPaymentAttempted(input: {
    mandate: MandateRow;
    txn: TransactionRow;
    presentationRef: string;
    immediateResponse: PresentationResponse;
    /** When the presentation happened — reported after settlement, so the event is backdated to it. */
    occurredAt: Date;
  }): Promise<void> {
    await this.publish(E.PAYMENT_ATTEMPTED, input, "scheduler", () => ({
      key: [input.txn.id, input.presentationRef],
      occurredAt: input.occurredAt,
      properties: {
        presentation_ref: input.presentationRef,
        immediate_response: input.immediateResponse,
      },
    }));
  }

  /** `bk_payment_result` — a recurring debit reached a terminal answer. */
  async trackPaymentResult(input: {
    mandate?: MandateRow | null;
    txn: TransactionRow;
    status: PaymentResultStatus;
    source: LedgerEventSource;
    failureCode?: string | null;
    failureReason?: string | null;
  }): Promise<void> {
    await this.publish(E.PAYMENT_RESULT, input, input.source, () => ({
      key: [input.txn.id, String(input.txn.retryCount)],
      properties: {
        payment_status: input.status,
        failure_code: input.failureCode,
        failure_reason: input.failureReason,
      },
    }));
  }

  /** `bk_payment_deferred` — the gateway refused a presentation as too early; the row waits for the next window. */
  async trackPaymentDeferred(input: {
    mandate: MandateRow;
    txn: TransactionRow;
    reason: string;
  }): Promise<void> {
    await this.publish(E.PAYMENT_DEFERRED, input, "scheduler", () => ({
      key: [input.txn.id, String(input.txn.retryCount)],
      properties: { deferral_reason: input.reason },
    }));
  }

  /** `bk_payment_retry_scheduled` — a failed debit has another attempt coming. */
  async trackPaymentRetryScheduled(input: {
    mandate: MandateRow;
    txn: TransactionRow;
    retryKind: RetryKind;
    nextRetryAt?: Date | null;
  }): Promise<void> {
    await this.publish(E.PAYMENT_RETRY_SCHEDULED, input, "scheduler", () => ({
      key: [input.txn.id, String(input.txn.retryCount)],
      properties: {
        retry_kind: input.retryKind,
        next_retry_at: input.nextRetryAt?.toISOString(),
      },
    }));
  }

  /** `bk_webhook_received` — a callback that resolved to one of our mandates was handled. */
  async trackWebhookReceived(input: {
    mandate: MandateRow;
    webhookEventId: string;
    callbackKind: string;
    outcome: WebhookHandlingOutcome;
    processingMs: number;
    pdnId?: string | null;
    /** The mandate's latest cycle attempt — see `resolveLatestAttemptNumber`. */
    attemptNumber?: number | null;
  }): Promise<void> {
    await this.publish(E.WEBHOOK_RECEIVED, input, "webhook", () => ({
      key: [input.webhookEventId],
      properties: {
        webhook_event_id: input.webhookEventId,
        callback_kind: input.callbackKind,
        outcome: input.outcome,
        processing_ms: input.processingMs,
        pdn_id: input.pdnId,
      },
    }));
  }

  /**
   * Builds one event from the shared base plus what `describe` returns, and sends it.
   *
   * THE exception boundary for this class. `describe` is a thunk precisely so
   * that EVERYTHING that can throw — formatting a date (`toISOString` throws on
   * an invalid `Date`), reading the caller's rows — runs inside the `try`. A
   * throw that escaped would land in the billing path of an awaiting caller,
   * and would reject a `void`ed call with nothing to catch it, which Node treats
   * as fatal. `sendPaymentAnalytics` guards only the network send.
   *
   * `occurredAt` backdates an event its caller reports AFTER later writes — the
   * rule is "persist first, then report", and without the real instant a trail
   * ordered by time would show a presentation after its own result.
   */
  private async publish(
    eventType: string,
    subject: LedgerSubject,
    source: LedgerEventSource,
    describe: () => LedgerEventDescription
  ): Promise<void> {
    let event: AnalyticsEventInput;
    try {
      const { key, properties, occurredAt } = describe();
      event = {
        event_type: eventType,
        user_id: userIdOf(subject),
        ...(occurredAt ? { time: occurredAt.getTime() } : {}),
        insert_id: insertId(eventType, ...key),
        event_properties: withoutEmptyValues({
          ...ledgerBaseProps(subject, source),
          ...properties,
        }),
      };
    } catch (err) {
      log.warn(
        { err, event: "payment_ledger_event_build_failed", event_type: eventType },
        "payment ledger analytics event could not be built — skipped, billing unaffected"
      );
      return;
    }
    await sendPaymentAnalytics(event);
  }
}

export const paymentLedgerAnalytics = new PaymentLedgerAnalyticsService();
