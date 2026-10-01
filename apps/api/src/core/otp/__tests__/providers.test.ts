import { afterEach, describe, expect, test } from "vitest";
import { OTP_PROVIDERS, OTP_PROVIDER, resetEnvCache } from "@api/shared/config";
import { OTP_PROVIDER_FACTORIES, otpProviderFor } from "../providers.js";

/**
 * The registry is the extensibility contract: adding a provider is a tuple
 * entry + a registry entry, and these assertions fail if the two ever drift.
 * Mirrors `core/payment/__tests__/gateways.test.ts`.
 */
describe("otp provider registry", () => {
  test("has exactly one factory per OTP_PROVIDERS entry", () => {
    expect(Object.keys(OTP_PROVIDER_FACTORIES).sort()).toEqual(
      [...OTP_PROVIDERS].sort()
    );
  });

  test("the stub factory builds a provider named 'stub'", () => {
    // Only the stub constructs without vendor env — the real adapters build an
    // HTTP client that reads credentials, which is exactly why the registry
    // holds factories rather than instances.
    expect(otpProviderFor(OTP_PROVIDER.STUB).name).toBe("stub");
  });

  test("every entry is a factory, not a shared instance", () => {
    // Two calls must not hand back the same object: `StubOtpProvider` keeps
    // session state per instance, and a provider shared across a re-init would
    // carry sessions between them.
    expect(otpProviderFor(OTP_PROVIDER.STUB)).not.toBe(
      otpProviderFor(OTP_PROVIDER.STUB)
    );
  });

  test("`dostii` is gone — a provider name must never mean 'stub'", () => {
    // It used to be accepted and silently fell back to the stub, so an operator
    // could arm it in prod and get no SMS and no error.
    expect(OTP_PROVIDERS).not.toContain("dostii");
  });
});

describe("msg91 wiring", () => {
  afterEach(() => {
    delete process.env.MSG91_AUTH_KEY;
    delete process.env.MSG91_TEMPLATE_ID;
    resetEnvCache();
  });

  /**
   * The whole chain — LocalOtpProvider -> Msg91SmsSender -> Msg91Client — built
   * from the registry, with no network. Catches a mis-wired factory (the kind
   * of thing that otherwise only shows up as a crash-looping task).
   */
  test("builds the full provider chain and reports the vendor name", () => {
    process.env.MSG91_AUTH_KEY = "auth-key-not-a-real-credential";
    process.env.MSG91_TEMPLATE_ID = "template-123";
    resetEnvCache();

    expect(otpProviderFor(OTP_PROVIDER.MSG91).name).toBe("msg91");
  });

  test("refuses to build without credentials rather than falling back", () => {
    // The old `dostii` branch degraded to the stub here. Failing loudly is the
    // point: a silent fallback means an armed production env sends no SMS.
    resetEnvCache();
    expect(() => otpProviderFor(OTP_PROVIDER.MSG91)).toThrow(/MSG91_AUTH_KEY/);
  });
});
