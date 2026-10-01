# One JSON secret per service (TAM-172). Secrets Manager bills per secret, not per
# byte: the api alone carried ~26 feature-gated secrets per env at $0.40 each. The
# ECS agent resolves a JSON key straight out of one secret ("<arn>:KEY::"), so the
# task sees exactly the same env names as before. DATABASE_URL and the ClickHouse
# credentials stay individual: the migration one-off, the OTel sidecars and the
# CodeBuild pipeline read those by ARN.
#
# Step 1 (this file): the bundles exist and the task definitions read from them;
# the per-key secrets are left in place, unused, so a failed rollout can still roll
# back to a task definition that resolves. Step 2 (follow-up): delete the per-key
# secrets (30-day recovery window either way).

locals {
  api_bundle_values = merge({
    JWT_SECRET               = random_password.jwt.result
    AUTH_OTP_PEPPER          = var.auth_otp_pepper
    ANALYTICS_EVENTS_API_KEY = local.wire_external_events ? var.analytics_events_api_key : random_password.events_api_key.result
    }, local.wire_hyperdx_key ? { HYPERDX_API_KEY = var.hyperdx_api_key } : {},
    local.wire_devtools_token ? { DEVTOOLS_TOKEN = var.devtools_token } : {},
    local.wire_openai ? { OPENAI_API_KEY = var.openai_api_key } : {},
    local.wire_cashfree ? {
      CASHFREE_CLIENT_ID     = var.cashfree_client_id
      CASHFREE_CLIENT_SECRET = var.cashfree_client_secret
    } : {},
    local.wire_decentro ? {
      DECENTRO_CLIENT_ID     = var.decentro_client_id
      DECENTRO_CLIENT_SECRET = var.decentro_client_secret
      DECENTRO_CONSUMER_URN  = var.decentro_consumer_urn
      PAYMENT_CALLBACK_TOKEN = var.payment_callback_token
    } : {},
    local.wire_razorpay ? {
      RAZORPAY_BASE_URL       = var.razorpay_base_url
      RAZORPAY_KEY_ID         = var.razorpay_key_id
      RAZORPAY_KEY_SECRET     = var.razorpay_key_secret
      RAZORPAY_WEBHOOK_SECRET = var.razorpay_webhook_secret
    } : {},
    local.wire_msg91 ? {
      MSG91_AUTH_KEY    = var.msg91_auth_key
      MSG91_TEMPLATE_ID = var.msg91_template_id
    } : {},
    local.wire_test_numbers ? { TEST_OTP = var.test_otp } : {},
    local.wire_msg91_sender ? { MSG91_SENDER_ID = var.msg91_sender_id } : {},
    local.wire_trustsignal ? {
      TRUSTSIGNAL_API_KEY          = var.trustsignal_api_key
      TRUSTSIGNAL_SENDER_ID        = var.trustsignal_sender_id
      TRUSTSIGNAL_TEMPLATE_ID      = var.trustsignal_template_id
      TRUSTSIGNAL_MESSAGE_TEMPLATE = var.trustsignal_message_template
    } : {},
    local.wire_admin_bootstrap ? {
      ADMIN_BOOTSTRAP_EMAIL    = var.admin_bootstrap_email
      ADMIN_BOOTSTRAP_PASSWORD = var.admin_bootstrap_password
    } : {},
    local.wire_referral_lookup ? { REFERRAL_TENANT_KEY = var.referral_tenant_key } : {},
    local.wire_abtest ? { ABTEST_TENANT_KEY = var.abtest_tenant_key } : {},
    local.wire_modal_hook ? { MODAL_HOOK_KEY = var.modal_hook_key } : {},
    local.wire_ragflow ? { RAGFLOW_API_KEY = var.ragflow_api_key } : {},
  )

  events_bundle_values = merge({
    EVENTS_API_KEY = random_password.events_api_key.result
    }, local.wire_external_events ? { ANALYTICS_EVENTS_API_KEY = var.analytics_events_api_key } : {},
    local.wire_hyperdx_key ? { HYPERDX_API_KEY = var.hyperdx_api_key } : {},
  )
}

resource "aws_secretsmanager_secret" "api_env" {
  name = "${local.name_prefix}-api-env"
}

resource "aws_secretsmanager_secret_version" "api_env" {
  secret_id     = aws_secretsmanager_secret.api_env.id
  secret_string = jsonencode(local.api_bundle_values)
}

resource "aws_secretsmanager_secret" "events_env" {
  name = "${local.name_prefix}-events-env"
}

resource "aws_secretsmanager_secret_version" "events_env" {
  secret_id     = aws_secretsmanager_secret.events_env.id
  secret_string = jsonencode(local.events_bundle_values)
}
