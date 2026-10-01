import { z } from "zod";

/**
 * Zod schemas for the Firebase Tokens module — the single source of truth for
 * the emitted OpenAPI contract and the generated TS + Dart clients.
 *
 * The mobile app persists a stable per-install UUID as `deviceId` in secure
 * storage; combined with the JWT-derived `userId` it uniquely identifies a
 * device row (see `firebase_token_user_device_unique`). `token` is the current
 * FCM registration id; a device's token can rotate at any time via FCM's
 * `onTokenRefresh` so the register endpoint is an upsert, keyed on
 * `(userId, deviceId)`.
 */

export const FirebasePlatformSchema = z.enum(["ios", "android"]);

export const RegisterFirebaseTokenBody = z
  .object({
    token: z.string().min(1).max(4096),
    deviceId: z.string().min(1).max(128),
    platform: FirebasePlatformSchema,
  })
  .meta({ id: "RegisterFirebaseTokenBody" });
export type RegisterFirebaseTokenBodyInput = z.infer<
  typeof RegisterFirebaseTokenBody
>;

export const DeleteFirebaseTokenBody = z
  .object({
    deviceId: z.string().min(1).max(128),
  })
  .meta({ id: "DeleteFirebaseTokenBody" });
export type DeleteFirebaseTokenBodyInput = z.infer<
  typeof DeleteFirebaseTokenBody
>;

export const FirebaseTokenResult = z
  .object({
    deviceId: z.string(),
    platform: FirebasePlatformSchema,
  })
  .meta({ id: "FirebaseTokenResult" });

export const RegisterFirebaseTokenResponse = z
  .object({
    success: z.literal(true),
    message: z.string(),
    data: FirebaseTokenResult,
  })
  .meta({ id: "RegisterFirebaseTokenResponse" });

export const DeleteFirebaseTokenResponse = z
  .object({
    success: z.literal(true),
    message: z.string(),
    data: z.object({ deleted: z.boolean() }),
  })
  .meta({ id: "DeleteFirebaseTokenResponse" });

export const ErrorEnvelope = z
  .object({
    success: z.literal(false),
    message: z.string(),
    data: z.null(),
    errorCode: z.string().optional(),
  })
  .meta({ id: "FirebaseTokenErrorEnvelope" });
