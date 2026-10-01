import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import jwt from "jsonwebtoken";
import type { FastifyInstance } from "fastify";
import { buildApp } from "@api/app";
import { startTestDb, stopTestDb } from "@api/shared/testing";
import { disconnectPrisma, getPrisma } from "@api/shared/database";
import { clearGlobalServices } from "@api/shared/workspace";
import { resetEnvCache } from "@api/shared/config";
import { initAuthModule } from "@api/core/auth";
import { initSubscriptionModule } from "@api/core/subscription";

/**
 * Integration coverage for `GET /subscription/status` (TAM-47) — real
 * Postgres via testcontainers.
 *
 * The auth module is initialised so `authMiddleware` can resolve its
 * `performServiceCall("auth", …)` handshake — without it the middleware
 * throws SERVICE_UNAVAILABLE regardless of token validity. Tokens are
 * signed directly with the JWT secret (matching AuthService's payload
 * shape) so we don't have to route through OTP for every test.
 *
 * Each test wipes the `subscriptions` table to a known state.
 */

const JWT_SECRET = "a-sufficiently-long-secret-for-subscription-tests";

interface StatusBody {
  success: boolean;
  message: string;
  data: {
    status:
      | "free"
      | "pending"
      | "trialing"
      | "active"
      | "past_due"
      | "cancelled"
      | "expired";
    isEntitled: boolean;
    entitledUntil: string | null;
    activePlanId: string | null;
    activeProductId: string | null;
    provider: string | null;
    expiresAt: string | null;
    trialEndsAt: string | null;
    startedAt: string | null;
  };
}

interface ErrBody {
  success: boolean;
  message: string;
  data: null;
  errorCode?: string;
}

let app: FastifyInstance;

/** A phone account, exactly as `core/otp` writes one: no email, no password. */
async function seedUser(): Promise<{ id: string }> {
  const created = await getPrisma().user.create({
    data: {
      phoneCountryCode: "+91",
      phoneNumber: uniquePhone(),
      loginType: "otp",
      name: null,
      selectedLanguage: null,
      onboardingCompletedAt: null,
    },
  });
  return { id: created.id };
}

/**
 * Distinct per call — `user_phone_unique` rejects a repeat. A counter rather
 * than randomness so a failure is reproducible.
 */
let phoneSeq = 0;
function uniquePhone(): string {
  phoneSeq += 1;
  return `9${String(phoneSeq).padStart(9, "0")}`;
}

/** `{sub}` only — the shape `core/otp` mints for a phone account. */
function mintToken(user: { id: string }): string {
  return jwt.sign({ sub: user.id }, JWT_SECRET, { expiresIn: "1h" });
}

async function truncateSubscriptions(): Promise<void> {
  await getPrisma().subscription.deleteMany({});
}

beforeAll(async () => {
  process.env.JWT_SECRET = JWT_SECRET;
  process.env.AUTH_OTP_PEPPER = "integration-test-pepper-not-secret-32chars";
  process.env.AUTH_OTP_PROVIDER = "stub";
  process.env.ENABLE_REDIS = "false";
  resetEnvCache();
  await startTestDb();
  app = await buildApp();
  initAuthModule(app);
  initSubscriptionModule(app);
  await app.ready();
}, 120_000);

afterAll(async () => {
  await app.close();
  clearGlobalServices();
  await disconnectPrisma();
  await stopTestDb();
});

beforeEach(async () => {
  await truncateSubscriptions();
});

describe("auth gate", () => {
  test("GET /subscription/status without a JWT returns 401", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/subscription/status",
    });
    expect(res.statusCode).toBe(401);
    const body: ErrBody = res.json();
    expect(body.success).toBe(false);
    expect(body.data).toBeNull();
  });

  test("GET /subscription/status with an invalid JWT returns 401", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/subscription/status",
      headers: { authorization: "Bearer not-a-real-token" },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe("happy path", () => {
  test("fresh user (no subscription row) → returns free shape defensively", async () => {
    // The user exists but no subscription row was seeded (mimics either a
    // legacy user or a race between User create + subscription seed).
    const user = await seedUser();
    const token = mintToken(user);

    const res = await app.inject({
      method: "GET",
      url: "/subscription/status",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body: StatusBody = res.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual({
      status: "free",
      isEntitled: false,
      entitledUntil: null,
      activePlanId: null,
      activeProductId: null,
      provider: null,
      expiresAt: null,
      trialEndsAt: null,
      startedAt: null,
    });
  });

  test("seeded free user → returns free shape", async () => {
    const user = await seedUser();
    await getPrisma().subscription.create({
      data: {
        userId: user.id,
        status: "free",
      },
    });
    const token = mintToken(user);

    const res = await app.inject({
      method: "GET",
      url: "/subscription/status",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body: StatusBody = res.json();
    expect(body.data.status).toBe("free");
    expect(body.data.isEntitled).toBe(false);
    expect(body.data.activePlanId).toBeNull();
    expect(body.data.activeProductId).toBeNull();
    expect(body.data.provider).toBeNull();
    expect(body.data.expiresAt).toBeNull();
    expect(body.data.trialEndsAt).toBeNull();
  });

  test("lapsed `active` row (expiresAt in the past) is NOT entitled", async () => {
    // The regression this fixes end-to-end: the read path used to return the
    // row verbatim without ever comparing `expiresAt` to now, so a
    // subscription that stopped paying kept full Pro access indefinitely.
    // `status` still reads `active` — only the billing-cycle sweep writes
    // `expired` — but `isEntitled` is what every gate consults.
    const user = await seedUser();
    await getPrisma().subscription.create({
      data: {
        userId: user.id,
        status: "active",
        activePlanId: "plan_month",
        provider: "decentro",
        expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
      },
    });

    const res = await app.inject({
      method: "GET",
      url: "/subscription/status",
      headers: { authorization: `Bearer ${mintToken(user)}` },
    });
    expect(res.statusCode).toBe(200);
    const body: StatusBody = res.json();
    expect(body.data.status).toBe("active");
    expect(body.data.isEntitled).toBe(false);
  });

  test("`trialing` row inside its window IS entitled", async () => {
    // The forward-looking half: without this, introducing `trialing` would
    // have locked trial users out of the content they just signed up for.
    const user = await seedUser();
    const trialEnds = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    await getPrisma().subscription.create({
      data: {
        userId: user.id,
        status: "trialing",
        activePlanId: "month",
        activeProductId: "prabhuji_vip_month",
        provider: "decentro",
        trialEndsAt: trialEnds,
        trialConsumedAt: new Date(),
      },
    });

    const res = await app.inject({
      method: "GET",
      url: "/subscription/status",
      headers: { authorization: `Bearer ${mintToken(user)}` },
    });
    expect(res.statusCode).toBe(200);
    const body: StatusBody = res.json();
    expect(body.data.status).toBe("trialing");
    expect(body.data.isEntitled).toBe(true);
    expect(body.data.trialEndsAt).toBe(trialEnds.toISOString());
    // Still never on the wire, trial or not.
    expect(body.data).not.toHaveProperty("providerSubscriptionId");
  });

  test("seeded active Pro user → returns active with plan + expires + provider", async () => {
    const user = await seedUser();
    const expires = new Date("2026-12-31T23:59:59.000Z");
    await getPrisma().subscription.create({
      data: {
        userId: user.id,
        status: "active",
        activePlanId: "plan_month",
        activeProductId: "product_month",
        provider: "razorpay",
        // Note: `providerSubscriptionId` is stored but NEVER returned on the
        // wire — see spec §"Data Protection".
        providerSubscriptionId: "sub_razor_secret_id",
        expiresAt: expires,
        startedAt: new Date("2026-06-01T00:00:00.000Z"),
      },
    });
    const token = mintToken(user);

    const res = await app.inject({
      method: "GET",
      url: "/subscription/status",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body: StatusBody = res.json();
    expect(body.data.status).toBe("active");
    expect(body.data.activePlanId).toBe("plan_month");
    expect(body.data.activeProductId).toBe("product_month");
    expect(body.data.provider).toBe("razorpay");
    expect(body.data.expiresAt).toBe("2026-12-31T23:59:59.000Z");
    // Defense in depth: the wire payload must NEVER contain the raw
    // provider subscription id (spec §"Data Protection"). Assert against
    // the raw response text to be safe.
    expect(res.body).not.toContain("sub_razor_secret_id");
  });

  test("expired subscription → returns 'expired' verbatim (no auto-downgrade)", async () => {
    // Per the TAM-47 spec: the read path is pure. If the row says `expired`,
    // return `expired`. The write path (a future ticket) owns the expire
    // transition.
    const user = await seedUser();
    await getPrisma().subscription.create({
      data: {
        userId: user.id,
        status: "expired",
        activePlanId: null,
        activeProductId: null,
        provider: "razorpay",
        expiresAt: new Date("2025-01-01T00:00:00.000Z"),
      },
    });
    const token = mintToken(user);

    const res = await app.inject({
      method: "GET",
      url: "/subscription/status",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body: StatusBody = res.json();
    expect(body.data.status).toBe("expired");
    expect(body.data.expiresAt).toBe("2025-01-01T00:00:00.000Z");
  });

  test("expiresAt null (present-vs-null coverage)", async () => {
    const user = await seedUser();
    await getPrisma().subscription.create({
      data: {
        userId: user.id,
        status: "pending",
        expiresAt: null,
      },
    });
    const token = mintToken(user);

    const res = await app.inject({
      method: "GET",
      url: "/subscription/status",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body: StatusBody = res.json();
    expect(body.data.status).toBe("pending");
    expect(body.data.expiresAt).toBeNull();
  });

  test("scoped to the JWT — one user cannot fetch another's state", async () => {
    // No query param means there's no way to fetch another user's state,
    // but assert that a token issued for user A returns A's row even when
    // user B has a Pro subscription of their own.
    const alice = await seedUser();
    const bob = await seedUser();
    await getPrisma().subscription.create({
      data: {
        userId: alice.id,
        status: "free",
      },
    });
    await getPrisma().subscription.create({
      data: {
        userId: bob.id,
        status: "active",
        activePlanId: "plan_quarter",
        provider: "razorpay",
      },
    });

    const aliceToken = mintToken(alice);
    const res = await app.inject({
      method: "GET",
      url: "/subscription/status",
      headers: { authorization: `Bearer ${aliceToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body: StatusBody = res.json();
    expect(body.data.status).toBe("free");
    expect(body.data.activePlanId).toBeNull();
  });
});

describe("entitledUntil on the wire", () => {
  /** Comfortably ahead of `now`, so each deadline column is a live one. */
  const FUTURE = new Date(Date.now() + 7 * 24 * 60 * 60_000);

  /**
   * The client caches entitlement and expires it using this field, so it must
   * arrive for EVERY entitled state — not just `trialing`. A null on a live
   * grant would make a cached `true` immortal again, which is the bug the field
   * exists to close.
   */
  test.each([
    ["trialing", "trialEndsAt"],
    ["active", "expiresAt"],
    ["past_due", "graceUntil"],
    ["cancelled", "expiresAt"],
  ])("%s carries its deadline", async (status, column) => {
    const user = await seedUser();
    await getPrisma().subscription.create({
      data: { userId: user.id, status, [column]: FUTURE },
    });

    const res = await app.inject({
      method: "GET",
      url: "/subscription/status",
      headers: { authorization: `Bearer ${mintToken(user)}` },
    });

    const body: StatusBody = res.json();
    expect(body.data.isEntitled).toBe(true);
    expect(body.data.entitledUntil).toBe(FUTURE.toISOString());
  });

  test("a free user has no deadline", async () => {
    const user = await seedUser();
    await getPrisma().subscription.create({
      data: { userId: user.id, status: "free" },
    });

    const res = await app.inject({
      method: "GET",
      url: "/subscription/status",
      headers: { authorization: `Bearer ${mintToken(user)}` },
    });
    const body: StatusBody = res.json();
    expect(body.data.entitledUntil).toBeNull();
  });
});
