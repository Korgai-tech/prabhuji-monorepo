import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startTestDb, stopTestDb } from "@api/shared/testing";
import { getPrisma, disconnectPrisma } from "@api/shared/database";

beforeAll(async () => {
  await startTestDb();
}, 120_000);
afterAll(async () => {
  await disconnectPrisma();
  await stopTestDb();
});

describe("kuldevta schema", () => {
  it("exposes the five tables", async () => {
    const prisma = getPrisma();
    const rows = await prisma.$queryRaw<{ table_name: string }[]>`
      select table_name from information_schema.tables
      where table_schema = 'public' and table_name in
        ('kuldevtas','kuldevta_translations','kuldevta_archetypes',
         'kuldevta_region_defaults','user_kuldevtas')`;
    expect(rows).toHaveLength(5);
  });

  it("has no foreign key from kuldevtas to deities", async () => {
    const prisma = getPrisma();
    const rows = await prisma.$queryRaw<{ n: bigint }[]>`
      select count(*) as n from information_schema.table_constraints tc
      join information_schema.constraint_column_usage ccu
        on tc.constraint_name = ccu.constraint_name
      where tc.table_name = 'kuldevtas'
        and tc.constraint_type = 'FOREIGN KEY'
        and ccu.table_name = 'deities'`;
    expect(Number(rows[0].n)).toBe(0);
  });
});
