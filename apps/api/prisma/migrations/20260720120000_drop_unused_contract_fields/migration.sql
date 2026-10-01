-- Drop CMS-only / never-consumed content fields the mobile app never reads.
--
-- Trims the wire contract down to what the app actually uses: playback duration,
-- per-item Pro gates that are enforced server-side (not from these columns),
-- festival tags, the wallpaper apply-asset + custom-category tagging, and the
-- book pro-access flag. Discovery-is-free / playback-is-pro gating stays enforced
-- at the API via the subscription facade, so dropping the `requires_pro*` columns
-- changes no behaviour. Reversible by re-adding the columns/index.
--
-- 16 columns across 7 tables + the wallpapers custom-category-tags GIN index.

-- DropIndex
DROP INDEX "wallpapers_custom_category_tags_idx";

-- AlterTable
ALTER TABLE "audio_items" DROP COLUMN "duration_seconds",
DROP COLUMN "requires_pro_for_playback";

-- AlterTable
ALTER TABLE "content" DROP COLUMN "pro_access_required";

-- AlterTable
ALTER TABLE "mantra_audio_items" DROP COLUMN "duration_seconds",
DROP COLUMN "requires_pro_for_playback",
DROP COLUMN "short_share_text";

-- AlterTable
ALTER TABLE "ringtones" DROP COLUMN "duration_seconds",
DROP COLUMN "festival_tag",
DROP COLUMN "preview_image_url",
DROP COLUMN "requires_pro";

-- AlterTable
ALTER TABLE "status_items" DROP COLUMN "duration_seconds",
DROP COLUMN "festival_tag";

-- AlterTable
ALTER TABLE "wallpaper_homepage_rows" DROP COLUMN "custom_category_tag_filter";

-- AlterTable
ALTER TABLE "wallpapers" DROP COLUMN "apply_asset_url",
DROP COLUMN "custom_category_tags",
DROP COLUMN "video_duration_seconds";
