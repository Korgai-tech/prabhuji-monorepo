/**
 * Engagement module public types (TAM-57).
 *
 * Polymorphic like/view/share counters over `(contentType, contentId)` serving
 * every content-bearing module. Consumed ONLY through `IEngagementApi` (via
 * `performServiceCall("engagement", …)`) — no module reaches engagement Prisma
 * directly. `contentType` is an untyped `string` here on purpose: the allowed
 * vocabulary is guarded at each caller's Zod boundary (see
 * `shared/schemas/engagement.ts`), not centrally in this service, so adding a
 * module needs zero engagement change (#PATH_DECISION).
 */

/** Aggregate counters for one content item (the batch `getCounts` element). */
export interface ContentCounts {
  contentId: string;
  likeCount: number;
  viewCount: number;
  shareCount: number;
}

/** Result of a like/unlike mutation: the new per-user state + aggregate. */
export interface LikeState {
  liked: boolean;
  likeCount: number;
}

/** Result of `recordView` (increment-only). */
export interface ViewState {
  viewCount: number;
}

/** Result of `recordShare` (increment-only). */
export interface ShareState {
  shareCount: number;
}
