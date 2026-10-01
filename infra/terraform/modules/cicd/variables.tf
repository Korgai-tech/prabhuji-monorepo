variable "name" {
  description = "CodeBuild project name, env-qualified (e.g. app-stage-deploy) — prefixes the role and log group"
  type        = string
}

variable "region" {
  description = "AWS region (for ECR login and ecs update-service in the buildspec)"
  type        = string
}

variable "github_repo_url" {
  description = "HTTPS clone URL of the GitHub repo (e.g. https://github.com/org/repo.git)"
  type        = string
}

variable "branch" {
  description = "Branch whose pushes trigger a build+deploy — the webhook is unconditional, so BOTH envs auto-deploy (stage passes \"stage\", prod passes \"main\")"
  type        = string
}

variable "cluster_name" {
  description = "ECS cluster the services run in"
  type        = string
}

variable "services" {
  description = "Services to build+deploy; service N+1 = one more entry"
  type = list(object({
    service_name       = string # ECS service name (e.g. app-stage-api)
    service_arn        = string # for IAM scoping of ecs:UpdateService
    ecr_repository_url = string # push target (<registry>/<repo>)
    ecr_repository_arn = string # for IAM scoping of ECR push
    dockerfile         = string # path from repo root (the Docker build context)

    # --build-arg pairs for this service's image, {} for most of them. This is
    # for values that must be baked in at BUILD time and therefore cannot come
    # from the task definition: a Vite SPA inlines import.meta.env at build, so
    # the admin bundle's base path and API URL are fixed the moment the image is
    # built. Per-env, because stage and prod build the same Dockerfile
    # differently (stage: CMS at /cms, same-origin; prod: CMS at its own host
    # root, cross-origin).
    #
    # NOT for secrets. Build args land in the image history and in CodeBuild
    # logs; runtime secrets belong in Secrets Manager via the task definition.
    build_args = optional(map(string), {})
  }))
}

variable "compute_type" {
  description = "CodeBuild compute size"
  type        = string
  default     = "BUILD_GENERAL1_MEDIUM"
}

variable "build_timeout" {
  description = "Build timeout in minutes (verify gates + integration tests + clickhouse check + two multi-stage image builds)"
  type        = number
  default     = 45
}

variable "docker_layer_cache" {
  description = "Enable CodeBuild's best-effort local Docker layer cache (flip on if builds exceed ~15 min)"
  type        = bool
  default     = false
}

variable "plaintext_env" {
  description = "Non-secret env vars exposed to every build phase (name => value), e.g. CLICKHOUSE_HOST for the migrate step"
  type        = map(string)
  default     = {}
}

variable "secret_env" {
  description = "Secret env vars resolved from Secrets Manager at build start (name => secret ARN). The build role is granted GetSecretValue on these ARNs."
  type        = map(string)
  default     = {}
}

# A one-off ECS task the build runs AFTER pushing images and BEFORE rolling any
# service — the db migration (TAM-79). The build stays outside the VPC and never
# holds DB credentials: the task reaches RDS from inside the VPC and reads the
# password the same way the api does. A non-zero exit fails the build, so no
# service rolls onto code whose migration did not apply.
#
# null (default) => no migration step; the rendered buildspec and IAM policy are
# byte-identical to a pipeline that never had one.
variable "migrate_task" {
  description = "One-off ECS task run before services roll (Prisma migrate deploy). null = no migration step."
  type = object({
    task_definition_family = string       # run-task resolves this to the latest ACTIVE revision
    container_name         = string       # container the command override targets
    execution_role_arn     = string       # iam:PassRole target
    task_role_arn          = string       # iam:PassRole target
    subnet_ids             = list(string) # private subnets (assignPublicIp=DISABLED)
    security_group_ids     = list(string) # must be admitted by the db SG
    command                = list(string) # e.g. ["npx","prisma","migrate","deploy","--schema","./prisma/schema.prisma"]
  })
  default = null
}

variable "static_sites" {
  description = "Static SPAs built in CI and synced to S3 + CloudFront (the admin CMS). Site N+1 = one more entry."
  type = list(object({
    name             = string
    nx_project       = string
    dist_dir         = string # from repo root, e.g. apps/admin/dist
    bucket           = string
    bucket_arn       = string
    distribution_id  = string
    distribution_arn = string
    build_env        = optional(map(string), {})
  }))
  default = []
}
