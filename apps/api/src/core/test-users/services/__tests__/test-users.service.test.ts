import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { resetEnvCache } from "@api/shared/config";
import { clearGlobalServices, registerGlobalService } from "@api/shared/workspace";
import { fakeSubscriptionApi, freeStatus } from "@api/shared/testing/subscription-fake";
import type { TestUsersRepository } from "@api/core/test-users/repositories";
import { TestUsersService } from "../test-users.service.js";

const assignTestSubjectBucket = vi.hoisted(() => vi.fn());
vi.mock("@api/shared/abtest", () => ({ assignTestSubjectBucket }));

const INPUT = { phoneCountryCode: "+91" as const, phoneNumber: "9111111111", premium: true };

function repoReturning(row: { id: string; isTestUser: boolean; created: boolean }) {
  const ensureTestUser = vi.fn(() => Promise.resolve(row));
  const recordBucket = vi.fn(() => Promise.resolve());
  return {
    repo: { ensureTestUser, recordBucket } as unknown as TestUsersRepository,
    ensureTestUser,
    recordBucket,
  };
}

const ORIGINAL_ENV = { ...process.env };

describe("TestUsersService.createTestUser", () => {
  const setComplimentaryPro = vi.fn(() => Promise.resolve());

  beforeEach(() => {
    // A real SMS provider — the only configuration where TEST_OTP matters.
    process.env = {
      ...ORIGINAL_ENV,
      AUTH_OTP_PROVIDER: "msg91",
      MSG91_AUTH_KEY: "test-key",
      MSG91_TEMPLATE_ID: "test-template",
      ENABLE_REDIS: "true",
      REDIS_URL: "redis://localhost:6379",
      TEST_OTP: "0123",
    };
    resetEnvCache();
    registerGlobalService("subscription", fakeSubscriptionApi({ setComplimentaryPro }));
    assignTestSubjectBucket.mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    resetEnvCache();
    clearGlobalServices();
    vi.clearAllMocks();
  });

  test("creates the user, grants Pro, pins the UUID to the bucket", async () => {
    const { repo, recordBucket } = repoReturning({ id: "u-1", isTestUser: true, created: true });

    const result = await new TestUsersService(repo).createTestUser(
      { ...INPUT, bucket: 42, note: "qa" },
      "admin-1"
    );

    expect(setComplimentaryPro).toHaveBeenCalledWith("u-1", true);
    expect(assignTestSubjectBucket).toHaveBeenCalledWith("u-1", 42, "qa");
    expect(recordBucket).toHaveBeenCalledWith("u-1", 42);
    expect(result).toMatchObject({
      userId: "u-1",
      created: true,
      premium: true,
      bucket: { requested: 42, assigned: true, error: null },
    });
  });

  test("refuses a number that belongs to a real account, and grants nothing", async () => {
    const { repo } = repoReturning({ id: "u-real", isTestUser: false, created: false });

    await expect(
      new TestUsersService(repo).createTestUser({ ...INPUT, bucket: 1 }, "admin-1")
    ).rejects.toMatchObject({ statusCode: 409, errorCode: "PHONE_BELONGS_TO_REAL_USER" });
    expect(setComplimentaryPro).not.toHaveBeenCalled();
    expect(assignTestSubjectBucket).not.toHaveBeenCalled();
  });

  test("refuses when TEST_OTP is unset — the account could never log in", async () => {
    delete process.env.TEST_OTP;
    resetEnvCache();
    const { repo, ensureTestUser } = repoReturning({ id: "u-1", isTestUser: true, created: true });

    await expect(
      new TestUsersService(repo).createTestUser(INPUT, "admin-1")
    ).rejects.toMatchObject({ statusCode: 409, errorCode: "TEST_OTP_NOT_CONFIGURED" });
    expect(ensureTestUser).not.toHaveBeenCalled();
  });

  test("non-premium revokes, and no bucket means no abtest call", async () => {
    const { repo } = repoReturning({ id: "u-1", isTestUser: true, created: false });

    const result = await new TestUsersService(repo).createTestUser(
      { ...INPUT, premium: false },
      "admin-1"
    );

    expect(setComplimentaryPro).toHaveBeenCalledWith("u-1", false);
    expect(assignTestSubjectBucket).not.toHaveBeenCalled();
    expect(result.bucket).toEqual({ requested: null, assigned: false, error: null });
    expect(result.created).toBe(false);
  });

  test("a failed bucket assignment is reported, not thrown", async () => {
    assignTestSubjectBucket.mockResolvedValue({ ok: false, status: 403, message: "nope" });
    const { repo, recordBucket } = repoReturning({ id: "u-1", isTestUser: true, created: true });

    const result = await new TestUsersService(repo).createTestUser(
      { ...INPUT, bucket: 7 },
      "admin-1"
    );

    expect(result.bucket).toEqual({ requested: 7, assigned: false, error: "nope" });
    // The list must never show a bucket the service did not accept.
    expect(recordBucket).not.toHaveBeenCalled();
  });

  test("list maps premium, complimentary and the recorded bucket per user", async () => {
    const listTestUsers = vi.fn(() =>
      Promise.resolve({
        rows: [
          { id: "u-pro", phoneCountryCode: "+91", phoneNumber: "9111111111", testBucket: 42,
            phoneVerifiedAt: new Date("2026-09-23T06:00:00Z"), createdAt: new Date("2026-09-23T05:00:00Z") },
          { id: "u-free", phoneCountryCode: "+91", phoneNumber: "9222222222", testBucket: null,
            phoneVerifiedAt: null, createdAt: new Date("2026-09-22T05:00:00Z") },
        ],
        total: 2,
      })
    );
    registerGlobalService(
      "subscription",
      fakeSubscriptionApi({
        getStatuses: () =>
          Promise.resolve({
            "u-pro": { ...freeStatus(), status: "active", isEntitled: true, provider: "admin_test" },
            "u-free": freeStatus(),
          }),
      })
    );
    const repo = { listTestUsers } as unknown as TestUsersRepository;

    const page = await new TestUsersService(repo).listTestUsers({ page: 1, pageSize: 20 });

    expect(page.total).toBe(2);
    expect(page.items).toEqual([
      expect.objectContaining({ userId: "u-pro", premium: true, complimentary: true,
        subscriptionStatus: "active", bucket: 42, firstLoginAt: "2026-09-23T06:00:00.000Z" }),
      expect.objectContaining({ userId: "u-free", premium: false, complimentary: false,
        subscriptionStatus: "free", bucket: null, firstLoginAt: null }),
    ]);
  });
});
