output "project_name" {
  description = "CodeBuild project — watch builds with: aws codebuild list-builds-for-project --project-name <this>"
  value       = aws_codebuild_project.this.name
}

output "project_arn" {
  value = aws_codebuild_project.this.arn
}

output "log_group" {
  description = "CloudWatch log group holding build logs"
  value       = aws_cloudwatch_log_group.this.name
}
