import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { randomUUID } from "node:crypto";
import { startTestDb, stopTestDb } from "@api/shared/testing";
import { disconnectPrisma, getPrisma } from "@api/shared/database";
import { EngagementRepository } from "../engagement.repository.js";
import { EngagementService } from "../../services/engagement.service.js";

/**
 * Integration coverage for engagement counters (TAM-57) — real Postgres via
 * testcontainers. Exercises the transactional idempotency + concurrency
 * consistency guarantees (#EXPORT_CRITICAL) that can only be proven against a
 * real DB. Uses the repository + service directly (no HTTP — the module is
 * facade-first).
 */

const CT = "aarti";
let repo: EngagementRepository;
let service: EngagementService;

async function likeRowCount(contentType: string, contentId: string): Promise<number> {
  return getPrisma().userLike.count({ where: { contentType, contentId } });
}
async function counterLikeCount(contentType: string, contentId: string): Promise<number> {
  const row = await getPrisma().engagementCounter.findUnique({
    where: { engagement_counter_unique: { contentType, contentId } },
    select: { likeCount: true },
  });
  return row?.likeCount ?? 0;
}

beforeAll(async () => {
  process.env.ENABLE_REDIS = "false";
  await startTestDb();
  repo = new EngagementRepository();
  service = new EngagementService(repo);
}, 120_000);

afterAll(async () => {
  await disconnectPrisma();
  await stopTestDb();
});

beforeEach(async () => {
  await getPrisma().userLike.deleteMany({});
  await getPrisma().engagementCounter.deleteMany({});
});

describe("idempotency", () => {
  test("like twice for the same user increments the counter once", async () => {
    const contentId = randomUUID();
    const userId = randomUUID();
    const first = await repo.like(userId, CT, contentId);
    const second = await repo.like(userId, CT, contentId);
    expect(first.likeCount).toBe(1);
    expect(second.likeCount).toBe(1);
    expect(await likeRowCount(CT, contentId)).toBe(1);
    expect(await counterLikeCount(CT, contentId)).toBe(1);
  });

  test("unlike on a non-liked item is a no-op", async () => {
    const contentId = randomUUID();
    const res = await repo.unlike(randomUUID(), CT, contentId);
    expect(res.likeCount).toBe(0);
    expect(await likeRowCount(CT, contentId)).toBe(0);
  });

  test("like then unlike returns the counter to 0 and never goes negative", async () => {
    const contentId = randomUUID();
    const userId = randomUUID();
    await repo.like(userId, CT, contentId);
    await repo.unlike(userId, CT, contentId);
    await repo.unlike(userId, CT, contentId); // second unlike is a no-op
    expect(await counterLikeCount(CT, contentId)).toBe(0);
    expect(await likeRowCount(CT, contentId)).toBe(0);
  });
});

describe("concurrency consistency (likeCount == UserLike row count)", () => {
  test("20 distinct users liking the same content concurrently", async () => {
    const contentId = randomUUID();
    const users = Array.from({ length: 20 }, () => randomUUID());
    await Promise.all(users.map((u) => repo.like(u, CT, contentId)));
    expect(await counterLikeCount(CT, contentId)).toBe(20);
    expect(await likeRowCount(CT, contentId)).toBe(20);
  });

  test("the same user liking concurrently still counts once", async () => {
    const contentId = randomUUID();
    const userId = randomUUID();
    await Promise.all(
      Array.from({ length: 10 }, () => repo.like(userId, CT, contentId))
    );
    expect(await counterLikeCount(CT, contentId)).toBe(1);
    expect(await likeRowCount(CT, contentId)).toBe(1);
  });

  test("interleaved concurrent like + unlike keeps counter == row count", async () => {
    const contentId = randomUUID();
    const users = Array.from({ length: 12 }, () => randomUUID());
    // Pre-like everyone so the unlikes have something to remove.
    await Promise.all(users.map((u) => repo.like(u, CT, contentId)));
    // Now concurrently: half unlike, half re-like (idempotent).
    await Promise.all(
      users.map((u, i) =>
        i % 2 === 0 ? repo.unlike(u, CT, contentId) : repo.like(u, CT, contentId)
      )
    );
    const rows = await likeRowCount(CT, contentId);
    const counter = await counterLikeCount(CT, contentId);
    expect(counter).toBe(rows);
    expect(counter).toBe(6); // 6 remained liked
  });
});

describe("view / share increment-only", () => {
  test("recordView / recordShare increment independently", async () => {
    const contentId = randomUUID();
    await repo.recordView(CT, contentId);
    await repo.recordView(CT, contentId);
    const share = await repo.recordShare(CT, contentId);
    expect(share.shareCount).toBe(1);
    const row = await getPrisma().engagementCounter.findUnique({
      where: { engagement_counter_unique: { contentType: CT, contentId } },
      select: { viewCount: true, shareCount: true, likeCount: true },
    });
    expect(row?.viewCount).toBe(2);
    expect(row?.shareCount).toBe(1);
    expect(row?.likeCount).toBe(0);
  });

  test("concurrent views serialize to an exact count", async () => {
    const contentId = randomUUID();
    await Promise.all(Array.from({ length: 25 }, () => repo.recordView(CT, contentId)));
    const row = await getPrisma().engagementCounter.findUnique({
      where: { engagement_counter_unique: { contentType: CT, contentId } },
      select: { viewCount: true },
    });
    expect(row?.viewCount).toBe(25);
  });
});

describe("getCounts batch zero-fill (real DB)", () => {
  test("returns a counter for every id, zero-filled for the misses", async () => {
    const liked = randomUUID();
    const viewed = randomUUID();
    const missing = randomUUID();
    await service.like({ userId: randomUUID(), contentType: CT, contentId: liked });
    await service.recordView({ contentType: CT, contentId: viewed });

    const counts = await service.getCounts({
      contentType: CT,
      contentIds: [liked, viewed, missing],
    });
    expect(counts[liked]?.likeCount).toBe(1);
    expect(counts[viewed]?.viewCount).toBe(1);
    expect(counts[missing]).toEqual({
      contentId: missing,
      likeCount: 0,
      viewCount: 0,
      shareCount: 0,
    });
  });
});
