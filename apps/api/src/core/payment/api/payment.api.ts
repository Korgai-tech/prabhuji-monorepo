import type { BillingCycleReport, MandateView } from "@api/core/payment/types";

/**
 * Public facade for the payment module.
 *
 * Intentionally narrow. The mandate lifecycle is driven by this module's own
 * routes and scheduler, so the only cross-module needs are (a) the billing
 * cycle entrypoint, which the one-off ECS task invokes, and (b) a read for
 * admin surfaces.
 *
 * Note what is NOT exposed: nothing that writes `subscriptions`. That table
 * belongs to `core/subscription` and payment reaches it through that module's
 * facade, so entitlement has exactly one writer.
 */
export interface IPaymentApi {
  /**
   * Run one billing-cycle tick: expire sweep, due pre-debit notifications,
   * due presentations, reconciliation.
   *
   * `dryRun` reports what WOULD happen without calling the provider or moving
   * money — how you inspect the scheduler before trusting it in an
   * environment with real mandates.
   *
   * `provider` restricts the sweep to ONE gateway's rows. Null (the default)
   * sweeps every gateway, which is what the schedule does: the NPCI windows
   * that decide when money actually moves are regulatory and identical across
   * gateways, so one tick serving all of them is both correct and cheaper than
   * a schedule each. The filter exists for the two cases where that is not
   * enough — halting one gateway during an incident without stopping the
   * other's revenue, and giving a gateway its own EventBridge schedule later as
   * a terraform-only change.
   */
  runBillingCycle(input: {
    now: Date;
    dryRun: boolean;
    provider?: string | null;
  }): Promise<BillingCycleReport>;

  /** Current mandate state for a user, or null if they never started one. */
  getMandateForUser(userId: string, now: Date): Promise<MandateView | null>;

  /**
   * Revoke the user's mandate at the gateway and end their subscription.
   *
   * Exposed for `core/subscription`'s user-facing cancel endpoint, which owns
   * the audit row but must not own the provider call. Everything money-shaped
   * still happens inside this module: the gateway is resolved from the ROW's
   * `provider` (never the active one), and the entitlement write goes back out
   * through `core/subscription`'s own facade, so that table keeps exactly one
   * writer.
   *
   * Resolves `false` when there was nothing at the gateway to revoke — no
   * mandate row, or one that never reached a `providerMandateId`. That is a
   * SUCCESS for the caller (the user ends up uncancellable-because-uncharged,
   * which is what they asked for), and it is separated from the failure path
   * because only the latter should be reported to the user as "we could not
   * cancel you".
   *
   * THROWS on a genuine gateway failure. The caller must not swallow it: a
   * silent failure here is the "user thinks they cancelled and gets charged
   * again next cycle" incident.
   */
  cancelMandateForUser(userId: string, now: Date): Promise<boolean>;
}
