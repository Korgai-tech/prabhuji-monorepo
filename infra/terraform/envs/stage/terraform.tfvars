# Stage floats on :latest — the cicd pipeline pushes a new :latest on every
# push to the `stage` branch and force-new-deployments the services; task defs
# never change. To pin stage temporarily (e.g. rollback), apply with
# :<commit-sha> instead.
api_image    = "815756778705.dkr.ecr.ap-south-1.amazonaws.com/app-stage-api-images:latest"
events_image = "815756778705.dkr.ecr.ap-south-1.amazonaws.com/app-stage-events-images:latest"
admin_image  = "815756778705.dkr.ecr.ap-south-1.amazonaws.com/app-stage-admin-images:latest"

# Break-glass SSM bastion (bastion.tf) — RDS 5432 + Redis 6379 port-forwarding.
# Deliberately ON for stage and pinned HERE rather than passed per-apply: the
# variable defaults to false, so `pnpm deploy:infra stage` — which passes no
# such var — would otherwise destroy a live bastion and silently drop both SG
# rules. Costs ~$3/month. Prod pins this true too, for the same reason.
enable_bastion = true

# --- Custom domain + TLS --------------------------------------------------------
# SPLIT-HOST, mirroring prod: the api and the CMS get separate hostnames and the
# ALB routes by Host header (modules/stack derives this from admin_domain_name).
#
#   stage-prabhuji-api.krutyug.ai  -> api at /*, events at /2/httpapi*
#   stage-prabhuji-cms.krutyug.ai  -> admin CMS at /  (VITE_BASE_PATH=/, main.tf)
#
# *** THIS RETIRES THE RAW ALB HOSTNAME. *** Host conditions appear on every
# service rule the moment this applies, so
# http://app-stage-450914953.ap-south-1.elb.amazonaws.com stops matching any rule
# and 404s. PUBLISH THE TWO HOST CNAMEs IN CLOUDFLARE BEFORE APPLYING, not after
# — they can point at the ALB hostname while the rules are still path-based, so
# doing it first makes the cutover seamless instead of an outage.
#
# DNS LIVES ON CLOUDFLARE, NOT ROUTE53 (krutyug.ai's nameservers are
# garrett/grannbo.ns.cloudflare.com), so route53_zone_id stays EMPTY and we use
# the external-DNS path in tls.tf: Terraform requests the certificate and OUTPUTS
# the validation records (`terraform output acm_validation_records`) for you to
# publish by hand. It creates no DNS and never blocks on validation.
#
# TWO APPLIES, deliberately:
#   1. cert_validated_externally = false (below) -> services move onto the new
#      hostnames on cleartext :80; Terraform requests the cert and prints the
#      records. Publish them in Cloudflare.
#      *** All four records must be DNS-only (GREY cloud). Proxied/orange makes
#      Cloudflare terminate TLS itself, so the ALB never sees the ACM cert. ***
#   2. Confirm ISSUED, flip cert_validated_externally = true, apply again ->
#      the 443 listener is built and the service rules move onto it.
#
# The CMS is unusable between step 1 and step 2: its bundle has
# VITE_API_URL=https://stage-prabhuji-api… compiled in (main.tf build_args) and
# that host has no HTTPS yet. Expected — same as prod's cutover.
domain_name       = "stage-prabhuji-api.krutyug.ai"
admin_domain_name = "stage-prabhuji-cms.krutyug.ai"
route53_zone_id   = ""

# Flip to true ONLY after ACM reports ISSUED:
#   aws acm describe-certificate --region ap-south-1 \
#     --certificate-arn $(terraform output -raw acm_certificate_arn) \
#     --query Certificate.Status   # => "ISSUED"
#
# Must go back to false BEFORE any future hostname change — `wire_https` is
# variable-derived, so altering the certificate's name set while this is true
# tries to attach a PENDING_VALIDATION cert to the listener and fails the apply
# partway. Keep the validation CNAMEs in Cloudflare permanently; ACM re-checks
# them for annual auto-renewal and a silent renewal failure only surfaces when
# the certificate expires.
#
# ISSUED 2026-08-03 for both names; validation CNAMEs are live in Cloudflare on
# grey cloud. Leave them there — they are what ACM re-checks for auto-renewal.
cert_validated_externally = true

# --- Browser origins allowed to call the api ------------------------------------
# The CMS origin IS REQUIRED here now: at its own root the CMS is a different
# origin from the api and every call it makes — including login — is cross-origin.
# Omit it and the CMS loads, then fails everything with an opaque browser CORS
# error and nothing at all in the server logs.
# localhost:4200 is for an editor running `pnpm nx serve admin` against stage.
cors_allowed_origins = ["https://stage-prabhuji-cms.krutyug.ai", "http://localhost:4200"]

# --- Browser origins allowed to PUT to the media bucket -------------------------
# The api only presigns the PUT — the bytes go browser -> S3, so S3's own CORS
# decides, and an origin missing here surfaces in the CMS as a bare "Network error
# during upload" (the preflight is rejected before any request the app can see).
# The raw ALB origin is dropped along with the hostname itself.
media_cors_allowed_origins = ["https://stage-prabhuji-cms.krutyug.ai", "http://localhost:4200"]

# --- OTP delivery: STUB ----------------------------------------------------------
# The stub accepts the fixed OTP "1234" for EVERY phone number — no SMS, no spend,
# and no login barrier on an environment holding a restore of prod's user table.
# Requires allow_stub_providers_in_production = true in main.tf (the image runs
# NODE_ENV=production on stage, and env.ts otherwise refuses to boot on a stub).
# Back to real SMS: set "msg91" or "trustsignal" (TAM-162). BOTH providers'
# credentials are wired in secrets.auto.tfvars and stay mounted whichever is
# selected, so a switch is THIS LINE ALONE plus an apply (~3 min, mostly ECS
# draining) — no secret changes and no rebuild.
#
# After any switch OFF stub, verify the first login on a real handset. Both
# providers fail SILENTLY and differently: MSG91 drops template variables it
# does not recognise, while TrustSignal sends the body on the wire and the
# operator drops a body that has drifted from its DLT registration. Either way
# the API has already answered "OTP sent", so a broken switch looks like
# nothing at all.
auth_otp_provider = "stub"

# --- Payment gateway: DECENTRO (non-secret half) ---------------------------------
# Mirrors prod's gateway so the stage flow exercises the same adapter. Pinned here
# rather than in secrets.auto.tfvars deliberately: an apply run WITHOUT the
# gitignored secrets file then fails LOUDLY on the payment_guard precondition in
# main.tf instead of silently reverting stage to the in-memory stub.
#
# REQUIRES ALL FOUR of decentro_client_id / decentro_client_secret /
# decentro_consumer_urn / payment_callback_token in secrets.auto.tfvars — env.ts
# lists exactly these plus DECENTRO_BASE_URL in PROVIDER_REQUIRED_KEYS and refuses
# to boot without them.
#
# Those four are PROD'S credentials, copied 2026-08-03 on explicit instruction.
# The staging host below is what keeps that from touching real money; see the
# header over the decentro_* variables in variables.tf before changing either.
#
# ============================================================================
# ⚠️  STAGE IS A REAL-MONEY ENVIRONMENT (set 2026-08-05, on explicit request)
# ============================================================================
# payment_env="production" + the LIVE Decentro host + PROD's Decentro
# credentials. Every mandate registered from stage is a REAL UPI Autopay
# consent on a REAL person's bank account, and each registration takes a REAL
# ₹2 initial deposit.
#
# Stage's database is a restore of prod's, so the user rows this bills against
# are real users, not test fixtures.
#
# Why it is set this way: prod's credentials only authenticate against prod's
# host. Pointed at staging.api.decentro.tech they returned
# `error_authentication_failed` on every call, so Decentro on stage could not
# work at all. Making it work meant moving the host, and env.ts refuses a live
# host under payment_env="staging" — so both had to move together.
#
# The safe alternative, if anyone revisits this: obtain genuine Decentro
# SANDBOX credentials (client_id / client_secret / consumer_urn) and set
# payment_env="staging" + decentro_base_url="https://staging.api.decentro.tech"
# alongside them. That exercises the same adapter with no money at risk.
#
# What still limits the blast radius — READ THIS BEFORE CHANGING EITHER:
#   - ENABLE_BILLING_SCHEDULER = false is now THE protection against recurring
#     debits. It is a hard kill switch: PaymentApi.runBillingCycle returns an
#     empty report before any provider write (payment.api.impl.ts:28), so no
#     debit can be presented. Only registration-time deposits are chargeable.
#     *** Flipping enable_billing_scheduler to true now bills REAL users on a
#     prod database restore, every 30 minutes. Do not arm it here. ***
#   - create_billing_scheduler = false does NOT protect anything today: the
#     EventBridge schedule `app-stage-billing` still EXISTS in AWS and is
#     ENABLED (rate(30 minutes)) as untracked drift — the resource was never
#     destroyed after the flag was set false. It fires on schedule and no-ops
#     purely because of the kill switch above. A `terraform apply` without
#     -target will delete it and restore the intended state.
#   - Razorpay is LIVE here too, as of the TAM-151 cutover below. It is not a
#     safer gateway than Decentro on this env — it is the same real money
#     through a different rail.
#
# TAM-151: Razorpay takes NEW registrations from here on. This does NOT move
# anything that already exists — every live mandate is charged, polled and
# revoked through the gateway named in its own `mandates.provider`, so the
# existing Decentro subscribers stay on Decentro and keep needing the Decentro
# credentials below. Rolling back is this one line, with no companion step.
#
# ⚠️  payment_env="production" means the key MUST be `rzp_live_*` — env.ts
# refuses an `rzp_test_` key under production (env.ts:582). So every Razorpay
# registration from stage raises a REAL UPI Autopay consent and takes a REAL ₹2
# deposit, against a database of real prod users. The billing kill switch
# (ENABLE_BILLING_SCHEDULER=false) is the only thing stopping the recurring
# debits that follow; it does NOT stop the registration deposit.
# ============================================================================
# Discovery-feed rotation. STAGE RUNS AT 5 MINUTES PERMANENTLY, by decision —
# a refresh you have to wait until midnight for is a refresh nobody tests. Prod
# is 12h (00:00 + 12:00 IST) and gets there by NOT passing this at all, so the
# schedule that matters lives in one place: the module default.
#
# Two ways stage therefore does NOT behave like prod, both consequences of the
# interval and neither a bug:
#   - the new-item boost window is NEW_BOOST_CYCLES (4) refreshes, so a fresh
#     upload holds a guaranteed top slot for 20 MINUTES here versus ~2 days on
#     prod. "The new ringtone dropped off the top" is expected on stage.
#   - bk_feed_refresh_triggered fires once per refresh — 288/day here against
#     2/day on prod. Filter on environment before reading refresh counts out of
#     the staging warehouse.
#
# Applying this is a task-definition change, so it rolls the api service.
feed_refresh_interval_ms = 300000

payment_provider = "razorpay"
payment_env      = "production"

decentro_base_url   = "https://api.decentro.tech"
decentro_timeout_ms = 15000

# THE header Decentro echoes the callback secret in. env.ts defaults to
# `x-prabhuji-callback-token`, which is wrong for this provider: TokenIpAuthenticator
# looks up exactly this header, so a mismatch rejects EVERY callback with a 401 —
# indistinguishable from a provider that never sends any.
payment_callback_header = "x-api-callback-secret"

# 1440 = 24h, the ceiling Decentro's `expiry_time` allows and the bound env.ts
# enforces. A UPI mandate approval is a multi-step flow through the payer's bank
# app; the 15-minute default expires links out from under users who pause midway.
payment_mandate_expiry_minutes = 1440

# --- Recurring-debit scheduler: NOT CREATED on stage ----------------------------
# false = no EventBridge schedule and no scheduler IAM role exist here at all,
# rather than the usual created-but-DISABLED schedule.
#
# Why the blunter switch: stage now runs payment_provider="decentro" with PROD's
# credentials (below), so a created schedule would be one variable flip away from
# presenting real debits — and stage's database is a copy of prod's, so the rows
# it would bill against are real users. Removing the schedule means arming
# billing on stage takes a code change and a review, not a tfvars edit.
#
# To exercise the billing cycle on stage again: move payment_provider back to
# stub (or a genuine Decentro sandbox pair) FIRST, then set this true.
create_billing_scheduler = false

# The arming switch, kept at false and kept wired. Inert while the schedule is
# uncreated; this is what you flip (together with a successful read-only dry run,
# docs/DEPLOYMENT.md) after re-creating it.
enable_billing_scheduler = false

# --- Server-side analytics: the SHARED staging collector ------------------------
# The api's payment/subscription events go to the common staging events service,
# NOT to this stack's own collector at stage-prabhuji-api.krutyug.ai/2/httpapi.
# Its key is a foreign value and lives in secrets.auto.tfvars
# (analytics_events_api_key) — set both or neither: with the key missing the api
# silently falls back to this stack's own collector.
#
# Only the api moves. The mobile app still posts to this stack's collector
# (apps/mobile/env/staging.json), which keeps its own generated key.
analytics_events_url = "https://api-monorepo-common-staging.krutyug.ai/events/2/httpapi"

# The SAME host also serves the referral service, which is where the four
# bk_*_utm_source_success events read a user's campaign from
# (<origin>/referral/v1/<userId>/latest). It is still passed as its OWN variable
# rather than derived from the url above: on PROD the api posts events to its own
# stack collector while attribution stays on the shared platform, so a derived
# origin would read every prod user as "no campaign".
#
# That door takes an x-tenant-key header rather than a body api_key; the key lives
# in secrets.auto.tfvars as `referral_tenant_key`. Either half unset = no UTM.
referral_base_url = "https://api-monorepo-common-staging.krutyug.ai"

# --- A/B testing (apps/api, TAM-173) ---------------------------------------------
# The shared platform's abtesting service, consulted FIRST for the chat and
# paywall variants. Unset (or on any failure) the api falls back to the
# in-process bucket maps (chat.buckets.ts / paywall.buckets.ts), so wiring this
# on changes nobody until experiments are seeded on the console.
#
# To turn it on: issue a runtime key on the shared platform
# (`pnpm --filter @svc/abtesting issue-key prabhuji`), put it in the gitignored
# secrets.auto.tfvars as `abtest_tenant_key`, then uncomment the base url —
# both halves or neither, same rule as the referral pair above. The url
# INCLUDES the /abtesting route prefix; the api appends only /evaluate.
abtest_base_url = "https://api-monorepo-common-staging.krutyug.ai/abtesting"

# --- Generalized in-app modals (apps/api core/modals, TAM-174) -------------------
# The shared secret the external audience-campaign service presents on POST
# /internal/modals/hooks to arm a modal for a user. No base_url half — the
# route lives on THIS stack. Left commented out until the campaigns exist:
# with it unset, apps/api never registers the route (a 404), which is fine —
# arms are simply never delivered.
#
# TAM-174 — generate with `openssl rand -hex 32` and set the same value on the
# audience-campaign campaign messages' x-modal-hook-key header. Until both sides
# have it, the route stays unregistered and arms are simply never delivered.
# modal_hook_key = "<32-byte hex>"

# --- Chatbot (apps/api core/chat) -----------------------------------------------
# RAGFlow answers the question; WHO is allowed to ask is the A/B assignment —
# the abtesting service above when wired, else in-process
# (apps/api/src/core/chat/services/chat.buckets.ts, a salted hash of the user
# id into a reviewed range map).
#
# `ragflow_api_key` lives in the gitignored secrets.auto.tfvars. With either
# half of that pair unset the chat endpoints 503 while the rest of the service
# runs normally.
#
# Traffic split is a reviewed code change and a deploy while the abtest pair is
# unset, a console edit once it is wired. Which agent serves which variant is
# NEITHER — it stays in chat.constants.ts, because the agent id is sent to the
# provider verbatim.
ragflow_base_url = "https://ragflow-f7pq.onrender.com"

# --- Telemetry: OFF on stage ----------------------------------------------------
# false removes the ClickStack OTel collector sidecar from both the api and events
# tasks, drops ENABLE_TELEMETRY / OTEL_EXPORTER_OTLP_ENDPOINT from their task defs,
# and un-creates the hyperdx-api-key secret. Task size halves back to 512/1024 —
# the sidecar is what forced 1024/2048.
#
# Stage and prod share ONE ClickHouse Cloud service, so stage traces were landing
# in the same instance as prod's (separated only by the otel_stage database). Off
# is the cheaper and cleaner default until stage telemetry is actually wanted.
#
# NOTE: this must be the ONLY assignment of enable_telemetry. *.auto.tfvars is
# loaded AFTER terraform.tfvars and overrides it, so a leftover
# `enable_telemetry = true` in secrets.auto.tfvars would silently win over this
# line. It was removed from there when this was added.
#
# clickhouse_host / clickhouse_password stay set in secrets.auto.tfvars — they are
# also the CI/CD `events:migrate` step's credentials and are unrelated to the
# collector.
enable_telemetry = false

# Test numbers (QA / store-review accounts). These skip SMS entirely and accept
# the fixed `test_otp` (set in secrets.auto.tfvars, gitignored). Bare national
# numbers, no country code, exact match. Empty disables the mechanism.
test_numbers = "9111111111,9222222222,9333333333,9444444444"

# TAM-175 — the warehouse database holding `custom_user_properties` for THIS env.
# Stage reads `staging`; prod reads `production`. No default anywhere on purpose:
# a wrong value would mirror another environment's users into this database.
clickhouse_analytics_database = "staging"

# TAM-256 — the `tenant` column every row of `saas_events` carries, filtered on
# by the admin status-performance report. The value originates in the mobile
# app (`apps/mobile/env/prabhujiSecrets.json` -> `tenantId`), travels with each
# event to the collector, and is stored on the row. Stated here rather than left
# to the variable default so the report's one required value is visible in the
# same file as the database it pairs with: unset, the report renders "not
# configured" and never errors, which is easy to miss.
clickhouse_tenant = "prabhuji"

# TAM-175 master switch. ON for stage: home, status and the deity chip row lead
# with the user's gods for anyone the mirror knows about. Everyone else — and
# everyone, if this is flipped back to false — gets the unpersonalised order.
enable_deity_split = true

# Arm the hourly warehouse -> Postgres mirror refresh. Without this the mirror is
# whatever the last manual run left, so preferences never update. Safe at any
# cadence: the watermark is MAX(warehouse_updated_at) of the mirror itself and
# the write is an upsert, so a re-run is a no-op and an interrupted run resumes.
enable_deity_sync = true

# TAM-267 — compress CMS video/audio uploads before their URL is saved. ON for
# stage first: the api presigns uploads to incoming/<final key> and the
# media-optimizer Lambda writes the final key (compressed, or the original when
# compression does not pay). Prod stays off until a real status/paywall upload
# has been verified here. Needs the function bundle + ffmpeg layer built before
# plan — `pnpm deploy:infra stage` does both.
enable_media_upload_optimizer = true
