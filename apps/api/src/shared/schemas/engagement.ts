import { z } from "zod";

/**
 * Canonical engagement content-type vocabulary (TAM-57 AC (b), #PLAN_UNCERTAINTY).
 *
 * `EngagementCounter` / `UserLike` are polymorphic over `(contentType,
 * contentId)`. `contentType` is a plain TEXT column in Postgres (never a DB
 * enum) so adding a content-bearing module needs no engagement schema change —
 * it just guards a new string at ITS OWN Zod boundary.
 *
 * This shared schema lives in `shared/` (NOT inside the engagement module) so
 * every content module can import it for its route boundary without violating
 * the cross-module import ban (modules reach the engagement *service* only via
 * the facade). It is the single place the Phase-1 token set is written down;
 * confirm the exact tokens against each module ticket's schema before that
 * module starts. `EngagementService` itself stays permissive (accepts any
 * string) — the guard is each caller's boundary, by design.
 */
export const ENGAGEMENT_CONTENT_TYPES = [
  "aarti",
  "mantra",
  "ringtone",
  "wallpaper",
  "status",
  "home_item",
] as const;

export const engagementContentType = z
  .enum(ENGAGEMENT_CONTENT_TYPES)
  .meta({ id: "EngagementContentType" });

export type EngagementContentType = z.infer<typeof engagementContentType>;
