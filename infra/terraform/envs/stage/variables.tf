variable "region" {
  description = "AWS region"
  type        = string
  default     = "ap-south-1"
}

variable "api_image" {
  description = "Full image ref for apps/api (e.g. <account>.dkr.ecr.<region>.amazonaws.com/app-stage-api-images:<tag>)"
  type        = string
}

variable "events_image" {
  description = "Full image ref for apps/events (e.g. <account>.dkr.ecr.<region>.amazonaws.com/app-stage-events-images:<tag>)"
  type        = string
}

# --- Auth OTP -------------------------------------------------------------------
# The api's phone-hash pepper (min 32 chars). Required — the api fails fast at
# boot without it. Lives in secrets.auto.tfvars (gitignored); never commit it.
# Stage's value is independent of prod's, and both are PERMANENT: the pepper is
# mixed into every stored phone hash, so changing it invalidates them all.

variable "auth_otp_pepper" {
  description = "Phone-hash pepper for the api's OTP module — stored in Secrets Manager and injected into the api task"
  type        = string
  sensitive   = true
}

variable "openai_api_key" {
  description = "OpenAI API key for daily-horoscope generation — its presence switches generation on (no flag). Optional: unset => no secret, generation off. Supplied via secrets.auto.tfvars."
  type        = string
  default     = ""
  sensitive   = true
}

# --- Bootstrap admin (TAM-82) ---------------------------------------------------
# The first (and initially only) admin user. There is no default admin and no
# default password anywhere: with these unset the api creates no admin and the
# CMS at /cms, while it serves, cannot be logged into by anyone. Both live in
# secrets.auto.tfvars (gitignored); never commit them.

variable "admin_bootstrap_email" {
  description = "Email of the bootstrap admin — stored in Secrets Manager and injected into the api task. Empty => no admin."
  type        = string
  default     = ""
}

variable "admin_bootstrap_password" {
  description = "Password of the bootstrap admin (min 16 chars) — stored in Secrets Manager and injected into the api task. Empty => no admin."
  type        = string
  default     = ""
  sensitive   = true
}

variable "admin_image" {
  description = "Full image ref for apps/admin — the admin CMS SPA (e.g. <account>.dkr.ecr.<region>.amazonaws.com/app-stage-admin-images:<tag>)"
  type        = string
}

# --- Break-glass DB access ------------------------------------------------------

variable "enable_bastion" {
  description = "Provision the SSM-only bastion that lets a laptop port-forward to stage's RDS + Redis (see infra/terraform/README.md, \"Connecting to the database\"). This default is false, but terraform.tfvars pins stage to true — leaving it unset would let an apply that passes no -var tear down a live bastion."
  type        = bool
  default     = false
}

# --- Recurring payments (apps/api core/payment) ----------------------------------

variable "enable_billing_scheduler" {
  description = "Arm the recurring-debit scheduler: creates the EventBridge schedule ENABLED and sets ENABLE_BILLING_SCHEDULER=true on the api task def (which the billing task reuses). false still creates the schedule, DISABLED. Moot while create_billing_scheduler=false — see docs/DEPLOYMENT.md for the dry-run-first sequence."
  type        = bool
  default     = false
}

variable "devtools_token" {
  description = "Bearer token for /devtools/* (header x-devtools-token). REQUIRED while enable_dev_tools=true — the api fails boot without it. Supply via the gitignored secrets.auto.tfvars; min 16 chars."
  type        = string
  default     = ""
  sensitive   = true
}

variable "create_billing_scheduler" {
  description = "Create the EventBridge schedule + IAM role at all. terraform.tfvars pins this false for stage: stage now runs prod's Decentro credentials, so the schedule should not be one variable flip away from presenting real debits."
  type        = bool
  default     = true
}

# Payment gateway. Default stub keeps stage booting with no vendor credentials.
# To exercise Cashfree against its SANDBOX: set payment_provider="cashfree",
# payment_env="staging", cashfree_base_url="https://sandbox.cashfree.com/pg", and
# supply the cashfree_client_id/cashfree_client_secret pair in
# secrets.auto.tfvars (gitignored).
variable "payment_provider" {
  description = "Active payment gateway for stage: stub | decentro | cashfree. Default stub."
  type        = string
  default     = "stub"
}

variable "payment_env" {
  description = "Provider environment for stage — always the sandbox side."
  type        = string
  default     = "staging"
}

variable "cashfree_base_url" {
  description = "Cashfree PG API base. Stage uses the sandbox: https://sandbox.cashfree.com/pg. Empty when Cashfree is not active."
  type        = string
  default     = ""
}

variable "cashfree_api_version" {
  description = "Cashfree x-api-version — selects which API surface exists. Must match the adapter's PG Subscriptions paths (2025-01-01); the older default has no POST /subscriptions/{id}/payments, so debits 404 while mandate registration still succeeds."
  type        = string
  default     = "2025-01-01"
}

variable "cashfree_client_id" {
  description = "Cashfree sandbox client id — supply in secrets.auto.tfvars; empty => secret not created."
  type        = string
  default     = ""
  sensitive   = true
}

variable "cashfree_client_secret" {
  description = "Cashfree sandbox client secret — supply in secrets.auto.tfvars."
  type        = string
  default     = ""
  sensitive   = true
}

# --- Decentro (UPI Autopay — the gateway prod actually runs) ---------------------
# Lets stage exercise the real Decentro adapter. Nothing is created until all four
# credentials are non-empty (modules/stack's `wire_decentro`).
#
# *** STAGE CURRENTLY CARRIES PROD'S CREDENTIALS. *** Copied on 2026-08-03 on an
# explicit instruction ("use same as production") after the alternative — a
# separate staging pair from the Decentro dashboard — was raised and declined.
# Two things hold the blast radius down, and BOTH must stay true:
#
#   decentro_base_url = https://staging.api.decentro.tech   (terraform.tfvars)
#   payment_env       = "staging"                            (schema default)
#
# env.ts cross-checks them, so neither can drift alone. Point this at the LIVE
# host and stage becomes a real-money environment registering real mandates
# against real users — stage's database is a restore of prod's. That is a
# deliberate decision nobody has taken; do not arrive at it by editing one line.
#
# Whether prod's pair even authenticates on the staging host is UNVERIFIED as of
# 2026-08-03. If Decentro issued it for the production account only, registration
# fails with an auth error — which is the safe failure, not a bug to route around.

variable "decentro_base_url" {
  description = "Decentro STAGING API base — https://staging.api.decentro.tech. env.ts refuses the LIVE host while payment_env=staging, so this and payment_env cannot disagree."
  type        = string
  default     = ""
}

variable "feed_refresh_interval_ms" {
  description = "How often the rotated discovery listings re-order on stage. Defaults to the production 5h schedule; set it in terraform.tfvars (e.g. 300000 for 5 minutes) to watch several refreshes in a sitting. env.ts bounds it to 60000..86400000."
  type        = number
  default     = 18000000 # 5h — same as prod unless tfvars says otherwise
}

variable "decentro_timeout_ms" {
  description = "Per-request Decentro timeout. env.ts caps it at 30000."
  type        = number
  default     = 10000
}

variable "decentro_client_id" {
  description = "Decentro STAGING client id (dashboard -> Developers -> API Keys, Staging not Production). secrets.auto.tfvars; empty => no Decentro secrets created."
  type        = string
  default     = ""
  sensitive   = true
}

variable "decentro_client_secret" {
  description = "Decentro STAGING client secret. secrets.auto.tfvars; never commit."
  type        = string
  default     = ""
  sensitive   = true
}

variable "decentro_consumer_urn" {
  description = "Decentro consumer URN for the staging account. Treated as a credential: it identifies the account on every mandate registration."
  type        = string
  default     = ""
  sensitive   = true
}

variable "payment_callback_token" {
  description = "Static shared secret Decentro echoes on callbacks (min 32 chars). Generate a stage-only value (`openssl rand -hex 32`) and register it with Decentro — never reuse prod's. Replayable by design, which is why the handler never trusts a callback body."
  type        = string
  default     = ""
  sensitive   = true
}

# --- Razorpay (stage) ------------------------------------------------------------
# Nothing is created until all four are non-empty (modules/stack's
# `wire_razorpay`), and nothing is USED until razorpay is payment_provider or a
# mandate row names it. Use the Razorpay TEST-mode key pair on stage — stage's
# database is a restore of prod's, so a live key here registers real mandates
# against real users.
variable "razorpay_base_url" {
  description = "Razorpay API base for stage (https://api.razorpay.com — Razorpay separates test from live by KEY, not by host). secrets.auto.tfvars; empty => no Razorpay secrets created."
  type        = string
  default     = ""
  sensitive   = true
}

variable "razorpay_key_id" {
  description = "Razorpay TEST-mode key id (dashboard -> Account & Settings -> API Keys, Test mode). secrets.auto.tfvars."
  type        = string
  default     = ""
  sensitive   = true
}

variable "razorpay_key_secret" {
  description = "Razorpay TEST-mode key secret. secrets.auto.tfvars; never commit."
  type        = string
  default     = ""
  sensitive   = true
}

variable "razorpay_webhook_secret" {
  description = "Razorpay webhook signing secret for stage — must equal the value registered on the stage webhook in the dashboard, or every delivery fails its HMAC check. Generate a stage-only value; never reuse prod's."
  type        = string
  default     = ""
  sensitive   = true
}

variable "payment_callback_header" {
  description = "Header the provider echoes payment_callback_token in. Pinned in terraform.tfvars to x-api-callback-secret for Decentro; env.ts's default (x-prabhuji-callback-token) would 401 every callback SILENTLY — indistinguishable from a provider that never sends any."
  type        = string
  default     = ""
}

variable "payment_mandate_expiry_minutes" {
  description = "Mandate approval link validity. Decentro's bound is 1-1440; 1440 gives the payer a full day to finish the bank-app flow."
  type        = number
  default     = 15
}

# --- Media object store (admin CMS uploads; TAM-83) -----------------------------

variable "media_cors_allowed_origins" {
  description = "Web origins allowed to PUT directly to the stage media bucket. The admin panel is localhost-only this epic (Scope Decision 5), so this is the Vite dev server: a developer running `pnpm nx serve admin` against the stage API uploads from http://localhost:4200. Add a hosted admin origin here if D-D1 is ever reopened."
  type        = list(string)
  default     = ["http://localhost:4200"]
}

# --- ClickPipe (analytics warehouse ingestion; opt-in) --------------------------
# Values come from the ClickHouse Cloud ClickPipe wizard — apply with -var flags
# during pipe setup (runbook: docs/ANALYTICS-WAREHOUSE.md).

variable "enable_clickpipe" {
  description = "Provision the cross-account IAM role ClickHouse Cloud assumes to read the click-events Kinesis stream"
  type        = bool
  default     = false
}

variable "clickpipe_trusted_principal_arn" {
  description = "ClickHouse Cloud's AWS principal ARN (from the ClickPipe wizard)"
  type        = string
  default     = ""
}

variable "clickpipe_external_id" {
  description = "sts:ExternalId for the ClickPipe trust (from the wizard); empty = no condition"
  type        = string
  default     = ""
}

# --- ClickHouse Cloud credentials (deploy-pipeline warehouse migration) ---------
# Host is non-secret; password is sensitive. Supply at apply time via -var (or a
# gitignored *.auto.tfvars) — never commit the password. Empty = feature off.

variable "clickhouse_host" {
  description = "ClickHouse Cloud host (xxx.clickhouse.cloud) for the deploy pipeline's events:migrate step"
  type        = string
  default     = ""
}

variable "clickhouse_password" {
  description = "ClickHouse Cloud service password — stored in Secrets Manager for the pipeline's migrate step"
  type        = string
  default     = ""
  sensitive   = true
}

# --- Server-side analytics target (apps/api -> collector) -----------------------
# Empty = this stack's own events service over the ALB. Set (with its key) to
# publish to a collector outside this stack; mobile is unaffected either way.

variable "analytics_events_url" {
  description = "Full collector URL for the api's server-side events, e.g. https://host/events/2/httpapi. Empty = this stack's own collector."
  type        = string
  default     = ""
}

variable "analytics_events_api_key" {
  description = "Body api_key for analytics_events_url. Lives in the gitignored secrets.auto.tfvars; stored in Secrets Manager as app-stage-analytics-events-api-key."
  type        = string
  default     = ""
  sensitive   = true
}

variable "referral_base_url" {
  description = "Origin of the shared platform's referral service — the attribution source for the four bk_*_utm_source_success events (TAM-160). Set in terraform.tfvars. Set with referral_tenant_key or not at all."
  type        = string
  default     = ""
}

variable "referral_tenant_key" {
  description = "x-tenant-key for referral_base_url. Lives in the gitignored secrets.auto.tfvars; stored as app-stage-referral-tenant-key. Empty disables the UTM events."
  type        = string
  default     = ""
  sensitive   = true
}

# --- A/B testing: shared abtesting service (TAM-173) ---------------------------
# Url-AND-key. Consulted first for chat and paywall variants; unset, the api
# resolves them in-process (chat.buckets.ts / paywall.buckets.ts), so leaving
# this pair empty changes nothing — it is an upgrade switch, not a feature
# switch. A missing credential can therefore never move a user between arms.
variable "abtest_base_url" {
  description = "Base URL of the shared platform's abtesting service including its /abtesting route prefix. Set in terraform.tfvars. Set with abtest_tenant_key or not at all."
  type        = string
  default     = ""
}

variable "abtest_tenant_key" {
  description = "Runtime x-tenant-key for abtest_base_url (pnpm --filter @svc/abtesting issue-key prabhuji). Lives in the gitignored secrets.auto.tfvars; rides in the api secret bundle. Empty = in-process variant resolution."
  type        = string
  default     = ""
  sensitive   = true
}


# --- Generalized in-app modals: audience-campaign webhook (TAM-174) ------------
# Shared secret the external audience-campaign service presents on POST
# /internal/modals/hooks to arm a modal for a user. No url pairing — the route
# lives on this stack. Left commented out in terraform.tfvars until the
# campaigns exist; empty leaves the route unregistered (a 404) in apps/api.
variable "modal_hook_key" {
  description = "Shared secret the audience-campaign service presents on POST /internal/modals/hooks (TAM-174). Lives in the gitignored secrets.auto.tfvars once set; rides in the api secret bundle. Empty leaves the route unregistered."
  type        = string
  default     = ""
  sensitive   = true
}

# --- Chatbot: RAGFlow (apps/api core/chat) -------------------------------------
# Url-AND-key: the provider that ANSWERS chat. Leaving it unset turns the
# feature off for everyone in this env (the api fails closed) — the safe
# direction. WHO gets chat is the A/B assignment above (or in-process when that
# pair is unset). Which agent serves which variant is a constant in
# apps/api/src/core/chat/services/chat.constants.ts, deliberately not config.
variable "ragflow_base_url" {
  description = "Origin of the RAGFlow deployment. Set in terraform.tfvars. Set with ragflow_api_key or not at all."
  type        = string
  default     = ""
}

variable "ragflow_api_key" {
  description = "Bearer token for ragflow_base_url. Lives in the gitignored secrets.auto.tfvars; stored as app-stage-ragflow-api-key. Empty = the chat endpoints 503."
  type        = string
  default     = ""
  sensitive   = true
}



# --- Observability: ClickStack (OpenTelemetry; opt-in) --------------------------
# Telemetry ships via a ClickStack OTel collector sidecar in each app task, which
# exports to ClickHouse Cloud (reusing clickhouse_host/user/password above).
#
# OFF on stage: terraform.tfvars pins enable_telemetry=false, so no sidecar is
# attached and no hyperdx secret is created. Set it THERE, not in
# secrets.auto.tfvars — *.auto.tfvars loads later and would silently override the
# committed value. hyperdx_api_key stays in secrets.auto.tfvars, unused until this
# is turned back on.

variable "enable_telemetry" {
  description = "Ship OpenTelemetry (traces/logs/metrics) from api+events to ClickStack (via the collector sidecar)"
  type        = bool
  default     = false
}

variable "otel_exporter_otlp_endpoint" {
  description = "External OTLP endpoint override; leave empty to use the in-task collector sidecar (http://localhost:4318)"
  type        = string
  default     = ""
}

variable "hyperdx_api_key" {
  description = "HyperDX ingestion key — required non-empty when enable_telemetry=true (the SDK skips init without it). With the sidecar (no client auth on localhost) any placeholder works. Stored in Secrets Manager."
  type        = string
  default     = ""
  sensitive   = true
}

variable "clickstack_clickhouse_database" {
  description = "Target ClickHouse DB for this env's OTel data (empty = collector default). Set to keep stage/prod telemetry in separate databases."
  type        = string
  default     = ""
}

# --- OTP delivery (apps/api core/otp) -------------------------------------------
# Default stub: the fixed OTP 1234, no SMS, no spend. Arming msg91 requires the
# auth key + template id together; arming trustsignal requires all four of its
# values; env.ts fails the boot loudly otherwise.
# Values live in secrets.auto.tfvars (gitignored) — never commit them.

variable "auth_otp_provider" {
  description = "Active OTP adapter: stub | msg91 | trustsignal. Default stub."
  type        = string
  default     = "stub"
}

variable "msg91_auth_key" {
  description = "MSG91 auth key (Flow API). Empty => no secret created and the api stays on the stub."
  type        = string
  default     = ""
  sensitive   = true
}

variable "msg91_template_id" {
  description = "DLT-registered MSG91 template the OTP rides in. Required alongside msg91_auth_key."
  type        = string
  default     = ""
  sensitive   = true
}

variable "msg91_sender_id" {
  description = "Optional MSG91 sender id. Most DLT templates carry their own, in which case leave this empty."
  type        = string
  default     = ""
  sensitive   = true
}

# --- TrustSignal SMS (alternative OTP adapter) ----------------------------------
# All four are required together: TrustSignal sends the message BODY on the wire
# and names the sender per request, so none of them has a usable default.

variable "trustsignal_api_key" {
  description = "TrustSignal API key. Empty => no secret created and the api stays on whatever auth_otp_provider names."
  type        = string
  default     = ""
  sensitive   = true
}

variable "trustsignal_sender_id" {
  description = "TrustSignal DLT sender id (the header shown on the handset, e.g. \"PBJAI\"). Required alongside trustsignal_api_key."
  type        = string
  default     = ""
  sensitive   = true
}

variable "trustsignal_template_id" {
  description = "The 19-digit DLT template id registered against trustsignal_sender_id. Required alongside trustsignal_api_key."
  type        = string
  default     = ""
  sensitive   = true
}

variable "trustsignal_message_template" {
  description = "The full DLT-registered SMS body the OTP is substituted into. Must match the registered text character for character; the operator silently drops a mismatch."
  type        = string
  default     = ""
  sensitive   = true
}

# --- Test numbers (QA / store-review accounts) -----------------------------------

variable "test_numbers" {
  description = "Comma-separated bare national numbers that skip SMS and accept test_otp (e.g. \"9111111111,9222222222\"). Empty disables the mechanism. Setting this REQUIRES test_otp — env.ts fails the boot otherwise."
  type        = string
  default     = ""
}

variable "test_otp" {
  description = "The fixed 4-digit code test_numbers accept. Lives in secrets.auto.tfvars (gitignored) — it is a credential that admits real accounts. QUOTE IT so a leading zero survives."
  type        = string
  default     = ""
  sensitive   = true
}

# --- API CORS -------------------------------------------------------------------
# Distinct from media_cors_allowed_origins (that one governs browser PUTs to S3).
# The hosted admin SPA needs NO entry — it is served from /cms on the same ALB and
# derives its base URL from window.location.origin, so its calls are same-origin
# and CORS never fires. This is for an editor running `pnpm nx serve admin`
# locally against stage. Empty = reflect any origin.

variable "cors_allowed_origins" {
  description = "Exact browser origins allowed to call the stage api. Never [\"*\"]."
  type        = list(string)
  default     = []
}

# --- Custom domain + TLS --------------------------------------------------------
# See modules/stack/tls.tf. Empty (default) keeps stage exactly as it is today:
# cleartext :80 on the raw ALB hostname.
#
# CUTTING STAGE OVER IS NOT A ONE-STEP CHANGE. apps/mobile/env/staging.json points
# at the raw ALB hostname over http, and every staging build already on a tester's
# phone breaks the instant redirect_http_to_https becomes true (the 301 targets an
# https URL whose certificate does not cover that hostname, and a 301 on a POST is
# downgraded to GET). Sequence: apply with redirect_http_to_https = false
# (dual-serve), ship a new staging build, then flip it true.

variable "domain_name" {
  description = "Primary hostname the stage ALB serves (e.g. app-stage.krutyug.ai). Empty = no TLS."
  type        = string
  default     = ""
}

variable "domain_aliases" {
  description = "Extra hostnames on the same certificate + ALB."
  type        = list(string)
  default     = []
}

# Mirrors prod's split-host layout. SETTING THIS IS A BREAKING CHANGE to the raw
# ALB hostname: modules/stack derives Host conditions from it, so every service
# rule stops matching http://app-stage-450914953.ap-south-1.elb.amazonaws.com the
# moment it is applied. Publish the DNS BEFORE the apply, not after.
variable "admin_domain_name" {
  description = "Dedicated hostname serving the admin CMS at its ROOT, separate from domain_name. Empty = the historical layout (CMS path-routed at /cms on whatever hostname reaches the ALB). Setting it switches the ALB to host-based routing and REQUIRES the admin image to be rebuilt with VITE_BASE_PATH=/ and VITE_API_URL (main.tf wires both as CodeBuild build args), plus this name in cors_allowed_origins — at its own root the CMS is a different origin from the api."
  type        = string
  default     = ""
}

variable "route53_zone_id" {
  description = "Route53 public hosted zone owning domain_name. Set = one-apply cutover; empty = Terraform outputs the validation record to publish by hand."
  type        = string
  default     = ""
}

variable "acm_certificate_arn" {
  description = "Use an existing ISSUED certificate in this region instead of requesting one."
  type        = string
  default     = ""
}

variable "cert_validated_externally" {
  description = "External-DNS path only: assert the requested certificate is ISSUED so the 443 listener can be built."
  type        = bool
  default     = false
}

variable "redirect_http_to_https" {
  description = "301 :80 -> :443 and move the service rules to HTTPS. Keep FALSE during a stage cutover — see the note above; existing staging app builds break the moment it is true."
  type        = bool
  default     = true
}

variable "enable_admin_static" {
  description = "Admin CMS as S3 + CloudFront static site (TAM-172)"
  type        = bool
  default     = true
}

variable "admin_on_fargate" {
  description = "Keep the nginx admin container + ALB rule; flip off after the static site is validated (TAM-172)"
  type        = bool
  default     = true
}

# --- TAM-175: deity-split feed ---------------------------------------------------

variable "clickhouse_analytics_database" {
  description = "Warehouse database holding `custom_user_properties` for THIS environment. Stage reads the `staging` database. Empty disables the sync. No default on purpose — a wrong value would mirror another environment's users into this database."
  type        = string
  default     = "staging"
}

variable "clickhouse_tenant" {
  description = "TAM-256 — the `saas_events.tenant` value this environment's rows carry, read by the admin status-performance report. Empty makes that report render an explicit \"not configured\" state; it never fails a boot or a health check."
  type        = string
  default     = "prabhuji"
}

variable "enable_deity_sync" {
  description = "Arm the scheduled deity-preference sync. Resources are created either way (DISABLED), so arming is a flip."
  type        = bool
  default     = false
}

variable "deity_sync_schedule_expression" {
  description = "How often the mirror refreshes. Hourly is ample — the feed itself re-orders twice a day on prod."
  type        = string
  default     = "rate(1 hour)"
}

variable "enable_deity_split" {
  description = "Master switch for the deity-split feed. FALSE serves the unpersonalised order regardless of what the mirror holds."
  type        = bool
  default     = false
}

# --- TAM-267: media upload optimizer -------------------------------------------
variable "enable_media_upload_optimizer" {
  description = "Compress CMS video/audio uploads (S3-triggered Lambda) before their URL is saved, and switch the api's presign to incoming/ (MEDIA_OPTIMIZE_UPLOADS). One switch for both halves. See modules/stack/media-optimizer.tf."
  type        = bool
  default     = false
}

# --- Docker Hub pull credentials (CI only) -------------------------------------
# The deploy pipeline's gates pull postgres:18-alpine, floci/floci and
# clickhouse-server from Docker Hub. Anonymous pulls share a per-IP quota with
# every other CodeBuild tenant on the same egress address and fail with HTTP 429
# `toomanyrequests`. Set both to move the build onto our own quota.
variable "dockerhub_username" {
  description = "Docker Hub account the deploy pipeline authenticates pulls as (empty = anonymous pulls)"
  type        = string
  default     = ""
}

variable "dockerhub_token" {
  description = "Docker Hub Personal Access Token (NOT the account password) — belongs in secrets.auto.tfvars, never terraform.tfvars"
  type        = string
  default     = ""
  sensitive   = true
}
