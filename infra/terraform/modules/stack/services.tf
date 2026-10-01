# Per-service Fargate deployments. Adding service N+1 = another module block
# here (its own ECR repo, task def, service, routing, IAM) + a task SG in
# main.tf + a unique listener-rule priority.
# Service names are env-qualified (app-stage-api, …) because the module derives
# account-global names from them (ECR repo, IAM roles, log group, target group)
# — both envs share one AWS account.

# --- api task role statements ---------------------------------------------------
# The fargate-service module takes ONE policy document per service, so the api's
# statements are composed here.
locals {
  # domain-event bus: connect + read/write only this env's own MSK cluster's
  # topics and consumer groups (no wildcard cluster)
  api_kafka_statements = var.enable_kafka ? [
    {
      Effect = "Allow"
      Action = ["kafka-cluster:Connect", "kafka-cluster:DescribeCluster"]
      # Wrapped in a list so this statement's type matches the one below it.
      # A conditional's branches must unify: with a bare string here the two
      # objects differ, the `true` branch stays a 2-tuple instead of collapsing
      # to a list, and it cannot reconcile with the `: []` branch — which fails
      # the plan outright. IAM reads ["arn"] and "arn" identically.
      Resource = [aws_msk_cluster.domain_events[0].arn]
    },
    {
      Effect = "Allow"
      Action = [
        "kafka-cluster:DescribeTopic",
        "kafka-cluster:CreateTopic",
        "kafka-cluster:ReadData",
        "kafka-cluster:WriteData",
        "kafka-cluster:AlterGroup",
        "kafka-cluster:DescribeGroup",
      ]
      Resource = [
        "${replace(aws_msk_cluster.domain_events[0].arn, ":cluster/", ":topic/")}/*",
        "${replace(aws_msk_cluster.domain_events[0].arn, ":cluster/", ":group/")}/*",
      ]
    },
  ] : []

  # Media (TAM-83) — the api presigns uploads with THESE credentials (the task
  # role; there are no static access keys anywhere). Deliberately minimal:
  #
  #   s3:PutObject  — mint presigned PUTs for the admin panel.
  #   s3:GetObject  — the write-path HEAD check (ADR A4). S3 authorizes
  #                   HeadObject via s3:GetObject; `s3:HeadObject` is not a real
  #                   IAM action.
  #
  # NOT granted, on purpose:
  #   s3:DeleteObject — we never delete objects (ADR A6). Withholding the
  #                     permission makes the never-delete rule STRUCTURAL rather
  #                     than aspirational: buggy code cannot write a delete.
  #   s3:ListBucket   — nothing in the design enumerates the bucket. EXCEPT
  #                     when the upload optimizer is on (TAM-267): without
  #                     ListBucket, S3 answers a HEAD of a key that does not
  #                     exist yet with 403, not 404, so `GET /admin/media/status`
  #                     (polled until the optimizer writes the final key) and
  #                     the `validateOwnedUrl` existence gate would read "not
  #                     written yet" as a hard S3 error. The API still never
  #                     lists anything; the grant only makes a missing key a 404.
  #   any wildcard    — scoped to this env's media bucket ARN, never
  #                     arn:aws:s3:::*.
  api_media_statements = concat(
    [
      {
        Effect   = "Allow"
        Action   = ["s3:PutObject", "s3:GetObject"]
        Resource = "${aws_s3_bucket.media.arn}/*"
      },
    ],
    var.enable_media_upload_optimizer ? [
      {
        Effect   = "Allow"
        Action   = ["s3:ListBucket"]
        Resource = aws_s3_bucket.media.arn
      },
    ] : [],
  )

  api_task_statements = concat(local.api_kafka_statements, local.api_media_statements)

  # --- ClickStack OTel collector sidecar ---------------------------------------
  # The collector runs as a sidecar in each app task. In awsvpc mode it shares the
  # task's network namespace, so the app exports OTLP to it over localhost.
  # Attached only when telemetry is on AND ClickHouse Cloud creds exist for it to
  # export to (local.wire_clickhouse is defined in main.tf).
  #
  # nonsensitive() because wire_clickhouse derives from the sensitive
  # clickhouse_password, and Terraform propagates that taint through every
  # conditional it feeds — which would render the task def's cpu/memory and the
  # whole container_definitions as "(sensitive value)" in plan output. Reviewing
  # the plan is the safety net for this repo's unbacked local state
  # (docs/DEPLOYMENT.md), so hiding those is a real cost. What this exposes is
  # only WHETHER a password was supplied — already visible from whether the
  # Secrets Manager resources are planned — never the password itself.
  wire_clickstack_collector = nonsensitive(var.enable_telemetry && local.wire_clickhouse)

  # With the sidecar the apps export to the local collector; without it, to an
  # external endpoint if one was supplied. Both empty while telemetry is on is a
  # crash-loop (the app's EnvSchema rejects it at boot) — caught at plan time by
  # the precondition on terraform_data.telemetry_guard below.
  otel_endpoint = local.wire_clickstack_collector ? "http://localhost:4318" : var.otel_exporter_otlp_endpoint

  # Collector -> ClickHouse Cloud. Host is non-secret; user/password come from
  # Secrets Manager (the same secrets the CI/CD migrate step uses). Mirrors the
  # ClickStack UI's generated `docker run` (ENDPOINT + USER + PASSWORD). An optional
  # per-env database override (empty = the collector's default OTel schema) keeps
  # stage/prod telemetry separate.
  clickstack_sidecar_env = merge(
    {
      CLICKHOUSE_ENDPOINT = "https://${var.clickhouse_host}:8443"
    },
    var.clickstack_clickhouse_database == "" ? {} : {
      HYPERDX_OTEL_EXPORTER_CLICKHOUSE_DATABASE = var.clickstack_clickhouse_database
    }
  )

  # A collector sidecar adds ~256 CPU / 512 MB; give telemetry-on tasks more room.
  app_task_cpu    = local.wire_clickstack_collector ? "1024" : "512"
  app_task_memory = local.wire_clickstack_collector ? "2048" : "1024"

  # Shared by api + events — both run the same collector against the same target.
  clickstack_sidecar_secrets = local.wire_clickstack_collector ? {
    CLICKHOUSE_USER     = aws_secretsmanager_secret.clickhouse_user[0].arn
    CLICKHOUSE_PASSWORD = aws_secretsmanager_secret.clickhouse_password[0].arn
  } : {}

  # Warehouse credentials on the API task. TWO consumers now, which is why this
  # is no longer named after the sync:
  #
  #   * TAM-175 — the deity-preference sync, a one-off task on the API's OWN
  #     task definition (modules/stack/deity-sync.tf). The serving path never
  #     touches it: `arch-boundaries.json` forbids `@clickhouse/client` outside
  #     `repositories/`, and only the sync entrypoint constructs that repository.
  #   * TAM-256 — the admin status-performance report, which DOES read the
  #     warehouse on a request path. An approved scoped exception (admin-only,
  #     behind `adminMiddleware`); see
  #     `patterns_library/api/warehouse-read-on-request-path.md`.
  #
  # Wired where a warehouse AND a database for this env exist — a missing
  # database must stop the sync rather than have it guess which environment's
  # users it is mirroring. The TENANT is merged in separately below, because the
  # sync does not need it and must not start failing over a variable that is
  # only the report's concern.
  #
  # NOTE both consumers treat absence differently BY DESIGN: the sync job throws
  # (a job should fail loudly), the report returns a typed "unconfigured"
  # outcome and renders an explicit empty state (a request path must degrade).
  # So a missing variable here does NOT crash-loop the API — it produces a
  # permanently blank report instead, which is why the api logs
  # `warehouseReadsConfigured` once at boot. Check that line after any change.
  warehouse_wired = local.wire_clickhouse && var.clickhouse_analytics_database != ""

  warehouse_environment = local.warehouse_wired ? merge({
    CLICKHOUSE_URL      = "https://${var.clickhouse_host}:8443"
    CLICKHOUSE_DATABASE = var.clickhouse_analytics_database
    },
    # Only the report needs the tenant, and it is OPTIONAL: there is one tenant
    # today, so the predicate filters nothing and the report works without it.
    # Setting it is what stops a second tenant's rows being counted as ours the
    # day one appears — so this is wired now and can be applied whenever
    # convenient, rather than gating the feature on an infra change.
    var.clickhouse_tenant != "" ? { CLICKHOUSE_TENANT = var.clickhouse_tenant } : {}
  ) : {}

  warehouse_secrets = local.warehouse_wired ? {
    CLICKHOUSE_USER     = aws_secretsmanager_secret.clickhouse_user[0].arn
    CLICKHOUSE_PASSWORD = aws_secretsmanager_secret.clickhouse_password[0].arn
  } : {}
}

# Fail the PLAN, not the rollout. `apps/{api,events}/src/shared/config/env.ts`
# throws at boot when ENABLE_TELEMETRY=true and OTEL_EXPORTER_OTLP_ENDPOINT is
# empty, so arming telemetry without either a collector (ClickHouse creds) or an
# external endpoint would crash-loop every task until the deployment circuit
# breaker halted the rollout. Catch it before anything is applied.
resource "terraform_data" "telemetry_guard" {
  lifecycle {
    precondition {
      condition     = !var.enable_telemetry || local.wire_clickstack_collector || var.otel_exporter_otlp_endpoint != ""
      error_message = "enable_telemetry=true needs an OTLP target: either set clickhouse_host + clickhouse_password (wires the collector sidecar, the normal path) or set otel_exporter_otlp_endpoint to an external collector. With neither, api/events fail their env validation at boot."
    }
  }
}

# apps/api — Fastify HTTP on :3000, catch-all route.
module "api" {
  source = "../fargate-service"

  name         = "${local.name_prefix}-api"
  region       = var.region
  cluster_id   = aws_ecs_cluster.main.id
  cluster_name = aws_ecs_cluster.main.name
  use_spot     = var.use_spot
  vpc_id       = aws_vpc.main.id
  subnet_ids   = local.private_subnet_ids

  task_security_group_id = aws_security_group.api_tasks.id
  # The HTTPS listener once a domain is wired, the :80 one otherwise — see the
  # `app_listener_arn` local in tls.tf. `extra_listener_arn` is set only during a
  # cutover with redirect_http_to_https=false, to keep cleartext clients serving.
  alb_listener_arn            = local.app_listener_arn
  extra_listener_arn          = local.http_compat_listener_arn
  listener_rule_priority      = 100
  listener_rule_path_patterns = ["/*"]
  # Empty unless admin_domain_name is set, in which case the catch-all is scoped
  # to the api's own hostnames so it stops swallowing requests to the CMS host.
  listener_rule_host_headers = local.app_host_headers

  image          = var.api_image
  container_port = 3000
  min_instances  = var.min_instances
  max_instances  = var.max_instances
  cpu            = coalesce(var.api_task_cpu, local.app_task_cpu)
  memory         = coalesce(var.api_task_memory, local.app_task_memory)

  environment = merge({
    NODE_ENV = "production"
    HOST     = "0.0.0.0"
    PORT     = "3000"
    # Swagger UI at /docs — off unless the env opts in (the ALB is public).
    ENABLE_API_DOCS = var.enable_api_docs ? "true" : "false"
    # TEMPORARY (remove before prod) — mounts the unauthenticated POST
    # /devtools/mark-pro. Stage only; prod leaves enable_dev_tools at its false
    # default. The ALB is public, so never set this true in prod.
    ENABLE_DEV_TOOLS = var.enable_dev_tools ? "true" : "false"
    # TAM-175 master switch. FALSE ships the split dark: the sync may run and
    # the mirror may fill, but home, status and the deity chip row all serve the
    # unpersonalised order until this flips. Turning it OFF is a variable change,
    # never a data operation under pressure.
    ENABLE_DEITY_SPLIT = var.enable_deity_split ? "true" : "false"
    # Exact browser origins allowed to call the api. "" = reflect any origin,
    # which is the local-dev/test behaviour and must not be what an
    # internet-facing ALB serves. The hosted admin SPA needs no entry — it is
    # same-origin behind this ALB; this is for an editor running the Vite dev
    # server against a deployed API. See variables.tf.
    CORS_ALLOWED_ORIGINS   = join(",", concat(var.cors_allowed_origins, local.admin_static_origins))
    AWS_REGION             = var.region
    ENABLE_REDIS           = "true"
    REDIS_URL              = "redis://${aws_elasticache_cluster.cache.cache_nodes[0].address}:6379"
    ENABLE_SECRETS_MANAGER = "true"

    # How often the rotated discovery listings re-order. Sending the value
    # explicitly rather than relying on env.ts's default keeps the schedule
    # visible in the task definition — "why did the feed just reshuffle" is
    # answerable from the console. The module default IS the production
    # schedule, so prod needs no override; stage can shorten it to watch
    # several refreshes in a sitting without a code change and a deploy.
    FEED_REFRESH_INTERVAL_MS = tostring(var.feed_refresh_interval_ms)

    # Recurring debits. The billing task (modules/billing-scheduler) runs on
    # THIS task definition with a command override, so this one entry arms the
    # app-side half of the guard for both. The API process itself never ticks —
    # nothing in it calls runBillingCycle — so setting it true here has no
    # effect on the running service beyond making the flag available to the
    # one-off task. See the two-switch note in variables.tf.
    #
    # PAYMENT_PROVIDER selects the active gateway (registry lookup in
    # core/payment). Defaults to `stub` (auto-approving in-memory mandates, no
    # real money); set payment_provider="cashfree" + supply the CASHFREE_*
    # credentials (below) to activate the real gateway. env.ts fails boot loudly
    # if a real provider is armed without its credentials. PAYMENT_ENV picks the
    # provider's sandbox vs live host (stage → "staging").
    PAYMENT_PROVIDER = var.payment_provider
    PAYMENT_ENV      = var.payment_env
    # Non-secret. The Cashfree API base (…/pg). Sandbox on stage, live on prod;
    # "" when Cashfree is not the active provider (env.ts treats "" as unset).
    CASHFREE_BASE_URL = var.cashfree_base_url
    # Non-secret, but LOAD-BEARING: Cashfree routes by x-api-version, so this
    # decides which endpoints exist. Must stay in lockstep with the paths in
    # cashfree.constants.ts. Set here on EVERY env rather than left to env.ts's
    # default — that default (2023-08-01) has no
    # POST /subscriptions/{id}/payments, which 404'd the first live debit in
    # prod on 2026-07-29 while mandate creation kept working.
    CASHFREE_API_VERSION = var.cashfree_api_version
    # Non-secret Decentro settings. The base URL and payment_env must AGREE: env.ts
    # refuses a staging host on payment_env=production and a live host on staging, so
    # a mismatch fails boot rather than quietly billing against the wrong account.
    DECENTRO_BASE_URL   = var.decentro_base_url
    DECENTRO_TIMEOUT_MS = tostring(var.decentro_timeout_ms)
    # How long a mandate approval link stays valid. Decentro's own bound is 1-1440.
    PAYMENT_MANDATE_EXPIRY_MINUTES = tostring(var.payment_mandate_expiry_minutes)
    # The header the provider echoes the callback token in. Set explicitly on every
    # env rather than left to env.ts's default, for the same reason
    # CASHFREE_API_VERSION is: the default is wrong for Decentro
    # (`x-prabhuji-callback-token` vs the `x-api-callback-secret` it actually sends),
    # and the failure mode is every callback 401ing while looking, from our side, like
    # a provider that never sends any.
    PAYMENT_CALLBACK_HEADER  = var.payment_callback_header
    ENABLE_BILLING_SCHEDULER = var.enable_billing_scheduler_env ? "true" : "false"

    # AUTH_OTP_PROVIDER selects the active OTP adapter (registry lookup in
    # core/otp/providers.ts). Defaults to `stub` (the fixed OTP 1234, no SMS and
    # no spend); set auth_otp_provider="msg91" or "trustsignal" + supply that
    # provider's credentials (below) to send real messages. env.ts fails boot
    # loudly if a real provider is armed without its credentials, or without
    # Redis — ENABLE_REDIS is already "true" above on every env, so that side
    # is satisfied here.
    AUTH_OTP_PROVIDER = var.auth_otp_provider

    # The opt-out for the two stub assertions in env.ts (OTP + payment). The image
    # runs NODE_ENV=production on every env, so without this a "stub" provider
    # crash-loops the task at boot. Emitted on every env (false unless asked for)
    # so the value is visible in the task definition rather than implied by absence.
    ALLOW_STUB_PROVIDERS_IN_PRODUCTION = var.allow_stub_providers_in_production ? "true" : "false"

    # Numbers that skip SMS and accept TEST_OTP (the code itself is a secret,
    # wired below). Plain env because the LIST is not the credential — knowing a
    # test number without the code gets you an ordinary undeliverable OTP.
    TEST_NUMBERS = var.test_numbers

    # Media (TAM-83) — consumed by core/media (TAM-84).
    # MEDIA_PUBLIC_BASE_URL is ALWAYS the CloudFront domain, NEVER the
    # *.s3.amazonaws.com origin: the origin is private and is never addressed
    # directly (ADR A2). Every media URL written to Postgres is built from and
    # validated against this value (ADR A4).
    #
    # MEDIA_ALLOW_INSECURE_URLS is deliberately ABSENT and must stay absent —
    # its absence IS its correct production value (false). It is a local-dev
    # carve-out for floci's http-only endpoint (ADR A7); TAM-84's env.ts
    # hard-fails boot if it is ever true while NODE_ENV=production (which this
    # task always is, hardcoded above).
    MEDIA_BUCKET          = aws_s3_bucket.media.bucket
    MEDIA_PUBLIC_BASE_URL = "https://${aws_cloudfront_distribution.media.domain_name}"

    # Server-side payment analytics (TAM-145) — the api POSTs the payment funnel
    # to the events collector in THIS stack, the same door the Flutter SDK uses.
    # Via the ALB rather than a private hop: the two services share it and the
    # `/2/httpapi` listener rule already routes there (see the events module
    # below), so there is nothing to discover and no second endpoint to keep in
    # sync with the one `events_endpoint` already publishes.
    #
    # The api key is then NOT a second secret — it is the collector's own
    # EVENTS_API_KEY, injected below. A separate key would have to be rotated in
    # two places and would silently 400 every batch when they drifted.
    #
    # `analytics_events_url` overrides both halves at once: set it (with its
    # key) and the api posts to a collector outside this stack instead. Only the
    # api moves — mobile keeps hitting this stack's collector via the ALB.
    ANALYTICS_EVENTS_ENABLED = var.enable_analytics_events ? "true" : "false"
    ANALYTICS_EVENTS_URL     = local.wire_external_events ? var.analytics_events_url : "${local.public_base_url}/2/httpapi"
    # Attribution source for the four UTM events (TAM-160). Deliberately NOT
    # derived from ANALYTICS_EVENTS_URL: on prod that is this stack's own
    # collector, and /referral does not live there. Blank when unconfigured, which
    # is the api's own off switch (it needs this AND the tenant key below).
    REFERRAL_BASE_URL = var.referral_base_url
    # Per-ad-group paywall creatives need nothing more than REFERRAL_BASE_URL: the
    # campaigns are rows in `paywall_utm_overrides`, each with its own `enabled`,
    # so switching one off — or all of them — is a CMS edit, not an env var.
    #
    # A/B testing (TAM-173). Blank when unconfigured, which is the api's own
    # switch back to in-process variant resolution (it needs this AND the
    # tenant key riding in the secret bundle). Includes the /abtesting route
    # prefix — the api appends only /evaluate.
    ABTEST_BASE_URL = var.abtest_base_url
    # Chatbot (core/chat). Blank when unconfigured, which is the feature's own
    # off switch: the api builds its RAGFlow client lazily, so the routes still
    # exist and answer 503 instead of the task crash-looping. WHO gets chat is
    # not configured here — the abtesting service above decides when wired,
    # chat.buckets.ts in-process otherwise. The timeout rides along as plain
    # config; only the bearer token below is a secret.
    RAGFLOW_BASE_URL   = var.ragflow_base_url
    RAGFLOW_TIMEOUT_MS = tostring(var.ragflow_timeout_ms)
    }, var.enable_kafka && var.kafka_app_enabled ? {
    # domain-event bus — only wired into the app once its Kafka client
    # supports MSK SASL/IAM; plaintext kafkajs crash-loops against :9098
    ENABLE_KAFKA  = "true"
    KAFKA_BROKERS = aws_msk_cluster.domain_events[0].bootstrap_brokers_sasl_iam
    KAFKA_SASL    = "aws-iam"
    } : {}, var.enable_telemetry ? {
    # observability (opt-in) — OpenTelemetry -> local ClickStack collector sidecar
    # (or an external endpoint). The ingestion key is injected as a secret below.
    # deployment.environment distinguishes stage/prod in HyperDX (shared ClickHouse,
    # identical service names).
    ENABLE_TELEMETRY            = "true"
    OTEL_EXPORTER_OTLP_ENDPOINT = local.otel_endpoint
    OTEL_RESOURCE_ATTRIBUTES    = "deployment.environment=${var.env}"
    } : {}, var.enable_media_upload_optimizer ? {
    # TAM-267 — presign optimisable uploads (status/hero/banner video, aarti/book
    # audio) to incoming/<final key> and report `processing: true`; the
    # media-optimizer Lambda (media-optimizer.tf) writes the final key. Emitted
    # ONLY with the Lambda — the same variable creates both — because an api
    # routing uploads to incoming/ with nothing listening would leave every
    # editor polling for a final key that never appears. Absent = env.ts's
    # `false` default = direct upload, exactly as before.
    MEDIA_OPTIMIZE_UPLOADS = "true"
  } : {}, local.warehouse_environment)

  # Secrets are resolved from Secrets Manager by the ECS agent and never appear
  # in the task definition as plaintext. The fargate-service module grants the
  # execution role secretsmanager:GetSecretValue over exactly the ARNs in this
  # map, so adding a pair here is all the wiring an env needs.
  #
  # ADMIN_BOOTSTRAP_* is present only when the env supplies both values (see the
  # wire_admin_bootstrap local in main.tf). Omitted => the api creates no admin
  # and no admin route is reachable — the fail-closed default env.ts enforces.
  secrets = merge({
    DATABASE_URL = aws_secretsmanager_secret.database_url.arn
    }, {
    # Everything else is one key inside the per-service JSON bundle
    # (secrets-bundle.tf); the task sees the same env names as before.
    for k, v in local.api_bundle_values : k => "${aws_secretsmanager_secret.api_env.arn}:${k}::"
    },
    # TAM-175 — read ONLY by the deity-preference sync, which runs as a one-off
    # task on this same task definition. Reuses the ClickHouse secrets the OTel
    # collector and the CI/CD warehouse-migrate step already use.
  local.warehouse_secrets)

  # ClickStack OTel collector sidecar — exports the app's telemetry to ClickHouse
  # Cloud. Reuses the ClickHouse creds already in Secrets Manager.
  sidecar_image       = local.wire_clickstack_collector ? var.clickstack_collector_image : ""
  sidecar_name        = "otel-collector"
  sidecar_environment = local.wire_clickstack_collector ? local.clickstack_sidecar_env : {}
  sidecar_secrets     = local.clickstack_sidecar_secrets

  # Kafka (conditional) + media S3 (always) — composed in the locals block above.
  extra_task_policy_json = jsonencode({
    Version   = "2012-10-17"
    Statement = local.api_task_statements
  })
}

# apps/events — click-events collector (Amplitude V2 HTTP) on :3001 → Kinesis.
module "events" {
  source = "../fargate-service"

  name         = "${local.name_prefix}-events"
  region       = var.region
  cluster_id   = aws_ecs_cluster.main.id
  cluster_name = aws_ecs_cluster.main.name
  use_spot     = var.use_spot
  vpc_id       = aws_vpc.main.id
  subnet_ids   = local.private_subnet_ids

  task_security_group_id = aws_security_group.events_tasks.id
  alb_listener_arn       = local.app_listener_arn
  extra_listener_arn     = local.http_compat_listener_arn
  # evaluated before api's catch-all
  listener_rule_priority      = 10
  listener_rule_path_patterns = ["/2/httpapi", "/2/httpapi/*"]
  # events is part of the api surface — same hostnames, different path.
  listener_rule_host_headers = local.app_host_headers

  image          = var.events_image
  container_port = 3001
  min_instances  = var.min_instances
  max_instances  = var.max_instances
  cpu            = var.events_task_cpu
  memory         = var.events_task_memory

  environment = merge({
    NODE_ENV    = "production"
    HOST        = "0.0.0.0"
    EVENTS_PORT = "3001"
    AWS_REGION  = var.region
    # OFF, deliberately: mobile's events are FORWARDED to the external collector
    # below, not written to this stack's warehouse. The stream/ClickPipe stay
    # provisioned (and the task keeps its PutRecords policy) so flipping this
    # back to "true" is a one-line re-enable, but nothing is produced to it.
    ENABLE_KINESIS = "false"
    }, var.enable_kinesis ? {
    KINESIS_STREAM_NAME = aws_kinesis_stream.events[0].name
    } : {}, local.wire_external_events ? {
    # Mobile's events go on to the SAME external collector the api produces to
    # — the app's serverUrl is baked into the released APK, so this collector is
    # the only place traffic can be re-pointed without a store release. Same
    # variable, same foreign key as the api above: one destination, one
    # credential. `analytics_events_url = ""` turns BOTH producers off — which,
    # with ENABLE_KINESIS false, means events are accepted and discarded (the
    # events task logs a warning at boot when that happens).
    ANALYTICS_EVENTS_URL = var.analytics_events_url
    } : {}, var.enable_telemetry ? {
    # observability (opt-in) — OpenTelemetry -> local ClickStack collector sidecar
    ENABLE_TELEMETRY            = "true"
    OTEL_EXPORTER_OTLP_ENDPOINT = local.otel_endpoint
    OTEL_RESOURCE_ATTRIBUTES    = "deployment.environment=${var.env}"
  } : {})

  secrets = {
    for k, v in local.events_bundle_values : k => "${aws_secretsmanager_secret.events_env.arn}:${k}::"
  }

  # ClickStack OTel collector sidecar — exports the app's telemetry to ClickHouse
  # Cloud. Reuses the ClickHouse creds already in Secrets Manager.
  sidecar_image       = local.wire_clickstack_collector ? var.clickstack_collector_image : ""
  sidecar_name        = "otel-collector"
  sidecar_environment = local.wire_clickstack_collector ? local.clickstack_sidecar_env : {}
  sidecar_secrets     = local.clickstack_sidecar_secrets

  # the running app may only write to its own stream (no wildcard); no stream,
  # no policy ("" = none, see fargate-service.extra_task_policy_json)
  extra_task_policy_json = var.enable_kinesis ? jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["kinesis:PutRecord", "kinesis:PutRecords", "kinesis:DescribeStreamSummary"]
      Resource = aws_kinesis_stream.events[0].arn
    }]
  }) : ""
}

# apps/admin — the React/Vite admin CMS, a static SPA served by nginx on :8080
# behind the SAME shared ALB (TAM-120). Reuses the cluster/VPC/private
# subnets/HTTP listener — no new stack. Routed on the `/cms` path prefix at a
# unique priority (30) BELOW api's catch-all (100) and distinct from events (10),
# so `/cms*` is matched before `/*` falls through to the api. A static server
# needs no secrets and no extra IAM, and is sized down (256/512).
#
# Wired in BOTH envs; realization is the human's `pnpm deploy:infra <env>` apply.
# Prod admin over this ALB is CLEARTEXT HTTP (no TLS/domain) — admin JWTs + edits
# ride plaintext; a TLS listener + domain + ACM is the tracked hardening
# follow-up before real editors use prod (spec #EXPORT_CRITICAL, docs/DEPLOYMENT.md).
# The admin module gained `count` (admin_on_fargate); keep the existing instance
# addressed as [0] so this is a rename, not a destroy/create of the live service.
moved {
  from = module.admin
  to   = module.admin[0]
}

module "admin" {
  source = "../fargate-service"
  count  = var.admin_on_fargate ? 1 : 0

  name         = "${local.name_prefix}-admin"
  region       = var.region
  cluster_id   = aws_ecs_cluster.main.id
  cluster_name = aws_ecs_cluster.main.name
  use_spot     = var.use_spot
  vpc_id       = aws_vpc.main.id
  subnet_ids   = local.private_subnet_ids

  task_security_group_id = aws_security_group.admin_tasks.id
  alb_listener_arn       = local.app_listener_arn
  extra_listener_arn     = local.http_compat_listener_arn
  # evaluated before api's catch-all (100); distinct from events (10)
  listener_rule_priority = 30
  # TWO LAYOUTS, and the image must be built to match — see admin_domain_name.
  #
  #   admin_domain_name = ""  -> path-routed at /cms on every hostname (stage).
  #                             Image built with the default VITE_BASE_PATH=/cms/.
  #   admin_domain_name set   -> the CMS host's catch-all, served at ROOT.
  #                             Image MUST be built with VITE_BASE_PATH=/ or every
  #                             asset 404s: the bundle would request /cms/assets/*
  #                             on a host that has no /cms rule.
  #
  # The api's rule is host-scoped in the split layout, so nothing else answers on
  # this hostname and an unmatched path hits the listener's 404 default rather
  # than falling through to the api.
  listener_rule_path_patterns = local.split_host ? ["/*"] : ["/cms", "/cms/*"]
  listener_rule_host_headers  = local.split_host ? [var.admin_domain_name] : []

  image             = var.admin_image
  container_port    = 8080
  health_check_path = "/health"
  # a static SPA server is cheap — smaller than the Node services (512/1024)
  cpu           = "256"
  memory        = "512"
  min_instances = var.min_instances
  max_instances = var.max_instances

  # A static bundle needs neither app secrets nor extra task-role permissions.
  secrets                = {}
  extra_task_policy_json = ""
}
