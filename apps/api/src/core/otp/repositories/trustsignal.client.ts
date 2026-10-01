import { loadEnv } from "@api/shared/config";
import { createModuleLogger } from "@api/shared/logs";
import {
  TRUSTSIGNAL_BODY,
  TRUSTSIGNAL_PATHS,
  TRUSTSIGNAL_QUERY,
  TRUSTSIGNAL_RESPONSE,
  TRUSTSIGNAL_TEMPLATE_VARS,
} from "./trustsignal.constants.js";

const log = createModuleLogger("otp:trustsignal-client");

/**
 * The ONLY place an HTTP call to TrustSignal is made. Sibling of
 * `Msg91Client`; same rules, same shape, one structural difference.
 *
 * ## The difference from MSG91 that matters
 *
 * MSG91's Flow API renders our DLT template server-side: we hand it variables.
 * TrustSignal has no rendering step — it takes the **finished SMS body** and a
 * DLT template id, and the operator checks the two against each other. So this
 * client composes the message text, which means the OTP is not a field in the
 * payload, it is a substring of `message`.
 *
 * That single fact drives the logging rule below. Under MSG91 you could log the
 * request body minus the OTP field; here there is no such thing as "the body
 * minus the OTP" — the body IS the OTP, wrapped in copy.
 *
 * ## Logging discipline (deliberate, do not relax)
 *
 * Method, path, status, latency, and TrustSignal's own transaction id — and
 * NOTHING else. In particular:
 *   - never the request body (it contains the live OTP);
 *   - never the URL (the api key rides in the query string);
 *   - never the recipient's number.
 */

/**
 * A TrustSignal call that did not deliver. Non-2xx, an unparseable body, a
 * `success:false`, AND a `success:true` carrying no results all land here, so a
 * caller cannot mistake a rejection for a sent message and fail open.
 */
export class TrustSignalApiError extends Error {
  readonly status: number;
  /** TrustSignal's own reason string. Safe to log: no PII, no credential. */
  readonly providerMessage: string | null;

  constructor(message: string, status: number, providerMessage: string | null) {
    super(message);
    this.name = "TrustSignalApiError";
    this.status = status;
    this.providerMessage = providerMessage;
  }
}

/** A destination, already split. The client renders TrustSignal's format. */
export interface TrustSignalRecipient {
  phoneCountryCode: string;
  phoneNumber: string;
}

export class TrustSignalClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly senderId: string;
  private readonly templateId: string;
  private readonly messageTemplate: string;
  private readonly route: string;
  private readonly timeoutMs: number;

  constructor() {
    const env = loadEnv();
    // `optionalSecret` in the schema — an unset value renders as "" and must
    // not reach a request. The `superRefine` requires these when
    // AUTH_OTP_PROVIDER=trustsignal, so reaching here with one missing means
    // this client was constructed under another provider; name the real
    // mistake rather than letting an empty credential hit the wire.
    this.baseUrl = env.TRUSTSIGNAL_BASE_URL.replace(/\/+$/, "");
    this.apiKey = required(env.TRUSTSIGNAL_API_KEY, "TRUSTSIGNAL_API_KEY");
    this.senderId = required(env.TRUSTSIGNAL_SENDER_ID, "TRUSTSIGNAL_SENDER_ID");
    this.templateId = required(env.TRUSTSIGNAL_TEMPLATE_ID, "TRUSTSIGNAL_TEMPLATE_ID");
    this.messageTemplate = required(
      env.TRUSTSIGNAL_MESSAGE_TEMPLATE,
      "TRUSTSIGNAL_MESSAGE_TEMPLATE"
    );
    this.route = env.TRUSTSIGNAL_ROUTE;
    this.timeoutMs = env.TRUSTSIGNAL_TIMEOUT_MS;
  }

  /**
   * Deliver `otp` to `to` through the configured DLT template.
   *
   * NEVER retried, structurally — same reasoning as `Msg91Client`: a retry is a
   * second SMS, so the user gets two codes for one request, we pay twice, and
   * on a timeout we cannot tell whether the first one went out. The user
   * pressing "resend" is the retry.
   *
   * Resolves only when TrustSignal accepted the message. Throws
   * `TrustSignalApiError` otherwise. Returns TrustSignal's transaction id for
   * correlation, or null.
   */
  async sendTemplatedOtp(
    to: TrustSignalRecipient,
    otp: string,
    options: { appSignatureHash?: string } = {}
  ): Promise<string | null> {
    const path = TRUSTSIGNAL_PATHS.send;
    // The credential lives in the query string. `url` is therefore a secret and
    // is used for `fetch` only — every log statement below carries `path`.
    const url = `${this.baseUrl}${path}?${TRUSTSIGNAL_QUERY.apiKey}=${encodeURIComponent(this.apiKey)}`;
    const startedAt = Date.now();

    const body = {
      [TRUSTSIGNAL_BODY.senderId]: this.senderId,
      [TRUSTSIGNAL_BODY.to]: [toTrustSignalMobile(to)],
      [TRUSTSIGNAL_BODY.route]: this.route,
      [TRUSTSIGNAL_BODY.message]: renderOtpMessage(
        this.messageTemplate,
        otp,
        options.appSignatureHash
      ),
      [TRUSTSIGNAL_BODY.templateId]: this.templateId,
    };

    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      log.error(
        {
          event: "trustsignal_transport_error",
          method: "POST",
          path,
          latency_ms: Date.now() - startedAt,
          err,
        },
        "TrustSignal request failed before a response was received"
      );
      throw err;
    }

    const latencyMs = Date.now() - startedAt;
    const raw = await response.text();
    const parsed = parseJsonObject(raw);
    const success = parsed ? parsed[TRUSTSIGNAL_RESPONSE.success] === true : false;
    const providerMessage = parsed ? readProviderMessage(parsed) : null;
    const transactionId = parsed ? readTransactionId(parsed) : null;

    log.info(
      {
        event: "trustsignal_response",
        method: "POST",
        path,
        status: response.status,
        latency_ms: latencyMs,
        trustsignal_success: success,
        // On success this is TrustSignal's confirmation string, on failure the
        // reason. Neither carries PII or the code.
        trustsignal_message: providerMessage,
        // The handle their support desk keys on.
        trustsignal_transaction_id: transactionId,
      },
      "TrustSignal response"
    );

    if (!response.ok) {
      throw new TrustSignalApiError(
        `TrustSignal POST ${path} failed: ${describe(response.status, providerMessage)}`,
        response.status,
        providerMessage
      );
    }

    if (!parsed) {
      // 2xx with a body we cannot read. We do not know whether the SMS went
      // out; claiming it did strands the user on a code screen. Fail closed.
      throw new TrustSignalApiError(
        `TrustSignal POST ${path} returned a non-JSON body`,
        response.status,
        null
      );
    }

    // The important one: a rejection is reported in the BODY. TrustSignal
    // answers HTTP 200 for its own validation failures on some paths and 400 on
    // others, so the status alone cannot be trusted either way — `success` is
    // the field that means the message was accepted.
    if (!success) {
      throw new TrustSignalApiError(
        `TrustSignal POST ${path} rejected the message: ${describe(response.status, providerMessage)}`,
        response.status,
        providerMessage
      );
    }

    // `success: true` with an empty `results` array means nothing was queued
    // for our recipient — accepted the request, sent no SMS. Also fail closed:
    // a user waiting on a code cannot tell the difference, but we can.
    if (!hasResults(parsed)) {
      throw new TrustSignalApiError(
        `TrustSignal POST ${path} reported success with no results`,
        response.status,
        providerMessage
      );
    }

    return transactionId;
  }
}

/**
 * TrustSignal's `/countrycode` format: full E.164 with the leading `+` —
 * `+91` + `9876543210` becomes `+919876543210`. Note this is the opposite of
 * `toMsg91Mobile`, which strips the `+`; the endpoint name is the hint.
 */
export function toTrustSignalMobile(to: TrustSignalRecipient): string {
  return `+${to.phoneCountryCode.replace(/^\+/, "")}${to.phoneNumber}`;
}

/**
 * Substitute the OTP and the SMS Retriever hash into the DLT-registered body.
 *
 * Exported for testing: this is the one piece of real logic in the file, and it
 * is the piece that silently loses messages when it is wrong — a body that no
 * longer matches its DLT registration is dropped by the operator AFTER
 * TrustSignal has answered `success: true`.
 *
 * A replacer FUNCTION, not a string, is deliberate: `String.replaceAll` treats
 * `$&`, `$'` and friends as substitution patterns in a string replacement, and
 * an OTP or a base64 hash must be inserted literally.
 *
 * With no hash (iOS, older Android), the `{#alp#}` slot collapses to empty and
 * the double space it leaves behind is squeezed out — DLT matches on the fixed
 * text around the variables, and a stray double space is a real mismatch risk
 * on every non-Android send.
 */
export function renderOtpMessage(
  template: string,
  otp: string,
  appSignatureHash?: string
): string {
  return template
    .replaceAll(TRUSTSIGNAL_TEMPLATE_VARS.otp, () => otp)
    .replaceAll(TRUSTSIGNAL_TEMPLATE_VARS.hash, () => appSignatureHash ?? "")
    .replace(/ {2,}/g, " ")
    .trim();
}

function parseJsonObject(raw: string): Record<string, unknown> | null {
  if (raw.length === 0) return null;
  try {
    const value: unknown = JSON.parse(raw);
    return typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** A non-empty string at `key`, or null. Narrows `unknown` without a cast. */
function readString(obj: Record<string, unknown>, key: string): string | null {
  const value = obj[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function readObjectArray(
  obj: Record<string, unknown>,
  key: string
): Record<string, unknown>[] {
  const value = obj[key];
  if (!Array.isArray(value)) return [];
  return value.filter(
    (entry): entry is Record<string, unknown> =>
      typeof entry === "object" && entry !== null && !Array.isArray(entry)
  );
}

/**
 * The reason string, wherever this response put it. A rejection carries
 * `errors[0].message` ("Invalid Template ID sent in the request"); a success
 * carries a top-level `message`.
 */
function readProviderMessage(obj: Record<string, unknown>): string | null {
  const [firstError] = readObjectArray(obj, TRUSTSIGNAL_RESPONSE.errors);
  return (
    (firstError ? readString(firstError, TRUSTSIGNAL_RESPONSE.message) : null) ??
    readString(obj, TRUSTSIGNAL_RESPONSE.message)
  );
}

/** The first result's transaction id — our correlation handle, or null. */
function readTransactionId(obj: Record<string, unknown>): string | null {
  const [firstResult] = readObjectArray(obj, TRUSTSIGNAL_RESPONSE.results);
  return firstResult ? readString(firstResult, TRUSTSIGNAL_RESPONSE.transactionId) : null;
}

function hasResults(obj: Record<string, unknown>): boolean {
  return readObjectArray(obj, TRUSTSIGNAL_RESPONSE.results).length > 0;
}

/** A short, bounded description for the thrown error's message. */
function describe(status: number, message: string | null): string {
  return message ? `${status} ${message.slice(0, 200)}` : `status ${status}`;
}

/** Narrow an optional env value, naming the variable in the failure. */
function required(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(
      `${name} is required to construct TrustSignalClient (set AUTH_OTP_PROVIDER=stub to run without TrustSignal credentials)`
    );
  }
  return value;
}
