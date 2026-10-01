import type { ActivePinnedId, PinSurface } from "@api/core/pinned-content/types";

/**
 * Public facade for the pinned-content module (TAM-173).
 *
 * The ONLY surface Home and Status use to reach pins — via
 * `performServiceCall("pinnedContent", …)`, never by importing this module's
 * files. Registered into `GlobalServiceMap` from the composition root.
 *
 * The read is intentionally **light**: it returns `(pinId, contentId, position)`
 * for the active pins on one surface at one instant, sorted `pin_position ASC,
 * id ASC`, so the caller can prepend, dedupe against its rotation plan, and
 * hydrate rows via its own repository. Nothing about the pin's title,
 * translations, or wire framing is exposed — pins are invisible on the mobile
 * contract.
 */
export interface IPinnedContentApi {
  /**
   * Active pins on `surface` at `atMs`. The window is `start_at <= atMs < end_at`
   * (start inclusive, end exclusive). `deitySlug` is required when
   * `surface === 'status_deity'` and MUST be absent otherwise — the DB CHECK
   * enforces the same shape at row level.
   */
  getActivePinnedIds(input: {
    surface: PinSurface;
    deitySlug?: string;
    atMs: number;
  }): Promise<ActivePinnedId[]>;
}
