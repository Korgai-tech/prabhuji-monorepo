-- CreateTable
CREATE TABLE "modal_user_states" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "modal_key" TEXT NOT NULL,
    "trigger_source" TEXT NOT NULL,
    "surface" TEXT,
    "content" JSONB NOT NULL DEFAULT '{}',
    "armed_at" TIMESTAMP(3),
    "last_outcome_module" TEXT,
    "audience_id" INTEGER,
    "audience_name" TEXT,
    "campaign_id" INTEGER,
    "show_count" INTEGER NOT NULL DEFAULT 0,
    "shown_today_count" INTEGER NOT NULL DEFAULT 0,
    "last_shown_date_ist" TEXT,
    "last_shown_at" TIMESTAMP(3),
    "max_lifetime" INTEGER NOT NULL DEFAULT 3,
    "max_per_day" INTEGER NOT NULL DEFAULT 1,
    "halted_at" TIMESTAMP(3),
    "halted_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "modal_user_states_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "modal_hook_deliveries" (
    "task_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "origin" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "modal_key" TEXT NOT NULL,
    "source_event_name" TEXT,
    "audience_id" INTEGER,
    "campaign_id" INTEGER,
    "applied" BOOLEAN NOT NULL DEFAULT true,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "modal_hook_deliveries_pkey" PRIMARY KEY ("task_id")
);

-- CreateTable
CREATE TABLE "modal_impressions" (
    "id" BIGSERIAL NOT NULL,
    "user_id" UUID NOT NULL,
    "modal_key" TEXT NOT NULL,
    "trigger_source" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "dismiss_method" TEXT,
    "show_number" INTEGER NOT NULL,
    "last_outcome_module" TEXT,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "modal_impressions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "modal_user_states_user_id_surface_idx" ON "modal_user_states"("user_id", "surface");

-- CreateIndex
CREATE UNIQUE INDEX "modal_user_states_user_id_modal_key_trigger_source_key" ON "modal_user_states"("user_id", "modal_key", "trigger_source");

-- CreateIndex
CREATE INDEX "modal_impressions_user_id_modal_key_occurred_at_idx" ON "modal_impressions"("user_id", "modal_key", "occurred_at");
