import { loadEnv } from "@api/shared/config";
import { createModuleLogger } from "@api/shared/logs";

const log = createModuleLogger("analytics:referral-conversions");

/** A rejected report's body is logged, truncated like the referral lookup's. */
const LOGGED_BODY_MAX_CHARS = 500;

/**
 * The shared platform's referral service — the same host and the same
 * `REFERRAL_TENANT_KEY` as the lookup in `utm.ts` (`/referral/v1/<userId>/latest`).
 * One service, one credential: a deployment cannot have one half without the other.
 */
const CONVERSIONS_ROUTE = "/referral/v1/conversions";

/**
 * Conversions are reported only when NODE_ENV is "production". Development and
 * test are always silent.
 *
 * NOTE: the api image runs NODE_ENV=production on stage as well as prod (see
 * `env.ts`), so a stage with `REFERRAL_BASE_URL` + `REFERRAL_TENANT_KEY` set
 * reports too — the referral config is the only thing that keeps it silent. A
 * conversion is a permanent record on a shared ad account, and cannot be deleted.
 */
const REPORTING_NODE_ENV = "production";

const PAISE_PER_RUPEE = 100;

/**
 * Meta's STANDARD event names, in the Pixel/CAPI PascalCase spelling. Meta
 * dedupes an app event against a server event only when the name AND the event
 * id both match, so a different spelling does not fail — it double-counts.
 */
export const META_STANDARD_EVENT = {
  COMPLETE_REGISTRATION: "CompleteRegistration",
  START_TRIAL: "StartTrial",
  PURCHASE: "Purchase",
} as const;

/**
 * This app's own names for the same moments, exactly cricsignal's three. Sent
 * BESIDE the standard report, never instead.
 */
export const CUSTOM_CONVERSION_EVENT = {
  REGISTRATION_SUCCESSFUL: "registration_successful",
  TRIAL_SUCCESS: "trial_success",
  SUBSCRIPTION_RENEWED: "subscription_renewed",
} as const;

export interface PaymentConversionInput {
  /**
   * The registration deposit — cricsignal's signup charge. `true` reports the
   * trial AND the subscription (`StartTrial`); `false` is a renewal (`Purchase`).
   */
  isFirstCharge: boolean;
  userId: string;
  /** `transactions.id` — sent as `event_id` and as `order_id`. */
  transactionId: string;
  amountPaise: number;
  currency: string;
  /** E.164. Optional in the contract; omitted, never sent empty. */
  phone?: string | null;
}

interface ConversionEndpoint {
  url: string;
  tenantKey: string;
  timeoutMs: number;
}

function resolveEndpoint(): ConversionEndpoint | null {
  const env = loadEnv();
  if (env.NODE_ENV !== REPORTING_NODE_ENV) return null;
  if (!env.REFERRAL_BASE_URL || !env.REFERRAL_TENANT_KEY) return null;
  return {
    url: new URL(CONVERSIONS_ROUTE, env.REFERRAL_BASE_URL).toString(),
    tenantKey: env.REFERRAL_TENANT_KEY,
    timeoutMs: env.ANALYTICS_EVENTS_TIMEOUT_MS,
  };
}

/**
 * Whether a report would actually be sent. Lets a caller skip work that only
 * matters when it is — the payment path's phone lookup — on stage and local.
 */
export function isConversionReportingEnabled(): boolean {
  return resolveEndpoint() !== null;
}

/**
 * The account was created: the standard `registration` report and the custom
 * `registration_successful` beside it. No `event_id`, `order_id` or `value` —
 * a registration is not a purchase, and a zero would report a ₹0 sale.
 */
export async function reportRegistrationConversion(input: {
  userId: string;
  phone?: string | null;
}): Promise<void> {
  const phone = input.phone ? { phone: input.phone } : {};
  await sendAll(
    [
      {
        user_id: input.userId,
        type: "registration",
        fb_standard_event: META_STANDARD_EVENT.COMPLETE_REGISTRATION,
        ...phone,
      },
      {
        user_id: input.userId,
        type: "custom",
        event_name: CUSTOM_CONVERSION_EVENT.REGISTRATION_SUCCESSFUL,
        ...phone,
      },
    ],
    { user_id: input.userId, conversion: "registration" }
  );
}

/**
 * A payment settled: the standard `subscription` report and its custom twin,
 * as cricsignal sends them, each carrying `event_id` = the transaction's id.
 * For the registration deposit that id is the `paymentReferenceId` the mandate
 * endpoints publish, so a client event keyed on it names the same payment.
 *
 * `value` is RUPEES — every amount in this estate is paise, the endpoint takes
 * rupees. Not rounded: rounding would misstate revenue.
 */
export async function reportPaymentConversion(input: PaymentConversionInput): Promise<void> {
  const phone = input.phone ? { phone: input.phone } : {};
  const money = {
    order_id: input.transactionId,
    value: input.amountPaise / PAISE_PER_RUPEE,
    currency: input.currency,
  };
  await sendAll(
    [
      {
        user_id: input.userId,
        type: "subscription",
        fb_standard_event: input.isFirstCharge
          ? META_STANDARD_EVENT.START_TRIAL
          : META_STANDARD_EVENT.PURCHASE,
        // `true` reports the trial AND the subscription; `false` is a renewal.
        subscription: input.isFirstCharge,
        event_id: input.transactionId,
        ...money,
        ...phone,
      },
      {
        user_id: input.userId,
        type: "custom",
        event_name: input.isFirstCharge
          ? CUSTOM_CONVERSION_EVENT.TRIAL_SUCCESS
          : CUSTOM_CONVERSION_EVENT.SUBSCRIPTION_RENEWED,
        event_id: input.transactionId,
        ...money,
        ...phone,
      },
    ],
    { user_id: input.userId, is_first_charge: input.isFirstCharge, event_id: input.transactionId }
  );
}

/**
 * Both reports of a pair, or none. Each is attempted independently — one
 * failing must not suppress the other — and neither can throw.
 */
async function sendAll(
  bodies: Array<Record<string, unknown>>,
  context: Record<string, unknown>
): Promise<void> {
  const env = loadEnv();
  if (env.NODE_ENV !== REPORTING_NODE_ENV) {
    log.debug(
      { ...context, node_env: env.NODE_ENV },
      "referral conversion skipped outside production"
    );
    return;
  }
  const endpoint = resolveEndpoint();
  if (!endpoint) {
    // In production this is a deploy defect, not a choice — every conversion is lost
    // until it is fixed — so it warns. The key is reported as a boolean, never
    // its value.
    log.warn(
      {
        ...context,
        hasBaseUrl: Boolean(env.REFERRAL_BASE_URL),
        hasTenantKey: Boolean(env.REFERRAL_TENANT_KEY),
      },
      "referral conversion not configured in production; skipped"
    );
    return;
  }
  await Promise.all(bodies.map((body) => post(endpoint, body)));
}

/**
 * ONE attempt, never retried. A conversion is an attribution record and the
 * endpoint is not proven to deduplicate, so a replay could count one payment
 * twice; a lost report is recoverable by reconciliation. Failures are logged
 * and swallowed: a conversion must never fail the login or payment behind it.
 *
 * The log context carries no phone and no value — PII and revenue have no
 * place in a transport log whose job is to say whether the call landed.
 */
async function post(endpoint: ConversionEndpoint, body: Record<string, unknown>): Promise<void> {
  const context = {
    user_id: body.user_id,
    type: body.type,
    event_name: body.event_name ?? body.fb_standard_event,
    event_id: body.event_id,
  };
  const abortController = new AbortController();
  const timeoutHandle = setTimeout(() => abortController.abort(), endpoint.timeoutMs);
  try {
    const response = await fetch(endpoint.url, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        // Constant, as in the lookup and the ab-testing client: this
        // deployment is one tenant, and the key proves it.
        "x-tenant-id": "prabhuji",
        "x-tenant-key": endpoint.tenantKey,
      },
      body: JSON.stringify(body),
      signal: abortController.signal,
    });
    if (response.status >= 400) {
      const text = await response.text();
      log.warn(
        { ...context, status: response.status, body: text.slice(0, LOGGED_BODY_MAX_CHARS) },
        "referral conversion rejected"
      );
      return;
    }
    log.info({ ...context, status: response.status }, "referral conversion reported");
  } catch (err) {
    log.warn({ err, ...context }, "referral conversion errored");
  } finally {
    clearTimeout(timeoutHandle);
  }
}
