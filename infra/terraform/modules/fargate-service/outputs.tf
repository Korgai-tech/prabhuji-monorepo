output "ecr_repository_url" {
  value = aws_ecr_repository.this.repository_url
}

output "target_group_arn" {
  value = aws_lb_target_group.this.arn
}

output "service_name" {
  value = aws_ecs_service.this.name
}

output "ecr_repository_arn" {
  value = aws_ecr_repository.this.arn
}

output "service_arn" {
  # aws_ecs_service exposes its ARN as `id`
  value = aws_ecs_service.this.id
}

# --- one-off run-task inputs (db migrations) ------------------------------------
# `run-task --task-definition <family>` resolves to the latest ACTIVE revision, so
# the family (not a revision ARN) is what callers pass — and what IAM scopes with
# a `:*` suffix, since the revision changes on every task-def apply.

output "task_definition_family" {
  value = aws_ecs_task_definition.this.family
}

output "container_name" {
  # the module names the single container after the service
  value = var.name
}

output "execution_role_arn" {
  # passed to ECS by run-task callers — needs iam:PassRole
  value = aws_iam_role.execution.arn
}

output "task_role_arn" {
  value = aws_iam_role.task.arn
}
