import type { FastifyInstance } from "fastify";
import { registerGlobalService } from "@api/shared/workspace";
import { createModuleLogger } from "@api/shared/logs";
import {
  SubscriptionCancelRequestRepository,
  SubscriptionRepository,
} from "@api/core/subscription/repositories";
import {
  SubscriptionCancelRequestService,
  SubscriptionService,
} from "@api/core/subscription/services";
import { SubscriptionApi } from "@api/core/subscription/api";
import {
  registerSubscriptionCancelRequestRoutes,
  registerSubscriptionRoutes,
} from "@api/core/subscription/routes";

const log = createModuleLogger("subscription:bootstrap");

/**
 * Composition root for the subscription module (TAM-47).
 *
 * Wires the layered dependencies (repo → service → controller/facade),
 * publishes the `ISubscriptionApi` facade into `GlobalServiceMap` so the
 * OTP module (TAM-43) can seed the free-tier row via
 * `performServiceCall("subscription", ...)`, and mounts the routes under
 * `/subscription`.
 *
 * IMPORTANT: `bootstrap.ts` calls `initSubscriptionModule` BEFORE
 * `initOtpModule` so the facade is registered before the OTP verify path
 * ever looks it up. Re-ordering that call breaks new-user seeding — see
 * the TAM-47 spec's "Final approach" note.
 */
export function initSubscriptionModule(app: FastifyInstance): void {
  const repo = new SubscriptionRepository();
  const service = new SubscriptionService(repo);
  const api = new SubscriptionApi(service);
  registerGlobalService("subscription", api);

  // TAM-125: user-initiated cancellation-request queue lives in the same
  // module (it does not touch payments). Deliberately no facade / no
  // GlobalServiceMap entry — no other module reads this table yet. When a
  // future admin surface / worker needs to, extend `ISubscriptionApi` then.
  const cancelRequestRepo = new SubscriptionCancelRequestRepository();
  const cancelRequestService = new SubscriptionCancelRequestService(
    cancelRequestRepo,
    repo
  );

  void app.register(
    (scoped) => {
      registerSubscriptionRoutes(scoped, service);
      registerSubscriptionCancelRequestRoutes(scoped, cancelRequestService);
    },
    { prefix: "/subscription" }
  );

  log.info("subscription module initialised");
}
