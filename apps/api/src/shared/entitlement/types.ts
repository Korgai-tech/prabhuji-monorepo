import type { z } from "zod";
import type {
  SubscriptionStatusData,
  SubscriptionStatusEnum,
} from "@api/shared/schemas";

/**
 * The subscription/entitlement types, DERIVED from the wire schema.
 *
 * They live in `shared/` because three places need them and no core module may
 * own a type another core module imports: `core/subscription` produces it,
 * `core/payment` embeds it in `MandateData`, and `shared/entitlement` returns it
 * from `readSubscriptionStatus`. Hand-writing an interface in
 * `core/subscription/types.ts` and importing it from the other two was a
 * boundary violation the arch gate correctly refuses.
 *
 * Derived rather than declared so the domain type and the emitted contract
 * cannot drift: add a field to `SubscriptionStatusData` and every producer stops
 * compiling until it supplies one. That is the property the flat
 * `subscriptionStatus: string` on `MandateData` lacked, which is how it ended up
 * a weaker second copy of the same concept.
 */
export type SubscriptionStatus = z.infer<typeof SubscriptionStatusData>;

/** The seven statuses. Narrowed from the DB's bare TEXT at read time. */
export type SubscriptionStatusValue = z.infer<typeof SubscriptionStatusEnum>;
