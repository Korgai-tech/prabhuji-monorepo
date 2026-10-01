import type { FastifyReply, FastifyRequest } from "fastify";
import { sendSuccess } from "@api/shared/response";
import type { DeityAdminService } from "@api/core/deity/services";
import type {
  AdminDeityCreateInput,
  AdminDeityDeleteInput,
  AdminDeityIdParamsInput,
  AdminDeityListQueryInput,
  AdminDeityPatchInput,
} from "@api/core/deity/routes/deity.admin.schemas";

/**
 * HTTP boundary for the `/admin/taxonomy/deities/*` surface (TAM-88).
 *
 * Thin — parse-validated input in, envelope out via `sendSuccess`; all
 * business logic and error semantics (404/409/slug-conflict) live in
 * `DeityAdminService`. The guard pair (`authMiddleware` + `adminMiddleware`)
 * is applied centrally by `registerAdminRoute`, so these handlers never touch
 * auth. `req.user` is guaranteed populated by the time they run.
 */
export class DeityAdminController {
  constructor(private readonly service: DeityAdminService) {}

  list = async (
    req: FastifyRequest<{ Querystring: AdminDeityListQueryInput }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const { page, pageSize, sort, order, q, active } = req.query;
    const result = await this.service.list({ page, pageSize, sort, order, q, active });
    return sendSuccess(reply, result, "OK");
  };

  getOne = async (
    req: FastifyRequest<{ Params: AdminDeityIdParamsInput }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const deity = await this.service.getById(req.params.id);
    return sendSuccess(reply, deity, "OK");
  };

  create = async (
    req: FastifyRequest<{ Body: AdminDeityCreateInput }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const deity = await this.service.create(req.body);
    return sendSuccess(reply, deity, "Deity created", 201);
  };

  update = async (
    req: FastifyRequest<{
      Params: AdminDeityIdParamsInput;
      Body: AdminDeityPatchInput;
    }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const deity = await this.service.update(req.params.id, req.body);
    return sendSuccess(reply, deity, "Deity updated");
  };

  deactivate = async (
    req: FastifyRequest<{
      Params: AdminDeityIdParamsInput;
      Body: AdminDeityDeleteInput;
    }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const deity = await this.service.deactivate(
      req.params.id,
      req.body.expectedUpdatedAt
    );
    return sendSuccess(reply, deity, "Deity deactivated");
  };
}
