import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// telemetry.ts dynamically imports the SDK; intercept it to observe init()
const init = vi.hoisted(() => vi.fn());
vi.mock("@hyperdx/node-opentelemetry", () => ({ init }));

const ORIGINAL = { ...process.env };

beforeEach(() => {
  vi.resetModules(); // telemetry.ts runs its side effect on import — re-run each test
  init.mockClear();
  process.env = { ...ORIGINAL, EVENTS_API_KEY: "a-sufficiently-long-api-key" };
  delete process.env.ENABLE_TELEMETRY;
  delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  delete process.env.HYPERDX_API_KEY;
});

afterEach(() => {
  process.env = { ...ORIGINAL };
});

describe("events telemetry preload", () => {
  it("does not init the SDK when telemetry is disabled", async () => {
    await import("../telemetry");
    expect(init).not.toHaveBeenCalled();
  });

  it("inits HyperDX with service=events when enabled", async () => {
    process.env.ENABLE_TELEMETRY = "true";
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT = "https://clickstack:4318";
    process.env.HYPERDX_API_KEY = "key-xyz";
    await import("../telemetry");
    expect(init).toHaveBeenCalledWith(
      expect.objectContaining({ service: "events", apiKey: "key-xyz" })
    );
  });
});
