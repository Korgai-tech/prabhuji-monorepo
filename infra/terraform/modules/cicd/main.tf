# Push-to-branch continuous deploy for one environment: a single CodeBuild
# project (webhook-triggered, Docker-privileged) builds every service image,
# pushes :$COMMIT_SHA + :latest to ECR, optionally runs a one-off migration task
# (var.migrate_task), then force-new-deployments the ECS services. Task
# definitions stay Terraform-owned — they reference :latest, so no task-def
# revisions are registered outside Terraform. No CodePipeline (hence no manual
# approval action: every push to var.branch deploys, in BOTH envs).

locals {
  # all service repos live in one account registry (<acct>.dkr.ecr.<region>.amazonaws.com)
  ecr_registry = split("/", var.services[0].ecr_repository_url)[0]

  arn_prefix  = "arn:${data.aws_partition.current.partition}:ecs:${var.region}:${data.aws_caller_identity.current.account_id}"
  cluster_arn = "${local.arn_prefix}:cluster/${var.cluster_name}"
}

data "aws_caller_identity" "current" {}
data "aws_partition" "current" {}

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
#
# iam:PassRole WAS deliberately withheld here (force-new-deployment reuses the
# live task def and needs none). TAM-79 reverses that: running the migration as a
# one-off task requires RunTask, which passes the task-def's two roles to ECS.
# This does not widen the real blast radius — whoever can push to var.branch
# already gets arbitrary code execution as the api task role, because the build
# builds and deploys their Dockerfile. The grant is still scoped hard: RunTask
# only on the migrate task-def family and only in this cluster, PassRole only on
# that task-def's own roles and only to ecs-tasks.amazonaws.com.
resource "aws_iam_role_policy" "this" {
  name = "build-and-deploy"
  role = aws_iam_role.this.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = concat([
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
      ],
      # Resolve the migrate-step secrets (e.g. CLICKHOUSE_PASSWORD) at build start.
      length(var.secret_env) > 0 ? [{
        Sid      = "ReadBuildSecrets"
        Effect   = "Allow"
        Action   = "secretsmanager:GetSecretValue"
        Resource = values(var.secret_env)
      }] : [],
      # Start + await the one-off db migration task (var.migrate_task). One
      # conditional per statement, not one wrapping all three: a ternary must
      # unify both result types, and these statements carry differently-shaped
      # Conditions — a single `? [a,b,c] : []` fails to typecheck.
      length(var.static_sites) > 0 ? [{
        Sid      = "StaticSiteSync"
        Effect   = "Allow"
        Action   = ["s3:ListBucket", "s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
        Resource = flatten([for st in var.static_sites : [st.bucket_arn, "${st.bucket_arn}/*"]])
        }, {
        Sid      = "StaticSiteInvalidate"
        Effect   = "Allow"
        Action   = ["cloudfront:CreateInvalidation"]
        Resource = [for st in var.static_sites : st.distribution_arn]
      }] : [],
      var.migrate_task != null ? [{
        Sid    = "EcsRunMigrateTask"
        Effect = "Allow"
        Action = ["ecs:RunTask"]
        # `:*` — run-task targets the family, which resolves to whichever revision
        # is latest; pinning one would break on every task-def apply.
        Resource  = ["${local.arn_prefix}:task-definition/${var.migrate_task.task_definition_family}:*"]
        Condition = { ArnEquals = { "ecs:cluster" = local.cluster_arn } }
      }] : [],
      # `aws ecs wait tasks-stopped` + the exit-code check
      var.migrate_task != null ? [{
        Sid      = "EcsDescribeMigrateTask"
        Effect   = "Allow"
        Action   = ["ecs:DescribeTasks"]
        Resource = ["${local.arn_prefix}:task/${var.cluster_name}/*"]
      }] : [],
      var.migrate_task != null ? [{
        Sid       = "PassMigrateTaskRoles"
        Effect    = "Allow"
        Action    = ["iam:PassRole"]
        Resource  = [var.migrate_task.execution_role_arn, var.migrate_task.task_role_arn]
        Condition = { StringEquals = { "iam:PassedToService" = "ecs-tasks.amazonaws.com" } }
    }] : [])
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

    # Non-secret build env (e.g. CLICKHOUSE_ENV / _HOST / _USER for the migrate step)
    dynamic "environment_variable" {
      for_each = var.plaintext_env
      content {
        name  = environment_variable.key
        value = environment_variable.value
        type  = "PLAINTEXT"
      }
    }

    # Secrets Manager-backed build env (e.g. CLICKHOUSE_PASSWORD); value is the secret ARN
    dynamic "environment_variable" {
      for_each = var.secret_env
      content {
        name  = environment_variable.key
        value = environment_variable.value
        type  = "SECRETS_MANAGER"
      }
    }
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
      static_sites = var.static_sites
      migrate      = var.migrate_task
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
