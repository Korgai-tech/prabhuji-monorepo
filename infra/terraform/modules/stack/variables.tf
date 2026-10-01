variable "env" {
  description = "Environment name (stage | prod) — suffixed onto every resource name"
  type        = string
}

variable "name" {
  description = "Project name — prefix for all resources, combined with env (e.g. app-stage)"
  type        = string
  default     = "app"
}

variable "region" {
  description = "AWS region"
  type        = string
}

variable "vpc_cidr" {
  description = "CIDR block for this environment's dedicated VPC (must not overlap other envs)"
  type        = string
}

variable "az_count" {
  description = "Number of AZs to spread subnets across (ALB requires >= 2)"
  type        = number
  default     = 2

  validation {
    condition     = var.az_count >= 2
    error_message = "az_count must be >= 2 — the ALB requires subnets in at least two AZs."
  }
}

variable "api_image" {
  description = "Full image ref for apps/api (e.g. <account>.dkr.ecr.<region>.amazonaws.com/app-stage-api-images:<tag>). Build: docker build -f apps/api/Dockerfile ."
  type        = string
}

variable "events_image" {
  description = "Full image ref for apps/events (e.g. <account>.dkr.ecr.<region>.amazonaws.com/app-stage-events-images:<tag>). Build: docker build -f apps/events/Dockerfile ."
  type        = string
}

variable "admin_image" {
  description = "Full image ref for apps/admin — the admin CMS SPA served by nginx (e.g. <account>.dkr.ecr.<region>.amazonaws.com/app-stage-admin-images:<tag>). Build: docker build -f apps/admin/Dockerfile ."
  type        = string
}

variable "db_instance_class" {
  description = "RDS instance class"
  type        = string
  default     = "db.t4g.medium"
}

variable "db_deletion_protection" {
  description = "Protect the RDS instance from terraform destroy"
  type        = bool
  default     = true
}

variable "redis_node_type" {
  description = "ElastiCache Redis node type"
  type        = string
  default     = "cache.t4g.micro"
}

variable "use_spot" {
  description = "Run the three ECS services on FARGATE_SPOT. Stage only — see fargate-service.use_spot."
  type        = bool
  default     = false
}

variable "enable_admin_static" {
  description = "Host the admin CMS as a static site: private S3 bucket + CloudFront (default *.cloudfront.net certificate). CI builds the SPA and syncs it. Runs alongside the Fargate admin until admin_on_fargate is flipped off (TAM-172)."
  type        = bool
  default     = true
}

variable "admin_on_fargate" {
  description = "Keep the nginx admin container + its ALB rule. Flip to false once the static site is validated (and, for a custom domain, its cert + DNS are in place)."
  type        = bool
  default     = true
}

# --- Task sizing (TAM-172) -------------------------------------------------------
# Measured on prod, 31 Aug–7 Sep 2026: api CPU avg 0.2% / max 40% of 1 vCPU, memory 8%
# of 2 GB; events CPU avg 0.1% / max 25%, memory 4% of 2 GB, ~50 requests a day.
# Fargate only allows fixed pairs: 0.25 vCPU with 0.5/1/2 GB, 0.5 with 1–4 GB,
# 1 vCPU with 2–8 GB. `null` = the collector-aware default in services.tf.

variable "api_task_cpu" {
  description = "Fargate CPU units for the api task (null = default). The billing one-off task runs on this family too, so its sweep peaks — 40% of 1 vCPU — set the floor."
  type        = string
  default     = null
}

variable "api_task_memory" {
  description = "Fargate memory (MiB) for the api task (null = default). Must pair with api_task_cpu: 1 vCPU needs >= 2048."
  type        = string
  default     = null
}

variable "events_task_cpu" {
  description = "Fargate CPU units for the events task. 256 fits ~50 req/day with the OTel sidecar."
  type        = string
  default     = "256"
}

variable "events_task_memory" {
  description = "Fargate memory (MiB) for the events task. Measured use ~90 MB incl. sidecar; 512 is 5x headroom."
  type        = string
  default     = "512"
}

variable "enable_kinesis" {
  description = "Provision the click-events Kinesis stream (+ the events task's PutRecords policy and the ClickPipe reader role). Off = nothing is produced to it anyway (ENABLE_KINESIS=false on the task) and the stream + fan-out consumer cost ~$33/month idle — TAM-171."
  type        = bool
  default     = true
}

variable "kinesis_shard_count" {
  description = "Kinesis shard count for the click-events stream"
  type        = number
  default     = 1
}

# --- MSK (API domain-event bus) ------------------------------------------------
# On by default: both envs provision MSK so domain-event flows are testable in
# stage before prod. See docs/EVENT-ARCHITECTURE.md.

variable "enable_kafka" {
  description = "Provision Amazon MSK for the API's internal domain-event bus"
  type        = bool
  default     = true
}

variable "kafka_app_enabled" {
  description = "Wire ENABLE_KAFKA/KAFKA_BROKERS into the api task. Requires the app's Kafka client to support MSK SASL/IAM (TLS + signed auth) — until then the api would crash-loop on boot, so this stays off while MSK itself can be provisioned."
  type        = bool
  default     = false
}

variable "kafka_version" {
  description = "MSK Kafka version (MSK uses 3.7.x/3.8.x/3.9.x identifiers for Kafka >= 3.7)"
  type        = string
  default     = "3.9.x"
}

variable "kafka_instance_type" {
  description = "MSK broker instance type"
  type        = string
  default     = "kafka.t3.small"
}

variable "kafka_broker_count" {
  description = "MSK broker count (>= 2; must be a multiple of az_count — with 2 AZs use 2 or 4)"
  type        = number
  default     = 2
}

variable "kafka_ebs_gb" {
  description = "MSK per-broker EBS volume size (GB)"
  type        = number
  default     = 100
}

variable "min_instances" {
  description = "ECS minimum running tasks per service (Fargate cannot scale to zero — must be >= 1)"
  type        = number
  default     = 1
}

variable "max_instances" {
  description = "ECS maximum tasks per service (autoscaling ceiling)"
  type        = number
  default     = 3
}

variable "public_api" {
  description = "Expose the ALB to the internet (false = internal ALB, VPC-only)"
  type        = bool
  default     = true
}

# --- API docs -------------------------------------------------------------------

variable "enable_api_docs" {
  description = "Serve the interactive Swagger UI at /docs on the api. Defaults OFF — the ALB is internet-facing, so this publishes the whole API surface unauthenticated. Stage only; keep it false for prod."
  type        = bool
  default     = false
}

# TEMPORARY (remove before prod) — sets ENABLE_DEV_TOOLS on the api, which mounts
# POST /devtools/mark-pro (flip a user to Pro by phone). Defaults OFF; the ALB is
# internet-facing and this endpoint is unauthenticated, so it must stay false for
# prod. NODE_ENV can't gate it (production in both envs) — this flag is the switch.
variable "enable_dev_tools" {
  description = "TEMPORARY, stage only: set ENABLE_DEV_TOOLS=true on the api (mounts the unauthenticated POST /devtools/mark-pro). Keep false for prod; remove before prod exists."
  type        = bool
  default     = false
}

# --- Recurring payments (apps/api core/payment) --------------------------------
# Two independent switches guard the money path, and BOTH must be on:
#   enable_billing_scheduler  — arms the EventBridge schedule (this apply)
#   ENABLE_BILLING_SCHEDULER  — arms the app's cycle (the env var below)
# Deliberate: one is a terraform apply and the other rides a code deploy, so
# neither can start debiting on its own. Note the app is separately defaulted to
# PAYMENT_PROVIDER=stub, so even both-on charges nothing until Decentro
# credentials are wired.
variable "enable_billing_scheduler" {
  description = "Arm the recurring-debit schedule. false still creates the schedule (DISABLED), so arming later is a variable flip rather than a fresh IAM apply."
  type        = bool
  default     = false
}

variable "create_billing_scheduler" {
  description = "Create the EventBridge schedule + its IAM role at all. false removes them entirely, so arming billing in that env needs a code change rather than a variable flip. Default true — the normal path is a DISABLED schedule (enable_billing_scheduler=false)."
  type        = bool
  default     = true
}

variable "billing_schedule_expression" {
  description = "EventBridge Scheduler expression for the billing tick. 30 minutes matches the NPCI execution windows encoded in npci-window.ts."
  type        = string
  default     = "rate(30 minutes)"
}

variable "enable_billing_scheduler_env" {
  description = "Set ENABLE_BILLING_SCHEDULER=true on the api task (which the billing task reuses). The app-side half of the two-switch guard above."
  type        = bool
  default     = false
}

variable "enable_analytics_events" {
  description = "Publish server-side payment/subscription events from the api to this stack's events collector (TAM-145). On by default: the sends are best-effort and cannot affect a payment, so the kill switch is for a noisy collector, not for safety."
  type        = bool
  default     = true
}

# Point the api at a collector OUTSIDE this stack (e.g. the shared
# api-monorepo-common-staging one). Both must be set together — an external door
# takes its own key, and this stack's generated `events_api_key` is not it. Left
# empty (the default) the api posts to this stack's own collector over the ALB,
# authenticating with that collector's key.
variable "analytics_events_url" {
  description = "Full external collector URL for the api's server-side events (e.g. https://host/events/2/httpapi). Empty = this stack's own collector at <public_base_url>/2/httpapi."
  type        = string
  default     = ""
}

variable "analytics_events_api_key" {
  description = "Body api_key for the external collector named by analytics_events_url. Stored in its own Secrets Manager secret so this stack's collector key (which mobile uses) is untouched. Required when analytics_events_url is set."
  type        = string
  default     = ""
  sensitive   = true
}

# The shared platform's referral service — the attribution source for the four
# bk_*_utm_source_success events (TAM-160). Read by the api ONLY.
#
# It carries its own URL rather than reusing analytics_events_url's origin,
# because the two are NOT the same host everywhere: on stage the api posts events
# to the shared platform (same host as referral), but on prod it posts to this
# stack's own collector while referral stays on the shared platform. A derived
# origin would look attribution up on prabhuji's own ALB and read every user as
# "no campaign" — indistinguishable from honest organic traffic.
#
# Set both or neither. Either half empty disables the UTM events.
variable "referral_base_url" {
  description = "Origin of the shared platform's referral service, e.g. https://api-monorepo-common-staging.krutyug.ai. The api requests <this>/referral/v1/<userId>/latest; any path here is discarded. Empty = the four UTM events are off."
  type        = string
  default     = ""
}

variable "referral_tenant_key" {
  description = "x-tenant-key for referral_base_url, read by apps/api only. Paired with a constant x-tenant-id header in code (not config) — the key alone is a 401. Empty = the four UTM events are off."
  type        = string
  default     = ""
  sensitive   = true
}

# --- A/B testing: the shared platform's abtesting service (TAM-173) ------------
# Consulted FIRST for the chat and paywall variants when both halves are set.
# Unset — and on ANY client failure — the api resolves them in-process
# (chat.buckets.ts / paywall.buckets.ts), so this pair is an upgrade switch to
# console-managed experiments, never a feature switch: leaving it empty changes
# nothing. Guarded url-AND-key exactly like the referral pair above.
variable "abtest_base_url" {
  description = "Base URL of the shared platform's abtesting service INCLUDING its route prefix, e.g. https://api-monorepo-common-staging.krutyug.ai/abtesting — the api appends only /evaluate. Empty = variants resolve in-process."
  type        = string
  default     = ""
}

variable "abtest_tenant_key" {
  description = "Runtime x-tenant-key for abtest_base_url (issue with: pnpm --filter @svc/abtesting issue-key prabhuji). Paired with a constant x-tenant-id header in code. Empty = variants resolve in-process."
  type        = string
  default     = ""
  sensitive   = true
}


# --- Generalized in-app modals: audience-campaign webhook (TAM-174) ------------
# Shared secret the external campaign service presents on POST
# /internal/modals/hooks to arm a modal for a user. Unlike the url-AND-key
# pairs above, this is a single value with no base_url — the route itself is
# the integration surface, so leaving it empty leaves the route UNREGISTERED
# (a 404), not merely failing closed. Rides in the api secret bundle only; no
# standalone secret, nothing else consumes it.
variable "modal_hook_key" {
  description = "Shared secret the audience-campaign service presents on POST /internal/modals/hooks (TAM-174). Empty leaves the route unregistered."
  type        = string
  default     = ""
  sensitive   = true
}

# --- Chatbot: RAGFlow (apps/api core/chat) -------------------------------------
# The provider that ANSWERS chat, guarded url-AND-key like the pairs above.
# Leaving it empty is the feature's off switch: the api fails CLOSED and
# reports chat disabled for everyone, booting normally otherwise.
#
# WHO gets chat is decided by the A/B assignment (the abtest pair above when
# configured, chat.buckets.ts otherwise). Which agent serves which variant is
# in neither place — it is a constant in
# apps/api/src/core/chat/services/chat.constants.ts. The agent id reaches the
# provider verbatim, so the set of reachable agents stays in reviewed source
# rather than in a task definition anyone can edit.
variable "ragflow_base_url" {
  description = "Origin of the RAGFlow deployment, e.g. https://ragflow-f7pq.onrender.com. The api posts to <this>/api/v1/agents/chat/completions. Empty = chat returns 503."
  type        = string
  default     = ""
}

variable "ragflow_api_key" {
  description = "Bearer token for ragflow_base_url. Empty = chat returns 503."
  type        = string
  default     = ""
  sensitive   = true
}

variable "ragflow_timeout_ms" {
  description = "Per-request timeout for a RAGFlow agent turn. Deliberately far above the 30s other providers use: a turn is a full RAG pipeline plus a completion, and the instance cold-starts."
  type        = number
  default     = 120000
}

# --- Payment gateway selection (apps/api core/payment) -------------------------
# The active gateway is chosen by PAYMENT_PROVIDER (registry lookup). Default
# `stub` keeps every env booting with no vendor credentials; set `cashfree` (the
# primary real gateway) or `decentro` and supply that provider's credentials.
# env.ts fails boot loudly if a real provider is armed without its credentials.

variable "payment_provider" {
  description = "Active payment gateway: stub | decentro | cashfree | razorpay. Default stub (in-memory, no real money). Set cashfree + supply cashfree_* to go live."
  type        = string
  default     = "stub"
}

variable "payment_env" {
  description = "Provider environment: staging | production. Selects sandbox vs live host and guards against pointing one at the other (env.ts). Stage → staging."
  type        = string
  default     = "staging"
}

# NOTE: payment_provider names ONLY the gateway new mandates register on. There is
# deliberately no companion "enabled gateways" variable: apps/api resolves EVERY
# gateway in its registry, building each adapter lazily on first use, and each
# subscriber's gateway is already recorded in `mandates.provider`. So a gateway
# keeps working after the switch without anyone restating it in config — and the
# entry nobody can forget to add is the one that does not exist.

variable "cashfree_base_url" {
  description = "Cashfree PG API base (…/pg). Sandbox: https://sandbox.cashfree.com/pg; live: https://api.cashfree.com/pg. Non-secret. Empty when Cashfree is not the active provider."
  type        = string
  default     = ""
}

# LOAD-BEARING, not cosmetic: Cashfree routes by `x-api-version`, so the pinned
# version decides which endpoints exist. The PG Subscriptions paths the adapter
# uses (cashfree.constants.ts) are the 2025-01-01 surface. Leaving this unset
# fell back to env.ts's `2023-08-01` default, under which
# POST /subscriptions/{id}/payments does not exist — mandate creation and the
# auth link still worked, so the break only surfaced at the FIRST live debit,
# which 404'd with "endpoint or method is not valid" (prod, 2026-07-29).
variable "cashfree_api_version" {
  description = "Cashfree x-api-version header — pins which API surface the PG Subscriptions endpoints resolve against. Must match the paths in apps/api cashfree.constants.ts (2025-01-01). Non-secret."
  type        = string
  default     = "2025-01-01"
}

variable "cashfree_client_id" {
  description = "Cashfree client id — stored in Secrets Manager, injected into the api + billing task. From the Cashfree dashboard; supply via a gitignored *.auto.tfvars. Empty => secret not created."
  type        = string
  default     = ""
  sensitive   = true
}

variable "cashfree_client_secret" {
  description = "Cashfree client secret — stored in Secrets Manager. Supply via a gitignored *.auto.tfvars; never commit."
  type        = string
  default     = ""
  sensitive   = true
}

# --- Decentro UPI Autopay (the other real gateway) --------------------------------
#
# Wire these together with payment_provider="decentro". env.ts requires ALL of
# base_url + client_id + client_secret + consumer_urn + payment_callback_token when
# that provider is armed, and fails boot loudly if any is missing — so the guard in
# envs/prod/main.tf checks the same set rather than letting a task crash-loop.
#
# Unlike Cashfree, Decentro DOES authenticate callbacks: a static shared secret in a
# header (TokenIpAuthenticator). Hence payment_callback_token below, which has no
# Cashfree equivalent.

variable "decentro_base_url" {
  description = "Decentro API base. Live is https://api.decentro.tech; staging is https://staging.api.decentro.tech. Non-secret. env.ts REFUSES a staging host when payment_env=production, and a live host when payment_env=staging — so this and payment_env must agree."
  type        = string
  default     = ""
}

variable "feed_refresh_interval_ms" {
  description = "How often the rotated discovery listings (home feed, status, ringtone, wallpaper) re-order. Non-secret. The default is the PRODUCTION schedule — 12h, i.e. 00:00 and 12:00 IST — so prod should leave it alone; shorten it on stage only to watch several refreshes in a sitting. Bounded 60000..86400000 by env.ts, which fails the boot outside that range. Note the new-item boost window scales with it (4 cycles: ~2 days at 12h, 20 minutes at 5 minutes), so a short value is a testing aid, not a tuning knob."
  type        = number
  default     = 43200000 # 12h

  validation {
    condition     = var.feed_refresh_interval_ms >= 60000 && var.feed_refresh_interval_ms <= 86400000
    error_message = "feed_refresh_interval_ms must be between 60000 (1 minute) and 86400000 (1 day) — the same bound apps/api/src/shared/config/env.ts enforces at boot, and a value outside it would crash-loop the task instead of failing the plan."
  }
}

variable "decentro_timeout_ms" {
  description = "Per-request timeout for Decentro calls. Non-secret. Capped at 30000 by env.ts; the presentation call is the one that matters, since a timeout there is ambiguous about whether money moved."
  type        = number
  default     = 10000
}

variable "decentro_client_id" {
  description = "Decentro client id — stored in Secrets Manager, injected into the api + billing task. Supply via a gitignored *.auto.tfvars. Empty => no Decentro secrets are created at all."
  type        = string
  default     = ""
  sensitive   = true
}

variable "decentro_client_secret" {
  description = "Decentro client secret — stored in Secrets Manager. Supply via a gitignored *.auto.tfvars; never commit."
  type        = string
  default     = ""
  sensitive   = true
}

variable "decentro_consumer_urn" {
  description = "Decentro consumer URN — the per-tenant identifier sent on mandate registration. Stored in Secrets Manager: it is account-identifying, so it is treated as a credential even though Decentro calls it a reference."
  type        = string
  default     = ""
  sensitive   = true
}

variable "payment_callback_token" {
  description = "Static shared secret Decentro sends on callbacks, compared by TokenIpAuthenticator. Minimum 32 chars (env.ts). REPLAYABLE by design — unlike an HMAC it does not bind to the payload — which is exactly why CallbackService never believes a callback body and re-reads the provider's status API instead."
  type        = string
  default     = ""
  sensitive   = true
}

variable "payment_mandate_expiry_minutes" {
  description = "How long a mandate approval link stays valid. Non-secret. Decentro's own bound is 1-1440 (expiry_time), and env.ts enforces the same ceiling; 1440 gives the payer a full day to approve."
  type        = number
  default     = 15
}

variable "payment_callback_header" {
  description = "HTTP header the provider echoes payment_callback_token in. Non-secret, but LOAD-BEARING: TokenIpAuthenticator looks up exactly this header and rejects the delivery when it is absent, so a mismatch 401s EVERY callback and the failure is silent from our side — it looks identical to the provider not sending them. Decentro sends `x-api-callback-secret`; env.ts's default (`x-prabhuji-callback-token`) is wrong for it and must be overridden per integration."
  type        = string
  default     = ""
}

# Callback authentication is deliberately absent: this Cashfree account issues
# no webhook signing key (confirmed 2026-07-27), so callbacks to
# /payment/callbacks/cashfree are accepted WITHOUT signature verification. That
# is the posture apps/api was built for — CallbackService never believes a
# webhook body, it re-reads Cashfree's status API — so a forged callback can
# only trigger a re-check, never grant entitlement or fake a settlement.

# --- Razorpay (the third real gateway) ------------------------------------------
#
# Wire these together with payment_provider="razorpay". env.ts requires ALL FOUR —
# base_url + key_id + key_secret + webhook_secret — for the ACTIVE provider, so
# modules/stack creates the secrets only as a complete set (`wire_razorpay` in
# main.tf).
#
# For a NON-active Razorpay the credentials are not a boot requirement: the adapter
# is built lazily, so a missing one costs Razorpay's rows (logged at error, that row
# skipped) rather than the whole service. Supply them anyway if Razorpay holds live
# mandates — that is what stops those subscribers silently going unbilled.
#
# ALL FOUR go through Secrets Manager, base_url included: apps/api reads it as an
# optionalSecret, and keeping the set together means one switch rather than a
# plaintext half and a secret half that can drift apart.
#
# Unlike Cashfree (which issues us no signing key), Razorpay DOES authenticate
# webhooks — HMAC over the raw body — hence razorpay_webhook_secret, which has no
# Cashfree analogue.

variable "razorpay_base_url" {
  description = "Razorpay API base (e.g. https://api.razorpay.com). Stored in Secrets Manager with the rest of the set. Empty => no Razorpay secrets are created at all."
  type        = string
  default     = ""
  sensitive   = true
}

variable "razorpay_key_id" {
  description = "Razorpay key id — stored in Secrets Manager, injected into the api + billing task. From the Razorpay dashboard; supply via a gitignored *.auto.tfvars."
  type        = string
  default     = ""
  sensitive   = true
}

variable "razorpay_key_secret" {
  description = "Razorpay key secret — stored in Secrets Manager. Supply via a gitignored *.auto.tfvars; never commit."
  type        = string
  default     = ""
  sensitive   = true
}

variable "razorpay_webhook_secret" {
  description = "Razorpay webhook signing secret — the app verifies the HMAC on every callback with it. Set the SAME value in the Razorpay dashboard's webhook config; a mismatch rejects every delivery. Supply via a gitignored *.auto.tfvars."
  type        = string
  default     = ""
  sensitive   = true
}

# --- Auth OTP (apps/api core/otp) ---------------------------------------------

variable "auth_otp_pepper" {
  description = "Phone-hash pepper for the OTP module — REQUIRED (min 32 chars); the api fails fast at boot without it. Stored in Secrets Manager. Per-env and PERMANENT: it is mixed into every stored phone hash, so changing it silently invalidates them all. Supply via a gitignored *.auto.tfvars — never commit it."
  type        = string
  sensitive   = true

  validation {
    condition     = length(var.auth_otp_pepper) >= 32
    error_message = "auth_otp_pepper must be at least 32 characters (apps/api EnvSchema rejects shorter values at boot)."
  }
}

variable "auth_otp_provider" {
  description = "Which OTP adapter the api wires up: \"stub\" (no SMS; the fixed OTP 1234), \"msg91\" or \"trustsignal\" (real SMS). Default stub so no environment starts spending on SMS as a side effect of a deploy. Arming msg91 REQUIRES msg91_auth_key + msg91_template_id; arming trustsignal REQUIRES all four trustsignal_* values — env.ts fails the boot loudly otherwise. Redis is already enabled on every env, which the api also requires for any non-stub provider."
  type        = string
  default     = "stub"

  validation {
    condition     = contains(["stub", "msg91", "trustsignal"], var.auth_otp_provider)
    error_message = "auth_otp_provider must be one of: stub, msg91, trustsignal (the OTP_PROVIDERS tuple in apps/api/src/shared/config/otp-providers.ts)."
  }
}

variable "allow_stub_providers_in_production" {
  description = "Sets ALLOW_STUB_PROVIDERS_IN_PRODUCTION on the api. The image runs NODE_ENV=production on EVERY env, so env.ts otherwise refuses to boot with auth_otp_provider=\"stub\" or payment_provider=\"stub\". True means the stub OTP (the fixed code 1234, accepted for EVERY phone number) and/or the in-memory payment stub are live on a deployed environment. Defaults false; never set it for prod."
  type        = bool
  default     = false
}

variable "msg91_auth_key" {
  description = "MSG91 auth key (Flow API). EXTERNAL value from the MSG91 dashboard. Empty (default) => no secret is created. Set together with msg91_template_id and auth_otp_provider=\"msg91\"."
  type        = string
  default     = ""
  sensitive   = true
}

variable "msg91_template_id" {
  description = "DLT-registered MSG91 template the OTP is delivered through. India requires a pre-approved template — there is no free-text path to a real handset. Set together with msg91_auth_key."
  type        = string
  default     = ""
  sensitive   = true
}

variable "test_numbers" {
  description = "Comma-separated BARE national numbers (no country code, e.g. \"9111111111,9222222222\") that skip SMS delivery and accept test_otp instead of a random code. QA + app-store-reviewer accounts: the numbers are unallocated, so a real SMS is billed and never arrives. This is a LOGIN BYPASS — matching is exact, never a prefix. Empty (the default) disables the mechanism entirely. Setting this REQUIRES test_otp; apps/api fails the boot loudly otherwise."
  type        = string
  default     = ""
}

variable "test_otp" {
  description = "The fixed 4-digit code test_numbers accept. Held in Secrets Manager rather than a plain task-definition env var: it is a credential that admits real production accounts, and `ecs:DescribeTaskDefinition` is a much wider permission than `secretsmanager:GetSecretValue`. QUOTE IT in tfvars — an unquoted 0123 is a number, and arrives as \"123\"."
  type        = string
  default     = ""
  sensitive   = true

  validation {
    condition     = var.test_otp == "" || can(regex("^[0-9]{4}$", var.test_otp))
    error_message = "test_otp must be exactly 4 digits, matching OTP_LENGTH in apps/api/src/core/otp/services/otp.config.ts (quote it so a leading zero survives)."
  }
}

variable "msg91_sender_id" {
  description = "Optional MSG91 sender id. Most templates bake the sender in, in which case MSG91 ignores this and it can stay empty."
  type        = string
  default     = ""
  sensitive   = true
}

# --- TrustSignal SMS (core/otp) -------------------------------------------------
# UNLIKE MSG91 (whose DLT template lives in the vendor dashboard and is addressed
# by id alone), TrustSignal's API takes the message BODY on the wire, so the
# DLT-registered text itself is a deploy input. All four values are therefore
# required together — see local.wire_trustsignal in main.tf.

variable "trustsignal_api_key" {
  description = "TrustSignal API key. EXTERNAL value from the TrustSignal dashboard. Empty (default) => no secret is created. Set together with the other trustsignal_* values and auth_otp_provider=\"trustsignal\"."
  type        = string
  default     = ""
  sensitive   = true
}

variable "trustsignal_sender_id" {
  description = "TrustSignal DLT sender id (the 6-char header on the handset, e.g. \"PBJAI\"). Required — unlike MSG91, TrustSignal does not carry a sender baked into the template."
  type        = string
  default     = ""
  sensitive   = true
}

variable "trustsignal_template_id" {
  description = "The 19-digit DLT template id registered against trustsignal_sender_id. India requires a pre-approved template — there is no free-text path to a real handset."
  type        = string
  default     = ""
  sensitive   = true
}

variable "trustsignal_message_template" {
  description = "The full DLT-registered SMS body, with the OTP placeholder the api substitutes. Must match the registered text CHARACTER FOR CHARACTER — the operator drops a message whose body does not match its template id, and nothing in the API response says so."
  type        = string
  default     = ""
  sensitive   = true
}

# --- Bootstrap admin (TAM-82; apps/api core/auth/bootstrap-admin.ts) ------------
# The FIRST admin user, created after listen on every boot (idempotent). BOTH
# values or NEITHER: env.ts enforces both-or-neither and, with neither set, the
# boot path is skipped and the platform has NO admin — no admin route is
# reachable by anyone. That empty default IS the security property, so leaving
# these unset in an env is a valid, deliberate state (prod does exactly that).
# Supply via the gitignored *.auto.tfvars like auth_otp_pepper — the password
# must never reach git.

variable "admin_bootstrap_email" {
  description = "Email of the bootstrap admin. Empty (default) => no secrets created, no admin account exists. Set together with admin_bootstrap_password."
  type        = string
  default     = ""
}

variable "admin_bootstrap_password" {
  description = "Password for the bootstrap admin. Empty (default) => no admin. The api's EnvSchema requires min 16 chars — stricter than /auth/register's min 8, because this is the root of admin access and /auth/login is not rate limited. Prefer a generated value (openssl rand -base64 24) over a human-chosen one."
  type        = string
  default     = ""
  sensitive   = true

  validation {
    condition     = var.admin_bootstrap_password == "" || length(var.admin_bootstrap_password) >= 16
    error_message = "admin_bootstrap_password must be empty (no admin) or at least 16 characters (apps/api EnvSchema rejects shorter values at boot)."
  }
}

# --- Break-glass DB access (bastion.tf) -----------------------------------------
# Off by default in both envs. Flip on for the duration of a debugging session,
# then flip back off — an always-on host is a standing attack surface for a need
# that is occasional by nature.

variable "enable_bastion" {
  description = "Provision an SSM-only bastion in a private subnet and admit it to the RDS SG on 5432. Reachable solely via `aws ssm start-session` (no public IP, no key pair, no inbound rules); enables port-forwarding RDS to a developer laptop. ~$3/month while on — keep it false unless actively in use."
  type        = bool
  default     = false
}

variable "bastion_instance_type" {
  description = "Bastion instance type — arm64 to match the AL2023 arm64 AMI in bastion.tf. Port-forwarding is nearly free, so the smallest Graviton box is plenty."
  type        = string
  default     = "t4g.nano"
}

# --- Media object store (admin CMS uploads; TAM-83) -----------------------------
# The bucket + CloudFront/OAC themselves take no knobs — they are private and
# public-via-CDN by design (media.tf). The only thing that legitimately varies is
# which web origin may drive a browser PUT.

variable "media_cors_allowed_origins" {
  description = "Web origins allowed to PUT directly to the media bucket (browser CORS). The admin panel is localhost-only this epic (epic Scope Decision 5 / D-D1), so the default is the Vite dev server. MUST be an explicit list — never [\"*\"]; add the hosted admin origin here if/when one exists."
  type        = list(string)
  default     = ["http://localhost:4200"]

  validation {
    condition     = !contains(var.media_cors_allowed_origins, "*")
    error_message = "media_cors_allowed_origins must never contain \"*\" — the media bucket accepts browser PUTs and a wildcard origin would let any site drive an upload (ADR A2)."
  }
}

# --- Custom domain + TLS (shared ALB) -------------------------------------------
# All OFF by default: with domain_name = "" the stack plans and applies exactly
# as it did before TLS existed. See modules/stack/tls.tf for the four modes and
# why the hosted zone is NOT created by Terraform.

variable "domain_name" {
  description = "Primary hostname the shared ALB serves (e.g. app.krutyug.ai). Empty (default) = no TLS, no DNS, no ACM: the stack keeps its cleartext :80 listener and the raw *.elb.amazonaws.com hostname. Setting it is the single switch that turns the whole TLS path on."
  type        = string
  default     = ""
}

variable "domain_aliases" {
  description = "Extra hostnames added to the certificate as SANs and pointed at the same ALB, reaching the SAME rules as domain_name — this adds NAMES, not routing. For a hostname that must serve a DIFFERENT service, use admin_domain_name (host-based routing). Never a wildcard: ACM collapses an apex and its wildcard into one validation record, which breaks the 1:1 name->record mapping in tls.tf."
  type        = list(string)
  default     = []
}

variable "admin_domain_name" {
  description = "Dedicated hostname serving the admin CMS at its ROOT (e.g. cms.krutyug.ai), separate from the api's domain_name. Empty (default) = the historical single-host layout: no host conditions anywhere and the CMS stays path-routed at /cms on whatever hostname reaches the ALB — which is what stage runs. Setting it switches the ALB to host-based routing (api + events answer only on domain_name/domain_aliases, admin only on this name at /*), adds this name to the certificate and the DNS records, and REQUIRES the admin image to be built with VITE_BASE_PATH=/ and VITE_API_URL=https://<domain_name>: at root the SPA is no longer same-origin with the api, so cors_allowed_origins must also carry https://<this name>."
  type        = string
  default     = ""

  validation {
    condition     = var.admin_domain_name == "" || var.domain_name != ""
    error_message = "admin_domain_name needs domain_name set — host-based routing is meaningless without a hostname for the api to answer on."
  }

  validation {
    # The empty guard is load-bearing: both variables default to "" (every env
    # with no domain, which is stage today), and a bare `!=` fails that case —
    # aborting the plan before most of the stack is even evaluated.
    condition     = var.admin_domain_name == "" || var.admin_domain_name != var.domain_name
    error_message = "admin_domain_name must differ from domain_name; one hostname cannot route to two services."
  }
}

variable "route53_zone_id" {
  description = "Route53 PUBLIC hosted zone that owns domain_name (aws route53 list-hosted-zones-by-name). Set = Terraform writes both the ACM validation records and the ALB ALIAS, and the cutover is ONE apply. Empty = DNS lives where Terraform cannot write it: it still requests the certificate and OUTPUTS the record for you to publish by hand, creates no DNS, and never blocks on validation. The zone itself is never created here — see the header of tls.tf."
  type        = string
  default     = ""
}

variable "acm_certificate_arn" {
  description = "Use an EXISTING, already-ISSUED ACM certificate in this region instead of requesting one (e.g. an account-wide *.krutyug.ai wildcard). Must cover domain_name and every domain_aliases entry. Empty (default) = Terraform requests its own for exactly those names."
  type        = string
  default     = ""
}

variable "cert_validated_externally" {
  description = "Operator assertion, for the external-DNS path ONLY (domain_name set, route53_zone_id empty, acm_certificate_arn empty): 'I published the validation CNAME at the registrar and ACM has ISSUED the certificate Terraform requested.' false (default) leaves the 443 listener unbuilt, so the first apply can neither hang nor fail on a PENDING_VALIDATION certificate. Verify before flipping: aws acm describe-certificate --certificate-arn $(terraform output -raw acm_certificate_arn) --query Certificate.Status  # => \"ISSUED\". Ignored when Route53 owns the zone or acm_certificate_arn is supplied."
  type        = bool
  default     = false
}

variable "redirect_http_to_https" {
  description = "true (default): :80 becomes a permanent 301 to :443 and the three service rules live ONLY on the HTTPS listener — the raw *.elb.amazonaws.com hostname STOPS WORKING for clients (it redirects to an https URL whose certificate does not match that hostname). false: :80 keeps its 404 default AND every service rule is duplicated onto it, so existing cleartext clients keep working while they migrate. Use false for a stage cutover with mobile builds already on testers' phones, then flip to true. No effect when domain_name is empty."
  type        = bool
  default     = true
}

variable "alb_ssl_policy" {
  description = "ELB security policy on the 443 listener. Default is the modern TLS 1.2 + 1.3 policy; only lower it for a documented client-compatibility reason."
  type        = string
  default     = "ELBSecurityPolicy-TLS13-1-2-2021-06"
}

# --- API CORS (browser callers of the api itself) -------------------------------
# DISTINCT from media_cors_allowed_origins above, which governs browser PUTs to
# the S3 bucket. This one governs who may call the api from a browser.
#
# Whether the hosted admin SPA needs an entry depends on the layout:
#
#   admin_domain_name = ""  -> NO entry. The CMS is served from /cms on the SAME
#                              ALB and derives its base URL from
#                              window.location.origin, so its calls are
#                              same-origin and CORS never fires.
#   admin_domain_name set   -> AN ENTRY IS REQUIRED: https://<admin_domain_name>.
#                              At its own root the CMS is a DIFFERENT origin from
#                              the api, it is built with an explicit
#                              VITE_API_URL, and every request it makes is
#                              cross-origin. Omit it and the CMS loads fine and
#                              then fails every call — including login — with an
#                              opaque browser CORS error, not a server message.
#
# The other consumer is an editor running `pnpm nx serve admin` locally against a
# deployed API — the workflow media_cors_allowed_origins already documents. The
# mobile app is not a browser and sends no Origin header, so it is unaffected.
#
# EMPTY (the default) means the api reflects ANY origin — correct for local dev
# and the test suites, wrong for an internet-facing ALB. Set it per env.

variable "cors_allowed_origins" {
  description = "Exact browser origins allowed to call the api (Access-Control-Allow-Origin). Empty = reflect any origin, which is only acceptable off an internet-facing ALB. MUST be an explicit list — never [\"*\"]."
  type        = list(string)
  default     = []

  validation {
    condition     = !contains(var.cors_allowed_origins, "*")
    error_message = "cors_allowed_origins must never contain \"*\" — list exact origins. A wildcard lets any site call the api with a logged-in user's browser."
  }
}

# --- Observability (ClickStack; opt-in) ---------------------------------------

variable "enable_telemetry" {
  description = "Ship OpenTelemetry (traces/logs/metrics) from api + events to ClickStack, via a collector sidecar in each app task (opt-in)"
  type        = bool
  default     = false
}

variable "otel_exporter_otlp_endpoint" {
  description = "EXTERNAL OTLP/HTTP endpoint override. Normally empty: when the collector sidecar is wired (enable_telemetry + ClickHouse creds) the apps export to http://localhost:4318 instead. Only needed to point at a collector you run elsewhere."
  type        = string
  default     = ""
}

variable "hyperdx_api_key" {
  description = "ClickStack/HyperDX ingestion key — REQUIRED non-empty when enable_telemetry=true (the SDK skips init, and the app fails fast at boot, without it). With the sidecar collector this may be any placeholder: the localhost OTLP hop does no client auth."
  type        = string
  default     = ""
  sensitive   = true
}

variable "clickstack_collector_image" {
  description = "ClickStack OTel collector image run as a sidecar in each app task (exports to ClickHouse Cloud). Pinned to a specific version (not :latest) for reproducible deploys — bump deliberately. Only used when enable_telemetry=true and ClickHouse creds are set."
  type        = string
  default     = "clickhouse/clickstack-otel-collector:2.30.0"
}

variable "clickstack_clickhouse_database" {
  description = "Target ClickHouse database for this env's OTel data (HYPERDX_OTEL_EXPORTER_CLICKHOUSE_DATABASE). Empty = the collector's default DB. Set per env (e.g. otel_stage / otel_prod) to keep environments' telemetry separate; a matching HyperDX source must exist."
  type        = string
  default     = ""
}

variable "devtools_token" {
  description = "Bearer token for the devtools routes, sent as x-devtools-token. REQUIRED (min 16 chars) whenever enable_dev_tools=true — env.ts fails boot without it. Stored in Secrets Manager and injected into the api task."
  type        = string
  default     = ""
  sensitive   = true
}

variable "openai_api_key" {
  description = "OpenAI API key for daily-horoscope generation (core/horoscope). Its PRESENCE is the on/off switch — set it and generation runs; leave it \"\" and no secret is created and the daily endpoint 404s. There is no separate enable flag. Stored in Secrets Manager and injected into the api task."
  type        = string
  default     = ""
  sensitive   = true
}

# --- ClickPipe (analytics warehouse ingestion; opt-in) --------------------------

variable "enable_clickpipe" {
  description = "Provision the cross-account IAM role ClickHouse Cloud's ClickPipe assumes to read the click-events Kinesis stream"
  type        = bool
  default     = false
}

variable "clickpipe_trusted_principal_arn" {
  description = "ClickHouse Cloud's AWS principal ARN (shown in the ClickPipe wizard) — required when enable_clickpipe=true"
  type        = string
  default     = ""
}

variable "clickpipe_external_id" {
  description = "sts:ExternalId condition for the ClickPipe trust (shown in the wizard); empty = no condition"
  type        = string
  default     = ""
}

# --- ClickHouse Cloud service credentials (warehouse migrations run from CI/CD) --
# Not used by the running services (events writes Kinesis, not ClickHouse) — only
# the deploy pipeline's `events:migrate` step needs them. Host/user are plaintext;
# the password is stored in Secrets Manager (created only when supplied).

variable "clickhouse_host" {
  description = "ClickHouse Cloud host (e.g. xxx.clickhouse.cloud) — migrations connect to https://host:8443"
  type        = string
  default     = ""
}

variable "clickhouse_user" {
  description = "ClickHouse Cloud service user for migrations"
  type        = string
  default     = "default"
}

variable "clickhouse_password" {
  description = "ClickHouse Cloud service password — stored in Secrets Manager for the deploy pipeline's migrate step (empty = secret not created)"
  type        = string
  default     = ""
  sensitive   = true
}

# --- Docker Hub pull credentials (CI only) -------------------------------------
# The CI gates pull postgres:18-alpine (testcontainers + its ryuk reaper),
# floci/floci and clickhouse/clickhouse-server from Docker Hub. CodeBuild runs
# outside the VPC on shared AWS egress addresses, so an UNAUTHENTICATED pull
# draws on a per-IP bucket shared with every other tenant on that address —
# which is why both pipelines failed the gates with HTTP 429
# `toomanyrequests` without a line of app code changing. Authenticating moves
# the build onto the account's own quota. Consumed only by the deploy pipeline;
# no running service ever reads these.
variable "dockerhub_username" {
  description = "Docker Hub account the deploy pipeline authenticates pulls as (empty = anonymous pulls, subject to the shared per-IP rate limit)"
  type        = string
  default     = ""
}

variable "dockerhub_token" {
  description = "Docker Hub Personal Access Token (NOT the account password) — stored in Secrets Manager for the deploy pipeline's docker login (empty = secret not created)"
  type        = string
  default     = ""
  sensitive   = true
}

# --- TAM-175: deity-split feed + its warehouse sync -----------------------------

variable "clickhouse_analytics_database" {
  description = "Warehouse database holding `custom_user_properties` for THIS environment — stage reads `staging`, prod reads `production`. Empty disables the sync entirely. Deliberately has NO default: a wrong value would mirror another environment's users into this one's database, so it must be stated per env."
  type        = string
  default     = ""
}

variable "clickhouse_tenant" {
  description = "TAM-256 — the `saas_events.tenant` value this environment's rows carry. Read by the admin status-performance report, which filters on it. Empty disables warehouse reads for that report (it renders an explicit \"not configured\" state rather than failing). No default here for the same reason as the database above: it is the difference between this tenant's numbers and everyone's."
  type        = string
  default     = ""
}

variable "enable_deity_sync" {
  description = "Arm the scheduled deity-preference sync. The schedule and its IAM are created either way (DISABLED), so arming is a variable flip."
  type        = bool
  default     = false
}

variable "deity_sync_schedule_expression" {
  description = "EventBridge Scheduler expression for the deity-preference sync. Hourly is ample: the feed itself only re-orders twice a day on prod."
  type        = string
  default     = "rate(1 hour)"
}

variable "enable_deity_split" {
  description = "Master switch for the deity-split feed (home + status + chip row), read by apps/api at the single point every surface goes through. FALSE ships the code dark: the sync may run and the mirror may fill, but every surface serves the unpersonalised order until this is on."
  type        = bool
  default     = false
}

# --- TAM-267: media upload optimizer ----------------------------------------------
variable "enable_media_upload_optimizer" {
  description = "Compress CMS video/audio uploads before their URL is saved (media-optimizer.tf): the api signs uploads to incoming/<final key> (MEDIA_OPTIMIZE_UPLOADS) and an S3-triggered Lambda writes the final key, compressed or copied. Gates the Lambda, its layer + artifacts bucket, the S3 trigger, the incoming/ expiry rule AND the api flag together — the api must never route uploads to incoming/ where no function picks them up. Needs `pnpm nx build media-optimizer` + scripts/build-ffmpeg-layer.sh before plan (deploy-infra.sh runs both)."
  type        = bool
  default     = false
}
