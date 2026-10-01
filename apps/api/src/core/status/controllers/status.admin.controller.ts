import type { FastifyReply, FastifyRequest } from "fastify";
import { sendSuccess } from "@api/shared/response";
import type { StatusAdminService } from "@api/core/status/services";
import type {
  AdminStatusIdParamsInput,
  AdminStatusItemCreateInput,
  AdminStatusItemDeleteInput,
  AdminStatusItemListQueryInput,
  AdminStatusItemPatchInput,
} from "@api/core/status/routes/status.admin.schemas";

/**
 * HTTP boundary for the `/admin/status/*` surface (TAM-98). Thin —
 * parse-validated input in, envelope out via `sendSuccess`; all business logic
 * and error semantics (404/409/media/deity validation) live in
 * `StatusAdminService`. The guard pair (`authMiddleware` + `adminMiddleware`) is
 * applied centrally by `registerAdminRoute`, so these handlers never touch auth;
 * `req.user` is guaranteed populated by the time they run.
 */
export class StatusAdminController {
  constructor(private readonly service: StatusAdminService) {}

  // ---- StatusItem ---------------------------------------------------------

  listItems = async (
    req: FastifyRequest<{ Querystring: AdminStatusItemListQueryInput }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const result = await this.service.listItems(req.query);
    return sendSuccess(reply, result, "OK");
  };

  getItem = async (
    req: FastifyRequest<{ Params: AdminStatusIdParamsInput }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const row = await this.service.getItemById(req.params.id);
    return sendSuccess(reply, row, "OK");
  };

  createItem = async (
    req: FastifyRequest<{ Body: AdminStatusItemCreateInput }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const row = await this.service.createItem(req.body);
    return sendSuccess(reply, row, "Status item created", 201);
  };

  updateItem = async (
    req: FastifyRequest<{
      Params: AdminStatusIdParamsInput;
      Body: AdminStatusItemPatchInput;
    }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const row = await this.service.updateItem(req.params.id, req.body);
    return sendSuccess(reply, row, "Status item updated");
  };

  deactivateItem = async (
    req: FastifyRequest<{
      Params: AdminStatusIdParamsInput;
      Body: AdminStatusItemDeleteInput;
    }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const row = await this.service.deactivateItem(
      req.params.id,
      req.body.expectedUpdatedAt
    );
    return sendSuccess(reply, row, "Status item deactivated");
  };

}
