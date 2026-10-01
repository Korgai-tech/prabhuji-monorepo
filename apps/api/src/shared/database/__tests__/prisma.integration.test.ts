import { afterAll, beforeAll, expect, test } from "vitest";
import { startTestDb, stopTestDb } from "@api/shared/testing";
import { getPrisma, disconnectPrisma } from "../prisma.js";

beforeAll(async () => {
  await startTestDb();
}, 120_000);
afterAll(async () => {
  await disconnectPrisma();
  await stopTestDb();
});

test("getPrisma persists and reads a user", async () => {
  const prisma = getPrisma();
  const created = await prisma.user.create({
    data: { email: "x@y.com", name: "X", passwordHash: "h" },
  });
  const found = await prisma.user.findUnique({ where: { email: "x@y.com" } });
  expect(found?.id).toBe(created.id);
});
