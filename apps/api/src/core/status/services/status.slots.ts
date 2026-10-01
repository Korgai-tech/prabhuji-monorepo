import { slotsFromMap, type WeaveSpec } from "@api/shared/rotation";

/**
 * Pool keys for the deity-split status feed (TAM-175).
 *
 * `MAIN` / `SECOND` are the user's first and second preferred gods; `ANY` is
 * the whole active catalogue — the feed the product served before this feature,
 * and the fall-through that guarantees no slot is ever empty.
 */
export const STATUS_POOL = {
  MAIN: "main",
  SECOND: "second",
  ANY: "any",
} as const;

/**
 * `GET /status/feed` with no deity chip selected — the "All" tab.
 *
 * Slots 1..20, transcribed from the product spec's table. Written as
 * "which slots does each pool own" so it reads the same way the spec does;
 * `slotsFromMap` throws at module load if the numbers do not tile 1..20 exactly
 * once, so a typo is a failed boot rather than a quietly wrong mix.
 *
 *   MAIN   10 slots — 1, 2, 3, 5, 7, 9, 11, 13, 15, 17
 *   SECOND  4 slots — 4, 10, 14, 18
 *   ANY     6 slots — 6, 8, 12, 16, 19, 20
 *
 * Slot 21 onwards is the ordinary rotation, minus what the slots already took —
 * that is the `tail`.
 *
 * The default page limit for this endpoint is 20, so page 1 IS this map.
 *
 * A deity CHIP feed is deliberately not woven: it is already that god's own
 * list, so there is nothing to mix (spec §5).
 */
export const STATUS_ALL_SLOTS: WeaveSpec = {
  slots: slotsFromMap({
    [STATUS_POOL.MAIN]: [1, 2, 3, 5, 7, 9, 11, 13, 15, 17],
    [STATUS_POOL.SECOND]: [4, 10, 14, 18],
    [STATUS_POOL.ANY]: [6, 8, 12, 16, 19, 20],
  }),
  // A spent pool falls through toward the user's OTHER god before falling back
  // to the whole catalogue: someone whose second god has three statuses should
  // see a main-god feed, not a generic one.
  priority: [STATUS_POOL.MAIN, STATUS_POOL.SECOND, STATUS_POOL.ANY],
  tail: STATUS_POOL.ANY,
};
