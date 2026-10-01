import type { FastifyInstance } from "fastify";
import { registerGlobalService } from "@api/shared/workspace";
import { createModuleLogger } from "@api/shared/logs";
import {
  DeityPreferenceRepository,
  UsersRepository,
} from "@api/core/users/repositories";
import { DeityPreferenceService, UsersService } from "@api/core/users/services";
import { UsersApi } from "@api/core/users/api";
import { registerUsersRoutes } from "@api/core/users/routes";

const log = createModuleLogger("users:bootstrap");

/**
 * Composition root for the users module.
 *
 * Wires the layered dependencies (repo → service → controller/facade),
 * publishes the `IUsersApi` facade into `GlobalServiceMap` (so downstream
 * modules like paywall / subscription can look up profile state without
 * touching internals), and mounts the routes under `/users`.
 */
export function initUsersModule(app: FastifyInstance): void {
  const repo = new UsersRepository();
  const service = new UsersService(repo);
  // TAM-175 — READ ONLY on a serving task: no warehouse repository is passed,
  // so the API boots with no ClickHouse configuration and `sync()` is
  // unreachable here. The sync entrypoint builds its own instance WITH one.
  const deityPreferences = new DeityPreferenceService(new DeityPreferenceRepository());
  const api = new UsersApi(service, deityPreferences);
  registerGlobalService("users", api);
  log.info("users module initialised");
  void app.register(
    (scoped) => {
      registerUsersRoutes(scoped, service);
    },
    { prefix: "/users" }
  );
}
