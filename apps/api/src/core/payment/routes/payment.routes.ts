import type { FastifyInstance } from "fastify";
import { authMiddleware } from "@api/core/auth/middleware";
import { PAYMENT_CALLBACK_ROUTE } from "@api/core/payment/constants.js";
import type { PaymentController } from "@api/core/payment/controllers/payment.controller.js";
import type { PaymentCallbackController } from "@api/core/payment/controllers/payment.callback.controller.js";
import {
  CallbackAckData,
  CreateMandateBody,
  ErrorEnvelope,
  MandateData,
  ProviderCallbackBody,
  envelope,
} from "./payment.schemas.js";

/**
 * User-facing payment routes. All JWT-scoped — every one acts on the caller's
 * own subscription and takes no user id, so there is no way to address
 * someone else's mandate.
 */
export function registerPaymentRoutes(
  app: FastifyInstance,
  controller: PaymentController
): void {
  app.post(
    "/mandate",
    {
      schema: {
        body: CreateMandateBody,
        response: {
          200: envelope(MandateData),
          400: ErrorEnvelope,
          401: ErrorEnvelope,
          409: ErrorEnvelope,
          502: ErrorEnvelope,
        },
      },
      preHandler: authMiddleware,
    },
    async (req, reply) => {
      await controller.createMandate(
        req as Parameters<typeof controller.createMandate>[0],
        reply
      );
    }
  );

  app.get(
    "/mandate",
    {
      schema: {
        response: {
          // Nullable: "never started a mandate" is a normal state the client
          // renders as the plain paywall, not an error.
          200: envelope(MandateData.nullable()),
          401: ErrorEnvelope,
          500: ErrorEnvelope,
        },
      },
      preHandler: authMiddleware,
    },
    async (req, reply) => {
      await controller.getMandate(req, reply);
    }
  );

  app.post(
    "/mandate/cancel",
    {
      schema: {
        response: {
          200: envelope(MandateData),
          401: ErrorEnvelope,
          404: ErrorEnvelope,
          502: ErrorEnvelope,
        },
      },
      preHandler: authMiddleware,
    },
    async (req, reply) => {
      await controller.cancelMandate(req, reply);
    }
  );
}

/**
 * The single provider-callback route: `POST /payment/callbacks/:provider`.
 *
 * One endpoint for every gateway, differentiated by the `:provider` path
 * parameter (Front Controller); the controller resolves it against the active
 * gateway and 404s any other. Adding a gateway wires no new route.
 *
 * PUBLIC — providers have no JWT — so `authMiddleware` is omitted, matching how
 * the OTP routes declare themselves public. Authentication is per-gateway
 * (static token+IP for Decentro, HMAC for Cashfree), performed by the gateway's
 * `CallbackAuthenticator` inside the controller.
 *
 * `hide: true` keeps this out of BOTH `openapi.json` and `openapi.public.json`.
 * That matters concretely: the Dart generator emits a model per schema in the
 * document, so without this the callback payload shape would ship inside the
 * Android APK. It cannot instead be tagged `admin` (the usual exclusion route)
 * because the tag⇔path invariant hard-fails the build for an `admin`-tagged
 * route not under `/admin/`.
 *
 * Zod body validation still runs — `hide` only affects the emitted document,
 * not the validator compiler. The body schema is permissive (`.loose()`), so a
 * vendor field/type change never 400s a webhook.
 */
export function registerPaymentCallbackRoutes(
  app: FastifyInstance,
  controller: PaymentCallbackController
): void {
  app.post(
    PAYMENT_CALLBACK_ROUTE,
    {
      schema: {
        hide: true,
        body: ProviderCallbackBody,
        response: {
          200: envelope(CallbackAckData),
          401: ErrorEnvelope,
        },
      },
    },
    async (req, reply) => {
      await controller.handle(
        req as Parameters<typeof controller.handle>[0],
        reply
      );
    }
  );
}
