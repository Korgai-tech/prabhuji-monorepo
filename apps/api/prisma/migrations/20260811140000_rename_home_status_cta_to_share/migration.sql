-- Rename the home-feed CTA on status auto-cards from "View Status" to
-- "Share Status". The card's tap already routes to the story-share flow
-- (`_shareStatusFromFeed` in `apps/mobile/lib/features/home/presentation/home_feed_card.dart`),
-- so the previous label misdescribed what the button actually did.
--
-- Server side of the change: `CTA_LABEL.status` in
-- `apps/api/src/core/home/services/home.service.ts` — that constant lands on
-- every future auto-card via `upsertContentFeedCard`. This migration
-- retroactively updates the copy on rows already in the DB so users see the
-- new label without waiting for each status item to be re-published.
--
-- Scoped to (content_type='status' AND cta_label='View Status') so re-running
-- is a no-op and any admin-authored / hand-edited row keeps its custom copy.
-- The translation table has the same column; auto-cards don't populate
-- translations today, but the same guarded update runs there for safety in
-- case an admin ever localized the old label.

UPDATE "home_feed_items"
SET "cta_label" = 'Share Status'
WHERE "content_type" = 'status'
  AND "cta_label" = 'View Status';

UPDATE "home_feed_item_translations" t
SET "cta_label" = 'Share Status'
FROM "home_feed_items" i
WHERE t."home_feed_item_id" = i."id"
  AND i."content_type" = 'status'
  AND t."cta_label" = 'View Status';
