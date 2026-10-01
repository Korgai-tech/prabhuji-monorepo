import type { FastifyReply, FastifyRequest } from "fastify";
import { AppError } from "@api/shared/errors";
import { sendSuccess } from "@api/shared/response";
import { performServiceCall } from "@api/shared/workspace";
import { readSubscriptionStatus } from "@api/shared/entitlement";
import type { MandateService } from "@api/core/payment/services/mandate.service.js";
import type { MandateView } from "@api/core/payment/types";

/**
 * User-facing payment endpoints.
 *
 * The controller resolves the PRICE server-side from the paywall config. The
 * request body carries only a `planId` — a client-supplied amount would be a
 * client-controlled charge, and no amount of validation downstream makes that
 * safe.
 */
export class PaymentController {
  constructor(
    private readonly service: MandateService,
    private readonly deps: {
      paywallId: string;
      /**
       * Whether the active gateway takes money at registration. Passed in
       * rather than read off the provider here, so the controller keeps its
       * single dependency on the service layer and does not reach into
       * `repositories/`.
       */
      supportsInitialDeposit: boolean;
    }
  ) {}

  createMandate = async (
    req: FastifyRequest<{ Body: { planId: string } }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    // Redundant at runtime (authMiddleware short-circuits) but required to
    // keep the types honest — same guard every controller in this repo uses.
    if (!req.user) throw new AppError("Unauthorized", 401, "UNAUTHORIZED");

    const now = new Date();
    const plan = await this.resolvePlan(req.body.planId);
    const view = await this.service.createMandate({
      userId: req.user.id,
      plan,
      now,
    });
    return sendSuccess(reply, await this.withSubscription(req.user.id, view), "OK");
  };

  getMandate = async (
    req: FastifyRequest,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    if (!req.user) throw new AppError("Unauthorized", 401, "UNAUTHORIZED");

    const view = await this.service.getMandateForUser(req.user.id, new Date());
    if (!view) {
      // Null, not 404: "this user has never started a mandate" is an expected
      // state the client renders as the normal paywall, not an error.
      return sendSuccess(reply, null, "OK");
    }
    return sendSuccess(reply, await this.withSubscription(req.user.id, view), "OK");
  };

  cancelMandate = async (
    req: FastifyRequest,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    if (!req.user) throw new AppError("Unauthorized", 401, "UNAUTHORIZED");

    const view = await this.service.cancelForUser(req.user.id, new Date());
    return sendSuccess(
      reply,
      await this.withSubscription(req.user.id, view),
      "Subscription cancelled"
    );
  };

  /**
   * Resolve plan pricing from the paywall CMS.
   *
   * `amountPaise` is the machine-readable price added alongside the localized
   * `displayPriceText`. Reading the display string instead would mean parsing
   * "₹299 / month" to decide what to charge — which is how you charge someone
   * ₹2.
   */
  private async resolvePlan(planId: string) {
    const plans = await performServiceCall(
      "paywall",
      (api) => api.getPurchasablePlans(this.deps.paywallId),
      "payment:resolve-plan",
      "failed to load plan pricing"
    );
    const plan = plans.find((p) => p.planId === planId);
    if (!plan) {
      throw new AppError("Unknown plan", 400, "UNKNOWN_PLAN");
    }
    if (plan.amountPaise <= 0) {
      // A plan seeded before `amountPaise` existed defaults to 0. Registering
      // a ₹0 mandate would produce a live subscription that never charges, so
      // fail loudly instead.
      throw new AppError(
        "Plan is not purchasable",
        409,
        "PLAN_NOT_PURCHASABLE"
      );
    }
    if (
      plan.trialDays > 0 &&
      plan.initialDepositPaise <= 0 &&
      this.deps.supportsInitialDeposit
    ) {
      // Same failure mode one column over: `initial_deposit_paise` defaults to
      // 0, so a plan that grew a trial without being given a deposit amount
      // would authorize ₹0 on a gateway that expects to take one — leaving an
      // unverified mandate and a trial nobody paid to start. Loud beats a
      // silently free trial.
      throw new AppError(
        "Plan is not purchasable",
        409,
        "PLAN_NOT_PURCHASABLE"
      );
    }
    return plan;
  }

  /**
   * Merge live subscription state into the mandate view.
   *
   * The client needs both halves on every poll — "is the mandate approved" and
   * "am I entitled yet" — and making it do two round trips would double the
   * latency of the post-approval poll loop, which is the one place the user is
   * actively staring at a spinner.
   */
  private async withSubscription(
    userId: string,
    view: MandateView
  ): Promise<MandateView> {
    // Fail-LOUD deliberately (see the wrapper's docblock). `MandateData.isEntitled`
    // is the client's success signal, so emitting `false` on a read failure
    // would show "This payment link has expired" to someone who just paid. A
    // 500 they retry is the honest answer.
    const status = await readSubscriptionStatus(
      userId,
      "payment:view-subscription"
    );
    // TAM-125: thread `subscriptions.startedAt` up to the top-level
    // `MandateData.startedAt` alongside the embedded `subscription` block.
    // The service's `toView` seeded a null placeholder; this is the ONE place
    // that has the subscription row loaded, so the merge lives here.
    return { ...view, subscription: status, startedAt: status.startedAt };
  }
}
