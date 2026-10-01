-- Backfill `home_feed_items.cta_content_id` for auto-generated content cards
-- that predate `20260810120000_add_home_feed_cta_content_id`.
--
-- Why: that migration was additive-only — the column was added NULL for every
-- existing row, and `upsertContentFeedCard` only fills it on the next content
-- publish (see `apps/api/src/core/home/services/home.service.ts` +
-- `apps/api/src/core/home/repositories/home.repository.ts::upsertContentFeedCard`).
-- Until an admin edits/re-saves each item, the client keeps hitting the
-- "contentId empty → open module home" fallback in
-- `apps/mobile/lib/features/home/destinations.dart`, so the aarti/mantra
-- deep-link CTAs never reach the by-id play screen.
--
-- Fix: for every `content_detail` auto-card whose `cta_content_id IS NULL`,
-- look up the underlying content row by (contentType, slug) and copy its id
-- into the side-car. Admin-authored cards (which don't set a slug that matches
-- a content row) are untouched — NULL there is intentional and the client's
-- module-home fallback stays correct.
--
-- Idempotent: the `IS NULL` guard means re-running is a no-op. Safe to ship
-- alongside future re-syncs.

-- Aarti → audio_items
UPDATE "home_feed_items" hfi
SET "cta_content_id" = a."id"
FROM "audio_items" a
WHERE hfi."content_type" = 'aarti'
  AND hfi."cta_destination_type" = 'content_detail'
  AND hfi."cta_destination_value" = a."slug"
  AND hfi."cta_content_id" IS NULL;

-- Mantra → mantra_audio_items
UPDATE "home_feed_items" hfi
SET "cta_content_id" = m."id"
FROM "mantra_audio_items" m
WHERE hfi."content_type" = 'mantra'
  AND hfi."cta_destination_type" = 'content_detail'
  AND hfi."cta_destination_value" = m."slug"
  AND hfi."cta_content_id" IS NULL;

-- Ringtone → ringtones
-- The client short-circuits ringtone CTAs to a direct-set today (see
-- `home_feed_card.dart::homeHandleCtaTap`), so this pointer is unused right
-- now — but populating it keeps the side-car consistent with the aarti/mantra
-- contract and unlocks future by-id routing without another backfill.
UPDATE "home_feed_items" hfi
SET "cta_content_id" = r."id"
FROM "ringtones" r
WHERE hfi."content_type" = 'ringtone'
  AND hfi."cta_destination_type" = 'content_detail'
  AND hfi."cta_destination_value" = r."slug"
  AND hfi."cta_content_id" IS NULL;

-- Wallpaper → wallpapers (see ringtone note above — currently unused by the
-- client, backfilled for consistency and future use).
UPDATE "home_feed_items" hfi
SET "cta_content_id" = w."id"
FROM "wallpapers" w
WHERE hfi."content_type" = 'wallpaper'
  AND hfi."cta_destination_type" = 'content_detail'
  AND hfi."cta_destination_value" = w."slug"
  AND hfi."cta_content_id" IS NULL;

-- Status → status_items (see ringtone note above).
UPDATE "home_feed_items" hfi
SET "cta_content_id" = s."id"
FROM "status_items" s
WHERE hfi."content_type" = 'status'
  AND hfi."cta_destination_type" = 'content_detail'
  AND hfi."cta_destination_value" = s."slug"
  AND hfi."cta_content_id" IS NULL;
