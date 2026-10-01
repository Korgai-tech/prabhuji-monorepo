# Stage environment — one dedicated VPC (10.10.0.0/16) with the full stack,
# sized for cost: smallest DB/Redis, disposable (no deletion protection).

module "stack" {
  source = "../../modules/stack"

  env      = "stage"
  region   = var.region
  vpc_cidr = "10.10.0.0/16"

  api_image    = var.api_image
  events_image = var.events_image
  admin_image  = var.admin_image

  db_instance_class      = "db.t4g.micro"
  db_deletion_protection = false # stage is disposable
  redis_node_type        = "cache.t4g.micro"
  kinesis_shard_count    = 1
  min_instances          = 1
  max_instances          = 2

  # TAM-171: MSK and Kinesis carried nothing (kafka_app_enabled=false, ENABLE_KINESIS=false)

  # for ~$216/month between the two envs. Re-enable when a consumer actually needs them.

  enable_kafka = false

  enable_kinesis = false

  enable_admin_static = var.enable_admin_static

  admin_on_fargate = var.admin_on_fargate

  # Stage runs on Fargate Spot (TAM-172): an interruption just restarts a task.

  use_spot            = true
  kafka_instance_type = "kafka.t3.small"
  kafka_broker_count  = 2

  # Phone-hash pepper for the api's OTP module (secrets.auto.tfvars, gitignored).
  auth_otp_pepper = var.auth_otp_pepper
  openai_api_key  = var.openai_api_key

  # OTP delivery. Default stub (fixed OTP 1234, no SMS, no spend). Arm real SMS
  # on stage FIRST — set auth_otp_provider="msg91" and supply the msg91_*
  # secrets in secrets.auto.tfvars (gitignored). env.ts fails the boot loudly if
  # the provider is armed without them.
  auth_otp_provider = var.auth_otp_provider

  # STAGE ONLY. The image runs NODE_ENV=production here too, so env.ts would
  # refuse to boot on auth_otp_provider="stub" without this opt-out. With both
  # set, ANY phone number logs in on stage with the fixed OTP 1234 — and stage
  # carries a restore of prod's user table. prod leaves this at its false default.
  allow_stub_providers_in_production = true
  msg91_auth_key                     = var.msg91_auth_key
  msg91_template_id                  = var.msg91_template_id
  msg91_sender_id                    = var.msg91_sender_id

  # TrustSignal — the alternative real-SMS adapter. All four values or none;
  # values in secrets.auto.tfvars (gitignored). Selected with
  # auth_otp_provider="trustsignal"; present-but-unselected costs nothing.
  trustsignal_api_key          = var.trustsignal_api_key
  trustsignal_sender_id        = var.trustsignal_sender_id
  trustsignal_template_id      = var.trustsignal_template_id
  trustsignal_message_template = var.trustsignal_message_template

  # Test numbers (QA / store-review). Listed numbers skip SMS entirely and accept
  # test_otp instead of a random code. LOGIN BYPASS — exact match only, and the
  # code lives in secrets.auto.tfvars, never in a committed file.
  test_numbers = var.test_numbers
  test_otp     = var.test_otp

  # Bootstrap admin (TAM-82) — the only way an admin account comes into being;
  # there is no default admin anywhere. Values live in secrets.auto.tfvars
  # (gitignored) and are stored in Secrets Manager, never in the task def.
  # Set both or neither. prod passes neither and therefore has no admin.
  admin_bootstrap_email    = var.admin_bootstrap_email
  admin_bootstrap_password = var.admin_bootstrap_password

  # Interactive API docs at /docs — STAGE ONLY. prod leaves this at its `false`
  # default: the ALB is internet-facing and /docs has no auth in front of it.
  enable_api_docs = true

  # TEMPORARY (remove before prod) — mounts the unauthenticated POST
  # /devtools/mark-pro (flip a user to Pro by phone). STAGE ONLY; prod leaves this
  # at its `false` default. Delete this line + the core/devtools module before prod.
  #
  # devtools_token is the ONLY authentication these routes have, and env.ts fails
  # boot when the flag is on without it — which is exactly how stage crash-looped
  # on 2026-08-03 (the app grew the requirement; terraform had no variable for it).
  # It matters more now that stage's database is a copy of prod's: mark-pro grants
  # Pro entitlement to a real user row.
  # OFF since 2026-08-05: stage runs payment_env="production" (real money), and
  # env.ts refuses that combination outright — an unauthenticated lifetime-Pro
  # grant next to a live paywall is a free-Pro faucet. Re-enabling requires
  # moving payment_env back to "staging" first.
  enable_dev_tools = false
  devtools_token   = var.devtools_token

  # Break-glass DB access — RDS is private and admits only the api task SG, so
  # this is the only way to reach it from a laptop. Off by default; flip on for a
  # session with `-var enable_bastion=true` and off again after.
  enable_bastion = var.enable_bastion

  # Discovery-feed rotation. Defaults to prod's 12h schedule; terraform.tfvars is
  # where QA shortens it (300000 = every 5 min) to watch several refreshes in a
  # sitting, instead of the old way — editing the constant and shipping a deploy,
  # which reached prod once and had to be reverted.
  feed_refresh_interval_ms = var.feed_refresh_interval_ms

  # Recurring debits. NOT CREATED on stage — terraform.tfvars pins
  # create_billing_scheduler=false, so there is no EventBridge schedule and no
  # scheduler IAM role here at all.
  #
  # The original plan was a DISABLED schedule so stage could dry-run the claim →
  # PDN → presentation → settlement → entitlement path against the stub. That
  # rationale died when stage took prod's Decentro credentials: a flip of
  # enable_billing_scheduler would present debits against the live account. To
  # exercise billing on stage again, revert to a stub/sandbox payment_provider
  # FIRST, then set create_billing_scheduler=true.
  #
  # The two `enable_*` switches below stay wired and stay false — they are the
  # arming controls, and both must be ON before a cycle runs (one is this apply,
  # the other rides a code deploy). With the schedule uncreated the first is inert.
  create_billing_scheduler     = var.create_billing_scheduler
  enable_billing_scheduler     = var.enable_billing_scheduler
  enable_billing_scheduler_env = var.enable_billing_scheduler

  # Payment gateway. Default stub (schema default) keeps stage booting with no
  # vendor credentials. To exercise Cashfree against its sandbox: set
  # payment_provider="cashfree", cashfree_base_url to the sandbox host, and the
  # cashfree_client_id/cashfree_client_secret pair in secrets.auto.tfvars —
  # env.ts fails boot loudly if cashfree is armed without them. payment_env stays
  # "staging" (sandbox).
  #
  # NOTE: prod's cashfree_base_url (https://api.cashfree.com/pg) CANNOT be copied
  # here — env.ts refuses the live Cashfree host while payment_env="staging", so
  # the api would crash-loop at boot. Use the sandbox host.
  payment_provider       = var.payment_provider
  payment_env            = var.payment_env
  cashfree_base_url      = var.cashfree_base_url
  cashfree_api_version   = var.cashfree_api_version
  cashfree_client_id     = var.cashfree_client_id
  cashfree_client_secret = var.cashfree_client_secret

  # Decentro — ARMED on stage since 2026-08-03, with PROD'S credentials (see the
  # header over these variables for why, and for what keeps that survivable). The
  # values live in the gitignored secrets.auto.tfvars; `wire_decentro` needs all
  # four non-empty or no Decentro secret is created at all.
  decentro_base_url              = var.decentro_base_url
  decentro_timeout_ms            = var.decentro_timeout_ms
  decentro_client_id             = var.decentro_client_id
  decentro_client_secret         = var.decentro_client_secret
  decentro_consumer_urn          = var.decentro_consumer_urn
  payment_callback_token         = var.payment_callback_token
  payment_callback_header        = var.payment_callback_header
  payment_mandate_expiry_minutes = var.payment_mandate_expiry_minutes

  # Razorpay — NOT armed. Wired so the credentials can live in AWS before the
  # gateway is used; `wire_razorpay` needs all four non-empty or no Razorpay
  # secret is created at all. Empty in secrets.auto.tfvars => this is inert.
  razorpay_base_url       = var.razorpay_base_url
  razorpay_key_id         = var.razorpay_key_id
  razorpay_key_secret     = var.razorpay_key_secret
  razorpay_webhook_secret = var.razorpay_webhook_secret

  # Custom domain + TLS. Two applies, same as prod (see terraform.tfvars): the
  # first requests the certificate and prints the validation records to publish in
  # Cloudflare; the second, after ACM says ISSUED, builds the 443 listener.
  domain_name               = var.domain_name
  domain_aliases            = var.domain_aliases
  admin_domain_name         = var.admin_domain_name
  route53_zone_id           = var.route53_zone_id
  acm_certificate_arn       = var.acm_certificate_arn
  cert_validated_externally = var.cert_validated_externally
  redirect_http_to_https    = var.redirect_http_to_https

  # Browser origins allowed to call the api. With admin_domain_name set the CMS
  # is no longer same-origin with the api, so its hostname MUST be listed here.
  cors_allowed_origins = var.cors_allowed_origins

  # Media (TAM-83): private S3 bucket + CloudFront/OAC. The bucket/CDN take no
  # sizing knobs — only the browser-PUT origins vary. Bucket: app-stage-media.
  media_cors_allowed_origins = var.media_cors_allowed_origins

  # ClickPipe reader role (analytics warehouse ingestion) — flip on during pipe
  # setup with the wizard-provided values: -var enable_clickpipe=true …
  enable_clickpipe                = var.enable_clickpipe
  clickpipe_trusted_principal_arn = var.clickpipe_trusted_principal_arn
  clickpipe_external_id           = var.clickpipe_external_id

  # ClickHouse Cloud credentials for the deploy pipeline's warehouse migration
  # (stored in Secrets Manager) and, when telemetry is on, for the OTel collector
  # sidecar's export target.
  clickhouse_host = var.clickhouse_host

  # --- TAM-175: deity-split feed ---------------------------------------------------
  # Stage reads the `staging` warehouse database — never production's.
  clickhouse_analytics_database  = var.clickhouse_analytics_database
  clickhouse_tenant              = var.clickhouse_tenant
  enable_deity_sync              = var.enable_deity_sync
  deity_sync_schedule_expression = var.deity_sync_schedule_expression
  enable_deity_split             = var.enable_deity_split
  clickhouse_password            = var.clickhouse_password

  # --- TAM-267: compress CMS video/audio uploads (Lambda + api flag) ------------
  enable_media_upload_optimizer = var.enable_media_upload_optimizer

  # Docker Hub pull credentials for the deploy pipeline's CI gates. Empty = the
  # gates keep pulling anonymously (and stay exposed to the shared per-IP limit).
  dockerhub_username = var.dockerhub_username
  dockerhub_token    = var.dockerhub_token

  # Server-side analytics target (TAM-145). Stage posts to the SHARED staging
  # collector, not the one in this stack — set both or neither. Key lives in the
  # gitignored secrets.auto.tfvars.
  analytics_events_url     = var.analytics_events_url
  analytics_events_api_key = var.analytics_events_api_key

  # Attribution source for the four UTM events (TAM-160). On stage this happens to
  # be the same host as analytics_events_url above, but it is passed explicitly
  # because on prod it is NOT. Key lives in the gitignored secrets.auto.tfvars.
  referral_base_url   = var.referral_base_url
  referral_tenant_key = var.referral_tenant_key

  # A/B testing (TAM-173). Consulted first for chat + paywall variants; unset,
  # the api resolves them in-process exactly as before. Key lives in the
  # gitignored secrets.auto.tfvars.
  abtest_base_url   = var.abtest_base_url
  abtest_tenant_key = var.abtest_tenant_key

  # Generalized in-app modals (TAM-174). Shared secret the external
  # audience-campaign service presents on POST /internal/modals/hooks. Left
  # commented out in terraform.tfvars until the campaigns exist; empty leaves
  # the route unregistered rather than merely failing closed.
  modal_hook_key = var.modal_hook_key

  # Chatbot (core/chat). RAGFlow answers; WHO may ask is the A/B assignment
  # above (in-process when unset). Key lives in the gitignored
  # secrets.auto.tfvars. Unset leaves chat off in this env without affecting
  # anything else.
  ragflow_base_url = var.ragflow_base_url
  ragflow_api_key  = var.ragflow_api_key

  # Observability — a ClickStack OTel collector sidecar per app task exports to
  # ClickHouse Cloud (reusing the clickhouse_* creds above). hyperdx_api_key is
  # stored in Secrets Manager; the optional database keeps this env's OTel data
  # separate from prod's. Values live in the gitignored secrets.auto.tfvars.
  enable_telemetry               = var.enable_telemetry
  otel_exporter_otlp_endpoint    = var.otel_exporter_otlp_endpoint
  hyperdx_api_key                = var.hyperdx_api_key
  clickstack_clickhouse_database = var.clickstack_clickhouse_database
}

# CI/CD — every push to the long-lived `stage` branch rebuilds api+events images
# and rolls the services. Prod has its own pipeline (envs/prod) triggered by
# `main`. One-time prerequisite: GitHub source credentials for CodeBuild —
# see infra/terraform/README.md ("CI/CD" section).
module "cicd" {
  source = "../../modules/cicd"

  name   = "app-stage-deploy"
  region = var.region
  # This repo (a fork of monorepo-metaservice, now the main line). The live
  # app-stage-deploy project was repointed here by hand; this matches the code to it.
  github_repo_url = "https://github.com/Korgai-tech/prabhuji-monorepo.git"
  branch          = "stage"
  cluster_name    = module.stack.cluster_name

  services = concat([
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
    # admin CMS (TAM-120): a third service that builds+pushes+rolls exactly like
    # api/events. It has NO database migration — the migrate_task below stays
    # api-only (a static SPA has no schema).
    ], var.admin_on_fargate ? [
    {
      service_name       = module.stack.admin_service_name
      service_arn        = module.stack.admin_service_arn
      ecr_repository_url = module.stack.admin_ecr_repository
      ecr_repository_arn = module.stack.admin_ecr_repository_arn
      dockerfile         = "apps/admin/Dockerfile"

      # THE BUILD HALF OF SPLIT-HOST ROUTING (mirrors envs/prod/main.tf). A Vite
      # bundle inlines these at build time, so they cannot come from the task
      # definition — and they must agree with the ALB rules modules/stack derives
      # from admin_domain_name:
      #
      #   VITE_BASE_PATH=/  the CMS owns its host's root, so assets are emitted
      #                     at /assets/* to match the "/*" listener rule. Left at
      #                     the /cms/ default, every asset would 404 on a host
      #                     with no /cms rule and the page would load blank.
      #   VITE_API_URL      at its own root the CMS is a DIFFERENT origin from
      #                     the api, so window.location.origin (the default)
      #                     would point the SPA back at itself.
      #
      # Both derive from the same variables the routing does, so they cannot
      # drift; when admin_domain_name is "" this collapses to {} and stage builds
      # exactly as it did before.
      build_args = var.admin_domain_name != "" ? {
        VITE_BASE_PATH = "/"
        VITE_API_URL   = "https://${var.domain_name}"
      } : {}
    },
  ] : [])

  # The admin SPA as a static site (TAM-172): built here, synced to S3, CDN invalidated.
  static_sites = var.enable_admin_static ? [{
    name             = "admin"
    nx_project       = "admin"
    dist_dir         = "apps/admin/dist"
    bucket           = module.stack.admin_static_bucket
    bucket_arn       = module.stack.admin_static_bucket_arn
    distribution_id  = module.stack.admin_cdn_distribution_id
    distribution_arn = module.stack.admin_cdn_distribution_arn
    build_env = {
      VITE_BASE_PATH = "/"
      VITE_API_URL   = "https://${var.domain_name}"
    }
  }] : []

  # Warehouse migration (events:migrate) against ClickHouse Cloud `staging`, run
  # in the deploy pipeline. All connection values come from Secrets Manager; only
  # CLICKHOUSE_ENV (the non-secret target-database selector) stays plaintext.
  # Wired only when credentials are supplied; otherwise the maps are empty and the
  # buildspec skips the migrate step.
  plaintext_env = module.stack.clickhouse_password_secret_arn != "" ? {
    CLICKHOUSE_ENV = "staging"
  } : {}

  # Two independent groups, merged: the ClickHouse trio gates the warehouse
  # migrate step, the Docker Hub pair authenticates the gates' image pulls. Either
  # can be absent without disturbing the other — the buildspec guards on
  # CLICKHOUSE_HOST and DOCKERHUB_TOKEN separately.
  secret_env = merge(
    module.stack.clickhouse_password_secret_arn != "" ? {
      CLICKHOUSE_HOST     = module.stack.clickhouse_host_secret_arn
      CLICKHOUSE_USER     = module.stack.clickhouse_user_secret_arn
      CLICKHOUSE_PASSWORD = module.stack.clickhouse_password_secret_arn
    } : {},
    module.stack.dockerhub_token_secret_arn != "" ? {
      DOCKERHUB_USERNAME = module.stack.dockerhub_username_secret_arn
      DOCKERHUB_TOKEN    = module.stack.dockerhub_token_secret_arn
    } : {},
  )

  # Postgres migration (Prisma) — a one-off api task the pipeline runs before it
  # rolls the services (TAM-79), so the schema always leads the code. RDS is only
  # reachable from inside the VPC wearing the api-tasks SG, which is why this is a
  # task and not a build step. Same invocation as scripts/deploy-infra.sh step 5.
  migrate_task = {
    task_definition_family = module.stack.api_task_definition_family
    container_name         = module.stack.api_container_name
    execution_role_arn     = module.stack.api_execution_role_arn
    task_role_arn          = module.stack.api_task_role_arn
    subnet_ids             = module.stack.private_subnet_ids
    security_group_ids     = [module.stack.api_task_security_group_id]
    command                = ["npx", "prisma", "migrate", "deploy", "--schema", "./prisma/schema.prisma"]
  }
}

# --- Plan-time credential guard -------------------------------------------------
# Fail the PLAN, not the rollout. Same shape and reasoning as envs/prod/main.tf's
# payment_guard, and as modules/stack/services.tf's telemetry_guard.
#
# modules/stack's `wire_decentro` creates the DECENTRO_* secrets only when all
# four credentials are non-empty, while apps/api's env.ts requires BASE_URL +
# CLIENT_ID + CLIENT_SECRET + CONSUMER_URN + CALLBACK_TOKEN
# (PROVIDER_REQUIRED_KEYS). So arming the provider with a partial set applies
# cleanly, wires NO secrets, and crash-loops every api task at boot — and stage's
# ECS deployment circuit breaker rolls back to a task def pointing at the same
# `:latest` image, so the rollback does not recover it either.
resource "terraform_data" "payment_guard" {
  lifecycle {
    precondition {
      condition = var.payment_provider != "decentro" || (
        var.decentro_base_url != "" &&
        var.decentro_client_id != "" &&
        var.decentro_client_secret != "" &&
        var.decentro_consumer_urn != "" &&
        var.payment_callback_token != ""
      )
      error_message = "payment_provider=\"decentro\" needs decentro_base_url plus ALL of client_id, client_secret, consumer_urn and payment_callback_token in envs/stage/secrets.auto.tfvars. A partial set creates no Decentro secrets at all and crash-loops every api task."
    }
    precondition {
      condition     = var.payment_env != "staging" || !can(regex("^https://api\\.decentro\\.tech", var.decentro_base_url))
      error_message = "payment_env=\"staging\" must not point at Decentro's LIVE host — env.ts refuses to boot on that combination, and it would bill against the production account."
    }
    # Same shape for Razorpay. Only the ACTIVE provider is checked: env.ts requires
    # the full key set for that one alone, and a non-active gateway's adapter is
    # built lazily, so a missing credential there costs Razorpay's rows — logged at
    # error, skipped — not the boot.
    precondition {
      condition = var.payment_provider != "razorpay" || (
        var.razorpay_base_url != "" &&
        var.razorpay_key_id != "" &&
        var.razorpay_key_secret != "" &&
        var.razorpay_webhook_secret != ""
      )
      error_message = "payment_provider=\"razorpay\" needs ALL of razorpay_base_url, key_id, key_secret and webhook_secret in envs/stage/secrets.auto.tfvars. A partial set creates no Razorpay secrets at all and crash-loops every api task."
    }
  }
}
