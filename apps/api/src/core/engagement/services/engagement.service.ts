import { createModuleLogger } from "@api/shared/logs";
import type { EngagementRepository } from "@api/core/engagement/repositories";
import type {
  ContentCounts,
  LikeState,
  ShareState,
  ViewState,
} from "@api/core/engagement/types";

const log = createModuleLogger("engagement:service");

/**
 * Shared engagement business logic (TAM-57) — Prisma-free.
 *
 * The transactional idempotency of like/unlike lives in the repository (it
 * needs the DB); this layer:
 *   - zero-fills `getCounts` so a listing endpoint gets a counter for EVERY
 *     requested id (never a missing key), even ids with no row yet;
 *   - derives `userId` from the caller (the JWT-authed module context) — never
 *     a client-supplied field;
 *   - stays permissive on `contentType` (any string): the allowed vocabulary is
 *     guarded at each caller's Zod boundary, so adding a module needs no change
 *     here (#PATH_DECISION).
 */
export class EngagementService {
  constructor(private readonly repo: EngagementRepository) {}

  /**
   * Batch counters keyed by `contentId`. Every requested id is present in the
   * result; ids with no counter row are zero-filled. Duplicate ids collapse.
   */
  async getCounts(params: {
    contentType: string;
    contentIds: string[];
  }): Promise<Record<string, ContentCounts>> {
    const uniqueIds = [...new Set(params.contentIds)];
    const existing = await this.repo.getCounts(params.contentType, uniqueIds);
    const byId = new Map(existing.map((c) => [c.contentId, c]));
    const result: Record<string, ContentCounts> = {};
    for (const contentId of uniqueIds) {
      result[contentId] = byId.get(contentId) ?? {
        contentId,
        likeCount: 0,
        viewCount: 0,
        shareCount: 0,
      };
    }
    return result;
  }

  /**
   * Batch per-user like state (TAM-63) — the subset of `contentIds` the user
   * has liked. Duplicate ids collapse; ids with no like row are simply absent
   * from the result. Backs a listing endpoint's `likedByMe` flag in one call.
   */
  async getUserLikes(params: {
    userId: string;
    contentType: string;
    contentIds: string[];
  }): Promise<string[]> {
    const uniqueIds = [...new Set(params.contentIds)];
    return this.repo.getUserLikes(params.userId, params.contentType, uniqueIds);
  }

  /** Idempotent like — see the repository transaction contract. */
  async like(params: {
    userId: string;
    contentType: string;
    contentId: string;
  }): Promise<LikeState> {
    const state = await this.repo.like(
      params.userId,
      params.contentType,
      params.contentId
    );
    log.info(
      {
        event: "engagement_like",
        content_type: params.contentType,
        content_id: params.contentId,
        like_count: state.likeCount,
      },
      "like recorded"
    );
    return state;
  }

  /** Idempotent unlike — no-op when the item was not liked. */
  async unlike(params: {
    userId: string;
    contentType: string;
    contentId: string;
  }): Promise<LikeState> {
    const state = await this.repo.unlike(
      params.userId,
      params.contentType,
      params.contentId
    );
    log.info(
      {
        event: "engagement_unlike",
        content_type: params.contentType,
        content_id: params.contentId,
        like_count: state.likeCount,
      },
      "unlike recorded"
    );
    return state;
  }

  /** Increment-only view. */
  async recordView(params: {
    contentType: string;
    contentId: string;
  }): Promise<ViewState> {
    return this.repo.recordView(params.contentType, params.contentId);
  }

  /** Increment-only share. */
  async recordShare(params: {
    contentType: string;
    contentId: string;
  }): Promise<ShareState> {
    return this.repo.recordShare(params.contentType, params.contentId);
  }
}
