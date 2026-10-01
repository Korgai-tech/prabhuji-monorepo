import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";

import { AppError } from "@api/shared/errors";
import { loadEnv } from "@api/shared/config";
import { DevtoolsController } from "@api/core/devtools/controllers";
import type { DevtoolsService } from "@api/core/devtools/services";
import type { MarkProInput } from "@api/core/devtools/types";
import { MarkProBody, MarkProData, envelope } from "./devtools.schemas.js";

/**
 * Dev-only endpoints, mounted solely under `ENABLE_DEV_TOOLS`.
 *
 * `POST /devtools/mark-pro` grants LIFETIME Pro to any phone number, so a shared
 * token is required in `x-devtools-token`. That is weak authentication, and
 * deliberately not pretending otherwise — but it is the difference between
 * needing a secret and needing only a URL, and stage is internet-reachable.
 *
 * The real guard is still `env.ts`, which refuses to boot with dev tools armed
 * against PAYMENT_ENV=production. This is the second lock, for the environment
 * where the routes ARE meant to exist.
 */
export function registerDevtoolsRoutes(app: FastifyInstance, service: DevtoolsService): void {
  const controller = new DevtoolsController(service);
  const r = app.withTypeProvider<ZodTypeProvider>();
  const { DEVTOOLS_TOKEN } = loadEnv();

  const requireToken = (req: FastifyRequest): void => {
    // env.ts guarantees the token exists whenever these routes are mounted, so
    // a missing one here means the invariant broke — refuse rather than open up.
    if (!DEVTOOLS_TOKEN || req.headers["x-devtools-token"] !== DEVTOOLS_TOKEN) {
      throw new AppError("Unauthorized", 401, "UNAUTHORIZED");
    }
  };

  r.post(
    "/mark-pro",
    {
      preHandler: requireToken,
      schema: {
        body: MarkProBody,
        response: {
          200: envelope(MarkProData),
        },
      },
    },
    async (req: FastifyRequest<{ Body: MarkProInput }>, reply: FastifyReply): Promise<void> => {
      await controller.markPro(req, reply);
    }
  );
}
