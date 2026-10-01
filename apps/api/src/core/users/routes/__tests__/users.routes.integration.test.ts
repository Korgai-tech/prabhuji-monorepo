import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import jwt from "jsonwebtoken";
import type { FastifyInstance } from "fastify";
import { buildApp } from "@api/app";
import { startTestDb, stopTestDb } from "@api/shared/testing";
import { disconnectPrisma, getPrisma } from "@api/shared/database";
import { clearGlobalServices } from "@api/shared/workspace";
import { resetEnvCache } from "@api/shared/config";
import { initAuthModule } from "@api/core/auth";
import { initUsersModule } from "@api/core/users";

/**
 * Integration coverage for `/users/me` — real Postgres via testcontainers.
 *
 * The auth module is initialised so `authMiddleware` can resolve its
 * `performServiceCall("auth", …)` handshake — without it the middleware
 * throws SERVICE_UNAVAILABLE regardless of token validity. Tokens are
 * signed directly with the JWT secret (matching AuthService's payload
 * shape) so we don't have to route through OTP for every test.
 */

const JWT_SECRET = "a-sufficiently-long-secret-for-users-tests";

interface MeBody {
  success: boolean;
  message: string;
  data: {
    user: {
      id: string;
      name: string | null;
      selectedLanguage: string | null;
      onboardingCompletedAt: string | null;
      phoneCountryCode: string | null;
      phoneNumber: string | null;
    };
    chatConfig: Record<string, unknown>;
    landing: { deeplink: string; module: string; source: string; utmCode: string };
  };
}

interface ErrBody {
  success: boolean;
  message: string;
  data: null;
  errorCode?: string;
}

let app: FastifyInstance;

async function seedUser(overrides?: {
  name?: string | null;
  selectedLanguage?: string | null;
  onboardingCompletedAt?: Date | null;
  phoneCountryCode?: string | null;
  phoneVerifiedAt?: Date | null;
  firstUtmGroup?: string | null;
}): Promise<{ id: string; phoneNumber: string }> {
  // A phone account exactly as `core/otp` writes one: a number, and no email or
  // password at all. Both used to be fabricated here to satisfy NOT NULL.
  const phoneNumber = uniquePhone();
  const created = await getPrisma().user.create({
    data: {
      phoneCountryCode: overrides?.phoneCountryCode ?? "+91",
      phoneNumber,
      loginType: "otp",
      name: overrides?.name ?? null,
      selectedLanguage: overrides?.selectedLanguage ?? null,
      onboardingCompletedAt: overrides?.onboardingCompletedAt ?? null,
      phoneVerifiedAt: overrides?.phoneVerifiedAt ?? null,
      firstUtmGroup: overrides?.firstUtmGroup ?? null,
    },
  });
  return { id: created.id, phoneNumber };
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

beforeAll(async () => {
  process.env.JWT_SECRET = JWT_SECRET;
  process.env.AUTH_OTP_PEPPER = "integration-test-pepper-not-secret-32chars";
  process.env.AUTH_OTP_PROVIDER = "stub";
  process.env.ENABLE_REDIS = "false";
  resetEnvCache();
  await startTestDb();
  app = await buildApp();
  initAuthModule(app);
  initUsersModule(app);
  await app.ready();
}, 120_000);

afterAll(async () => {
  await app.close();
  clearGlobalServices();
  await disconnectPrisma();
  await stopTestDb();
});

describe("auth gate", () => {
  test("GET /users/me without a JWT returns 401", async () => {
    const res = await app.inject({ method: "GET", url: "/users/me" });
    expect(res.statusCode).toBe(401);
    const body: ErrBody = res.json();
    expect(body.success).toBe(false);
    expect(body.data).toBeNull();
  });

  test("PATCH /users/me without a JWT returns 401", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: "/users/me",
      payload: { name: "Ram" },
    });
    expect(res.statusCode).toBe(401);
  });

  test("PATCH /users/me with an invalid JWT returns 401", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: "/users/me",
      headers: { authorization: "Bearer not-a-real-token" },
      payload: { name: "Ram" },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe("PATCH /users/me — happy paths", () => {
  test("both name and language on a fresh user flips onboardingCompletedAt", async () => {
    const user = await seedUser();
    const token = mintToken(user);

    const res = await app.inject({
      method: "PATCH",
      url: "/users/me",
      headers: { authorization: `Bearer ${token}` },
      payload: { name: "Ram", selectedLanguage: "hi" },
    });

    expect(res.statusCode).toBe(200);
    const body: MeBody = res.json();
    expect(body.success).toBe(true);
    expect(body.data.user.id).toBe(user.id);
    expect(body.data.user.name).toBe("Ram");
    expect(body.data.user.selectedLanguage).toBe("hi");
    expect(body.data.user.onboardingCompletedAt).not.toBeNull();
    expect(body.data.user.phoneCountryCode).toBe("+91");
  });

  test("name is trimmed at the Zod boundary (`  Ram  ` → `Ram`)", async () => {
    const user = await seedUser();
    const token = mintToken(user);

    const res = await app.inject({
      method: "PATCH",
      url: "/users/me",
      headers: { authorization: `Bearer ${token}` },
      payload: { name: "  Ram  " },
    });

    expect(res.statusCode).toBe(200);
    const body: MeBody = res.json();
    expect(body.data.user.name).toBe("Ram");

    // Persisted trimmed too.
    const row = await getPrisma().user.findUnique({ where: { id: user.id } });
    expect(row?.name).toBe("Ram");
  });

  test("name-only patch on a user without prior language keeps onboarding null", async () => {
    const user = await seedUser();
    const token = mintToken(user);

    const res = await app.inject({
      method: "PATCH",
      url: "/users/me",
      headers: { authorization: `Bearer ${token}` },
      payload: { name: "Ram" },
    });

    expect(res.statusCode).toBe(200);
    const body: MeBody = res.json();
    expect(body.data.user.name).toBe("Ram");
    expect(body.data.user.selectedLanguage).toBeNull();
    expect(body.data.user.onboardingCompletedAt).toBeNull();
  });

  test("onboardingCompletedAt is stable across subsequent reads/writes", async () => {
    const user = await seedUser();
    const token = mintToken(user);

    // First save — flip.
    const first = await app.inject({
      method: "PATCH",
      url: "/users/me",
      headers: { authorization: `Bearer ${token}` },
      payload: { name: "Ram", selectedLanguage: "hi" },
    });
    expect(first.statusCode).toBe(200);
    const firstBody: MeBody = first.json();
    const firstStamp = firstBody.data.user.onboardingCompletedAt;
    expect(firstStamp).not.toBeNull();

    // Second save — different name, but stamp must not move.
    const second = await app.inject({
      method: "PATCH",
      url: "/users/me",
      headers: { authorization: `Bearer ${token}` },
      payload: { name: "Rama" },
    });
    expect(second.statusCode).toBe(200);
    const secondBody: MeBody = second.json();
    expect(secondBody.data.user.name).toBe("Rama");
    expect(secondBody.data.user.onboardingCompletedAt).toBe(firstStamp);

    // GET returns the same stamp.
    const get = await app.inject({
      method: "GET",
      url: "/users/me",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(get.statusCode).toBe(200);
    const getBody: MeBody = get.json();
    expect(getBody.data.user.onboardingCompletedAt).toBe(firstStamp);
  });
});

describe("PATCH /users/me — validation", () => {
  test("empty body (no patch fields) is 400", async () => {
    const user = await seedUser();
    const token = mintToken(user);
    const res = await app.inject({
      method: "PATCH",
      url: "/users/me",
      headers: { authorization: `Bearer ${token}` },
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  test("unknown language code (`xx`) is 400", async () => {
    const user = await seedUser();
    const token = mintToken(user);
    const res = await app.inject({
      method: "PATCH",
      url: "/users/me",
      headers: { authorization: `Bearer ${token}` },
      payload: { selectedLanguage: "xx" },
    });
    expect(res.statusCode).toBe(400);
  });

  test("whitespace-only name (`   `) is 400 (trims to empty)", async () => {
    const user = await seedUser();
    const token = mintToken(user);
    const res = await app.inject({
      method: "PATCH",
      url: "/users/me",
      headers: { authorization: `Bearer ${token}` },
      payload: { name: "   " },
    });
    expect(res.statusCode).toBe(400);
  });

  test("name over 64 chars is 400", async () => {
    const user = await seedUser();
    const token = mintToken(user);
    const res = await app.inject({
      method: "PATCH",
      url: "/users/me",
      headers: { authorization: `Bearer ${token}` },
      payload: { name: "a".repeat(65) },
    });
    expect(res.statusCode).toBe(400);
  });

  test("client-supplied onboardingCompletedAt is rejected (strict schema)", async () => {
    const user = await seedUser();
    const token = mintToken(user);

    // Injection attempt: user tries to set the timestamp themselves.
    const res = await app.inject({
      method: "PATCH",
      url: "/users/me",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        name: "Ram",
        onboardingCompletedAt: "2020-01-01T00:00:00.000Z",
      },
    });

    // .strict() rejects the unknown key.
    expect(res.statusCode).toBe(400);

    // And nothing was persisted.
    const row = await getPrisma().user.findUnique({ where: { id: user.id } });
    expect(row?.name).toBeNull();
    expect(row?.onboardingCompletedAt).toBeNull();
  });
});

describe("GET /users/me — public shape hygiene", () => {
  test("chatConfig publishes exactly its seven keys, including the three snake_case ones", async () => {
    // `show_kuldeveta_chat` is snake_case, and spelled "kuldeveta" rather than
    // the "kuldevta" used by the routes, the tables and its own sibling
    // `kuldevtaAssigned` — both deliberate, and the mobile app is ALREADY
    // coded against this exact key. Renaming it would hide the kuldevta chat
    // entry point on every shipped build, which is why it is pinned here. The service keeps the idiomatic `showKuldevtaChat` and the
    // controller renames it at the boundary, which is exactly the kind of
    // hand-mapping that silently reverts on the next refactor. So the
    // published key is asserted here, through the real route and the real
    // response serializer.
    const user = await seedUser({});
    const token = mintToken(user);

    const res = await app.inject({
      method: "GET",
      url: "/users/me",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body: MeBody = res.json();

    expect(Object.keys(body.data.chatConfig).sort()).toEqual(
      [
        "agentId",
        "chat_type",
        "enabled",
        "kuldevtaAssigned",
        "kuldeveta_name",
        // TAM-N (#278): the server-side chat paywall switch.
        "requiresPro",
        "show_kuldeveta_chat",
      ].sort()
    );
    expect(typeof body.data.chatConfig["show_kuldeveta_chat"]).toBe("boolean");
    // Nullable, and null for this seeded user — who is not in the kuldevta arm.
    expect(body.data.chatConfig["kuldeveta_name"]).toBeNull();
    // The camelCase names must NOT leak onto the wire alongside them.
    expect(body.data.chatConfig).not.toHaveProperty("showKuldevtaChat");
    expect(body.data.chatConfig).not.toHaveProperty("kuldevtaName");
    expect(body.data.chatConfig).not.toHaveProperty("chatType");
  });

  test("response shape is exactly PublicUser — carries the phone, never email / passwordHash", async () => {
    const user = await seedUser({
      name: "Ram",
      selectedLanguage: "hi",
      onboardingCompletedAt: new Date("2025-06-15T10:30:00.000Z"),
    });
    const token = mintToken(user);

    const res = await app.inject({
      method: "GET",
      url: "/users/me",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body: MeBody = res.json();

    // Positive: expected fields present.
    expect(Object.keys(body.data.user).sort()).toEqual(
      [
        "id",
        "name",
        "onboardingCompletedAt",
        "phoneCountryCode",
        "phoneNumber",
        "selectedLanguage",
      ].sort()
    );

    // The phone is now DELIBERATELY exposed — it is the app's only identity
    // fact about its own user, and it needs to show which number payment
    // notifications will reach. Asserted positively so a silent removal fails
    // here rather than surfacing as a blank profile screen.
    expect(body.data.user.phoneNumber).toBe(user.phoneNumber);

    // Negative: credentials absent, both at the object level and in the raw
    // response body (defence-in-depth against nested serialization). They are
    // null on a phone account anyway — this proves the projection excludes
    // them for an email account too.
    expect(body.data.user).not.toHaveProperty("email");
    expect(body.data.user).not.toHaveProperty("passwordHash");
    expect(res.body).not.toContain("passwordHash");
  });

  test("returns ISO-8601 datetime string for onboardingCompletedAt", async () => {
    const at = new Date("2025-06-15T10:30:00.000Z");
    const user = await seedUser({
      name: "Ram",
      selectedLanguage: "hi",
      onboardingCompletedAt: at,
    });
    const token = mintToken(user);
    const res = await app.inject({
      method: "GET",
      url: "/users/me",
      headers: { authorization: `Bearer ${token}` },
    });
    const body: MeBody = res.json();
    expect(body.data.user.onboardingCompletedAt).toBe(at.toISOString());
  });
});

/**
 * TAM-258 — the one-time ad landing, against the real database.
 *
 * The abtesting service is stubbed at `fetch` (the app never reaches it any
 * other way), so what this suite actually proves is the half the unit tests
 * cannot: that serving the landing WRITES the marker, and that the next request
 * reads it back and answers differently. That round trip is the entire
 * once-ness guarantee, and it lives in Postgres.
 */
describe("GET /users/me — landing (TAM-258)", () => {
  const AD_ARM = { inExperiment: true, bucket: 951, variant: { id: "ad_module", payload: {} } };

  function stubAbtestAsAdArm(): void {
    process.env.ABTEST_BASE_URL = "https://platform.test/abtesting";
    process.env.ABTEST_TENANT_KEY = "prabhuji.dev.key";
    process.env.LANDING_EXPERIMENT_START_AT = "2026-09-23T00:00:00.000Z";
    resetEnvCache();
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init: RequestInit) => {
        const body = JSON.parse(init.body as string) as { apiId: string };
        const payload =
          body.apiId === "land_as_utm"
            ? AD_ARM
            : { inExperiment: false, bucket: 12, defaultConfig: null };
        return Promise.resolve(
          new Response(JSON.stringify(payload), {
            status: 200,
            headers: { "content-type": "application/json" },
          })
        );
      })
    );
  }

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.ABTEST_BASE_URL;
    delete process.env.ABTEST_TENANT_KEY;
    delete process.env.LANDING_EXPERIMENT_START_AT;
    resetEnvCache();
  });

  test("serves the ad's module once, then Home — and stamps the marker", async () => {
    stubAbtestAsAdArm();
    const user = await seedUser({
      phoneVerifiedAt: new Date("2026-09-24T10:00:00.000Z"),
      firstUtmGroup: "prabhuji_RTG_hi",
    });
    const headers = { authorization: `Bearer ${mintToken(user)}`, app_version: "1.2.0" };

    const first = await app.inject({ method: "GET", url: "/users/me", headers });
    const firstBody: MeBody = first.json();
    expect(firstBody.data.landing).toEqual({
      deeplink: "prabhuji://ringtone",
      module: "ringtone",
      source: "utm_matched",
      utmCode: "RTG",
    });

    const stamped = await getPrisma().user.findUnique({
      where: { id: user.id },
      select: { adLandingConsumedAt: true },
    });
    expect(stamped?.adLandingConsumedAt).not.toBeNull();

    const second = await app.inject({ method: "GET", url: "/users/me", headers });
    const secondBody: MeBody = second.json();
    expect(secondBody.data.landing.module).toBe("home");
    expect(secondBody.data.landing.source).toBe("not_in_experiment");
  });

  /**
   * The floor is enforced in OUR code, not only by console targeting: a build
   * without the `ringtone` route must not be routed there by a misconfigured
   * experiment, and it is the header that says which build this is.
   */
  test("a build below the floor is excluded even though the console says treatment", async () => {
    stubAbtestAsAdArm();
    const user = await seedUser({
      phoneVerifiedAt: new Date("2026-09-24T10:00:00.000Z"),
      firstUtmGroup: "prabhuji_RTG_hi",
    });
    const res = await app.inject({
      method: "GET",
      url: "/users/me",
      headers: { authorization: `Bearer ${mintToken(user)}`, app_version: "1.1.9" },
    });
    const body: MeBody = res.json();
    expect(body.data.landing).toEqual({
      deeplink: "",
      module: "home",
      source: "not_in_experiment",
      utmCode: "",
    });

    const untouched = await getPrisma().user.findUnique({
      where: { id: user.id },
      select: { adLandingConsumedAt: true },
    });
    expect(untouched?.adLandingConsumedAt).toBeNull();
  });

  /** With no abtesting service configured at all — production today — Home. */
  test("an unconfigured environment lands everyone on Home", async () => {
    const user = await seedUser({
      phoneVerifiedAt: new Date("2026-09-24T10:00:00.000Z"),
      firstUtmGroup: "prabhuji_STS_hi",
    });
    const res = await app.inject({
      method: "GET",
      url: "/users/me",
      headers: { authorization: `Bearer ${mintToken(user)}`, app_version: "1.2.0" },
    });
    const body: MeBody = res.json();
    expect(body.data.landing.module).toBe("home");
  });
});
