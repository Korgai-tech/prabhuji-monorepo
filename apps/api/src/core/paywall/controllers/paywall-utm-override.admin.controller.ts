import type { FastifyReply, FastifyRequest } from "fastify";
import { sendSuccess } from "@api/shared/response";
import type { PaywallUtmOverrideAdminService } from "@api/core/paywall/services";
import type {
  AdminUtmOverrideCreateInput,
  AdminUtmOverrideParamsInput,
  AdminUtmOverridePatchInput,
} from "@api/core/paywall/routes/paywall-utm-override.admin.schemas";

/**
 * HTTP boundary for `/admin/paywall/utm-overrides/*`. Thin, like its sibling:
 * parse-validated input in, envelope out. 404/409, media validation and cache
 * invalidation all live in `PaywallUtmOverrideAdminService`; the auth pair is
 * applied centrally by `registerAdminRoute`.
 */
export class PaywallUtmOverrideAdminController {
  constructor(private readonly service: PaywallUtmOverrideAdminService) {}

  list = async (_req: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
    return sendSuccess(reply, await this.service.list(), "OK");
  };

  get = async (
    req: FastifyRequest<{ Params: AdminUtmOverrideParamsInput }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    return sendSuccess(reply, await this.service.read(req.params.id), "OK");
  };

  create = async (
    req: FastifyRequest<{ Body: AdminUtmOverrideCreateInput }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const data = await this.service.create(req.body);
    return sendSuccess(reply, data, "Override created", 201);
  };

  update = async (
    req: FastifyRequest<{
      Params: AdminUtmOverrideParamsInput;
      Body: AdminUtmOverridePatchInput;
    }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const data = await this.service.update(req.params.id, req.body);
    return sendSuccess(reply, data, "Override updated");
  };

  remove = async (
    req: FastifyRequest<{ Params: AdminUtmOverrideParamsInput }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    await this.service.remove(req.params.id);
    return sendSuccess(reply, null, "Override deleted");
  };
}
