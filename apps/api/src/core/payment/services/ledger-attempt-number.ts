import type { TransactionsRepository } from "@api/core/payment/repositories/transactions.repository.js";
import { createModuleLogger } from "@api/shared/logs";

const log = createModuleLogger("payment:analytics");

/**
 * `attempt_number` for a MANDATE-level ledger event (`bk_mandate_status`,
 * `bk_webhook_received`), which has no debit row of its own in hand: the
 * presentation attempt of the mandate's newest live cycle, 1-based — the same
 * `retryCount + 1` every debit-level event reports.
 *
 * `null` when the mandate has never had a cycle (a registration that is still
 * awaiting approval) — the event then omits the key rather than inventing one.
 *
 * NEVER THROWS. This runs beside billing and callback handling purely to
 * decorate an analytics event, so a failed read — or a repository without the
 * method, as in narrow unit-test doubles — costs the property and nothing else.
 */
export async function resolveLatestAttemptNumber(
  transactions: Pick<TransactionsRepository, "findLatestRecurringDebitForMandate">,
  mandateId: string
): Promise<number | null> {
  try {
    const latestDebit = await transactions.findLatestRecurringDebitForMandate(mandateId);
    return latestDebit ? latestDebit.retryCount + 1 : null;
  } catch (err) {
    log.warn(
      { err, event: "ledger_attempt_number_unresolved", mandate_id: mandateId },
      "could not read the latest debit attempt for a ledger event — attempt_number omitted"
    );
    return null;
  }
}
