import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { AuthController } from "@api/core/auth/controllers";
import type { AuthService } from "@api/core/auth/services";
import { registerAdminRoute } from "./register-admin-route.js";
import {
  AdminSession,
  AdminUserListQuery,
  type AdminUserListQueryInput,
  AdminUserListResponse,
  ErrorEnvelope,
  envelope,
} from "./auth.schemas.js";

/**
 * The `/admin/*` surface owned by the auth module (TAM-82).
 *
 * Mounted on its own `/admin`-prefixed scope by `initAuthModule` — deliberately
 * separate from the module's `/auth` scope, because admin is a distinct route
 * surface (ADR §B5), not the public routes with a guard bolted on.
 *
 * Registered via `registerAdminRoute`, so the guard pair + `admin` tag are
 * applied centrally and cannot be forgotten here or anywhere downstream.
 */
export function registerAdminSessionRoutes(app: FastifyInstance, service: AuthService): void {
  const controller = new AuthController(service);

  registerAdminRoute(app, {
    method: "GET",
    url: "/session",
    schema: {
      response: {
        200: envelope(AdminSession),
        401: ErrorEnvelope,
        403: ErrorEnvelope,
        500: ErrorEnvelope,
      },
    },
    handler: async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
      await controller.adminSession(req, reply);
    },
  });

  // The user list. This was GET /auth/users behind `authMiddleware` only —
  // authentication, no authorization — so any holder of a phone-OTP token could
  // enumerate the whole user table, admins included. It belongs on the admin
  // surface, and going through `registerAdminRoute` is what makes that
  // structural rather than remembered.
  //
  // It returns a PAGE (`{items,total,page,pageSize}`), not the whole array.
  // It used to return every row unpaginated and only `{id,email}`, which left
  // the CMS sorting and slicing client-side over a response that grows with the
  // user table — fine at seed size, a full table read per page view in prod.
  registerAdminRoute(app, {
    method: "GET",
    url: "/users",
    schema: {
      querystring: AdminUserListQuery,
      response: {
        200: AdminUserListResponse,
        400: ErrorEnvelope,
        401: ErrorEnvelope,
        403: ErrorEnvelope,
        500: ErrorEnvelope,
      },
    },
    handler: async (
      req: FastifyRequest<{ Querystring: AdminUserListQueryInput }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.list(req, reply);
    },
  });
}
