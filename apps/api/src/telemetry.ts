import { loadEnv } from "@api/shared/config";

const env = loadEnv();

// Observability must never take the money path down with it. This file is
// PRELOADED (`node --import ./telemetry.js`) ahead of both the API server and
// the billing job, so an exception here is a crash before either has started —
// which is exactly what happened on 6 Sep 2026: a resolution change inside the
// HyperDX SDK's dependency graph (`@opentelemetry/sdk-trace-base` 2.9.0 without
// `build/src/enums`) threw at import, every api task exited 1, ECS rolled the
// deployment back, and every 30-minute billing tick died at boot. Telemetry is
// opt-in and best-effort: if the SDK cannot load, say so loudly on stderr and
// run without it. The pin in `pnpm-workspace.yaml` is the fix; this is the
// guarantee that the next such surprise costs traces, not debits.
if (env.ENABLE_TELEMETRY) {
  try {
    const { init } = await import("@hyperdx/node-opentelemetry");
    init({
      service: "api",
      apiKey: env.HYPERDX_API_KEY,
      consoleCapture: true, // ship pino stdout as logs (trace-correlated)
    });
  } catch (err) {
    const reason = err instanceof Error ? err.stack ?? err.message : String(err);
    process.stderr.write(
      `[telemetry] ENABLE_TELEMETRY=true but the HyperDX SDK failed to load — continuing WITHOUT telemetry\n${reason}\n`
    );
  }
}
