variable "name" {
  description = "Env-qualified schedule name (e.g. app-stage-billing)"
  type        = string
}

variable "region" {
  type = string
}

variable "cluster_arn" {
  description = "ECS cluster the one-off task runs in"
  type        = string
}

variable "cluster_name" {
  description = "ECS cluster name — used to scope ecs:DescribeTasks by task ARN"
  type        = string
}

variable "task_definition_family" {
  description = "Task-def family to run. A FAMILY, not a revision ARN: RunTask resolves it to the latest ACTIVE revision, so a task-def apply does not silently leave the schedule on stale code."
  type        = string
}

variable "container_name" {
  description = "Container inside the task-def that the command override targets"
  type        = string
}

variable "description" {
  description = "Console description for the schedule. Defaulted to the billing job so existing callers are unchanged; this module schedules any one-off task on the API task-def."
  type        = string
  default     = "Recurring UPI Autopay debits: PDN, presentation, reconciliation"
}

variable "command" {
  description = "Command override. telemetry.js is preloaded so the run is traced exactly like the API."
  type        = list(string)
  default     = ["node", "--import", "./telemetry.js", "billing.js"]
}

variable "subnet_ids" {
  description = "Private subnets — the task needs the RDS/Redis data plane and NAT egress to the provider"
  type        = list(string)
}

variable "security_group_id" {
  description = "SG the task runs with (the api task SG: same DB, same Redis, same egress)"
  type        = string
}

variable "execution_role_arn" {
  description = "Task execution role — the scheduler needs iam:PassRole on it"
  type        = string
}

variable "task_role_arn" {
  description = "Task role — the scheduler needs iam:PassRole on it"
  type        = string
}

variable "schedule_expression" {
  description = "How often to tick. 30 minutes matches the NPCI windows encoded in npci-window.ts — most ticks are deliberately no-ops."
  type        = string
  default     = "rate(30 minutes)"
}

variable "enabled" {
  description = "Arm the schedule. false leaves every resource in place but DISABLED, so arming later is a one-line change rather than a create."
  type        = bool
  default     = false
}
