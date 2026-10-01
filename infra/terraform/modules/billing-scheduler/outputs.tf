output "schedule_name" {
  description = "EventBridge schedule name — `aws scheduler get-schedule --name <this>` to inspect it"
  value       = aws_scheduler_schedule.billing.name
}

output "schedule_arn" {
  value = aws_scheduler_schedule.billing.arn
}

output "scheduler_role_arn" {
  description = "Role the schedule assumes to call ecs:RunTask"
  value       = aws_iam_role.scheduler.arn
}
