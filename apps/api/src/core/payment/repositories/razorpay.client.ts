import { loadEnv } from "@api/shared/config";
import { PAYMENT_STAGE } from "../types.js";
import { createModuleLogger } from "@api/shared/logs";
import { redactedJson, redactPayload } from "@api/shared/logs";
import { RAZORPAY_REQUEST_ID_HEADER } from "./razorpay.constants.js";
import {
  ProviderApiLogRepository,
  type ProviderApiLogWriter,
} from "./provider-api-log.repository.js";

const log = createModuleLogger("payment:razorpay-client");

/**
 * The ONLY place an HTTP call to Razorpay is made.
 *
 * Native `fetch`, no HTTP-client dependency and no `razorpay` npm SDK — the same
 * reasoning as `DecentroClient` and `CashfreeClient`: the payments path is the
 * worst possible place to take a supply-chain surprise, and everything a wrapper
 * would give us here (timeouts, JSON, a retry policy) is fifty lines below, with
 * a retry policy we would otherwise have to fight a library's defaults to get
 * right.
 *
 * Confined to `repositories/`, never reachable from `services/`. What crosses the
 * seam is `RazorpayMandateProvider`, which speaks our domain types.
 *
 * ## Recording discipline (deliberate, do not relax)
 *
 * Every exchange is recorded TWICE, to two places with different lifetimes: a
 * structured log line for live tailing, and a row in `payment_provider_api_logs`
 * that outlives log retention. Both carry the full request and response body,
 * REDACTED first (`shared/logs/redact.ts`) — which is what makes recording them
 * safe and is not optional: a Razorpay body carries the payer's VPA, email and
 * phone, and the `Authorization` header carries our key secret.
 *
 * There are exactly THREE write points, and all three matter:
 *   1. a completed exchange (any status, including a rejection — the rejected
 *      call is precisely the one an incident asks about);
 *   2. a transport failure that produced NO response — the AMBIGUOUS case, where
 *      Razorpay may have applied a request we never saw the answer to;
 *   3. a 2xx whose body we cannot parse, which fails closed rather than being
 *      mistaken for a successful empty response.
 *
 * The database write is BEST-EFFORT and never fails a payment — see `writeApiLog`.
 */

/**
 * A Razorpay call that did not return a 2xx JSON body.
 *
 * Non-2xx AND unparseable-body both land here, so a caller cannot mistake an
 * error page for a successful empty response and fail open.
 */
export class RazorpayApiError extends Error {
  readonly status: number;
  /** Razorpay's `error.code`, e.g. `BAD_REQUEST_ERROR`. Coarse. */
  readonly code: string | null;
  /**
   * Razorpay's `error.reason` — the MACHINE-READABLE key, and the field the
   * adapter branches on (`concurrent_request_in_progress`,
   * `invalid_mandate_state`, `token_not_recurring`). Kept as its own property so
   * a caller never has to know which of three fields the key turned up under.
   */
  readonly reason: string | null;
  /** Razorpay's `error.description` — the human sentence. Bounded. */
  readonly description: string | null;

  constructor(
    message: string,
    status: number,
    envelope: {
      code?: string | null;
      reason?: string | null;
      description?: string | null;
    } = {}
  ) {
    super(message);
    this.name = "RazorpayApiError";
    this.status = status;
    this.code = envelope.code ?? null;
    this.reason = envelope.reason ?? null;
    this.description = envelope.description ?? null;
  }
}

/**
 * Correlation for the log line and the integration-ledger row.
 *
 * `operation` is REQUIRED and has no default — it is the column that makes
 * `payment_provider_api_logs` answerable by verb rather than by path, and
 * requiring it means the compiler catches a call site that would land rows
 * labelled `unknown`. Same contract as `DecentroCallContext`.
 */
export interface RazorpayCallContext {
  operation: string;
  referenceId?: string | null;
  userId?: string | null;
  mandateId?: string | null;
}

/** Total attempts for a GET. One retry, no more — see `get()`. */
const GET_ATTEMPTS = 2;
/** Flat backoff between GET attempts. Short: a poll loop is waiting on this. */
const GET_RETRY_DELAY_MS = 250;

export class RazorpayClient {
  private readonly baseUrl: string;
  /**
   * PUBLIC, unlike every sibling field, and only this one.
   *
   * `key_id` is the publishable half of the pair — Razorpay documents it as
   * belonging in client code, and the adapter hands it to the app so Razorpay
   * Checkout can raise the authorization payment on the device. `keySecret`
   * stays private and signs server-side calls only; nothing may widen it.
   */
  readonly keyId: string;
  private readonly keySecret: string;
  private readonly timeoutMs: number;
  private readonly apiLogs: ProviderApiLogWriter;

  /**
   * `apiLogs` is injectable for one specific test: proving that a ledger write
   * which THROWS does not fail the payment call. That property is the whole
   * point of `writeApiLog`, and it is not assertable without being able to
   * inject a writer that fails.
   */
  constructor(apiLogs: ProviderApiLogWriter = new ProviderApiLogRepository()) {
    this.apiLogs = apiLogs;
    const env = loadEnv();
    // These are `optionalSecret` in the schema — an unset env var renders as ""
    // in a `.env` file and in an ECS task definition, and treating that as a
    // value would crash-loop the task. The env `superRefine` already requires
    // them for every ENABLED provider, so reaching here with one missing means
    // this client was constructed without Razorpay being configured at all.
    // Assert rather than `!`, so the failure names the actual mistake instead of
    // surfacing later as an `undefined` in a request URL.
    this.baseUrl = required(env.RAZORPAY_BASE_URL, "RAZORPAY_BASE_URL").replace(
      /\/+$/,
      ""
    );
    this.keyId = required(env.RAZORPAY_KEY_ID, "RAZORPAY_KEY_ID");
    this.keySecret = required(env.RAZORPAY_KEY_SECRET, "RAZORPAY_KEY_SECRET");
    this.timeoutMs = env.RAZORPAY_TIMEOUT_MS;
  }

  /**
   * GET — retried, because reads are idempotent.
   *
   * Retries only what a second GET could plausibly resolve: a transport failure,
   * a timeout, a 429, or a 5xx. A 4xx is a deterministic "you asked wrong" and
   * retrying it just burns the caller's latency budget.
   */
  async get(
    path: string,
    query: Record<string, string> = {},
    ctx: RazorpayCallContext
  ): Promise<Record<string, unknown>> {
    const search = new URLSearchParams(query).toString();
    const url = `${this.baseUrl}${path}${search ? `?${search}` : ""}`;

    let lastError: unknown;
    for (let attempt = 1; attempt <= GET_ATTEMPTS; attempt++) {
      try {
        return await this.request("GET", path, url, undefined, ctx, attempt);
      } catch (err) {
        lastError = err;
        if (attempt === GET_ATTEMPTS || !isRetryable(err)) throw err;
        log.warn(
          {
            event: "razorpay_retry",
            method: "GET",
            path,
            attempt,
            reference_id: ctx.referenceId ?? null,
            operation: ctx.operation,
            user_id: ctx.userId ?? null,
            mandate_id: ctx.mandateId ?? null,
            stage: PAYMENT_STAGE.gateway,
          },
          "retrying Razorpay GET"
        );
        await delay(GET_RETRY_DELAY_MS);
      }
    }
    throw lastError;
  }

  /**
   * POST — NEVER retried. This is the single most important property in this
   * file, and it is structural rather than a flag precisely so no caller can get
   * it wrong: there is no argument that turns retries on.
   *
   * Every Razorpay POST we make mutates money or mandate state:
   *   - a retried `/payments/create/recurring` is a DUPLICATE DEBIT against a
   *     real customer;
   *   - a retried `/orders` either 400s on the duplicate receipt or, if the
   *     receipt ever drifted, arms a SECOND pre-debit notification for the cycle;
   *   - a retried `/payments/create/upi` ORPHANS an authorization we hold no id
   *     for.
   *
   * A timeout here is genuinely ambiguous — Razorpay may have applied the
   * request we never saw a response to. The correct recovery is not another
   * write, it is a READ: reconcile via `getMandateStatus` / `getPreDebitStatus`,
   * which is why our reference and the deterministic receipt are persisted
   * before any of these calls is made.
   */
  async post(
    path: string,
    body: Record<string, unknown>,
    ctx: RazorpayCallContext
  ): Promise<Record<string, unknown>> {
    return this.request("POST", path, `${this.baseUrl}${path}`, body, ctx, 1);
  }

  /**
   * PUT — NEVER retried, for the same structural reason as `post`.
   *
   * Exists because Razorpay's mandate CANCEL is a `PUT .../tokens/:id/cancel`
   * and nothing else. It is a mutation, so it gets the single-attempt treatment;
   * a `concurrent_request_in_progress` rejection is the gateway telling us a
   * previous attempt is still in flight, which is exactly the outcome a blind
   * retry would provoke.
   */
  async put(
    path: string,
    body: Record<string, unknown>,
    ctx: RazorpayCallContext
  ): Promise<Record<string, unknown>> {
    return this.request("PUT", path, `${this.baseUrl}${path}`, body, ctx, 1);
  }

  private async request(
    method: "GET" | "POST" | "PUT",
    path: string,
    url: string,
    body: Record<string, unknown> | undefined,
    ctx: RazorpayCallContext,
    attempt: number
  ): Promise<Record<string, unknown>> {
    const startedAt = Date.now();
    let response: Response;

    try {
      response = await fetch(url, {
        method,
        headers: {
          // HTTP Basic, `base64(key_id:key_secret)`. Razorpay has no custom auth
          // headers and no request signing — the whole credential is this one
          // header, which is why it is blanked by NAME in the ledger below.
          Authorization: this.authorizationHeader(),
          "Content-Type": "application/json",
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        // Hard ceiling on every call. Without it a hung provider socket pins a
        // Fastify request (and, on the scheduler path, a whole billing run)
        // until Node's default keep-alive gives up.
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      // Transport-level: DNS, connection reset, or our own abort. Logged without
      // `err.message` interpolation — pino serialises it structurally, and the
      // URL (which never carries secrets, but does carry ids) stays out of it.
      log.error(
        {
          event: "razorpay_transport_error",
          method,
          path,
          attempt,
          latency_ms: Date.now() - startedAt,
          reference_id: ctx.referenceId ?? null,
          operation: ctx.operation,
          user_id: ctx.userId ?? null,
          mandate_id: ctx.mandateId ?? null,
          stage: PAYMENT_STAGE.gateway,
          err,
        },
        "Razorpay request failed before a response was received"
      );
      // A call that never produced a response is the MOST important kind to
      // record: it is the ambiguous one, where the provider may have applied a
      // request we never saw the answer to. `504` distinguishes our own abort
      // from a socket that died, which is what tells a later reader whether the
      // request plausibly reached them at all.
      const timedOut = err instanceof Error && err.name === "TimeoutError";
      await this.writeApiLog(method, url, body, ctx, attempt, {
        responseStatus: timedOut ? 504 : 0,
        responseBody: { error: errorText(err) },
        result: timedOut ? "timeout" : "failure",
        errorMessage: errorText(err),
        durationMs: Date.now() - startedAt,
        providerRequestId: null,
      });
      throw err;
    }

    const latencyMs = Date.now() - startedAt;
    const raw = await response.text();
    const parsed = parseJsonObject(raw);
    const envelope = parsed ? readErrorEnvelope(parsed) : null;

    const line = {
      event: "razorpay_response",
      method,
      path,
      attempt,
      status: response.status,
      latency_ms: latencyMs,
      reference_id: ctx.referenceId ?? null,
      operation: ctx.operation,
      user_id: ctx.userId ?? null,
      mandate_id: ctx.mandateId ?? null,
      stage: PAYMENT_STAGE.gateway,
      // Razorpay's own correlation id — what their support tickets are keyed on.
      rzp_request_id: response.headers.get(RAZORPAY_REQUEST_ID_HEADER),
      // The full exchange, PII-redacted (see `redact.ts`). Field names, error
      // codes and ids survive; payer identity and our key secret do not.
      request_body: redactedJson(body),
      response_body: parsed
        ? redactedJson(parsed)
        : // A non-JSON body cannot be redacted field-by-field, so it is NOT
          // logged verbatim — an error page can echo a query string back. The
          // length is enough to tell "empty" from "a page of HTML".
          `[non-json body, ${raw.length} chars]`,
    };
    if (response.ok) {
      log.info(line, "Razorpay response");
    } else {
      // ERROR: a non-2xx here is a payment operation that did not happen.
      log.error(line, "Razorpay request REJECTED");
    }

    // Recorded whatever the outcome, and BEFORE the throws below — a rejected
    // call is exactly the one an incident asks about, so it must not be the one
    // that goes unrecorded.
    await this.writeApiLog(method, url, body, ctx, attempt, {
      responseStatus: response.status,
      responseBody: parsed ?? { error: `[non-json body, ${raw.length} chars]` },
      providerRequestId: response.headers.get(RAZORPAY_REQUEST_ID_HEADER),
      providerMessage: envelope?.description ?? null,
      // The machine key first, the coarse `BAD_REQUEST_ERROR` bucket second —
      // "show me every cancel that hit concurrent_request_in_progress" is the
      // question this column exists to answer.
      providerResponseCode: envelope?.reason ?? envelope?.code ?? null,
      providerTransactionId: parsed ? readString(parsed, "id") : null,
      result: response.ok ? "success" : "failure",
      errorMessage: response.ok ? null : `HTTP ${response.status}`,
      durationMs: latencyMs,
    });

    if (!response.ok) {
      throw new RazorpayApiError(
        `Razorpay ${method} ${path} failed: ${describe(response.status, envelope)}`,
        response.status,
        envelope ?? {}
      );
    }

    if (!parsed) {
      // 2xx with a body we cannot read. Treating this as success would mean
      // inventing a result for a call whose outcome we do not know — for a
      // debit, that is a silent loss. Fail closed.
      throw new RazorpayApiError(
        `Razorpay ${method} ${path} returned a non-JSON body`,
        response.status
      );
    }

    return parsed;
  }

  /** `Basic base64(key_id:key_secret)`. Built per request, never stored. */
  private authorizationHeader(): string {
    const token = Buffer.from(`${this.keyId}:${this.keySecret}`, "utf8").toString(
      "base64"
    );
    return `Basic ${token}`;
  }

  /**
   * Append one row to the integration ledger. THE single exception boundary
   * around it.
   *
   * A failed ledger write is logged and SWALLOWED, never rethrown. If it
   * escaped, the caller could not distinguish it from a gateway transport
   * failure — and on the GET path that re-drives the retry loop, while on the
   * POST path it turns a debit that actually succeeded into a
   * `failure_phase='submit'` row, which the recovery sweep may then supersede
   * into a SECOND charge. Losing an audit row is bad; charging a customer twice
   * to preserve one is worse.
   *
   * `await`ed rather than fire-and-forget, so ordering is deterministic and a
   * test can assert the row exists the moment the call returns. The swallow is
   * what makes awaiting safe.
   */
  private async writeApiLog(
    method: "GET" | "POST" | "PUT",
    url: string,
    body: Record<string, unknown> | undefined,
    ctx: RazorpayCallContext,
    attempt: number,
    outcome: {
      responseStatus: number;
      responseBody: unknown;
      providerRequestId?: string | null;
      providerMessage?: string | null;
      providerResponseCode?: string | null;
      providerTransactionId?: string | null;
      result: "success" | "failure" | "timeout";
      errorMessage: string | null;
      durationMs: number;
    }
  ): Promise<void> {
    try {
      await this.apiLogs.insert({
        provider: "razorpay",
        operation: ctx.operation,
        httpMethod: method,
        requestUrl: url,
        // Credentials never reach the column. Blanked by NAME rather than by
        // value-shape, because a secret that happens to look innocuous must
        // still never land here — and for Razorpay the ENTIRE credential is this
        // one header.
        requestHeaders: {
          Authorization: REDACTED_HEADER,
          "Content-Type": "application/json",
        },
        requestBody: redactPayload(body),
        responseBody: redactPayload(outcome.responseBody),
        responseStatus: outcome.responseStatus,
        providerRequestId: outcome.providerRequestId ?? null,
        providerMessage: outcome.providerMessage ?? null,
        providerResponseCode: outcome.providerResponseCode ?? null,
        providerTransactionId: outcome.providerTransactionId ?? null,
        referenceId: ctx.referenceId ?? null,
        userId: ctx.userId ?? null,
        mandateId: ctx.mandateId ?? null,
        attempt,
        durationMs: outcome.durationMs,
        result: outcome.result,
        errorMessage: outcome.errorMessage,
      });
    } catch (err) {
      log.warn(
        {
          event: "razorpay_api_log_write_failed",
          operation: ctx.operation,
          reference_id: ctx.referenceId ?? null,
          user_id: ctx.userId ?? null,
          mandate_id: ctx.mandateId ?? null,
          stage: PAYMENT_STAGE.gateway,
          err,
        },
        "provider api-log write failed; continuing"
      );
    }
  }
}

/** What replaces a secret header VALUE in the ledger. Never the real one. */
const REDACTED_HEADER = "[redacted]";

/** A bounded, structural description of a thrown transport error. */
function errorText(err: unknown): string {
  if (err instanceof Error) return `${err.name}: ${err.message}`.slice(0, 300);
  return "unknown transport error";
}

/**
 * Retry only on ambiguity that a second GET can resolve. A `RazorpayApiError`
 * with a 4xx status is deterministic and stays thrown.
 */
function isRetryable(err: unknown): boolean {
  if (err instanceof RazorpayApiError) {
    return err.status === 429 || err.status >= 500;
  }
  // Anything that never produced a response — abort/timeout, socket error.
  return true;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Parse to an object or null. Arrays and scalars are not valid responses. */
function parseJsonObject(raw: string): Record<string, unknown> | null {
  if (raw.length === 0) return null;
  try {
    const value: unknown = JSON.parse(raw);
    return isJsonObject(value) ? value : null;
  } catch {
    return null;
  }
}

export function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A non-empty string at `key`, or null. Narrows `unknown` without a cast. */
export function readString(
  obj: Record<string, unknown>,
  key: string
): string | null {
  const value = obj[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * Razorpay's error envelope, which is always nested: every failure is
 * `{ error: { code, description, source, step, reason, metadata } }`.
 *
 * `reason` is the field that carries the specific key (`invalid_mandate_state`,
 * `concurrent_request_in_progress`, …); `code` is the coarse bucket
 * (`BAD_REQUEST_ERROR`). Both are read, because Razorpay has been inconsistent
 * about which one carries the specific key across endpoints, and the adapter's
 * `hasErrorKey` checks all three fields rather than betting on one.
 */
export function readErrorEnvelope(body: Record<string, unknown>): {
  code: string | null;
  reason: string | null;
  description: string | null;
} | null {
  const nested = body.error;
  if (!isJsonObject(nested)) return null;
  return {
    code: readString(nested, "code"),
    reason: readString(nested, "reason"),
    description: readString(nested, "description"),
  };
}

/**
 * A short, bounded description for the thrown error's message.
 *
 * Takes ONLY the vendor's `description` and caps it. The rest of the body is
 * excluded on purpose: an error payload can echo request fields back, and this
 * string ends up in an `AppError` that upstream code logs.
 */
function describe(
  status: number,
  envelope: { description: string | null; reason: string | null } | null
): string {
  const detail = envelope?.description ?? envelope?.reason;
  return detail ? `${status} ${detail.slice(0, 200)}` : `status ${status}`;
}

/**
 * Narrow an optional env value, naming the variable in the failure.
 *
 * Only reachable if `RazorpayClient` is constructed while Razorpay is not among
 * the enabled providers — the env schema's `superRefine` makes the configured
 * path unreachable — so the message points at the real mistake rather than at a
 * downstream `undefined`.
 */
function required(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(
      `${name} is required to construct RazorpayClient (set PAYMENT_PROVIDER=stub to run without Razorpay credentials)`
    );
  }
  return value;
}
