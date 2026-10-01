import type { ISubscriptionApi } from "@api/core/subscription/api";

/**
 * Test fake for the `subscription` facade.
 *
 * Six modules register a fake subscription facade to exercise their Pro gates.
 * Before this existed, each hand-rolled the whole `ISubscriptionApi` shape, so
 * adding one method to the interface broke six unrelated test files and every
 * one had to be patched with the same no-op. That churn is pure noise: those
 * tests care about exactly one thing — whether the user is entitled — and
 * nothing about mandate lifecycle writes.
 *
 * Legal from `shared/` because `@api/core/subscription/api` is on the
 * `allowTypeOnly` list in `arch-boundaries.json` (the facade paths are the one
 * sanctioned core→shared type dependency) and this imports the type only.
 *
 * Defaults to a free, unentitled user. Override just what the test is about:
 *
 * ```ts
 * registerGlobalService("subscription", fakeSubscriptionApi({
 *   getStatus: () => Promise.resolve(proStatus()),
 * }));
 * ```
 */
export function fakeSubscriptionApi(
  overrides: Partial<ISubscriptionApi> = {}
): ISubscriptionApi {
  return {
    getStatus: () => Promise.resolve(freeStatus()),
    getStatuses: (userIds) =>
      Promise.resolve(Object.fromEntries(userIds.map((id) => [id, freeStatus()]))),
    hasConsumedTrial: () => Promise.resolve(false),
    createFreeSubscriptionForUser: () => Promise.resolve(),
    setComplimentaryPro: () => Promise.resolve(),
    // Billing writes are no-ops. A test that cares about a transition should
    // override the specific method with a spy rather than assert on these.
    applyPendingMandate: () => Promise.resolve(),
    // Reports the happy path: the transition applied AND it stamped this user's
    // one trial, so a caller gating `bk_trial_success` on it emits once. A test
    // exercising a RE-ENTRY (race, self-heal, second mandate) must override with
    // `trialFirstConsumed: false` — that is the whole point of the signal.
    applyMandateAuthorized: () =>
      Promise.resolve({ changed: 1, trialFirstConsumed: true }),
    applyDebitSucceeded: () => Promise.resolve(),
    // Returns the changed-row count. `1` = "the transition applied", which is
    // the normal case a test that doesn't care about dunning should see.
    applyDebitFailed: () => Promise.resolve(1),
    applyMandateEnded: () => Promise.resolve(),
    expireLapsed: () => Promise.resolve(0),
    ...overrides,
  };
}

/** A free, unentitled status payload. */
export function freeStatus(): Awaited<ReturnType<ISubscriptionApi["getStatus"]>> {
  return {
    status: "free",
    isEntitled: false,
    entitledUntil: null,
    activePlanId: null,
    activeProductId: null,
    provider: null,
    expiresAt: null,
    trialEndsAt: null,
    startedAt: null,
  };
}

/**
 * An entitled status payload. `entitled: false` keeps `status: "active"` while
 * flipping `isEntitled` — the shape of a lapsed subscription, which is what
 * gates must deny.
 */
export function proStatus(
  entitled = true
): Awaited<ReturnType<ISubscriptionApi["getStatus"]>> {
  return {
    status: "active",
    isEntitled: entitled,
    // Null = a lifetime grant, matching `expiresAt: null` below. The fixture's
    // `entitled: false` variant models a LAPSED row, whose deadline has passed
    // rather than never existed — so it is left null here too and the boolean
    // carries the case, exactly as it does for the real read path.
    entitledUntil: null,
    activePlanId: "month",
    activeProductId: "prabhuji_vip_month",
    provider: "decentro",
    expiresAt: null,
    trialEndsAt: null,
    startedAt: null,
  };
}

/** A user inside the 3-day free trial. Entitled, but nothing has been paid. */
export function trialingStatus(
  trialEndsAt: Date
): Awaited<ReturnType<ISubscriptionApi["getStatus"]>> {
  return {
    status: "trialing",
    isEntitled: true,
    entitledUntil: trialEndsAt.toISOString(),
    activePlanId: "month",
    activeProductId: "prabhuji_vip_month",
    provider: "decentro",
    expiresAt: null,
    trialEndsAt: trialEndsAt.toISOString(),
    startedAt: null,
  };
}
