output "api_url" {
  description = "api base URL (shared ALB, catch-all route)"
  value       = module.stack.api_url
}

output "events_url" {
  description = "events collector endpoint (Amplitude V2) — mobile serverUrl"
  value       = module.stack.events_url
}

output "admin_url" {
  description = "admin CMS URL (shared ALB, /cms prefix — cleartext HTTP, no TLS yet)"
  value       = module.stack.admin_url
}

output "api_ecr_repository" {
  description = "Docker repo for api images"
  value       = module.stack.api_ecr_repository
}

output "events_ecr_repository" {
  description = "Docker repo for events images"
  value       = module.stack.events_ecr_repository
}

output "rds_endpoint" {
  description = "RDS Postgres endpoint (host:port, for migrations)"
  value       = module.stack.rds_endpoint
}

output "redis_host" {
  description = "ElastiCache Redis host"
  value       = module.stack.redis_host
}

output "kinesis_stream" {
  description = "Click-events Kinesis stream name (analytics pipe)"
  value       = module.stack.kinesis_stream
}

output "kafka_brokers" {
  description = "MSK SASL/IAM bootstrap brokers for the API domain-event bus"
  value       = module.stack.kafka_brokers
}

output "media_bucket" {
  description = "Media bucket name (private — readable only via the CDN below)"
  value       = module.stack.media_bucket
}

output "media_public_base_url" {
  description = "Media CDN base URL — the api task's MEDIA_PUBLIC_BASE_URL, and the prefix every stored media URL must start with"
  value       = module.stack.media_public_base_url
}

output "media_distribution_arn" {
  description = "Media CloudFront distribution ARN — the only principal the bucket policy admits"
  value       = module.stack.media_distribution_arn
}

output "media_cdn_logs_bucket" {
  description = "Media CDN access-log bucket (prefix media/) — read with scripts/cdn-log-report.sh (TAM-266)"
  value       = module.stack.media_cdn_logs_bucket
}

output "rds_address" {
  description = "RDS hostname without the port — the `host=` parameter of the SSM port-forward"
  value       = module.stack.rds_address
}

output "bastion_instance_id" {
  description = "SSM bastion instance id — the --target of `aws ssm start-session` (empty unless enable_bastion=true)"
  value       = module.stack.bastion_instance_id
}

output "private_subnet_ids" {
  description = "Private subnet ids — for one-off run-task commands (migrations)"
  value       = module.stack.private_subnet_ids
}

output "api_task_security_group_id" {
  description = "SG of the api tasks — for one-off run-task commands (migrations)"
  value       = module.stack.api_task_security_group_id
}

output "clickpipe_reader_role_arn" {
  description = "IAM role ARN for the ClickHouse Cloud ClickPipe wizard (empty unless enable_clickpipe=true)"
  value       = module.stack.clickpipe_reader_role_arn
}

output "cicd_project" {
  description = "CodeBuild project that auto-deploys the stage branch to this env"
  value       = module.cicd.project_name
}

# --- TLS / DNS ------------------------------------------------------------------

output "https_enabled" {
  description = "Whether a 443 listener with a certificate exists. false = every URL above is plaintext."
  value       = module.stack.https_enabled
}

output "alb_dns_name" {
  description = "Raw ALB hostname — the CNAME/ALIAS target when DNS lives outside this account"
  value       = module.stack.alb_dns_name
}

output "acm_certificate_arn" {
  description = "Certificate on the 443 listener; empty when no domain is wired"
  value       = module.stack.acm_certificate_arn
}

output "acm_validation_records" {
  description = "DNS records to publish BY HAND when route53_zone_id is empty. Empty when Terraform owns the zone."
  value       = module.stack.acm_validation_records
}

# Required by the billing dry-run runbook in docs/DEPLOYMENT.md, which reads
# `terraform output -raw cluster_name` and fails without this.
output "cluster_name" {
  description = "ECS cluster name — for one-off run-task commands (migrations, billing dry run)"
  value       = module.stack.cluster_name
}

# --- Admin static site (TAM-172) ------------------------------------------------
output "admin_cdn_domain" {
  description = "CloudFront hostname of the admin CMS static site (HTTPS). Point the CMS CNAME here once a us-east-1 ACM cert is attached."
  value       = module.stack.admin_cdn_domain
}

output "admin_static_bucket" {
  description = "S3 bucket the pipeline syncs the built admin SPA into"
  value       = module.stack.admin_static_bucket
}
