import { z } from "zod";

/**
 * How an account authenticates.
 *
 * Single source of truth for the login-type *shape*: `core/otp` stamps `otp` on
 * every phone signup, `core/auth` stamps `email` on registration and on the
 * bootstrap admin, and the login guard compares against it. It lives in
 * `shared/` — not in either module — because both need it and modules must never
 * import each other's internals. Mirrors how `UserRoleSchema` is shared.
 *
 * The Prisma `login_type` enum is the *storage* source of truth; this union
 * mirrors it, so widening the DB enum without updating this list fails
 * `pnpm nx typecheck api` rather than silently admitting an unmodelled value.
 *
 * EXCLUSIVE, and enforced in the database. `user_login_type_shape` (see the
 * migration) requires an `email` row to carry email + passwordHash and an `otp`
 * row to carry a phone, so "an OTP account with a password" is unrepresentable
 * rather than merely discouraged. An admin who also wants the mobile app signs
 * up separately with their phone.
 *
 * Orthogonal to `UserRole`: an `email` account may be `user` or `admin`.
 *
 * NOTE the missing `.meta({ id })`, which `UserRoleSchema` does carry. That is
 * deliberate: `.meta()` registers a schema in the OpenAPI component registry,
 * and the Dart generator emits a model per component — so an id here would ship
 * a `LoginType` class inside the APK for a value no client ever sees. Add one
 * only if this ever appears on the wire.
 */
export const LoginTypeSchema = z.enum(["otp", "email"]);

export type LoginType = z.infer<typeof LoginTypeSchema>;

/** Phone + OTP — the mobile app. No email, no password. */
export const OTP_LOGIN = "otp" satisfies LoginType;

/**
 * Email + bcrypt password — the admin CMS. The ONLY login type `/auth/login`
 * will authenticate; the guard there compares against this constant, so "who may
 * use a password" has exactly one definition.
 */
export const EMAIL_LOGIN = "email" satisfies LoginType;
