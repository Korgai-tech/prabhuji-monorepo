import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { authMiddleware } from "@api/core/auth/middleware";
import { loadEnv } from "@api/shared/config";
import { createModuleLogger } from "@api/shared/logs";
import { ModalsController } from "@api/core/modals/controllers";
import type { ModalsService } from "@api/core/modals/services";
import {
  ErrorEnvelope,
  ModalHookBody,
  type ModalHookBodyInput,
  ModalHookResponse,
  ModalImpressionBody,
  type ModalImpressionBodyInput,
  ModalImpressionResponse,
  ModalsNextQuery,
  type ModalsNextQueryInput,
  ModalsNextResponse,
} from "./modals.schemas.js";

const log = createModuleLogger("modals:routes");

export const MODAL_HOOK_ROUTE = "/internal/modals/hooks";

/**
 * Registers the modal routes.
 *
 * Two app-facing routes under `/modals`, and one machine callback that is
 * registered ONLY when a secret is configured — an unconfigured environment
 * 404s rather than exposing an endpoint that anyone reaching the ALB could POST
 * to.
 */
export function registerModalsRoutes(app: FastifyInstance, service: ModalsService): void {
  const controller = new ModalsController(service);
  const r = app.withTypeProvider<ZodTypeProvider>();

  /**
   * The campaign webhook. PUBLIC — the caller is a machine with no JWT —
   * authenticated by a shared secret inside the controller, exactly as the
   * payment provider callbacks authenticate per gateway.
   *
   * `hide: true` keeps this out of BOTH `openapi.json` and
   * `openapi.public.json`. That matters concretely: the Dart generator emits a
   * model per schema in the document, so without it the webhook payload shape
   * would ship inside the Android APK. It cannot instead be tagged `admin` —
   * the tag⇔path invariant hard-fails an `admin`-tagged route not under
   * `/admin/`.
   */
  if (loadEnv().MODAL_HOOK_KEY) {
    r.post(
      MODAL_HOOK_ROUTE,
      {
        schema: {
          hide: true,
          body: ModalHookBody,
          response: { 200: ModalHookResponse, 401: ErrorEnvelope, 500: ErrorEnvelope },
        },
        // A payload rejected before the controller leaves no other trace:
        // request logging is off, and nothing reaches the DB. That is how
        // every prod delivery 400'd for ten days unseen (TAM-261). Key NAMES
        // only — never values — so the log carries no user copy or ids.
        onError: async (req, _reply, error) => {
          const status = (error as { statusCode?: number }).statusCode;
          if (typeof status !== "number" || status < 400 || status >= 500 || status === 401) return;
          const body: unknown = req.body;
          log.warn(
            {
              reason: error.message,
              keys: body && typeof body === "object" ? Object.keys(body) : [],
              user_agent: req.headers["user-agent"],
            },
            "modal hook rejected: invalid payload"
          );
        },
      },
      async (
        req: FastifyRequest<{ Body: ModalHookBodyInput }>,
        reply: FastifyReply
      ): Promise<void> => {
        await controller.hook(req, reply);
      }
    );
  } else {
    log.debug("MODAL_HOOK_KEY unset — campaign webhook route not registered");
  }

  r.get(
    "/modals/next",
    {
      schema: {
        querystring: ModalsNextQuery,
        response: {
          200: ModalsNextResponse,
          400: ErrorEnvelope,
          401: ErrorEnvelope,
          500: ErrorEnvelope,
        },
      },
      preHandler: authMiddleware,
    },
    async (
      req: FastifyRequest<{ Querystring: ModalsNextQueryInput }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.next(req, reply);
    }
  );

  r.post(
    "/modals/impressions",
    {
      schema: {
        body: ModalImpressionBody,
        response: {
          200: ModalImpressionResponse,
          400: ErrorEnvelope,
          401: ErrorEnvelope,
          500: ErrorEnvelope,
        },
      },
      preHandler: authMiddleware,
    },
    async (
      req: FastifyRequest<{ Body: ModalImpressionBodyInput }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.impression(req, reply);
    }
  );
}
