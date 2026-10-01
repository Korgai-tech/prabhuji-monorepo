# Recurring-debit scheduler: EventBridge Scheduler -> one-off ECS task.
#
# Runs `apps/api/src/billing.ts` (bundled to billing.js) on the API's OWN task
# definition via a command override. That is the whole design decision worth
# stating: billing gets the same image, the same task role, the same VPC and the
# same Secrets Manager wiring as the API for free, and adding a secret in
# services.tf arms both. A dedicated task definition would duplicate that env
# map, and the first secret someone forgot to copy would surface as a silently
# skipped billing run rather than an error.
#
# The same run-task-with-overrides shape the repo already uses twice: the
# pipeline's Prisma migrate step (modules/cicd) and `scripts/deploy-infra.sh`.
#
# NOT a Fargate service: a billing cycle is a bounded job that exits, and
# running it as a long-lived container would need its own in-process timer, its
# own liveness story, and would keep a task warm 24/7 to do ~48 short runs a day.

locals {
  # Region/account come from the caller's resources rather than a data source —
  # the module is only ever instantiated alongside the stack it schedules.
  arn_parts    = split(":", var.cluster_arn)
  partition    = local.arn_parts[1]
  account_id   = local.arn_parts[4]
  arn_prefix   = "arn:${local.partition}:ecs:${var.region}:${local.account_id}"
  task_def_arn = "${local.arn_prefix}:task-definition/${var.task_definition_family}"
}

resource "aws_iam_role" "scheduler" {
  name = "${var.name}-scheduler"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Action    = "sts:AssumeRole"
      Principal = { Service = "scheduler.amazonaws.com" }
      # Confused-deputy guard: only THIS account's schedules may assume it.
      Condition = { StringEquals = { "aws:SourceAccount" = local.account_id } }
    }]
  })
}

# Mirrors the migrate-task statements in modules/cicd — same call, same scoping.
resource "aws_iam_role_policy" "scheduler" {
  name = "${var.name}-run-task"
  role = aws_iam_role.scheduler.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "EcsRunBillingTask"
        Effect = "Allow"
        Action = ["ecs:RunTask"]
        # `:*` — RunTask targets the family, which resolves to whichever
        # revision is latest; pinning one would break on every task-def apply.
        Resource  = ["${local.task_def_arn}:*"]
        Condition = { ArnEquals = { "ecs:cluster" = var.cluster_arn } }
      },
      {
        Sid    = "PassBillingTaskRoles"
        Effect = "Allow"
        Action = ["iam:PassRole"]
        # Exactly the two roles the task definition names — never a wildcard,
        # which would let this role launch anything in the account.
        Resource  = [var.execution_role_arn, var.task_role_arn]
        Condition = { StringEquals = { "iam:PassedToService" = "ecs-tasks.amazonaws.com" } }
      },
    ]
  })
}

resource "aws_scheduler_schedule" "billing" {
  name        = var.name
  description = var.description
  # DISABLED still creates every resource, so arming is a variable flip rather
  # than an apply that has to get IAM right under time pressure.
  state = var.enabled ? "ENABLED" : "DISABLED"

  # OFF, not a flexible window. The engine already refuses to act outside the
  # NPCI execution windows (npci-window.ts), so letting AWS smear invocations
  # would only move ticks into hours where they are guaranteed no-ops.
  flexible_time_window {
    mode = "OFF"
  }

  schedule_expression = var.schedule_expression
  # IST because every date in this domain is an Indian calendar day — the
  # cycle_date, the NPCI windows, the PDN blackout. Only relevant if the
  # expression is ever changed from rate() to cron(), which is exactly when
  # having it already correct matters.
  schedule_expression_timezone = "Asia/Kolkata"

  target {
    # Universal target rather than the templated ECS one: `input` here is the
    # verbatim RunTask API payload, so the container override is explicit
    # instead of relying on EventBridge's input-means-overrides convention.
    arn      = "arn:${local.partition}:scheduler:::aws-sdk:ecs:runTask"
    role_arn = aws_iam_role.scheduler.arn

    input = jsonencode({
      Cluster        = var.cluster_arn
      TaskDefinition = var.task_definition_family
      LaunchType     = "FARGATE"
      Count          = 1
      NetworkConfiguration = {
        AwsvpcConfiguration = {
          Subnets = var.subnet_ids
          # Private subnets reach ECR/Secrets Manager/Decentro via NAT.
          AssignPublicIp = "DISABLED"
          SecurityGroups = [var.security_group_id]
        }
      }
      Overrides = {
        ContainerOverrides = [{
          Name    = var.container_name
          Command = var.command
        }]
      }
    })

    retry_policy {
      # ONE retry, and only for a failure to LAUNCH the task — EventBridge
      # cannot see what the cycle did, so a retry re-runs the whole tick. That
      # is safe (the (mandate_id, cycle_date) constraint and the Redis lock both
      # hold) but pointless beyond once: the next scheduled tick is 30 minutes
      # away and picks up anything missed.
      maximum_retry_attempts       = 1
      maximum_event_age_in_seconds = 300
    }
  }
}
