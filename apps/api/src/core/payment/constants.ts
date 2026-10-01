/**
 * Cross-gateway constants for the payment module.
 *
 * Only values shared across gateways live here. Provider-specific wire strings
 * — endpoint paths, vendor status spellings, webhook event-type names, vendor
 * header names — live next to each adapter in `repositories/<gw>.constants.ts`.
 */

/**
 * The single provider-callback route. One endpoint for every gateway,
 * differentiated by the `:provider` path parameter (resolved against the
 * gateway registry), so adding a gateway wires no new route.
 */
export const PAYMENT_CALLBACK_ROUTE = "/callbacks/:provider";

/**
 * Our internal callback taxonomy. A gateway maps its own webhook payload onto one
 * of these via `callbackKindFor`.
 *
 * `PDN` is the pre-debit NOTIFICATION's own lifecycle, and it is a third kind
 * rather than a flavour of `PRESENTATION` because it is about a different object:
 * the notification, not the debit. Decentro delivers the
 * `presentation_sequence_id` on this callback, and with only two kinds it was
 * classified as a presentation — routed to the settlement handler, which looked
 * for a submitted debit, found none, and discarded the id. The taxonomy has to
 * distinguish them or the asynchronous flow has no inbound path at all.
 */
export const CALLBACK_KIND = {
  MANDATE: "mandate",
  PDN: "pdn",
  PRESENTATION: "presentation",
} as const;

export type CallbackKind = (typeof CALLBACK_KIND)[keyof typeof CALLBACK_KIND];

/** Headers read on the callback path (Fastify lower-cases all header names). */
export const CALLBACK_HEADER = {
  FORWARDED_FOR: "x-forwarded-for",
} as const;

/**
 * The payment module's analytics event names moved to
 * `shared/analytics/events.ts` as `PAYMENT_ANALYTICS_EVENT` (TAM-150): the feed
 * rotation path emits server events too, and a module may not import another
 * module's internals, so the whole server-produced list lives in one shared file.
 */

/**
 * What happens to the subscription after a failed debit.
 *
 * `retry_scheduled` — a later NPCI window tries again; the user stays Pro.
 * `cancelled` — renewal retries exhausted; lapses after the grace window.
 * `expired` — the first debit was declined, so NPCI revoked the mandate. Terminal.
 * `abandoned` — the mandate was never approved, so nothing was ever declined.
 * `declined` — a registration deposit ATTEMPT failed at the gateway while the
 *   mandate is still pending. Not terminal: the payer may retry in the same
 *   checkout (TAM-188).
 */
export type PaymentOutcome =
  | "retry_scheduled"
  | "cancelled"
  | "expired"
  | "abandoned"
  | "declined";
