import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { registerAdminRoute } from "@api/core/auth/routes";
import { HoroscopeAdminController } from "@api/core/horoscope/controllers";
import type { HoroscopeAdminService } from "@api/core/horoscope/services";
import {
  AdminHoroscopeIdParams,
  type AdminHoroscopeIdParamsInput,
  AdminMediaAssetCreateBody,
  type AdminMediaAssetCreateInput,
  AdminMediaAssetListQuery,
  type AdminMediaAssetListQueryInput,
  AdminMediaAssetListResponse,
  AdminMediaAssetPatchBody,
  type AdminMediaAssetPatchInput,
  AdminMediaAssetResponse,
  AdminModeCreateBody,
  type AdminModeCreateInput,
  AdminModeDeleteBody,
  type AdminModeDeleteInput,
  AdminModeListQuery,
  type AdminModeListQueryInput,
  AdminModeListResponse,
  AdminModePatchBody,
  type AdminModePatchInput,
  AdminModeResponse,
  AdminResultCreateBody,
  type AdminResultCreateInput,
  AdminResultDeleteBody,
  type AdminResultDeleteInput,
  AdminResultDeleteResponse,
  AdminResultListQuery,
  type AdminResultListQueryInput,
  AdminResultListResponse,
  AdminResultPatchBody,
  type AdminResultPatchInput,
  AdminResultResponse,
  AdminStepCreateBody,
  type AdminStepCreateInput,
  AdminStepDeleteBody,
  type AdminStepDeleteInput,
  AdminStepListQuery,
  type AdminStepListQueryInput,
  AdminStepListResponse,
  AdminStepPatchBody,
  type AdminStepPatchInput,
  AdminStepResponse,
  AdminZodiacCreateBody,
  type AdminZodiacCreateInput,
  AdminZodiacDeleteBody,
  type AdminZodiacDeleteInput,
  AdminZodiacListQuery,
  type AdminZodiacListQueryInput,
  AdminZodiacListResponse,
  AdminZodiacPatchBody,
  type AdminZodiacPatchInput,
  AdminZodiacResponse,
  ErrorEnvelope,
} from "./horoscope.admin.schemas.js";

/**
 * The `/admin/horoscope/*` write surface owned by the horoscope module
 * (TAM-100; ADR §B5). Mounted on the module's own `/admin`-prefixed scope by
 * `initHoroscopeModule`, deliberately SEPARATE from the public `/horoscope/*`
 * routes — the mobile app's read contract must not churn to serve admin, and
 * the public provider read contract is untouched.
 *
 * **Every route goes through `registerAdminRoute`** — it applies
 * `[authMiddleware, adminMiddleware]` (fail-closed) and the `admin` OpenAPI tag
 * (which keeps these operations out of `openapi.public.json` and the mobile
 * Dart codegen).
 *
 * Delete semantics differ by entity (TAM-100 AC (f)/(g)):
 *   - `ZodiacSign`/`HoroscopeMode`/`HoroscopeStepConfig` DELETE = **deactivate**
 *     (`enabled = false`), reversible via `PATCH { enabled: true }`;
 *   - `DailyHoroscopeResult` DELETE = **genuine HARD delete** (dated leaf
 *     content; #PATH_DECISION);
 *   - `MediaAsset` exposes **NO DELETE** (deleting a row breaks the result
 *     background with no fallback; editors update, they do not delete).
 */
export function registerHoroscopeAdminRoutes(
  app: FastifyInstance,
  service: HoroscopeAdminService
): void {
  const c = new HoroscopeAdminController(service);

  // =======================================================================
  // ZodiacSign — /admin/horoscope/zodiac-signs (DELETE = deactivate)
  // =======================================================================

  const zodiac = "/horoscope/zodiac-signs";

  registerAdminRoute(app, {
    method: "GET",
    url: zodiac,
    schema: {
      querystring: AdminZodiacListQuery,
      response: {
        200: AdminZodiacListResponse,
        400: ErrorEnvelope,
        401: ErrorEnvelope,
        403: ErrorEnvelope,
        500: ErrorEnvelope,
      },
    },
    handler: async (
      req: FastifyRequest<{ Querystring: AdminZodiacListQueryInput }>,
      reply: FastifyReply
    ): Promise<void> => {
      await c.listZodiac(req, reply);
    },
  });

  registerAdminRoute(app, {
    method: "POST",
    url: zodiac,
    schema: {
      body: AdminZodiacCreateBody,
      response: {
        201: AdminZodiacResponse,
        400: ErrorEnvelope,
        401: ErrorEnvelope,
        403: ErrorEnvelope,
        409: ErrorEnvelope,
        500: ErrorEnvelope,
      },
    },
    handler: async (
      req: FastifyRequest<{ Body: AdminZodiacCreateInput }>,
      reply: FastifyReply
    ): Promise<void> => {
      await c.createZodiac(req, reply);
    },
  });

  registerAdminRoute(app, {
    method: "GET",
    url: `${zodiac}/:id`,
    schema: {
      params: AdminHoroscopeIdParams,
      response: {
        200: AdminZodiacResponse,
        401: ErrorEnvelope,
        403: ErrorEnvelope,
        404: ErrorEnvelope,
        500: ErrorEnvelope,
      },
    },
    handler: async (
      req: FastifyRequest<{ Params: AdminHoroscopeIdParamsInput }>,
      reply: FastifyReply
    ): Promise<void> => {
      await c.getZodiac(req, reply);
    },
  });

  registerAdminRoute(app, {
    method: "PATCH",
    url: `${zodiac}/:id`,
    schema: {
      params: AdminHoroscopeIdParams,
      body: AdminZodiacPatchBody,
      response: {
        200: AdminZodiacResponse,
        400: ErrorEnvelope,
        401: ErrorEnvelope,
        403: ErrorEnvelope,
        404: ErrorEnvelope,
        409: ErrorEnvelope,
        500: ErrorEnvelope,
      },
    },
    handler: async (
      req: FastifyRequest<{
        Params: AdminHoroscopeIdParamsInput;
        Body: AdminZodiacPatchInput;
      }>,
      reply: FastifyReply
    ): Promise<void> => {
      await c.updateZodiac(req, reply);
    },
  });

  registerAdminRoute(app, {
    method: "DELETE",
    url: `${zodiac}/:id`,
    schema: {
      params: AdminHoroscopeIdParams,
      body: AdminZodiacDeleteBody,
      response: {
        200: AdminZodiacResponse,
        400: ErrorEnvelope,
        401: ErrorEnvelope,
        403: ErrorEnvelope,
        404: ErrorEnvelope,
        409: ErrorEnvelope,
        500: ErrorEnvelope,
      },
    },
    handler: async (
      req: FastifyRequest<{
        Params: AdminHoroscopeIdParamsInput;
        Body: AdminZodiacDeleteInput;
      }>,
      reply: FastifyReply
    ): Promise<void> => {
      await c.deactivateZodiac(req, reply);
    },
  });

  // =======================================================================
  // HoroscopeMode — /admin/horoscope/modes (DELETE = deactivate)
  // =======================================================================

  const modes = "/horoscope/modes";

  registerAdminRoute(app, {
    method: "GET",
    url: modes,
    schema: {
      querystring: AdminModeListQuery,
      response: {
        200: AdminModeListResponse,
        400: ErrorEnvelope,
        401: ErrorEnvelope,
        403: ErrorEnvelope,
        500: ErrorEnvelope,
      },
    },
    handler: async (
      req: FastifyRequest<{ Querystring: AdminModeListQueryInput }>,
      reply: FastifyReply
    ): Promise<void> => {
      await c.listModes(req, reply);
    },
  });

  registerAdminRoute(app, {
    method: "POST",
    url: modes,
    schema: {
      body: AdminModeCreateBody,
      response: {
        201: AdminModeResponse,
        400: ErrorEnvelope,
        401: ErrorEnvelope,
        403: ErrorEnvelope,
        409: ErrorEnvelope,
        500: ErrorEnvelope,
      },
    },
    handler: async (
      req: FastifyRequest<{ Body: AdminModeCreateInput }>,
      reply: FastifyReply
    ): Promise<void> => {
      await c.createMode(req, reply);
    },
  });

  registerAdminRoute(app, {
    method: "GET",
    url: `${modes}/:id`,
    schema: {
      params: AdminHoroscopeIdParams,
      response: {
        200: AdminModeResponse,
        401: ErrorEnvelope,
        403: ErrorEnvelope,
        404: ErrorEnvelope,
        500: ErrorEnvelope,
      },
    },
    handler: async (
      req: FastifyRequest<{ Params: AdminHoroscopeIdParamsInput }>,
      reply: FastifyReply
    ): Promise<void> => {
      await c.getMode(req, reply);
    },
  });

  registerAdminRoute(app, {
    method: "PATCH",
    url: `${modes}/:id`,
    schema: {
      params: AdminHoroscopeIdParams,
      body: AdminModePatchBody,
      response: {
        200: AdminModeResponse,
        400: ErrorEnvelope,
        401: ErrorEnvelope,
        403: ErrorEnvelope,
        404: ErrorEnvelope,
        409: ErrorEnvelope,
        500: ErrorEnvelope,
      },
    },
    handler: async (
      req: FastifyRequest<{
        Params: AdminHoroscopeIdParamsInput;
        Body: AdminModePatchInput;
      }>,
      reply: FastifyReply
    ): Promise<void> => {
      await c.updateMode(req, reply);
    },
  });

  registerAdminRoute(app, {
    method: "DELETE",
    url: `${modes}/:id`,
    schema: {
      params: AdminHoroscopeIdParams,
      body: AdminModeDeleteBody,
      response: {
        200: AdminModeResponse,
        400: ErrorEnvelope,
        401: ErrorEnvelope,
        403: ErrorEnvelope,
        404: ErrorEnvelope,
        409: ErrorEnvelope,
        500: ErrorEnvelope,
      },
    },
    handler: async (
      req: FastifyRequest<{
        Params: AdminHoroscopeIdParamsInput;
        Body: AdminModeDeleteInput;
      }>,
      reply: FastifyReply
    ): Promise<void> => {
      await c.deactivateMode(req, reply);
    },
  });

  // =======================================================================
  // HoroscopeStepConfig — /admin/horoscope/steps (DELETE = deactivate)
  // =======================================================================

  const steps = "/horoscope/steps";

  registerAdminRoute(app, {
    method: "GET",
    url: steps,
    schema: {
      querystring: AdminStepListQuery,
      response: {
        200: AdminStepListResponse,
        400: ErrorEnvelope,
        401: ErrorEnvelope,
        403: ErrorEnvelope,
        500: ErrorEnvelope,
      },
    },
    handler: async (
      req: FastifyRequest<{ Querystring: AdminStepListQueryInput }>,
      reply: FastifyReply
    ): Promise<void> => {
      await c.listSteps(req, reply);
    },
  });

  registerAdminRoute(app, {
    method: "POST",
    url: steps,
    schema: {
      body: AdminStepCreateBody,
      response: {
        201: AdminStepResponse,
        400: ErrorEnvelope,
        401: ErrorEnvelope,
        403: ErrorEnvelope,
        409: ErrorEnvelope,
        500: ErrorEnvelope,
      },
    },
    handler: async (
      req: FastifyRequest<{ Body: AdminStepCreateInput }>,
      reply: FastifyReply
    ): Promise<void> => {
      await c.createStep(req, reply);
    },
  });

  registerAdminRoute(app, {
    method: "GET",
    url: `${steps}/:id`,
    schema: {
      params: AdminHoroscopeIdParams,
      response: {
        200: AdminStepResponse,
        401: ErrorEnvelope,
        403: ErrorEnvelope,
        404: ErrorEnvelope,
        500: ErrorEnvelope,
      },
    },
    handler: async (
      req: FastifyRequest<{ Params: AdminHoroscopeIdParamsInput }>,
      reply: FastifyReply
    ): Promise<void> => {
      await c.getStep(req, reply);
    },
  });

  registerAdminRoute(app, {
    method: "PATCH",
    url: `${steps}/:id`,
    schema: {
      params: AdminHoroscopeIdParams,
      body: AdminStepPatchBody,
      response: {
        200: AdminStepResponse,
        400: ErrorEnvelope,
        401: ErrorEnvelope,
        403: ErrorEnvelope,
        404: ErrorEnvelope,
        409: ErrorEnvelope,
        500: ErrorEnvelope,
      },
    },
    handler: async (
      req: FastifyRequest<{
        Params: AdminHoroscopeIdParamsInput;
        Body: AdminStepPatchInput;
      }>,
      reply: FastifyReply
    ): Promise<void> => {
      await c.updateStep(req, reply);
    },
  });

  registerAdminRoute(app, {
    method: "DELETE",
    url: `${steps}/:id`,
    schema: {
      params: AdminHoroscopeIdParams,
      body: AdminStepDeleteBody,
      response: {
        200: AdminStepResponse,
        400: ErrorEnvelope,
        401: ErrorEnvelope,
        403: ErrorEnvelope,
        404: ErrorEnvelope,
        409: ErrorEnvelope,
        500: ErrorEnvelope,
      },
    },
    handler: async (
      req: FastifyRequest<{
        Params: AdminHoroscopeIdParamsInput;
        Body: AdminStepDeleteInput;
      }>,
      reply: FastifyReply
    ): Promise<void> => {
      await c.deactivateStep(req, reply);
    },
  });

  // =======================================================================
  // DailyHoroscopeResult — /admin/horoscope/results (DELETE = HARD delete)
  // =======================================================================

  const results = "/horoscope/results";

  registerAdminRoute(app, {
    method: "GET",
    url: results,
    schema: {
      querystring: AdminResultListQuery,
      response: {
        200: AdminResultListResponse,
        400: ErrorEnvelope,
        401: ErrorEnvelope,
        403: ErrorEnvelope,
        500: ErrorEnvelope,
      },
    },
    handler: async (
      req: FastifyRequest<{ Querystring: AdminResultListQueryInput }>,
      reply: FastifyReply
    ): Promise<void> => {
      await c.listResults(req, reply);
    },
  });

  registerAdminRoute(app, {
    method: "POST",
    url: results,
    schema: {
      body: AdminResultCreateBody,
      response: {
        201: AdminResultResponse,
        400: ErrorEnvelope,
        401: ErrorEnvelope,
        403: ErrorEnvelope,
        409: ErrorEnvelope,
        500: ErrorEnvelope,
      },
    },
    handler: async (
      req: FastifyRequest<{ Body: AdminResultCreateInput }>,
      reply: FastifyReply
    ): Promise<void> => {
      await c.createResult(req, reply);
    },
  });

  registerAdminRoute(app, {
    method: "GET",
    url: `${results}/:id`,
    schema: {
      params: AdminHoroscopeIdParams,
      response: {
        200: AdminResultResponse,
        401: ErrorEnvelope,
        403: ErrorEnvelope,
        404: ErrorEnvelope,
        500: ErrorEnvelope,
      },
    },
    handler: async (
      req: FastifyRequest<{ Params: AdminHoroscopeIdParamsInput }>,
      reply: FastifyReply
    ): Promise<void> => {
      await c.getResult(req, reply);
    },
  });

  registerAdminRoute(app, {
    method: "PATCH",
    url: `${results}/:id`,
    schema: {
      params: AdminHoroscopeIdParams,
      body: AdminResultPatchBody,
      response: {
        200: AdminResultResponse,
        400: ErrorEnvelope,
        401: ErrorEnvelope,
        403: ErrorEnvelope,
        404: ErrorEnvelope,
        409: ErrorEnvelope,
        500: ErrorEnvelope,
      },
    },
    handler: async (
      req: FastifyRequest<{
        Params: AdminHoroscopeIdParamsInput;
        Body: AdminResultPatchInput;
      }>,
      reply: FastifyReply
    ): Promise<void> => {
      await c.updateResult(req, reply);
    },
  });

  // Genuine HARD delete — dated leaf content, no liveness flag, nothing
  // references it (TAM-100 #PATH_DECISION). Carries the `updatedAt` precondition.
  registerAdminRoute(app, {
    method: "DELETE",
    url: `${results}/:id`,
    schema: {
      params: AdminHoroscopeIdParams,
      body: AdminResultDeleteBody,
      response: {
        200: AdminResultDeleteResponse,
        400: ErrorEnvelope,
        401: ErrorEnvelope,
        403: ErrorEnvelope,
        404: ErrorEnvelope,
        409: ErrorEnvelope,
        500: ErrorEnvelope,
      },
    },
    handler: async (
      req: FastifyRequest<{
        Params: AdminHoroscopeIdParamsInput;
        Body: AdminResultDeleteInput;
      }>,
      reply: FastifyReply
    ): Promise<void> => {
      await c.deleteResult(req, reply);
    },
  });

  // =======================================================================
  // MediaAsset — /admin/horoscope/media-assets (NO DELETE exposed)
  // =======================================================================

  const mediaAssets = "/horoscope/media-assets";

  registerAdminRoute(app, {
    method: "GET",
    url: mediaAssets,
    schema: {
      querystring: AdminMediaAssetListQuery,
      response: {
        200: AdminMediaAssetListResponse,
        400: ErrorEnvelope,
        401: ErrorEnvelope,
        403: ErrorEnvelope,
        500: ErrorEnvelope,
      },
    },
    handler: async (
      req: FastifyRequest<{ Querystring: AdminMediaAssetListQueryInput }>,
      reply: FastifyReply
    ): Promise<void> => {
      await c.listMediaAssets(req, reply);
    },
  });

  registerAdminRoute(app, {
    method: "POST",
    url: mediaAssets,
    schema: {
      body: AdminMediaAssetCreateBody,
      response: {
        201: AdminMediaAssetResponse,
        400: ErrorEnvelope,
        401: ErrorEnvelope,
        403: ErrorEnvelope,
        409: ErrorEnvelope,
        500: ErrorEnvelope,
      },
    },
    handler: async (
      req: FastifyRequest<{ Body: AdminMediaAssetCreateInput }>,
      reply: FastifyReply
    ): Promise<void> => {
      await c.createMediaAsset(req, reply);
    },
  });

  registerAdminRoute(app, {
    method: "GET",
    url: `${mediaAssets}/:id`,
    schema: {
      params: AdminHoroscopeIdParams,
      response: {
        200: AdminMediaAssetResponse,
        401: ErrorEnvelope,
        403: ErrorEnvelope,
        404: ErrorEnvelope,
        500: ErrorEnvelope,
      },
    },
    handler: async (
      req: FastifyRequest<{ Params: AdminHoroscopeIdParamsInput }>,
      reply: FastifyReply
    ): Promise<void> => {
      await c.getMediaAsset(req, reply);
    },
  });

  registerAdminRoute(app, {
    method: "PATCH",
    url: `${mediaAssets}/:id`,
    schema: {
      params: AdminHoroscopeIdParams,
      body: AdminMediaAssetPatchBody,
      response: {
        200: AdminMediaAssetResponse,
        400: ErrorEnvelope,
        401: ErrorEnvelope,
        403: ErrorEnvelope,
        404: ErrorEnvelope,
        409: ErrorEnvelope,
        500: ErrorEnvelope,
      },
    },
    handler: async (
      req: FastifyRequest<{
        Params: AdminHoroscopeIdParamsInput;
        Body: AdminMediaAssetPatchInput;
      }>,
      reply: FastifyReply
    ): Promise<void> => {
      await c.updateMediaAsset(req, reply);
    },
  });
}
