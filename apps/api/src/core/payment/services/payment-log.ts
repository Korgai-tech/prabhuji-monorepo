import type { MandateRow } from "@api/core/payment/repositories/mandate.repository.js";
import type { TransactionRow } from "@api/core/payment/repositories/transactions.repository.js";
import type { PaymentStage } from "../types.js";

/**
 * The shape every money-lifecycle log line carries.
 *
 * Built in one place so the fields cannot drift between the six sites that emit
 * them — an incident is filtered by `event` and then read across all of them,
 * and a field that exists on `debit_succeeded` but not `debit_failed` makes the
 * one query you actually want impossible.
 *
 * The bar for what belongs here is: could an on-call engineer answer "which
 * user, which mandate, which movement, which billing day, how much, and what
 * did the gateway actually say" WITHOUT opening a psql session? That bar was
 * not met before — `pdn_failed` logged neither the amount nor the gateway's
 * error, so when Cashfree started answering 404 to every debit in prod, the
 * cause was visible only by querying `payment_attempts.failure_message`
 * directly. The logs said "pre-debit notification failed" and stopped.
 *
 * PII: ids and amounts only. Never the payer's VPA or name (masked or not),
 * never a phone number, never the gateway's raw response body — those can carry
 * credentials and the full payer handle.
 */
// The stage vocabulary lives in `../types.js` so the HTTP clients can tag
// their own lines without a repository importing a service. Re-exported here
// so the services keep a single import for everything log-shaped.
export { PAYMENT_STAGE, type PaymentStage } from "../types.js";

/**
 * The correlation bundle for a line that does NOT have both rows in hand —
 * a callback still being routed, a PDN poll, a gateway retry. Pass whatever is
 * known; every key is emitted (as `null` when unknown) so a query on any one of
 * them can be joined to the others.
 *
 * `reference_id` is the join key between OUR ids and the GATEWAY's world: the
 * HTTP clients and webhooks only ever see it, the ledger only ever stores
 * `mandate_id`, and an incident that has one and needs the other used to
 * require a psql session. Carrying both on every line is what removes that.
 */
export interface PaymentTraceContext {
  stage: PaymentStage;
  user_id: string | null;
  mandate_id: string | null;
  reference_id: string | null;
  transaction_id: string | null;
  pdn_id: string | null;
  provider: string | null;
}

export function paymentTrace(input: {
  stage: PaymentStage;
  mandate?: Pick<MandateRow, "id" | "userId" | "provider" | "referenceId"> | null;
  userId?: string | null;
  mandateId?: string | null;
  referenceId?: string | null;
  transactionId?: string | null;
  pdnId?: string | null;
  provider?: string | null;
}): PaymentTraceContext {
  return {
    stage: input.stage,
    user_id: input.userId ?? input.mandate?.userId ?? null,
    mandate_id: input.mandateId ?? input.mandate?.id ?? null,
    reference_id: input.referenceId ?? input.mandate?.referenceId ?? null,
    transaction_id: input.transactionId ?? null,
    pdn_id: input.pdnId ?? null,
    provider: input.provider ?? input.mandate?.provider ?? null,
  };
}

export interface MoneyLogContext {
  stage: PaymentStage;
  user_id: string;
  mandate_id: string;
  /** The gateway-facing reference — the join key to every HTTP and webhook line. */
  reference_id: string;
  transaction_id: string;
  /** OUR idempotency key. What to ask the gateway about when reconciling. */
  gateway_request_id: string | null;
  /** THE gateway's id. What a dispute or a settlement report is matched on. */
  gateway_payment_id: string | null;
  amount_paise: number;
  currency: string;
  /** The billing day in IST, or null for a movement with no cycle. */
  cycle_date: string | null;
  kind: string;
  attempt_no: number;
  retry_count: number;
  is_first_debit: boolean;
  provider: string;
}

/** Every field an incident needs, from the two rows that always exist. */
export function moneyLog(
  mandate: Pick<MandateRow, "id" | "userId" | "provider" | "referenceId">,
  txn: TransactionRow,
  stage: PaymentStage
): MoneyLogContext {
  return {
    stage,
    user_id: mandate.userId,
    mandate_id: mandate.id,
    reference_id: mandate.referenceId,
    transaction_id: txn.id,
    gateway_request_id: txn.gatewayRequestId,
    gateway_payment_id: txn.gatewayPaymentId,
    amount_paise: txn.amountPaise,
    currency: txn.currency,
    cycle_date: isoDay(txn.cycleDate),
    kind: txn.kind,
    attempt_no: txn.attemptNo,
    retry_count: txn.retryCount,
    is_first_debit: txn.isFirstDebit,
    provider: txn.provider,
  };
}

/** `YYYY-MM-DD`, the form every cycle-date query uses. */
export function isoDay(d: Date | null): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}

/**
 * A gateway error, safe to log and short enough to read in a log viewer.
 *
 * The MESSAGE only, never the raw response body — the same rule the mandate
 * registration path already follows, because a body can carry credentials or
 * the payer's full handle. Truncated because some gateways answer errors with a
 * wall of HTML, and one of those per failed cycle drowns the surrounding lines.
 */
export function safeFailureMessage(err: unknown, max = 300): string {
  const raw =
    err instanceof Error ? err.message : typeof err === "string" ? err : "unknown";
  const oneLine = raw.replace(/\s+/g, " ").trim();
  return oneLine.length > max ? `${oneLine.slice(0, max)}…` : oneLine;
}
