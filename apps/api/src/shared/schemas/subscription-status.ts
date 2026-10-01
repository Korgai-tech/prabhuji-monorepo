import { z } from "zod";

/**
 * THE wire shape for subscription/entitlement state, shared by every response
 * that carries it.
 *
 * It lives in `shared/` for two reasons, one structural and one behavioural.
 *
 * Structural: both `core/subscription` and `core/payment` emit it, and a core
 * module may not import another core module's internals (apps/api/CLAUDE.md).
 * `shared/` is the only legal home for a shape two modules share.
 *
 * Behavioural, and the reason this was worth moving: there used to be two
 * shapes. `MandateData` carried a flat `subscriptionStatus: z.string()` beside
 * `isEntitled` and `trialEndsAt`, while `SubscriptionStatusData` carried a typed
 * `SubscriptionStatusEnum` — the same concept, one of them stringly-typed, and
 * they had already drifted far enough that the generated Dart exposed
 * `String subscriptionStatus` on one and `SubscriptionStatusEnum status` on the
 * other. One definition means they cannot drift again.
 *
 * The `.meta({ id })` values are load-bearing: they name the OpenAPI components,
 * and therefore the generated Dart classes. Do not rename them casually.
 */
export const SubscriptionStatusEnum = z
  .enum([
    "free",
    "pending",
    "trialing",
    "active",
    "past_due",
    "cancelled",
    "expired",
  ])
  .meta({ id: "SubscriptionStatusEnum" });

/**
 * The full subscription status payload.
 *
 * `isEntitled` is the field clients gate on — NOT `status`. Two statuses beyond
 * `active` grant access (`trialing`, and `past_due` within grace) and an
 * `active` row past its `expiresAt` does not, so a client comparing
 * `status == 'active'` is wrong in four of seven states. That is not
 * hypothetical: the Flutter client shipped exactly that comparison as a
 * fallback, and it locked out dunning users.
 *
 * `entitledUntil` is when `isEntitled` lapses (null = no deadline). It exists so
 * a client can cache entitlement and still expire it correctly WITHOUT
 * re-deriving the rule — it may revoke, never grant.
 *
 * Datetimes are ISO-8601; `z.string().datetime()` rejects malformed values and
 * keeps the wire shape consistent across the TS and Dart clients.
 */
export const SubscriptionStatusData = z
  .object({
    status: SubscriptionStatusEnum,
    isEntitled: z.boolean(),
    entitledUntil: z.string().datetime().nullable(),
    activePlanId: z.string().nullable(),
    activeProductId: z.string().nullable(),
    provider: z.string().nullable(),
    expiresAt: z.string().datetime().nullable(),
    trialEndsAt: z.string().datetime().nullable(),
    /**
     * When the current subscription STARTED — the "member since" the mobile
     * Manage Subscription screen renders (TAM-125 §2). Null on `free` (never
     * subscribed) and on legacy rows written before `subscriptions.started_at`
     * existed. Not to be confused with `trialEndsAt` / `expiresAt` — those
     * are about the current period, this one is about the whole relationship.
     */
    startedAt: z.string().datetime().nullable(),
  })
  .meta({ id: "SubscriptionStatusData" });
