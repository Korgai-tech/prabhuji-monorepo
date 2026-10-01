# Recurring-debit scheduler (core/payment). Fires a one-off ECS task every 30
# minutes that runs one billing cycle: expire sweep, due pre-debit
# notifications, due presentations, reconciliation.
#
# Reuses the api's task definition, roles, SG and subnets — see the header in
# modules/billing-scheduler. Nothing here is api-service-specific beyond those
# handoffs, so this stays a single module block.
#
# Realization is the human's `pnpm deploy:infra <env>` apply, and the schedule
# is created DISABLED unless the env opts in: `enable_billing_scheduler` and the
# app's own `ENABLE_BILLING_SCHEDULER` are two independent switches, and BOTH
# must be on before a rupee moves. That is deliberate — one of them is an
# infrastructure change and the other rides a code deploy, so neither can arm
# billing on its own.
#
# `create_billing_scheduler = false` is a third, blunter switch: it does not
# create the schedule (or its IAM role) at all. `enable_billing_scheduler=false`
# already costs nothing and fires nothing, so this exists for envs where the
# schedule should not be one variable flip away from running — stage, which now
# carries prod's Decentro credentials.
module "billing_scheduler" {
  source = "../billing-scheduler"
  count  = var.create_billing_scheduler ? 1 : 0

  name         = "${local.name_prefix}-billing"
  region       = var.region
  cluster_arn  = aws_ecs_cluster.main.arn
  cluster_name = aws_ecs_cluster.main.name

  task_definition_family = module.api.task_definition_family
  container_name         = module.api.container_name
  execution_role_arn     = module.api.execution_role_arn
  task_role_arn          = module.api.task_role_arn

  subnet_ids        = local.private_subnet_ids
  security_group_id = aws_security_group.api_tasks.id

  schedule_expression = var.billing_schedule_expression
  enabled             = var.enable_billing_scheduler
}

# The `count` above re-addressed this module from `module.billing_scheduler` to
# `module.billing_scheduler[0]`. Without this block Terraform reads the old
# address as "not in configuration" and plans a destroy + create of prod's LIVE
# schedule and its IAM role — 3 destroy / 3 add for a change that alters nothing.
# Keep it: it is what makes the count addition a no-op for any env that already
# has the scheduler. No-op on stage, which never created it.
moved {
  from = module.billing_scheduler
  to   = module.billing_scheduler[0]
}
