import { loadEnv } from "@api/shared/config";
import { createModuleLogger } from "@api/shared/logs";
import {
  MSG91_BODY,
  MSG91_HEADERS,
  MSG91_PATHS,
  MSG91_RESPONSE,
  MSG91_SHORT_URL_OFF,
  MSG91_SUCCESS_TYPE,
} from "./msg91.constants.js";

const log = createModuleLogger("otp:msg91-client");

/**
 * The ONLY place an HTTP call to MSG91 is made.
 *
 * Native `fetch`, no HTTP-client dependency — the same reasoning as
 * `CashfreeClient`: everything a wrapper would give us (timeout, JSON, a retry
 * policy) is a few lines here, and this sits on the unauthenticated login path
 * where a supply-chain surprise is least welcome.
 *
 * Confined to `repositories/`, never reachable from a controller. What crosses
 * the seam is `Msg91SmsSender`, which speaks our domain types.
 *
 * ## Logging discipline (deliberate, do not relax)
 *
 * Method, path, status, latency, and MSG91's own request id — and NOTHING else.
 * Never the auth key, never the recipient's number, and above all **never the
 * OTP**: this client is handed a live credential that grants account access for
 * the next 15 minutes, and a log sink is exactly where it must not land.
 */

/**
 * An MSG91 call that did not deliver. Non-2xx, an unparseable body, AND a 200
 * carrying `{"type":"error"}` all land here, so a caller cannot mistake an
 * application-level rejection for a sent message and fail open.
 */
export class Msg91ApiError extends Error {
  readonly status: number;
  /** MSG91's `message` field — the failure reason. Safe to log: no PII. */
  readonly msg91Message: string | null;

  constructor(message: string, status: number, msg91Message: string | null) {
    super(message);
    this.name = "Msg91ApiError";
    this.status = status;
    this.msg91Message = msg91Message;
  }
}

/** A destination, already split. The client renders MSG91's `mobiles` format. */
export interface Msg91Recipient {
  phoneCountryCode: string;
  phoneNumber: string;
}

export class Msg91Client {
  private readonly baseUrl: string;
  private readonly authKey: string;
  private readonly templateId: string;
  private readonly senderId: string | undefined;
  private readonly otpVar: string;
  /**
   * TAM-123 — DLT template variable name for the Google SMS Retriever 11-char
   * hash. When the caller passes `appSignatureHash`, we render it into this
   * slot so the template's `\n\n<##>{{otphash}}` (or whatever the ops team
   * configured) suffixes the SMS body. Absent hash ⇒ we omit the field.
   */
  private readonly hashVar: string;
  private readonly timeoutMs: number;

  constructor() {
    const env = loadEnv();
    // `optionalSecret` in the schema — an unset value renders as "" and must not
    // reach a request. The `superRefine` requires these when
    // AUTH_OTP_PROVIDER=msg91, so reaching here with one missing means this
    // client was constructed under another provider; name the actual mistake.
    this.baseUrl = env.MSG91_BASE_URL.replace(/\/+$/, "");
    this.authKey = required(env.MSG91_AUTH_KEY, "MSG91_AUTH_KEY");
    this.templateId = required(env.MSG91_TEMPLATE_ID, "MSG91_TEMPLATE_ID");
    this.senderId = env.MSG91_SENDER_ID;
    this.otpVar = env.MSG91_OTP_VAR;
    this.hashVar = env.MSG91_HASH_VAR;
    this.timeoutMs = env.MSG91_TIMEOUT_MS;
  }

  /**
   * Deliver `otp` to `to` through the configured DLT template.
   *
   * NEVER retried, structurally. A retry is a second SMS: the user gets two
   * codes for one request, we pay twice, and on a timeout we cannot tell
   * whether the first one went out. `LocalOtpProvider` treats a throw here as
   * "not sent", invalidates the session, and lets the user press send again —
   * an explicit user action is a better retry than a silent one.
   *
   * Resolves only when MSG91 accepted the message. Throws `Msg91ApiError`
   * otherwise. Returns MSG91's request id for correlation, or null.
   */
  async sendTemplatedOtp(
    to: Msg91Recipient,
    otp: string,
    options: { appSignatureHash?: string } = {}
  ): Promise<string | null> {
    const path = MSG91_PATHS.flow;
    const url = `${this.baseUrl}${path}`;
    const startedAt = Date.now();

    // TAM-123 — the recipient object is one object per recipient, keyed by
    // MSG91's `mobiles` field and the DLT template's variable names. Add the
    // Google SMS Retriever hash ONLY when the caller provided it — omitting
    // the field for iOS/older clients keeps the DLT template rendering as
    // designed (empty suffix), never `{{otphash}}` unrendered.
    const recipient: Record<string, unknown> = {
      [MSG91_BODY.mobiles]: toMsg91Mobile(to),
      // The template's own variable name, e.g. `##otp##` -> { otp: "1234" }.
      [this.otpVar]: otp,
    };
    if (options.appSignatureHash) {
      // MSG91's Flow-API template pipeline runs the variable value through
      // exactly ONE URL-decode pass before rendering it into the SMS body, so
      // a raw `+` in the base64 hash arrives on-device as a space and the
      // Google SMS Retriever match fails (observed: sent "FA+9qCX9VSu", SMS
      // body "FA 9qCX9VSu"). Single URL-encoding is the correct pre-image:
      // `+` → `%2B` → decoded once by MSG91 → `+` in the delivered SMS. Same
      // round-trip works for `/`. MSG91's help doc suggests double-encoding
      // for a different (SMS API) code path; the Flow API used here only
      // decodes once — an empirically-verified round-trip on our template.
      recipient[this.hashVar] = encodeURIComponent(options.appSignatureHash);
    }

    const body: Record<string, unknown> = {
      [MSG91_BODY.templateId]: this.templateId,
      [MSG91_BODY.shortUrl]: MSG91_SHORT_URL_OFF,
      [MSG91_BODY.recipients]: [recipient],
      ...(this.senderId ? { [MSG91_BODY.sender]: this.senderId } : {}),
    };

    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          [MSG91_HEADERS.authKey]: this.authKey,
          "Content-Type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      log.error(
        {
          event: "msg91_transport_error",
          method: "POST",
          path,
          latency_ms: Date.now() - startedAt,
          err,
        },
        "MSG91 request failed before a response was received"
      );
      throw err;
    }

    const latencyMs = Date.now() - startedAt;
    const raw = await response.text();
    const parsed = parseJsonObject(raw);
    const type = parsed ? readString(parsed, MSG91_RESPONSE.type) : null;
    const message = parsed ? readString(parsed, MSG91_RESPONSE.message) : null;

    log.info(
      {
        event: "msg91_response",
        method: "POST",
        path,
        status: response.status,
        latency_ms: latencyMs,
        msg91_type: type,
        // On success this is MSG91's request id — the handle their support desk
        // keys on. On failure it is the reason string. Neither carries PII.
        msg91_message: message,
      },
      "MSG91 response"
    );

    if (!response.ok) {
      throw new Msg91ApiError(
        `MSG91 POST ${path} failed: ${describe(response.status, message)}`,
        response.status,
        message
      );
    }

    if (!parsed) {
      // 2xx with a body we cannot read. We do not know whether the SMS went
      // out; claiming it did strands the user on a code screen. Fail closed.
      throw new Msg91ApiError(
        `MSG91 POST ${path} returned a non-JSON body`,
        response.status,
        null
      );
    }

    // The important one: HTTP 200 + {"type":"error"} is MSG91's normal way of
    // reporting a rejected send. Status alone would read this as success.
    if (type !== MSG91_SUCCESS_TYPE) {
      throw new Msg91ApiError(
        `MSG91 POST ${path} rejected the message: ${describe(response.status, message)}`,
        response.status,
        message
      );
    }

    return message;
  }
}

/**
 * MSG91's `mobiles` format: country code and number concatenated, no `+`, no
 * separators — `+91` + `9876543210` becomes `919876543210`.
 */
export function toMsg91Mobile(to: Msg91Recipient): string {
  return `${to.phoneCountryCode.replace(/^\+/, "")}${to.phoneNumber}`;
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

/** A short, bounded description for the thrown error's message. */
function describe(status: number, message: string | null): string {
  return message ? `${status} ${message.slice(0, 200)}` : `status ${status}`;
}

/** Narrow an optional env value, naming the variable in the failure. */
function required(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(
      `${name} is required to construct Msg91Client (set AUTH_OTP_PROVIDER=stub to run without MSG91 credentials)`
    );
  }
  return value;
}
