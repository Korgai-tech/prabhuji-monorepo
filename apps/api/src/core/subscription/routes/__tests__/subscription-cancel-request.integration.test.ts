import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import jwt from "jsonwebtoken";
import type { FastifyInstance } from "fastify";
import { buildApp } from "@api/app";
import { startTestDb, stopTestDb } from "@api/shared/testing";
import { disconnectPrisma, getPrisma } from "@api/shared/database";
import { clearGlobalServices, registerGlobalService } from "@api/shared/workspace";
import { AppError } from "@api/shared/errors";
import type { IPaymentApi } from "@api/core/payment/api";
import { resetEnvCache } from "@api/shared/config";
import { initAuthModule } from "@api/core/auth";
import { initSubscriptionModule } from "@api/core/subscription";

/**
 * Integration coverage for TAM-125's two endpoints — real Postgres via
 * testcontainers.
 *
 * The auth module is initialised so `authMiddleware` can resolve its
 * `performServiceCall("auth", …)` handshake. Tokens are signed directly with
 * the JWT secret (matching AuthService's payload shape) so we don't have to
 * route through OTP.
 *
 * Each test wipes the cancellation-request + subscription tables to a known
 * state; the `mandates` table is inspected as-is and never written to
 * (asserting the "no side-effects on payment tables" invariant).
 */

const JWT_SECRET = "a-sufficiently-long-secret-for-cancel-request-tests";

interface CancelRequestBody {
  success: boolean;
  message: string;
  data: {
    id: string;
    status: "pending" | "processing" | "completed" | "rejected";
    reason: string | null;
    requestedAt: string;
    processedAt: string | null;
  } | null;
}

interface ErrBody {
  success: boolean;
  message: string;
  data: null;
  errorCode?: string;
}

let app: FastifyInstance;

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

let phoneSeq = 0;
function uniquePhone(): string {
  phoneSeq += 1;
  return `9${String(phoneSeq).padStart(9, "0")}`;
}

function mintToken(user: { id: string }): string {
  return jwt.sign({ sub: user.id }, JWT_SECRET, { expiresIn: "1h" });
}

async function seedSubscription(input: {
  userId: string;
  status?: string;
  expiresAt?: Date | null;
  trialEndsAt?: Date | null;
  startedAt?: Date | null;
}): Promise<{ id: string }> {
  const row = await getPrisma().subscription.create({
    data: {
      userId: input.userId,
      status: input.status ?? "active",
      activePlanId: "month",
      activeProductId: "prabhuji_vip_month",
      provider: "decentro",
      // The WHOLE id, not a prefix. `User.id` is uuid v7 now
      // (docs/UUID-V7-MIGRATION.md), so its first 8 hex chars are pure
      // millisecond timestamp — two users minted in the same millisecond
      // would collide here.
      providerSubscriptionId: `mandate_${input.userId}`,
      expiresAt:
        input.expiresAt === undefined
          ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
          : input.expiresAt,
      trialEndsAt: input.trialEndsAt ?? null,
      startedAt: input.startedAt ?? new Date("2026-06-01T00:00:00.000Z"),
    },
    select: { id: true },
  });
  return row;
}

async function truncateAll(): Promise<void> {
  const prisma = getPrisma();
  await prisma.subscriptionCancellationRequest.deleteMany({});
  await prisma.subscription.deleteMany({});
}

/**
 * Stands in for `core/payment` — the real module is not booted here (it wants a
 * gateway, a scheduler and a mandate table this suite has no business owning).
 *
 * Reassign to change the outcome of the revoke for one test. `true` = revoked,
 * `false` = nothing to revoke, throw = gateway failure.
 */
let cancelMandateOutcome: () => Promise<boolean> = () => Promise.resolve(true);
/** Every `(userId)` the route drove a revoke for, in order. */
let revokeCalls: string[] = [];

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
  registerGlobalService("payment", {
    cancelMandateForUser: (userId: string) => {
      revokeCalls.push(userId);
      return cancelMandateOutcome();
    },
  } as unknown as IPaymentApi);
  await app.ready();
}, 120_000);

afterAll(async () => {
  await app.close();
  clearGlobalServices();
  await disconnectPrisma();
  await stopTestDb();
});

beforeEach(async () => {
  await truncateAll();
  cancelMandateOutcome = () => Promise.resolve(true);
  revokeCalls = [];
});

describe("auth gate", () => {
  test("POST /subscription/cancel-requests without a JWT returns 401", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/subscription/cancel-requests",
      payload: {},
    });
    expect(res.statusCode).toBe(401);
  });

  test("GET /subscription/cancel-requests/me without a JWT returns 401", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/subscription/cancel-requests/me",
    });
    expect(res.statusCode).toBe(401);
  });
});

describe("POST /subscription/cancel-requests", () => {
  test("active user, no existing request → 201, revoked at the gateway, row completed", async () => {
    const user = await seedUser();
    const sub = await seedSubscription({ userId: user.id, status: "active" });

    const res = await app.inject({
      method: "POST",
      url: "/subscription/cancel-requests",
      headers: { authorization: `Bearer ${mintToken(user)}` },
      payload: {},
    });

    expect(res.statusCode).toBe(201);
    const body: CancelRequestBody = res.json();
    expect(body.success).toBe(true);
    expect(body.data).toMatchObject({ status: "completed", reason: null });
    expect(body.data?.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(body.data?.processedAt).not.toBeNull();

    // The endpoint the SHIPPED APP calls must actually reach the gateway. This
    // used to enqueue a row and stop, leaving the user subscribed at the
    // provider until ops ran the revoke by hand.
    expect(revokeCalls).toEqual([user.id]);

    // The row landed in the DB, tied to the correct subscription.
    const rows = await getPrisma().subscriptionCancellationRequest.findMany({
      where: { userId: user.id },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].subscriptionId).toBe(sub.id);
    expect(rows[0].status).toBe("completed");
    expect(rows[0].processedAt).not.toBeNull();
  });

  test("gateway failure → 502, row rejected, and the user can retry", async () => {
    const user = await seedUser();
    await seedSubscription({ userId: user.id, status: "active" });

    // An `AppError`, because that is what the real facade guarantees: it
    // re-raises raw transport failures as one so the gateway's own words
    // survive `performServiceCall`, which replaces any other error type with a
    // generic string. A plain `Error` here would test a contract the payment
    // module does not have.
    cancelMandateOutcome = () =>
      Promise.reject(
        new AppError("gateway unreachable", 502, "PROVIDER_CANCEL_FAILED")
      );
    const failed = await app.inject({
      method: "POST",
      url: "/subscription/cancel-requests",
      headers: { authorization: `Bearer ${mintToken(user)}` },
      payload: {},
    });
    expect(failed.statusCode).toBe(502);

    const afterFailure =
      await getPrisma().subscriptionCancellationRequest.findMany({
        where: { userId: user.id },
      });
    expect(afterFailure).toHaveLength(1);
    expect(afterFailure[0].status).toBe("rejected");
    expect(afterFailure[0].notes).toContain("gateway unreachable");

    // THE point of stamping `rejected` instead of leaving it `pending`: the
    // partial unique index blocks a second PENDING row, so a failure parked
    // there would 409 this retry forever and lock the user out of cancelling.
    cancelMandateOutcome = () => Promise.resolve(true);
    const retry = await app.inject({
      method: "POST",
      url: "/subscription/cancel-requests",
      headers: { authorization: `Bearer ${mintToken(user)}` },
      payload: {},
    });
    expect(retry.statusCode).toBe(201);
    expect(retry.json<CancelRequestBody>().data?.status).toBe("completed");
  });

  test("nothing to revoke at the gateway is still a completed cancellation", async () => {
    const user = await seedUser();
    await seedSubscription({ userId: user.id, status: "active" });

    cancelMandateOutcome = () => Promise.resolve(false);
    const res = await app.inject({
      method: "POST",
      url: "/subscription/cancel-requests",
      headers: { authorization: `Bearer ${mintToken(user)}` },
      payload: {},
    });

    expect(res.statusCode).toBe(201);
    expect(res.json<CancelRequestBody>().data?.status).toBe("completed");
  });

  test("persists a supplied reason", async () => {
    const user = await seedUser();
    await seedSubscription({ userId: user.id });

    const res = await app.inject({
      method: "POST",
      url: "/subscription/cancel-requests",
      headers: { authorization: `Bearer ${mintToken(user)}` },
      payload: { reason: "too expensive" },
    });

    expect(res.statusCode).toBe(201);
    const rows = await getPrisma().subscriptionCancellationRequest.findMany({
      where: { userId: user.id },
    });
    expect(rows[0].reason).toBe("too expensive");
  });

  test("free user → 409 NO_ACTIVE_SUBSCRIPTION", async () => {
    const user = await seedUser();
    await seedSubscription({
      userId: user.id,
      status: "free",
      expiresAt: null,
    });

    const res = await app.inject({
      method: "POST",
      url: "/subscription/cancel-requests",
      headers: { authorization: `Bearer ${mintToken(user)}` },
      payload: {},
    });

    expect(res.statusCode).toBe(409);
    const body: ErrBody = res.json();
    expect(body.errorCode).toBe("NO_ACTIVE_SUBSCRIPTION");

    // No row inserted.
    expect(
      await getPrisma().subscriptionCancellationRequest.count({
        where: { userId: user.id },
      })
    ).toBe(0);
  });

  test("expired user → 409 NO_ACTIVE_SUBSCRIPTION", async () => {
    const user = await seedUser();
    await seedSubscription({
      userId: user.id,
      status: "expired",
      expiresAt: null,
    });

    const res = await app.inject({
      method: "POST",
      url: "/subscription/cancel-requests",
      headers: { authorization: `Bearer ${mintToken(user)}` },
      payload: {},
    });
    expect(res.statusCode).toBe(409);
    expect(res.json<ErrBody>().errorCode).toBe("NO_ACTIVE_SUBSCRIPTION");
  });

  test("user with no subscription row → 409 NO_ACTIVE_SUBSCRIPTION", async () => {
    const user = await seedUser();

    const res = await app.inject({
      method: "POST",
      url: "/subscription/cancel-requests",
      headers: { authorization: `Bearer ${mintToken(user)}` },
      payload: {},
    });
    expect(res.statusCode).toBe(409);
    expect(res.json<ErrBody>().errorCode).toBe("NO_ACTIVE_SUBSCRIPTION");
  });

  test("a SEQUENTIAL second cancel succeeds — rows no longer sit pending", async () => {
    // This case used to be the 409. It is not any more, and the reason is the
    // whole change: a request reaches `completed` before the response is
    // written, so there is no pending row left for a later tap to collide
    // with. `PENDING_REQUEST_EXISTS` now means genuine concurrency (below),
    // not "ops has not got to you yet".
    //
    // The second revoke is safe rather than merely tolerated: `cancelForUser`
    // short-circuits on a mandate already in a terminal state, so it never
    // reaches the gateway twice.
    const user = await seedUser();
    await seedSubscription({ userId: user.id });

    const first = await app.inject({
      method: "POST",
      url: "/subscription/cancel-requests",
      headers: { authorization: `Bearer ${mintToken(user)}` },
      payload: {},
    });
    expect(first.statusCode).toBe(201);
    expect(first.json<CancelRequestBody>().data?.status).toBe("completed");

    const second = await app.inject({
      method: "POST",
      url: "/subscription/cancel-requests",
      headers: { authorization: `Bearer ${mintToken(user)}` },
      payload: {},
    });
    expect(second.statusCode).toBe(201);

    expect(
      await getPrisma().subscriptionCancellationRequest.count({
        where: { userId: user.id, status: "pending" },
      })
    ).toBe(0);
  });

  test("concurrent POSTs from one user → one 201, one 409, ONE revoke", async () => {
    // The gate combines a SELECT-FOR-UPDATE inside the tx AND the partial
    // unique index on the table. Two fires-at-once cases must always
    // resolve to one row, whichever gate catches the loser.
    //
    // It now guards something sharper than a duplicate row: a duplicate
    // GATEWAY CALL. The revoke is held open below so the second request
    // arrives while the first is still mid-flight — which is exactly the
    // window a double-tap on a slow connection produces, and without the
    // barrier the fake would resolve too fast to ever exercise it.
    const user = await seedUser();
    await seedSubscription({ userId: user.id });
    const token = mintToken(user);

    let release: () => void = () => {};
    const inFlight = new Promise<void>((resolve) => {
      release = resolve;
    });
    let started = 0;
    cancelMandateOutcome = async () => {
      started += 1;
      await inFlight;
      return true;
    };

    const first = app.inject({
      method: "POST",
      url: "/subscription/cancel-requests",
      headers: { authorization: `Bearer ${token}` },
      payload: {},
    });
    // Let the winner insert its row and enter the revoke before the second
    // request is admitted.
    while (started === 0) await new Promise((r) => setTimeout(r, 5));

    const second = await app.inject({
      method: "POST",
      url: "/subscription/cancel-requests",
      headers: { authorization: `Bearer ${token}` },
      payload: {},
    });
    release();
    const a = await first;

    expect(a.statusCode).toBe(201);
    expect(second.statusCode).toBe(409);
    expect(second.json<ErrBody>().errorCode).toBe("PENDING_REQUEST_EXISTS");

    // The assertion that matters: the loser was turned away BEFORE it could
    // raise a second revoke against the same mandate.
    expect(revokeCalls).toEqual([user.id]);
    expect(
      await getPrisma().subscriptionCancellationRequest.count({
        where: { userId: user.id },
      })
    ).toBe(1);
  });

  test("trialing user → 201, and THIS MODULE writes nothing to subscriptions", async () => {
    // Scope note, because the assertion is narrower than it looks. In
    // production a successful cancel DOES end up flipping this row — but
    // `core/payment` does it, inside `cancelForUser`, through this module's own
    // facade, so `subscriptions` keeps exactly one writer. Payment is faked out
    // here, so what survives is the real invariant for THIS module: the cancel
    // path does not reach around the facade and write entitlement itself.
    //
    // The entitlement transition (`cancelled`, keeping access until
    // `expiresAt`) is covered where it lives, in the payment module's tests.
    const user = await seedUser();
    const trialEndsAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    await seedSubscription({
      userId: user.id,
      status: "trialing",
      expiresAt: null,
      trialEndsAt,
    });

    const before = await getPrisma().subscription.findUnique({
      where: { userId: user.id },
    });

    const res = await app.inject({
      method: "POST",
      url: "/subscription/cancel-requests",
      headers: { authorization: `Bearer ${mintToken(user)}` },
      payload: {},
    });
    expect(res.statusCode).toBe(201);

    const after = await getPrisma().subscription.findUnique({
      where: { userId: user.id },
    });

    // Only `updatedAt` is off-limits — Prisma's default is untouched for
    // reads, so the full row must match verbatim. If either transitions this
    // row, the whole comparison fails, not just one column.
    expect(after).toEqual(before);
  });

  test("cancellation-scheduled subscription (status=cancelled) → still 201 and mandates unchanged", async () => {
    // A user whose ops-flip already ran but who tries again from a stale UI
    // must not crash — `cancelled` is not in the ineligible set. This is a
    // rare double-tap safety net rather than a design decision.
    const user = await seedUser();
    await seedSubscription({
      userId: user.id,
      status: "cancelled",
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });

    const res = await app.inject({
      method: "POST",
      url: "/subscription/cancel-requests",
      headers: { authorization: `Bearer ${mintToken(user)}` },
      payload: {},
    });
    expect(res.statusCode).toBe(201);
  });

  test("this module writes neither mandates nor subscriptions directly", async () => {
    // Broader version of the trialing test — for the active path, reading both
    // tables end-to-end. Same scope caveat: payment is faked out, so this
    // asserts the SUBSCRIPTION module keeps its hands off both tables, not
    // that a production cancel leaves them untouched. It does not — that is
    // the point of the change — but every write goes through `core/payment`,
    // which owns `mandates` and is the sole caller of the entitlement facade.
    const user = await seedUser();
    await seedSubscription({ userId: user.id, status: "active" });

    const subBefore = await getPrisma().subscription.findUnique({
      where: { userId: user.id },
    });
    const mandatesBefore = await getPrisma().mandate.findMany({
      where: { userId: user.id },
    });

    const res = await app.inject({
      method: "POST",
      url: "/subscription/cancel-requests",
      headers: { authorization: `Bearer ${mintToken(user)}` },
      payload: {},
    });
    expect(res.statusCode).toBe(201);

    expect(
      await getPrisma().subscription.findUnique({ where: { userId: user.id } })
    ).toEqual(subBefore);
    expect(
      await getPrisma().mandate.findMany({ where: { userId: user.id } })
    ).toEqual(mandatesBefore);
  });

  test("rejects an oversized reason with 400", async () => {
    const user = await seedUser();
    await seedSubscription({ userId: user.id });

    const res = await app.inject({
      method: "POST",
      url: "/subscription/cancel-requests",
      headers: { authorization: `Bearer ${mintToken(user)}` },
      payload: { reason: "x".repeat(501) },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("GET /subscription/cancel-requests/me", () => {
  test("user with no request → 200 with data: null", async () => {
    const user = await seedUser();

    const res = await app.inject({
      method: "GET",
      url: "/subscription/cancel-requests/me",
      headers: { authorization: `Bearer ${mintToken(user)}` },
    });

    expect(res.statusCode).toBe(200);
    const body: CancelRequestBody = res.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeNull();
  });

  test("returns the latest row when one exists", async () => {
    const user = await seedUser();
    const sub = await seedSubscription({ userId: user.id });
    await getPrisma().subscriptionCancellationRequest.create({
      data: {
        userId: user.id,
        subscriptionId: sub.id,
        status: "pending",
        reason: null,
      },
    });

    const res = await app.inject({
      method: "GET",
      url: "/subscription/cancel-requests/me",
      headers: { authorization: `Bearer ${mintToken(user)}` },
    });

    expect(res.statusCode).toBe(200);
    const body: CancelRequestBody = res.json();
    expect(body.data).toMatchObject({
      status: "pending",
      reason: null,
      processedAt: null,
    });
  });

  test("returns a completed row with processedAt after an ops flip", async () => {
    // Simulates ops running a direct-SQL UPDATE. The endpoint must reflect
    // the new status without changing anything itself.
    const user = await seedUser();
    const sub = await seedSubscription({ userId: user.id });
    const processedAt = new Date("2026-08-01T12:00:00.000Z");
    await getPrisma().subscriptionCancellationRequest.create({
      data: {
        userId: user.id,
        subscriptionId: sub.id,
        status: "completed",
        processedAt,
        processedBy: user.id,
      },
    });

    const res = await app.inject({
      method: "GET",
      url: "/subscription/cancel-requests/me",
      headers: { authorization: `Bearer ${mintToken(user)}` },
    });

    expect(res.statusCode).toBe(200);
    const body: CancelRequestBody = res.json();
    expect(body.data?.status).toBe("completed");
    expect(body.data?.processedAt).toBe(processedAt.toISOString());
  });

  test("returns the MOST RECENT request across multiple", async () => {
    const user = await seedUser();
    const sub = await seedSubscription({ userId: user.id });
    const older = await getPrisma().subscriptionCancellationRequest.create({
      data: {
        userId: user.id,
        subscriptionId: sub.id,
        status: "rejected",
        requestedAt: new Date("2026-06-01T00:00:00.000Z"),
      },
    });
    const newer = await getPrisma().subscriptionCancellationRequest.create({
      data: {
        userId: user.id,
        subscriptionId: sub.id,
        status: "pending",
        requestedAt: new Date("2026-07-01T00:00:00.000Z"),
      },
    });

    const res = await app.inject({
      method: "GET",
      url: "/subscription/cancel-requests/me",
      headers: { authorization: `Bearer ${mintToken(user)}` },
    });

    expect(res.statusCode).toBe(200);
    const body: CancelRequestBody = res.json();
    expect(body.data?.id).toBe(newer.id);
    expect(body.data?.id).not.toBe(older.id);
  });

  test("scoped to the JWT — one user cannot see another's request", async () => {
    const alice = await seedUser();
    const bob = await seedUser();
    const subA = await seedSubscription({ userId: alice.id });
    const subB = await seedSubscription({ userId: bob.id });
    await getPrisma().subscriptionCancellationRequest.create({
      data: {
        userId: bob.id,
        subscriptionId: subB.id,
        status: "pending",
      },
    });
    void subA;

    const res = await app.inject({
      method: "GET",
      url: "/subscription/cancel-requests/me",
      headers: { authorization: `Bearer ${mintToken(alice)}` },
    });
    expect(res.statusCode).toBe(200);
    const body: CancelRequestBody = res.json();
    expect(body.data).toBeNull();
  });

  test("no side-effects on mandates or subscriptions across a GET", async () => {
    const user = await seedUser();
    const sub = await seedSubscription({ userId: user.id });
    await getPrisma().subscriptionCancellationRequest.create({
      data: {
        userId: user.id,
        subscriptionId: sub.id,
        status: "pending",
      },
    });

    const subBefore = await getPrisma().subscription.findUnique({
      where: { userId: user.id },
    });
    const mandatesBefore = await getPrisma().mandate.findMany({
      where: { userId: user.id },
    });

    const res = await app.inject({
      method: "GET",
      url: "/subscription/cancel-requests/me",
      headers: { authorization: `Bearer ${mintToken(user)}` },
    });
    expect(res.statusCode).toBe(200);

    expect(
      await getPrisma().subscription.findUnique({ where: { userId: user.id } })
    ).toEqual(subBefore);
    expect(
      await getPrisma().mandate.findMany({ where: { userId: user.id } })
    ).toEqual(mandatesBefore);
  });
});
