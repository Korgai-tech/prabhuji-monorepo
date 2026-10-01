import { z } from "zod";

/**
 * Authorization role vocabulary (TAM-82).
 *
 * Single source of truth for the role *shape* across the app: the `users`
 * facade (`IUsersApi.getRole`), `adminMiddleware`'s predicate, and the
 * `/admin/session` response schema all import from here. It lives in `shared/`
 * — not in `core/users` — because `core/auth` needs the Zod schema at the route
 * boundary and modules must never import each other's internals.
 *
 * The Prisma `user_role` enum is the *storage* source of truth; this union
 * mirrors it and `UsersRepository.findRoleById` assigns the Prisma value to
 * this type, so widening the DB enum without updating this list fails
 * `pnpm nx typecheck api` rather than silently returning an unmodelled role.
 *
 * EXACTLY TWO VALUES — decided (epic P2 / ADR §B1). editor/reviewer/viewer
 * tiers are out of scope. Adding a tier later = a value here + a Prisma enum
 * value + a predicate in `adminMiddleware`; that cost is accepted deliberately
 * (epic deferral D-D3). Do NOT "future-proof" this.
 */
export const UserRoleSchema = z.enum(["user", "admin"]).meta({ id: "UserRole" });

export type UserRole = z.infer<typeof UserRoleSchema>;

/**
 * The one privileged role. Every admin authorization decision in the app funnels
 * through `adminMiddleware`, which compares against this constant — so "what
 * counts as an admin" has exactly one definition.
 */
export const ADMIN_ROLE = "admin" satisfies UserRole;
