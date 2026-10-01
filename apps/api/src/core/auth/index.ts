import type { FastifyInstance } from "fastify";
import { registerGlobalService } from "@api/shared/workspace";
import type { EventBus } from "@api/shared/events";
import { AuthRepository } from "@api/core/auth/repositories";
import { AuthService } from "@api/core/auth/services";
import { AuthApi } from "@api/core/auth/api";
import { registerAdminSessionRoutes, registerAuthRoutes } from "@api/core/auth/routes";

export { runAdminBootstrap } from "./bootstrap-admin.js";

export function initAuthModule(app: FastifyInstance, events?: EventBus): void {
  const repo = new AuthRepository();
  const service = new AuthService(repo, events);
  const api = new AuthApi(service);
  registerGlobalService("auth", api);
  void app.register(
    (scoped) => {
      registerAuthRoutes(scoped, service);
    },
    { prefix: "/auth" }
  );
  // TAM-82: the admin surface is a SEPARATE scope, not the /auth routes with a
  // guard bolted on (ADR §B5) — the public /auth contract must not churn to
  // serve admin. Every module that grows admin routes mounts them the same way.
  void app.register(
    (scoped) => {
      registerAdminSessionRoutes(scoped, service);
    },
    { prefix: "/admin" }
  );
}
