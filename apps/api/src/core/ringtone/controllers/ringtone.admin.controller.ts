import type { FastifyReply, FastifyRequest } from "fastify";
import { sendSuccess } from "@api/shared/response";
import type { RingtoneAdminService } from "@api/core/ringtone/services";
import type {
  AdminRingtoneCreateInput,
  AdminRingtoneDeleteInput,
  AdminRingtoneIdParamsInput,
  AdminRingtoneListQueryInput,
  AdminRingtonePatchInput,
} from "@api/core/ringtone/routes/ringtone.admin.schemas";

/**
 * HTTP boundary for the `/admin/ringtones/*` surface (TAM-94).
 *
 * Thin — parse-validated input in, envelope out via `sendSuccess`; all business
 * logic and error semantics (404/409/slug-conflict, media + deity validation)
 * live in `RingtoneAdminService`. The guard pair (`authMiddleware` +
 * `adminMiddleware`) is applied centrally by `registerAdminRoute`, so these
 * handlers never touch auth. `req.user` is guaranteed populated by the time they
 * run.
 */
export class RingtoneAdminController {
  constructor(private readonly service: RingtoneAdminService) {}

  list = async (
    req: FastifyRequest<{ Querystring: AdminRingtoneListQueryInput }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const result = await this.service.list(req.query);
    return sendSuccess(reply, result, "OK");
  };

  getOne = async (
    req: FastifyRequest<{ Params: AdminRingtoneIdParamsInput }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const ringtone = await this.service.getById(req.params.id);
    return sendSuccess(reply, ringtone, "OK");
  };

  create = async (
    req: FastifyRequest<{ Body: AdminRingtoneCreateInput }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const ringtone = await this.service.create(req.body);
    return sendSuccess(reply, ringtone, "Ringtone created", 201);
  };

  update = async (
    req: FastifyRequest<{
      Params: AdminRingtoneIdParamsInput;
      Body: AdminRingtonePatchInput;
    }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const ringtone = await this.service.update(req.params.id, req.body);
    return sendSuccess(reply, ringtone, "Ringtone updated");
  };

  deactivate = async (
    req: FastifyRequest<{
      Params: AdminRingtoneIdParamsInput;
      Body: AdminRingtoneDeleteInput;
    }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const ringtone = await this.service.deactivate(
      req.params.id,
      req.body.expectedUpdatedAt
    );
    return sendSuccess(reply, ringtone, "Ringtone deactivated");
  };
}
