import type { SubscriptionService } from "@api/core/subscription/services";
import type {
  DebitFailedInput,
  DebitSucceededInput,
  MandateAuthorizedInput,
  MandateAuthorizedResult,
  MandateEndedInput,
  PendingMandateInput,
  SubscriptionStatus,
  SubscriptionTxHandle,
} from "@api/core/subscription/types";
import type { ISubscriptionApi } from "./subscription.api.js";

/**
 * Facade implementation — thin passthrough handles to the module's
 * singletons (`SubscriptionService`) built in the composition root.
 *
 * Both methods delegate straight to the service; no extra logic here so
 * cross-module callers (via `performServiceCall("subscription", ...)`)
 * and the module's own HTTP controller see identical behavior.
 */
export class SubscriptionApi implements ISubscriptionApi {
  constructor(private readonly service: SubscriptionService) {}

  async getStatus(userId: string): Promise<SubscriptionStatus> {
    return this.service.getStatus(userId);
  }

  async getStatuses(userIds: string[]): Promise<Record<string, SubscriptionStatus>> {
    return this.service.getStatuses(userIds);
  }

  async hasConsumedTrial(userId: string): Promise<boolean> {
    return this.service.hasConsumedTrial(userId);
  }

  async createFreeSubscriptionForUser(
    userId: string,
    tx?: SubscriptionTxHandle
  ): Promise<void> {
    await this.service.createFreeSubscriptionForUser(userId, tx);
  }

  async setComplimentaryPro(userId: string, enabled: boolean): Promise<void> {
    await this.service.setComplimentaryPro(userId, enabled);
  }

  async applyPendingMandate(input: PendingMandateInput): Promise<void> {
    await this.service.applyPendingMandate(input);
  }

  async applyMandateAuthorized(
    input: MandateAuthorizedInput
  ): Promise<MandateAuthorizedResult> {
    return this.service.applyMandateAuthorized(input);
  }

  async applyDebitSucceeded(input: DebitSucceededInput): Promise<void> {
    await this.service.applyDebitSucceeded(input);
  }

  async applyDebitFailed(input: DebitFailedInput): Promise<number> {
    return this.service.applyDebitFailed(input);
  }

  async applyMandateEnded(input: MandateEndedInput): Promise<void> {
    await this.service.applyMandateEnded(input);
  }

  async expireLapsed(now: Date): Promise<number> {
    return this.service.expireLapsed(now);
  }
}
