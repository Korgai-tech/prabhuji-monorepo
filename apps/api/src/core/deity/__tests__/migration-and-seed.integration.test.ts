import { execSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import { PrismaClient } from "@prisma/client";

/**
 * Migration idempotency + seed row-count stability (TAM-57) against a FRESH
 * Postgres brought up ONLY via `prisma migrate deploy` (production-shaped — not
 * the `db push` the shared test helper uses). Verifies:
 *   - `migrate deploy` applies cleanly, and a second run is a no-op
 *     ("No pending migrations") — migration is idempotent;
 *   - `seed:deity` run twice leaves stable row counts — the seed is idempotent
 *     (upsert on unique keys, no duplication).
 *
 * Uses its own container (not `startTestDb`) so nothing pre-creates the schema.
 */

const SCHEMA = "apps/api/prisma/schema.prisma";
const SEED_COUNT_DEITIES = 8;
const SEED_COUNT_TRANSLATIONS = 16; // 8 deities × (hi + en)

let container: StartedPostgreSqlContainer;
let prisma: PrismaClient;
let dbUrl: string;

function run(cmd: string): string {
  return execSync(cmd, {
    env: { ...process.env, DATABASE_URL: dbUrl },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

beforeAll(async () => {
  container = await new PostgreSqlContainer("public.ecr.aws/docker/library/postgres:18-alpine").start();
  dbUrl = container.getConnectionUri();
  prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
}, 120_000);

afterAll(async () => {
  await prisma.$disconnect();
  await container.stop();
});

describe("migration idempotency", () => {
  test("migrate deploy applies all migrations on a fresh DB", () => {
    const out = run(`pnpm prisma migrate deploy --schema ${SCHEMA}`);
    expect(out).toMatch(/migrations? (have been|applied)|applying migration/i);
  });

  test("a second migrate deploy is a no-op", () => {
    const out = run(`pnpm prisma migrate deploy --schema ${SCHEMA}`);
    expect(out).toMatch(/No pending migrations to apply/i);
  });
});

describe("seed idempotency (stable row counts across two runs)", () => {
  test("seed:deity runs and populates the expected rows", async () => {
    run(`pnpm --filter api run seed:deity`);
    expect(await prisma.deity.count()).toBe(SEED_COUNT_DEITIES);
    expect(await prisma.deityTranslation.count()).toBe(SEED_COUNT_TRANSLATIONS);
  });

  test("a second seed:deity run leaves row counts unchanged (no duplication)", async () => {
    run(`pnpm --filter api run seed:deity`);
    expect(await prisma.deity.count()).toBe(SEED_COUNT_DEITIES);
    expect(await prisma.deityTranslation.count()).toBe(SEED_COUNT_TRANSLATIONS);
  });
});
