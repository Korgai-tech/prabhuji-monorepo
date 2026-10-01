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

/**
 * Public facade for the subscription module (TAM-47).
 *
 * Cross-module consumers reach subscription state via this handle:
 *
 *   ```ts
 *   performServiceCall(
 *     "subscription",
 *     api => api.createFreeSubscriptionForUser(userId),
 *     "otp:verify",
 *     "failed to create free subscription"
 *   );
 *   ```
 *
 * `createFreeSubscriptionForUser` is the primary hook the OTP module
 * (TAM-43) calls after creating a new User — idempotent, so safe when the
 * OTP flow re-runs for an existing user.
 *
 * `getStatus` is exposed for future modules that need to gate behavior on
 * subscription state (e.g. the mobile splash orchestrator's server side,
 * if it ever needs an internal caller). Mobile itself goes through the
 * HTTP endpoint.
 */
export interface ISubscriptionApi {
  /**
   * Read the current subscription state for `userId`. Never throws for
   * "no row" — returns the free shape defensively (matches the HTTP
   * endpoint's contract).
   */
  getStatus(userId: string): Promise<SubscriptionStatus>;

  /**
   * TAM-187 — `getStatus` for many users in one query, keyed by userId. For
   * admin listings only; reach it through `shared/entitlement`'s
   * `readSubscriptionStatuses`, like every other status read.
   */
  getStatuses(userIds: string[]): Promise<Record<string, SubscriptionStatus>>;

  /**
   * Has this user ever actually been GRANTED a free trial?
   *
   * Reads `trialConsumedAt`, which is stamped once and never cleared. Not
   * exposed on the wire — it is an internal billing fact, and a client has no
   * use for it.
   *
   * Deliberately a first-class facade method rather than something the payment
   * module infers from `status`. The obvious approximation — "status is not
   * free, so they must have had one" — is WRONG: creating a mandate moves the
   * subscription to `pending` before the user has approved anything, so a
   * first attempt that fails (no UPI app, cancelled, link expired, network)
   * would permanently consume a trial the user never received.
   */
  hasConsumedTrial(userId: string): Promise<boolean>;

  /**
   * Idempotent seed of the free-tier row for a new user. When `tx` is
   * provided (a Prisma transaction client), the write joins the caller's
   * transaction; otherwise it runs against the top-level client.
   *
   * Safe to call for existing users — repeat calls no-op (the underlying
   * repository upsert has an empty `update` clause).
   */
  createFreeSubscriptionForUser(
    userId: string,
    tx?: SubscriptionTxHandle
  ): Promise<void>;

  /**
   * TAM-187 — grant (`enabled: true`) or revoke complimentary lifetime Pro for
   * an admin-created QA account. The grant is `active` with no expiry and
   * `provider: "admin_test"`; a revoke only reverts a row this method granted,
   * so it can never touch a real payer's subscription. Called by
   * `core/test-users` only — never on a user that is not a test account.
   */
  setComplimentaryPro(userId: string, enabled: boolean): Promise<void>;

  // ---- billing transitions (called by core/payment) ----------------------
  //
  // `core/payment` owns the mandate lifecycle but MUST NOT write
  // `subscriptions` — that table belongs to this module, and every Pro gate in
  // the app reads it. These five methods are the entire write surface.
  //
  // (`core/devtools` bypasses this facade to stamp `active` directly. That is
  // a throwaway dev affordance marked `provider: "devtools"` so the rows are
  // greppable at removal time — NOT a precedent for the real write path.)
  //
  // All five are idempotent and monotonic: a replayed provider callback is a
  // no-op, and one arriving out of order cannot overwrite a newer state.

  /** A mandate was created but not yet approved. Grants no entitlement. */
  applyPendingMandate(input: PendingMandateInput): Promise<void>;

  /**
   * The user approved the mandate — starts the trial (or waits for debit).
   *
   * Reports its outcome rather than returning `void`, for the same reason
   * `applyDebitFailed` below does: the caller emits an analytics event off the
   * answer. `trialFirstConsumed` is true only on the call that actually stamped
   * `trialConsumedAt`, which happens once per user for all time — so
   * `bk_trial_success` fires once per user, not once per re-entry of the
   * authorization path (this method is reached from a provider callback, the
   * client's poll, the self-heal branch and the billing sweeps).
   */
  applyMandateAuthorized(
    input: MandateAuthorizedInput
  ): Promise<MandateAuthorizedResult>;

  /** A debit settled; entitlement runs to `periodEnd`. */
  applyDebitSucceeded(input: DebitSucceededInput): Promise<void>;

  /**
   * A debit failed; the user stays entitled through `graceUntil`. Returns the
   * number of rows the transition actually moved — the ONE method here that
   * reports it, because the caller emits `bk_subscription_past_due` off the
   * answer and a guard-rejected write (a `free`/`pending`/`expired` row has no
   * dunning to enter) must not produce a phantom event.
   */
  applyDebitFailed(input: DebitFailedInput): Promise<number>;

  /** The mandate was cancelled, revoked, or auto-revoked by NPCI. */
  applyMandateEnded(input: MandateEndedInput): Promise<void>;

  /**
   * Sweep rows past their entitlement deadline to `expired`. Called by the
   * billing cycle; returns the number of rows swept.
   */
  expireLapsed(now: Date): Promise<number>;
}
