/**
 * Subscription module public types (TAM-47).
 *
 * These mirror the Zod `SubscriptionStatusResponse` schema at
 * `routes/subscription.schemas.ts` — that Zod schema is the OpenAPI source
 * of truth, and this type MUST stay aligned with it (response serializer
 * would fail loudly in tests if they drift).
 *
 * Status lifecycle (the UPI Autopay write path owns every transition):
 *
 *   free     → no subscription. The seed state for every new user.
 *   pending  → a mandate has been created but the user hasn't approved it in
 *              their UPI app yet. NOT entitled.
 *   trialing → mandate authorized, inside the 3-day free trial. Entitled.
 *   active   → a debit succeeded; paid through `expiresAt`. Entitled.
 *   past_due → a debit failed and we're in dunning. Entitled until
 *              `graceUntil`, so a retryable bank failure doesn't instantly
 *              revoke access.
 *   cancelled→ user or provider revoked the mandate. Entitled until
 *              `expiresAt` — they paid for the period they're in.
 *   expired  → terminal. Not entitled.
 */
export type { SubscriptionStatusValue } from "@api/shared/entitlement/types.js";

/**
 * Wire-facing subscription status shape.
 *
 * DEFINED IN `shared/entitlement/types.ts`, derived from the Zod schema, and
 * re-exported here so this module's own code reads unchanged. It moved because
 * `core/payment` embeds it in `MandateData` and `shared/entitlement` returns it
 * — and a core module owning a type two other places import is exactly the
 * boundary `pnpm check:arch-boundaries` refuses.
 *
 * `isEntitled` remains THE field every Pro gate reads. Callers MUST NOT
 * re-derive entitlement from `status` alone: `trialing` and in-grace `past_due`
 * are both entitled, and an `active` row whose `expiresAt` has passed is not.
 * Cross-module consumers go through `resolveProEntitlement`
 * (`@api/shared/entitlement`) rather than reading this field directly.
 *
 * Datetimes are ISO-8601 strings on the wire; the service converts the Prisma
 * `Date` at the boundary and the Zod schema validates it on the way out.
 */
export type { SubscriptionStatus } from "@api/shared/entitlement/types.js";

/**
 * Prisma-agnostic transaction handle accepted by
 * `createFreeSubscriptionForUser` on both the service and the facade. A
 * caller inside `$transaction(async (tx) => ...)` can pass the tx here so
 * the seed joins their transaction; the repository unwraps
 * `tx.subscription` internally (that's the only layer allowed to `import`
 * `@prisma/client`).
 *
 * Typed at this layer as `{ readonly subscription: unknown }` because the
 * arch gate forbids `@prisma/client` in `services/` and everywhere except
 * `repositories/`. The repository does the actual type-narrowing before
 * calling `.upsert`.
 */
export interface SubscriptionTxHandle {
  readonly subscription: unknown;
}

// ---- billing transition inputs ---------------------------------------------
//
// `core/payment` owns mandate lifecycle; `core/subscription` owns the
// `subscriptions` table. These are the only shapes that cross that boundary,
// and they are deliberately provider-neutral — no Decentro field names, no
// mandate ids beyond the opaque `providerSubscriptionId` handle.

/** A mandate exists but is unapproved. Grants nothing. */
export interface PendingMandateInput {
  userId: string;
  provider: string;
  providerSubscriptionId: string;
  planId: string;
  productId: string;
}

/**
 * The user approved the mandate.
 *
 * `trialEndsAt: null` means "no trial" — a re-registration after a failed
 * first debit, where `trialConsumedAt` is already stamped. The payment service
 * decides; the subscription module just records it.
 */
export interface MandateAuthorizedInput {
  userId: string;
  providerSubscriptionId: string;
  planId: string;
  productId: string;
  trialEndsAt: Date | null;
  startedAt: Date;
}

/**
 * What the authorization write actually did.
 *
 * `changed` is the usual guard-rejected-or-not count every transition logs.
 *
 * `trialFirstConsumed` answers a narrower question, and it is the reason this
 * transition reports at all: did THIS call stamp `trialConsumedAt`? The stamp
 * runs as a single `UPDATE … WHERE trial_consumed_at IS NULL`, so under
 * concurrent racers exactly one wins — which makes a `true` here mean "this is
 * the first trial this user has ever been granted", once per user for all time.
 *
 * `core/payment` emits `bk_trial_success` off it. See the `applyDebitFailed`
 * docblock in `subscription.api.ts` for the same argument one event over: a
 * write the guard rejected must not produce a phantom analytics event.
 */
export interface MandateAuthorizedResult {
  changed: number;
  trialFirstConsumed: boolean;
}

/**
 * A debit settled. `periodEnd` is derived from the billing cycle by the
 * caller, never by adding a month to the current value — that is what makes a
 * replayed callback idempotent instead of granting a free extra month.
 */
export interface DebitSucceededInput {
  userId: string;
  periodEnd: Date;
  planId: string;
  productId: string;
}

/** A debit failed; the user stays entitled through `graceUntil`. */
export interface DebitFailedInput {
  userId: string;
  graceUntil: Date;
}

/**
 * The mandate ended. `cancelled` preserves `expiresAt` and `trialEndsAt` (they
 * keep the period or trial they already hold); `expired` is for the case where
 * nothing was ever paid.
 *
 * `cancelled` is a REQUEST, not a verdict: the repository downgrades it to
 * `expired` when the row has no deadline still in the future, because a
 * `cancelled` status that grants nothing is a lie the admin views and funnels
 * then have to see through. That is what keeps an NPCI auto-revoke after a
 * failed first debit reading as `expired` without the caller having to know why
 * the mandate died — hence `now`.
 */
export interface MandateEndedInput {
  userId: string;
  reason: "cancelled" | "expired";
  now: Date;
}
