import { z } from "zod";

/**
 * Zod schemas for `GET /subscription/status` (TAM-47).
 *
 * These schemas are the single source of truth for the OpenAPI contract
 * emitted by `pnpm nx run api:openapi` and consumed by the generated TS
 * (`packages/api-client`) + Dart (`apps/mobile`) clients.
 *
 * Response is scoped to the JWT's `userId` (the endpoint has NO query
 * params — no way to fetch another user's state). Every non-status field
 * is nullable: `activePlanId`, `activeProductId`, `provider`, `expiresAt`
 * are all `null` for free users.
 *
 * `provider` + `providerSubscriptionId` will be populated by a future
 * payment-provider ticket. Only `provider` is exposed on the wire;
 * `providerSubscriptionId` is repository-internal and NEVER returned (spec
 * §"Data Protection" — even for active subscriptions).
 */

// ---- response components ---------------------------------------------------

// The shape itself now lives in `shared/schemas/subscription-status.ts`, because
// `core/payment` emits it too and core modules may not import each other's
// internals. Re-exported here so this module's routes read unchanged.
import {
  SubscriptionStatusData,
  SubscriptionStatusEnum,
} from "@api/shared/schemas";

export { SubscriptionStatusData, SubscriptionStatusEnum };

export const SubscriptionStatusResponse = z
  .object({
    success: z.literal(true),
    message: z.string(),
    data: SubscriptionStatusData,
  })
  .meta({ id: "SubscriptionStatusResponse" });

export const ErrorEnvelope = z
  .object({
    success: z.literal(false),
    message: z.string(),
    data: z.null(),
    errorCode: z.string().optional(),
  })
  .meta({ id: "SubscriptionErrorEnvelope" });

export function envelope<T extends z.ZodTypeAny>(data: T) {
  return z.object({
    success: z.literal(true),
    message: z.string(),
    data,
  });
}
