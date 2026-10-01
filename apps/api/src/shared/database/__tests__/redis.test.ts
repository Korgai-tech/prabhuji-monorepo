import { afterEach, beforeEach, expect, test } from "vitest";
import { resetEnvCache } from "@api/shared/config";
import { getRedis, initRedis, closeRedis } from "../redis.js";

const ORIGINAL = { ...process.env };
beforeEach(() => {
  resetEnvCache();
});
afterEach(async () => {
  await closeRedis();
  process.env = { ...ORIGINAL };
  resetEnvCache();
});

test("redis is disabled by default -> getRedis returns null", async () => {
  process.env.DATABASE_URL = "postgres://u:p@localhost:5432/db";
  process.env.JWT_SECRET = "a-sufficiently-long-secret";
  process.env.AUTH_OTP_PEPPER = "unit-test-pepper-not-secret-32chars";
  process.env.ENABLE_REDIS = "false";
  await initRedis();
  expect(getRedis()).toBeNull();
});
