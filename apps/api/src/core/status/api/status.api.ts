import type { StatusPreview } from "@api/core/status/types";

/**
 * Public facade for the Status Sharing module (TAM-71).
 *
 * The ONLY surface sibling modules use to reach status content — via
 * `performServiceCall("status", …)`, never by importing this module's files.
 * Registered into `GlobalServiceMap` from the composition root.
 *
 * Exposes a minimal read surface: a compact `getPreview` for a cross-module
 * share sheet / home embed. There is no entitlement gating on status content,
 * so it carries the FREE discovery fields directly.
 */
export interface IStatusApi {
  /** Compact preview for a status id, or `null` if unknown/inactive. */
  getPreview(id: string): Promise<StatusPreview | null>;

  /**
   * Write-side validation payload for a status item id — used by
   * `core/pinned-content` (TAM-173) to gate two invariants at once: (a) the
   * `content_id` targets a real live `status_items` row, and (b) for
   * `surface = 'status_deity'` pins, the row's `deity_slug` matches the pin's
   * `deity_slug` (`content_deity_mismatch`).
   *
   * Returns `{ deitySlug }` — the row's single deity slug, or `null` for a
   * status without a deity tag. `null` return value means unknown/inactive.
   */
  getPinValidation(id: string): Promise<{ deitySlug: string | null } | null>;

  /**
   * Write-side validation payload for `core/reports` (TAM-N): confirms the
   * status exists and resolves WHO it is attributed to, so a report can record
   * a `reported_user_id` the client never supplied.
   *
   * Returns `null` for an unknown/inactive id — the caller turns that into a
   * 404. `creatorId` is the house creator while the catalogue is CMS-authored.
   */
  getReportTarget(id: string): Promise<{ creatorId: string } | null>;
}
