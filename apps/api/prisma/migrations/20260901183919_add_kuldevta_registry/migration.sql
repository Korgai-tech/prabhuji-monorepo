-- CreateTable
CREATE TABLE "kuldevta_archetypes" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "voice_direction" TEXT NOT NULL,

    CONSTRAINT "kuldevta_archetypes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kuldevtas" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name_roman" TEXT NOT NULL,
    "name_devanagari" TEXT NOT NULL,
    "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "archetype_id" TEXT NOT NULL,
    "form_of" TEXT,
    "gender" TEXT NOT NULL,
    "states" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "communities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "temple_name" TEXT,
    "temple_village" TEXT,
    "temple_district" TEXT,
    "temple_state" TEXT,
    "iconography" TEXT,
    "epithets" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "mantra" TEXT,
    "weekly_day" TEXT,
    "festivals" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "offerings" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "niyam" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "tone_notes" TEXT,
    "persona_enabled" BOOLEAN NOT NULL DEFAULT true,
    "confidence" TEXT NOT NULL DEFAULT 'high',
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "is_fallback" BOOLEAN NOT NULL DEFAULT false,
    "human_reviewed" BOOLEAN NOT NULL DEFAULT true,
    "reviewed_by" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kuldevtas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kuldevta_translations" (
    "id" UUID NOT NULL,
    "kuldevta_id" UUID NOT NULL,
    "locale" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,

    CONSTRAINT "kuldevta_translations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kuldevta_region_defaults" (
    "region_code" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "default_kuldevta_slug" TEXT NOT NULL,
    "is_national_fallback" BOOLEAN NOT NULL DEFAULT false,
    "caveat" TEXT,

    CONSTRAINT "kuldevta_region_defaults_pkey" PRIMARY KEY ("region_code")
);

-- CreateTable
CREATE TABLE "user_kuldevtas" (
    "user_id" UUID NOT NULL,
    "kuldevta_slug" TEXT NOT NULL,
    "assignment_tier" TEXT NOT NULL,
    "matched_on" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "answers" JSONB NOT NULL,
    "profile" JSONB NOT NULL,
    "ragflow_session_id" TEXT,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_kuldevtas_pkey" PRIMARY KEY ("user_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "kuldevtas_slug_key" ON "kuldevtas"("slug");

-- CreateIndex
CREATE INDEX "kuldevtas_active_idx" ON "kuldevtas"("active");

-- CreateIndex
CREATE UNIQUE INDEX "kuldevta_translations_kuldevta_id_locale_key" ON "kuldevta_translations"("kuldevta_id", "locale");

-- CreateIndex
CREATE INDEX "user_kuldevtas_kuldevta_slug_idx" ON "user_kuldevtas"("kuldevta_slug");

-- AddForeignKey
ALTER TABLE "kuldevtas" ADD CONSTRAINT "kuldevtas_archetype_id_fkey" FOREIGN KEY ("archetype_id") REFERENCES "kuldevta_archetypes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kuldevta_translations" ADD CONSTRAINT "kuldevta_translations_kuldevta_id_fkey" FOREIGN KEY ("kuldevta_id") REFERENCES "kuldevtas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
