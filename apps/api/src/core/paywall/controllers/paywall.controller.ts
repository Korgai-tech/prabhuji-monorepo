import type { FastifyReply, FastifyRequest } from "fastify";
import { sendSuccess } from "@api/shared/response";
import { AppError } from "@api/shared/errors";
import type { PaywallService } from "@api/core/paywall/services";
import type { PaywallConfigQueryInput } from "@api/core/paywall/routes/paywall.schemas";

/**
 * Thin HTTP boundary for `GET /paywall/config`. `authMiddleware` populated
 * `req.user`; Zod validated the query; the service handles fallback +
 * cache; the envelope helper writes the reply.
 *
 * The `X-Paywall-Config-Version` header mirrors `data.configVersion` so
 * mobile can cache-key on the header alone (cheaper than parsing the body
 * on the hot path). The value is a stringified integer.
 */
export class PaywallController {
  constructor(private readonly service: PaywallService) {}

  getConfig = async (
    req: FastifyRequest<{ Querystring: PaywallConfigQueryInput }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    // authMiddleware would have short-circuited if the JWT was missing —
    // this check keeps types honest for the service call and matches the
    // pattern used in `users/controllers/users.controller.ts`.
    if (!req.user) throw new AppError("Unauthorized", 401, "UNAUTHORIZED");

    // TAM-159. The A/B variant is derived server-side from the user id, gated on
    // the client's app version — a build without the layout widgets must never be
    // handed a variant. Both are passed as inputs rather than resolved here: the
    // controller cannot reach `PaywallConfigProvider` without breaking
    // Route → Controller → Service → Repository.
    //
    // `app_version` has been stamped on every request by the app's
    // `deviceHeaderInterceptor` for releases already, so no client change was
    // needed to read it. Absent or unparseable resolves to the default paywall.
    const data = await this.service.getPaywallConfig({
      locale: req.query.locale,
      userId: req.user.id,
      appVersion: req.headers.app_version,
    });

    // Must be set BEFORE `sendSuccess` (which calls `reply.send`). Fastify
    // freezes headers on the first send call.
    void reply.header("x-paywall-config-version", String(data.configVersion));

    return sendSuccess(reply, data, "OK");
  };
}
