import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { authMiddleware } from "@api/core/auth/middleware";
import { DeityController } from "@api/core/deity/controllers";
import type { DeityService } from "@api/core/deity/services";
import {
  DeityListQuery,
  type DeityListQueryInput,
  DeityListResponse,
  ErrorEnvelope,
} from "./deity.schemas.js";

/**
 * Register `GET /deities?locale=<code>&cursor=&limit=` (TAM-57).
 *
 * The full path is declared here (no nested prefix) so the emitted OpenAPI path
 * is exactly `/deities` (a `"/"` route under a `/deities` prefix would surface
 * as `/deities/`). Protected — JWT required (`authMiddleware`).
 */
export function registerDeityRoutes(
  app: FastifyInstance,
  service: DeityService
): void {
  const controller = new DeityController(service);
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    "/deities",
    {
      schema: {
        querystring: DeityListQuery,
        response: {
          200: DeityListResponse,
          400: ErrorEnvelope,
          401: ErrorEnvelope,
          500: ErrorEnvelope,
        },
      },
      preHandler: authMiddleware,
    },
    async (
      req: FastifyRequest<{ Querystring: DeityListQueryInput }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.list(req, reply);
    }
  );
}
