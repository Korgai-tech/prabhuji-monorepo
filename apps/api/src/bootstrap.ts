import type { FastifyInstance } from "fastify";
import { buildApp } from "@api/app";
import { initAllModules } from "@api/modules";
import { loadEnv } from "@api/shared/config";
import {
  connectPrisma,
  disconnectPrisma,
  getPrisma,
  getRedis,
  initRedis,
  closeRedis,
} from "@api/shared/database";
import { cacheDeviceContext, readDeviceContext } from "@api/shared/analytics";
import { closeEvents, initEventBus } from "@api/shared/events";
import { createModuleLogger } from "@api/shared/logs";
// NOT in `@api/modules` on purpose: that list also feeds the OpenAPI emitter and
// the admin-guard contract test, so registering devtools there would publish
// /devtools/mark-pro into openapi.json. It is mounted here, and only here.
import { initDevtoolsModule } from "@api/core/devtools";

const log = createModuleLogger("bootstrap");

/**
 * Split the comma-separated `CORS_ALLOWED_ORIGINS` into exact origins.
 *
 * Tolerant of the shapes a task definition actually produces — surrounding
 * whitespace, a trailing comma, an unset value rendered as `""` — because every
 * one of those would otherwise become an origin that matches nothing, and a CORS
 * allowlist that silently matches nothing fails as a blank page in the CMS with
 * nothing in the server log.
 */
function parseCorsOrigins(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter((o) => o.length > 0);
}

/**
 * The `GET /ready` probe: can this process actually serve a request?
 *
 * Postgres is unconditional — every meaningful route reads it. Redis is checked
 * only when it is enabled, because `ENABLE_REDIS=false` is a supported local
 * configuration and a null client there means "off", not "broken".
 *
 * Throws on the first failure; `buildApp` turns that into a 503.
 */
async function probeReadiness(): Promise<void> {
  await getPrisma().$queryRaw`SELECT 1`;
  const redis = getRedis();
  if (redis) await redis.ping();
}

export async function bootstrap(): Promise<{
  app: FastifyInstance;
  shutdown: () => Promise<void>;
}> {
  const env = loadEnv();
  // 1. infrastructure (parallel)
  await Promise.all([connectPrisma(), initRedis()]);
  // 2. build app + domain-event bus
  const app = await buildApp({
    apiDocs: env.ENABLE_API_DOCS,
    corsOrigins: parseCorsOrigins(env.CORS_ALLOWED_ORIGINS),
    readinessProbe: probeReadiness,
  });
  // Keep each user's cached device context current. OTP verify seeds it, but
  // that write would then be the only one for the life of the install — an app
  // upgrade or a SIM swap would leave `version_name`/`carrier` pinned to
  // whatever was true at login, which is worse than having no value.
  //
  // `onResponse` runs AFTER the reply is flushed, so this adds nothing to any
  // request's latency, and `cacheDeviceContext` swallows its own failures and
  // no-ops when the value is unchanged — a dead Redis cannot become a failed
  // request here. Registered in bootstrap, not `buildApp`: that stays free of
  // infrastructure so the OpenAPI emitter and route tests can build the app
  // with no Redis in sight.
  app.addHook("onResponse", (req, _reply, done) => {
    const userId = req.user?.id;
    if (userId) {
      const context = readDeviceContext(req.headers);
      if (context) void cacheDeviceContext(userId, context);
    }
    done();
  });
  const events = initEventBus();
  // 3. every module's composition root, in `src/modules.ts` — the single list
  //    shared with the OpenAPI emitter and the admin-guard contract test, so
  //    all three see the same app (TAM-82). Modules wire their own event usage.
  initAllModules(app, events);
  // TEMPORARY (remove before prod) — dev-only endpoint to mark a user Pro by
  // phone (POST /devtools/mark-pro). Off by default; only mounts when
  // ENABLE_DEV_TOOLS=true (set on stage, never on prod). See core/devtools.
  if (env.ENABLE_DEV_TOOLS) {
    initDevtoolsModule(app);
  }
  // 4. connect + start consuming once every module has registered
  await events.start();
  await app.ready();

  const shutdown = async (): Promise<void> => {
    log.info("shutting down");
    await app.close();
    await Promise.allSettled([disconnectPrisma(), closeRedis(), closeEvents()]);
  };
  return { app, shutdown };
}
