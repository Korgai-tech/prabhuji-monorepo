// Scheme- and host-aware: https://<domain> once a certificate is attached,
// http://<raw ALB dns> otherwise. See `public_base_url` in tls.tf — the raw ALB
// hostname stops being usable the moment a certificate exists, because :80 then
// redirects to an https URL that hostname's certificate does not cover.
output "api_url" {
  description = "api base URL (shared ALB, catch-all route)"
  value       = local.public_base_url
}

output "events_url" {
  description = "events collector endpoint (Amplitude V2) — mobile serverUrl"
  value       = "${local.public_base_url}/2/httpapi"
}

output "api_ecr_repository" {
  description = "Docker repo for api images"
  value       = module.api.ecr_repository_url
}

output "events_ecr_repository" {
  description = "Docker repo for events images"
  value       = module.events.ecr_repository_url
}

output "admin_ecr_repository" {
  description = "Docker repo for admin CMS images"
  value       = try(module.admin[0].ecr_repository_url, "")
}

output "admin_url" {
  description = "admin CMS URL. With admin_domain_name set it is that host's root; otherwise the /cms path prefix on the shared ALB. CLEARTEXT until a certificate is attached — admin JWTs and edits ride plaintext until then."
  value = (
    local.split_host
    ? "${local.wire_https ? "https" : "http"}://${var.admin_domain_name}/"
    : "${local.public_base_url}/cms/"
  )
}

# --- TLS / DNS ------------------------------------------------------------------

output "https_enabled" {
  description = "Whether a 443 listener with a certificate exists"
  value       = local.wire_https
}

output "alb_dns_name" {
  description = "Raw ALB hostname — the CNAME target when DNS lives at an external registrar"
  value       = aws_lb.main.dns_name
}

output "alb_hosted_zone_id" {
  description = "ALB's Route53 zone id — for an ALIAS record written from another account"
  value       = aws_lb.main.zone_id
}

output "acm_certificate_arn" {
  description = "The certificate on the 443 listener (requested or supplied); empty when no domain is wired"
  value       = local.byo_cert ? var.acm_certificate_arn : (local.create_cert ? aws_acm_certificate.main[0].arn : "")
}

output "acm_validation_records" {
  description = "DNS records to publish BY HAND when route53_zone_id is empty. Empty when Terraform owns the zone (it writes them itself)."
  value       = local.create_cert && !local.manage_dns ? aws_acm_certificate.main[0].domain_validation_options : []
}

# NOTE: `cluster_name` is already exported further down (the cicd block). The gap
# docs/DEPLOYMENT.md's billing dry-run hits is that neither ENV ROOT re-exports
# it — fixed in envs/{stage,prod}/outputs.tf, not here.

output "rds_endpoint" {
  description = "RDS Postgres endpoint (host:port, for migrations)"
  value       = aws_db_instance.postgres.endpoint
}

output "rds_address" {
  description = "RDS Postgres hostname WITHOUT the port — what the SSM port-forward `host=` parameter takes (rds_endpoint's :5432 suffix would make it a malformed target)"
  value       = aws_db_instance.postgres.address
}

output "bastion_instance_id" {
  description = "SSM bastion instance id — the --target of `aws ssm start-session` (empty unless enable_bastion=true)"
  value       = var.enable_bastion ? aws_instance.bastion[0].id : ""
}

output "redis_host" {
  description = "ElastiCache Redis host"
  value       = aws_elasticache_cluster.cache.cache_nodes[0].address
}

output "kinesis_stream" {
  description = "Click-events Kinesis stream name (analytics pipe); empty if enable_kinesis=false"
  value       = var.enable_kinesis ? aws_kinesis_stream.events[0].name : ""
}

# --- Media object store (TAM-83) ------------------------------------------------

output "media_bucket" {
  description = "Media bucket name — the value wired into the api task's MEDIA_BUCKET"
  value       = aws_s3_bucket.media.bucket
}

output "media_cdn_domain" {
  description = "CloudFront distribution domain for media (*.cloudfront.net — no custom domain yet, D-D1)"
  value       = aws_cloudfront_distribution.media.domain_name
}

output "media_public_base_url" {
  description = "Base URL every stored media URL is built from and validated against (ADR A4) — the value wired into the api task's MEDIA_PUBLIC_BASE_URL. Always the CDN, never the S3 origin."
  value       = "https://${aws_cloudfront_distribution.media.domain_name}"
}

output "media_distribution_arn" {
  description = "Media CloudFront distribution ARN — the sole principal the media bucket policy admits"
  value       = aws_cloudfront_distribution.media.arn
}

output "media_cdn_logs_bucket" {
  description = "Bucket holding the media CDN's CloudFront access logs (prefix media/, 90-day expiry) — read with scripts/cdn-log-report.sh (TAM-266)"
  value       = aws_s3_bucket.media_cdn_logs.bucket
}

output "kafka_brokers" {
  description = "MSK SASL/IAM bootstrap brokers for the API domain-event bus (empty if enable_kafka=false)"
  value       = var.enable_kafka ? aws_msk_cluster.domain_events[0].bootstrap_brokers_sasl_iam : ""
}

output "vpc_id" {
  description = "This environment's VPC id"
  value       = aws_vpc.main.id
}

output "private_subnet_ids" {
  description = "Private subnet ids (tasks + data plane) — used by one-off run-task commands"
  value       = local.private_subnet_ids
}

output "api_task_security_group_id" {
  description = "SG of the api tasks — used by one-off run-task commands (migrations)"
  value       = aws_security_group.api_tasks.id
}

# --- api one-off run-task inputs (Prisma migrations) ----------------------------
# Consumed by modules/cicd's `migrate_task` (TAM-79) so the pipeline can apply
# migrations before rolling services, and by `scripts/deploy-infra.sh` step 5.

output "api_task_definition_family" {
  description = "api ECS task-def family — run-task resolves it to the latest ACTIVE revision"
  value       = module.api.task_definition_family
}

output "api_container_name" {
  description = "Container name inside the api task-def — the target of run-task command overrides"
  value       = module.api.container_name
}

output "api_execution_role_arn" {
  description = "api task execution role — run-task callers need iam:PassRole on it"
  value       = module.api.execution_role_arn
}

output "api_task_role_arn" {
  description = "api task role — run-task callers need iam:PassRole on it"
  value       = module.api.task_role_arn
}

# --- recurring-debit scheduler --------------------------------------------------

output "billing_schedule_name" {
  description = "EventBridge schedule that fires the billing cycle — `aws scheduler get-schedule --name <this>` shows its state and next run. Empty when create_billing_scheduler=false."
  value       = one(module.billing_scheduler[*].schedule_name)
}

output "clickpipe_reader_role_arn" {
  description = "IAM role ARN to paste into the ClickHouse Cloud ClickPipe wizard (empty if enable_clickpipe=false)"
  value       = var.enable_clickpipe ? aws_iam_role.clickpipe_reader[0].arn : ""
}

output "clickhouse_host_secret_arn" {
  description = "Secrets Manager ARN of the ClickHouse Cloud host (empty if not wired)"
  value       = local.wire_clickhouse ? aws_secretsmanager_secret.clickhouse_host[0].arn : ""
}

output "clickhouse_user_secret_arn" {
  description = "Secrets Manager ARN of the ClickHouse Cloud user (empty if not wired)"
  value       = local.wire_clickhouse ? aws_secretsmanager_secret.clickhouse_user[0].arn : ""
}

output "clickhouse_password_secret_arn" {
  description = "Secrets Manager ARN of the ClickHouse Cloud password (empty if not wired)"
  value       = local.wire_clickhouse ? aws_secretsmanager_secret.clickhouse_password[0].arn : ""
}

output "dockerhub_username_secret_arn" {
  description = "Secrets Manager ARN of the Docker Hub username used for authenticated CI pulls (empty if not wired)"
  value       = local.wire_dockerhub ? aws_secretsmanager_secret.dockerhub_username[0].arn : ""
}

output "dockerhub_token_secret_arn" {
  description = "Secrets Manager ARN of the Docker Hub PAT used for authenticated CI pulls (empty if not wired)"
  value       = local.wire_dockerhub ? aws_secretsmanager_secret.dockerhub_token[0].arn : ""
}

# --- identifiers consumed by the per-env cicd module ---------------------------

output "cluster_name" {
  description = "ECS cluster name"
  value       = aws_ecs_cluster.main.name
}

output "api_service_name" {
  value = module.api.service_name
}

output "events_service_name" {
  value = module.events.service_name
}

output "admin_service_name" {
  value = try(module.admin[0].service_name, "")
}

output "api_service_arn" {
  value = module.api.service_arn
}

output "events_service_arn" {
  value = module.events.service_arn
}

output "admin_service_arn" {
  value = try(module.admin[0].service_arn, "")
}

output "api_ecr_repository_arn" {
  value = module.api.ecr_repository_arn
}

output "events_ecr_repository_arn" {
  value = module.events.ecr_repository_arn
}

output "admin_ecr_repository_arn" {
  value = try(module.admin[0].ecr_repository_arn, "")
}

# --- Admin static site (TAM-172) ------------------------------------------------
output "admin_static_bucket" {
  description = "S3 bucket the CI syncs the built admin SPA into (empty if enable_admin_static=false)"
  value       = var.enable_admin_static ? aws_s3_bucket.admin[0].bucket : ""
}

output "admin_static_bucket_arn" {
  value = var.enable_admin_static ? aws_s3_bucket.admin[0].arn : ""
}

output "admin_cdn_domain" {
  description = "CloudFront hostname serving the admin SPA over HTTPS"
  value       = var.enable_admin_static ? aws_cloudfront_distribution.admin[0].domain_name : ""
}

output "admin_cdn_distribution_id" {
  value = var.enable_admin_static ? aws_cloudfront_distribution.admin[0].id : ""
}

output "admin_cdn_distribution_arn" {
  value = var.enable_admin_static ? aws_cloudfront_distribution.admin[0].arn : ""
}
