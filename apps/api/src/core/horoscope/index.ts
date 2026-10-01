import type { FastifyInstance } from "fastify";
import { registerGlobalService } from "@api/shared/workspace";
import { createModuleLogger } from "@api/shared/logs";
import { loadEnv } from "@api/shared/config";
import {
  HoroscopeRepository,
  OpenAiHoroscopeClient,
} from "@api/core/horoscope/repositories";
import {
  CmsHoroscopeProvider,
  HoroscopeAdminService,
  HoroscopeGenerationLock,
  HoroscopeGenerationService,
  HoroscopeService,
} from "@api/core/horoscope/services";
import { HoroscopeApi } from "@api/core/horoscope/api";
import {
  registerHoroscopeAdminRoutes,
  registerHoroscopeRoutes,
} from "@api/core/horoscope/routes";

const log = createModuleLogger("horoscope:bootstrap");

/**
 * Composition root for the Horoscope module (TAM-73).
 *
 * Wires the layered dependencies and — critically — the ENGINE SWAP SEAM: the
 * `HoroscopeProvider` interface is bound HERE to the Phase-1 `CmsHoroscopeProvider`
 * (seeded rows). When Business finalizes the engine (open-question q1), swap this
 * ONE line to an `ApiHoroscopeProvider` / `AiHoroscopeProvider` — the service,
 * controller, routes, schemas and mobile client are untouched.
 *
 * Publishes the `IHoroscopeApi` facade (FREE zodiac grid) into `GlobalServiceMap`
 * and mounts the `/horoscope/*` routes. Depends (at request time, via
 * `performServiceCall`) on the `subscription` facade for the #EXPORT_CRITICAL
 * Pro gate on the daily result — registered by its own module init in
 * `bootstrap.ts`.
 */
export function initHoroscopeModule(app: FastifyInstance): void {
  const env = loadEnv();
  const repo = new HoroscopeRepository();
  const provider = new CmsHoroscopeProvider(repo); // ← engine swap seam (q1)
  const adminService = new HoroscopeAdminService(repo);

  // The AI content pipeline (open-question q1, resolved). Constructed ONLY when
  // an OPENAI_API_KEY is configured: with no key, `HoroscopeService` receives no
  // generator and the module behaves exactly as it did before — a missing
  // reading is a 404, no key is read, no model is called. The KEY is the switch,
  // and it is structural rather than a runtime branch someone can forget.
  //
  // NOTE this is deliberately NOT wired through the `HoroscopeProvider` seam
  // that the comment above anticipates. That seam is a READ path invoked per
  // (sign, date, locale); generation is a WRITE pipeline that fills the table
  // the reader reads. See horoscope.generation.service.ts for the full reasoning.
  let generation: HoroscopeGenerationService | undefined;
  let generationLock: HoroscopeGenerationLock | undefined;
  if (env.OPENAI_API_KEY) {
    generationLock = new HoroscopeGenerationLock();
    generation = new HoroscopeGenerationService(
      new OpenAiHoroscopeClient(),
      repo,
      adminService,
      generationLock,
      env.HOROSCOPE_GENERATION_WAIT_MS
    );
    log.info(
      { model: env.OPENAI_MODEL },
      "horoscope AI content generation ENABLED"
    );
  }

  const service = new HoroscopeService(
    repo,
    provider,
    generation,
    generationLock
  );
  const api = new HoroscopeApi(service);
  registerGlobalService("horoscope", api);

  void app.register((scoped) => {
    registerHoroscopeRoutes(scoped, service);
  });

  // TAM-100: the admin write surface is a SEPARATE `/admin`-prefixed scope (ADR
  // §B5), not the public `/horoscope/*` routes with a guard bolted on — the
  // mobile read contract and the provider read contract must not churn to serve
  // admin. `registerHoroscopeAdminRoutes` declares paths under `/horoscope/…`,
  // so the full paths are `/admin/horoscope/…`. Every route inside is
  // `registerAdminRoute`-guarded.
  void app.register(
    (scoped) => {
      registerHoroscopeAdminRoutes(scoped, adminService);
    },
    { prefix: "/admin" }
  );

  log.info("horoscope module initialised");
}
