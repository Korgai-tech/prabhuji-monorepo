import { describe, expect, test, vi } from "vitest";
import { AppError } from "@api/shared/errors";
import type { BillingCycleService } from "../../services/billing-cycle.service.js";
import type { BillingLock } from "../../services/billing-lock.js";
import type { MandateService } from "../../services/mandate.service.js";
import { PaymentApi } from "../payment.api.impl.js";

/**
 * `PaymentApi.cancelMandateForUser` — the seam `core/subscription`'s in-app
 * cancel endpoint drives.
 *
 * Everything here is about how a FAILED revoke is reported, because that is
 * the only part callers cannot see for themselves. A cancel that silently
 * looks successful is the "user was told they cancelled and got charged again"
 * incident, and the reason string is what an ops ticket starts from.
 */
function makeApi(cancelForUser: () => Promise<unknown>): PaymentApi {
  return new PaymentApi(
    {} as unknown as BillingCycleService,
    { cancelForUser } as unknown as MandateService,
    {} as unknown as BillingLock,
    { schedulerEnabled: true }
  );
}

describe("PaymentApi.cancelMandateForUser", () => {
  test("a completed revoke resolves true", async () => {
    const api = makeApi(() => Promise.resolve({ state: "revoked" }));
    await expect(api.cancelMandateForUser("user-1", new Date())).resolves.toBe(
      true
    );
  });

  test("nothing to revoke (404) resolves FALSE rather than throwing", async () => {
    // Comped / pre-mandate subscribers. There is no mandate at the gateway, so
    // there is nothing to fail at — telling them their cancellation failed
    // would be wrong.
    const api = makeApi(() =>
      Promise.reject(new AppError("No active subscription to cancel", 404, "NOT_FOUND"))
    );
    await expect(api.cancelMandateForUser("user-1", new Date())).resolves.toBe(
      false
    );
  });

  test("a raw transport failure is re-raised as an AppError carrying the reason", async () => {
    // THE point of the translation. `performServiceCall` rethrows an AppError
    // verbatim but replaces every other error type with a generic "failed
    // to …" string — so a plain `Error` here would reach the cancellation
    // audit row as "failed to cancel the mandate at the payment provider" and
    // nothing about why.
    const api = makeApi(() => Promise.reject(new Error("socket hang up")));

    await expect(
      api.cancelMandateForUser("user-1", new Date())
    ).rejects.toMatchObject({
      constructor: AppError,
      statusCode: 502,
      errorCode: "PROVIDER_CANCEL_FAILED",
      message: "socket hang up",
    });
  });

  test("an adapter's own AppError passes through untouched", async () => {
    // Razorpay's cancel rejections are already translated at the adapter
    // (`concurrent_request_in_progress` → 409 PROVIDER_BUSY, and friends).
    // Re-wrapping them would bury a code the caller may want to act on.
    const translated = new AppError("another cancel is in flight", 409, "PROVIDER_BUSY");
    const api = makeApi(() => Promise.reject(translated));

    await expect(api.cancelMandateForUser("user-1", new Date())).rejects.toBe(
      translated
    );
  });

  test("a NON-404 AppError is never mistaken for 'nothing to revoke'", async () => {
    // The catch narrows on the status code alone, so this guards the widening
    // that would turn a real gateway refusal into a silent success.
    const api = makeApi(() =>
      Promise.reject(new AppError("mandate is not cancellable", 409, "MANDATE_NOT_CANCELLABLE"))
    );

    await expect(api.cancelMandateForUser("user-1", new Date())).rejects.toThrow();
  });

  test("the caller's clock is passed through to the service", async () => {
    const cancelForUser = vi.fn(() => Promise.resolve({}));
    const api = makeApi(cancelForUser);
    const now = new Date("2026-08-10T00:00:00.000Z");

    await api.cancelMandateForUser("user-1", now);

    expect(cancelForUser).toHaveBeenCalledWith("user-1", now);
  });
});
