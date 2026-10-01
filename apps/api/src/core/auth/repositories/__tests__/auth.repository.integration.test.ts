import { afterAll, beforeAll, expect, test } from "vitest";
import { startTestDb, stopTestDb } from "@api/shared/testing";
import { disconnectPrisma } from "@api/shared/database";
import { AuthRepository } from "../auth.repository.js";

const repo = new AuthRepository();
beforeAll(async () => {
  await startTestDb();
}, 120_000);
afterAll(async () => {
  await disconnectPrisma();
  await stopTestDb();
});

test("createUser then findByEmail returns the row", async () => {
  const created = await repo.createUser({
    email: "r@e.com",
    name: "R",
    passwordHash: "ph",
    role: "user",
    loginType: "email",
  });
  const found = await repo.findByEmail("r@e.com");
  expect(found).toMatchObject({ id: created.id, email: "r@e.com", passwordHash: "ph" });
});

test("findByEmail returns null for unknown email", async () => {
  expect(await repo.findByEmail("missing@e.com")).toBeNull();
});
