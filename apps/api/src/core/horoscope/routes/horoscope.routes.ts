import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { authMiddleware } from "@api/core/auth/middleware";
import { HoroscopeController } from "@api/core/horoscope/controllers";
import type { HoroscopeService } from "@api/core/horoscope/services";
import {
  DailyQuery,
  type DailyQueryInput,
  DailyResponse,
  ErrorEnvelope,
  ZodiacSignsQuery,
  type ZodiacSignsQueryInput,
  ZodiacSignsResponse,
} from "./horoscope.schemas.js";

/**
 * Register the Horoscope routes under `/horoscope` (TAM-73). Both routes are
 * JWT-guarded (`authMiddleware`). `/horoscope/zodiac-signs` is FREE (discovery —
 * no Pro gate); `/horoscope/daily` is Pro-GATED server-side in the service (free
 * → `403`, no step payload).
 *
 * Full paths are declared here (no nested prefix) so the emitted OpenAPI paths
 * are exactly `/horoscope/zodiac-signs` and `/horoscope/daily`.
 */
export function registerHoroscopeRoutes(
  app: FastifyInstance,
  service: HoroscopeService
): void {
  const controller = new HoroscopeController(service);
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    "/horoscope/zodiac-signs",
    {
      schema: {
        querystring: ZodiacSignsQuery,
        response: {
          200: ZodiacSignsResponse,
          400: ErrorEnvelope,
          401: ErrorEnvelope,
          500: ErrorEnvelope,
        },
      },
      preHandler: authMiddleware,
    },
    async (
      req: FastifyRequest<{ Querystring: ZodiacSignsQueryInput }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.getZodiacSigns(req, reply);
    }
  );

  r.get(
    "/horoscope/daily",
    {
      schema: {
        querystring: DailyQuery,
        response: {
          200: DailyResponse,
          400: ErrorEnvelope,
          401: ErrorEnvelope,
          403: ErrorEnvelope,
          404: ErrorEnvelope,
          409: ErrorEnvelope,
          500: ErrorEnvelope,
        },
      },
      preHandler: authMiddleware,
    },
    async (
      req: FastifyRequest<{ Querystring: DailyQueryInput }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.getDaily(req, reply);
    }
  );
}
