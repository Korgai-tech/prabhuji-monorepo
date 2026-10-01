import { z } from "zod";
import { SubscriptionStatusData } from "@api/shared/schemas";

/**
 * Zod schemas for the payment module — the OpenAPI source of truth consumed by
 * the generated TS (`packages/api-client`) and Dart (`apps/mobile`) clients.
 *
 * Note what the client never sends: an AMOUNT. The request carries a `planId`
 * and the server resolves the price from `paywall_plans.amountPaise`. A
 * client-supplied amount is a client-controlled charge.
 *
 * Note what the server never returns: the provider's mandate id, the payer's
 * VPA, or an expired approval URL.
 */

export const MandateStateEnum = z
  .enum([
    "initiated",
    "pending",
    "active",
    "paused",
    "revoked",
    "rejected",
    "expired",
    "failed",
    "completed",
  ])
  .meta({ id: "MandateStateEnum" });

export const CreateMandateBody = z
  .object({
    planId: z.string().min(1).max(64),
  })
  .meta({ id: "CreateMandateBody" });

/**
 * Razorpay Checkout's options — the alternative to `authUrl`, never an addition
 * to it.
 *
 * On Razorpay the authorization payment is raised by Razorpay Checkout ON THE
 * DEVICE, from an order the server created. There is no `upi://` link to send,
 * because the SDK is what mints it. Link gateways (Decentro, Cashfree) return
 * `authUrl` with a null here; Razorpay returns this with a null `authUrl`.
 *
 * NAMED PER GATEWAY on `MandateData`, discriminated by `provider`, rather than
 * one shared `checkout` object. Two gateways' SDKs do not take the same fields,
 * so a merged shape would be a bag of optionals the client cannot tell apart.
 *
 * Note what is absent: a `subscriptionId`. That belongs to Razorpay's
 * Subscriptions product, where RAZORPAY owns the billing schedule. This
 * integration runs S2S recurring with `token.frequency: as_presented` so our
 * own scheduler owns it — the SDK authorizes an ORDER, and there is no
 * `sub_xxx` in this flow to send.
 *
 * Everything here is safe on a device: ids, plus Razorpay's PUBLISHABLE
 * `keyId`. The API secret is server-side only and never appears in a response.
 */
export const RazorpayCheckoutData = z
  .object({
    /** Razorpay's publishable `key_id` — documented as client-side by Razorpay. */
    keyId: z.string(),
    /** `order_id` for the checkout options. */
    orderId: z.string(),
    /** `customer_id` for the checkout options. */
    customerId: z.string(),
    /**
     * Razorpay's `recurring` flag, verbatim — the STRING `"1"`, not a boolean.
     * Sent rather than left for the app to hardcode so the gateway's quirk stays
     * on the server's side of the wire.
     */
    recurring: z.string(),
  })
  .meta({ id: "RazorpayCheckoutData" });

/**
 * Decentro's SDK parameters — everything registration produced for the mandate,
 * under that gateway's key.
 *
 * FULLY BACKWARD COMPATIBLE, and by construction rather than by care: every
 * field is derived server-side from columns the mandate row already had, so the
 * Decentro adapter, its storage and its behaviour are all unchanged. `authUrl`
 * still carries the same `upi://` intent it always has — `intentUrl` is that
 * same string — so a client that launches the link and never reads this block
 * keeps working exactly as before, indefinitely.
 *
 * Both appear and disappear together on the approval expiry: a client reading
 * one must never see a live link while the other reports none.
 */
export const DecentroCheckoutData = z
  .object({
    /** The `upi://` intent to launch — identical to `MandateData.authUrl`. */
    intentUrl: z.string(),
    /** Decentro's mandate handle. Null until registration comes back with one. */
    decentroMandateId: z.string().nullable(),
    /** Decentro's registration-txn handle. Null when it sent none. */
    decentroTxnId: z.string().nullable(),
    /**
     * OUR reference for this mandate, constant for its whole life — what any
     * reconciliation or support conversation with Decentro starts from.
     */
    referenceId: z.string(),
  })
  .meta({ id: "DecentroCheckoutData" });

export const MandateData = z
  .object({
    mandateId: z.string(),
    /** `transactions.id` of this mandate's registration deposit; null when it has none. */
    paymentReferenceId: z.string().nullable(),
    /**
     * The payment gateway this mandate was registered on — sent with the
     * approval link, from `mandates.provider`.
     *
     * Deliberately a plain string, not an enum: the client must not need a
     * rebuild to keep working when the server adds a gateway, and it only ever
     * labels (analytics, support surfaces) rather than branches. Distinct from
     * `subscription.provider`, which is the entitlement's view and is nullable
     * — this one always has a value because a mandate always has a gateway.
     */
    provider: z.string(),
    state: MandateStateEnum,
    /**
     * Where to send the user to approve. Null when there is nothing live to
     * approve — already active, terminal, or the link expired. The client must
     * treat null as "do not launch anything".
     */
    authUrl: z.string().nullable(),
    /**
     * Razorpay Checkout's options, populated only when `provider` is
     * `razorpay`.
     *
     * Keyed by GATEWAY NAME so each SDK gets its own typed block and `provider`
     * is the discriminator — a second SDK gateway adds a sibling field rather
     * than widening this one into a bag of optionals. Nulled on the same
     * `authExpiresAt` window as `authUrl`, since an order past its expiry opens
     * a sheet that can only fail.
     *
     * ADDITIVE: `authUrl` keeps its meaning and its place, so a client that
     * never reads this field behaves exactly as before on Decentro and Cashfree.
     */
    razorpay: RazorpayCheckoutData.nullable(),
    /**
     * Decentro's SDK parameters, populated only when `provider` is `decentro`.
     *
     * ADDITIVE AND DERIVED — see `DecentroCheckoutData`. The intent-link flow is
     * untouched: `authUrl` still carries the same link, and `intentUrl` is that
     * same string re-exposed under the gateway's key so a client can read
     * `data[data.provider]` uniformly. Launching `authUrl` remains correct.
     *
     * Cashfree has no counterpart yet; nothing has needed one.
     */
    decentro: DecentroCheckoutData.nullable(),
    authExpiresAt: z.string().datetime().nullable(),
    planId: z.string(),
    amountPaise: z.number().int(),
    currency: z.string(),
    /**
     * The mandate died in a way re-consent fixes (notably an NPCI auto-revoke
     * after a failed first debit). Drives a "set up autopay again" CTA rather
     * than a dead-end error.
     */
    requiresReRegistration: z.boolean(),
    /**
     * Live subscription state, merged in so the post-approval poll needs ONE
     * round trip — that loop is the one moment a user is watching a spinner.
     *
     * The SAME shape `GET /subscription/status` returns, deliberately. This used
     * to be a flat `subscriptionStatus: z.string()` + `isEntitled` +
     * `trialEndsAt`, which was a second, weaker copy of the same concept: one
     * side a typed enum, the other a bare string, already drifted in the
     * generated Dart. `isEntitled` here is still what the client treats as the
     * success signal.
     */
    subscription: SubscriptionStatusData,
    nextDebitDate: z.string().nullable(),
    /**
     * "Member since" — the day the current subscription started, taken from
     * `subscriptions.started_at` and threaded through `MandateService.toView`
     * (TAM-125). Null when there is no subscription row yet or on legacy rows
     * written before the column existed. The mobile Manage Subscription
     * screen (TAM-125 §2) renders this as "Membership since <date>".
     *
     * Duplicated with `subscription.startedAt` deliberately — a top-level
     * field on `MandateData` keeps the Dart consumer's read path a single
     * hop, and `subscription.*` may be swapped out wholesale by the
     * controller's `withSubscription` merge.
     */
    startedAt: z.string().datetime().nullable(),
  })
  .meta({ id: "MandateData" });

/** `GET /payment/mandate` before the user has ever started a mandate. */
export const MandateStateResponseData = MandateData.nullable();

export const ErrorEnvelope = z
  .object({
    success: z.literal(false),
    message: z.string(),
    data: z.null(),
    errorCode: z.string().optional(),
  })
  .meta({ id: "PaymentErrorEnvelope" });

export function envelope<T extends z.ZodTypeAny>(data: T) {
  return z.object({
    success: z.literal(true),
    message: z.string(),
    data,
  });
}

// ---- provider callbacks ----------------------------------------------------

/**
 * Callback bodies are validated PERMISSIVELY, which deliberately inverts this
 * repo's strict-Zod convention.
 *
 * A vendor adding a field or changing a type must not produce a 400: the
 * provider would retry the same payload until it gave up, and we would lose
 * the trigger entirely. Only the keys we route on are required, everything
 * else passes through to the audit log untouched.
 *
 * Safe precisely because the body is never believed — it is a trigger to go
 * ask the provider's status API what actually happened.
 */
export const ProviderCallbackBody = z
  .object({
    reference_id: z.string().optional(),
    decentro_mandate_id: z.string().optional(),
    callback_txn_id: z.string().optional(),
    callback_attempt: z.union([z.number(), z.string()]).optional(),
    mandate_status: z.string().optional(),
  })
  .loose();

export const CallbackAckData = z.object({ received: z.literal(true) });
