variable "name" {
  description = "Service name (ECS service, task def, ECR repo, IAM role prefix). Must be env-qualified by the caller (e.g. app-stage-api) — ECR/IAM/log-group names are account-global."
  type        = string
}

variable "region" {
  type = string
}

variable "cluster_id" {
  type = string
}

variable "cluster_name" {
  type = string
}

variable "vpc_id" {
  type = string
}

variable "subnet_ids" {
  type = list(string)
}

variable "task_security_group_id" {
  description = "SG applied to the tasks (owned by the root module; ALB ingress + data-plane egress live there)"
  type        = string
}

variable "alb_listener_arn" {
  type = string
}

variable "extra_listener_arn" {
  description = "Optional SECOND listener to attach an identical rule to. Used only during a TLS cutover, to keep the cleartext :80 path serving while clients migrate off it (modules/stack/tls.tf sets it from redirect_http_to_https=false). Empty (default) = one rule, on alb_listener_arn."
  type        = string
  default     = ""
}

variable "listener_rule_priority" {
  description = "Unique ALB listener rule priority (lower = evaluated first)"
  type        = number
}

variable "listener_rule_path_patterns" {
  description = "Path patterns routed to this service (e.g. [\"/2/httpapi\", \"/2/httpapi/*\"] or [\"/*\"] for the catch-all)"
  type        = list(string)
}

variable "listener_rule_host_headers" {
  description = "Hostnames routed to this service, ANDed with listener_rule_path_patterns. Empty (the default) = no host condition, i.e. the path rules match on EVERY hostname reaching the listener — the historical single-hostname behaviour every env had before split-host routing. Set it and the rule matches only these hosts, which is what lets api.<domain> and cms.<domain> serve different services from the same ALB."
  type        = list(string)
  default     = []
}

variable "image" {
  description = "Full image ref to deploy"
  type        = string
}

variable "container_port" {
  type = number
}

variable "health_check_path" {
  type    = string
  default = "/health"
}

variable "cpu" {
  type    = string
  default = "512"
}

variable "memory" {
  type    = string
  default = "1024"
}

variable "min_instances" {
  description = "ECS desired/min tasks (Fargate cannot scale to zero — must be >= 1)"
  type        = number
}

variable "max_instances" {
  type = number
}

variable "environment" {
  description = "Plain (non-secret) container env"
  type        = map(string)
  default     = {}
}

variable "secrets" {
  description = "name => Secrets Manager ARN, injected via the task def `secrets` (never plaintext env)"
  type        = map(string)
  default     = {}
}

# --- Optional sidecar container (e.g. an OTel collector) -------------------------
# When sidecar_image is set, a second, non-essential container is added to the task.
# In awsvpc mode it shares the task's network namespace, so the app reaches it on
# localhost. Its secrets are auto-added to the execution role's read-secrets grant.

variable "sidecar_image" {
  description = "Full image ref for an optional sidecar container; empty = no sidecar"
  type        = string
  default     = ""
}

variable "sidecar_name" {
  description = "Container name for the sidecar (also its log stream prefix)"
  type        = string
  default     = "sidecar"
}

variable "sidecar_environment" {
  description = "Plain (non-secret) env for the sidecar container"
  type        = map(string)
  default     = {}
}

variable "sidecar_secrets" {
  description = "name => Secrets Manager ARN for the sidecar (never plaintext env)"
  type        = map(string)
  default     = {}
}

variable "assign_public_ip" {
  description = "Assign a public IP to tasks (only for subnets without NAT egress)"
  type        = bool
  default     = false
}

variable "extra_task_policy_json" {
  description = "Optional IAM policy JSON attached to the task role (e.g. kinesis:PutRecords). Empty = none."
  type        = string
  default     = ""
}

variable "use_spot" {
  description = "Run the service on FARGATE_SPOT (interruptible, ~70% cheaper). Stage only: an interruption just restarts the task; never for a service that takes payment webhooks. The cluster must have the FARGATE_SPOT capacity provider associated (modules/stack does)."
  type        = bool
  default     = false
}
