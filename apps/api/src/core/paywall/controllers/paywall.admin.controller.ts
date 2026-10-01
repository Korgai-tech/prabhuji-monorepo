import type { FastifyReply, FastifyRequest } from "fastify";
import { sendSuccess } from "@api/shared/response";
import type { PaywallAdminService } from "@api/core/paywall/services";
import type {
  AdminPaywallConfigParamsInput,
  AdminPaywallConfigPatchInput,
} from "@api/core/paywall/routes/paywall.admin.schemas";

/**
 * HTTP boundary for the `/admin/paywall/*` surface (TAM-159). Thin —
 * parse-validated input in, envelope out via `sendSuccess`; all business logic
 * and error semantics (404/409, the server-side diff, media validation, cache
 * invalidation) live in `PaywallAdminService`. The guard pair
 * (`authMiddleware` + `adminMiddleware`) is applied centrally by
 * `registerAdminRoute`, so these handlers never touch auth.
 */
export class PaywallAdminController {
  constructor(private readonly service: PaywallAdminService) {}

  listConfigs = async (
    _req: FastifyRequest,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const data = await this.service.listConfigs();
    return sendSuccess(reply, data, "OK");
  };

  getConfig = async (
    req: FastifyRequest<{ Params: AdminPaywallConfigParamsInput }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const data = await this.service.getConfig(req.params.paywallId);
    return sendSuccess(reply, data, "OK");
  };

  updateConfig = async (
    req: FastifyRequest<{
      Params: AdminPaywallConfigParamsInput;
      Body: AdminPaywallConfigPatchInput;
    }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const data = await this.service.updateConfig({
      paywallId: req.params.paywallId,
      ...req.body,
    });
    return sendSuccess(reply, data, "Paywall updated");
  };
}
