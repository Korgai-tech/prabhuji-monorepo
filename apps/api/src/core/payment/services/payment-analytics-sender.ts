import { analyticsEventsClient, type AnalyticsEventInput } from "@api/shared/analytics";
import { createModuleLogger } from "@api/shared/logs";

const log = createModuleLogger("payment:analytics");

/**
 * THE exception boundary for every payment analytics event.
 *
 * Analytics is strictly best-effort: a dead collector, a DNS failure or a 500
 * must leave the payment outcome byte-identical, so this never rejects. A
 * failure is logged with the event types and the user, and swallowed.
 *
 * One POST for the whole batch — a moment that emits two events (a settlement
 * and its revenue record) costs one round trip rather than two.
 *
 * Shared by `PaymentAnalyticsService` (outcomes) and
 * `PaymentLedgerAnalyticsService` (the debit-attempt ledger), so the two cannot
 * disagree on what "best-effort" means.
 */
export async function sendPaymentAnalytics(
  ...events: AnalyticsEventInput[]
): Promise<void> {
  if (events.length === 0) return;
  try {
    await analyticsEventsClient.send(events);
  } catch (err) {
    log.warn(
      {
        err,
        event: "payment_analytics_send_failed",
        event_type: events.map((e) => e.event_type),
        user_id: events[0].user_id,
      },
      "payment analytics event send failed"
    );
  }
}
