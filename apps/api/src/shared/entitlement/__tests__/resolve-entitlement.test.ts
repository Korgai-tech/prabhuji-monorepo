import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  clearGlobalServices,
  registerGlobalService,
} from "@api/shared/workspace";
import {
  fakeSubscriptionApi,
  freeStatus,
  proStatus,
  trialingStatus,
} from "@api/shared/testing";
import {
  readSubscriptionStatus,
  requireProEntitlement,
  resolveProEntitlement,
} from "../resolve-entitlement.js";

/**
 * The three entitlement wrappers, and specifically the thing that distinguishes
 * them: WHAT HAPPENS WHEN THE FACADE IS UNREACHABLE.
 *
 * This is the file that should have existed before three call sites drifted into
 * three different failure behaviours by accident. Each assertion below is one
 * half of a decision that was previously implicit in whichever file a developer
 * happened to copy from.
 */

const USER = "user-1";

beforeEach(() => {
  clearGlobalServices();
});

afterEach(() => {
  clearGlobalServices();
});

describe("when the subscription facade answers", () => {
  test("all three report the server's isEntitled verbatim", async () => {
    registerGlobalService(
      "subscription",
      fakeSubscriptionApi({ getStatus: () => Promise.resolve(proStatus()) })
    );

    expect(await resolveProEntitlement(USER, "t")).toBe(true);
    expect(await requireProEntitlement(USER, "t")).toBe(true);
    expect((await readSubscriptionStatus(USER, "t")).isEntitled).toBe(true);
  });

  /**
   * The regression that matters most here. A LAPSED row still says
   * `status: "active"` — only `isEntitled` is false. Any wrapper that
   * re-derived entitlement from `status` would grant access to a user whose
   * subscription ran out, which is precisely the bug that made
   * `computeIsEntitled` the single rule in the first place.
   */
  test("none of them re-derives entitlement from status", async () => {
    registerGlobalService(
      "subscription",
      fakeSubscriptionApi({
        getStatus: () => Promise.resolve(proStatus(false)),
      })
    );

    expect(await resolveProEntitlement(USER, "t")).toBe(false);
    expect(await requireProEntitlement(USER, "t")).toBe(false);

    const status = await readSubscriptionStatus(USER, "t");
    expect(status.status).toBe("active");
    expect(status.isEntitled).toBe(false);
  });

  test("a trialing user is entitled, having paid nothing", async () => {
    const ends = new Date(Date.now() + 86_400_000);
    registerGlobalService(
      "subscription",
      fakeSubscriptionApi({
        getStatus: () => Promise.resolve(trialingStatus(ends)),
      })
    );

    expect(await resolveProEntitlement(USER, "t")).toBe(true);
  });
});

describe("when the facade is unreachable", () => {
  /**
   * Note what CANNOT reach these branches: a user with no subscription row.
   * `SubscriptionService.getStatus` returns the free shape defensively for a
   * missing row, so the only way here is a dead facade or a dead database.
   */
  test("an unregistered facade splits the three exactly as their names say", async () => {
    // Nothing registered at all.
    await expect(resolveProEntitlement(USER, "t")).resolves.toBe(false);
    await expect(requireProEntitlement(USER, "t")).rejects.toThrow();
    await expect(readSubscriptionStatus(USER, "t")).rejects.toThrow();
  });

  test("a throwing facade splits them the same way", async () => {
    registerGlobalService(
      "subscription",
      fakeSubscriptionApi({
        getStatus: () => Promise.reject(new Error("db is gone")),
      })
    );

    // Content reads degrade to free: a user sees no stream URL and can retry.
    await expect(resolveProEntitlement(USER, "t")).resolves.toBe(false);
    // Money decisions must not guess — see the wrapper docblock for what
    // guessing costs inside `createMandate`.
    await expect(requireProEntitlement(USER, "t")).rejects.toThrow();
    await expect(readSubscriptionStatus(USER, "t")).rejects.toThrow();
  });

  test("failing closed means FREE, never entitled", async () => {
    registerGlobalService(
      "subscription",
      fakeSubscriptionApi({
        getStatus: () => Promise.reject(new Error("boom")),
      })
    );
    // Stated separately from the split above because it is the property that
    // actually protects paid content during an outage.
    expect(await resolveProEntitlement(USER, "aarti:getById")).toBe(false);
  });
});

describe("the free shape", () => {
  test("a registered facade returning free is not entitled", async () => {
    registerGlobalService(
      "subscription",
      fakeSubscriptionApi({ getStatus: () => Promise.resolve(freeStatus()) })
    );
    expect(await resolveProEntitlement(USER, "t")).toBe(false);
    // And it does NOT throw — "free" is a normal answer, not a failure.
    await expect(requireProEntitlement(USER, "t")).resolves.toBe(false);
  });
});
