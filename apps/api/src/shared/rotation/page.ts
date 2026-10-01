import { decodeRotationCursor, encodeRotationCursor } from "@api/shared/pagination";
import { getOrBuildPlan } from "./plan-cache.js";
import { currentRefreshEpoch, orderByPlan } from "./rotation.js";

/**
 * Serve one page of a ROTATED listing. Every rotating surface (home feed,
 * status, ringtone, wallpaper) is the same four steps, so they live here once:
 *
 *   1. resolve the refresh epoch — from the cursor if the caller is mid-scroll,
 *      else the live one. Pinning it in the cursor is what stops a 00:00/12:00
 *      refresh from reordering a session that is already open;
 *   2. build (or reuse) that epoch's plan — an ordered id list;
 *   3. hydrate the slice this page needs;
 *   4. restore plan order, since `WHERE id IN (...)` returns rows in DB order.
 *
 * `key` identifies the surface AND its filters (deity, locale, …); the epoch is
 * appended here so a caller can never forget it.
 *
 * ### Two-plan overload (TAM-173) — pinned-content overlay
 *
 * When the caller supplies an optional `pinnedIds` list, the served plan on
 * page 1 is the DEDUPED `[...pinnedIds, ...rotationPlan]` — pins prepend the
 * rotation head, and any pin id that ALSO appears in the rotation catalogue
 * appears exactly once (at the pin position, not its rotation slot). The
 * CURSOR still pages over the rotation-only plan, so it stays session-stable
 * under pin churn: adding or removing a pin mid-session shifts the page-1
 * head only, never the rotation offset a mid-scroll cursor points into. This
 * is #EXPORT_CRITICAL for the spec's zero-mobile-release guarantee (the wire
 * shape does not change and pins can appear/disappear without invalidating
 * an open session's cursor).
 *
 * Empty `pinnedIds` (the default) ⇒ the served plan IS the rotation plan and
 * the response is byte-identical to the single-plan behaviour — verified by
 * the empty-pins integration test.
 */
/** The user's two gods, as the split feed reads them. `null` = not known. */
export interface DeityPair {
  primary: string | null;
  secondary: string | null;
}

/** Neither god known — every pool falls through to "any". */
export const NO_DEITY_PAIR: DeityPair = { primary: null, secondary: null };

export async function rotationPage<T extends { id: string }>(params: {
  /**
   * Cache key for the built plan, or `null` to SKIP rotationPage's caching.
   *
   * A string is the common case: the plan depends only on `(epoch, filters)`,
   * so one build is shared by the fleet and `key` must capture every filter.
   *
   * `null` is for a PER-USER order (TAM-175). A woven feed differs per deity
   * pair, so caching the composed result would multiply entries by the number
   * of pairs — for no gain, because the expensive part (rotating each pool) is
   * already cached by the surface and the weave itself is microseconds of array
   * indexing. Those surfaces cache their POOLS and compose per request.
   */
  key: string | null;
  cursor?: string;
  limit: number;
  buildPlan: (epoch: number, deities: DeityPair) => Promise<string[]>;
  hydrate: (ids: string[]) => Promise<T[]>;
  /**
   * TAM-173 — the ordered pin block to prepend, in `pin_position ASC, id ASC`
   * order. Optional; omitted or `[]` degrades cleanly to the pre-TAM-173
   * single-plan behaviour (identical response, byte-for-byte).
   */
  pinnedIds?: readonly string[];
  /**
   * TAM-175 — the requesting user's deity pair. Supplying it makes the surface
   * deity-aware: the pair is pinned into `nextCursor`, and a cursor that
   * carries one OVERRIDES this value. Omit it entirely and the cursor stays
   * byte-identical to the pre-TAM-175 shape.
   */
  deities?: DeityPair;
}): Promise<{ items: T[]; nextCursor: string | null; epoch: number }> {
  const { key, cursor, limit, buildPlan, hydrate, pinnedIds } = params;
  // A cursor minted before rotation shipped (or a tampered one) decodes to null
  // and restarts the listing — never a 400 in the middle of someone's session.
  const state = cursor ? decodeRotationCursor(cursor) : null;
  const live = currentRefreshEpoch();
  // The epoch is client-supplied, so it is CLAMPED, not trusted: a cursor may
  // only pin the epoch it was plausibly minted in (a session spanning one
  // refresh). Without this, a crafted cursor could name any epoch it liked and
  // force an uncached whole-catalogue plan build per request, evicting the real
  // plans on the way past.
  const pinned =
    state !== null && Math.abs(state.epoch - live) <= 1 ? state : null;
  const epoch = pinned?.epoch ?? live;
  const rotationOffset = pinned?.offset ?? 0;

  // TAM-175 — THE CURSOR'S PAIR WINS over the request's. A preference that
  // changes mid-scroll (an ad attribution landing, an outcome recorded) must
  // apply on the next cold start, exactly like a refresh does — never to a
  // session already open, which would reorder everything below the fold.
  const requestedDeities = params.deities;
  const deities: DeityPair =
    pinned !== null && pinned.d1 !== undefined
      ? { primary: pinned.d1, secondary: pinned.d2 ?? null }
      : requestedDeities ?? NO_DEITY_PAIR;

  const plan =
    key === null
      ? await buildPlan(epoch, deities)
      : await getOrBuildPlan(`${key}:${epoch}`, () => buildPlan(epoch, deities));

  // Merge the pin block over the rotation plan. Same dedupe as `rotate()` at
  // rotation.ts:193 — a pin whose id appears in the rotation catalogue appears
  // ONCE, at the pin position, never twice.
  const pins = pinnedIds ?? [];
  const pinSet = new Set(pins);
  const trimmedRotation = pinSet.size === 0 ? plan : plan.filter((id) => !pinSet.has(id));
  const mergedPlan = pinSet.size === 0 ? plan : [...pins, ...trimmedRotation];

  // The CURSOR pages over the ROTATION plan only. `pins.length` items lead
  // page 1, so page 1 slice = `[...pins, ...trimmedRotation.slice(0, limit - pins.length)]`.
  // Subsequent pages carry no pins; they slice the trimmed rotation from where
  // page 1 left off. `rotationOffset` is exactly that offset — it never counts
  // pin ids, so pin churn between requests can't shift the cursor.
  const isPage1 = rotationOffset === 0;
  let slice: string[];
  let nextRotationOffset: number;
  if (isPage1) {
    slice = mergedPlan.slice(0, limit);
    // Consumed pin_ids + however many rotation ids the page had room for.
    nextRotationOffset = Math.max(0, limit - pins.length);
    // If we asked for `limit` and got the pin block plus fewer rotation ids
    // than we could carry, nextRotationOffset is where we stopped in the
    // trimmed rotation.
    if (nextRotationOffset > trimmedRotation.length) {
      nextRotationOffset = trimmedRotation.length;
    }
  } else {
    slice = trimmedRotation.slice(rotationOffset, rotationOffset + limit);
    nextRotationOffset = rotationOffset + limit;
  }

  // Past the end of the plan (or an empty catalogue) — nothing to hydrate.
  const items = slice.length === 0 ? [] : orderByPlan(await hydrate(slice), slice);

  const hasMore = nextRotationOffset < trimmedRotation.length;

  return {
    items,
    nextCursor: hasMore
      ? encodeRotationCursor({
          epoch,
          offset: nextRotationOffset,
          // Written ONLY by a deity-aware surface, so ringtone and wallpaper
          // keep minting the exact cursor they did before TAM-175.
          ...(requestedDeities === undefined
            ? {}
            : { d1: deities.primary, d2: deities.secondary }),
        })
      : null,
    epoch,
  };
}
