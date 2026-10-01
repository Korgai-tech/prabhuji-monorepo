import { loadEnv } from "@api/shared/config";
import { PAYMENT_STAGE } from "../types.js";
import { createModuleLogger } from "@api/shared/logs";
import { redactedJson, redactPayload } from "@api/shared/logs";
import { CASHFREE_HEADERS } from "./cashfree.constants.js";
import {
  ProviderApiLogRepository,
  type ProviderApiLogWriter,
} from "./provider-api-log.repository.js";

const log = createModuleLogger("payment:cashfree-client");

/**
 * The ONLY place an HTTP call to Cashfree is made.
 *
 * Native `fetch`, no HTTP-client dependency — the same reasoning as
 * `DecentroClient`: the payments path is the worst place to add a supply-chain
 * surprise, and everything a wrapper would give us (timeouts, JSON, a retry
 * policy) is a few lines here, with a retry policy we would otherwise fight a
 * library to get right.
 *
 * Confined to `repositories/`, never reachable from `services/`. What crosses
 * the seam is `CashfreeMandateProvider`, which speaks our domain types.
 *
 * ## Recording discipline (deliberate, do not relax)
 *
 * Every exchange is recorded twice, with different lifetimes: a structured log
 * line for live tailing, and a row in `payment_provider_api_logs` that outlives
 * log retention. Both carry the full request and response body, REDACTED first
 * (`shared/logs/redact.ts`) — which is what makes recording them safe, and is not
 * optional: a raw body carries the payer's VPA and name, the headers carry our
 * `x-client-secret`, and an auth URL is a live mandate link.
 *
 * `x-request-id` is recorded in its own column. It is the id Cashfree support asks
 * for first, and before this table existed the only way to produce one was to
 * still have the log.
 *
 * The database write is BEST-EFFORT and never fails a payment — see `writeApiLog`.
 */

/**
 * A Cashfree call that did not return a 2xx JSON body. Non-2xx AND
 * unparseable-body both land here, so a caller cannot mistake an error page for
 * a successful empty response and fail open.
 */
export class CashfreeApiError extends Error {
  readonly status: number;
  readonly cashfreeCode: string | null;

  constructor(message: string, status: number, cashfreeCode: string | null) {
    super(message);
    this.name = "CashfreeApiError";
    this.status = status;
    this.cashfreeCode = cashfreeCode;
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
export interface CashfreeCallContext {
  operation: string;
  referenceId?: string | null;
  userId?: string | null;
  mandateId?: string | null;
}

/** Total attempts for a GET. One retry, no more — reads are idempotent. */
const GET_ATTEMPTS = 2;
const GET_RETRY_DELAY_MS = 250;

export class CashfreeClient {
  private readonly baseUrl: string;
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly apiVersion: string;
  private readonly timeoutMs: number;
  private readonly apiLogs: ProviderApiLogWriter;

  /** `apiLogs` is injectable so a test can prove a failing ledger write does not
   * fail the payment call — see `writeApiLog`. */
  constructor(apiLogs: ProviderApiLogWriter = new ProviderApiLogRepository()) {
    this.apiLogs = apiLogs;
    const env = loadEnv();
    // `optionalSecret` in the schema — an unset value renders as "" and must not
    // reach a request. The `superRefine` requires all of these when
    // PAYMENT_PROVIDER=cashfree, so reaching here with one missing means this
    // client was constructed under another provider; name the actual mistake.
    this.baseUrl = required(env.CASHFREE_BASE_URL, "CASHFREE_BASE_URL").replace(
      /\/+$/,
      ""
    );
    this.clientId = required(env.CASHFREE_CLIENT_ID, "CASHFREE_CLIENT_ID");
    this.clientSecret = required(
      env.CASHFREE_CLIENT_SECRET,
      "CASHFREE_CLIENT_SECRET"
    );
    this.apiVersion = env.CASHFREE_API_VERSION;
    this.timeoutMs = env.CASHFREE_TIMEOUT_MS;
  }

  /** GET — retried, because reads are idempotent (transport/429/5xx only). */
  async get(
    path: string,
    query: Record<string, string> = {},
    ctx: CashfreeCallContext
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
            event: "cashfree_retry",
            method: "GET",
            path,
            attempt,
            reference_id: ctx.referenceId ?? null,
            operation: ctx.operation,
            user_id: ctx.userId ?? null,
            mandate_id: ctx.mandateId ?? null,
            stage: PAYMENT_STAGE.gateway,
          },
          "retrying Cashfree GET"
        );
        await delay(GET_RETRY_DELAY_MS);
      }
    }
    throw lastError;
  }

  /**
   * POST — NEVER retried, structurally. Every Cashfree POST we make mutates
   * money or mandate state (create a subscription, schedule/charge a debit,
   * cancel). A timeout is ambiguous — the provider may have applied the request
   * we never saw — and the correct recovery is a READ (status), never a second
   * write. `referenceId` is persisted before any of these so a read can find it.
   */
  async post(
    path: string,
    body: Record<string, unknown>,
    ctx: CashfreeCallContext
  ): Promise<Record<string, unknown>> {
    return this.request("POST", path, `${this.baseUrl}${path}`, body, ctx, 1);
  }

  private async request(
    method: "GET" | "POST",
    path: string,
    url: string,
    body: Record<string, unknown> | undefined,
    ctx: CashfreeCallContext,
    attempt: number
  ): Promise<Record<string, unknown>> {
    const startedAt = Date.now();
    let response: Response;

    try {
      response = await fetch(url, {
        method,
        headers: {
          [CASHFREE_HEADERS.clientId]: this.clientId,
          [CASHFREE_HEADERS.clientSecret]: this.clientSecret,
          [CASHFREE_HEADERS.apiVersion]: this.apiVersion,
          "Content-Type": "application/json",
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      log.error(
        {
          event: "cashfree_transport_error",
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
        "Cashfree request failed before a response was received"
      );
      // The ambiguous case, and therefore the most important to record: the
      // provider may have applied a request we never saw the answer to. `504`
      // distinguishes our own abort from a dead socket, which is what tells a
      // later reader whether it plausibly reached them at all.
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

    const line = {
      event: "cashfree_response",
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
      // Cashfree's own correlation id — support tickets are keyed on it.
      cf_request_id: response.headers.get("x-request-id"),
      // The full exchange, PII-redacted. This is what "the gateway said no" is
      // worth nothing without: field names, error codes and ids all survive
      // redaction, and only payer identity is blanked. See `redact.ts`.
      request_body: redactedJson(body),
      response_body: parsed
        ? redactedJson(parsed)
        // A non-JSON body cannot be redacted field-by-field, so it is NOT
        // logged verbatim — an HTML error page can echo a query string. The
        // length is enough to tell "empty" from "a page of HTML".
        : `[non-json body, ${raw.length} chars]`,
    };
    if (response.ok) {
      log.info(line, "Cashfree response");
    } else {
      // ERROR on a non-2xx: every one of these is a payment operation that did
      // not happen. Previously this path logged nothing at all beyond the info
      // line above, so a gateway rejecting every debit looked identical to a
      // healthy one at warn level.
      log.error(line, "Cashfree request REJECTED");
    }

    // Recorded whatever the outcome, and BEFORE the throws below — a rejected
    // call is exactly the one an incident asks about, so it must not be the one
    // that goes unrecorded.
    await this.writeApiLog(method, url, body, ctx, attempt, {
      responseStatus: response.status,
      responseBody: parsed ?? { error: `[non-json body, ${raw.length} chars]` },
      providerRequestId: response.headers.get("x-request-id"),
      providerMessage: parsed ? readString(parsed, "message") : null,
      providerResponseCode: parsed ? extractCashfreeCode(parsed) : null,
      result: response.ok ? "success" : "failure",
      errorMessage: response.ok ? null : `HTTP ${response.status}`,
      durationMs: latencyMs,
    });

    if (!response.ok) {
      throw new CashfreeApiError(
        `Cashfree ${method} ${path} failed: ${describe(response.status, parsed)}`,
        response.status,
        parsed ? extractCashfreeCode(parsed) : null
      );
    }

    if (!parsed) {
      // 2xx with a body we cannot read. Inventing a result for a call whose
      // outcome we do not know is, for a debit, a silent loss. Fail closed.
      throw new CashfreeApiError(
        `Cashfree ${method} ${path} returned a non-JSON body`,
        response.status,
        null
      );
    }

    return parsed;
  }

  /**
   * Append one row to the integration ledger. THE single exception boundary
   * around it.
   *
   * A failed ledger write is logged and SWALLOWED, never rethrown. If it escaped,
   * the caller could not tell it from a gateway transport failure — and on the GET
   * path that re-drives the retry loop, while on the POST path it turns a charge
   * that actually succeeded into a failed row the recovery sweep may supersede
   * into a SECOND charge. Losing an audit row is bad; charging a customer twice to
   * preserve one is worse.
   *
   * `await`ed rather than fire-and-forget so ordering is deterministic and a test
   * can assert the row exists once the call returns; the swallow makes that safe.
   */
  private async writeApiLog(
    method: "GET" | "POST",
    url: string,
    body: Record<string, unknown> | undefined,
    ctx: CashfreeCallContext,
    attempt: number,
    outcome: {
      responseStatus: number;
      responseBody: unknown;
      providerRequestId: string | null;
      providerMessage?: string | null;
      providerResponseCode?: string | null;
      result: "success" | "failure" | "timeout";
      errorMessage: string | null;
      durationMs: number;
    }
  ): Promise<void> {
    try {
      await this.apiLogs.insert({
        provider: "cashfree",
        operation: ctx.operation,
        httpMethod: method,
        requestUrl: url,
        // Blanked by NAME, not by value-shape: a credential that happens to look
        // innocuous must still never land here.
        requestHeaders: {
          [CASHFREE_HEADERS.clientId]: REDACTED_HEADER,
          [CASHFREE_HEADERS.clientSecret]: REDACTED_HEADER,
          [CASHFREE_HEADERS.apiVersion]: this.apiVersion,
          "Content-Type": "application/json",
        },
        requestBody: redactPayload(body),
        responseBody: redactPayload(outcome.responseBody),
        responseStatus: outcome.responseStatus,
        providerRequestId: outcome.providerRequestId,
        providerMessage: outcome.providerMessage ?? null,
        providerResponseCode: outcome.providerResponseCode ?? null,
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
          event: "cashfree_api_log_write_failed",
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

function isRetryable(err: unknown): boolean {
  if (err instanceof CashfreeApiError) {
    return err.status === 429 || err.status >= 500;
  }
  return true; // Never produced a response — abort/timeout, socket error.
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

/** Cashfree's machine-readable error code, from the first key it appears under. */
function extractCashfreeCode(body: Record<string, unknown>): string | null {
  for (const key of ["code", "type", "error_code"]) {
    const found = readString(body, key);
    if (found) return found;
  }
  const nested = body.error;
  if (isJsonObject(nested)) return readString(nested, "code");
  return null;
}

/** A short, bounded description for the thrown error's message. */
function describe(status: number, body: Record<string, unknown> | null): string {
  const message = body ? readString(body, "message") : null;
  return message ? `${status} ${message.slice(0, 200)}` : `status ${status}`;
}

/** Narrow an optional env value, naming the variable in the failure. */
function required(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(
      `${name} is required to construct CashfreeClient (set PAYMENT_PROVIDER=stub to run without Cashfree credentials)`
    );
  }
  return value;
}
