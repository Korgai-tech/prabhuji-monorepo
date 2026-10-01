import type { FastifyInstance } from "fastify";

import { createModuleLogger } from "@api/shared/logs";
import { DevtoolsRepository } from "@api/core/devtools/repositories";
import { DevtoolsService } from "@api/core/devtools/services";
import { registerDevtoolsRoutes } from "@api/core/devtools/routes";

const log = createModuleLogger("devtools:bootstrap");

/**
 * ⚠️ TEMPORARY dev-only module — REMOVE BEFORE PROD.
 *
 * Exposes `POST /devtools/mark-pro` to flip a user's subscription to `active`
 * (Pro) by phone number, with an optional `expiresAt`. It exists because there
 * is no real activate path yet (deferred to the payment-provider ticket), so
 * stage/local can't otherwise produce a Pro user.
 *
 * Only wired in by `bootstrap.ts` when `ENABLE_DEV_TOOLS=true`, so it is absent
 * (routes 404) anywhere the flag is unset — prod included. Deleting this folder
 * + its one `bootstrap.ts` block + the `ENABLE_DEV_TOOLS` env line removes it
 * entirely.
 */
export function initDevtoolsModule(app: FastifyInstance): void {
  const repo = new DevtoolsRepository();
  const service = new DevtoolsService(repo);
  log.warn(
    "⚠️  DEV TOOLS ENABLED — POST /devtools/mark-pro is live (ENABLE_DEV_TOOLS=true). Remove before prod."
  );
  void app.register(
    (scoped) => {
      registerDevtoolsRoutes(scoped, service);
    },
    { prefix: "/devtools" }
  );
}
