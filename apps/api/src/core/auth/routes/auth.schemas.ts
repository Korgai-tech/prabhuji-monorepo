import { z } from "zod";
import {
  LoginTypeSchema,
  UserRoleSchema,
  adminPagedEnvelope,
  adminPaginationQuery,
  sortQuery,
} from "@api/shared/schemas";
import { USER_SORT_FIELDS } from "@api/core/auth/types";

/**
 * TAM-82: `role` is deliberately NOT a field here, and must never become one.
 * `/auth/register` is PUBLIC and unguarded, so accepting `role` would make it
 * "anyone on the internet can mint themselves an admin". Zod strips unknown
 * keys by default, so `{"role":"admin"}` in the body is dropped before it
 * reaches the service — and `AuthService.register` ALSO hard-codes
 * `role: "user"` rather than relying on that library default staying true
 * forever. Two independent layers, one explicit test.
 */
export const RegisterBody = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  password: z.string().min(8),
});

export const LoginBody = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

/**
 * `email` is NULLABLE, and it has to be: `/auth/me` and `/auth/users` are
 * guarded by `authMiddleware` alone, so a phone account reaches both — and a
 * phone account has no email. It is non-null only on the `login`/`register`
 * responses, which are the email path by definition; the schema is widened to
 * the honest shape rather than split into two.
 */
export const PublicUser = z
  .object({
    id: z.string(),
    email: z.string().nullable(),
  })
  .meta({ id: "PublicUser" });

export const LoginData = z
  .object({
    token: z.string(),
    user: PublicUser,
  })
  .meta({ id: "LoginData" });

/**
 * `GET /admin/session` response (TAM-82 AC (d)).
 *
 * A dedicated schema rather than adding `role` to `PublicUser`: `PublicUser` is
 * consumed by `/auth/me` + `/auth/users` and is generated into the **Dart**
 * client, so widening it would churn the mobile contract to serve an
 * admin-only need (ADR §D1).
 *
 * Only `{id, email, role}` — no hash, no phone fields, no onboarding PII.
 * `role` is typed as the full enum for honesty about the shape, though the
 * guard means a 200 can only ever carry `"admin"`.
 *
 * `email` stays NON-nullable here, unlike `PublicUser`. Admins are `email`-login
 * accounts by construction — the only writer of `role: admin` is the bootstrap
 * path, which creates one — so a 200 always has an address. The controller
 * narrows explicitly rather than coercing a null to `""`.
 */
export const AdminSession = z
  .object({
    id: z.string(),
    email: z.string(),
    role: UserRoleSchema,
  })
  .meta({ id: "AdminSession" });

/**
 * `GET /admin/users` querystring — offset pagination (ADR §C2) + one search
 * box + the sort allowlist. Inline / un-`.meta`-tagged because
 * `@fastify/swagger` cannot resolve named component refs for querystring
 * params (same reason `AdminDeityListQuery` is).
 *
 * `q` is ONE field matching phone / email / name rather than three: an editor
 * has one identifier in hand and does not know which column it lives in (a
 * phone account has no email at all). `.trim().min(1)` so `?q=` is a 400, not a
 * `contains: ""` scan of the table.
 *
 * `sort` is a Zod enum over `USER_SORT_FIELDS` — never a free string. `User`
 * carries `passwordHash`, so a free `orderBy` column here would be a
 * binary-search-the-hashes oracle. See `sortQuery`'s note.
 */
export const AdminUserListQuery = adminPaginationQuery
  .extend(sortQuery(USER_SORT_FIELDS).shape)
  .extend({ q: z.string().trim().min(1).max(100).optional() });
export type AdminUserListQueryInput = z.infer<typeof AdminUserListQuery>;

/**
 * One row of the admin user list — an **app user**. Admin accounts are excluded
 * by the repository, so there is no `role` field here: it would be the constant
 * `"user"` on every row.
 *
 * **`phoneNumber` is plaintext PII** and this is the first surface other than
 * `/users/me` (the owner reading their own) to emit it. It is here because the
 * ask is "find the user with this number" and a hash cannot answer that. The
 * containment is: `registerAdminRoute` puts the route behind
 * `[authMiddleware, adminMiddleware]`, and the `admin` tag keeps this schema out
 * of `openapi.public.json` and therefore out of the mobile Dart codegen — so
 * this shape never ships in the APK. It must not be logged (see the repository).
 *
 * `passwordHash` is absent and must stay absent.
 */
export const AdminUserListItem = z
  .object({
    id: z.string(),
    email: z.string().nullable(),
    name: z.string().nullable(),
    phoneCountryCode: z.string().nullable(),
    phoneNumber: z.string().nullable(),
    loginType: LoginTypeSchema,
    createdAt: z.string().datetime(),
    /**
     * TAM-154 — when the number was proved reachable. NULLABLE and meaningful:
     * the `User` row is written at OTP SEND, so `createdAt` is now "asked for a
     * code" and this is "actually signed up". A null row is a lead someone can
     * still call, which is the whole reason it is surfaced here.
     */
    phoneVerifiedAt: z.string().datetime().nullable(),
  })
  .meta({ id: "AdminUserListItem" });

/** `{items,total,page,pageSize}` — the ADR §C2 admin page envelope. */
export const AdminUserListResponse = adminPagedEnvelope(AdminUserListItem);

export function envelope<T extends z.ZodTypeAny>(data: T) {
  return z.object({
    success: z.literal(true),
    message: z.string(),
    data,
  });
}

export const ErrorEnvelope = z
  .object({
    success: z.literal(false),
    message: z.string(),
    data: z.null(),
    errorCode: z.string().optional(),
  })
  .meta({ id: "ErrorEnvelope" });
