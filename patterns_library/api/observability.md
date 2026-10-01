# Pattern: Observability (OpenTelemetry → ClickStack)

> Repo-specific pattern (monorepo-boilerplate). Source of truth: each service's `src/telemetry.ts`.
> See also `docs/OBSERVABILITY.md`.

## Use Case

Ship **traces + logs + metrics** from a backend service (`apps/api`, `apps/events`) to **ClickStack**
(ClickHouse observability: OTel Collector → ClickHouse → HyperDX), so requests are traceable
end-to-end (route → service → repository → pg/redis/kafka/kinesis) with logs correlated to spans.
This is _operational_ telemetry — orthogonal to the domain-event and analytics pipes.

ClickHouse Cloud hosts the **storage and the HyperDX UI, but not the collector** — we run
`clickhouse/clickstack-otel-collector` ourselves as a **non-essential sidecar container in each
service's ECS task**. In Fargate `awsvpc` mode both containers share a network namespace, so the app
exports OTLP to plain `localhost:4318` and the collector writes on to ClickHouse Cloud. Topology and
Terraform wiring: `docs/OBSERVABILITY.md`.

## The Mechanism

`@hyperdx/node-opentelemetry` (the ClickStack Node SDK) auto-instruments HTTP/Fastify/pg/ioredis/
kafkajs/@aws-sdk and injects trace context into pino. It is initialized from a **preloaded** module,
not a normal import:

```typescript
// src/telemetry.ts — preloaded via `node --import ./telemetry.js index.js`
import { loadEnv } from "./shared/config/env";

const env = loadEnv();
if (env.ENABLE_TELEMETRY) {
  const { init } = await import("@hyperdx/node-opentelemetry"); // lazy: off-path never loads it
  init({
    service: "api", // fixed per service
    apiKey: env.HYPERDX_API_KEY, // required when on — the SDK skips init without it
    consoleCapture: true, // ship pino stdout as logs
  });
}
```

```dockerfile
CMD ["node", "--import", "./telemetry.js", "index.js"]
```

**Why `--import`, not `import "./telemetry"` at the top of `index.ts`:** OTel patches instrumented
libraries at _module-load time_, so its hook must register **before** the app graph imports them.
`--import` runs the preload (and registers the ESM hook) first; ESM import hoisting makes a top-of-
file import unreliable. This works **only because** the esbuild build is `thirdParty:false` — deps
stay external as real node_modules the SDK can patch, not inlined into the bundle.

## Configuration (Zod env, fail-fast at boot)

- `ENABLE_TELEMETRY` (bool, default false) — master switch; off = SDK never loaded.
- `OTEL_EXPORTER_OTLP_ENDPOINT` — OTLP/HTTP collector (`:4318`); `superRefine` requires it when
  telemetry is on. In the deployed envs Terraform sets it to `http://localhost:4318` — the sidecar.
- `HYPERDX_API_KEY` — ingestion key; **required when telemetry is on** (the SDK skips init entirely without it — the schema fails fast rather than let telemetry silently no-op). With the sidecar the localhost hop does no client auth, so any non-empty placeholder satisfies the SDK.

`project.json` adds `src/telemetry.ts` to `additionalEntryPoints` so esbuild emits `dist/telemetry.js`.
Terraform injects the env into the ECS tasks, attaches the collector sidecar, and provisions
`HYPERDX_API_KEY` via Secrets Manager — all gated on `enable_telemetry` plus ClickHouse creds for
the collector to export to. Arming telemetry with no OTLP target fails the **plan** (a precondition
in `modules/stack/services.tf`) rather than crash-looping tasks on the boot-time schema check.

## Adding telemetry to a new service

1. [ ] `pnpm --filter <svc> add @hyperdx/node-opentelemetry`
2. [ ] `src/telemetry.ts` — the snippet above, with `service: "<svc>"`
3. [ ] `project.json` → `additionalEntryPoints: [".../src/telemetry.ts"]`
4. [ ] `Dockerfile` → `CMD ["node","--import","./telemetry.js","index.js"]`
5. [ ] `env.ts` → the three vars + the endpoint-required `superRefine`
6. [ ] compose + Terraform env/secret wiring (opt-in)

## Rules

- `@hyperdx/node-opentelemetry` lives ONLY in `src/telemetry.ts` (bootstrap infra beside `index.ts`)
  — NOT a layered concern; it is not the Prisma/`@aws-sdk`-in-repositories rule.
- Telemetry is **off by default** and the SDK must not load when disabled (dynamic import behind the
  flag). Source dev (`nx serve`) stays off — validate via the built image (`pnpm deploy:local`).
- Service name is fixed in code, not env-derived — one canonical name per service in HyperDX.

## Anti-Patterns

- ❌ `import "./telemetry"` at the top of `index.ts` — too late/unreliable for ESM auto-instrumentation; use `--import`.
- ❌ Bundling third-party deps into the app (`thirdParty:true`/inlined) — auto-instrumentation can't patch inlined modules.
- ❌ Importing the SDK unconditionally — it loads the whole OTel stack even when telemetry is off.
- ❌ Hand-rolling log/trace correlation — the SDK's pino instrumentation already stamps `trace_id`/`span_id`.
