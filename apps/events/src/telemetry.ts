import { loadEnv } from "./shared/config/env";

const env = loadEnv();

// Observability must never take the collector down with it. This file is
// PRELOADED (`node --import ./telemetry.js`), so an exception here is a crash
// before the server has started — see `apps/api/src/telemetry.ts` for the
// 6 Sep 2026 incident, where a dependency-resolution change inside the HyperDX
// SDK threw at import and every task exited 1. Telemetry is opt-in and
// best-effort: say so loudly on stderr and run without it.
if (env.ENABLE_TELEMETRY) {
  try {
    const { init } = await import("@hyperdx/node-opentelemetry");
    init({
      service: "events",
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
