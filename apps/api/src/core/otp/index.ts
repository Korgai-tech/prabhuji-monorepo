import type { FastifyInstance } from "fastify";
import { loadEnv } from "@api/shared/config";
import { createModuleLogger } from "@api/shared/logs";
import { OtpRepository } from "@api/core/otp/repositories";
import { OtpService } from "@api/core/otp/services";
import { RedisRateLimiter } from "@api/shared/rate-limit";
import { otpProviderFor } from "@api/core/otp/providers";
import { registerOtpRoutes } from "@api/core/otp/routes";

const log = createModuleLogger("otp:bootstrap");

/**
 * Composition root for the OTP module.
 *
 * The provider is resolved once, here, from `AUTH_OTP_PROVIDER` against the
 * registry in `providers.ts`:
 *   - "stub" (default): local dev + integration tests, fixed OTP "1234".
 *   - "msg91": real SMS delivery via MSG91's Flow API.
 *
 * Switching a deployed environment is an env change plus a roll — no code
 * change. Adding a provider is a registry entry: `add_new_otp_provider.md`.
 *
 * No facade is registered in `GlobalServiceMap` because no other module
 * currently consumes OTP internals. When one does, add the key to
 * `src/shared/workspace/context.ts` and call `registerGlobalService` here.
 */
export function initOtpModule(app: FastifyInstance): void {
  const env = loadEnv();
  const provider = otpProviderFor(env.AUTH_OTP_PROVIDER);
  const repo = new OtpRepository();
  const service = new OtpService(repo, provider, new RedisRateLimiter());
  log.info({ provider: provider.name }, "otp module initialised");
  void app.register(
    (scoped) => {
      registerOtpRoutes(scoped, service);
    },
    { prefix: "/auth/otp" }
  );
}
