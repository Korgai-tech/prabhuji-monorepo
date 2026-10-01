import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { registerAdminRoute } from "@api/core/auth/routes";
import {
  StatusAdminController,
  StatusPerformanceController,
} from "@api/core/status/controllers";
import type {
  StatusAdminService,
  StatusPerformanceService,
} from "@api/core/status/services";
import {
  AdminStatusIdParams,
  type AdminStatusIdParamsInput,
  AdminStatusItemCreateBody,
  type AdminStatusItemCreateInput,
  AdminStatusItemDeleteBody,
  type AdminStatusItemDeleteInput,
  AdminStatusItemListQuery,
  type AdminStatusItemListQueryInput,
  AdminStatusItemListResponse,
  AdminStatusItemPatchBody,
  type AdminStatusItemPatchInput,
  AdminStatusItemResponse,
  AdminStatusPerformanceDeityCsvQuery,
  type AdminStatusPerformanceDeityCsvQueryInput,
  AdminStatusPerformanceDeityListQuery,
  type AdminStatusPerformanceDeityListQueryInput,
  AdminStatusPerformanceDeityListResponse,
  AdminStatusPerformanceItemCsvQuery,
  type AdminStatusPerformanceItemCsvQueryInput,
  AdminStatusPerformanceItemListQuery,
  type AdminStatusPerformanceItemListQueryInput,
  AdminStatusPerformanceItemListResponse,
  ErrorEnvelope,
} from "./status.admin.schemas.js";

/**
 * The `/admin/status/*` write surface owned by the status module (TAM-98;
 * ADR §B5). Mounted on the module's own `/admin`-prefixed scope by
 * `initStatusModule`, deliberately SEPARATE from the public `/status/*` routes —
 * the mobile app's read contract must not churn to serve admin.
 *
 * **Every route goes through `registerAdminRoute`** — it applies
 * `[authMiddleware, adminMiddleware]` (fail-closed) and the `admin` OpenAPI tag
 * (which TAM-85 uses to keep these operations out of `openapi.public.json`). A
 * hand-rolled `r.post("/admin/…")` is a review-blocker.
 *
 * `UserStatusProfile` is USER-authored state holding PII (`businessMobileNumber`)
 * and is deliberately absent from this surface (#EXPORT_CRITICAL). Engagement
 * counts (`contentType: "status"`) live in the shared engagement module and are
 * never CRUD-able here.
 *
 * Route prefix `/admin/status/<entity>` — `status` is the ADR's module name,
 * matching the exemplar's `/admin/<module>/…` convention.
 */
export function registerStatusAdminRoutes(
  app: FastifyInstance,
  service: StatusAdminService
): void {
  const controller = new StatusAdminController(service);

  // =======================================================================
  // StatusItem — /admin/status/items
  // =======================================================================

  const items = "/status/items";

  registerAdminRoute(app, {
    method: "GET",
    url: items,
    schema: {
      querystring: AdminStatusItemListQuery,
      response: {
        200: AdminStatusItemListResponse,
        400: ErrorEnvelope,
        401: ErrorEnvelope,
        403: ErrorEnvelope,
        500: ErrorEnvelope,
      },
    },
    handler: async (
      req: FastifyRequest<{ Querystring: AdminStatusItemListQueryInput }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.listItems(req, reply);
    },
  });

  registerAdminRoute(app, {
    method: "POST",
    url: items,
    schema: {
      body: AdminStatusItemCreateBody,
      response: {
        201: AdminStatusItemResponse,
        400: ErrorEnvelope,
        401: ErrorEnvelope,
        403: ErrorEnvelope,
        409: ErrorEnvelope,
        500: ErrorEnvelope,
      },
    },
    handler: async (
      req: FastifyRequest<{ Body: AdminStatusItemCreateInput }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.createItem(req, reply);
    },
  });

  registerAdminRoute(app, {
    method: "GET",
    url: `${items}/:id`,
    schema: {
      params: AdminStatusIdParams,
      response: {
        200: AdminStatusItemResponse,
        401: ErrorEnvelope,
        403: ErrorEnvelope,
        404: ErrorEnvelope,
        500: ErrorEnvelope,
      },
    },
    handler: async (
      req: FastifyRequest<{ Params: AdminStatusIdParamsInput }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.getItem(req, reply);
    },
  });

  registerAdminRoute(app, {
    method: "PATCH",
    url: `${items}/:id`,
    schema: {
      params: AdminStatusIdParams,
      body: AdminStatusItemPatchBody,
      response: {
        200: AdminStatusItemResponse,
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
        Params: AdminStatusIdParamsInput;
        Body: AdminStatusItemPatchInput;
      }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.updateItem(req, reply);
    },
  });

  // DELETE = deactivate (`isActive = false`), NEVER a hard delete (ADR §C4).
  registerAdminRoute(app, {
    method: "DELETE",
    url: `${items}/:id`,
    schema: {
      params: AdminStatusIdParams,
      body: AdminStatusItemDeleteBody,
      response: {
        200: AdminStatusItemResponse,
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
        Params: AdminStatusIdParamsInput;
        Body: AdminStatusItemDeleteInput;
      }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.deactivateItem(req, reply);
    },
  });

}

/**
 * The read-only `/admin/status/performance/*` report surface (TAM-256).
 *
 * Registered separately from the write surface above because it is a different
 * kind of thing: no bodies, no preconditions, no 409s — four GETs. Every one
 * still goes through `registerAdminRoute`, which is what keeps these schemas
 * out of `openapi.public.json` and therefore out of the APK.
 *
 * The `.csv` routes deliberately share the SERVICE with their list twins rather
 * than re-deriving anything, so an export and the screen it was taken from
 * cannot disagree.
 */
export function registerStatusPerformanceRoutes(
  app: FastifyInstance,
  service: StatusPerformanceService
): void {
  const controller = new StatusPerformanceController(service);
  const errors = {
    400: ErrorEnvelope,
    401: ErrorEnvelope,
    403: ErrorEnvelope,
    500: ErrorEnvelope,
  };

  registerAdminRoute(app, {
    method: "GET",
    url: "/status/performance/items",
    schema: {
      querystring: AdminStatusPerformanceItemListQuery,
      response: { 200: AdminStatusPerformanceItemListResponse, ...errors },
    },
    handler: async (
      req: FastifyRequest<{ Querystring: AdminStatusPerformanceItemListQueryInput }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.listByItem(req, reply);
    },
  });

  registerAdminRoute(app, {
    method: "GET",
    url: "/status/performance/deities",
    schema: {
      querystring: AdminStatusPerformanceDeityListQuery,
      response: { 200: AdminStatusPerformanceDeityListResponse, ...errors },
    },
    handler: async (
      req: FastifyRequest<{ Querystring: AdminStatusPerformanceDeityListQueryInput }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.listByDeity(req, reply);
    },
  });

  registerAdminRoute(app, {
    method: "GET",
    url: "/status/performance/items.csv",
    schema: {
      querystring: AdminStatusPerformanceItemCsvQuery,
      response: { 503: ErrorEnvelope, ...errors },
    },
    handler: async (
      req: FastifyRequest<{ Querystring: AdminStatusPerformanceItemCsvQueryInput }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.exportItemsCsv(req, reply);
    },
  });

  registerAdminRoute(app, {
    method: "GET",
    url: "/status/performance/deities.csv",
    schema: {
      querystring: AdminStatusPerformanceDeityCsvQuery,
      response: { 503: ErrorEnvelope, ...errors },
    },
    handler: async (
      req: FastifyRequest<{ Querystring: AdminStatusPerformanceDeityCsvQueryInput }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.exportDeitiesCsv(req, reply);
    },
  });
}
