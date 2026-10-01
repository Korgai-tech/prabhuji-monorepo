import { buildApp } from "../src/app.js";
import { initAllModules } from "../src/modules.js";
import { clearGlobalServices } from "../src/shared/workspace/index.js";

export async function getOpenapiDocString(): Promise<string> {
  // The OTP module reads AUTH_OTP_PEPPER (+ JWT_SECRET / DATABASE_URL via
  // loadEnv) at init — inject non-secret stubs so the doc emitter can boot
  // without a real dev .env. This never runs in prod; it's a build-time
  // script and only the route schemas are emitted (no network calls).
  process.env.AUTH_OTP_PEPPER ??= "openapi-doc-stub-pepper-not-used-32chars";
  process.env.AUTH_OTP_PROVIDER ??= "stub";
  process.env.JWT_SECRET ??= "openapi-doc-stub-secret-not-used-really";
  process.env.DATABASE_URL ??= "postgres://stub:stub@localhost:5432/stub";
  // TAM-84: core/media reads these at init (they are REQUIRED in env.ts). Stubs
  // so the doc emitter can boot. The `mediaUrl` component is emission-invariant
  // to MEDIA_ALLOW_INSECURE_URLS (the carve-out is a runtime-only `.refine`), so
  // the emitted contract does not depend on the flag being set here.
  process.env.MEDIA_BUCKET ??= "openapi-doc-stub-bucket";
  process.env.MEDIA_PUBLIC_BASE_URL ??= "https://openapi-doc-stub.example";

  const app = await buildApp();
  // TAM-82: one module list (`src/modules.ts`), shared with `bootstrap.ts` and
  // the admin-guard contract test — a new module lands in the emitted doc
  // without anyone remembering to add it here. No event bus: this builds the
  // app purely to read its route schemas.
  initAllModules(app);
  await app.ready();
  const doc = app.swagger();
  await app.close();
  clearGlobalServices();
  return JSON.stringify(doc, null, 2) + "\n";
}
