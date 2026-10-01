import { isConversionReportingEnabled, reportPaymentConversion } from "@api/shared/analytics";
import { createModuleLogger } from "@api/shared/logs";
import { performServiceCall } from "@api/shared/workspace";
import type { TransactionRow } from "../repositories/transactions.repository.js";

const log = createModuleLogger("payment:conversions");

/**
 * Reports a settled payment to the shared platform's referral service, with the
 * same two moments cricsignal reports: the FIRST charge (the registration
 * deposit — `StartTrial`) and every later one (a recurring debit — `Purchase`).
 * `event_id` is `transaction.id`: for the deposit that is the
 * `paymentReferenceId` the mandate endpoints publish.
 *
 * NEVER rejects, so every call site `void`s it after the money has settled.
 * The users read for the phone runs only once reporting is known to be on.
 */
export async function reportTransactionConversion(
  isFirstCharge: boolean,
  transaction: TransactionRow
): Promise<void> {
  try {
    if (!isConversionReportingEnabled()) return;
    await reportPaymentConversion({
      isFirstCharge,
      userId: transaction.userId,
      transactionId: transaction.id,
      amountPaise: transaction.amountPaise,
      currency: transaction.currency,
      phone: await resolvePhone(transaction.userId),
    });
  } catch (err) {
    log.warn(
      { err, event: "conversion_report_failed", transaction_id: transaction.id },
      "payment conversion not reported"
    );
  }
}

/**
 * The payer's E.164 phone (`+91` + number), or null. Optional in the contract,
 * so a users-module failure costs only the phone, never the report.
 */
async function resolvePhone(userId: string): Promise<string | null> {
  try {
    const user = await performServiceCall(
      "users",
      (api) => api.getUserPublic(userId),
      `payment:conversion-phone user=${userId}`,
      "failed to resolve the phone for a conversion"
    );
    return user?.phoneCountryCode && user.phoneNumber
      ? `${user.phoneCountryCode}${user.phoneNumber}`
      : null;
  } catch {
    return null;
  }
}
