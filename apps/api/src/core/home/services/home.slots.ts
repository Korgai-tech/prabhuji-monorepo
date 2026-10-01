import { slotsFromMap, type WeaveSpec } from "@api/shared/rotation";
import { FEED_CONTENT_TYPES, type FeedContentType } from "@api/core/home/types";

/**
 * Pool keys for the deity-split home feed (TAM-175).
 *
 * Home mixes on TWO axes at once — content type and deity — so its pools are
 * narrower than status's: "a status card for your main god" is a different pool
 * from "a ringtone for your main god".
 */
export const HOME_POOL = {
  /** `contentType = status`, the user's first god. */
  STATUS_MAIN: "statusMain",
  /** `contentType = status`, the user's second god. */
  STATUS_SECOND: "statusSecond",
  /** ringtone | wallpaper | aarti | mantra, the user's first god, interleaved. */
  OTHER_MAIN: "otherMain",
  /** The ordinary mixed feed — any module, any god. */
  ANY: "any",
} as const;

/**
 * Every content type that is NOT status — the "other module" pool's members.
 *
 * DERIVED from `FEED_CONTENT_TYPES` rather than listed, so adding a sixth
 * content type puts it in this pool automatically instead of silently excluding
 * it from personalised slots until someone notices.
 */
export const HOME_OTHER_CONTENT_TYPES: readonly FeedContentType[] =
  FEED_CONTENT_TYPES.filter((t) => t !== "status");

/**
 * `GET /home/feed`, default (non-`feedTrendingFirst`) mode.
 *
 * Slots 1..10, transcribed from the product spec's table:
 *
 *   STATUS_MAIN    1, 2, 5, 8
 *   STATUS_SECOND  3, 6
 *   OTHER_MAIN     4, 7, 9
 *   ANY            10
 *
 * Slot 11 onwards is the ordinary interleaved rotation minus what the slots
 * took — the `tail`. The endpoint's default limit is 10, so page 1 IS this map.
 */
export const HOME_FEED_SLOTS: WeaveSpec = {
  slots: slotsFromMap({
    [HOME_POOL.STATUS_MAIN]: [1, 2, 5, 8],
    [HOME_POOL.STATUS_SECOND]: [3, 6],
    [HOME_POOL.OTHER_MAIN]: [4, 7, 9],
    [HOME_POOL.ANY]: [10],
  }),
  // Fall-through keeps a thin catalogue personalised for as long as it can:
  // the user's main god first, then their second, then their main god's other
  // modules, and only then the general feed.
  priority: [
    HOME_POOL.STATUS_MAIN,
    HOME_POOL.STATUS_SECOND,
    HOME_POOL.OTHER_MAIN,
    HOME_POOL.ANY,
  ],
  tail: HOME_POOL.ANY,
};
