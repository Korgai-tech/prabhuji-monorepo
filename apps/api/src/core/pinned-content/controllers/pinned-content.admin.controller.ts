import type { FastifyReply, FastifyRequest } from "fastify";
import { sendSuccess } from "@api/shared/response";
import { AppError } from "@api/shared/errors";
import type { PinnedContentService } from "@api/core/pinned-content/services";
import type {
  AdminPinCreateInput,
  AdminPinDeleteInput,
  AdminPinIdParamsInput,
  AdminPinListQueryInput,
  AdminPinPatchInput,
  AdminPinRestoreInput,
} from "@api/core/pinned-content/routes/pinned-content.admin.schemas";

/**
 * HTTP boundary for `/admin/pinned-content/*` (TAM-173).
 *
 * Thin — parses Zod-validated input, resolves the actor from `req.user`
 * (populated by `authMiddleware`, which the shared `registerAdminRoute` runs
 * BEFORE Zod validation so an unauthenticated request never reaches this
 * handler), calls the service, and sends the envelope via `sendSuccess`. All
 * business logic and 400/404/409 error semantics live in the service.
 *
 * `created_by` / `updated_by` are ALWAYS the JWT subject — never taken from
 * the request body. That is a security invariant, not a convention.
 */
export class PinnedContentAdminController {
  constructor(private readonly service: PinnedContentService) {}

  private actorId(req: FastifyRequest): string {
    const user = req.user;
    if (!user?.id) {
      // adminMiddleware would have refused earlier — this is defence in depth
      // and should never fire.
      throw new AppError("Missing admin identity", 401, "UNAUTHORIZED");
    }
    return user.id;
  }

  list = async (
    req: FastifyRequest<{ Querystring: AdminPinListQueryInput }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const { page, pageSize, surface, deitySlug, active } = req.query;
    const result = await this.service.list({
      page,
      pageSize,
      surface,
      deitySlug,
      active,
    });
    return sendSuccess(reply, result, "OK");
  };

  getOne = async (
    req: FastifyRequest<{ Params: AdminPinIdParamsInput }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const row = await this.service.getById(req.params.id);
    return sendSuccess(reply, row, "OK");
  };

  create = async (
    req: FastifyRequest<{ Body: AdminPinCreateInput }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const actor = this.actorId(req);
    const row = await this.service.create(req.body, actor);
    return sendSuccess(reply, row, "Pin created", 201);
  };

  update = async (
    req: FastifyRequest<{
      Params: AdminPinIdParamsInput;
      Body: AdminPinPatchInput;
    }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const actor = this.actorId(req);
    const row = await this.service.update(req.params.id, req.body, actor);
    return sendSuccess(reply, row, "Pin updated");
  };

  softDelete = async (
    req: FastifyRequest<{
      Params: AdminPinIdParamsInput;
      Body: AdminPinDeleteInput;
    }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const actor = this.actorId(req);
    const row = await this.service.softDelete(
      req.params.id,
      req.body,
      actor
    );
    return sendSuccess(reply, row, "Pin deleted");
  };

  restore = async (
    req: FastifyRequest<{
      Params: AdminPinIdParamsInput;
      Body: AdminPinRestoreInput;
    }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const actor = this.actorId(req);
    const row = await this.service.restore(req.params.id, req.body, actor);
    return sendSuccess(reply, row, "Pin restored");
  };

  audit = async (
    req: FastifyRequest<{ Params: AdminPinIdParamsInput }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const entries = await this.service.listAudit(req.params.id);
    return sendSuccess(reply, entries, "OK");
  };
}
