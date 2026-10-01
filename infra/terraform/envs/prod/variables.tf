variable "region" {
  description = "AWS region"
  type        = string
  default     = "ap-south-1"
}

variable "api_image" {
  description = "Full image ref for apps/api (e.g. <account>.dkr.ecr.<region>.amazonaws.com/app-prod-api-images:<tag>)"
  type        = string
}

variable "events_image" {
  description = "Full image ref for apps/events (e.g. <account>.dkr.ecr.<region>.amazonaws.com/app-prod-events-images:<tag>)"
  type        = string
}

# --- Auth OTP -------------------------------------------------------------------
# The api's phone-hash pepper (min 32 chars). Required — the api fails fast at
# boot without it, so a prod plan errors until it is supplied. Generate a fresh
# value (`openssl rand -base64 36`) into a gitignored secrets.auto.tfvars; do NOT
# reuse stage's. PERMANENT: it is mixed into every stored phone hash, so changing
# it invalidates every hash in prod's database.

variable "auth_otp_pepper" {
  description = "Phone-hash pepper for the api's OTP module — stored in Secrets Manager and injected into the api task"
  type        = string
  sensitive   = true
}

variable "openai_api_key" {
  description = "OpenAI API key for daily-horoscope generation — its presence switches generation on (no flag). Optional: unset => no secret, generation off. Supplied via secrets.auto.tfvars when prod is provisioned."
  type        = string
  default     = ""
  sensitive   = true
}

variable "admin_image" {
  description = "Full image ref for apps/admin — the admin CMS SPA (e.g. <account>.dkr.ecr.<region>.amazonaws.com/app-prod-admin-images:<tag>)"
  type        = string
}

# --- Media object store (admin CMS uploads; TAM-83) -----------------------------

variable "media_cors_allowed_origins" {
  description = "Web origins allowed to PUT directly to the prod media bucket. The admin panel is localhost-only this epic (Scope Decision 5), so this is the Vite dev server — an editor runs `pnpm nx serve admin` against the prod API and uploads from http://localhost:4200. Add a hosted admin origin here if D-D1 is ever reopened."
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

# --- ClickHouse Cloud credentials (warehouse migration) -------------------------
# Host is non-secret; password is sensitive. Supply at apply time via -var (or a
# gitignored *.auto.tfvars) — never commit the password. Empty = feature off.
# Prod has no CI/CD pipeline: these only store the creds in Secrets Manager so a
# human can run `events:migrate` (CLICKHOUSE_ENV=prod) against the prod warehouse.

variable "clickhouse_host" {
  description = "ClickHouse Cloud host (xxx.clickhouse.cloud) for manual prod warehouse migrations (events:migrate)"
  type        = string
  default     = ""
}

variable "clickhouse_password" {
  description = "ClickHouse Cloud service password — stored in Secrets Manager for manual prod warehouse migrations"
  type        = string
  default     = ""
  sensitive   = true
}

# --- Chatbot: RAGFlow + A/B experiment (apps/api core/chat) --------------------
# Both pairs are url-AND-key. The experiment service is what GRANTS chat, so
# leaving it unset turns the feature off for everyone in this env — which is the
# safe direction: a missing credential must never promote users into the
# treatment arm. Which agent serves which variant is a constant in
# apps/api/src/core/chat/services/chat.constants.ts, deliberately not config.
variable "ragflow_base_url" {
  description = "Origin of the RAGFlow deployment. Set in terraform.tfvars. Set with ragflow_api_key or not at all."
  type        = string
  default     = ""
}

variable "ragflow_api_key" {
  description = "Bearer token for ragflow_base_url. Lives in the gitignored secrets.auto.tfvars; stored as app-prod-ragflow-api-key. Empty = the chat endpoints 503."
  type        = string
  default     = ""
  sensitive   = true
}



# --- Observability: ClickStack (OpenTelemetry; opt-in) --------------------------
# Telemetry ships via a ClickStack OTel collector sidecar in each app task, which
# exports to ClickHouse Cloud (reusing clickhouse_host/user/password above). Supply
# via the gitignored secrets.auto.tfvars. enable_telemetry=false = feature off.
#
# Prod has no secrets.auto.tfvars yet, so telemetry stays OFF until you create one:
#
#   enable_telemetry               = true
#   hyperdx_api_key                = "<any non-empty placeholder; localhost hop is unauthenticated>"
#   clickhouse_host                = "<prod ClickHouse Cloud host>"
#   clickhouse_password            = "<prod ClickHouse Cloud password>"
#   clickstack_clickhouse_database = "otel_prod"   # optional; keeps prod OTel data out of stage's DB
#
# enable_telemetry=true WITHOUT ClickHouse creds (and without an external endpoint)
# fails at plan time — see the precondition in modules/stack/services.tf. That is
# deliberate: the app rejects it at boot, so the alternative is a crash-loop.

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

# --- Bootstrap admin (TAM-82) ---------------------------------------------------
# The first, and initially only, admin user. There is no default admin and no
# default password anywhere: with these unset the api creates no admin and the
# CMS at /cms, while it serves, cannot be logged into by anyone.
#
# PROD: this password IS the root of write access to live content. Generate it
# (`openssl rand -base64 24`), never choose it — /auth/login is not rate limited.
# Both live in secrets.auto.tfvars (gitignored); never commit them. Set both or
# neither: env.ts fails the boot on a half-set pair.

variable "admin_bootstrap_email" {
  description = "Email of the bootstrap admin — stored in Secrets Manager and injected into the api task. Empty => no admin, and no way to create one."
  type        = string
  default     = ""
}

variable "admin_bootstrap_password" {
  description = "Password of the bootstrap admin (min 16 chars) — stored in Secrets Manager and injected into the api task. Empty => no admin."
  type        = string
  default     = ""
  sensitive   = true
}

# --- Payments: Cashfree UPI Autopay (LIVE) --------------------------------------
# PROD MOVES REAL MONEY. payment_env is "production" and cashfree_base_url is the
# live host, both pinned in terraform.tfvars (committed, reviewable) rather than
# in the gitignored secrets file — so an apply run WITHOUT the secrets file fails
# loudly instead of silently reverting prod to the in-memory stub, which
# auto-approves mandates and hands out Pro entitlements for free.
#
# env.ts refuses PAYMENT_ENV=production against a sandbox.cashfree.com base and
# the inverse, so a swapped host fails the boot rather than quietly taking (or
# not taking) money.
#
# BOTH CREDENTIALS ARE REQUIRED TOGETHER: modules/stack's `wire_cashfree`
# creates the Cashfree secrets only when client_id AND client_secret are both
# non-empty, while env.ts requires base_url + client_id + client_secret. One of
# the pair creates NO secrets, the task def gets no CASHFREE_*, and every api
# task crash-loops — with no old tasks to keep serving on a first apply. The
# precondition in main.tf turns that into a plan-time failure.

variable "payment_provider" {
  description = "Active payment gateway: stub | decentro | cashfree. Prod pins \"cashfree\" in terraform.tfvars — the module default (stub) collects no money."
  type        = string
  default     = "stub"
}

variable "payment_env" {
  description = "Provider environment. Prod pins \"production\" (live money) in terraform.tfvars."
  type        = string
  default     = "staging"
}

variable "cashfree_base_url" {
  description = "Cashfree PG API base. Prod: https://api.cashfree.com/pg (pinned in terraform.tfvars). Empty when Cashfree is not active."
  type        = string
  default     = ""
}

variable "cashfree_api_version" {
  description = "Cashfree x-api-version. Pinned in terraform.tfvars — it selects which API surface exists, and the adapter's PG Subscriptions paths are the 2025-01-01 surface. Leaving it unset previously fell back to env.ts's 2023-08-01 default, where POST /subscriptions/{id}/payments does not exist: mandates registered fine and the first live debit 404'd."
  type        = string
  default     = "2025-01-01"
}

variable "cashfree_client_id" {
  description = "Cashfree PRODUCTION client id (dashboard -> Developers -> API Keys -> Production tab, NOT Sandbox). secrets.auto.tfvars; empty => secret not created."
  type        = string
  default     = ""
  sensitive   = true
}

variable "cashfree_client_secret" {
  description = "Cashfree PRODUCTION client secret. secrets.auto.tfvars; empty => secret not created."
  type        = string
  default     = ""
  sensitive   = true
}

# --- Decentro UPI Autopay -------------------------------------------------------
#
# Present so the credentials can live in AWS BEFORE the gateway is armed. They are
# inert while payment_provider="cashfree": the secrets exist, the task can read them,
# and nothing calls Decentro.
#
# Prod's Decentro callback endpoint is
# https://production-prabhuji-api.krutyug.ai/payment/callbacks/decentro — register it
# in the Decentro dashboard, and re-point it whenever domain_name changes or callbacks
# hit a dead host.

variable "decentro_base_url" {
  description = "Decentro PRODUCTION API base — https://api.decentro.tech. Pinned in terraform.tfvars. env.ts refuses a staging.* host while payment_env=production, so this and payment_env cannot disagree."
  type        = string
  default     = ""
}

variable "decentro_timeout_ms" {
  description = "Per-request Decentro timeout. Pinned in terraform.tfvars; env.ts caps it at 30000."
  type        = number
  default     = 10000
}

variable "decentro_client_id" {
  description = "Decentro PRODUCTION client id (dashboard -> Developers -> API Keys, Production not Staging). secrets.auto.tfvars; empty => no Decentro secrets created."
  type        = string
  default     = ""
  sensitive   = true
}

variable "decentro_client_secret" {
  description = "Decentro PRODUCTION client secret. secrets.auto.tfvars; never commit."
  type        = string
  default     = ""
  sensitive   = true
}

variable "decentro_consumer_urn" {
  description = "Decentro consumer URN for this account. Treated as a credential: it identifies the account on every mandate registration."
  type        = string
  default     = ""
  sensitive   = true
}

variable "payment_callback_token" {
  description = "Static shared secret Decentro sends on callbacks (min 32 chars). Decentro's callback auth, which Cashfree has no equivalent for. Replayable by design, which is why the handler never trusts a callback body."
  type        = string
  default     = ""
  sensitive   = true
}

variable "payment_mandate_expiry_minutes" {
  description = "Mandate approval link validity. Decentro's bound is 1-1440; 1440 gives the payer a full day."
  type        = number
  default     = 15
}

variable "payment_callback_header" {
  description = "Header Decentro echoes payment_callback_token in. Pinned in terraform.tfvars to x-api-callback-secret — verified against a working Decentro integration. env.ts's default is x-prabhuji-callback-token, which would 401 every callback silently."
  type        = string
  default     = ""
}

# --- Razorpay -------------------------------------------------------------------
#
# Present so the credentials can live in AWS BEFORE the gateway is armed, exactly
# like the Decentro set above. Inert while payment_provider is something else: the
# secrets exist, the task can read them, and nothing calls Razorpay.
#
# ALL FOUR OR NOTHING: modules/stack's `wire_razorpay` creates the RAZORPAY_*
# secrets only when base_url, key_id, key_secret and webhook_secret are all
# non-empty, and env.ts requires that same set. A partial set creates NO secrets,
# the task def gets no RAZORPAY_*, and every api task crash-loops — the
# payment_guard in main.tf turns that into a plan-time failure.
#
# Prod's Razorpay webhook endpoint is
# https://production-prabhuji-api.krutyug.ai/payment/callbacks/razorpay — register
# it in the dashboard with the SAME razorpay_webhook_secret, and re-point it
# whenever domain_name changes.

variable "razorpay_base_url" {
  description = "Razorpay API base — https://api.razorpay.com. Held with the credential set (apps/api reads it as an optionalSecret). secrets.auto.tfvars; empty => no Razorpay secrets created."
  type        = string
  default     = ""
  sensitive   = true
}

variable "razorpay_key_id" {
  description = "Razorpay LIVE key id (dashboard -> Account & Settings -> API Keys, Live mode NOT Test). secrets.auto.tfvars."
  type        = string
  default     = ""
  sensitive   = true
}

variable "razorpay_key_secret" {
  description = "Razorpay LIVE key secret — shown once at generation. secrets.auto.tfvars; never commit."
  type        = string
  default     = ""
  sensitive   = true
}

variable "razorpay_webhook_secret" {
  description = "Razorpay webhook signing secret. The app HMACs every callback body against it, so it must equal the value registered on the prod webhook — a mismatch rejects every delivery, and the symptom is silence, not an error we raise."
  type        = string
  default     = ""
  sensitive   = true
}

# --- Server-side analytics: the SHARED production collector ---------------------
# Prod's api publishes its payment/subscription/UTM events to the shared platform,
# NOT to this stack's own collector at production-prabhuji-api.krutyug.ai/2/httpapi.
#
# BOTH are required to take effect: modules/stack keys `wire_external_events` on
# url AND key, so a url with no key silently falls back to this stack's own
# collector. The mobile app is unaffected either way — it keeps posting to this
# stack's collector with that collector's own generated key.

variable "analytics_events_url" {
  description = "Full external collector URL for the api's server-side events — https://api-monorepo-common-production.krutyug.ai/events/2/httpapi. Empty = this stack's own collector. Requires analytics_events_api_key."
  type        = string
  default     = ""
}

variable "analytics_events_api_key" {
  description = "Body api_key for analytics_events_url — a FOREIGN value owned by the shared platform, and NOT the same credential as referral_tenant_key below. secrets.auto.tfvars; stored as app-prod-analytics-events-api-key."
  type        = string
  default     = ""
  sensitive   = true
}

# --- Attribution: the shared platform's referral service (TAM-160) ---------------
# The source for the four bk_*_utm_source_success events. The api reads
# <referral_base_url>/referral/v1/<userId>/latest per event; nothing is stored here.
#
# Same HOST as analytics_events_url above, different path and a different
# credential (an x-tenant-key header, not a body api_key). Still passed as its own
# variable rather than derived from that url: the two are independent doors, and
# until analytics_events_api_key is supplied the publish target falls back to this
# stack's own host while the referral read must still go to the shared platform.
#
# Set both or neither; either half empty leaves the four events off.

variable "referral_base_url" {
  description = "Origin of the shared platform's referral service — https://api-monorepo-common-production.krutyug.ai for prod. Any path is discarded. Empty => the four UTM events are off."
  type        = string
  default     = ""
}

variable "referral_tenant_key" {
  description = "x-tenant-key for referral_base_url (prod tenant key — distinct from stage's). Paired with a constant x-tenant-id header in code; the key alone is a 401. secrets.auto.tfvars; never commit."
  type        = string
  default     = ""
  sensitive   = true
}

# --- A/B testing: shared abtesting service (TAM-173) -----------------------------
# Consulted first for chat and paywall variants; unset, the api resolves them
# in-process (chat.buckets.ts / paywall.buckets.ts) — an upgrade switch, not a
# feature switch, so prod stays unset until a prod tenant key is issued on the
# shared platform. Set both or neither.

variable "abtest_base_url" {
  description = "Base URL of the shared platform's abtesting service including its /abtesting route prefix (prod host, not stage's). Empty => variants resolve in-process."
  type        = string
  default     = ""
}

variable "abtest_tenant_key" {
  description = "Runtime x-tenant-key for abtest_base_url (prod key — distinct from stage's; pnpm --filter @svc/abtesting issue-key prabhuji). secrets.auto.tfvars; never commit."
  type        = string
  default     = ""
  sensitive   = true
}


# --- Generalized in-app modals: audience-campaign webhook (TAM-174) --------------
# Shared secret the external audience-campaign service presents on POST
# /internal/modals/hooks. No url pairing — the route lives on THIS stack, so the
# key is the whole switch: empty leaves apps/api never registering the route (a
# 404) and arms are simply never delivered. Both sides must carry the same value.

variable "modal_hook_key" {
  description = "Shared secret the audience-campaign service presents on POST /internal/modals/hooks (TAM-174). Prod's own value — never stage's. Lives in the gitignored secrets.auto.tfvars; rides in the api secret bundle. Empty leaves the route unregistered."
  type        = string
  default     = ""
  sensitive   = true
}

# --- Retiring a gateway ----------------------------------------------------------
# payment_provider names only where NEW mandates are registered. Live mandates are
# charged, polled and revoked through the gateway in their OWN row, and apps/api
# resolves every gateway in its registry (lazily, on first use) — so a retired
# gateway keeps working with no second variable to declare it. What it does need is
# its credentials left in place: delete them and that gateway's rows start failing,
# logged at error and skipped, one row at a time.

variable "allow_provider_switch_with_live_mandates" {
  description = "ESCAPE HATCH for the payment_guard precondition that blocks payment_provider=\"decentro\". Default false, and it should stay false until per-row provider routing (TAM-140) ships or every live Cashfree mandate has been revoked and re-registered. Flipping it asserts you have verified no mandate will be driven through the wrong adapter — the failure mode is paying subscribers being marked expired, which is not visible until a user complains."
  type        = bool
  default     = false
}

# This account issues no webhook signing key, so callbacks are accepted
# unverified by design (the handler re-reads Cashfree's status API instead of
# trusting the body). Prod's callback endpoint is
# https://production-prabhuji-api.krutyug.ai/payment/callbacks/cashfree —
# re-point it in the Cashfree dashboard whenever domain_name changes, or
# callbacks hit a dead host.

# --- Recurring debits (apps/api core/payment) -----------------------------------
# Declared so arming is a variable flip, not a code change under pressure.
# Default false: the EventBridge schedule is created DISABLED and the api task
# carries ENABLE_BILLING_SCHEDULER=false.
#
# CONSEQUENCE AT LAUNCH: with this false a first payment works (the user approves
# a mandate and is debited once, synchronously) but NOTHING EVER RENEWS — no tick
# presents the monthly debit. Arm only after the read-only dry run in
# docs/DEPLOYMENT.md, against a gateway reconciled at least once.

variable "enable_billing_scheduler" {
  description = "Arm the recurring-debit scheduler: creates the EventBridge schedule ENABLED and sets ENABLE_BILLING_SCHEDULER=true on the api task def. false still creates the schedule, DISABLED. PROD MOVES REAL MONEY when armed — dry run first (docs/DEPLOYMENT.md)."
  type        = bool
  default     = false
}

# --- Break-glass DB access ------------------------------------------------------
# Prod's RDS is not publicly accessible and its SG admits 5432 only from the api
# task SG, so this bastion is the ONLY path from a laptop.
#
# The default stays false so the module is safe for a fresh env, but prod PINS IT
# TRUE in terraform.tfvars — see the long comment there. Do not "clean this up"
# back to a per-session -var: that is exactly what let a var-less apply destroy
# the host on 2026-07-29.

variable "enable_bastion" {
  description = "Provision the SSM-only bastion that lets a laptop port-forward to prod's RDS + Redis. Prod pins this TRUE in terraform.tfvars — the false default here is only the safe module-level baseline."
  type        = bool
  default     = false
}

# --- API CORS -------------------------------------------------------------------
# Distinct from media_cors_allowed_origins above (that one governs browser PUTs
# to S3). The hosted admin SPA needs NO entry: it is served from /cms on the same
# ALB and derives its base URL from window.location.origin, so its calls are
# same-origin and CORS never fires. This is for an editor running
# `pnpm nx serve admin` locally against prod. Empty = reflect any origin, which
# is wrong for an internet-facing ALB.

variable "cors_allowed_origins" {
  description = "Exact browser origins allowed to call the prod api. Never [\"*\"]."
  type        = list(string)
  default     = []
}

# --- Custom domain + TLS --------------------------------------------------------
# Set these in terraform.tfvars for the SECOND apply, once the hosted zone is
# delegated. Deliberately not part of the first apply: aws_acm_certificate_validation
# is the only resource here that blocks on the outside world, and burying it in a
# 30-60 minute greenfield apply means a delegation typo surfaces 45 minutes in.
# See modules/stack/tls.tf for the four modes.

variable "domain_name" {
  description = "Primary hostname the prod ALB serves — the API's own host (currently production-prabhuji-api.krutyug.ai). Empty = no TLS, cleartext :80 on the raw ALB hostname. Changing it is a cutover, not an edit: new ACM cert, and the admin image must be rebuilt because VITE_API_URL is compiled into the bundle."
  type        = string
  default     = ""
}

variable "domain_aliases" {
  description = "Extra hostnames on the same certificate + ALB, reaching the SAME service as domain_name. For the CMS's separate hostname use admin_domain_name."
  type        = list(string)
  default     = []
}

variable "admin_domain_name" {
  description = "Dedicated hostname serving the admin CMS at its root (currently production-prabhuji-cms.krutyug.ai). Automatically added to the certificate and DNS. Setting it switches the ALB to host-based routing AND requires the admin image to be built with VITE_BASE_PATH=/ + VITE_API_URL (wired in main.tf's cicd services block) plus https://<this name> in cors_allowed_origins."
  type        = string
  default     = ""
}

variable "route53_zone_id" {
  description = "Route53 public hosted zone owning domain_name. Set = one-apply cutover. Empty = Terraform outputs the validation record for you to publish at an external registrar (then set cert_validated_externally)."
  type        = string
  default     = ""
}

variable "acm_certificate_arn" {
  description = "Use an existing ISSUED certificate in this region instead of requesting one."
  type        = string
  default     = ""
}

variable "cert_validated_externally" {
  description = "External-DNS path only: assert the certificate Terraform requested is ISSUED, so the 443 listener can be built."
  type        = bool
  default     = false
}

variable "redirect_http_to_https" {
  description = "301 :80 -> :443 and move the service rules to HTTPS. true is correct for prod: it is greenfield, so there are no cleartext clients to migrate."
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
  description = "Warehouse database holding `custom_user_properties` for THIS environment. Prod reads the `production` database. Empty disables the sync. No default on purpose — a wrong value would mirror another environment's users into this database."
  type        = string
  default     = "production"
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
