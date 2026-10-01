import type {
  ContentCounts,
  LikeState,
  ShareState,
  ViewState,
} from "@api/core/engagement/types";

/**
 * Public facade for the engagement module (TAM-57).
 *
 * The ONLY surface content modules (TAM-61…76) use to reach like/view/share —
 * via `performServiceCall("engagement", …)`, never by importing this module's
 * files. Facade-first: no public HTTP routes ship in this ticket; each module
 * decides whether it needs a like/share route that delegates here.
 *
 * `userId` is always the JWT-authed caller's id (the calling module supplies
 * it) — never a client body field. `contentType` is a plain string; the caller
 * validates it against `shared/schemas/engagement.ts` at its own boundary.
 */
export interface IEngagementApi {
  /**
   * Batch aggregate counters keyed by `contentId`. Every requested id is
   * present (zero-filled when no row exists) — a listing endpoint resolves all
   * counts in one call with no N+1 and no missing keys.
   */
  getCounts(params: {
    contentType: string;
    contentIds: string[];
  }): Promise<Record<string, ContentCounts>>;

  /**
   * Batch per-user like state (TAM-63): the subset of `contentIds` the user has
   * liked under `contentType`. A listing endpoint resolves `likedByMe` for a
   * whole page in one call. Every non-returned id is treated as not-liked.
   */
  getUserLikes(params: {
    userId: string;
    contentType: string;
    contentIds: string[];
  }): Promise<string[]>;

  /** Idempotent like (like twice = one like); transactional counter update. */
  like(params: {
    userId: string;
    contentType: string;
    contentId: string;
  }): Promise<LikeState>;

  /** Idempotent unlike (no-op when not liked); transactional counter update. */
  unlike(params: {
    userId: string;
    contentType: string;
    contentId: string;
  }): Promise<LikeState>;

  /** Increment-only view counter. */
  recordView(params: {
    contentType: string;
    contentId: string;
  }): Promise<ViewState>;

  /** Increment-only share counter. */
  recordShare(params: {
    contentType: string;
    contentId: string;
  }): Promise<ShareState>;
}
