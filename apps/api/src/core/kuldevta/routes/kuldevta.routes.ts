import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";

import { authMiddleware } from "@api/core/auth/middleware";
import type { KuldevtaController } from "@api/core/kuldevta/controllers";

import {
  ErrorEnvelope,
  IdentifyBody,
  type IdentifyInput,
  IdentifyResponse,
} from "./kuldevta.schemas.js";

/**
 * Register `POST /kuldevta/identify` (TAM-165). JWT required.
 *
 * The persona CONVERSATION is not here — it is served by `core/chat` as the
 * `kuldevta_chat` variant, which already owns sessions, transcripts and
 * history. This module identifies the deity; talking to it is chat's job.
 */
export function registerKuldevtaRoutes(
  app: FastifyInstance,
  controller: KuldevtaController
): void {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.post(
    "/kuldevta/identify",
    {
      schema: {
        tags: ["kuldevta"],
        body: IdentifyBody,
        response: {
          200: IdentifyResponse,
          400: ErrorEnvelope,
          401: ErrorEnvelope,
          502: ErrorEnvelope,
          500: ErrorEnvelope,
        },
      },
      preHandler: authMiddleware,
    },
    async (req: FastifyRequest<{ Body: IdentifyInput }>, reply: FastifyReply): Promise<void> => {
      await controller.identify(req, reply);
    }
  );
}
