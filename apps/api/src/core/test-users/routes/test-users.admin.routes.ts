import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { registerAdminRoute } from "@api/core/auth/routes";
import { TestUsersController } from "@api/core/test-users/controllers";
import type { TestUsersService } from "@api/core/test-users/services";
import {
  AdminCreateTestUserBody,
  type AdminCreateTestUserInput,
  AdminTestUserListQuery,
  type AdminTestUserListQueryInput,
  AdminTestUserListResponse,
  AdminTestUserResponse,
  ErrorEnvelope,
} from "./test-users.admin.schemas.js";

/**
 * `/admin/test-users` (TAM-187) — list the QA accounts, and create or update
 * one that logs in with `TEST_OTP`. Through `registerAdminRoute`, like every
 * admin route.
 */
export function registerTestUsersAdminRoutes(
  app: FastifyInstance,
  service: TestUsersService
): void {
  const controller = new TestUsersController(service);

  registerAdminRoute(app, {
    method: "GET",
    url: "/test-users",
    schema: {
      querystring: AdminTestUserListQuery,
      response: {
        200: AdminTestUserListResponse,
        400: ErrorEnvelope,
        401: ErrorEnvelope,
        403: ErrorEnvelope,
        500: ErrorEnvelope,
      },
    },
    handler: async (
      req: FastifyRequest<{ Querystring: AdminTestUserListQueryInput }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.list(req, reply);
    },
  });

  registerAdminRoute(app, {
    method: "POST",
    url: "/test-users",
    schema: {
      body: AdminCreateTestUserBody,
      response: {
        200: AdminTestUserResponse,
        400: ErrorEnvelope,
        401: ErrorEnvelope,
        403: ErrorEnvelope,
        409: ErrorEnvelope,
        500: ErrorEnvelope,
      },
    },
    handler: async (
      req: FastifyRequest<{ Body: AdminCreateTestUserInput }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.create(req, reply);
    },
  });
}
