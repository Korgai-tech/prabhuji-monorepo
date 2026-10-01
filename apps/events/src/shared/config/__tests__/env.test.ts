import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { loadEnv, resetEnvCache } from "../env";

const VALID_KEY = "a-sufficiently-long-api-key";

describe("loadEnv", () => {
  const saved = { ...process.env };

  beforeEach(() => {
    resetEnvCache();
    process.env = { ...saved, EVENTS_API_KEY: VALID_KEY };
    delete process.env.EVENTS_PORT;
    delete process.env.ENABLE_KINESIS;
    delete process.env.KINESIS_STREAM_NAME;
    delete process.env.ENABLE_TELEMETRY;
    delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    delete process.env.HYPERDX_API_KEY;
  });

  afterEach(() => {
    process.env = saved;
    resetEnvCache();
  });

  it("applies defaults", () => {
    const env = loadEnv();
    expect(env.EVENTS_PORT).toBe(3001);
    expect(env.HOST).toBe("0.0.0.0");
    expect(env.ENABLE_KINESIS).toBe(false);
    expect(env.KINESIS_BATCH_SIZE).toBe(100);
    expect(env.KINESIS_FLUSH_INTERVAL_MS).toBe(1000);
  });

  it("rejects a short EVENTS_API_KEY", () => {
    process.env.EVENTS_API_KEY = "short";
    expect(() => loadEnv()).toThrow(/EVENTS_API_KEY/);
  });

  it("rejects an invalid port", () => {
    process.env.EVENTS_PORT = "not-a-port";
    expect(() => loadEnv()).toThrow(/EVENTS_PORT/);
  });

  it("requires KINESIS_STREAM_NAME when ENABLE_KINESIS=true", () => {
    process.env.ENABLE_KINESIS = "true";
    expect(() => loadEnv()).toThrow(/KINESIS_STREAM_NAME/);
  });

  it("caps KINESIS_BATCH_SIZE at the PutRecords limit", () => {
    process.env.KINESIS_BATCH_SIZE = "501";
    expect(() => loadEnv()).toThrow(/KINESIS_BATCH_SIZE/);
  });

  it("accepts a full kinesis configuration", () => {
    process.env.ENABLE_KINESIS = "true";
    process.env.KINESIS_STREAM_NAME = "events";
    const env = loadEnv();
    expect(env.ENABLE_KINESIS).toBe(true);
    expect(env.KINESIS_STREAM_NAME).toBe("events");
  });

  it("requires OTEL_EXPORTER_OTLP_ENDPOINT + HYPERDX_API_KEY when ENABLE_TELEMETRY=true", () => {
    process.env.ENABLE_TELEMETRY = "true";
    expect(() => loadEnv()).toThrow(/OTEL_EXPORTER_OTLP_ENDPOINT/);

    process.env.OTEL_EXPORTER_OTLP_ENDPOINT = "https://clickstack:4318";
    resetEnvCache();
    // the SDK silently skips init without a key, so the schema fails fast instead
    expect(() => loadEnv()).toThrow(/HYPERDX_API_KEY/);
  });

  it("accepts a full telemetry configuration", () => {
    process.env.ENABLE_TELEMETRY = "true";
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT = "https://clickstack:4318";
    process.env.HYPERDX_API_KEY = "key-xyz";
    const env = loadEnv();
    expect(env.ENABLE_TELEMETRY).toBe(true);
    expect(env.HYPERDX_API_KEY).toBe("key-xyz");
  });
});
