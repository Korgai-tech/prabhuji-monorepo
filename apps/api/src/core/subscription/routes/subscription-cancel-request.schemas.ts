import { z } from "zod";

/**
 * Zod schemas for the user-initiated subscription cancellation-request queue
 * (TAM-125).
 *
 * These are the single source of truth for the OpenAPI contract emitted by
 * `pnpm nx run api:openapi` and consumed by the generated TS
 * (`packages/api-client`) + Dart (`apps/mobile`) clients.
 *
 * The four wire statuses are `pending | processing | completed | rejected`.
 * The DB stores `status` as bare TEXT (matches `Subscription.status`) — the
 * service defensively narrows unknown values to `pending` before rendering,
 * so a manual DB edit inserting an unexpected string can never break the
 * generated Dart enum.
 *
 * Deliberately absent from the wire shape: `subscriptionId`, `notes`,
 * `processedBy`, `createdAt`, `updatedAt`. Those are internal audit fields;
 * the app has no use for them, and exposing `processedBy` in particular
 * leaks the ops agent's identity for no benefit.
 */

// ---- response components ---------------------------------------------------

export const CancellationRequestStatusEnum = z
  .enum(["pending", "processing", "completed", "rejected"])
  .meta({ id: "CancellationRequestStatusEnum" });

export const CancellationRequestData = z
  .object({
    id: z.string().uuid(),
    status: CancellationRequestStatusEnum,
    /**
     * Nullable in the data (reason is optional on create). Pins the wire
     * shape now so a future "why?" step is not a breaking change.
     */
    reason: z.string().nullable(),
    requestedAt: z.string().datetime(),
    /** Populated only after ops fulfills or rejects. */
    processedAt: z.string().datetime().nullable(),
  })
  .meta({ id: "CancellationRequestData" });

// ---- request components ----------------------------------------------------

export const CreateCancellationRequestBody = z
  .object({
    /**
     * Optional in v1 — no UI surfaces a reason field. Kept in the contract
     * so a future "why?" step can send it without a schema bump.
     */
    reason: z.string().trim().min(1).max(500).optional(),
  })
  .meta({ id: "CreateCancellationRequestBody" });

// ---- envelopes -------------------------------------------------------------

export const ErrorEnvelope = z
  .object({
    success: z.literal(false),
    message: z.string(),
    data: z.null(),
    errorCode: z.string().optional(),
  })
  .meta({ id: "SubscriptionCancelRequestErrorEnvelope" });

export function envelope<T extends z.ZodTypeAny>(data: T) {
  return z.object({
    success: z.literal(true),
    message: z.string(),
    data,
  });
}
