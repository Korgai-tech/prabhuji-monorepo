-- TAM-67: Ringtone module. DISCOVERY IS FREE, EVERYTHING PLAYABLE IS PRO.
-- NOTE: `ringtones.audio_url` AND `ringtones.preview_image_url` always hold the
-- real URLs in the DB — they are ENTITLEMENT-GATED AT THE API (nulled before
-- serialization for non-Pro callers), NOT at the DB level. `thumbnail_image_url`
-- is FREE (grid/search card art). `deity_slug` logically references
-- `deities.slug` (TAM-57) with no DB FK across the module boundary (validated via
-- the deity facade); a ringtone carries exactly one deity. Like/share counts are
-- NOT stored here — they live in the shared TAM-57 engagement tables (contentType
-- "ringtone"); `play_count`/`set_count` ARE local sortable columns. `play_count`
-- is deduped per (user, ringtone, session token) via `ringtone_play_sessions`
-- (the ≥3s / ≥25%-duration rule). GIN indexes on `tags`/`search_keywords` back
-- partial (ILIKE) array-element search. Content ownership is CMS/ops (Phase 2).
-- Reversible: DROP TABLE ringtone_play_sessions, ringtones.

-- CreateTable
CREATE TABLE "ringtones" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "deity_slug" TEXT NOT NULL,
    "thumbnail_image_url" TEXT NOT NULL,
    "preview_image_url" TEXT NOT NULL,
    "audio_url" TEXT NOT NULL,
    "duration_seconds" INTEGER NOT NULL,
    "play_count" INTEGER NOT NULL DEFAULT 0,
    "set_count" INTEGER NOT NULL DEFAULT 0,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "search_keywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "language" TEXT,
    "festival_tag" TEXT,
    "artist_or_source" TEXT,
    "deep_link_url" TEXT,
    "alt_text" TEXT,
    "share_title" TEXT,
    "share_description" TEXT,
    "requires_pro" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ringtones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ringtone_play_sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "ringtone_id" UUID NOT NULL,
    "session_token" TEXT NOT NULL,
    "counted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ringtone_play_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ringtones_slug_key" ON "ringtones"("slug");

-- CreateIndex
CREATE INDEX "ringtones_is_active_sort_order_idx" ON "ringtones"("is_active", "sort_order");

-- CreateIndex
CREATE INDEX "ringtones_deity_slug_is_active_idx" ON "ringtones"("deity_slug", "is_active");

-- CreateIndex
CREATE INDEX "ringtones_tags_idx" ON "ringtones" USING GIN ("tags");

-- CreateIndex
CREATE INDEX "ringtones_search_keywords_idx" ON "ringtones" USING GIN ("search_keywords");

-- CreateIndex
CREATE INDEX "ringtone_play_sessions_ringtone_id_idx" ON "ringtone_play_sessions"("ringtone_id");

-- CreateIndex
CREATE UNIQUE INDEX "ringtone_play_sessions_user_id_ringtone_id_session_token_key" ON "ringtone_play_sessions"("user_id", "ringtone_id", "session_token");

-- AddForeignKey
ALTER TABLE "ringtone_play_sessions" ADD CONSTRAINT "ringtone_play_sessions_ringtone_id_fkey" FOREIGN KEY ("ringtone_id") REFERENCES "ringtones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

