import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import jwt from "jsonwebtoken";
import type { FastifyInstance } from "fastify";
import { buildApp } from "@api/app";
import { startTestDb, stopTestDb } from "@api/shared/testing";
import { disconnectPrisma, getPrisma } from "@api/shared/database";
import { clearGlobalServices } from "@api/shared/workspace";
import { resetEnvCache } from "@api/shared/config";
import { initAuthModule } from "@api/core/auth";
import { initEngagementModule } from "@api/core/engagement";
import { initDeityModule } from "@api/core/deity";
import { initStatusModule } from "@api/core/status";
import { initReportsModule } from "@api/core/reports";

/**
 * TAM-N — integration coverage for `POST /reports` against a real Postgres via
 * testcontainers.
 *
 * THE PROPERTY UNDER TEST IS A SECURITY ONE. The reported account is resolved
 * server-side from the reported status (`status.getReportTarget`); the request
 * body has no `reportedUserId` and must not acquire one. Every assertion below
 * goes at the ROW, not the response envelope — the response only carries an id,
 * so a body-supplied victim would be invisible from the outside.
 *
 * WHY THE HOUSE-CREATOR SEED IS REPLAYED HERE. `startTestDb` builds the schema
 * with `prisma db push`, which applies the Prisma schema and runs NO migrations
 * — so the data-migration that inserts the house creator (`User` row, pinned
 * uuid) never executes in this database. The file is replayed verbatim from
 * disk below rather than re-typed as a fixture, so what the first test asserts
 * is the MIGRATION's content: change the pinned uuid there and this suite goes
 * red. (`reports.reported_user_id` is a logical ref with no FK, so a report
 * would still be written without the row — which is exactly why the row's
 * existence needs its own assertion rather than being assumed.)
 */

const JWT_SECRET = "a-sufficiently-long-secret-for-reports-tests";

/**
 * Pinned in BOTH `src/core/status/status.creator.ts` and the data migration
 * `20260928080000_tam_n_seed_house_creator`. Written out as a literal here on
 * purpose: importing the constant would make this suite agree with whatever the
 * constant says, and the point is to pin the wire value independently.
 */
const HOUSE_CREATOR_ID = "019f8c40-0000-7000-8000-000000000001";
const HOUSE_CREATOR_NAME = "Amit";
const HOUSE_CREATOR_EMAIL = "creator@prabhuji.app";

const SEED_MIGRATION_SQL =
  "apps/api/prisma/migrations/20260928080000_tam_n_seed_house_creator/migration.sql";

interface CreateReportBody {
  success: boolean;
  message: string;
  data: { id: string };
}
interface ErrorBody {
  success: boolean;
  message: string;
  errorCode?: string;
}

let app: FastifyInstance;
let dbUrl: string;
let statusId: string;

const REPORTER = randomUUID();

function token(sub: string): string {
  return jwt.sign({ sub, email: `${sub}@prabhuji.internal` }, JWT_SECRET, {
    expiresIn: "1h",
  });
}
const auth = (sub: string): { authorization: string } => ({
  authorization: `Bearer ${token(sub)}`,
});

/** Replay a migration `.sql` through the same CLI `startTestDb` uses. */
function applyMigration(file: string): void {
  execSync(
    `pnpm prisma db execute --file ${file} --schema apps/api/prisma/schema.prisma`,
    { env: { ...process.env, DATABASE_URL: dbUrl }, stdio: "ignore" }
  );
}

const validBody = (
  overrides: Record<string, unknown> = {}
): Record<string, unknown> => ({
  type: "content",
  statusId,
  reporterEmail: "reporter@example.com",
  reason: "This image is offensive.",
  ...overrides,
});

beforeAll(async () => {
  process.env.JWT_SECRET = JWT_SECRET;
  process.env.AUTH_OTP_PEPPER = "integration-test-pepper-not-secret-32chars";
  process.env.AUTH_OTP_PROVIDER = "stub";
  // Redis off → `RedisRateLimiter` is a no-op that allows every call, so the
  // per-reporter throttle cannot make this suite flaky at report number six.
  process.env.ENABLE_REDIS = "false";
  resetEnvCache();

  dbUrl = await startTestDb();
  applyMigration(SEED_MIGRATION_SQL);

  app = await buildApp();
  initAuthModule(app);
  initEngagementModule();
  initDeityModule(app);
  // Registers the `status` facade `ReportsService` reaches through
  // `performServiceCall("status", …)`; without it every POST 500s.
  initStatusModule(app);
  initReportsModule(app);
  await app.ready();

  const seeded = await getPrisma().statusItem.create({
    data: {
      slug: "tam-n-reportable",
      title: "Reportable status (TAM-N)",
      mediaType: "image",
      imageUrl: "https://cdn.example.com/i.png",
      thumbnailUrl: "https://cdn.example.com/t.png",
      overlaySafeArea: { top: 0.1, bottom: 0.14, left: 0.05, right: 0.05 },
      languages: [],
      isActive: true,
    },
    select: { id: true },
  });
  statusId = seeded.id;
}, 180_000);

afterAll(async () => {
  await app.close();
  clearGlobalServices();
  await disconnectPrisma();
  await stopTestDb();
});

beforeEach(async () => {
  await getPrisma().report.deleteMany({});
});

describe("house creator seed", () => {
  test("the data migration inserts the pinned house-creator account", async () => {
    const row = await getPrisma().user.findUnique({
      where: { id: HOUSE_CREATOR_ID },
      select: { id: true, name: true, email: true, loginType: true },
    });
    expect(row).not.toBeNull();
    expect(row?.name).toBe(HOUSE_CREATOR_NAME);
    expect(row?.email).toBe(HOUSE_CREATOR_EMAIL);
    // Only legal shape under the `user_login_type_shape` CHECK for a non-phone
    // account — asserted so a future edit to the migration cannot quietly turn
    // this into an OTP row the login path could reach.
    expect(row?.loginType).toBe("email");
  });
});

describe("POST /reports", () => {
  test("writes exactly one row, attributed server-side to the house creator", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/reports",
      headers: auth(REPORTER),
      payload: validBody(),
    });
    expect(res.statusCode).toBe(200);
    const body: CreateReportBody = res.json();
    expect(body.success).toBe(true);
    expect(body.message).toBe("Reported successfully");
    expect(body.data.id).toEqual(expect.any(String));

    const rows = await getPrisma().report.findMany({});
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row?.id).toBe(body.data.id);
    expect(row?.statusId).toBe(statusId);
    // Resolved from the status, never sent by the client.
    expect(row?.reportedUserId).toBe(HOUSE_CREATOR_ID);
    // Taken from the JWT subject, never from the body.
    expect(row?.reporterUserId).toBe(REPORTER);
    expect(row?.reporterEmail).toBe("reporter@example.com");
    expect(row?.reason).toBe("This image is offensive.");
    expect(row?.type).toBe("content");
  });

  test("a client-supplied `reportedUserId` in the body CANNOT name a victim", async () => {
    const attackerChosenVictim = randomUUID();
    const res = await app.inject({
      method: "POST",
      url: "/reports",
      headers: auth(REPORTER),
      payload: validBody({
        reportedUserId: attackerChosenVictim,
        // While we're here: the reporter id is not forgeable from the body
        // either — it comes off the token.
        reporterUserId: randomUUID(),
      }),
    });
    expect(res.statusCode).toBe(200);

    const rows = await getPrisma().report.findMany({});
    expect(rows).toHaveLength(1);
    expect(rows[0]?.reportedUserId).not.toBe(attackerChosenVictim);
    expect(rows[0]?.reportedUserId).toBe(HOUSE_CREATOR_ID);
    expect(rows[0]?.reporterUserId).toBe(REPORTER);
  });

  test("`user` and `content` reports differ in nothing but `type`", async () => {
    for (const type of ["user", "content"] as const) {
      const res = await app.inject({
        method: "POST",
        url: "/reports",
        headers: auth(REPORTER),
        payload: validBody({ type }),
      });
      expect(res.statusCode).toBe(200);
    }

    const rows = await getPrisma().report.findMany({
      orderBy: { createdAt: "asc" },
    });
    expect(rows.map((r) => r.type)).toEqual(["user", "content"]);
    // Everything except the id, the timestamp and the type must match.
    const comparable = rows.map((r) => ({
      statusId: r.statusId,
      reportedUserId: r.reportedUserId,
      reporterUserId: r.reporterUserId,
      reporterEmail: r.reporterEmail,
      reason: r.reason,
    }));
    expect(comparable[0]).toEqual(comparable[1]);
  });

  test("an unknown statusId → 404 STATUS_NOT_FOUND and nothing is written", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/reports",
      headers: auth(REPORTER),
      payload: validBody({ statusId: randomUUID() }),
    });
    expect(res.statusCode).toBe(404);
    const body: ErrorBody = res.json();
    expect(body.success).toBe(false);
    expect(body.errorCode).toBe("STATUS_NOT_FOUND");
    expect(await getPrisma().report.count()).toBe(0);
  });

  test("no Authorization header → 401", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/reports",
      payload: validBody(),
    });
    expect(res.statusCode).toBe(401);
    const body: ErrorBody = res.json();
    expect(body.errorCode).toBe("UNAUTHORIZED");
    expect(await getPrisma().report.count()).toBe(0);
  });

  test("a reason over 1000 chars → 400 at the Zod boundary, nothing is written", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/reports",
      headers: auth(REPORTER),
      payload: validBody({ reason: "x".repeat(1001) }),
    });
    expect(res.statusCode).toBe(400);
    const body: ErrorBody = res.json();
    expect(body.errorCode).toBe("VALIDATION_ERROR");
    expect(await getPrisma().report.count()).toBe(0);
  });
});
