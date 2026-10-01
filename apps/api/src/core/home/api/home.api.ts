import type { ContentFeedCardInput } from "@api/core/home/types";

/**
 * Public facade for the Home module (TAM-61).
 *
 * The ONLY surface sibling modules use to reach Home — via
 * `performServiceCall("home", …)`, never by importing this module's files.
 * Registered into `GlobalServiceMap` from the composition root.
 *
 * Beyond the summary read, Home exposes `upsertContentFeedCard` so the content
 * modules can auto-populate the feed on write (the auto-feed flow).
 */
export interface IHomeApi {
  /** Number of active hero banners currently served. */
  getActiveBannerCount(): Promise<number>;

  /**
   * Auto-populate the Home feed from a content item. Called synchronously by a
   * sibling content module (aarti/mantra/ringtone/wallpaper/status) right after
   * it creates or updates an item, so new content surfaces in the feed with no
   * separate CMS step. Idempotent (deterministic slug) and best-effort — the
   * caller treats a failure as non-fatal so feed sync never blocks a content
   * write. Home owns the card shape; the caller passes only the content facts.
   */
  upsertContentFeedCard(input: ContentFeedCardInput): Promise<void>;

  /**
   * Existence probe for a Home-feed item by id — active only. Used by
   * `core/pinned-content` (TAM-173) on write to validate that a pin's
   * `content_id` targets a real live `home_feed` row before the insert lands.
   * A dangling id at read time is dropped silently by the feed builder, so
   * this is a write-side check only.
   */
  hasFeedItem(id: string): Promise<boolean>;
}
