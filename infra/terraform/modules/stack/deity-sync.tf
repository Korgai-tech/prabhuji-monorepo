# TAM-175 — mirror the warehouse's per-user deity preference into Postgres.
#
# WHY A SCHEDULED ONE-OFF AND NOT A REQUEST-PATH LOOKUP. The source of truth is
# `custom_user_properties` in ClickHouse Cloud — a hosted analytical store
# reached over the public internet. `GET /home/feed` is the app's cold-start
# screen whose page hydrate is ~0.9 ms; querying the warehouse per request would
# put a round trip on every app open and tie the feed's availability to the
# warehouse's, where today it survives Redis being down entirely. So a periodic
# job writes the five columns we need back into `user_deity_preferences`, and the
# feed reads only that. `docs/ANALYTICS-USER-PROPERTIES-BACKEND.md` specifies
# exactly this ("warehouse-derived, written back periodically").
#
# Reuses the billing scheduler module — same run-task-with-overrides shape, same
# IAM scoping, and the job inherits the API's image, task role, VPC and Secrets
# Manager wiring for free.
#
# SAFE TO RUN AT ANY CADENCE: the watermark is `MAX(warehouse_updated_at)` of the
# mirror itself and the write is an upsert, so a re-run is a no-op and an
# interrupted run resumes from what actually landed.
module "deity_preference_sync" {
  source = "../billing-scheduler"
  # Created only where a warehouse is wired — without ClickHouse credentials the
  # job has nothing to read.
  count = local.wire_clickhouse && var.clickhouse_analytics_database != "" ? 1 : 0

  name        = "${local.name_prefix}-deity-sync"
  description = "TAM-175: mirror custom_user_properties -> user_deity_preferences"
  region      = var.region

  cluster_arn  = aws_ecs_cluster.main.arn
  cluster_name = aws_ecs_cluster.main.name

  task_definition_family = module.api.task_definition_family
  container_name         = module.api.container_name
  execution_role_arn     = module.api.execution_role_arn
  task_role_arn          = module.api.task_role_arn

  subnet_ids        = local.private_subnet_ids
  security_group_id = aws_security_group.api_tasks.id

  # Built as its own esbuild entry point (apps/api/project.json), exactly like
  # billing.js — so it sits at the image root. `telemetry.js` is preloaded so the
  # run is traced like every other task.
  command = ["node", "--import", "./telemetry.js", "sync-deity-preferences.js"]

  schedule_expression = var.deity_sync_schedule_expression
  # DISABLED still creates every resource, so arming is a variable flip rather
  # than an apply that has to get IAM right under time pressure.
  enabled = var.enable_deity_sync
}
