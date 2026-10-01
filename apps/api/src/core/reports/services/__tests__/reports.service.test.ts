import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearGlobalServices,
  registerGlobalService,
} from "@api/shared/workspace";
import { AppError } from "@api/shared/errors";
import { ReportsService } from "../reports.service.js";
import type { ReportsRepository } from "@api/core/reports/repositories";
import type { RedisRateLimiter } from "@api/shared/rate-limit";
import type { IStatusApi } from "@api/core/status/api";

const HOUSE_CREATOR = "019f8c40-0000-7000-8000-000000000001";
const STATUS_ID = "11111111-1111-4111-8111-111111111111";
const REPORTER_ID = "22222222-2222-4222-8222-222222222222";

type CreateArgs = Parameters<ReportsRepository["create"]>[0];

/** A repo double that records what it was asked to write. */
function fakeRepo(): { repo: ReportsRepository; created: CreateArgs[] } {
  const created: CreateArgs[] = [];
  const repo: ReportsRepository = {
    create: (input) => {
      created.push(input);
      return Promise.resolve({ id: "report-1", createdAt: new Date(0), ...input });
    },
  };
  return { repo, created };
}

/** Allows everything, so tests that aren't about throttling stay focused. */
function permissiveLimiter(): RedisRateLimiter {
  return {
    consume: () =>
      Promise.resolve({ allowed: true, remaining: 99, retryAfterSeconds: 0 }),
    reset: () => Promise.resolve(),
  };
}

/** Registers a `status` facade whose only interesting method is the one we use. */
function registerStatus(
  getReportTarget: IStatusApi["getReportTarget"]
): void {
  clearGlobalServices();
  registerGlobalService("status", {
    getPreview: () => Promise.resolve(null),
    getPinValidation: () => Promise.resolve(null),
    getReportTarget,
  });
}

const validInput = {
  type: "content" as const,
  statusId: STATUS_ID,
  reporterUserId: REPORTER_ID,
  reporterEmail: "someone@example.com",
  reason: "Offensive imagery",
};

describe("ReportsService.create", () => {
  beforeEach(() => {
    registerStatus(() => Promise.resolve({ creatorId: HOUSE_CREATOR }));
  });

  it("resolves reportedUserId from the status, not from the caller", async () => {
    const { repo, created } = fakeRepo();
    const service = new ReportsService(repo, permissiveLimiter());

    // A caller trying to name a victim: an extra key on the input object. It
    // must have no effect — this is THE security property of the endpoint.
    await service.create({
      ...validInput,
      reportedUserId: "99999999-9999-4999-8999-999999999999",
    } as typeof validInput);

    expect(created).toHaveLength(1);
    expect(created[0]?.reportedUserId).toBe(HOUSE_CREATOR);
  });

  it("takes reporterUserId from the caller-supplied JWT subject", async () => {
    const { repo, created } = fakeRepo();
    const service = new ReportsService(repo, permissiveLimiter());

    await service.create(validInput);

    expect(created[0]?.reporterUserId).toBe(REPORTER_ID);
  });

  it("writes both report types against the same status", async () => {
    const { repo, created } = fakeRepo();
    const service = new ReportsService(repo, permissiveLimiter());

    await service.create({ ...validInput, type: "user" });
    await service.create({ ...validInput, type: "content" });

    expect(created.map((c) => c.type)).toEqual(["user", "content"]);
    // Intentional: with one house creator these differ ONLY in `type`.
    expect(created[0]?.reportedUserId).toBe(created[1]?.reportedUserId);
    expect(created[0]?.statusId).toBe(created[1]?.statusId);
  });

  it("returns only the new row's id", async () => {
    const { repo } = fakeRepo();
    const service = new ReportsService(repo, permissiveLimiter());

    const result = await service.create(validInput);

    expect(result).toEqual({ id: "report-1" });
  });

  it("404s on an unknown status and writes nothing", async () => {
    registerStatus(() => Promise.resolve(null));
    const { repo, created } = fakeRepo();
    const service = new ReportsService(repo, permissiveLimiter());

    await expect(service.create(validInput)).rejects.toMatchObject({
      statusCode: 404,
      errorCode: "STATUS_NOT_FOUND",
    });
    expect(created).toHaveLength(0);
  });

  it("429s when the reporter is over the limit, before touching the status", async () => {
    const { repo, created } = fakeRepo();
    const getReportTarget = vi.fn(() =>
      Promise.resolve({ creatorId: HOUSE_CREATOR })
    );
    registerStatus(getReportTarget);
    const limiter: RedisRateLimiter = {
      consume: () =>
        Promise.resolve({ allowed: false, remaining: 0, retryAfterSeconds: 42 }),
      reset: () => Promise.resolve(),
    };
    const service = new ReportsService(repo, limiter);

    await expect(service.create(validInput)).rejects.toBeInstanceOf(AppError);
    await expect(service.create(validInput)).rejects.toMatchObject({
      statusCode: 429,
      errorCode: "RATE_LIMITED",
    });
    expect(created).toHaveLength(0);
    // Throttled callers must not cost a cross-module call either.
    expect(getReportTarget).not.toHaveBeenCalled();
  });

  it("keys the rate limit per reporter", async () => {
    const { repo } = fakeRepo();
    const consume = vi.fn(() =>
      Promise.resolve({ allowed: true, remaining: 1, retryAfterSeconds: 0 })
    );
    const service = new ReportsService(repo, {
      consume,
      reset: () => Promise.resolve(),
    });

    await service.create(validInput);

    expect(consume).toHaveBeenCalledWith(
      `reports:create:${REPORTER_ID}`,
      expect.any(Number),
      expect.any(Number)
    );
  });
});
