import { AppError } from "@api/shared/errors";
import { createModuleLogger } from "@api/shared/logs";
import type { BillingCycleService } from "@api/core/payment/services/billing-cycle.service.js";
import type { BillingLock } from "@api/core/payment/services/billing-lock.js";
import type { MandateService } from "@api/core/payment/services/mandate.service.js";
import type { BillingCycleReport, MandateView } from "@api/core/payment/types";
import type { IPaymentApi } from "./payment.api.js";

const log = createModuleLogger("payment:api");

export class PaymentApi implements IPaymentApi {
  constructor(
    private readonly billing: BillingCycleService,
    private readonly mandates: MandateService,
    private readonly lock: BillingLock,
    private readonly config: { schedulerEnabled: boolean }
  ) {}

  async runBillingCycle(input: {
    now: Date;
    dryRun: boolean;
    provider?: string | null;
  }): Promise<BillingCycleReport> {
    const only = input.provider ?? null;
    // The kill switch. A dry run is always allowed — inspecting what the
    // scheduler would do must not require arming it first, which is exactly
    // the sequence you want before enabling it on an environment with real
    // mandates.
    if (!this.config.schedulerEnabled && !input.dryRun) {
      log.info(
        { event: "billing_cycle_disabled" },
        "billing scheduler disabled (ENABLE_BILLING_SCHEDULER=false) — no-op"
      );
      return emptyReport(input, true);
    }

    // A dry run writes nothing and calls no provider write endpoint, so it can
    // safely run alongside a live one — and being able to inspect a cycle
    // while one is in flight is worth more than the symmetry.
    if (input.dryRun) return this.billing.run(input.now, true, only);

    // Coarse overlap guard. EventBridge does not guarantee a task has finished
    // before firing the next one; the `(mandateId, cycleDate)` unique
    // constraint is what actually prevents a double charge, this just avoids
    // the wasted work. Held here rather than in the entrypoint so every caller
    // of the facade inherits it.
    // Scoped to the gateway when the run is, so a single-gateway sweep does not
    // block (or get blocked by) another gateway's.
    const release = await this.lock.acquire(only);
    if (!release) return emptyReport(input, true);

    try {
      return await this.billing.run(input.now, false, only);
    } finally {
      await release();
    }
  }

  async getMandateForUser(
    userId: string,
    now: Date
  ): Promise<MandateView | null> {
    return this.mandates.getMandateForUser(userId, now);
  }

  async cancelMandateForUser(userId: string, now: Date): Promise<boolean> {
    try {
      await this.mandates.cancelForUser(userId, now);
      return true;
    } catch (err) {
      // `cancelForUser` raises exactly one 404: "no mandate row, or no
      // `providerMandateId` on it". Translated to `false` rather than
      // propagated because to the CALLER that is not an error — there is
      // simply nothing at the gateway to revoke, and a user on a comped or
      // pre-mandate subscription must not be told their cancellation failed.
      //
      // Narrowed on the status code alone deliberately: every OTHER AppError
      // out of that call is a gateway or entitlement failure and must keep
      // propagating. Widening this catch is how a failed revoke starts looking
      // like a successful one.
      if (err instanceof AppError && err.statusCode === 404) {
        log.warn(
          { event: "mandate_cancel_noop", user_id: userId },
          "cancellation requested for a user with no revocable mandate — nothing to do at the gateway"
        );
        return false;
      }
      // Re-raise a raw transport failure AS AN AppError, carrying the gateway's
      // own words. `performServiceCall` rethrows an AppError verbatim but
      // replaces anything else with a generic "failed to …" string — so without
      // this, every cross-module caller records that the revoke failed and
      // nothing about WHY, which is precisely the detail an ops ticket starts
      // from. Adapters that already translate (Razorpay's cancel rejections)
      // throw AppError and pass through untouched.
      if (err instanceof AppError) throw err;
      throw new AppError(
        err instanceof Error ? err.message : String(err),
        502,
        "PROVIDER_CANCEL_FAILED"
      );
    }
  }
}

/** A run that never happened — disabled, or someone else held the lock. */
function emptyReport(
  input: { now: Date; dryRun: boolean },
  lockBusy: boolean
): BillingCycleReport {
  return {
    ranAt: input.now.toISOString(),
    expiredSwept: 0,
    pdnSent: 0,
    pdnFailed: 0,
    pdnAwaitingSequenceId: 0,
    pdnSequenceIdsResolved: 0,
    pdnRearmed: 0,
    pdnDeferred: 0,
    pdnAbandoned: 0,
    presentationsSent: 0,
    reconciled: 0,
    skippedOutsideWindow: 0,
    notificationsAdopted: 0,
    cyclesSuperseded: 0,
    dryRun: input.dryRun,
    lockBusy,
  };
}
