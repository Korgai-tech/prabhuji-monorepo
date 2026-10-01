import type { FastifyReply, FastifyRequest } from "fastify";
import { performServiceCall } from "@api/shared/workspace";
import { sendError } from "@api/shared/response";
import { createModuleLogger } from "@api/shared/logs";
import { ADMIN_ROLE, type UserRole } from "@api/shared/schemas";

declare module "fastify" {
  interface FastifyRequest {
    /**
     * The DB-resolved role of the authenticated caller. Set ONLY by
     * `adminMiddleware`, and only once it has decided the caller is an admin —
     * so its presence is itself proof the guard ran. Never populated from a
     * token claim, a header, or any request input.
     */
    adminRole?: UserRole;
  }
}

const log = createModuleLogger("auth:admin-middleware");

/**
 * Authorization guard for every `/admin/*` route (TAM-82; ADR §B2).
 *
 * ALWAYS runs as the second half of `preHandler: [authMiddleware, adminMiddleware]`
 * — it never re-implements token verification, it only answers "may this
 * already-authenticated caller use an admin route?". `registerAdminRoute` is
 * what applies the pair, and a contract test enumerates the live route table to
 * prove no `/admin/*` route escapes it.
 *
 * The role is resolved **from the database on every request**, never from a JWT
 * claim. `JWT_EXPIRES_IN` defaults to 7d and this repo has no refresh-token
 * flow and no denylist, so a `role` claim would leave a demoted or offboarded
 * admin fully privileged for up to a week with no way to cut them off — a
 * property that makes the DB-on-every-request choice more, not less, important
 * as the token lifetime grew. One indexed SELECT per admin request on a
 * low-traffic internal panel is a trade worth making for instant revocation.
 * **Do not cache this** — a cache is the same bug as the claim, with a shorter fuse.
 *
 * FAIL-CLOSED on all three branches — every non-`admin` outcome denies:
 *   1. no `req.user`            → 401 UNAUTHORIZED (authMiddleware didn't run
 *                                 or didn't authenticate; never assume a caller)
 *   2. role lookup throws       → 403 FORBIDDEN    (DB down, facade unregistered,
 *                                 user deleted — an error is NEVER an allow)
 *   3. role !== "admin"         → 403 FORBIDDEN
 */
export async function adminMiddleware(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const user = req.user;
  if (!user) {
    // Branch 1. Reached only if this guard is used without `authMiddleware`
    // ahead of it, or if that middleware let an unauthenticated request through.
    // Either is a bug, so deny loudly rather than trust the request.
    void sendError(reply, "Missing bearer token", 401, "UNAUTHORIZED");
    return;
  }

  let role: UserRole;
  try {
    role = await performServiceCall(
      "users",
      (u) => u.getRole(user.id),
      "adminMiddleware",
      "Authorization check failed"
    );
  } catch (err) {
    // Branch 2. The catch-all IS the security property: any failure to prove
    // the caller is an admin denies. Never "allow on error".
    log.warn({ user_id: user.id, err }, "admin role lookup failed — denying (fail-closed)");
    void sendError(reply, "Admin access required", 403, "FORBIDDEN");
    return;
  }

  if (role !== ADMIN_ROLE) {
    // Branch 3. 403, not 401: the caller is authenticated, they simply may not
    // be here. The admin SPA's <AdminRoute> relies on that distinction to show
    // an explicit "not authorized" screen instead of a login redirect loop.
    void sendError(reply, "Admin access required", 403, "FORBIDDEN");
    return;
  }

  req.adminRole = role;
}
