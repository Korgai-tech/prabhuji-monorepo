# Reusable ECS Fargate service behind a shared ALB: ECR repo, task definition,
# service + autoscaling, target group + listener rule, and least-privilege
# execution/task roles. Networking (VPC, SGs, ALB, cluster, data plane) is
# owned by the root module and passed in.

resource "aws_ecr_repository" "this" {
  name = "${var.name}-images"

  image_scanning_configuration {
    scan_on_push = true
  }
}

# Keep the ten newest images (any tag). `:latest` is always the newest so it is
# never expired; ten older digests remain for a `put-image` rollback. Without
# this the prod api repository had grown to 73 images / 20 GB (TAM-172).
resource "aws_ecr_lifecycle_policy" "this" {
  repository = aws_ecr_repository.this.name

  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "keep the 10 most recent images"
      selection = {
        tagStatus   = "any"
        countType   = "imageCountMoreThan"
        countNumber = 10
      }
      action = { type = "expire" }
    }]
  })
}

resource "aws_cloudwatch_log_group" "this" {
  name              = "/ecs/${var.name}"
  retention_in_days = 30
}

# --- IAM ---------------------------------------------------------------------

data "aws_iam_policy_document" "assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

# Execution role: what the ECS agent needs to START the task (ECR pull, logs,
# resolve this service's secrets).
resource "aws_iam_role" "execution" {
  name               = "${var.name}-execution"
  assume_role_policy = data.aws_iam_policy_document.assume.json
}

resource "aws_iam_role_policy_attachment" "execution_base" {
  role       = aws_iam_role.execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role_policy" "execution_secrets" {
  count = length(var.secrets) + length(var.sidecar_secrets) > 0 ? 1 : 0
  name  = "read-secrets"
  role  = aws_iam_role.execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = "secretsmanager:GetSecretValue"
      # A `valueFrom` may address a JSON key inside a secret ("<arn>:KEY::"); the
      # policy needs the bare secret ARN, so strip anything after the secret name.
      Resource = distinct([
        for v in concat(values(var.secrets), values(var.sidecar_secrets)) :
        regex("^(arn:aws:secretsmanager:[^:]*:[^:]*:secret:[^:]*)", v)[0]
      ])
    }]
  })
}

# Task role: what the RUNNING app may call (e.g. kinesis:PutRecords for events).
resource "aws_iam_role" "task" {
  name               = "${var.name}-runtime"
  assume_role_policy = data.aws_iam_policy_document.assume.json
}

resource "aws_iam_role_policy" "task_extra" {
  count  = var.extra_task_policy_json == "" ? 0 : 1
  name   = "${var.name}-task"
  role   = aws_iam_role.task.id
  policy = var.extra_task_policy_json
}

# --- Task definition ----------------------------------------------------------

resource "aws_ecs_task_definition" "this" {
  family                   = var.name
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.cpu
  memory                   = var.memory
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task.arn

  container_definitions = jsonencode(concat([{
    name         = var.name
    image        = var.image
    essential    = true
    portMappings = [{ containerPort = var.container_port, protocol = "tcp" }]

    environment = [for k, v in var.environment : { name = k, value = v }]
    # never plaintext env — resolved by the ECS agent from Secrets Manager
    secrets = [for k, v in var.secrets : { name = k, valueFrom = v }]

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.this.name
        "awslogs-region"        = var.region
        "awslogs-stream-prefix" = var.name
      }
    }
    },
    ], var.sidecar_image == "" ? [] : [{
      # Optional sidecar (e.g. OTel collector). Non-essential: its failure must not
      # take down the app. Shares the task network namespace (awsvpc), so the app
      # reaches it on localhost — no portMappings needed. No dependsOn: the app's
      # OTLP exporter retries until the collector is listening, so a slow/broken
      # collector never blocks the app from starting.
      #
      # Non-essential also means one-off tasks that run on this task definition
      # (the Prisma migrate task, the billing tick) still STOP when their command
      # container exits — the sidecar does not hold the task open.
      name      = var.sidecar_name
      image     = var.sidecar_image
      essential = false

      environment = [for k, v in var.sidecar_environment : { name = k, value = v }]
      secrets     = [for k, v in var.sidecar_secrets : { name = k, valueFrom = v }]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.this.name
          "awslogs-region"        = var.region
          "awslogs-stream-prefix" = var.sidecar_name
        }
      }
  }]))
}

# --- ALB target group + listener rule ----------------------------------------

resource "aws_lb_target_group" "this" {
  name        = var.name
  port        = var.container_port
  protocol    = "HTTP"
  target_type = "ip"
  vpc_id      = var.vpc_id

  health_check {
    path                = var.health_check_path
    matcher             = "200"
    interval            = 30
    healthy_threshold   = 2
    unhealthy_threshold = 5
  }
}

resource "aws_lb_listener_rule" "this" {
  listener_arn = var.alb_listener_arn
  priority     = var.listener_rule_priority

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.this.arn
  }

  condition {
    path_pattern {
      values = var.listener_rule_path_patterns
    }
  }

  # SEPARATE condition block, not a second matcher inside the one above. The ALB
  # ANDs distinct condition blocks, which is what we want (this host AND this
  # path); two matchers in one block is a provider error.
  #
  # `dynamic` with a 0/1-element list rather than `count`, because the rule must
  # stay a SINGLE resource address: switching an env from no-host to host routing
  # has to be an in-place condition update, not a destroy-and-recreate of the
  # rule that is currently serving traffic.
  dynamic "condition" {
    for_each = length(var.listener_rule_host_headers) > 0 ? [1] : []
    content {
      host_header {
        values = var.listener_rule_host_headers
      }
    }
  }
}

# The cleartext compatibility rule, during a TLS cutover only.
#
# `listener_arn` is ForceNew — ELBv2 has no API to move a rule between listeners
# — so switching `alb_listener_arn` from the :80 listener to the :443 one
# REPLACES the rule above (destroy-then-create, a few seconds during which the
# path falls through to the listener default). On a greenfield env that is
# irrelevant; on a live one, set redirect_http_to_https=false so this duplicate
# keeps :80 serving while clients migrate, then flip it on.
#
# Rule priorities are scoped to a LISTENER, so reusing the same number on a
# second listener is not a collision.
resource "aws_lb_listener_rule" "compat" {
  count        = var.extra_listener_arn == "" ? 0 : 1
  listener_arn = var.extra_listener_arn
  priority     = var.listener_rule_priority

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.this.arn
  }

  condition {
    path_pattern {
      values = var.listener_rule_path_patterns
    }
  }

  # Identical to the primary rule's host condition — the cleartext duplicate must
  # match the same requests, or http:// clients land on a different service than
  # https:// ones during the cutover window.
  dynamic "condition" {
    for_each = length(var.listener_rule_host_headers) > 0 ? [1] : []
    content {
      host_header {
        values = var.listener_rule_host_headers
      }
    }
  }
}

# --- ECS service + autoscaling ------------------------------------------------

resource "aws_ecs_service" "this" {
  name            = var.name
  cluster         = var.cluster_id
  task_definition = aws_ecs_task_definition.this.arn
  desired_count   = var.min_instances
  # `launch_type` and `capacity_provider_strategy` are mutually exclusive.
  launch_type = var.use_spot ? null : "FARGATE"
  # The provider refuses to change the capacity-provider strategy of a live
  # service without a forced deployment; harmless otherwise (no diff = no deploy).
  force_new_deployment = var.use_spot

  dynamic "capacity_provider_strategy" {
    for_each = var.use_spot ? [1] : []
    content {
      capacity_provider = "FARGATE_SPOT"
      weight            = 1
    }
  }

  health_check_grace_period_seconds = 30

  # halt+revert a rollout whose tasks keep failing instead of flapping forever.
  # Note: stage floats on :latest, so "rollback" re-points at the same tag —
  # the value there is stopping the rollout while old tasks keep serving.
  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  network_configuration {
    subnets         = var.subnet_ids
    security_groups = [var.task_security_group_id]
    # false for private subnets (egress to ECR/Secrets Manager/Kinesis via NAT);
    # only set true for subnets with no NAT route
    assign_public_ip = var.assign_public_ip
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.this.arn
    container_name   = var.name
    container_port   = var.container_port
  }

  # autoscaling owns the live count
  lifecycle {
    ignore_changes = [desired_count]
  }

  depends_on = [aws_lb_listener_rule.this, aws_iam_role_policy.execution_secrets]
}

resource "aws_appautoscaling_target" "this" {
  min_capacity       = var.min_instances
  max_capacity       = var.max_instances
  resource_id        = "service/${var.cluster_name}/${aws_ecs_service.this.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

resource "aws_appautoscaling_policy" "cpu" {
  name               = "${var.name}-cpu"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.this.resource_id
  scalable_dimension = aws_appautoscaling_target.this.scalable_dimension
  service_namespace  = aws_appautoscaling_target.this.service_namespace

  target_tracking_scaling_policy_configuration {
    target_value = 70
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
  }
}
