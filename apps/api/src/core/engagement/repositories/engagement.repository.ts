import { getPrisma } from "@api/shared/database";
import type {
  ContentCounts,
  LikeState,
  ShareState,
  ViewState,
} from "@api/core/engagement/types";

/**
 * Engagement module repository — the ONLY place `@prisma/client` is reached for
 * this module (the service stays Prisma-free per arch-boundaries.json).
 *
 * TRANSACTION CONTRACT (#EXPORT_CRITICAL): like/unlike mutate the `UserLike`
 * source-of-truth row AND the denormalized `EngagementCounter.likeCount` in ONE
 * `$transaction`, so the aggregate can never diverge from the row count.
 * Idempotency + concurrency safety come from the DB: `createMany({
 * skipDuplicates })` / `deleteMany` return how many rows actually changed
 * (0 or 1), and the counter is only moved when a row was really inserted /
 * removed. The `(userId, contentType, contentId)` unique index serializes
 * concurrent likes of the same item (`ON CONFLICT DO NOTHING`), so exactly one
 * of two racing likes increments.
 */
export class EngagementRepository {
  /**
   * Batch counters for `contentIds` under `contentType`. Returns only existing
   * rows — the service zero-fills the misses (never a missing key).
   */
  async getCounts(
    contentType: string,
    contentIds: string[]
  ): Promise<ContentCounts[]> {
    if (contentIds.length === 0) return [];
    const rows = await getPrisma().engagementCounter.findMany({
      where: { contentType, contentId: { in: contentIds } },
      select: {
        contentId: true,
        likeCount: true,
        viewCount: true,
        shareCount: true,
      },
    });
    return rows;
  }

  /**
   * Batch per-user like state (TAM-63): the subset of `contentIds` the given
   * user has liked under `contentType`. Backs a listing endpoint's `likedByMe`
   * flag in one query (no N+1). Returns only the liked ids — the caller treats
   * every other requested id as not-liked.
   */
  async getUserLikes(
    userId: string,
    contentType: string,
    contentIds: string[]
  ): Promise<string[]> {
    if (contentIds.length === 0) return [];
    const rows = await getPrisma().userLike.findMany({
      where: { userId, contentType, contentId: { in: contentIds } },
      select: { contentId: true },
    });
    return rows.map((r) => r.contentId);
  }

  /**
   * Idempotent like. Inserts the `UserLike` row (skip if it already exists) and
   * increments `likeCount` ONLY when a row was actually inserted — both in one
   * transaction. Re-liking is a no-op that returns the current count.
   */
  async like(
    userId: string,
    contentType: string,
    contentId: string
  ): Promise<LikeState> {
    return getPrisma().$transaction(async (tx) => {
      const inserted = await tx.userLike.createMany({
        data: [{ userId, contentType, contentId }],
        skipDuplicates: true,
      });
      const didInsert = inserted.count === 1;
      const counter = await tx.engagementCounter.upsert({
        where: { engagement_counter_unique: { contentType, contentId } },
        create: { contentType, contentId, likeCount: didInsert ? 1 : 0 },
        update: didInsert ? { likeCount: { increment: 1 } } : {},
        select: { likeCount: true },
      });
      return { liked: true, likeCount: counter.likeCount };
    });
  }

  /**
   * Idempotent unlike. Deletes the `UserLike` row (if present) and decrements
   * `likeCount` ONLY when a row was actually removed — both in one transaction.
   * Unliking a non-liked item is a no-op. `likeCount` is floored at 0 defensively.
   */
  async unlike(
    userId: string,
    contentType: string,
    contentId: string
  ): Promise<LikeState> {
    return getPrisma().$transaction(async (tx) => {
      const removed = await tx.userLike.deleteMany({
        where: { userId, contentType, contentId },
      });
      const didRemove = removed.count === 1;
      const counter = await tx.engagementCounter.upsert({
        where: { engagement_counter_unique: { contentType, contentId } },
        create: { contentType, contentId, likeCount: 0 },
        update: didRemove ? { likeCount: { decrement: 1 } } : {},
        select: { likeCount: true },
      });
      return { liked: false, likeCount: Math.max(0, counter.likeCount) };
    });
  }

  /** Increment-only view counter (single atomic upsert). */
  async recordView(
    contentType: string,
    contentId: string
  ): Promise<ViewState> {
    const counter = await getPrisma().engagementCounter.upsert({
      where: { engagement_counter_unique: { contentType, contentId } },
      create: { contentType, contentId, viewCount: 1 },
      update: { viewCount: { increment: 1 } },
      select: { viewCount: true },
    });
    return { viewCount: counter.viewCount };
  }

  /** Increment-only share counter (single atomic upsert). */
  async recordShare(
    contentType: string,
    contentId: string
  ): Promise<ShareState> {
    const counter = await getPrisma().engagementCounter.upsert({
      where: { engagement_counter_unique: { contentType, contentId } },
      create: { contentType, contentId, shareCount: 1 },
      update: { shareCount: { increment: 1 } },
      select: { shareCount: true },
    });
    return { shareCount: counter.shareCount };
  }
}
