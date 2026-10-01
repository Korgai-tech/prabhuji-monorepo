import { z } from "zod";

const boolFromString = z
  .enum(["true", "false"])
  .default("false")
  .transform((v) => v === "true");

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    EVENTS_PORT: z.coerce.number().int().positive().default(3001),
    HOST: z.string().default("0.0.0.0"),
    LOG_LEVEL: z.string().default("info"),
    // DEBUG: log every incoming raw payload (api_key redacted) so you can inspect
    // exactly what the SDK puts on the wire. Off by default; never enable in prod.
    EVENTS_LOG_RAW_PAYLOAD: boolFromString,
    // shared secret the Amplitude SDK sends as the V2 payload's `api_key`
    EVENTS_API_KEY: z.string().min(16),
    // Re-point a released app's events at another collector, server-side (no app
    // release — the SDK's serverUrl is baked into the shipped APK). Absent = no
    // forwarding. SAME NAMES as apps/api's producer config on purpose: one
    // destination and one key per env, wired from the same terraform var and the
    // same Secrets Manager secret for both producers.
    ANALYTICS_EVENTS_URL: z.string().url().optional(),
    ANALYTICS_EVENTS_API_KEY: z.string().min(1).optional(),
    ENABLE_KINESIS: boolFromString,
    KINESIS_STREAM_NAME: z.string().min(1).optional(),
    // Kinesis PutRecords accepts at most 500 records per call
    KINESIS_BATCH_SIZE: z.coerce.number().int().positive().max(500).default(100),
    KINESIS_FLUSH_INTERVAL_MS: z.coerce.number().int().positive().default(1000),
    // Observability: OpenTelemetry -> hosted ClickStack (HyperDX). Off = no SDK.
    ENABLE_TELEMETRY: boolFromString,
    OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().optional(), // ClickStack OTLP collector
    HYPERDX_API_KEY: z.string().min(1).optional(), // ingestion auth — the SDK skips init without it
  })
  .superRefine((env, ctx) => {
    // Both halves or neither. A url without a key would forward the batch with
    // OUR api_key in the body — the secret shipped inside every released APK —
    // to a host we do not own, and be rejected there anyway.
    if (env.ANALYTICS_EVENTS_URL && !env.ANALYTICS_EVENTS_API_KEY) {
      ctx.addIssue({
        code: "custom",
        path: ["ANALYTICS_EVENTS_API_KEY"],
        message: "required when ANALYTICS_EVENTS_URL is set (never forward with our own key)",
      });
    }
    if (env.ENABLE_KINESIS && !env.KINESIS_STREAM_NAME) {
      ctx.addIssue({
        code: "custom",
        path: ["KINESIS_STREAM_NAME"],
        message: "required when ENABLE_KINESIS=true",
      });
    }
    if (env.ENABLE_TELEMETRY && !env.OTEL_EXPORTER_OTLP_ENDPOINT) {
      ctx.addIssue({
        code: "custom",
        path: ["OTEL_EXPORTER_OTLP_ENDPOINT"],
        message: "required when ENABLE_TELEMETRY=true",
      });
    }
    if (env.ENABLE_TELEMETRY && !env.HYPERDX_API_KEY) {
      ctx.addIssue({
        code: "custom",
        path: ["HYPERDX_API_KEY"],
        message: "required when ENABLE_TELEMETRY=true (the HyperDX SDK skips init without it)",
      });
    }
  });

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | null = null;

export function loadEnv(): Env {
  if (cached) return cached;
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(
      `Invalid environment: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`
    );
  }
  cached = parsed.data;
  return cached;
}

export function resetEnvCache(): void {
  cached = null;
}
