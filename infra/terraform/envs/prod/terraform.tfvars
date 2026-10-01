# Prod floats on :latest — the cicd pipeline pushes a new :latest on every push
# to `main` and force-new-deployments the services; task defs never change. To
# pin prod temporarily (e.g. rollback), apply with :<commit-sha> instead.
api_image    = "661952267560.dkr.ecr.ap-south-1.amazonaws.com/app-prod-api-images:latest"
events_image = "661952267560.dkr.ecr.ap-south-1.amazonaws.com/app-prod-events-images:latest"
admin_image  = "661952267560.dkr.ecr.ap-south-1.amazonaws.com/app-prod-admin-images:latest"

# --- Live payment gateway (non-secret half) -------------------------------------
# Pinned HERE, not in secrets.auto.tfvars, deliberately: an apply run WITHOUT the
# gitignored secrets file then fails LOUDLY (the payment_guard precondition)
# instead of silently reverting prod to the in-memory stub — which auto-approves
# mandates and hands out Pro entitlements for free.
#
# cashfree_api_version is pinned here for the same reason it is not left to a
# code default: it selects which Cashfree endpoints exist. The adapter's PG
# Subscriptions paths are the 2025-01-01 surface; under the older 2023-08-01
# default POST /subscriptions/{id}/payments returns 404, which registers
# mandates happily and then fails every debit (prod, 2026-07-29).
# DECENTRO is the active gateway as of TAM-141. The Cashfree vars below stay
# populated on purpose: their secrets remain wired (harmless and unread while
# another provider is active), so reverting this one line is a complete rollback.
#
# WHY THIS FLIP IS SAFE NOW. The blocker was that one gateway is resolved globally
# at boot — nothing consults mandates.provider per row — so switching while live
# Cashfree mandates existed would have driven them through the Decentro adapter,
# whose status reads would be handed Cashfree subscription ids. The payment tables
# were emptied on 2026-07-30, so there is no mandate, subscription or ledger row
# left to mis-route. Verified zero rows in all three before applying.
#
# THIS DOES NOT MAKE THE SWITCH GENERALLY SAFE. The moment prod holds mandates
# again, flipping back or forward has the same hazard, and per-row provider routing
# (TAM-140) is still the real fix. Do not read this as precedent.
#
# ============================================================================
# TAM-151 (2026-08-06): RAZORPAY IS THE ACTIVE GATEWAY.
#
# This line was flipped razorpay -> decentro -> razorpay the same afternoon while
# verifying against production. That it costs one line and one rolling deploy,
# with no companion change in either direction, IS the property per-row routing
# was built to give.
#
# BOTH GATEWAYS' CREDENTIALS STAY WIRED, always. Prod holds 12 active + 1 paused
# DECENTRO mandates and (from the first window) a RAZORPAY row; each is charged,
# polled and revoked through the gateway named in its own `mandates.provider`,
# resolved lazily from the registry. Deleting either credential set strands that
# gateway's rows — which is the one way to actually break a subscriber here.
# ============================================================================
# The hazard described above is GONE — per-row routing shipped. Every mandate is
# charged, polled and revoked through the gateway named in its own
# `mandates.provider`, and apps/api resolves every gateway in its registry lazily.
# So prod's 12 active + 1 paused DECENTRO mandates keep running on Decentro with
# no second variable to declare it. Leave the decentro_* credentials in place —
# deleting them is what would break those subscribers.
#
# Rollback is this one line back to "decentro", with no companion step. Razorpay
# mandates registered in the meantime keep being debited through Razorpay,
# because that is what their own row says.
#
# WHAT IS PROVEN: registration -> approval -> activation -> ₹2 deposit settled
# with a real pay_xxx -> subscription trialing, verified end to end on stage
# against this same live Razorpay account (so `save_vpa` is confirmed enabled).
#
# WHAT IS NOT PROVEN, accepted deliberately on an explicit call: the RECURRING
# half. Stage runs with the billing scheduler off, so `notifyPreDebit` ->
# `presentDebit` -> settle has never executed anywhere. Prod's scheduler IS armed
# (enable_billing_scheduler = true, every 30 min), so the first Razorpay trial
# renewal — roughly 3 days out — is the first real run of that path, against a
# real customer. Watch `billing_cycle_complete`, `skippedOutsideWindow` and
# `notification_recovery_deferred`; the open question is the UPI debit window
# (P5 in docs/RAZORPAY-ROLLOUT.md — we ship pdnLeadHours {48,48}).
#
# ALSO OUTSTANDING: the prod webhook endpoint
# https://production-prabhuji-api.krutyug.ai/payment/callbacks/razorpay must be
# registered in the Razorpay dashboard with the same signing secret. Until it is,
# activation still works (it rides our own poll, not a callback) but settlement
# falls back to the 2-hour reconcile sweep.
# ============================================================================
payment_provider     = "razorpay"
payment_env          = "production"
cashfree_base_url    = "https://api.cashfree.com/pg"
cashfree_api_version = "2025-01-01"

# --- Decentro (non-secret half) --------------------------------------------------
#
# THE ACTIVE GATEWAY. Pinned here rather than in secrets.auto.tfvars for the same
# reason the Cashfree pair is: an apply run without the gitignored secrets file then
# fails LOUDLY on the payment_guard precondition instead of silently reverting prod to
# the in-memory stub.
#
# decentro_base_url and payment_env must AGREE — env.ts refuses to boot on a
# `staging.*` host under payment_env="production", and on this live host under
# payment_env="staging". That is deliberate: the two are easy to change
# independently, and the wrong pairing bills against the wrong account.
decentro_base_url   = "https://api.decentro.tech"
decentro_timeout_ms = 15000

# Clears the payment_guard precondition that blocks payment_provider="decentro".
# Set because the payment tables are EMPTY (verified 2026-07-30: zero mandates, zero
# subscriptions, zero transactions), so no existing mandate can be driven through the
# wrong adapter. Set this back to false the moment prod holds mandates again — the
# guard exists for the state this environment will be in tomorrow, not today.
allow_provider_switch_with_live_mandates = true

# 1440 = 24h, the ceiling Decentro's own `expiry_time` allows (1-1440) and the same
# bound env.ts enforces. Generous on purpose: a UPI mandate approval is a multi-step
# flow through the payer's bank app, and the previous 15-minute default expired links
# out from under users who paused midway.
payment_mandate_expiry_minutes = 1440

# THE header Decentro echoes the callback secret in, verified against a working
# Decentro integration. env.ts defaults to `x-prabhuji-callback-token`, which is wrong
# for this provider: TokenIpAuthenticator looks up exactly this header, so a mismatch
# rejects EVERY callback with a 401 — and from our side that is indistinguishable from
# a provider that never sends any. Since the asynchronous PDN depends on the callback
# to deliver presentation_sequence_id, getting this wrong would leave every cycle
# waiting on the status poll instead.
payment_callback_header = "x-api-callback-secret"

# --- Live OTP delivery (non-secret half) ----------------------------------------
# Same reasoning, and sharper: a silent fallback to the stub means the fixed OTP
# "1234" is accepted for EVERY phone number in production. Loud beats silent.
# The otp_guard in main.tf rejects "stub" here outright for that reason, and
# requires the selected provider's FULL credential set.
#
# TAM-162 (2026-08-21): armed on TrustSignal. Both providers' credentials stay
# wired, so switching either way is THIS LINE ALONE plus an apply (~3 min,
# mostly ECS draining) — no secret changes and no rebuild.
#
# Whichever is armed, WATCH THE FIRST LOGINS after a switch: both providers fail
# SILENTLY and differently. MSG91 drops template variables it does not
# recognise; TrustSignal sends the body on the wire and the operator drops a
# body that has drifted from its DLT registration. Either way the API has
# already answered "OTP sent", so a broken switch looks like nothing at all.
auth_otp_provider = "trustsignal"

# --- Recurring debits: ARMED at launch ------------------------------------------
# Pinned because the variable defaults false: a value living only on a command
# line would silently arm or disarm billing on the next apply.
#
# ARMED ON THE OWNER'S INSTRUCTION (2026-07-27), which is a deliberate departure
# from the staged rollout in docs/DEPLOYMENT.md ("apply disarmed -> dry run by
# hand -> flip"). Recorded here so the next reader knows it was a decision, not
# an oversight.
#
# envs/prod/main.tf feeds BOTH switches from this one variable
# (enable_billing_scheduler + enable_billing_scheduler_env), so this single flip
# both sets the EventBridge schedule ENABLED and sets ENABLE_BILLING_SCHEDULER on
# the api task. There is no second, independent brake left.
#
# What actually protects money once this is on:
#   * the (mandate_id, cycle_date) unique constraint — a cycle can be claimed
#     once, and it holds even when Redis is down. This is the real backstop;
#     the Redis lock is only an optimisation.
#   * NPCI execution windows — most 30-minute ticks are no-ops by design, so a
#     report of all zeros is normal, not a symptom.
#   * an empty database at launch — with no mandates yet, the first cycles have
#     nothing to present regardless.
#
# What it does NOT protect against: Cashfree ALSO charging on its own schedule.
# Our engine presents each debit explicitly (POST /subscriptions/{id}/payments).
# If the Cashfree subscription is configured to auto-charge, both sides debit the
# same cycle and our unique constraint cannot see the provider-initiated one.
# CONFIRM WITH CASHFREE that the subscription requires an explicit charge call.
# This is the same failure mode PHASE-NOTES flags as #EXPORT_CRITICAL for
# Decentro's `is_managed_by_decentro`; that constant is Decentro-only and does
# not apply here, but the question does.
enable_billing_scheduler = true

# --- Break-glass DB access: PERMANENTLY ON --------------------------------------
# Was `false` with the intent that an incident would pass `-var enable_bastion=true`
# per session. That does not survive contact with the deploy script: the variable
# defaults to false, `pnpm deploy:infra prod` passes no -var, so the next apply
# from any checkout DESTROYED the live host and silently dropped both SG rules
# (prod, 2026-07-29 — the bastion vanished mid-week without anyone tearing it
# down). Re-creating it also meant re-running the flag every single time.
#
# Pinned here on the owner's instruction (2026-07-30): the host is now a standing
# part of prod. This is the same reasoning that already pins stage in
# envs/stage/terraform.tfvars — a value that lives only on a command line is a
# value the next apply reverts.
#
# What is actually exposed by leaving it on: an EC2 host in a private subnet with
# NO ingress rule of any kind, no public IP and no key pair. The only way in is
# `aws ssm start-session`, which is IAM-authorized and CloudTrail-logged, so
# access is gated by IAM rather than by whether the host exists. Costs ~$3/month.
enable_bastion = true

# --- Custom domain + TLS --------------------------------------------------------
# SPLIT-HOST: the api and the CMS get separate hostnames, and the ALB routes by
# Host header (modules/stack derives this from admin_domain_name).
#
#   production-prabhuji-api.krutyug.ai  -> api at /*, events at /2/httpapi*
#   production-prabhuji-cms.krutyug.ai  -> admin CMS at /  (VITE_BASE_PATH=/, main.tf)
#
# DNS LIVES ON CLOUDFLARE, NOT ROUTE53. krutyug.ai's nameservers are
# garrett/grannbo.ns.cloudflare.com and the apex serves a live site — so
# route53_zone_id stays EMPTY and we use the external-DNS path in tls.tf:
# Terraform requests the certificate and OUTPUTS the validation records
# (`terraform output acm_validation_records`) for you to publish in Cloudflare
# by hand. It creates no DNS and never blocks on validation.
#
# TWO APPLIES, deliberately:
#   1. cert_validated_externally = false (below) -> everything comes up on
#      cleartext :80; Terraform requests the cert and prints the records.
#      Publish them in Cloudflare, plus the two host CNAMEs -> the ALB hostname.
#      *** Those records must be DNS-only (GREY cloud). Proxied/orange makes
#      Cloudflare terminate TLS itself, so the ALB never sees the ACM cert. ***
#   2. Confirm ISSUED, flip cert_validated_externally = true, apply again ->
#      the 443 listener is built and the service rules move onto it.
# Do not hand the CMS URL to editors until step 2 is done — until then admin
# JWTs and every edit ride plaintext.
#
# RENAMED 2026-07-27 from api/cms.krutyug.ai. Renaming is never DNS-only here:
# the certificate covers an exact name set (so a rename means a NEW cert and a
# fresh validation round), ALB rules match on Host (so the old names stop
# matching any rule and 404 rather than redirect), and the admin bundle has
# VITE_API_URL COMPILED IN via main.tf's build_args — so the admin image must be
# rebuilt, not just re-applied. Retire the old DNS records only after the new
# names are verified; deleting the old validation CNAMEs early breaks the old
# certificate's auto-renewal while it is still attached.
domain_name       = "production-prabhuji-api.krutyug.ai"
admin_domain_name = "production-prabhuji-cms.krutyug.ai"
route53_zone_id   = ""

# Verified ISSUED 2026-07-27 for the renamed hosts (both SANs SUCCESS, validated
# via the Cloudflare CNAMEs):
#   aws acm describe-certificate --region ap-south-1 \
#     --certificate-arn $(terraform output -raw acm_certificate_arn) \
#     --query Certificate.Status   # => "ISSUED"
#
# Apply #2 of the cutover: rebuilds the 443 listener on the new certificate and
# moves the three service rules onto it. redirect_http_to_https defaults true, so
# :80 becomes a 301 to :443.
#
# THIS FLAG MUST GO BACK TO false BEFORE ANY FUTURE HOSTNAME CHANGE — `wire_https`
# is variable-derived, so altering the certificate's name set while this is true
# tries to attach a PENDING_VALIDATION cert to the listener and fails the apply
# partway. Keep the two _hash validation CNAMEs in Cloudflare permanently; ACM
# re-checks them for annual auto-renewal, and deleting them fails the renewal
# silently, surfacing only when the certificate expires.
cert_validated_externally = true

# --- Browser origins allowed to call the api ------------------------------------
# The CMS origin IS REQUIRED here, unlike the old /cms layout. At its own root the
# CMS is a different origin from the api and every call it makes — including login
# — is cross-origin. Omit it, or leave a stale hostname here after a rename, and
# the CMS loads and then fails everything with an opaque browser CORS error and
# nothing at all in the server logs.
# localhost:4200 is for an editor running `pnpm nx serve admin` against prod.
cors_allowed_origins = ["https://production-prabhuji-cms.krutyug.ai", "http://localhost:4200"]

# --- Browser origins allowed to PUT to the media bucket -------------------------
# The api only presigns; the bytes go browser -> S3, so S3's own CORS decides. An
# origin missing here surfaces in the CMS as a bare "Network error during upload".
media_cors_allowed_origins = ["https://production-prabhuji-cms.krutyug.ai", "http://localhost:4200"]

# Test numbers (QA / store-review accounts). These skip SMS entirely and accept
# the fixed `test_otp` (set in secrets.auto.tfvars, gitignored). Bare national
# numbers, no country code, exact match. Empty disables the mechanism.
# The 9-series are the long-standing QA / store-review accounts (all Pro).
# The 8-series are the paywall A/B rigs (TAM-159): the bucket is the number's
# LAST TWO DIGITS, so 11/33/55/77 land one in each range of the BUCKETS map in
# apps/api/src/core/paywall/services/paywall.buckets.ts — membership / video-bleed
# / icon-grid / carousel respectively. Keep them non-Pro or they never see a paywall.
test_numbers = "9111111111,9222222222,9333333333,9444444444,8111111111,8333333333,8555555555,8777777777"

# --- The shared production platform: publish AND read ---------------------------
# One host serves both doors, path-routed:
#   POST /events/2/httpapi          <- server-side analytics (api only; mobile
#                                      still posts to this stack's own collector)
#   GET  /referral/v1/<id>/latest   <- attribution for the four UTM events
#
# TWO DIFFERENT CREDENTIALS, both in the gitignored secrets.auto.tfvars:
#   analytics_events_api_key -> a body api_key on the POST
#   referral_tenant_key      -> an x-tenant-key header on the GET
#
# ⚠️ analytics_events_url is INERT without analytics_events_api_key —
# modules/stack keys wire_external_events on both, so a url alone silently keeps
# publishing to this stack's own collector at production-prabhuji-api.krutyug.ai.
analytics_events_url = "https://api-monorepo-common-production.krutyug.ai/events/2/httpapi"

# The referral origin stays its OWN variable rather than being derived from the url
# above. They are the same host today, but they are independent doors with
# independent credentials, and while analytics_events_api_key is missing the
# publish target falls back to this stack while the read must not follow it.
referral_base_url = "https://api-monorepo-common-production.krutyug.ai"

# --- Chatbot (apps/api core/chat) — DELIBERATELY UNSET ON PROD ------------------
# Left empty so chat is off here. Not an oversight: the feature was built and
# verified against STAGING credentials only, and the prod experiment service and
# RAGFlow deployment are separate doors with their own keys that nobody has
# supplied yet. Empty means the routes exist and answer 403/503 while the rest
# of the service runs normally, which is the correct state for an unlaunched
# feature.
#
# To launch on prod, set the origin here and add the key to the gitignored
# secrets.auto.tfvars:
#   ragflow_base_url = "<prod ragflow origin>"
#   ragflow_api_key  -> secrets.auto.tfvars
#
# That is the whole list for CHAT ITSELF. Who gets chat is the A/B assignment:
# in-process (chat.buckets.ts) while the abtest pair below stays unset, the
# shared abtesting service once it is wired.

# --- A/B testing (apps/api, TAM-173) — DELIBERATELY UNSET ON PROD ---------------
# Unset = chat + paywall variants resolve in-process, byte-for-byte the
# pre-TAM-173 behaviour — verified safe on stage 2026-09-08. To move prod's
# traffic splits to the console: issue a PROD runtime key on the shared
# platform (`pnpm --filter @svc/abtesting issue-key prabhuji prod-api`,
# digest registered in its api-keys secret — a separate door from stage's),
# put it in secrets.auto.tfvars as `abtest_tenant_key`, uncomment the url,
# apply, and seed `chat.agent` + `paywall.layout` experiments on the console.
# The url INCLUDES the /abtesting route prefix; the api appends only /evaluate.
abtest_base_url = "https://api-monorepo-common-production.krutyug.ai/abtesting"

# --- Generalized in-app modals (apps/api core/modals, TAM-174) -------------------
# The shared secret the external audience-campaign service presents on POST
# /internal/modals/hooks to arm a modal for a user. No base_url half — the route
# lives on THIS stack. With it unset apps/api never registers the route (a 404),
# which is fine: arms are simply never delivered.
#
# To launch on prod: generate with `openssl rand -hex 32`, put it in the
# gitignored secrets.auto.tfvars as `modal_hook_key`, set the SAME value on the
# prod audience-campaign campaign messages' x-modal-hook-key header, and apply.
# Prod's own value — never stage's. Until both sides have it, the route stays
# unregistered.
# modal_hook_key -> secrets.auto.tfvars

# --- TAM-175: deity-split feed --------------------------------------------------
# Master switch. Read at the single point every personalised surface goes through,
# so false makes home, status AND the deity chip row all serve the unpersonalised
# order instantly — no per-surface flag to forget, no data operation required.
enable_deity_split = true

# Hourly warehouse -> Postgres mirror refresh. Without it the mirror is frozen at
# whatever the last run left. Idempotent and resumable: the watermark is
# MAX(warehouse_updated_at) of the mirror itself and the write is an upsert.
enable_deity_sync = true

# TAM-256 — the `tenant` value on every `saas_events` row, filtered on by the
# admin status-performance report. Originates as `tenantId` in the mobile app
# and is stored on each event. Single-tenant today, so it matches stage; it is
# stated rather than defaulted because it is the difference between this
# tenant's numbers and everyone's the day that changes.
clickhouse_tenant = "prabhuji"

# TAM-267 — upload optimizer. ON since stage sign-off (2026-09-25: a 15.5 MB
# status upload landed at 3.4 MB, a duplicate event was a no-op, an in-budget
# clip was copied). This one variable creates the Lambda + trigger AND switches
# the api's presign to incoming/ in the same apply — never set one without the
# other.
enable_media_upload_optimizer = true
