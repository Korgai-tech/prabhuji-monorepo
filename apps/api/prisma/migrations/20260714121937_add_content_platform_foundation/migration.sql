-- CreateTable
CREATE TABLE "deities" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "icon_url" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deity_translations" (
    "id" UUID NOT NULL,
    "deity_id" UUID NOT NULL,
    "locale" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,

    CONSTRAINT "deity_translations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "engagement_counters" (
    "id" UUID NOT NULL,
    "content_type" TEXT NOT NULL,
    "content_id" UUID NOT NULL,
    "like_count" INTEGER NOT NULL DEFAULT 0,
    "view_count" INTEGER NOT NULL DEFAULT 0,
    "share_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "engagement_counters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_likes" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "content_type" TEXT NOT NULL,
    "content_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_likes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "deities_slug_key" ON "deities"("slug");

-- CreateIndex
CREATE INDEX "deities_active_sort_order_idx" ON "deities"("active", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "deity_translations_deity_id_locale_key" ON "deity_translations"("deity_id", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "engagement_counters_content_type_content_id_key" ON "engagement_counters"("content_type", "content_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_likes_user_id_content_type_content_id_key" ON "user_likes"("user_id", "content_type", "content_id");

-- AddForeignKey
ALTER TABLE "deity_translations" ADD CONSTRAINT "deity_translations_deity_id_fkey" FOREIGN KEY ("deity_id") REFERENCES "deities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
