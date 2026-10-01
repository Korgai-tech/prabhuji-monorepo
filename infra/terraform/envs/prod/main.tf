# Production environment — one dedicated VPC (10.20.0.0/16) with the full
# stack. Deletion protection on; sized one notch above stage.

module "stack" {
  source = "../../modules/stack"

  env      = "prod"
  region   = var.region
  vpc_cidr = "10.20.0.0/16"

  api_image    = var.api_image
  events_image = var.events_image
  admin_image  = var.admin_image

  db_instance_class      = "db.t4g.medium"
  db_deletion_protection = true
  redis_node_type        = "cache.t4g.small"
  kinesis_shard_count    = 1
  # TWO, not one. A single api task behind the ALB means any task crash is a
  # full outage until a replacement passes health checks (~2 min). ~$25/mo.
  min_instances = 2
  max_instances = 3

  # TAM-171: MSK and Kinesis carried nothing (kafka_app_enabled=false, ENABLE_KINESIS=false)

  # for ~$216/month between the two envs. Re-enable when a consumer actually needs them.

  enable_kafka = false

  enable_kinesis = false

  enable_admin_static = var.enable_admin_static

  admin_on_fargate = var.admin_on_fargate
  # cost-conscious starting point — bump kafka_instance_type / kafka_ebs_gb
  # when domain-event volume warrants (t3.small is burstable, small heap)
  kafka_instance_type = "kafka.t3.small"
  kafka_broker_count  = 2

  # Phone-hash pepper for the api's OTP module. Prod's own value — never stage's.
  auth_otp_pepper = var.auth_otp_pepper
  openai_api_key  = var.openai_api_key

  # OTP delivery — LIVE MSG91, pinned in terraform.tfvars. Real SMS costs money
  # per message and a misconfigured DLT template fails every login, so rehearse
  # on stage first. Prod's MSG91 credentials are its own; never reuse stage's.
  # The stub is refused outright by the otp_guard precondition below.
  auth_otp_provider = var.auth_otp_provider
  msg91_auth_key    = var.msg91_auth_key
  msg91_template_id = var.msg91_template_id
  msg91_sender_id   = var.msg91_sender_id

  # TrustSignal — the alternative real-SMS adapter. All four values or none;
  # prod's credentials are its own, never stage's. Rehearse on stage first.
  trustsignal_api_key          = var.trustsignal_api_key
  trustsignal_sender_id        = var.trustsignal_sender_id
  trustsignal_template_id      = var.trustsignal_template_id
  trustsignal_message_template = var.trustsignal_message_template

  # Test numbers (QA / store-review). Listed numbers skip SMS entirely and accept
  # test_otp instead of a random code. LOGIN BYPASS — exact match only, and the
  # code lives in secrets.auto.tfvars, never in a committed file.
  test_numbers = var.test_numbers
  test_otp     = var.test_otp

  # Bootstrap admin (TAM-82) — the ONLY way an admin account comes into being;
  # there is no default admin anywhere. Without these, /cms serves but nobody can
  # ever log in and no content can be entered. Values live in secrets.auto.tfvars
  # (gitignored) and are stored in Secrets Manager, never in the task def.
  admin_bootstrap_email    = var.admin_bootstrap_email
  admin_bootstrap_password = var.admin_bootstrap_password

  # Payment gateway — LIVE. payment_provider/payment_env/cashfree_base_url/
  # cashfree_api_version are pinned in terraform.tfvars (non-secret, committed,
  # reviewable); the credential pair comes from secrets.auto.tfvars. See
  # variables.tf for why both credentials are required and what a one-of-two set
  # does.
  payment_provider       = var.payment_provider
  payment_env            = var.payment_env
  cashfree_base_url      = var.cashfree_base_url
  cashfree_api_version   = var.cashfree_api_version
  cashfree_client_id     = var.cashfree_client_id
  cashfree_client_secret = var.cashfree_client_secret

  # Decentro — THE ACTIVE gateway (payment_provider="decentro" in terraform.tfvars).
  # The Cashfree pair above stays wired on purpose: its secrets remain readable but
  # unread, so reverting payment_provider is a complete rollback with no other change.
  # See the payment_guard below for what the flip required.
  decentro_base_url              = var.decentro_base_url
  decentro_timeout_ms            = var.decentro_timeout_ms
  decentro_client_id             = var.decentro_client_id
  decentro_client_secret         = var.decentro_client_secret
  decentro_consumer_urn          = var.decentro_consumer_urn
  payment_callback_token         = var.payment_callback_token
  payment_callback_header        = var.payment_callback_header
  payment_mandate_expiry_minutes = var.payment_mandate_expiry_minutes

  # Razorpay — NOT armed. Wired so the credentials can sit in AWS ahead of any
  # flip; `wire_razorpay` needs all four non-empty or no Razorpay secret exists.
  # With secrets.auto.tfvars leaving them empty this whole block is inert.
  razorpay_base_url       = var.razorpay_base_url
  razorpay_key_id         = var.razorpay_key_id
  razorpay_key_secret     = var.razorpay_key_secret
  razorpay_webhook_secret = var.razorpay_webhook_secret

  # Recurring debits. Both default OFF and both must be ON before a cycle runs:
  # this arms the EventBridge schedule, the `_env` one sets
  # ENABLE_BILLING_SCHEDULER on the task. Dry run first (docs/DEPLOYMENT.md).
  enable_billing_scheduler     = var.enable_billing_scheduler
  enable_billing_scheduler_env = var.enable_billing_scheduler

  # Break-glass DB access. Off; prod's RDS admits only the api task SG, so this
  # is the only path from a laptop. Flip on for a session, off again after.
  enable_bastion = var.enable_bastion

  # feed_refresh_interval_ms is DELIBERATELY NOT PASSED. The module default IS
  # the production schedule (12h — 00:00 and 12:00 IST); the variable exists so
  # stage can shorten it for a QA session. Restating it here would only create a
  # second place for the real schedule to drift from, and shortening it on prod
  # would also shorten the window a fresh upload is guaranteed a top slot.

  # enable_api_docs and enable_dev_tools are DELIBERATELY NOT PASSED. Both
  # default false in modules/stack, and prod must keep them there: /docs has no
  # auth in front of an internet-facing ALB, and ENABLE_DEV_TOOLS mounts the
  # unauthenticated POST /devtools/mark-pro. Do not add them here.

  # Custom domain + TLS. Empty until the second apply (see variables.tf) — the
  # first apply comes up cleartext on the raw ALB hostname, then this cuts over.
  domain_name               = var.domain_name
  domain_aliases            = var.domain_aliases
  admin_domain_name         = var.admin_domain_name
  route53_zone_id           = var.route53_zone_id
  acm_certificate_arn       = var.acm_certificate_arn
  cert_validated_externally = var.cert_validated_externally
  redirect_http_to_https    = var.redirect_http_to_https

  # Browser origins allowed to call the api. The hosted /cms is same-origin and
  # needs no entry; this is for an editor running the Vite dev server against prod.
  cors_allowed_origins = var.cors_allowed_origins

  # Media (TAM-83): private S3 bucket + CloudFront/OAC. Bucket: app-prod-media.
  # CODE-ONLY — prod's stack has never been applied (E-R2); this is the
  # passthrough, not a deployment.
  media_cors_allowed_origins = var.media_cors_allowed_origins

  # ClickPipe reader role (analytics warehouse ingestion) — flip on during pipe
  # setup with the wizard-provided values: -var enable_clickpipe=true …
  enable_clickpipe                = var.enable_clickpipe
  clickpipe_trusted_principal_arn = var.clickpipe_trusted_principal_arn
  clickpipe_external_id           = var.clickpipe_external_id

  # ClickHouse Cloud credentials for warehouse migrations (stored in Secrets
  # Manager; not consumed by the running services). Consumed by the prod deploy
  # pipeline's events:migrate step below. Empty = secret not created.
  clickhouse_host = var.clickhouse_host

  # --- TAM-175: deity-split feed ---------------------------------------------------
  # Prod reads the `production` warehouse database.
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

  # Observability — a ClickStack OTel collector sidecar per app task exports to
  # ClickHouse Cloud (reusing the clickhouse_* creds above). Plumbed and ready,
  # but OFF until envs/prod/secrets.auto.tfvars exists (see variables.tf for the
  # template) — and it only becomes real on prod's first full apply, which this
  # stack has never had (E-R2).
  enable_telemetry               = var.enable_telemetry
  otel_exporter_otlp_endpoint    = var.otel_exporter_otlp_endpoint
  hyperdx_api_key                = var.hyperdx_api_key
  clickstack_clickhouse_database = var.clickstack_clickhouse_database

  # Server-side analytics target. Prod publishes to the SHARED production
  # collector, not this stack's own — set both or neither, or the module falls back
  # to the local collector. Key lives in the gitignored secrets.auto.tfvars.
  analytics_events_url     = var.analytics_events_url
  analytics_events_api_key = var.analytics_events_api_key

  # Attribution source for the four UTM events (TAM-160) — the referral service on
  # that same shared host, but a different path and a different credential. Passed
  # explicitly rather than derived from the url above, so the read target cannot
  # silently follow the publish target back to this stack.
  referral_base_url   = var.referral_base_url
  referral_tenant_key = var.referral_tenant_key

  # A/B testing (TAM-173). Consulted first for chat + paywall variants; unset,
  # the api resolves them in-process exactly as before. Key lives in the
  # gitignored secrets.auto.tfvars once a prod tenant key exists.
  abtest_base_url   = var.abtest_base_url
  abtest_tenant_key = var.abtest_tenant_key

  # Generalized in-app modals (TAM-174). Shared secret the external
  # audience-campaign service presents on POST /internal/modals/hooks to arm a
  # modal for a user. Prod's own value, never stage's; empty leaves the route
  # unregistered in apps/api rather than merely failing closed. Lives in the
  # gitignored secrets.auto.tfvars.
  modal_hook_key = var.modal_hook_key

  # Chatbot (core/chat). RAGFlow answers; WHO may ask is the A/B assignment
  # above (in-process while unset). Key lives in the gitignored
  # secrets.auto.tfvars. Unset leaves chat off in this env without affecting
  # anything else.
  ragflow_base_url = var.ragflow_base_url
  ragflow_api_key  = var.ragflow_api_key
}

# CI/CD — prod auto-deploys from `main` (the prod line). Every push to main runs
# the gates, rebuilds api+events images, and rolls the prod services. Mirrors the
# stage pipeline; account-global name `app-prod-deploy` never collides with
# `app-stage-deploy` (both envs share one account).
# One-time prerequisite: GitHub source credentials for CodeBuild (account-level,
# already imported for stage) — see infra/terraform/README.md ("CI/CD" section).
module "cicd" {
  source = "../../modules/cicd"

  name   = "app-prod-deploy"
  region = var.region
  # This repo (a fork of monorepo-metaservice, now the main line) — see stage.
  github_repo_url = "https://github.com/GamepeTechnolgies/prabhuji-monorepo.git"
  branch          = "main"
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
    # admin CMS (TAM-120): a third service, built+pushed+rolled like api/events;
    # no DB migration (the migrate_task below stays api-only). SECURITY: the ALB
    # is cleartext HTTP until `domain_name` is set — admin JWTs and edits would
    # ride plaintext. TLS now exists (modules/stack/tls.tf) and is a second
    # apply; do not give editors the CMS URL before it is on.
    ], var.admin_on_fargate ? [
    {
      service_name       = module.stack.admin_service_name
      service_arn        = module.stack.admin_service_arn
      ecr_repository_url = module.stack.admin_ecr_repository
      ecr_repository_arn = module.stack.admin_ecr_repository_arn
      dockerfile         = "apps/admin/Dockerfile"

      # THE BUILD HALF OF SPLIT-HOST ROUTING. A Vite bundle inlines these at
      # build time, so they cannot come from the task definition — and they must
      # agree with the ALB rules modules/stack derives from admin_domain_name:
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
      # drift; when admin_domain_name is "" this collapses to {} and prod builds
      # exactly like stage.
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

  # Warehouse migration (events:migrate) against ClickHouse Cloud `prod`. All
  # connection values come from Secrets Manager; only CLICKHOUSE_ENV (the target-
  # database selector) stays plaintext. Wired only when prod ClickHouse creds are
  # supplied; otherwise the maps are empty and the buildspec skips the migrate step.
  plaintext_env = module.stack.clickhouse_password_secret_arn != "" ? {
    CLICKHOUSE_ENV = "prod"
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

  # Postgres migration (Prisma) — mirrors stage (TAM-79): a one-off api task run
  # before the services roll, so the schema leads the code. There is no approval
  # gate, matching the pipeline it sits in — prod already rolls code on every push
  # to main. NOTE: declared here but NOT YET APPLIED — TAM-79 applied stage only,
  # so the live app-prod-deploy project still has the migration-less buildspec
  # until someone runs `pnpm deploy:infra prod`.
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

# --- Plan-time credential guards ------------------------------------------------
# Fail the PLAN, not the rollout.
#
# modules/stack's `wire_cashfree` creates the CASHFREE_* secrets only when
# client_id AND client_secret are both non-empty, while apps/api's env.ts
# requires BASE_URL + CLIENT_ID + CLIENT_SECRET. Supplying one of the pair
# therefore applies cleanly, wires NO secrets, and crash-loops every api task at
# boot — and on a first apply there are no old tasks left serving, so prod comes
# up with zero healthy targets and 503 everywhere.
#
# There is no webhook-secret check because there is no webhook secret: this
# account issues none, so the variable and its plumbing were removed. Callback
# auth is therefore "unverified but never trusted" — the handler re-reads the
# provider status API before touching entitlement.
#
# Same shape for OTP: an armed msg91 without credentials is a total login outage
# (env.ts refuses to boot), and the silent alternative is worse — falling back to
# the stub would accept the fixed OTP "1234" for every phone number in
# production. apps/api now hard-fails on that too; this catches it a step earlier.
#
# Mirrors the one existing precondition in the tree
# (modules/stack/services.tf's telemetry_guard).

resource "terraform_data" "payment_guard" {
  lifecycle {
    precondition {
      condition = var.payment_provider != "cashfree" || (
        var.cashfree_base_url != "" &&
        var.cashfree_client_id != "" &&
        var.cashfree_client_secret != ""
      )
      error_message = "payment_provider=\"cashfree\" needs cashfree_base_url plus BOTH credentials (client_id, client_secret) in envs/prod/secrets.auto.tfvars. One without the other creates no secrets at all and crash-loops every api task."
    }
    precondition {
      condition     = var.payment_provider != "stub"
      error_message = "payment_provider=\"stub\" auto-approves mandates in memory and collects no money — it must never be prod's gateway. The api also refuses to boot on it under NODE_ENV=production."
    }
    # Decentro needs FOUR values plus the callback token, not Cashfree's two. env.ts
    # requires the same set and refuses to boot without it; catching it here turns a
    # crash-looping service into a failed plan.
    precondition {
      condition = var.payment_provider != "decentro" || (
        var.decentro_base_url != "" &&
        var.decentro_client_id != "" &&
        var.decentro_client_secret != "" &&
        var.decentro_consumer_urn != "" &&
        var.payment_callback_token != ""
      )
      error_message = "payment_provider=\"decentro\" needs decentro_base_url plus ALL of client_id, client_secret, consumer_urn and payment_callback_token in envs/prod/secrets.auto.tfvars. A partial set creates no Decentro secrets at all and crash-loops every api task."
    }
    precondition {
      condition     = var.payment_env != "production" || !can(regex("staging\\.", var.decentro_base_url))
      error_message = "payment_env=\"production\" must not point at Decentro's staging host — env.ts refuses to boot on that combination."
    }
    # THE guard that matters most for the Cashfree -> Decentro switch.
    #
    # initPaymentModule resolves ONE gateway at boot and injects it everywhere;
    # nothing consults mandates.provider per row. So flipping this while live Cashfree
    # mandates exist drives them through the Decentro adapter, whose status reads would
    # be handed Cashfree subscription ids. Failing debits are the mild outcome; the
    # severe one is refreshFromProvider getting no match and the unknown-status
    # fallback marking live mandates dead, expiring paying subscribers.
    #
    # Per-row provider routing (TAM-140) is the prerequisite. Until it lands, this
    # precondition is what stops the flip being a one-line change that silently
    # cancels people's subscriptions.
    precondition {
      condition     = var.payment_provider != "decentro" || var.allow_provider_switch_with_live_mandates
      error_message = "payment_provider=\"decentro\" is BLOCKED while prod holds live Cashfree mandates: one gateway is resolved globally at boot, so existing mandates would be driven through the wrong adapter and can be marked dead by the unknown-status fallback. Land per-row provider routing (TAM-140) first, or set allow_provider_switch_with_live_mandates=true once every Cashfree mandate is revoked/migrated."
    }
    precondition {
      condition     = var.payment_env != "production" || !can(regex("sandbox", var.cashfree_base_url))
      error_message = "payment_env=\"production\" must not point at a Cashfree sandbox host."
    }
    # Razorpay needs FOUR values (base_url + key_id + key_secret + webhook_secret),
    # and needs them when it is the ACTIVE provider — that is the set env.ts
    # validates at boot. A non-active gateway is constructed lazily, so a missing
    # credential there is a per-row error, not a crash-loop, and does not belong in
    # a plan-time gate.
    precondition {
      condition = var.payment_provider != "razorpay" || (
        var.razorpay_base_url != "" &&
        var.razorpay_key_id != "" &&
        var.razorpay_key_secret != "" &&
        var.razorpay_webhook_secret != ""
      )
      error_message = "payment_provider=\"razorpay\" needs ALL of razorpay_base_url, key_id, key_secret and webhook_secret in envs/prod/secrets.auto.tfvars. A partial set creates no Razorpay secrets at all and crash-loops every api task."
    }
  }
}

resource "terraform_data" "otp_guard" {
  lifecycle {
    precondition {
      condition = var.auth_otp_provider != "msg91" || (
        var.msg91_auth_key != "" && var.msg91_template_id != ""
      )
      error_message = "auth_otp_provider=\"msg91\" needs msg91_auth_key AND msg91_template_id in envs/prod/secrets.auto.tfvars. Without them env.ts fails the boot and every login in prod is down."
    }
    precondition {
      condition = var.auth_otp_provider != "trustsignal" || (
        var.trustsignal_api_key != "" &&
        var.trustsignal_sender_id != "" &&
        var.trustsignal_template_id != "" &&
        var.trustsignal_message_template != ""
      )
      error_message = "auth_otp_provider=\"trustsignal\" needs ALL of trustsignal_api_key, trustsignal_sender_id, trustsignal_template_id and trustsignal_message_template in envs/prod/secrets.auto.tfvars. A partial set creates no TrustSignal secrets at all, env.ts fails the boot, and every login in prod is down."
    }
    precondition {
      condition     = var.auth_otp_provider != "stub"
      error_message = "auth_otp_provider=\"stub\" accepts the fixed OTP \"1234\" for EVERY phone number — a total auth bypass. Set \"msg91\" or \"trustsignal\" and supply its credentials."
    }
  }
}

resource "terraform_data" "admin_guard" {
  lifecycle {
    precondition {
      condition     = (var.admin_bootstrap_email != "") == (var.admin_bootstrap_password != "")
      error_message = "admin_bootstrap_email and admin_bootstrap_password must be set together (env.ts fails the boot on a half-set pair)."
    }
    precondition {
      condition     = var.admin_bootstrap_email != ""
      error_message = "prod needs a bootstrap admin: without one the CMS at /cms serves but nobody can ever log in, and there is no other way to create an admin account."
    }
  }
}
