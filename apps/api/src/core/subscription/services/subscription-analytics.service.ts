import {
  analyticsEventsClient,
  SUBSCRIPTION_ANALYTICS_EVENT as E,
  type AnalyticsEventInput,
} from "@api/shared/analytics";
import { createModuleLogger } from "@api/shared/logs";
import type { SubscriptionRow } from "@api/core/subscription/repositories";

const log = createModuleLogger("subscription:analytics");

/**
 * When access actually runs out — the LATER of the two deadlines.
 *
 * Deliberately not `entitlementDeadline`, which answers a different question
 * and returns only `expiresAt` for a `cancelled` row: someone who cancelled
 * mid-trial has a live `trialEndsAt` and a null `expiresAt`, so that function
 * would report null for a user who demonstrably still had access. Same rule
 * `computeIsEntitled` applies to `cancelled`, kept local so this file never
 * reaches back into the entitlement module.
 */
const accessEnd = (row: SubscriptionRow): Date | null => {
  const { expiresAt: paid, trialEndsAt: trial } = row;
  if (paid === null || trial === null) return paid ?? trial;
  return paid.getTime() >= trial.getTime() ? paid : trial;
};

/**
 * Was full price ever paid for this subscription?
 *
 * `expiresAt` is written by exactly one path — a debit that settled — so a row
 * that has a trial window and no `expiresAt` never bought a paid period. That
 * makes the predicate answerable from the row alone, with no query and no
 * mandate in scope.
 */
const subscriptionType = (row: SubscriptionRow): "trial" | "subscription" =>
  row.trialEndsAt !== null && row.expiresAt === null ? "trial" : "subscription";

/**
 * Drop keys with no value rather than sending them as null.
 *
 * ClickHouse drops null-valued JSON keys at ingest, so a key sent as `null`
 * does not exist on the stored row anyway — verified in prod. Omitting is
 * therefore the honest encoding of "structurally unavailable", and it keeps the
 * wire payload from implying a column that will never materialise.
 */
const defined = (props: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(props).filter(([, value]) => value !== null && value !== undefined)
  );

/** `YYYY-MM-DD`, for the day-scoped dedup key. */
const isoDay = (d: Date): string => d.toISOString().slice(0, 10);

/**
 * Publishes the subscription module's own analytics events (TAM-145).
 *
 * Modelled on `core/payment`'s `PaymentAnalyticsService` and sharing its two
 * load-bearing properties:
 *
 * 1. **It never reads the database.** Every event is built from rows already on
 *    the caller's stack, so the expiry sweep gains no query and the arch
 *    boundary keeping `repositories/` out of `services/` holds.
 * 2. **It never throws.** A dead collector must leave the sweep's outcome
 *    byte-identical, so every send failure is swallowed and logged here.
 *
 * The property bag is SUBSCRIPTION-ONLY — no `mandate_id`, no `provider`, no
 * gateway ids. Expiry is the one entitlement transition with no mandate in
 * scope (the row's mandate may be long dead, and this module cannot read the
 * `mandates` table at all), so those keys are not omissions, they are absent by
 * construction. See `SUBSCRIPTION_ANALYTICS_EVENT` in `shared/analytics`.
 */
export class SubscriptionAnalyticsService {
  /**
   * The sweep moved rows to `expired` — one event per row.
   *
   * Rows are the PRE-transition ones, which is what `expiry_reason` needs: the
   * old `status` is the only thing separating "ran out of paid time"
   * (`active`), "was already ending and finally did" (`cancelled`) and "dunning
   * exhausted" (`past_due`).
   *
   * One batch, one POST — the sweep is capped at `EXPIRE_SWEEP_BATCH`, which is
   * within what the collector chunks internally.
   */
  async trackSubscriptionsExpired(
    rows: readonly SubscriptionRow[],
    expiredAt: Date
  ): Promise<void> {
    await this.safeSend(
      rows.map((row) => ({
        event_type: E.SUBSCRIPTION_EXPIRED,
        user_id: row.userId,
        // Subscription + expiry DAY. The subscription id alone would make a
        // genuine re-expiry after a resubscribe invisible (one row is reused
        // for a user's whole billing history), and adding the timestamp would
        // defeat dedupe entirely — a sweep re-run inside the same day, or two
        // ticks racing over the same backlog, must collapse to one row.
        insert_id: `${E.SUBSCRIPTION_EXPIRED}:${row.id}:${isoDay(expiredAt)}`,
        event_properties: defined({
          subscription_id: row.id,
          // A plan CODE (`month`), not a uuid — that is what the column holds.
          plan_id: row.activePlanId,
          product_id: row.activeProductId,
          type: subscriptionType(row),
          expiry_reason: row.status,
          // Every date here is full ISO-8601, deliberately: the payment events
          // mix `YYYY-MM-DD` and full timestamps in one bag, and a warehouse
          // column that is sometimes a day and sometimes an instant cannot be
          // compared against itself.
          expiry_date: expiredAt.toISOString(),
          subscription_start_date: row.startedAt?.toISOString(),
          trial_end_date: row.trialEndsAt?.toISOString(),
          access_end_date: accessEnd(row)?.toISOString(),
        }),
      }))
    );
  }

  /**
   * Analytics is strictly best-effort. A failure is logged with the event type
   * and never propagated into the sweep that triggered it.
   */
  private async safeSend(events: AnalyticsEventInput[]): Promise<void> {
    if (events.length === 0) return;
    try {
      await analyticsEventsClient.send(events);
    } catch (err) {
      log.warn(
        { err, event: "subscription_analytics_send_failed", event_type: events[0].event_type, count: events.length },
        "subscription analytics event send failed"
      );
    }
  }
}

export const subscriptionAnalytics = new SubscriptionAnalyticsService();
