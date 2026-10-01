import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// telemetry.ts dynamically imports the SDK; intercept it to observe init()
const init = vi.hoisted(() => vi.fn());
vi.mock("@hyperdx/node-opentelemetry", () => ({ init }));

const ORIGINAL = { ...process.env };

beforeEach(() => {
  vi.resetModules(); // telemetry.ts runs its side effect on import — re-run each test
  init.mockClear();
  process.env = { ...ORIGINAL };
  process.env.DATABASE_URL = "postgres://u:p@localhost:5432/db";
  process.env.JWT_SECRET = "a-sufficiently-long-secret";
  process.env.AUTH_OTP_PEPPER = "unit-test-pepper-not-secret-32chars";
  delete process.env.ENABLE_TELEMETRY;
  delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  delete process.env.HYPERDX_API_KEY;
});

afterEach(() => {
  process.env = { ...ORIGINAL };
});

describe("api telemetry preload", () => {
  it("does not init the SDK when telemetry is disabled", async () => {
    await import("../telemetry.js");
    expect(init).not.toHaveBeenCalled();
  });

  it("inits HyperDX with service=api (+ apiKey) when enabled", async () => {
    process.env.ENABLE_TELEMETRY = "true";
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT = "https://clickstack:4318";
    process.env.HYPERDX_API_KEY = "key-123";
    await import("../telemetry.js");
    expect(init).toHaveBeenCalledWith(
      expect.objectContaining({ service: "api", apiKey: "key-123" })
    );
  });
});
