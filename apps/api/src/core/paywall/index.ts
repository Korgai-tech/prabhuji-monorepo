import type { FastifyInstance } from "fastify";
import { registerGlobalService } from "@api/shared/workspace";
import { createModuleLogger } from "@api/shared/logs";
import {
  PaywallConfigRepository,
  PaywallUtmOverrideRepository,
} from "@api/core/paywall/repositories";
import {
  DbPaywallConfigProvider,
  PaywallAdminService,
  PaywallLruCache,
  PaywallService,
  PaywallUtmOverrideAdminService,
} from "@api/core/paywall/services";
import { PaywallApi } from "@api/core/paywall/api";
import {
  registerPaywallAdminRoutes,
  registerPaywallRoutes,
  registerPaywallUtmOverrideAdminRoutes,
} from "@api/core/paywall/routes";

const log = createModuleLogger("paywall:bootstrap");

/**
 * Composition root for the paywall module.
 *
 * TAM-46 wired the raw-row provider (`DbPaywallConfigProvider`) + the
 * `IPaywallApi` facade so other modules could look up config server-side.
 * TAM-45 adds the mobile-facing HTTP surface:
 *
 *   - `PaywallService` — locale-fallback + response-cache layer, built on
 *     top of the provider; a second `PaywallLruCache` holds the composed
 *     response (separate key namespace from the raw-row cache).
 *   - `registerPaywallRoutes` — mounts `GET /config` under the `/paywall`
 *     prefix. `authMiddleware` runs as a preHandler.
 *
 * The service consumes the provider directly (no `performServiceCall` for
 * an intra-module hop). The facade continues to publish the provider for
 * cross-module callers.
 *
 * TAM-130 adds the CMS write surface for the hero VIDEO only, on a second,
 * separate `/admin`-prefixed scope:
 *
 *   - `PaywallAdminService` takes the REPOSITORY, not the provider — an admin
 *     read must never be served from a cache, or the editor gets a stale
 *     `updatedAt` and their next save 409s for no reason.
 *   - Cache invalidation is injected as a narrow port bound to the facade's
 *     `invalidate`, which already clears the response cache before the raw-row
 *     cache. Passing the port (not `PaywallApi`) keeps `services/` from taking
 *     a value import on `api/`.
 */
export function initPaywallModule(app: FastifyInstance): void {
  const repo = new PaywallConfigRepository();
  const utmOverrideRepo = new PaywallUtmOverrideRepository();
  const rawCache = new PaywallLruCache();
  const provider = new DbPaywallConfigProvider(repo, rawCache);
  const service = new PaywallService(provider, undefined, undefined, utmOverrideRepo);
  const api = new PaywallApi(provider, service, repo);
  registerGlobalService("paywall", api);

  const adminService = new PaywallAdminService(repo, {
    invalidate: (paywallId) => {
      api.invalidate(paywallId);
    },
  });

  void app.register(
    (scoped) => {
      registerPaywallRoutes(scoped, service);
    },
    { prefix: "/paywall" }
  );

  // The ad-group overrides own their own admin service and their own cache
  // invalidation: a CMS write there must drop the override INDEX, which is not
  // keyed by paywall id and so has nothing to do with `api.invalidate`.
  const utmOverrideAdminService = new PaywallUtmOverrideAdminService(utmOverrideRepo, {
    invalidateUtmOverrides: () => {
      service.invalidateUtmOverrides();
    },
  });

  void app.register(
    (scoped) => {
      registerPaywallAdminRoutes(scoped, adminService);
      registerPaywallUtmOverrideAdminRoutes(scoped, utmOverrideAdminService);
    },
    { prefix: "/admin" }
  );

  log.info("paywall module initialised");
}
