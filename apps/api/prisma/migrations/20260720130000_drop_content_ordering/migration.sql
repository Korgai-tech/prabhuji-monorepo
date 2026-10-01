-- DropIndex
DROP INDEX "audio_items_is_active_sort_order_idx";

-- DropIndex
DROP INDEX "home_feed_items_is_active_sort_order_idx";

-- DropIndex
DROP INDEX "mantra_audio_items_is_active_sort_order_idx";

-- DropIndex
DROP INDEX "ringtones_is_active_sort_order_idx";

-- DropIndex
DROP INDEX "status_items_is_active_sort_order_idx";

-- DropIndex
DROP INDEX "wallpapers_is_active_display_order_idx";

-- AlterTable
ALTER TABLE "audio_items" DROP COLUMN "sort_order";

-- AlterTable
ALTER TABLE "home_feed_items" DROP COLUMN "sort_order";

-- AlterTable
ALTER TABLE "mantra_audio_items" DROP COLUMN "sort_order";

-- AlterTable
ALTER TABLE "ringtones" DROP COLUMN "sort_order";

-- AlterTable
ALTER TABLE "status_items" DROP COLUMN "sort_order";

-- AlterTable
ALTER TABLE "wallpapers" DROP COLUMN "display_order";
