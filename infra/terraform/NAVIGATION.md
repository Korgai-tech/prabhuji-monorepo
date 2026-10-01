# Terraform navigation — where is everything?

A book-style index of `infra/terraform/`. Paths are relative to this directory.
Entries point at a file plus, where useful, the `--- Section ---` comment bar or
resource address inside it (stable and grep-able; line numbers are not).

How to read the tree: `envs/stage` and `envs/prod` are the two roots you
actually `terraform apply`. Each instantiates `modules/stack` (the whole
environment) which in turn instantiates `modules/fargate-service` three times
(api, events, admin). `modules/cicd` is instantiated by **both** envs — stage
auto-deploys from `stage`, prod from `main`, with no approval gate on either.

For the operating runbook (setup, deploy, teardown) see [README.md](./README.md).
Design rationale lives in `docs/EVENT-ARCHITECTURE.md` (Kafka vs Kinesis) and
`docs/ANALYTICS-WAREHOUSE.md` (ClickPipe/ClickHouse).

## "Where is …?" — topic index

| Topic | Where |
|---|---|
| ALB (shared, one per env) + HTTP :80 listener + default 404 | `modules/stack/main.tf` § *Shared ALB + ECS cluster* (`aws_lb.main`, `aws_lb_listener.http`) |
| Autoscaling (CPU target-tracking @ 70%, min/max) | `modules/fargate-service/main.tf` § *ECS service + autoscaling* (`aws_appautoscaling_target/policy`) |
| Buildspec (CI gates → docker build/push → ECS roll) | `modules/cicd/buildspec.yml.tftpl` (rendered inline into the CodeBuild project — not read from the repo at build time) |
| CI/CD pipeline (CodeBuild project, webhook, IAM role) | `modules/cicd/main.tf`; wired in BOTH `envs/stage/main.tf` and `envs/prod/main.tf` (`module "cicd"`) |
| Circuit breaker (halt+rollback bad ECS rollouts) | `modules/fargate-service/main.tf` (inside `aws_ecs_service.this`) |
| ClickPipe reader role (ClickHouse Cloud → Kinesis) | `modules/stack/clickpipe.tf` (opt-in via `enable_clickpipe`) |
| ClickStack OTel collector (per-task sidecar → ClickHouse Cloud) | `modules/stack/services.tf` (`sidecar_*` args on the api+events modules; gated by `local.wire_clickstack_collector = enable_telemetry && wire_clickhouse`, guarded by `terraform_data.telemetry_guard`); rendered in `modules/fargate-service/main.tf` § *Task definition*; image/db knobs in `modules/stack/variables.tf` (`clickstack_collector_image`, `clickstack_clickhouse_database`) |
| CloudWatch log groups | `/ecs/<name>`: `modules/fargate-service/main.tf`; `/codebuild/<name>`: `modules/cicd/main.tf` |
| Deploy trigger (push to `stage` branch → webhook) | `modules/cicd/main.tf` (`aws_codebuild_webhook.this`); branch set in `envs/stage/main.tf` |
| ECR repositories (`<name>-images`, scan-on-push) | `modules/fargate-service/main.tf` (`aws_ecr_repository.this`) |
| ECS cluster | `modules/stack/main.tf` § *Shared ALB + ECS cluster* (`aws_ecs_cluster.main`) |
| ECS services (api, events) — definition | `modules/fargate-service/main.tf` (`aws_ecs_service.this`); instantiated per service in `modules/stack/services.tf` |
| Env sizing (db/redis class, task counts, kafka size) | `envs/stage/main.tf` and `envs/prod/main.tf` — hard-coded per env in the `module "stack"` block, not tfvars |
| Env vars — **plaintext** config/flags (`NODE_ENV`, `PORT`, `ENABLE_*`, `REDIS_URL`) | `modules/stack/services.tf` (`environment = merge({...})` per service); rendered into the task def by `modules/fargate-service/main.tf` (`environment = [for k,v ...]`). Sensitive values go via `secrets` instead — see the *Secrets* rows below |
| Env vars — **CodeBuild / build time** (NOT visible to a running task) | `modules/cicd/main.tf` (`plaintext_env` / `secret_env` vars) + the `env:` block in `modules/cicd/buildspec.yml.tftpl`. Neither env root passes these today; the buildspec's `JWT_SECRET`/`DATABASE_URL` are CI placeholders for the integration suite. Runtime config set here silently does nothing — use `environment`/`secrets` in `modules/stack/services.tf` |
| Feature flags (`enable_kafka`, `kafka_app_enabled`, `enable_telemetry`, `enable_clickpipe`) | declared in `modules/stack/variables.tf`; set per env in `envs/*/main.tf` |
| Health checks (path, thresholds) | `modules/fargate-service/main.tf` § *ALB target group + listener rule* (default `/health` in `variables.tf`) |
| IAM — task **execution** role (pull image, logs, read secrets) | `modules/fargate-service/main.tf` § *IAM* (`aws_iam_role.execution`) |
| IAM — task **runtime** role (what the app may call: Kinesis, MSK) | `modules/fargate-service/main.tf` (`aws_iam_role.task`); per-service policy JSON passed from `modules/stack/services.tf` (`extra_task_policy_json`) |
| IAM — CodeBuild role (logs, ECR push, ECS roll; no PassRole) | `modules/cicd/main.tf` (`aws_iam_role_policy.this`) |
| IAM — ClickPipe cross-account role | `modules/stack/clickpipe.tf` |
| Image tags (`:latest`, floating in BOTH envs) | `envs/{stage,prod}/terraform.tfvars` (`api_image`, `events_image`, `admin_image`); pin temporarily with `IMAGE_TAG=<sha> pnpm deploy:infra <env>` |
| TLS / ACM / Route53 / 443 listener | `modules/stack/tls.tf` (inert while `domain_name = ""`) |
| Kinesis stream (click-events → ClickPipe) | `modules/stack/main.tf` § *Kinesis (click-events sink)* |
| Media bucket (private S3, BPA on, SSE-S3, CORS) | `modules/stack/media.tf` (`aws_s3_bucket.media` + `_public_access_block` / `_ownership_controls` / `_cors_configuration`) |
| Media CDN (CloudFront + OAC; the bucket's only reader) | `modules/stack/media.tf` (`aws_cloudfront_distribution.media`, `aws_cloudfront_origin_access_control.media`, `aws_s3_bucket_policy.media`) |
| Media env vars into the api task (`MEDIA_BUCKET`, `MEDIA_PUBLIC_BASE_URL`) | `modules/stack/services.tf` (`module "api"` → `environment`) |
| Media IAM (api task: PutObject/GetObject, no Delete, no List) | `modules/stack/services.tf` § *api task role statements* (`local.api_media_statements`) |
| MSK / Kafka cluster (domain-event bus, SASL/IAM) | `modules/stack/main.tf` § *Amazon MSK (API internal domain-event bus)*; knobs under § *MSK* in `modules/stack/variables.tf` |
| OTP test numbers (`TEST_NUMBERS` plaintext, `TEST_OTP` secret) | `modules/stack/main.tf` § *Test numbers* (`local.wire_test_numbers`, `aws_secretsmanager_secret.test_otp`) + `modules/stack/services.tf`; values in `envs/*/terraform.tfvars` (numbers, committed) and `envs/*/secrets.auto.tfvars` (code, gitignored). Both-or-neither, like `wire_msg91` |
| Naming convention (`app-<env>-*`) | `name_prefix` local in `modules/stack/network.tf` |
| NAT gateway (single, in public[0]) + EIP | `modules/stack/network.tf` |
| Provider pins (TF ≥1.7, aws ~>6.0) + default tags | `envs/*/versions.tf` (provider + tags); `modules/*/versions.tf` (module constraints) |
| RDS Postgres 18 (instance, subnet group, password) | `modules/stack/main.tf` § *RDS (Postgres 18)* |
| Redis (ElastiCache, single node) | `modules/stack/main.tf` § *ElastiCache Redis* |
| Routing (path patterns, listener-rule priorities) | per-service values in `modules/stack/services.tf` (api: `/*` prio 100; events: `/2/httpapi*` prio 10); rule resource in `modules/fargate-service/main.tf` |
| Secrets — **created** (JWT, DATABASE_URL, events key, HyperDX) | `modules/stack/main.tf` § *Secrets* |
| Secrets — **injected into containers** (name → ARN map) | maps built in `modules/stack/services.tf` (`secrets = merge({...})`); consumed by the task definition in `modules/fargate-service/main.tf` (`valueFrom`) |
| Secrets — **read permission** (GetSecretValue, scoped) | `modules/fargate-service/main.tf` (`aws_iam_role_policy.execution_secrets`) |
| Security groups (alb, api_tasks, events_tasks, db, redis, kafka) | `modules/stack/main.tf` § *Security groups* |
| Service N+1 — how to add a backend service | `modules/stack/services.tf` header comment (one more `module` block + outputs) |
| State / backend (S3, commented — local until enabled) | `envs/stage/backend.tf`, `envs/prod/backend.tf` |
| Subnets (public/private), VPC, route tables, IGW | `modules/stack/network.tf` |
| Target groups (ip-type, per service) | `modules/fargate-service/main.tf` § *ALB target group + listener rule* |
| Task definitions (cpu/memory, env, secrets, awslogs, + optional sidecar container) | `modules/fargate-service/main.tf` § *Task definition* (app container always; sidecar appended when `sidecar_image != ""`) |
| Variables — root-level (region, images, clickpipe trio) | `envs/*/variables.tf` — everything else is hard-coded in `envs/*/main.tf` |

## File-by-file tree

```
infra/terraform/
├── envs/
│   ├── stage/                  # apply-able root — VPC 10.10.0.0/16, disposable sizing
│   │   ├── main.tf             # module "stack" (env sizing) + module "cicd" (stage-only auto-deploy)
│   │   ├── variables.tf        # region, api_image, events_image, clickpipe trio
│   │   ├── terraform.tfvars    # image URIs pinned to :latest (floating-tag deploys)
│   │   ├── outputs.tf          # re-exports stack outputs + cicd_project
│   │   ├── backend.tf          # S3 backend, written but commented — local state today
│   │   └── versions.tf         # TF/provider pins + provider block (default_tags Environment=stage)
│   └── prod/                   # apply-able root — VPC 10.20.0.0/16, protected sizing. NEVER APPLIED YET
│       ├── main.tf             # module "stack" + module "cicd" (auto-deploys `main`) + plan-time credential guards
│       ├── variables.tf        # same shape as stage
│       ├── outputs.tf          # same as stage
│       ├── backend.tf          # S3 backend (key prod/…), commented
│       └── versions.tf         # pins + provider (default_tags Environment=prod)
└── modules/
    ├── stack/                  # one whole environment (everything but the per-service plumbing)
    │   ├── network.tf          # VPC, public/private subnets, IGW, NAT+EIP, route tables; name_prefix local
    │   ├── main.tf             # security groups → RDS → Redis → Kinesis → MSK → secrets → ALB + ECS cluster
    │   ├── services.tf         # the two fargate-service instantiations (api, events); routing, env, secrets maps, task IAM
    │   ├── media.tf            # admin-CMS media: PRIVATE S3 bucket + CloudFront/OAC (its only reader) + bucket policy
    │   ├── clickpipe.tf        # opt-in cross-account IAM role for ClickHouse Cloud ClickPipe
    │   ├── variables.tf        # all stack knobs (sizing, MSK, observability, clickpipe)
    │   ├── outputs.tf          # URLs, endpoints, ECR repos + identifiers consumed by the cicd module
    │   └── versions.tf         # module-level provider constraints
    ├── fargate-service/        # one backend service: reused by api + events (and any service N+1)
    │   ├── main.tf             # ECR → log group → IAM (execution/task) → task def → TG + listener rule → service + autoscaling
    │   ├── variables.tf        # ports, routing, cpu/memory, min/max, env/secrets maps, extra task policy, optional sidecar (image/env/secrets)
    │   └── outputs.tf          # repo URL/ARN, target group, service name/ARN
    └── cicd/                   # CodeBuild-only CD (stage): push to branch → build → push :sha+:latest → roll ECS
        ├── main.tf             # log group → least-privilege IAM → CodeBuild project (inline buildspec) → webhook
        ├── buildspec.yml.tftpl # the pipeline itself: CI gates, docker build/push, guarded ECS force-new-deployment
        ├── variables.tf        # repo URL, branch, services list, compute/timeout/layer-cache knobs
        └── outputs.tf          # project name/ARN, log group
```

## Quick facts & gotchas

- **Naming**: everything is `app-<env>-*` (`name_prefix`). One shared AWS account — ECR/IAM/log-group names are account-global, so the prefix is what prevents stage/prod collisions.
- **Stage vs prod**: both have `terraform.tfvars`, a `cicd` module, and floating `:latest` images. Prod additionally has deletion protection on, bigger instance classes, min 2 / max 3 tasks, live Cashfree + MSG91 pinned in its tfvars, and plan-time preconditions that refuse a stub provider or a partial credential set. **Prod has never been applied** — its first apply is a greenfield ~120-resource create.
- **State is local** in both envs until you uncomment `backend.tf` (S3 + native lockfile, no DynamoDB). Separate state per env.
- **Task definitions never change on deploy** (stage): they reference `:latest`; the pipeline pushes a new image and calls `ecs update-service --force-new-deployment`. Zero Terraform drift by design.
- **Secret values**: TF-generated ones (JWT, DB password/URL, events key) exist in Terraform state; externally-supplied credentials (GitHub PAT for CodeBuild) are imported out-of-band and never touch git or state. HyperDX key comes in via a sensitive var (so: state).
- **Plaintext env vs Secrets Manager** — two different task-def mechanisms, chosen by sensitivity, not convenience:
  - `environment` bakes the value into the task-def JSON in plaintext, readable by anyone with `ecs:DescribeTaskDefinition` (console, CLI, CloudTrail). Holds only NON-secret config: flags (`ENABLE_*`), `PORT`, `AWS_REGION`, the internal `REDIS_URL` (no password).
  - `secrets` stores only a `valueFrom` **ARN**; the ECS agent resolves the real value from Secrets Manager at container start using the execution role, so the plaintext never lands in the task def. Holds `JWT_SECRET`, `DATABASE_URL`, `AUTH_OTP_PEPPER`, `HYPERDX_API_KEY`.
  - Rule for a new var: *safe sitting in plaintext in the task def?* → `environment`. Otherwise → a Secrets Manager secret + the `secrets` map + the execution-role read grant (`aws_iam_role_policy.execution_secrets`). Non-secrets deliberately stay OUT of Secrets Manager — it bills per secret/month and adds IAM + versioning weight for zero security gain.
- **`kafka_app_enabled=false`**: MSK is provisioned but the app doesn't consume it yet — don't be surprised the brokers are idle (they still bill ~$90/mo on stage).
- **Buildspec edits need `terraform apply`**, not a push — it's rendered into the CodeBuild project, the repo checkout is only the docker build context.
- **Destroy gotcha**: Secrets Manager secrets have a 30-day recovery window; re-creating an env with the same names right after destroy fails unless force-deleted (see README § Tear down).
- **ClickStack telemetry** (`enable_telemetry`): adds an OTel collector **sidecar** to each api/events task (app → `localhost:4318` → collector → ClickHouse Cloud). The collector image is a **pinned Docker Hub pull** (`clickstack_collector_image`, not `:latest`) and reuses the `clickhouse_*` secrets; enabling it bumps those tasks to 1024/2048. `admin` is never instrumented. Off = no sidecar, zero diff. Design: `docs/OBSERVABILITY.md`.
- **The media bucket is private and stays private** (`media.tf`): all four Block Public Access flags on, ACLs disabled, and the bucket policy admits exactly one principal — the CloudFront distribution, conditioned on its ARN. "Media is public" means publicly *reachable via the CDN*, not a public *bucket*. **Versioning is off and there is no lifecycle rule on purpose** (immutable keys, never overwrite, never delete); **CloudFront invalidation must never be wired** — a new asset is a new URL. Rationale + the reconsider-if conditions are in the file's comments and `docs/ADMIN-CMS-ARCHITECTURE.md` §A2/§A3/§A6.
