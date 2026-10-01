import { createHash } from "node:crypto";
import { paymentTrace, PAYMENT_STAGE, safeFailureMessage } from "./payment-log.js";
import { createModuleLogger } from "@api/shared/logs";
import { isPaymentProviderName, type PaymentProviderName } from "@api/shared/config";
import type {
  ClaimFence,
  WebhookEventRepository,
  WebhookEventRow,
} from "@api/core/payment/repositories/webhook-event.repository.js";
import type { MandateRepository } from "@api/core/payment/repositories/mandate.repository.js";
import type { TransactionsRepository } from "@api/core/payment/repositories/transactions.repository.js";
import type { MandateRow } from "@api/core/payment/repositories/mandate.repository.js";
import { CALLBACK_KIND, type CallbackKind } from "@api/core/payment/constants.js";
import { DECENTRO_CALLBACK_FIELDS } from "@api/core/payment/repositories/decentro.constants.js";
import type { BillingCycleService } from "./billing-cycle.service.js";
import type { MandateService } from "./mandate.service.js";
import type { PdnService } from "./pdn.service.js";
import type { CallbackRef } from "@api/core/payment/types";
import {
  paymentLedgerAnalytics,
  type WebhookHandlingOutcome,
} from "./payment-ledger-analytics.service.js";
import { resolveLatestAttemptNumber } from "./ledger-attempt-number.js";

const log = createModuleLogger("payment:callback");

export type CallbackResult =
  | "processed"
  | "duplicate"
  | "unknown_reference"
  | "failed";

/** What `process` can conclude. `duplicate` is decided by `record`, never here. */
export type ProcessResult = Exclude<CallbackResult, "duplicate">;

/** A classified, authenticated callback as the controller hands it over. */
export interface CallbackInput {
  provider: PaymentProviderName;
  kind: CallbackKind;
  // Pre-extracted by the active gateway (its `extractRef`) — this service is
  // provider-agnostic and never parses provider-specific body fields itself.
  ref: CallbackRef;
  body: Record<string, unknown>;
  sourceIp: string | null;
}

/**
 * Everything `process` needs, and nothing it doesn't: the `webhook_events` row
 * as the durable inbox item (TAM-260).
 *
 * Deliberately NOT the body. Processing a callback never reads the body — it
 * routes on the extracted fields and re-reads the provider — so the stored,
 * redacted payload is not an input to it, and a deferred worker can run from
 * the row alone. Every field is a column except `callbackTxnId`, which is
 * recoverable from `dedupe_key` (see `storedCallbackFromRow`).
 */
export interface StoredCallback {
  /** `webhook_events.id`. */
  id: string;
  provider: PaymentProviderName;
  kind: CallbackKind;
  dedupeKey: string;
  referenceId: string | null;
  providerMandateId: string | null;
  presentationSequenceId: string | null;
  callbackTxnId: string | null;
  callbackAttempt: number | null;
  /** `webhook_events.notification_delivered_at` (D1). */
  notificationDeliveredAt: Date | null;
  /**
   * The worker claim this processing runs under: `webhook_events.attempts` as
   * the claim returned it. `null` for an INLINE event (`record`), which holds
   * no claim; its terminal marks are the unconditional writes they always
   * were. A number fences every terminal mark to that claim (TAM-260 B2).
   */
  claimAttempt: number | null;
}

export type RecordOutcome =
  | { kind: "accepted"; event: StoredCallback }
  | { kind: "duplicate" };

/**
 * Provider callback ingestion.
 *
 * THE central security property of this module: **a callback is a trigger, not
 * a fact.**
 *
 * Decentro's India v3 callbacks carry no HMAC signature, so the body is
 * attacker-forgeable by anyone who learns the URL and the static header token
 * (which is replayable and, unlike a signature, does not bind to the payload).
 * So this service reads exactly three routing fields out of the body —
 * reference id, mandate id, callback txn id — and then discards the rest of it
 * as evidence. The actual state comes from `MandateService.refreshFromProvider`,
 * which asks the provider's own status API.
 *
 * The practical consequence: a forged `{"mandate_status":"Active"}` POST grants
 * nothing at all. The worst it achieves is causing us to make one status call
 * we would have made anyway. The same holds for a forged
 * `{"transaction_status":"SUCCESS"}`: a presentation callback only decides
 * WHICH debit to ask the provider about, never what happened to it.
 */
export class CallbackService {
  constructor(
    private readonly events: WebhookEventRepository,
    private readonly mandates: MandateRepository,
    private readonly transactions: TransactionsRepository,
    private readonly mandateService: MandateService,
    private readonly billing: BillingCycleService,
    private readonly pdnService: PdnService
  ) {}

  /**
   * Persist a callback we cannot route, so the evidence survives the ack.
   *
   * A webhook is the ONE input this system cannot ask for again: the endpoint
   * answers 200 to stop the provider retrying, and an acked callback is never
   * redelivered. So a body we drop is gone — there is no second copy anywhere.
   *
   * The unroutable case is exactly where that matters most. It means a gateway
   * is delivering live payment events addressed to a name this build does not
   * have — a stale webhook URL, or a gateway removed from the registry while it
   * still had live mandates — and the ONLY way to reconstruct what was lost, or
   * replay it afterwards, is a stored copy of the body.
   *
   * Recorded under `kind: "unroutable"` so these never look like real traffic in
   * a `webhook_events` query, and deduped on a hash of the body so a provider
   * retrying before we notice does not write thousands of rows.
   */
  async recordUnroutable(input: {
    provider: string;
    body: Record<string, unknown>;
    sourceIp: string | null;
  }): Promise<void> {
    try {
      await this.events.ingest({
        provider: input.provider,
        kind: "unroutable",
        eventType: str(input.body.event),
        dedupeKey: `unroutable:${input.provider}:${createHash("sha256")
          .update(JSON.stringify(input.body))
          .digest("hex")
          .slice(0, 32)}`,
        referenceId: null,
        providerMandateId: null,
        presentationSequenceId: null,
        callbackAttempt: null,
        payload: redact(input.body),
        sourceIp: input.sourceIp,
      });
    } catch (err) {
      // Best-effort and swallowed: the endpoint must still answer 200. A
      // throw here would become a 5xx, which makes the provider retry an event
      // we cannot route anyway — and on a burst that is an amplification loop.
      log.error(
        {
          ...paymentTrace({ stage: PAYMENT_STAGE.callback, provider: input.provider }),
          err,
          event: "callback_unroutable_persist_failed",
        },
        "could not persist an unroutable callback"
      );
    }
  }

  /**
   * Inline mode: record, then process, in the request — exactly what this
   * method has always done, now as the composition of its two halves (TAM-260).
   */
  async ingest(input: CallbackInput & { now: Date }): Promise<CallbackResult> {
    const recorded = await this.record(input);
    if (recorded.kind === "duplicate") return "duplicate";
    return this.process(recorded.event, input.now);
  }

  /**
   * The durable half: INSERT the callback into `webhook_events`, or recognise
   * it as a redelivery. Nothing is resolved and no provider is called here.
   *
   * A throw (DB down) propagates, as it always has: nothing was recorded, so
   * the caller must NOT ack — a 5xx makes the provider retry.
   */
  async record(input: CallbackInput): Promise<RecordOutcome> {
    const { ref } = input;
    const dedupeKey = buildDedupeKey(input.kind, ref, input.body);

    const outcome = await this.events.ingest({
      provider: input.provider,
      kind: input.kind,
      // Decentro sends no event label of its own; a gateway that does needs no
      // change here beyond populating it.
      eventType: null,
      dedupeKey,
      referenceId: ref.referenceId,
      providerMandateId: ref.providerMandateId,
      presentationSequenceId: ref.presentationSequenceId,
      callbackAttempt: ref.callbackAttempt,
      payload: redact(input.body),
      sourceIp: input.sourceIp,
      // Persisted so a deferred worker, which rebuilds the callback from the
      // row alone, still pushes `scheduled_debit_at` out on a PDN. An Invalid
      // Date is stored as NULL rather than failing the INSERT (a 5xx would make
      // the provider retry); the in-memory value is untouched, so inline
      // processing sees exactly what it always did.
      notificationDeliveredAt: persistableDate(ref.notificationDeliveredAt),
    });

    if (outcome.kind === "duplicate") {
      // Normal: the provider retries until it sees a 200, and re-delivers the
      // same event with an incrementing `callback_attempt`.
      log.info(
        {
          ...paymentTrace({
            stage: PAYMENT_STAGE.callback,
            provider: input.provider,
            referenceId: ref.referenceId,
          }),
          event: "callback_duplicate",
          kind: input.kind,
          dedupe_key: dedupeKey,
          presentation_sequence_id: ref.presentationSequenceId ?? null,
          callback_attempt: ref.callbackAttempt ?? null,
        },
        "duplicate callback ignored"
      );
      return { kind: "duplicate" };
    }

    return {
      kind: "accepted",
      event: {
        id: outcome.row.id,
        provider: input.provider,
        kind: input.kind,
        dedupeKey,
        referenceId: ref.referenceId,
        providerMandateId: ref.providerMandateId,
        presentationSequenceId: ref.presentationSequenceId,
        callbackTxnId: ref.callbackTxnId,
        callbackAttempt: ref.callbackAttempt,
        notificationDeliveredAt: ref.notificationDeliveredAt,
        // Inline: no claim, so no fence.
        claimAttempt: null,
      },
    };
  }

  /**
   * The work half: resolve the mandate, re-read the provider, settle or dun,
   * and stamp the row terminal. Today's post-dedupe body, MOVED, not rewritten
   * (TAM-260 #PATH_DECISION) — every money rule keeps its single
   * implementation.
   *
   * Runs from the stored row alone, so a deferred worker can call it later with
   * `storedCallbackFromRow(row)`. `now` is the processing instant, exactly as
   * `ingest` passed it before the split.
   *
   * Never throws for a processing failure: that is recorded `failed` and
   * returned, as before. It can still throw if marking the row itself fails,
   * which is also unchanged.
   *
   * Terminal marks go through `stamp`: an inline event (`claimAttempt` null)
   * makes exactly the calls it always made; a worker event fences them to its
   * claim and, if the claim went stale, logs `callback_stale_claim` and
   * otherwise carries on as before (same logs, analytics and result).
   */
  async process(event: StoredCallback, now: Date): Promise<ProcessResult> {
    const ref = refOf(event);

    // KIND-AWARE resolution, and this is the subtle part.
    //
    // A PDN callback carries the NOTIFICATION's `reference_id`, not the mandate's.
    // Resolution used to be a single `resolveMandate(ref)` for every kind, so a PDN
    // callback looked the mandate up by a reference no mandate has, missed, and was
    // recorded `ignored_unknown` — every single time. It failed SILENTLY and looked
    // exactly like the provider not sending the callback at all.
    const pdn =
      event.kind === CALLBACK_KIND.PDN
        ? await this.pdnService.findForCallback(ref)
        : null;
    const row = pdn
      ? await this.mandates.findById(pdn.mandateId)
      : await this.resolveMandate(ref);

    if (!row) {
      // Kept rather than dropped: a burst of these is the signature of a
      // mis-whitelisted callback URL or a reference-id mismatch, and that is
      // only diagnosable after the fact if the rows exist.
      await this.stamp(event, "ignored_unknown", (...fence) =>
        this.events.markIgnoredUnknown(event.id, now, ...fence)
      );
      log.warn(
        {
          ...paymentTrace({
            stage: PAYMENT_STAGE.callback,
            provider: event.provider,
            referenceId: ref.referenceId,
          }),
          event: "callback_unknown_reference",
          kind: event.kind,
          provider_mandate_id: ref.providerMandateId,
          presentation_sequence_id: ref.presentationSequenceId,
          callback_txn_id: ref.callbackTxnId,
        },
        "callback did not resolve to a known mandate"
      );
      return "unknown_reference";
    }

    // The resolved mandate must belong to the gateway that sent this callback.
    // Resolution is by OUR reference or the provider's mandate id, neither of
    // which is namespaced by gateway, so with two gateways live a body that
    // happens to carry a colliding id could otherwise steer another gateway's
    // subscriber. Ignored rather than acted on: everything downstream re-reads
    // the provider's status API, and doing that against the WRONG provider is
    // how an active mandate reads back as unknown and gets written down.
    if (row.provider !== event.provider) {
      await this.stamp(event, "ignored_unknown", (...fence) =>
        this.events.markIgnoredUnknown(event.id, now, ...fence)
      );
      log.error(
        {
          ...paymentTrace({
            stage: PAYMENT_STAGE.callback,
            mandate: row,
            provider: event.provider,
            referenceId: ref.referenceId,
          }),
          event: "callback_provider_mismatch",
          kind: event.kind,
          callback_provider: event.provider,
          mandate_provider: row.provider,
        },
        "callback resolved to a mandate belonging to a different gateway — ignored"
      );
      return "unknown_reference";
    }

    // `void` at both call sites below: this is a REQUEST path, and the gateway
    // must not wait on the collector for its 200.
    const processingStartedAt = Date.now();
    const reportHandled = async (handling: WebhookHandlingOutcome): Promise<void> => {
      // Measured BEFORE the attempt lookup, which is analytics' own cost.
      const processingMs = Date.now() - processingStartedAt;
      const attemptNumber = await resolveLatestAttemptNumber(this.transactions, row.id);
      await paymentLedgerAnalytics.trackWebhookReceived({
        mandate: row,
        webhookEventId: event.id,
        callbackKind: event.kind,
        outcome: handling,
        processingMs,
        pdnId: pdn?.id ?? null,
        attemptNumber,
      });
    };
    try {
      // The whole point: go ask the provider what is true. The body's claims
      // never reach a subscription write — including, for a PDN callback, the
      // sequence id itself, which is written from the status READ that
      // `refreshFromProvider` performs and never from the body.
      if (pdn) {
        // BEFORE the status read, so the refresh sees the corrected instant and
        // a gateway that reports its own can still overwrite it afterwards —
        // the vendor's fact outranks our arithmetic, whichever order they
        // arrive in.
        //
        // Provider-agnostic: this service does not know which gateways confirm
        // delivery. It acts on a field the gateway's own `extractRef` either
        // populated or left null, and `recordNotificationDelivered` is a no-op
        // for a gateway that declares no turnaround.
        if (ref.notificationDeliveredAt) {
          await this.pdnService.recordNotificationDelivered(
            pdn,
            row.provider,
            ref.notificationDeliveredAt
          );
        }
        await this.pdnService.refreshFromProvider(pdn, now, "webhook");
      } else if (event.kind === CALLBACK_KIND.PRESENTATION) {
        await this.resolvePresentation(row, now);
      } else {
        await this.mandateService.refreshFromProvider(row, now, "webhook");
      }
      await this.stamp(event, "processed", (...fence) =>
        this.events.markProcessed(
          event.id,
          now,
          { mandateId: row.id, pdnId: pdn?.id ?? null },
          ...fence
        )
      );
      // The callback stage's own terminal line. What the callback CHANGED is
      // logged downstream (`mandate_state_changed`, `debit_succeeded`,
      // `pdn_accepted`…), but a callback that changed nothing — a re-delivery
      // after the sweep already settled the debit — left no trace at all, and
      // "did the webhook reach us and get handled" is the first question a
      // gateway ticket asks.
      log.info(
        {
          ...paymentTrace({
            stage: PAYMENT_STAGE.callback,
            mandate: row,
            provider: event.provider,
            referenceId: ref.referenceId,
            pdnId: pdn?.id ?? null,
          }),
          event: "callback_processed",
          kind: event.kind,
          webhook_event_id: event.id,
          callback_attempt: ref.callbackAttempt ?? null,
        },
        "callback processed — state re-read from the provider"
      );
      void reportHandled("processed");
      return "processed";
    } catch (err) {
      // Recorded as failed and swallowed — the handler still returns 200. A
      // 5xx would make the provider retry an event we have already stored, and
      // the reconciliation sweep will pick this mandate up anyway.
      const message = err instanceof Error ? err.message : "unknown";
      await this.stamp(event, "failed", (...fence) =>
        this.events.markFailed(event.id, message, now, ...fence)
      );
      log.error(
        // `reason` is not decoration: without it this line said only "something
        // failed" and the actual cause — a CHECK-constraint rejection that
        // stalled every Razorpay activation — was reachable only by reading
        // `webhook_events.error_message` out of the database by hand.
        {
          ...paymentTrace({
            stage: PAYMENT_STAGE.callback,
            mandate: row,
            provider: event.provider,
            referenceId: ref.referenceId,
            pdnId: pdn?.id ?? null,
          }),
          event: "callback_processing_failed",
          kind: event.kind,
          webhook_event_id: event.id,
          reason: safeFailureMessage(err),
        },
        "callback processing failed — will be reconciled by the billing cycle"
      );
      void reportHandled("failed");
      return "failed";
    }
  }

  /**
   * One terminal mark. `mark` receives either NO fence argument at all (an
   * inline event: the call is argument-for-argument what it was before
   * TAM-260) or the event's claim fence (a worker event).
   *
   * A fenced mark that wrote nothing means this claim went stale: its lease
   * expired and another claim now owns the row (or already stamped it). That
   * owner's outcome stands; this one is logged and dropped. Never throws for
   * it, so the caller's logs, analytics and result are unchanged.
   */
  private async stamp(
    event: StoredCallback,
    status: "processed" | "ignored_unknown" | "failed",
    mark: (...fence: [] | [ClaimFence]) => Promise<boolean>
  ): Promise<void> {
    if (event.claimAttempt === null) {
      await mark();
      return;
    }
    const owned = await mark({ attempt: event.claimAttempt });
    if (owned) return;
    log.warn(
      {
        ...paymentTrace({
          stage: PAYMENT_STAGE.callback,
          provider: event.provider,
          referenceId: event.referenceId,
        }),
        event: "callback_stale_claim",
        kind: event.kind,
        webhook_event_id: event.id,
        attempt: event.claimAttempt,
        intended_status: status,
      },
      "callback claim went stale before its terminal write — another claim owns the row; this outcome is not recorded"
    );
  }

  /**
   * A debit settled (or didn't). Resolve the attempt this callback is about.
   *
   * The callback is STILL only a trigger: `resolvePayment` reads the outcome
   * from the provider's own API and routes it through the same
   * `onDebitSucceeded` / `onDebitFailed` handlers the scheduler uses. Nothing
   * in the body is read beyond the routing fields already extracted.
   *
   * Falls back to a mandate refresh when there is no attempt to resolve —
   * which is the normal shape of a re-delivery arriving after the straggler
   * sweep already settled the debit.
   */
  private async resolvePresentation(row: MandateRow, now: Date): Promise<void> {
    const attempt = await this.transactions.findLatestSubmittedForMandate(row.id);
    if (attempt && (await this.billing.resolvePayment(attempt, now, "webhook"))) return;

    log.info(
      {
        ...paymentTrace({
          stage: PAYMENT_STAGE.callback,
          mandate: row,
          transactionId: attempt?.id ?? null,
        }),
        event: "presentation_callback_unresolved",
        attempt_id: attempt?.id ?? null,
      },
      "presentation callback did not settle an attempt — refreshing mandate state"
    );
    await this.mandateService.refreshFromProvider(row, now, "webhook");
  }

  private async resolveMandate(ref: CallbackRef) {
    if (ref.referenceId) {
      const byRef = await this.mandates.findByReferenceId(ref.referenceId);
      if (byRef) return byRef;
    }
    if (ref.providerMandateId) {
      return this.mandates.findByProviderMandateId(ref.providerMandateId);
    }
    return null;
  }
}

/** The `CallbackRef` `process` routes on, rebuilt from the stored callback. */
function refOf(event: StoredCallback): CallbackRef {
  return {
    kind: event.kind,
    referenceId: event.referenceId,
    providerMandateId: event.providerMandateId,
    presentationSequenceId: event.presentationSequenceId,
    callbackTxnId: event.callbackTxnId,
    callbackAttempt: event.callbackAttempt,
    notificationDeliveredAt: event.notificationDeliveredAt,
  };
}

const CALLBACK_KINDS: readonly string[] = Object.values(CALLBACK_KIND);

function isCallbackKind(value: string): value is CallbackKind {
  return CALLBACK_KINDS.includes(value);
}

/** The hashed fallback `buildDedupeKey` writes after `<kind>:` when there is no txn id. */
const HASHED_DEDUPE_SUFFIX = /^sha256:[0-9a-f]{64}$/;

/**
 * Recover `CallbackRef.callbackTxnId` from a stored `dedupe_key`, which is
 * `<kind>:<callbackTxnId>` whenever the gateway supplied one and
 * `<kind>:sha256:<64 hex>` when it did not (`buildDedupeKey`). Exact for every
 * gateway's id shape; the only value it cannot tell apart is a txn id that is
 * itself literally `sha256:` + 64 hex chars, read back as null.
 *
 * Only ever used for the `callback_txn_id` field of `callback_unknown_reference`
 * — nothing routes on it — which is why it is derived rather than persisted.
 */
export function callbackTxnIdFromDedupeKey(
  kind: string,
  dedupeKey: string
): string | null {
  const prefix = `${kind}:`;
  if (!dedupeKey.startsWith(prefix)) return null;
  const rest = dedupeKey.slice(prefix.length);
  return HASHED_DEDUPE_SUFFIX.test(rest) ? null : str(rest);
}

/**
 * Rebuild the input to `CallbackService.process` from a `webhook_events` row
 * alone — the deferred worker's entry point (TAM-260).
 *
 * `null` for a row this build cannot process: an `unroutable` row, or a
 * provider/kind no longer in the registry. The caller decides what to do with
 * it; this never guesses.
 *
 * `notificationDeliveredAt` is required in the input type on purpose: the
 * repository's row projection must select the column before a worker can use
 * this, and a missing projection is then a compile error rather than a
 * silently-null delivery instant. `attempts` likewise: it becomes the
 * `claimAttempt` fence, so it must be the value the claim RETURNED.
 */
export function storedCallbackFromRow(
  row: Pick<
    WebhookEventRow,
    | "id"
    | "provider"
    | "kind"
    | "dedupeKey"
    | "referenceId"
    | "providerMandateId"
    | "presentationSequenceId"
    | "callbackAttempt"
  > & { notificationDeliveredAt: Date | null; attempts: number }
): StoredCallback | null {
  if (!isPaymentProviderName(row.provider) || !isCallbackKind(row.kind)) {
    return null;
  }
  return {
    id: row.id,
    provider: row.provider,
    kind: row.kind,
    dedupeKey: row.dedupeKey,
    referenceId: row.referenceId,
    providerMandateId: row.providerMandateId,
    presentationSequenceId: row.presentationSequenceId,
    callbackTxnId: callbackTxnIdFromDedupeKey(row.kind, row.dedupeKey),
    callbackAttempt: row.callbackAttempt,
    notificationDeliveredAt: row.notificationDeliveredAt,
    // The claim that returned this row: fences its terminal marks.
    claimAttempt: row.attempts,
  };
}

/**
 * Decentro's callback-body extractor — the Decentro gateway's `extractRef`.
 *
 * Pulls the routing fields (never the state) out of an untrusted body. Kept
 * here (rather than in the gateway file) so the existing dedupe/extract unit
 * tests keep importing it from one place; the Cashfree gateway defines its own.
 */
export function extractRef(
  kind: CallbackKind,
  body: Record<string, unknown>
): CallbackRef {
  return {
    kind,
    referenceId: str(body[DECENTRO_CALLBACK_FIELDS.referenceId]),
    providerMandateId: str(body[DECENTRO_CALLBACK_FIELDS.providerMandateId]),
    // Lifted for ROUTING only — it is how a PDN callback that omits our reference
    // still finds its notification, and how the ledger row it belongs to can be
    // stamped. The value written to the notification comes from the status read,
    // never from here.
    presentationSequenceId: str(
      body[DECENTRO_CALLBACK_FIELDS.presentationSequenceId]
    ),
    callbackTxnId: str(body[DECENTRO_CALLBACK_FIELDS.callbackTxnId]),
    callbackAttempt: int(body[DECENTRO_CALLBACK_FIELDS.callbackAttempt]),
    // Always null for Decentro, and not for want of an event: it REPORTS its own
    // debit instant on the status read, so nothing is synthesised for it and
    // there is nothing for a delivery confirmation to correct.
    notificationDeliveredAt: null,
  };
}

/**
 * Build the dedupe key.
 *
 * `callback_attempt` is deliberately EXCLUDED: it increments on each retry of
 * the *same* logical event, so including it would give every retry a distinct
 * key and defeat the dedupe entirely — the exact bug this table exists to
 * prevent.
 *
 * When the provider omits `callback_txn_id` we hash the body instead. The hash
 * covers a body with `callback_attempt` stripped, for the same reason.
 */
export function buildDedupeKey(
  kind: string,
  ref: CallbackRef,
  body: Record<string, unknown>
): string {
  if (ref.callbackTxnId) return `${kind}:${ref.callbackTxnId}`;

  // Build the hashed view by explicitly EXCLUDING the retry counter. Keys are
  // sorted so JSON key order — which the provider does not guarantee between
  // deliveries — cannot change the digest and defeat the dedupe.
  const stableKeys = Object.keys(body)
    .filter((k) => k !== "callback_attempt")
    .sort();
  const stable: Record<string, unknown> = {};
  for (const key of stableKeys) stable[key] = body[key];

  const canonical = JSON.stringify(stable);
  return `${kind}:sha256:${createHash("sha256").update(canonical).digest("hex")}`;
}

/**
 * Payer PII keys to strip before a callback body is persisted — across BOTH
 * providers, at ANY nesting depth. The audit row is read by admins and shipped
 * to log aggregation; a payer's VPA / account / contact is data we have no use
 * for and every reason not to retain.
 *
 * Decentro puts these at the top level; Cashfree nests them (e.g.
 * `data.authorization_details.payment_method.upi.upi_id`), so redaction must
 * recurse — a flat top-level strip silently leaked the payer's VPA (found via a
 * real Cashfree webhook).
 */
const REDACT_KEYS = new Set([
  // Decentro
  "payer_vpa",
  "payer_name",
  "payer_account",
  "payer_ifsc",
  // Cashfree
  "upi_id",
  "upi_payer_account_number",
  "upi_payer_ifsc",
  "authorization_reference", // the UMN embeds the payer's @upi handle
  "customer_email",
  "customer_phone",
  "customer_name",
]);

/**
 * A Date the INSERT will accept, or null. Prisma rejects an Invalid Date before
 * any SQL runs, and Postgres rejects anything before 4713 BC; a delivery instant
 * before year 1 is nonsense either way, so it is not worth failing the row for.
 */
function persistableDate(d: Date | null): Date | null {
  return d !== null && !Number.isNaN(d.getTime()) && d.getUTCFullYear() >= 1 ? d : null;
}

/** Recursively strip payer PII from a callback body before it is persisted. */
function redact(body: Record<string, unknown>): Record<string, unknown> {
  return redactValue(body) as Record<string, unknown>;
}

function redactValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactValue);
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      out[key] = REDACT_KEYS.has(key) ? "[redacted]" : redactValue(v);
    }
    return out;
  }
  return value;
}

/** A non-empty string, or null. Exported for gateway `extractRef`s. */
export function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

/** A finite integer (accepts numeric strings), or null. Exported for gateways. */
export function int(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && /^\d+$/.test(v)) return Number(v);
  return null;
}
