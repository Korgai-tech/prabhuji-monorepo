# One full environment (stage or prod) of the workspace's backend stack.
# Networking (dedicated VPC) lives in network.tf; per-service compute (ECR,
# task def, ECS service, routing, IAM) lives in the reusable
# ../fargate-service module — instantiated in services.tf.
# Locally, docker-compose + the floci-aws emulator mirror this stack
# (Postgres, Redis, Secrets Manager, Kinesis) — see `pnpm deploy:local`.

# --- Security groups -----------------------------------------------------------
# Only the ALB is internet-facing; the data plane (RDS/Redis/MSK) admits only
# the api task SG on its service port.

resource "aws_security_group" "alb" {
  name_prefix = "${local.name_prefix}-alb-"
  description = "Shared ALB ingress"
  vpc_id      = aws_vpc.main.id

  # :80 stays open even with TLS on — it is what SERVES the redirect. Closing it
  # turns http://<domain> from a 301 into a connection timeout.
  ingress {
    description = "HTTP"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = [var.public_api ? "0.0.0.0/0" : aws_vpc.main.cidr_block]
  }

  # Unconditional, not gated on domain_name: a port with no listener behind it
  # accepts nothing, and keeping it static means the SG diff happens once rather
  # than on every domain flip, with no create-ordering coupling to the listener.
  ingress {
    description = "HTTPS"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = [var.public_api ? "0.0.0.0/0" : aws_vpc.main.cidr_block]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

# One task SG per service — both admit ingress from the ALB on their port and
# egress anywhere (ECR/Secrets Manager/Kinesis via the NAT gateway).
resource "aws_security_group" "api_tasks" {
  name_prefix = "${local.name_prefix}-api-tasks-"
  description = "api ECS tasks"
  vpc_id      = aws_vpc.main.id

  ingress {
    description     = "api port from the ALB only"
    from_port       = 3000
    to_port         = 3000
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_security_group" "events_tasks" {
  name_prefix = "${local.name_prefix}-events-tasks-"
  description = "events ECS tasks"
  vpc_id      = aws_vpc.main.id

  ingress {
    description     = "events port from the ALB only"
    from_port       = 3001
    to_port         = 3001
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

# admin CMS (TAM-120): a static SPA server (nginx) — ALB-only ingress on 8080,
# egress anywhere (ECR image pull via NAT). It touches no data plane (no DB /
# Redis / Kinesis / MSK), so nothing grants it those ports.
resource "aws_security_group" "admin_tasks" {
  name_prefix = "${local.name_prefix}-admin-tasks-"
  description = "admin ECS tasks"
  vpc_id      = aws_vpc.main.id

  ingress {
    description     = "admin port from the ALB only"
    from_port       = 8080
    to_port         = 8080
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_security_group" "db" {
  name_prefix = "${local.name_prefix}-db-"
  description = "RDS Postgres"
  vpc_id      = aws_vpc.main.id

  ingress {
    description     = "Postgres from api tasks only"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.api_tasks.id]
  }

  # The only other way in, and only while var.enable_bastion is on — see
  # bastion.tf. Inline (not a standalone aws_security_group_rule) because inline
  # ingress blocks are authoritative: a rule declared outside would be stripped
  # on the next apply of this SG.
  dynamic "ingress" {
    for_each = var.enable_bastion ? [1] : []

    content {
      description     = "Postgres from the SSM bastion (break-glass, opt-in)"
      from_port       = 5432
      to_port         = 5432
      protocol        = "tcp"
      security_groups = [aws_security_group.bastion[0].id]
    }
  }
}

resource "aws_security_group" "redis" {
  name_prefix = "${local.name_prefix}-redis-"
  description = "ElastiCache Redis"
  vpc_id      = aws_vpc.main.id

  ingress {
    description     = "Redis from api tasks only"
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [aws_security_group.api_tasks.id]
  }

  # Break-glass, mirroring the db SG above — see bastion.tf.
  dynamic "ingress" {
    for_each = var.enable_bastion ? [1] : []

    content {
      description     = "Redis from the SSM bastion (break-glass, opt-in)"
      from_port       = 6379
      to_port         = 6379
      protocol        = "tcp"
      security_groups = [aws_security_group.bastion[0].id]
    }
  }
}

resource "aws_security_group" "kafka" {
  count       = var.enable_kafka ? 1 : 0
  name_prefix = "${local.name_prefix}-kafka-"
  description = "MSK brokers (API domain-event bus)"
  vpc_id      = aws_vpc.main.id

  ingress {
    description     = "Kafka SASL/IAM from api tasks only"
    from_port       = 9098
    to_port         = 9098
    protocol        = "tcp"
    security_groups = [aws_security_group.api_tasks.id]
  }
}

# --- RDS (Postgres 18) ----------------------------------------------------------

resource "aws_db_subnet_group" "postgres" {
  name       = "${local.name_prefix}-pg"
  subnet_ids = local.private_subnet_ids
}

resource "random_password" "db" {
  length  = 32
  special = false
}

resource "aws_db_instance" "postgres" {
  identifier                  = "${local.name_prefix}-pg"
  engine                      = "postgres"
  engine_version              = "18"
  allow_major_version_upgrade = true
  instance_class              = var.db_instance_class
  allocated_storage           = 20
  db_name                     = "app"
  username                    = "api"
  password                    = random_password.db.result
  db_subnet_group_name        = aws_db_subnet_group.postgres.name
  vpc_security_group_ids      = [aws_security_group.db.id]
  publicly_accessible         = false
  storage_encrypted           = true
  backup_retention_period     = 7
  deletion_protection         = var.db_deletion_protection
  skip_final_snapshot         = !var.db_deletion_protection
}

# --- ElastiCache Redis ----------------------------------------------------------

resource "aws_elasticache_subnet_group" "cache" {
  name       = "${local.name_prefix}-redis"
  subnet_ids = local.private_subnet_ids
}

resource "aws_elasticache_cluster" "cache" {
  cluster_id         = "${local.name_prefix}-redis"
  engine             = "redis"
  node_type          = var.redis_node_type
  num_cache_nodes    = 1
  port               = 6379
  subnet_group_name  = aws_elasticache_subnet_group.cache.name
  security_group_ids = [aws_security_group.redis.id]
}

# --- Kinesis (click-events sink for apps/events; analytics pipe) -----------------

moved {
  from = aws_kinesis_stream.events
  to   = aws_kinesis_stream.events[0]
}

resource "aws_kinesis_stream" "events" {
  count            = var.enable_kinesis ? 1 : 0
  name             = "${local.name_prefix}-events"
  shard_count      = var.kinesis_shard_count
  retention_period = 24

  stream_mode_details {
    stream_mode = "PROVISIONED"
  }
}

# --- Amazon MSK (API internal domain-event bus) ---------------------------------
# The event-driven backbone for apps/api modules — see docs/EVENT-ARCHITECTURE.md.
# Distinct from the Kinesis analytics stream above. Enabled in both envs so
# stage exercises the same event path as prod. floci-aws emulates MSK locally
# (redpanda sidecar). Creation takes 30-45 minutes — this is not a hang.

resource "aws_msk_cluster" "domain_events" {
  count                  = var.enable_kafka ? 1 : 0
  cluster_name           = "${local.name_prefix}-domain-events"
  kafka_version          = var.kafka_version
  number_of_broker_nodes = var.kafka_broker_count

  broker_node_group_info {
    instance_type = var.kafka_instance_type
    # brokers live in the private subnets; count must be a multiple of az_count
    client_subnets  = slice(local.private_subnet_ids, 0, min(var.kafka_broker_count, var.az_count))
    security_groups = [aws_security_group.kafka[0].id]

    storage_info {
      ebs_storage_info {
        volume_size = var.kafka_ebs_gb
      }
    }
  }

  client_authentication {
    sasl {
      iam = true
    }
  }
}

# --- Secrets ---------------------------------------------------------------------

resource "random_password" "jwt" {
  length  = 48
  special = false
}

resource "aws_secretsmanager_secret" "jwt" {
  name = "${local.name_prefix}-jwt-secret"
}

resource "aws_secretsmanager_secret_version" "jwt" {
  secret_id     = aws_secretsmanager_secret.jwt.id
  secret_string = random_password.jwt.result
}

# Phone-hash pepper for the OTP module — an EXTERNAL value (unlike jwt, which is
# a random_password): it is mixed into every stored phone hash, so it must
# survive a lost/rebuilt tfstate. Regenerating it silently invalidates every
# hash already in the database. Supplied per-env via a gitignored
# *.auto.tfvars; wired into the api task by services.tf.
resource "aws_secretsmanager_secret" "otp_pepper" {
  name = "${local.name_prefix}-otp-pepper"
}

resource "aws_secretsmanager_secret_version" "otp_pepper" {
  secret_id     = aws_secretsmanager_secret.otp_pepper.id
  secret_string = var.auth_otp_pepper
}

# Bootstrap admin credentials (TAM-82) — the pair services.tf's NOTE reserved.
# Created ONLY when both values are supplied: with neither, no secret exists, no
# env var is wired, and the api's boot path creates no admin. An env with no
# admin is the intended default, not an incomplete one (prod is deliberately in
# that state), so these are conditional rather than required.
locals {
  wire_admin_bootstrap = var.admin_bootstrap_email != "" && var.admin_bootstrap_password != ""
}

resource "aws_secretsmanager_secret" "admin_bootstrap_email" {
  count = local.wire_admin_bootstrap ? 1 : 0
  name  = "${local.name_prefix}-admin-bootstrap-email"
}

resource "aws_secretsmanager_secret_version" "admin_bootstrap_email" {
  count         = local.wire_admin_bootstrap ? 1 : 0
  secret_id     = aws_secretsmanager_secret.admin_bootstrap_email[0].id
  secret_string = var.admin_bootstrap_email
}

resource "aws_secretsmanager_secret" "admin_bootstrap_password" {
  count = local.wire_admin_bootstrap ? 1 : 0
  name  = "${local.name_prefix}-admin-bootstrap-password"
}

resource "aws_secretsmanager_secret_version" "admin_bootstrap_password" {
  count         = local.wire_admin_bootstrap ? 1 : 0
  secret_id     = aws_secretsmanager_secret.admin_bootstrap_password[0].id
  secret_string = var.admin_bootstrap_password
}

resource "aws_secretsmanager_secret" "database_url" {
  name = "${local.name_prefix}-database-url"
}

resource "aws_secretsmanager_secret_version" "database_url" {
  secret_id     = aws_secretsmanager_secret.database_url.id
  secret_string = "postgresql://${aws_db_instance.postgres.username}:${random_password.db.result}@${aws_db_instance.postgres.address}:${aws_db_instance.postgres.port}/app"
}

resource "random_password" "events_api_key" {
  length  = 48
  special = false
}

resource "aws_secretsmanager_secret" "events_api_key" {
  name = "${local.name_prefix}-events-api-key"
}

resource "aws_secretsmanager_secret_version" "events_api_key" {
  secret_id     = aws_secretsmanager_secret.events_api_key.id
  secret_string = random_password.events_api_key.result
}

# Key for an EXTERNAL collector (analytics_events_url). Deliberately its own
# secret rather than overwriting the one above: that value is this stack's own
# collector key, baked into the mobile builds (apps/mobile/env/*.json), so
# rewriting it would 400 every event the app sends.
locals {
  wire_external_events = var.analytics_events_url != "" && var.analytics_events_api_key != ""
}

resource "aws_secretsmanager_secret" "analytics_events_api_key" {
  count = local.wire_external_events ? 1 : 0
  name  = "${local.name_prefix}-analytics-events-api-key"
}

resource "aws_secretsmanager_secret_version" "analytics_events_api_key" {
  count         = local.wire_external_events ? 1 : 0
  secret_id     = aws_secretsmanager_secret.analytics_events_api_key[0].id
  secret_string = var.analytics_events_api_key
}

# The referral service (TAM-160) — the attribution source behind the four
# bk_*_utm_source_success events. Independent of `wire_external_events` above:
# prod points the api at its OWN collector while reading attribution from the
# shared platform, so the two pairs are configured separately and either can be on
# without the other. Mirrors apps/api's own guard — url AND key, or nothing.
locals {
  wire_referral_lookup = var.referral_base_url != "" && var.referral_tenant_key != ""
}

resource "aws_secretsmanager_secret" "referral_tenant_key" {
  count = local.wire_referral_lookup ? 1 : 0
  name  = "${local.name_prefix}-referral-tenant-key"
}

resource "aws_secretsmanager_secret_version" "referral_tenant_key" {
  count         = local.wire_referral_lookup ? 1 : 0
  secret_id     = aws_secretsmanager_secret.referral_tenant_key[0].id
  secret_string = var.referral_tenant_key
}

# The shared platform's abtesting service (TAM-173) — consulted first for the
# chat and paywall variants. Deliberately NOT paired with wire_ragflow below:
# without RAGFlow chat is off for everyone (the api fails closed), while
# without THIS the api simply resolves variants in-process, so the two failure
# modes must stay independently switchable. Mirrors apps/api's own guard —
# url AND key, or nothing. Key rides in the api secret bundle only; no
# standalone secret, nothing else consumes it.
locals {
  wire_abtest = var.abtest_base_url != "" && var.abtest_tenant_key != ""
}

# Generalized in-app modals (TAM-174) — the shared secret the external
# audience-campaign service presents on POST /internal/modals/hooks. No
# base_url pairing: the route lives on THIS stack, so there is nothing to
# guard but the key itself. When unset, apps/api never registers the route at
# all (a 404), which is the deliberate posture for an env with no campaigns.
# Key rides in the api secret bundle only; no standalone secret, nothing else
# consumes it.
locals {
  wire_modal_hook = var.modal_hook_key != ""
}

# The chatbot (core/chat) — the provider that ANSWERS chat. Without it the
# endpoint 503s for users who ARE in an arm, which is why the api fails closed
# and reports chat disabled for everyone when this pair is unset. Mirrors
# apps/api's own url-AND-key guard.
locals {
  wire_ragflow = var.ragflow_base_url != "" && var.ragflow_api_key != ""
}

resource "aws_secretsmanager_secret" "ragflow_api_key" {
  count = local.wire_ragflow ? 1 : 0
  name  = "${local.name_prefix}-ragflow-api-key"
}

resource "aws_secretsmanager_secret_version" "ragflow_api_key" {
  count         = local.wire_ragflow ? 1 : 0
  secret_id     = aws_secretsmanager_secret.ragflow_api_key[0].id
  secret_string = var.ragflow_api_key
}

# ClickStack/HyperDX ingestion key — an EXTERNAL value (from the hosted
# ClickStack), supplied via the sensitive var. Created only when telemetry is on
# AND a key is provided (an unauthenticated collector needs none); wired into
# both tasks by services.tf.
locals {
  wire_hyperdx_key = var.enable_telemetry && var.hyperdx_api_key != ""
}

resource "aws_secretsmanager_secret" "hyperdx_api_key" {
  count = local.wire_hyperdx_key ? 1 : 0
  name  = "${local.name_prefix}-hyperdx-api-key"
}

resource "aws_secretsmanager_secret_version" "hyperdx_api_key" {
  count         = local.wire_hyperdx_key ? 1 : 0
  secret_id     = aws_secretsmanager_secret.hyperdx_api_key[0].id
  secret_string = var.hyperdx_api_key
}

# ClickHouse Cloud connection config for the CI/CD `events:migrate` step — all
# three values live in Secrets Manager (one secret per value, mirroring jwt /
# database_url / hyperdx_api_key). EXTERNAL values from the ClickHouse Cloud
# console; consumed only by the deploy pipeline, never by a running service.
# Created only when host + password are both supplied.
locals {
  wire_clickhouse = var.clickhouse_host != "" && var.clickhouse_password != ""
}

resource "aws_secretsmanager_secret" "clickhouse_host" {
  count = local.wire_clickhouse ? 1 : 0
  name  = "${local.name_prefix}-clickhouse-host"
}

resource "aws_secretsmanager_secret_version" "clickhouse_host" {
  count         = local.wire_clickhouse ? 1 : 0
  secret_id     = aws_secretsmanager_secret.clickhouse_host[0].id
  secret_string = var.clickhouse_host
}

resource "aws_secretsmanager_secret" "clickhouse_user" {
  count = local.wire_clickhouse ? 1 : 0
  name  = "${local.name_prefix}-clickhouse-user"
}

resource "aws_secretsmanager_secret_version" "clickhouse_user" {
  count         = local.wire_clickhouse ? 1 : 0
  secret_id     = aws_secretsmanager_secret.clickhouse_user[0].id
  secret_string = var.clickhouse_user
}

resource "aws_secretsmanager_secret" "clickhouse_password" {
  count = local.wire_clickhouse ? 1 : 0
  name  = "${local.name_prefix}-clickhouse-password"
}

resource "aws_secretsmanager_secret_version" "clickhouse_password" {
  count         = local.wire_clickhouse ? 1 : 0
  secret_id     = aws_secretsmanager_secret.clickhouse_password[0].id
  secret_string = var.clickhouse_password
}

# Docker Hub pull credentials for the deploy pipeline. EXTERNAL values (a Docker
# Hub account + Personal Access Token). One secret per value, mirroring the
# ClickHouse trio above. Created only when both are supplied — leave them empty
# and the pipeline keeps pulling anonymously exactly as it does today.
locals {
  wire_dockerhub = var.dockerhub_username != "" && var.dockerhub_token != ""
}

resource "aws_secretsmanager_secret" "dockerhub_username" {
  count = local.wire_dockerhub ? 1 : 0
  name  = "${local.name_prefix}-dockerhub-username"
}

resource "aws_secretsmanager_secret_version" "dockerhub_username" {
  count         = local.wire_dockerhub ? 1 : 0
  secret_id     = aws_secretsmanager_secret.dockerhub_username[0].id
  secret_string = var.dockerhub_username
}

resource "aws_secretsmanager_secret" "dockerhub_token" {
  count = local.wire_dockerhub ? 1 : 0
  name  = "${local.name_prefix}-dockerhub-token"
}

resource "aws_secretsmanager_secret_version" "dockerhub_token" {
  count         = local.wire_dockerhub ? 1 : 0
  secret_id     = aws_secretsmanager_secret.dockerhub_token[0].id
  secret_string = var.dockerhub_token
}

# OpenAI API key for daily-horoscope generation (core/horoscope). EXTERNAL value
# from the OpenAI console, supplied via the sensitive var (secrets.auto.tfvars).
# Created only when a key is provided; the api service reads it (services.tf).
# The KEY's presence is the on/off switch — generation is on wherever the key
# exists, with no separate enable flag.
locals {
  wire_openai = var.openai_api_key != ""
}

resource "aws_secretsmanager_secret" "openai_api_key" {
  count = local.wire_openai ? 1 : 0
  name  = "${local.name_prefix}-openai-api-key"
}

resource "aws_secretsmanager_secret_version" "openai_api_key" {
  count         = local.wire_openai ? 1 : 0
  secret_id     = aws_secretsmanager_secret.openai_api_key[0].id
  secret_string = var.openai_api_key
}

# Devtools bearer token (core/devtools). The routes have no other authentication,
# so env.ts REFUSES TO BOOT when enable_dev_tools is true and this is empty — the
# api is on a public ALB and /devtools/mark-pro grants Pro entitlement outright.
# Created only when a token is supplied.
locals {
  wire_devtools_token = var.devtools_token != ""
}

resource "aws_secretsmanager_secret" "devtools_token" {
  count = local.wire_devtools_token ? 1 : 0
  name  = "${local.name_prefix}-devtools-token"
}

resource "aws_secretsmanager_secret_version" "devtools_token" {
  count         = local.wire_devtools_token ? 1 : 0
  secret_id     = aws_secretsmanager_secret.devtools_token[0].id
  secret_string = var.devtools_token
}

# Fail the PLAN, not the rollout — this exact combination crash-looped stage on
# 2026-08-03 (the app gained the requirement; terraform had no variable for it).
resource "terraform_data" "devtools_guard" {
  lifecycle {
    precondition {
      condition     = !var.enable_dev_tools || local.wire_devtools_token
      error_message = "enable_dev_tools=true requires devtools_token (min 16 chars) — apps/api/src/shared/config/env.ts fails boot without it, because /devtools/mark-pro has no other authentication and the ALB is public."
    }
  }
}

# MSG91 credentials (core/otp). EXTERNAL values from the MSG91 dashboard,
# supplied via sensitive vars (secrets.auto.tfvars). Created only when both the
# auth key and the template id are provided; the api service reads them
# (services.tf). Wire these together with auth_otp_provider="msg91" — env.ts
# fails the boot loudly if the provider is armed without them, and equally the
# secrets sitting here without the provider armed simply go unused (the api
# stays on the stub and sends no SMS).
locals {
  wire_msg91 = var.msg91_auth_key != "" && var.msg91_template_id != ""
}

resource "aws_secretsmanager_secret" "msg91_auth_key" {
  count = local.wire_msg91 ? 1 : 0
  name  = "${local.name_prefix}-msg91-auth-key"
}

resource "aws_secretsmanager_secret_version" "msg91_auth_key" {
  count         = local.wire_msg91 ? 1 : 0
  secret_id     = aws_secretsmanager_secret.msg91_auth_key[0].id
  secret_string = var.msg91_auth_key
}

resource "aws_secretsmanager_secret" "msg91_template_id" {
  count = local.wire_msg91 ? 1 : 0
  name  = "${local.name_prefix}-msg91-template-id"
}

resource "aws_secretsmanager_secret_version" "msg91_template_id" {
  count         = local.wire_msg91 ? 1 : 0
  secret_id     = aws_secretsmanager_secret.msg91_template_id[0].id
  secret_string = var.msg91_template_id
}

# Test numbers (QA / store-review accounts). Gated on BOTH values because the
# app refuses to boot with a number list and no code — the half-configured state
# would send a real, undeliverable SMS to an unallocated number and look, to a
# tester, exactly like the feature being broken.
locals {
  wire_test_numbers = var.test_numbers != "" && var.test_otp != ""
}

resource "aws_secretsmanager_secret" "test_otp" {
  count = local.wire_test_numbers ? 1 : 0
  name  = "${local.name_prefix}-test-otp"
}

resource "aws_secretsmanager_secret_version" "test_otp" {
  count         = local.wire_test_numbers ? 1 : 0
  secret_id     = aws_secretsmanager_secret.test_otp[0].id
  secret_string = var.test_otp
}

# Separate from wire_msg91: the sender id is genuinely optional (most DLT
# templates carry their own), so it must not gate the pair above.
locals {
  wire_msg91_sender = local.wire_msg91 && var.msg91_sender_id != ""
}

resource "aws_secretsmanager_secret" "msg91_sender_id" {
  count = local.wire_msg91_sender ? 1 : 0
  name  = "${local.name_prefix}-msg91-sender-id"
}

resource "aws_secretsmanager_secret_version" "msg91_sender_id" {
  count         = local.wire_msg91_sender ? 1 : 0
  secret_id     = aws_secretsmanager_secret.msg91_sender_id[0].id
  secret_string = var.msg91_sender_id
}

# TrustSignal credentials (core/otp). EXTERNAL values from the TrustSignal
# dashboard, supplied via sensitive vars (secrets.auto.tfvars). Wire these
# together with auth_otp_provider="trustsignal".
#
# All FOUR gate the switch, unlike msg91 where the sender id is optional:
# TrustSignal sends the message BODY on the wire and identifies the sender per
# request, so a missing sender id or template body is not a cosmetic default —
# it is a message the operator drops. Half-configured, env.ts fails the boot.
locals {
  wire_trustsignal = (
    var.trustsignal_api_key != "" &&
    var.trustsignal_sender_id != "" &&
    var.trustsignal_template_id != "" &&
    var.trustsignal_message_template != ""
  )
}

resource "aws_secretsmanager_secret" "trustsignal_api_key" {
  count = local.wire_trustsignal ? 1 : 0
  name  = "${local.name_prefix}-trustsignal-api-key"
}

resource "aws_secretsmanager_secret_version" "trustsignal_api_key" {
  count         = local.wire_trustsignal ? 1 : 0
  secret_id     = aws_secretsmanager_secret.trustsignal_api_key[0].id
  secret_string = var.trustsignal_api_key
}

resource "aws_secretsmanager_secret" "trustsignal_sender_id" {
  count = local.wire_trustsignal ? 1 : 0
  name  = "${local.name_prefix}-trustsignal-sender-id"
}

resource "aws_secretsmanager_secret_version" "trustsignal_sender_id" {
  count         = local.wire_trustsignal ? 1 : 0
  secret_id     = aws_secretsmanager_secret.trustsignal_sender_id[0].id
  secret_string = var.trustsignal_sender_id
}

resource "aws_secretsmanager_secret" "trustsignal_template_id" {
  count = local.wire_trustsignal ? 1 : 0
  name  = "${local.name_prefix}-trustsignal-template-id"
}

resource "aws_secretsmanager_secret_version" "trustsignal_template_id" {
  count         = local.wire_trustsignal ? 1 : 0
  secret_id     = aws_secretsmanager_secret.trustsignal_template_id[0].id
  secret_string = var.trustsignal_template_id
}

resource "aws_secretsmanager_secret" "trustsignal_message_template" {
  count = local.wire_trustsignal ? 1 : 0
  name  = "${local.name_prefix}-trustsignal-message-template"
}

resource "aws_secretsmanager_secret_version" "trustsignal_message_template" {
  count         = local.wire_trustsignal ? 1 : 0
  secret_id     = aws_secretsmanager_secret.trustsignal_message_template[0].id
  secret_string = var.trustsignal_message_template
}

# Cashfree UPI Autopay credentials (core/payment). EXTERNAL values from the
# Cashfree dashboard, supplied via sensitive vars (secrets.auto.tfvars). The api
# + billing task read them (services.tf). Wire these together with
# payment_provider="cashfree" — env.ts fails boot loudly if the provider is armed
# without them. Stage points at the Cashfree SANDBOX (payment_env="staging"), so
# arming it moves no real money.
#
# ONE SWITCH: the client_id/client_secret pair. There is no webhook-secret
# switch — this Cashfree account issues no signing key, so that plumbing was
# removed (see the note in variables.tf for what to re-add if one appears).
# Callbacks are consequently unsigned, which apps/api handles by design:
# CallbackService treats a webhook as a trigger and re-reads the provider's
# status API before touching entitlement.
locals {
  wire_cashfree = var.cashfree_client_id != "" && var.cashfree_client_secret != ""
}

resource "aws_secretsmanager_secret" "cashfree_client_id" {
  count = local.wire_cashfree ? 1 : 0
  name  = "${local.name_prefix}-cashfree-client-id"
}

resource "aws_secretsmanager_secret_version" "cashfree_client_id" {
  count         = local.wire_cashfree ? 1 : 0
  secret_id     = aws_secretsmanager_secret.cashfree_client_id[0].id
  secret_string = var.cashfree_client_id
}

resource "aws_secretsmanager_secret" "cashfree_client_secret" {
  count = local.wire_cashfree ? 1 : 0
  name  = "${local.name_prefix}-cashfree-client-secret"
}

resource "aws_secretsmanager_secret_version" "cashfree_client_secret" {
  count         = local.wire_cashfree ? 1 : 0
  secret_id     = aws_secretsmanager_secret.cashfree_client_secret[0].id
  secret_string = var.cashfree_client_secret
}

# Decentro UPI Autopay credentials (core/payment). EXTERNAL values from the Decentro
# dashboard, supplied via sensitive vars (secrets.auto.tfvars).
#
# ONE SWITCH, and it covers FOUR values rather than Cashfree's two: env.ts requires
# base_url + client_id + client_secret + consumer_urn + payment_callback_token
# together when payment_provider="decentro". Creating a partial set is the failure
# mode this local guards against — it would produce a task that boots, reads an
# empty credential, and fails every call at the gateway instead of at startup.
#
# Unlike Cashfree, Decentro DOES authenticate callbacks, via a static shared secret
# header — so payment_callback_token is part of this set and has no Cashfree analogue.
#
# These secrets are INERT until payment_provider flips to "decentro". Creating them
# ahead of the flip is deliberate: it separates "the credentials exist in AWS" from
# "the gateway is live", so the switch itself is a one-line change with nothing else
# in flight.
locals {
  wire_decentro = (
    var.decentro_client_id != "" &&
    var.decentro_client_secret != "" &&
    var.decentro_consumer_urn != "" &&
    var.payment_callback_token != ""
  )
}

resource "aws_secretsmanager_secret" "decentro_client_id" {
  count = local.wire_decentro ? 1 : 0
  name  = "${local.name_prefix}-decentro-client-id"
}

resource "aws_secretsmanager_secret_version" "decentro_client_id" {
  count         = local.wire_decentro ? 1 : 0
  secret_id     = aws_secretsmanager_secret.decentro_client_id[0].id
  secret_string = var.decentro_client_id
}

resource "aws_secretsmanager_secret" "decentro_client_secret" {
  count = local.wire_decentro ? 1 : 0
  name  = "${local.name_prefix}-decentro-client-secret"
}

resource "aws_secretsmanager_secret_version" "decentro_client_secret" {
  count         = local.wire_decentro ? 1 : 0
  secret_id     = aws_secretsmanager_secret.decentro_client_secret[0].id
  secret_string = var.decentro_client_secret
}

resource "aws_secretsmanager_secret" "decentro_consumer_urn" {
  count = local.wire_decentro ? 1 : 0
  name  = "${local.name_prefix}-decentro-consumer-urn"
}

resource "aws_secretsmanager_secret_version" "decentro_consumer_urn" {
  count         = local.wire_decentro ? 1 : 0
  secret_id     = aws_secretsmanager_secret.decentro_consumer_urn[0].id
  secret_string = var.decentro_consumer_urn
}

resource "aws_secretsmanager_secret" "payment_callback_token" {
  count = local.wire_decentro ? 1 : 0
  name  = "${local.name_prefix}-payment-callback-token"
}

resource "aws_secretsmanager_secret_version" "payment_callback_token" {
  count         = local.wire_decentro ? 1 : 0
  secret_id     = aws_secretsmanager_secret.payment_callback_token[0].id
  secret_string = var.payment_callback_token
}

# Razorpay credentials (core/payment). EXTERNAL values from the Razorpay
# dashboard, supplied via sensitive vars (secrets.auto.tfvars).
#
# ONE SWITCH over FOUR values, like Decentro rather than Cashfree: env.ts requires
# base_url + key_id + key_secret + webhook_secret together when razorpay is the
# ACTIVE provider. A partial set would apply cleanly, create nothing, and crash-loop
# every api task at boot.
#
# Unlike Cashfree, Razorpay DOES authenticate its callbacks — an HMAC over the raw
# body — so the webhook secret is part of this set and has no Cashfree analogue.
# It must match the value registered on the dashboard's webhook, or every delivery
# is rejected. Absent, the authenticator has nothing to verify against and answers
# 401 — a signal Razorpay retries, which beats a 200 that drops a real settlement.
#
# These secrets are INERT until payment_provider names razorpay. Creating them ahead
# of that flip is deliberate, for the same reason as Decentro's: it separates "the
# credentials exist in AWS" from "the gateway is live", so the switch itself is a
# one-line change — and, after the switch, keeping them is what keeps Razorpay's own
# mandates billable without any second variable to remember.
locals {
  wire_razorpay = (
    var.razorpay_base_url != "" &&
    var.razorpay_key_id != "" &&
    var.razorpay_key_secret != "" &&
    var.razorpay_webhook_secret != ""
  )
}

resource "aws_secretsmanager_secret" "razorpay_base_url" {
  count = local.wire_razorpay ? 1 : 0
  name  = "${local.name_prefix}-razorpay-base-url"
}

resource "aws_secretsmanager_secret_version" "razorpay_base_url" {
  count         = local.wire_razorpay ? 1 : 0
  secret_id     = aws_secretsmanager_secret.razorpay_base_url[0].id
  secret_string = var.razorpay_base_url
}

resource "aws_secretsmanager_secret" "razorpay_key_id" {
  count = local.wire_razorpay ? 1 : 0
  name  = "${local.name_prefix}-razorpay-key-id"
}

resource "aws_secretsmanager_secret_version" "razorpay_key_id" {
  count         = local.wire_razorpay ? 1 : 0
  secret_id     = aws_secretsmanager_secret.razorpay_key_id[0].id
  secret_string = var.razorpay_key_id
}

resource "aws_secretsmanager_secret" "razorpay_key_secret" {
  count = local.wire_razorpay ? 1 : 0
  name  = "${local.name_prefix}-razorpay-key-secret"
}

resource "aws_secretsmanager_secret_version" "razorpay_key_secret" {
  count         = local.wire_razorpay ? 1 : 0
  secret_id     = aws_secretsmanager_secret.razorpay_key_secret[0].id
  secret_string = var.razorpay_key_secret
}

resource "aws_secretsmanager_secret" "razorpay_webhook_secret" {
  count = local.wire_razorpay ? 1 : 0
  name  = "${local.name_prefix}-razorpay-webhook-secret"
}

resource "aws_secretsmanager_secret_version" "razorpay_webhook_secret" {
  count         = local.wire_razorpay ? 1 : 0
  secret_id     = aws_secretsmanager_secret.razorpay_webhook_secret[0].id
  secret_string = var.razorpay_webhook_secret
}

# --- Shared ALB + ECS cluster -----------------------------------------------------

resource "aws_lb" "main" {
  name               = local.name_prefix
  internal           = !var.public_api
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = local.public_subnet_ids
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.main.arn
  port              = 80
  protocol          = "HTTP"

  # Exactly one of these blocks is ever emitted (a listener requires exactly one
  # default_action). Switching between them is an in-place ModifyListener, NOT a
  # replacement: the listener ARN survives, and so does every rule already on it.
  #
  # Redirect mode — :80 permanently 301s to :443. See tls.tf.
  dynamic "default_action" {
    for_each = local.wire_https && var.redirect_http_to_https ? [1] : []
    content {
      type = "redirect"
      redirect {
        port     = "443"
        protocol = "HTTPS"
        # 301, not 302: this is permanent and clients cache it. host/path/query
        # default to #{host} / /#{path} / ?#{query}.
        status_code = "HTTP_301"
      }
    }
  }

  # Default mode (and every no-domain env) — every service attaches a
  # path-based rule; unmatched paths 404.
  dynamic "default_action" {
    for_each = local.wire_https && var.redirect_http_to_https ? [] : [1]
    content {
      type = "fixed-response"
      fixed_response {
        content_type = "text/plain"
        message_body = "Not Found"
        status_code  = "404"
      }
    }
  }
}

resource "aws_ecs_cluster" "main" {
  name = local.name_prefix
}

# Both Fargate capacity providers on the cluster, so a service may opt into Spot
# (fargate-service.use_spot). No default strategy: services that keep
# launch_type = "FARGATE" are unaffected.
resource "aws_ecs_cluster_capacity_providers" "main" {
  cluster_name       = aws_ecs_cluster.main.name
  capacity_providers = ["FARGATE", "FARGATE_SPOT"]
}
