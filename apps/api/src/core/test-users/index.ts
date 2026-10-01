import type { FastifyInstance } from "fastify";
import { createModuleLogger } from "@api/shared/logs";
import { TestUsersRepository } from "@api/core/test-users/repositories";
import { TestUsersService } from "@api/core/test-users/services";
import { registerTestUsersAdminRoutes } from "@api/core/test-users/routes";

const log = createModuleLogger("test-users:bootstrap");

/**
 * Composition root for admin-created QA accounts (TAM-187).
 *
 * An admin enters a phone number, premium yes/no and an abtesting bucket; this
 * module creates the `User` with `isTestUser` (so `LocalOtpProvider` issues the
 * environment's `TEST_OTP` and sends no SMS), grants or revokes complimentary
 * Pro through the subscription facade, and pins the user's UUID to the bucket
 * on this environment's abtesting service.
 *
 * Live on every environment, prod included — it is admin-only, refuses any
 * number that already belongs to a real account, and audit-logs every save.
 * Must init after `subscription`, whose facade it calls.
 */
export function initTestUsersModule(app: FastifyInstance): void {
  const repo = new TestUsersRepository();
  const service = new TestUsersService(repo);
  void app.register(
    (scoped) => {
      registerTestUsersAdminRoutes(scoped, service);
    },
    { prefix: "/admin" }
  );
  log.info("test-users module initialised");
}
