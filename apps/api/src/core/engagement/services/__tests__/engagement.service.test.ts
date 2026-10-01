import { beforeEach, describe, expect, test, vi } from "vitest";
import type { Mock } from "vitest";
import type { EngagementRepository } from "../../repositories/engagement.repository.js";
import { EngagementService } from "../engagement.service.js";
import type { ContentCounts, LikeState } from "../../types.js";

/**
 * A fake repository that models the DB's like semantics in memory — a
 * `(userId, contentType, contentId)` set as the source of truth + a
 * `likeCount` aggregate kept in lockstep. This lets the unit tier assert the
 * SERVICE's idempotency CONTRACT (like twice = one like; unlike-not-liked =
 * no-op) that the real transaction guarantees against Postgres (integration
 * tier). `getCounts` zero-fill is genuine service logic and is tested against a
 * plain mock below.
 */
class FakeEngagementRepo {
  private likes = new Set<string>();
  private likeCounts = new Map<string, number>();

  private likeKey(userId: string, ct: string, id: string): string {
    return `${userId}::${ct}::${id}`;
  }
  private countKey(ct: string, id: string): string {
    return `${ct}::${id}`;
  }

  like(userId: string, ct: string, id: string): Promise<LikeState> {
    const lk = this.likeKey(userId, ct, id);
    const ck = this.countKey(ct, id);
    if (!this.likes.has(lk)) {
      this.likes.add(lk);
      this.likeCounts.set(ck, (this.likeCounts.get(ck) ?? 0) + 1);
    }
    return Promise.resolve({ liked: true, likeCount: this.likeCounts.get(ck) ?? 0 });
  }

  unlike(userId: string, ct: string, id: string): Promise<LikeState> {
    const lk = this.likeKey(userId, ct, id);
    const ck = this.countKey(ct, id);
    if (this.likes.has(lk)) {
      this.likes.delete(lk);
      this.likeCounts.set(ck, Math.max(0, (this.likeCounts.get(ck) ?? 0) - 1));
    }
    return Promise.resolve({ liked: false, likeCount: this.likeCounts.get(ck) ?? 0 });
  }
}

describe("EngagementService like/unlike idempotency (contract)", () => {
  let service: EngagementService;

  beforeEach(() => {
    const repo = new FakeEngagementRepo() as unknown as EngagementRepository;
    service = new EngagementService(repo);
  });

  test("like twice for the same (userId, contentType, contentId) counts once", async () => {
    const params = { userId: "u1", contentType: "aarti", contentId: "c1" };
    const first = await service.like(params);
    const second = await service.like(params);
    expect(first.likeCount).toBe(1);
    expect(second.likeCount).toBe(1);
    expect(second.liked).toBe(true);
  });

  test("two different users liking the same content count independently", async () => {
    await service.like({ userId: "u1", contentType: "aarti", contentId: "c1" });
    const second = await service.like({
      userId: "u2",
      contentType: "aarti",
      contentId: "c1",
    });
    expect(second.likeCount).toBe(2);
  });

  test("unlike on a non-liked item is a no-op (count stays 0)", async () => {
    const res = await service.unlike({
      userId: "u1",
      contentType: "aarti",
      contentId: "c1",
    });
    expect(res.liked).toBe(false);
    expect(res.likeCount).toBe(0);
  });

  test("like then unlike returns to 0", async () => {
    const p = { userId: "u1", contentType: "aarti", contentId: "c1" };
    await service.like(p);
    const res = await service.unlike(p);
    expect(res.likeCount).toBe(0);
  });
});

describe("EngagementService.getCounts zero-fill", () => {
  interface RepoMock {
    getCounts: Mock;
    getUserLikes: Mock;
    like: Mock;
    unlike: Mock;
    recordView: Mock;
    recordShare: Mock;
  }
  let mock: RepoMock;
  let service: EngagementService;

  beforeEach(() => {
    mock = {
      getCounts: vi.fn(),
      getUserLikes: vi.fn(),
      like: vi.fn(),
      unlike: vi.fn(),
      recordView: vi.fn(),
      recordShare: vi.fn(),
    };
    service = new EngagementService(mock);
  });

  test("returns a counter for EVERY requested id, zero-filling the misses", async () => {
    const existing: ContentCounts[] = [
      { contentId: "c1", likeCount: 5, viewCount: 10, shareCount: 2 },
    ];
    mock.getCounts.mockResolvedValueOnce(existing);
    const result = await service.getCounts({
      contentType: "aarti",
      contentIds: ["c1", "c2", "c3"],
    });
    expect(Object.keys(result).sort()).toEqual(["c1", "c2", "c3"]);
    expect(result.c1).toEqual({
      contentId: "c1",
      likeCount: 5,
      viewCount: 10,
      shareCount: 2,
    });
    expect(result.c2).toEqual({
      contentId: "c2",
      likeCount: 0,
      viewCount: 0,
      shareCount: 0,
    });
    expect(result.c3?.likeCount).toBe(0);
  });

  test("de-dupes repeated ids and never throws on an empty id list", async () => {
    mock.getCounts.mockResolvedValueOnce([]);
    const result = await service.getCounts({
      contentType: "aarti",
      contentIds: ["c1", "c1"],
    });
    expect(Object.keys(result)).toEqual(["c1"]);
    // The repo is called with the de-duped id set.
    expect(mock.getCounts).toHaveBeenCalledWith("aarti", ["c1"]);

    mock.getCounts.mockResolvedValueOnce([]);
    const empty = await service.getCounts({ contentType: "aarti", contentIds: [] });
    expect(empty).toEqual({});
  });

  test("getUserLikes de-dupes ids and delegates the liked subset (TAM-63 likedByMe)", async () => {
    mock.getUserLikes.mockResolvedValueOnce(["c1"]);
    const liked = await service.getUserLikes({
      userId: "u1",
      contentType: "aarti",
      contentIds: ["c1", "c1", "c2"],
    });
    expect(liked).toEqual(["c1"]);
    expect(mock.getUserLikes).toHaveBeenCalledWith("u1", "aarti", ["c1", "c2"]);
  });

  test("recordView / recordShare delegate to the repo", async () => {
    mock.recordView.mockResolvedValueOnce({ viewCount: 1 });
    mock.recordShare.mockResolvedValueOnce({ shareCount: 1 });
    await service.recordView({ contentType: "aarti", contentId: "c1" });
    await service.recordShare({ contentType: "aarti", contentId: "c1" });
    expect(mock.recordView).toHaveBeenCalledWith("aarti", "c1");
    expect(mock.recordShare).toHaveBeenCalledWith("aarti", "c1");
  });
});
