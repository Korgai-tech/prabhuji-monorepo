# Stage CI/CD via CodeBuild (TAM-16) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every push to the long-lived `stage` branch automatically rebuilds the `api` + `events` Docker images and rolls the stage ECS services — via a single AWS CodeBuild project (no Jenkins, no GitHub Actions deploy, no CodePipeline), all declared in Terraform. `main` is the prod line: it triggers nothing; prod keeps manual pinned-tag applies.

**Architecture:** A new reusable module `infra/terraform/modules/cicd` (CodeBuild project + GitHub webhook + least-privilege IAM + log group) is instantiated in `envs/stage` only. Its templated buildspec builds both images from the repo-root Docker context, pushes `:$COMMIT_SHA` + `:latest` to the existing ECR repos, then runs `aws ecs update-service --force-new-deployment` per service. Stage task definitions float on `:latest` so a force-new-deployment picks up new images without new task-def revisions — Terraform stays sole owner of task defs. The shared `fargate-service` module additionally gains an ECS deployment circuit breaker.

**Tech Stack:** Terraform >= 1.7, AWS provider ~> 6.0, AWS CodeBuild (`aws/codebuild/standard:7.0`, privileged Docker), ECR, ECS Fargate.

## Global Constraints

- Spec: `specs/TAM-16-stage-cicd-codebuild.md` — read it first; its `#EXPORT_CRITICAL` section is binding.
- Branching model: `stage` branch → stage env (webhook `^refs/heads/stage$`); `main` → prod line, triggers no deploy. Promotion = merge/push `main` into `stage`.
- Branch: `TAM-16-stage-cicd-codebuild` off `main`; commits end with `[TAM-16]` (format `type(scope): description [TAM-16]`).
- Naming: env-qualified account-global names via the existing `app-<env>` convention — the CodeBuild project is `app-stage-deploy`.
- IAM: least privilege, explicit ARNs only; the sole `Resource = "*"` allowed is `ecr:GetAuthorizationToken`. **No `iam:PassRole` anywhere** — `--force-new-deployment` reuses the existing task def.
- No secrets in git/state: GitHub source credentials are imported out-of-band (`aws codebuild import-source-credentials`), only documented.
- `envs/prod` config files must not change. (Prod's *plan* will show one in-place service update from the shared circuit-breaker change — expected.)
- No database migrations in the pipeline — the buildspec must not run `prisma migrate deploy`.
- Repo verification: `terraform fmt -recursive -check infra/terraform`, `terraform init -backend=false && terraform validate` in both env roots, `pnpm verify` before PR.
- Known live-apply prerequisite (NOT part of this plan's local verification): the webhook resource fails to apply until account-level GitHub credentials exist. Document it; do not try to apply.

---

### Task 1: Branch + commit the spec

**Files:**
- Commit (already written): `specs/TAM-16-stage-cicd-codebuild.md`

**Interfaces:**
- Produces: the working branch `TAM-16-stage-cicd-codebuild` all later tasks commit to.

- [ ] **Step 1: Create the branch off main and commit the spec**

```bash
cd /Users/rishabh/code/monorepo-metaservice
git checkout main && git pull
git checkout -b TAM-16-stage-cicd-codebuild
git add specs/TAM-16-stage-cicd-codebuild.md docs/superpowers/plans/2026-07-07-stage-cicd-codebuild.md
git commit -m "docs(specs): add TAM-16 stage CodeBuild CI/CD spec + plan [TAM-16]"
```

Note: the spec and this plan are untracked files, so they carry over the `git checkout main` unchanged. Only if checkout is blocked by *tracked* modifications: `git stash`, checkout + branch, `git stash pop`.

Expected: `git log --oneline -1` shows the spec commit on the new branch.

### Task 2: ECS deployment circuit breaker in `fargate-service`

**Files:**
- Modify: `infra/terraform/modules/fargate-service/main.tf` (inside `resource "aws_ecs_service" "this"`, after `health_check_grace_period_seconds = 30`)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: rollout-halting behavior both envs inherit; no outputs/variables change.

- [ ] **Step 1: Add the circuit breaker block**

In `infra/terraform/modules/fargate-service/main.tf`, the ECS service currently reads (lines 139–147):

```hcl
resource "aws_ecs_service" "this" {
  name            = var.name
  cluster         = var.cluster_id
  task_definition = aws_ecs_task_definition.this.arn
  desired_count   = var.min_instances
  launch_type     = "FARGATE"

  health_check_grace_period_seconds = 30
```

Insert immediately after the `health_check_grace_period_seconds = 30` line:

```hcl

  # halt+revert a rollout whose tasks keep failing instead of flapping forever.
  # Note: stage floats on :latest, so "rollback" re-points at the same tag —
  # the value there is stopping the rollout while old tasks keep serving.
  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }
```

- [ ] **Step 2: Validate**

```bash
cd /Users/rishabh/code/monorepo-metaservice/infra/terraform/envs/stage
terraform init -backend=false && terraform validate
cd ../prod
terraform init -backend=false && terraform validate
cd /Users/rishabh/code/monorepo-metaservice
terraform fmt -recursive -check infra/terraform
```

Expected: both `Success! The configuration is valid.`; fmt exits 0 with no output.

- [ ] **Step 3: Commit**

```bash
git add infra/terraform/modules/fargate-service/main.tf
git commit -m "feat(infra): enable ECS deployment circuit breaker in fargate-service [TAM-16]"
```

### Task 3: The `cicd` Terraform module

**Files:**
- Create: `infra/terraform/modules/cicd/variables.tf`
- Create: `infra/terraform/modules/cicd/main.tf`
- Create: `infra/terraform/modules/cicd/buildspec.yml.tftpl`
- Create: `infra/terraform/modules/cicd/outputs.tf`

**Interfaces:**
- Consumes: nothing from other tasks (validated standalone in Task 4's env wiring).
- Produces: `module "cicd"` with inputs `name (string)`, `region (string)`, `github_repo_url (string)`, `branch (string, required)`, `cluster_name (string)`, `services (list(object({ service_name=string, service_arn=string, ecr_repository_url=string, ecr_repository_arn=string, dockerfile=string })))`, `compute_type (string, default "BUILD_GENERAL1_MEDIUM")`, `build_timeout (number, default 30)`, `docker_layer_cache (bool, default false)`; outputs `project_name`, `project_arn`, `log_group`.

- [ ] **Step 1: Write `variables.tf`**

```hcl
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
  description = "Branch whose pushes trigger a build+deploy (stage env passes \"stage\"; main is the prod line and triggers nothing)"
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
  }))
}

variable "compute_type" {
  description = "CodeBuild compute size"
  type        = string
  default     = "BUILD_GENERAL1_MEDIUM"
}

variable "build_timeout" {
  description = "Build timeout in minutes (two multi-stage image builds)"
  type        = number
  default     = 30
}

variable "docker_layer_cache" {
  description = "Enable CodeBuild's best-effort local Docker layer cache (flip on if builds exceed ~15 min)"
  type        = bool
  default     = false
}
```

- [ ] **Step 2: Write `buildspec.yml.tftpl`**

Terraform template note: `${...}` interpolates template vars; shell vars are written **without** braces (`$COMMIT_SHA`) so no escaping is needed.

```yaml
version: 0.2

phases:
  pre_build:
    commands:
      - COMMIT_SHA="$CODEBUILD_RESOLVED_SOURCE_VERSION"
      - aws ecr get-login-password --region ${region} | docker login --username AWS --password-stdin ${registry}
  build:
    commands:
%{ for s in services ~}
      - docker build -f ${s.dockerfile} -t ${s.ecr_repository_url}:$COMMIT_SHA -t ${s.ecr_repository_url}:latest .
      - docker push ${s.ecr_repository_url}:$COMMIT_SHA
      - docker push ${s.ecr_repository_url}:latest
%{ endfor ~}
  post_build:
    commands:
      # post_build runs even when build failed — never roll services on a red build
      - test "$CODEBUILD_BUILD_SUCCEEDING" = "1" || { echo "build failed - skipping deploy"; exit 1; }
%{ for s in services ~}
      - aws ecs update-service --region ${region} --cluster ${cluster_name} --service ${s.service_name} --force-new-deployment
%{ endfor ~}
```

- [ ] **Step 3: Write `main.tf`**

```hcl
# Push-to-branch continuous deploy for one environment: a single CodeBuild
# project (webhook-triggered, Docker-privileged) builds every service image,
# pushes :$COMMIT_SHA + :latest to ECR, then force-new-deployments the ECS
# services. Task definitions stay Terraform-owned — they reference :latest, so
# no task-def revisions are registered outside Terraform. No CodePipeline.

locals {
  # all service repos live in one account registry (<acct>.dkr.ecr.<region>.amazonaws.com)
  ecr_registry = split("/", var.services[0].ecr_repository_url)[0]
}

resource "aws_cloudwatch_log_group" "this" {
  name              = "/codebuild/${var.name}"
  retention_in_days = 30
}

data "aws_iam_policy_document" "assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["codebuild.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "this" {
  name               = var.name
  assume_role_policy = data.aws_iam_policy_document.assume.json
}

# Least privilege: push to the given repos, roll the given services, write own
# logs. GetAuthorizationToken is the one action AWS only offers account-wide.
# Deliberately NO iam:PassRole — force-new-deployment reuses the live task def.
resource "aws_iam_role_policy" "this" {
  name = "build-and-deploy"
  role = aws_iam_role.this.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "Logs"
        Effect   = "Allow"
        Action   = ["logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = ["${aws_cloudwatch_log_group.this.arn}:*"]
      },
      {
        Sid      = "EcrAuth"
        Effect   = "Allow"
        Action   = "ecr:GetAuthorizationToken"
        Resource = "*"
      },
      {
        Sid    = "EcrPush"
        Effect = "Allow"
        Action = [
          "ecr:BatchCheckLayerAvailability",
          "ecr:BatchGetImage",
          "ecr:GetDownloadUrlForLayer",
          "ecr:InitiateLayerUpload",
          "ecr:UploadLayerPart",
          "ecr:CompleteLayerUpload",
          "ecr:PutImage",
        ]
        Resource = [for s in var.services : s.ecr_repository_arn]
      },
      {
        Sid      = "EcsRoll"
        Effect   = "Allow"
        Action   = ["ecs:UpdateService", "ecs:DescribeServices"]
        Resource = [for s in var.services : s.service_arn]
      },
    ]
  })
}

resource "aws_codebuild_project" "this" {
  name          = var.name
  description   = "Builds ${var.branch} images for ${var.cluster_name} and rolls the ECS services"
  service_role  = aws_iam_role.this.arn
  build_timeout = var.build_timeout

  artifacts {
    type = "NO_ARTIFACTS"
  }

  environment {
    compute_type    = var.compute_type
    image           = "aws/codebuild/standard:7.0"
    type            = "LINUX_CONTAINER"
    privileged_mode = true # Docker-in-Docker for image builds
  }

  source {
    type            = "GITHUB"
    location        = var.github_repo_url
    git_clone_depth = 1
    buildspec = templatefile("${path.module}/buildspec.yml.tftpl", {
      region       = var.region
      registry     = local.ecr_registry
      cluster_name = var.cluster_name
      services     = var.services
    })
  }

  # branch used when a build is started manually (webhook builds carry their own ref)
  source_version = var.branch

  dynamic "cache" {
    for_each = var.docker_layer_cache ? [1] : []
    content {
      type  = "LOCAL"
      modes = ["LOCAL_DOCKER_LAYER_CACHE"]
    }
  }

  logs_config {
    cloudwatch_logs {
      group_name = aws_cloudwatch_log_group.this.name
    }
  }
}

# Requires account-level GitHub source credentials to already exist (imported
# once, out-of-band — never in Terraform state):
#   aws codebuild import-source-credentials --server-type GITHUB \
#     --auth-type PERSONAL_ACCESS_TOKEN --token <PAT with repo + admin:repo_hook>
# Without them this resource fails to apply ("No source credentials found").
resource "aws_codebuild_webhook" "this" {
  project_name = aws_codebuild_project.this.name
  build_type   = "BUILD"

  filter_group {
    filter {
      type    = "EVENT"
      pattern = "PUSH"
    }
    filter {
      type    = "HEAD_REF"
      pattern = "^refs/heads/${var.branch}$"
    }
  }
}
```

- [ ] **Step 4: Write `outputs.tf`**

```hcl
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
```

- [ ] **Step 5: Validate formatting (module is not yet referenced, so env validate can't see it — fmt only)**

```bash
cd /Users/rishabh/code/monorepo-metaservice
terraform fmt -recursive -check infra/terraform
```

Expected: exit 0, no output. (Full `terraform validate` of this module happens in Task 4 once stage references it.)

- [ ] **Step 6: Commit**

```bash
git add infra/terraform/modules/cicd
git commit -m "feat(infra): add cicd Terraform module (CodeBuild + webhook + IAM) [TAM-16]"
```

### Task 4: Expose stack identifiers and wire stage

**Files:**
- Modify: `infra/terraform/modules/fargate-service/outputs.tf` (append)
- Modify: `infra/terraform/modules/stack/outputs.tf` (append)
- Modify: `infra/terraform/envs/stage/main.tf` (append)
- Modify: `infra/terraform/envs/stage/outputs.tf` (append)
- Modify: `infra/terraform/envs/stage/terraform.tfvars` (image tags → `:latest`)

**Interfaces:**
- Consumes: `module "cicd"` inputs exactly as defined in Task 3.
- Produces: new stack outputs `cluster_name`, `api_service_name`, `events_service_name`, `api_service_arn`, `events_service_arn`, `api_ecr_repository_arn`, `events_ecr_repository_arn`; new fargate-service outputs `ecr_repository_arn`, `service_arn`; stage env output `cicd_project`.

- [ ] **Step 1: Append to `infra/terraform/modules/fargate-service/outputs.tf`**

```hcl

output "ecr_repository_arn" {
  value = aws_ecr_repository.this.arn
}

output "service_arn" {
  # aws_ecs_service exposes its ARN as `id`
  value = aws_ecs_service.this.id
}
```

- [ ] **Step 2: Append to `infra/terraform/modules/stack/outputs.tf`**

```hcl

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

output "api_service_arn" {
  value = module.api.service_arn
}

output "events_service_arn" {
  value = module.events.service_arn
}

output "api_ecr_repository_arn" {
  value = module.api.ecr_repository_arn
}

output "events_ecr_repository_arn" {
  value = module.events.ecr_repository_arn
}
```

- [ ] **Step 3: Append to `infra/terraform/envs/stage/main.tf`**

```hcl

# CI/CD — stage only: every push to the long-lived `stage` branch rebuilds
# api+events images and rolls the services. `main` is the prod line and
# triggers nothing; prod stays manual, pinned-tag terraform applies.
# One-time prerequisite: GitHub source credentials for CodeBuild — see
# infra/terraform/README.md ("CI/CD" section).
module "cicd" {
  source = "../../modules/cicd"

  name            = "app-stage-deploy"
  region          = var.region
  github_repo_url = "https://github.com/GamepeTechnolgies/monorepo-metaservice.git"
  branch          = "stage"
  cluster_name    = module.stack.cluster_name

  services = [
    {
      service_name       = module.stack.api_service_name
      service_arn        = module.stack.api_service_arn
      ecr_repository_url = module.stack.api_ecr_repository
      ecr_repository_arn = module.stack.api_ecr_repository_arn
      dockerfile         = "apps/api/Dockerfile"
    },
    {
      service_name       = module.stack.events_service_name
      service_arn        = module.stack.events_service_arn
      ecr_repository_url = module.stack.events_ecr_repository
      ecr_repository_arn = module.stack.events_ecr_repository_arn
      dockerfile         = "apps/events/Dockerfile"
    },
  ]
}
```

- [ ] **Step 4: Append to `infra/terraform/envs/stage/outputs.tf`**

First read the file to match its style, then append:

```hcl

output "cicd_project" {
  description = "CodeBuild project that auto-deploys main to stage"
  value       = module.cicd.project_name
}
```

- [ ] **Step 5: Float stage images on `:latest`** — replace the whole of `infra/terraform/envs/stage/terraform.tfvars`:

```hcl
# Stage floats on :latest — the cicd pipeline pushes a new :latest on every
# main merge and force-new-deployments the services; task defs never change.
# To pin stage temporarily (e.g. rollback), apply with :<commit-sha> instead.
api_image    = "661952267560.dkr.ecr.ap-south-1.amazonaws.com/app-stage-api-images:latest"
events_image = "661952267560.dkr.ecr.ap-south-1.amazonaws.com/app-stage-events-images:latest"
```

- [ ] **Step 6: Validate both envs + fmt**

```bash
cd /Users/rishabh/code/monorepo-metaservice/infra/terraform/envs/stage
terraform init -backend=false && terraform validate
cd ../prod
terraform init -backend=false && terraform validate
cd /Users/rishabh/code/monorepo-metaservice
terraform fmt -recursive -check infra/terraform
```

Expected: both `Success! The configuration is valid.` — this is also the first real validation of the Task 3 module. Prod validating proves the new stack/fargate outputs broke nothing.

- [ ] **Step 7: Verify prod config untouched**

```bash
git status --short infra/terraform/envs/prod
```

Expected: no output.

- [ ] **Step 8: Commit**

```bash
git add infra/terraform/modules/fargate-service/outputs.tf infra/terraform/modules/stack/outputs.tf infra/terraform/envs/stage
git commit -m "feat(infra): wire stage env to cicd module, float stage images on :latest [TAM-16]"
```

### Task 5: Run GitHub Actions CI on the `stage` branch too

**Files:**
- Modify: `.github/workflows/ci.yml:4-6` (the `on.push.branches` list)

**Interfaces:**
- Consumes: nothing.
- Produces: pushes to `stage` run the same verify/integration/E2E jobs as `main`, so the auto-deployed branch is never unverified.

- [ ] **Step 1: Add `stage` to the push trigger**

`.github/workflows/ci.yml` currently starts:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
```

Change the `branches` line to:

```yaml
    branches: [main, stage]
```

- [ ] **Step 2: Sanity-check the YAML**

```bash
python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/ci.yml')); print('ok')"
```

Expected: `ok` (if PyYAML is unavailable, `pnpm exec js-yaml .github/workflows/ci.yml > /dev/null` or careful visual review is acceptable — the change is one list literal).

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: run verify pipeline on pushes to stage branch [TAM-16]"
```

### Task 6: Documentation

**Files:**
- Modify: `infra/terraform/README.md` (new `## CI/CD — stage auto-deploy` section, inserted after the `### Tear down` section's content ends, i.e. before `## Environments at a glance`)
- Modify: `README.md:61` (root — extend the Terraform paragraph)
- Modify: `CLAUDE.md` (extend the "Production infra (Terraform)" bullet under "Local dev & deploy")

**Interfaces:**
- Consumes: resource names from Tasks 3–4 (`app-stage-deploy`, `/codebuild/app-stage-deploy`).
- Produces: nothing downstream.

- [ ] **Step 1: Add the CI/CD section to `infra/terraform/README.md`**

Read the file first to place the insertion exactly (after the `### Tear down` block, before `## Environments at a glance`). Insert:

````markdown
## CI/CD — stage auto-deploy

Stage continuously deploys from the long-lived **`stage` branch** — no Jenkins, no GitHub Actions deploy, no CodePipeline. `main` is the prod line and triggers nothing; promotion to the stage env = merge/push `main` into `stage` (GitHub Actions CI runs on both branches). A CodeBuild project (`app-stage-deploy`, declared by `modules/cicd`, instantiated only in `envs/stage`) has a GitHub webhook filtered to pushes on `stage`. Each build:

1. builds `apps/api/Dockerfile` and `apps/events/Dockerfile` from the repo root,
2. pushes each image to its stage ECR repo tagged `:<commit-sha>` **and** `:latest`,
3. runs `aws ecs update-service --force-new-deployment` on both stage services.

Stage task definitions reference the mutable `:latest` tag (see `envs/stage/terraform.tfvars`), so the force-new-deployment pulls the fresh image without registering task-def revisions — Terraform remains sole owner of task definitions, and `terraform apply` never fights the pipeline. The `:<commit-sha>` tags exist for traceability and rollback. **Prod is deliberately excluded**: it keeps human-gated, pinned-tag applies (steps 2–3 above).

### One-time prerequisite: GitHub credentials

The webhook resource fails to apply (`No source credentials found`) until account-level GitHub source credentials exist. Import them once per AWS account (PAT scopes: `repo`, `admin:repo_hook`; never goes in git or Terraform state):

```bash
aws codebuild import-source-credentials --server-type GITHUB \
  --auth-type PERSONAL_ACCESS_TOKEN --token <PAT>
```

### Operating it

```bash
# watch the latest build
aws codebuild list-builds-for-project --project-name app-stage-deploy --max-items 1
aws codebuild batch-get-builds --ids <build-id> --query 'builds[0].{phase:currentPhase,status:buildStatus}'
# logs live in CloudWatch group /codebuild/app-stage-deploy (or the CodeBuild console)
```

- **Deploy failure**: the ECS deployment circuit breaker halts a rollout whose tasks keep failing; old tasks keep serving. Because stage floats on `:latest`, automatic rollback re-points at the same tag — to truly revert, retag the last good image and force a deploy:

  ```bash
  # find the previous good sha in ECR, then:
  docker pull <repo>:<good-sha> && docker tag <repo>:<good-sha> <repo>:latest && docker push <repo>:latest
  aws ecs update-service --cluster app-stage --service app-stage-api --force-new-deployment
  ```

- **Migrations are NOT run by the pipeline** — schema changes still use the one-off `run-task` flow (step 4 above) before/after the deploy as appropriate.
- Builds too slow? Set `docker_layer_cache = true` on the `cicd` module in `envs/stage/main.tf` (best-effort local Docker layer cache).
````

- [ ] **Step 2: Extend the root `README.md` Terraform paragraph**

At `README.md:61`, after the sentence ending `See \`infra/terraform/README.md\`.`, insert:

```text
Stage auto-deploys from the `stage` branch via AWS CodeBuild (`modules/cicd`); `main` is the prod line — prod deploys stay manual and pinned.
```

- [ ] **Step 3: Extend `CLAUDE.md`**

In the "Local dev & deploy" section, the bullet starting `**Production infra (Terraform)**` ends with `See \`infra/terraform/README.md\`.` — extend that bullet's final sentence to:

```text
See `infra/terraform/README.md`. Stage auto-deploys from the `stage` branch via a CodeBuild webhook (`modules/cicd`); `main` is the prod line, deployed manually.
```

- [ ] **Step 4: Commit**

```bash
git add infra/terraform/README.md README.md CLAUDE.md
git commit -m "docs(infra): document stage CodeBuild auto-deploy + PAT prerequisite [TAM-16]"
```

### Task 7: Full verification + evidence

**Files:**
- Modify: `specs/TAM-16-stage-cicd-codebuild.md` (Evidence section)

**Interfaces:**
- Consumes: everything prior.
- Produces: the branch ready for `/pre-pr`.

- [ ] **Step 1: Run the full static validation suite**

```bash
cd /Users/rishabh/code/monorepo-metaservice/infra/terraform/envs/stage && terraform init -backend=false && terraform validate
cd ../prod && terraform init -backend=false && terraform validate
cd /Users/rishabh/code/monorepo-metaservice
terraform fmt -recursive -check infra/terraform
pnpm verify
```

Expected: both validates succeed; fmt silent; `pnpm verify` fully green (this change touches no Node code — failures here mean pre-existing breakage; report, don't paper over).

- [ ] **Step 2: Fill the spec's Evidence section**

Edit `specs/TAM-16-stage-cicd-codebuild.md` → `## Evidence`: paste the validate/fmt/verify outcomes and the session ID. Leave the "Live deploy" line marked pending — it can only be produced after a real `terraform apply` + push to `stage` (needs AWS creds + the imported GitHub PAT; see spec Demo Script).

- [ ] **Step 3: Commit**

```bash
git add specs/TAM-16-stage-cicd-codebuild.md
git commit -m "docs(specs): record TAM-16 static validation evidence [TAM-16]"
```

- [ ] **Step 4: Hand off**

Run `/pre-pr` (repo workflow) or tell the user the branch is ready. Do NOT `terraform apply` or create the PR without being asked.

---

## Post-plan notes (not tasks)

- **Live rollout** (user-driven, needs AWS creds): import the GitHub PAT; create the `stage` branch (`git checkout main && git checkout -b stage && git push -u origin stage` — it does not exist yet); `terraform apply` in `envs/stage`; push an empty commit to `stage`; then run the spec's Success Validation Commands and complete the Evidence "Live deploy" line.
- The first apply also rolls both services once (task defs move `:v1` → `:latest` — that IS a task-def change, the last one Terraform makes for image reasons). Make sure a `:latest` tag exists in ECR before that apply (retag `:v1` → `:latest`) or the services will fail to pull.
