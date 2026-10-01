import { loadEnv } from "@api/shared/config";
import { PAYMENT_STAGE } from "../types.js";
import { createModuleLogger } from "@api/shared/logs";
import { redactedJson, redactPayload } from "@api/shared/logs";
import {
  DECENTRO_API_STATUS_SUCCESS,
  DECENTRO_ENVELOPE_KEYS,
  DECENTRO_TXN_ID_KEYS,
} from "./decentro.constants.js";
import {
  ProviderApiLogRepository,
  type ProviderApiLogWriter,
} from "./provider-api-log.repository.js";

const log = createModuleLogger("payment:decentro-client");

/**
 * The ONLY place an HTTP call to Decentro is made.
 *
 * Built on native `fetch` (Node 22) deliberately: this workspace ships fifteen
 * modules with no HTTP client dependency, and the payments path — the one place
 * a supply-chain surprise moves money — is the worst possible place to add the
 * first one. Everything an axios/undici wrapper would give us here (timeouts,
 * JSON, a retry policy) is fifty lines below, and the retry policy is one we
 * would have to fight a library's defaults to get right anyway.
 *
 * Mirrors `S3MediaRepository`: the vendor client is constructed here, confined
 * to `repositories/`, and never reachable from `services/`. What crosses the
 * seam is `DecentroMandateProvider`, which speaks our domain types.
 *
 * ## Recording discipline (deliberate, do not relax)
 *
 * Every exchange is recorded TWICE, to two places with different lifetimes: a
 * structured log line for live tailing, and a row in `payment_provider_api_logs`
 * that outlives log retention. An incident six weeks later is answered from the
 * table; an incident happening now is watched in the logs.
 *
 * BOTH carry the full request and response body, and both are REDACTED first
 * (`shared/logs/redact.ts`). That redaction is what makes recording them safe and
 * is not optional: a raw body carries the payer's VPA and legal name, and the
 * headers carry our `client_secret`. Field names, statuses, error keys and ids all
 * survive redaction, so nothing diagnostic is lost — which is the whole reason the
 * earlier "log nothing but status and latency" rule was abandoned. It made a live
 * outage undiagnosable: a wrong endpoint constant stopped every recurring debit
 * and the logs could not say what we had sent.
 *
 * The database write is BEST-EFFORT and never fails a payment — see `writeApiLog`.
 */

/**
 * A Decentro call that did not return a 2xx JSON body.
 *
 * Non-2xx AND unparseable-body both land here, so a caller cannot mistake a
 * gateway's HTML error page for a successful empty response and fail open.
 */
export class DecentroApiError extends Error {
  readonly status: number;
  readonly decentroCode: string | null;
  /** Decentro's `api_status`. Present even on a 200 that carries FAILURE. */
  readonly apiStatus: string | null;
  /**
   * Decentro's `response_key` — the machine-readable error key.
   *
   * THE field everything downstream branches on: whether a stranded cycle may be
   * superseded, whether a duplicate reference means the previous attempt landed,
   * whether "too soon" should defer rather than fail. Kept as its own property
   * (rather than only inside `decentroCode`) so a caller reads it without having
   * to know which of five spellings the code was found under.
   */
  readonly responseKey: string | null;

  constructor(
    message: string,
    status: number,
    decentroCode: string | null,
    envelope: { apiStatus?: string | null; responseKey?: string | null } = {}
  ) {
    super(message);
    this.name = "DecentroApiError";
    this.status = status;
    this.decentroCode = decentroCode;
    this.apiStatus = envelope.apiStatus ?? null;
    this.responseKey = envelope.responseKey ?? null;
  }
}

/**
 * Correlation for the log line and the integration-ledger row.
 *
 * `operation` is REQUIRED and there is no default: it is the column that makes
 * `payment_provider_api_logs` answerable ("show me every send_pdn that failed"),
 * and a path string is not a substitute because paths change while the verb does
 * not. Requiring it means the compiler, not a reviewer, catches a call site that
 * would otherwise land rows labelled `unknown`.
 *
 * `referenceId` is ours and safe to record. `userId` / `mandateId` are OUR ids for
 * the aggregate that caused the call, so an incident can start from a user rather
 * than from a gateway id nobody has yet.
 */
export interface DecentroCallContext {
  operation: string;
  referenceId?: string | null;
  userId?: string | null;
  mandateId?: string | null;
}

/** Total attempts for a GET. One retry, no more — see `get()`. */
const GET_ATTEMPTS = 2;
/** Flat backoff between GET attempts. Short: a poll loop is waiting on this. */
const GET_RETRY_DELAY_MS = 250;

export class DecentroClient {
  private readonly baseUrl: string;
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly timeoutMs: number;

  /** Exposed because it is per-tenant request DATA, not a transport concern. */
  readonly consumerUrn: string;

  private readonly apiLogs: ProviderApiLogWriter;

  /**
   * `apiLogs` is injectable for one specific test: proving that a ledger write
   * which THROWS does not fail the payment call. That property is the whole point
   * of `writeApiLog`, and it is not assertable without being able to inject a
   * writer that fails.
   */
  constructor(apiLogs: ProviderApiLogWriter = new ProviderApiLogRepository()) {
    this.apiLogs = apiLogs;
    const env = loadEnv();
    // These are `optionalSecret` in the schema — an unset env var renders as
    // "" in a `.env` file and in an ECS task definition, and treating that as
    // a value would crash-loop the task. The `superRefine` already requires
    // all four when PAYMENT_PROVIDER=decentro, so reaching here with one
    // missing means this client was constructed under the stub provider.
    // Assert rather than `!`, so the failure names the actual mistake instead
    // of surfacing later as an undefined in a request URL.
    this.baseUrl = required(env.DECENTRO_BASE_URL, "DECENTRO_BASE_URL").replace(
      /\/+$/,
      ""
    );
    this.clientId = required(env.DECENTRO_CLIENT_ID, "DECENTRO_CLIENT_ID");
    this.clientSecret = required(
      env.DECENTRO_CLIENT_SECRET,
      "DECENTRO_CLIENT_SECRET"
    );
    this.consumerUrn = required(
      env.DECENTRO_CONSUMER_URN,
      "DECENTRO_CONSUMER_URN"
    );
    this.timeoutMs = env.DECENTRO_TIMEOUT_MS;
  }

  /**
   * GET — retried, because reads are idempotent.
   *
   * Retries only what could plausibly succeed on a second try: a transport
   * failure, a timeout, a 429, or a 5xx. A 4xx is a deterministic "you asked
   * wrong" and retrying it just burns the caller's latency budget.
   */
  async get(
    path: string,
    query: Record<string, string>,
    ctx: DecentroCallContext
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
            event: "decentro_retry",
            method: "GET",
            path,
            attempt,
            reference_id: ctx.referenceId ?? null,
            operation: ctx.operation,
            user_id: ctx.userId ?? null,
            mandate_id: ctx.mandateId ?? null,
            stage: PAYMENT_STAGE.gateway,
          },
          "retrying Decentro GET"
        );
        await delay(GET_RETRY_DELAY_MS);
      }
    }
    throw lastError;
  }

  /**
   * POST — NEVER retried. This is the single most important property in this
   * file, and it is structural rather than a flag precisely so no caller can
   * get it wrong: there is no argument that turns retries on.
   *
   * Every Decentro POST we make mutates money or mandate state:
   *   - a retried presentation is a DUPLICATE DEBIT against a real customer;
   *   - a retried create-mandate ORPHANS a mandate we hold no reference to;
   *   - a retried notify burns the PDN sequence the debit depends on.
   *
   * A timeout here is genuinely ambiguous — the provider may have applied the
   * request we never saw a response to. The correct recovery is not another
   * write, it is a READ: reconcile via `getMandateStatus(referenceId)`, which
   * is why `referenceId` is persisted before any of these calls is made.
   */
  async post(
    path: string,
    body: Record<string, unknown>,
    ctx: DecentroCallContext
  ): Promise<Record<string, unknown>> {
    return this.request("POST", path, `${this.baseUrl}${path}`, body, ctx, 1);
  }

  private async request(
    method: "GET" | "POST",
    path: string,
    url: string,
    body: Record<string, unknown> | undefined,
    ctx: DecentroCallContext,
    attempt: number
  ): Promise<Record<string, unknown>> {
    const startedAt = Date.now();
    let response: Response;

    try {
      response = await fetch(url, {
        method,
        headers: {
          // Decentro v3 authenticates on these two headers alone. There is no
          // `module_secret` / `provider_secret` in this API version — do not
          // add one back; a bogus header is silently ignored and reads as
          // security that isn't there.
          client_id: this.clientId,
          client_secret: this.clientSecret,
          "Content-Type": "application/json",
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        // Hard ceiling on every call. Without it a hung provider socket pins a
        // Fastify request (and, on the scheduler path, a whole billing run)
        // until Node's default keep-alive gives up.
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      // Transport-level: DNS, connection reset, or our own abort. Logged
      // without `err.message` interpolation into a string — pino serialises it
      // structurally, and the URL (which never carries secrets, but does carry
      // ids) stays out of it.
      log.error(
        {
          event: "decentro_transport_error",
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
        "Decentro request failed before a response was received"
      );
      // A call that never produced a response is the MOST important kind to
      // record: it is the ambiguous one, where the provider may have applied a
      // request we never saw the answer to. `504` distinguishes our own abort from
      // a socket that died, which is what tells a later reader whether the request
      // plausibly reached them at all.
      const timedOut = err instanceof Error && err.name === "TimeoutError";
      await this.writeApiLog(method, url, body, ctx, attempt, {
        responseStatus: timedOut ? 504 : 0,
        responseBody: { error: errorText(err) },
        result: timedOut ? "timeout" : "failure",
        errorMessage: errorText(err),
        durationMs: Date.now() - startedAt,
      });
      throw err;
    }

    const latencyMs = Date.now() - startedAt;
    const raw = await response.text();
    const parsed = parseJsonObject(raw);

    const line = {
      event: "decentro_response",
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
      // The provider's own correlation id — what support tickets are keyed on.
      decentro_txn_id: parsed ? providerTxnId(parsed) : null,
      // The full exchange, PII-redacted (see `redact.ts`). Field names, error
      // codes and ids survive; payer identity does not.
      request_body: redactedJson(body),
      response_body: parsed
        ? redactedJson(parsed)
        : `[non-json body, ${raw.length} chars]`,
    };
    if (response.ok) {
      log.info(line, "Decentro response");
    } else {
      // ERROR: a non-2xx here is a payment operation that did not happen.
      log.error(line, "Decentro request REJECTED");
    }

    // Recorded whatever the outcome, and BEFORE the throws below — a rejected call
    // is exactly the one an incident asks about, so it must not be the one that
    // goes unrecorded. `result` reads the ENVELOPE too, not just the HTTP status:
    // a 200 carrying `api_status: FAILURE` is a failure.
    const envelope = parsed ? readEnvelope(parsed) : null;
    await this.writeApiLog(method, url, body, ctx, attempt, {
      responseStatus: response.status,
      responseBody: parsed ?? { error: `[non-json body, ${raw.length} chars]` },
      providerStatus: envelope?.apiStatus ?? null,
      providerMessage: envelope?.message ?? null,
      providerResponseCode: envelope?.responseKey ?? null,
      providerTransactionId: parsed ? providerTxnId(parsed) : null,
      result:
        response.ok && (envelope === null || envelope.ok) ? "success" : "failure",
      errorMessage: response.ok ? null : `HTTP ${response.status}`,
      durationMs: latencyMs,
    });

    if (!response.ok) {
      throw new DecentroApiError(
        `Decentro ${method} ${path} failed: ${describe(response.status, parsed)}`,
        response.status,
        parsed ? extractDecentroCode(parsed) : null,
        { apiStatus: envelope?.apiStatus, responseKey: envelope?.responseKey }
      );
    }

    if (!parsed) {
      // 2xx with a body we cannot read. Treating this as success would mean
      // inventing a result for a call whose outcome we do not know — for a
      // debit, that is a silent loss. Fail closed.
      throw new DecentroApiError(
        `Decentro ${method} ${path} returned a non-JSON body`,
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
   * the caller could not distinguish it from a gateway transport failure — and on
   * the GET path that re-drives the retry loop, while on the POST path it turns a
   * debit that actually succeeded into a `failure_phase='submit'` row, which the
   * recovery sweep may then supersede into a SECOND charge. Losing an audit row is
   * bad; charging a customer twice to preserve one is worse.
   *
   * `await`ed rather than fire-and-forget, so ordering is deterministic and a test
   * can assert the row exists the moment the call returns. The swallow is what
   * makes awaiting safe.
   */
  private async writeApiLog(
    method: "GET" | "POST",
    url: string,
    body: Record<string, unknown> | undefined,
    ctx: DecentroCallContext,
    attempt: number,
    outcome: {
      responseStatus: number;
      responseBody: unknown;
      providerStatus?: string | null;
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
        provider: "decentro",
        operation: ctx.operation,
        httpMethod: method,
        requestUrl: url,
        // Credentials never reach the column. Blanked by NAME rather than by
        // value-shape, because a secret that happens to look innocuous must still
        // never land here.
        requestHeaders: {
          client_id: REDACTED_HEADER,
          client_secret: REDACTED_HEADER,
          "Content-Type": "application/json",
        },
        requestBody: redactPayload(body),
        responseBody: redactPayload(outcome.responseBody),
        responseStatus: outcome.responseStatus,
        providerStatus: outcome.providerStatus ?? null,
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
          event: "decentro_api_log_write_failed",
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

/**
 * Did Decentro's ENVELOPE say the call did what we asked?
 *
 * Separate from the HTTP status because Decentro returns application-level
 * failures inside a 200. Exported so the adapter can gate per-operation rather
 * than the client throwing blanket-wide: the two status READS deliberately do NOT
 * gate on this, since their own status field carries the answer and a hard throw
 * there would defeat fail-soft reconciliation.
 */
export function isProviderSuccess(body: Record<string, unknown>): boolean {
  const apiStatus = readString(body, DECENTRO_ENVELOPE_KEYS.apiStatus);
  // Absent is treated as success: not every endpoint echoes it, and inventing a
  // failure for a response that simply omits the field would strand good calls.
  return apiStatus === null || apiStatus.toUpperCase() === DECENTRO_API_STATUS_SUCCESS;
}

/** The envelope fields worth recording, read once so nothing probes twice. */
function readEnvelope(body: Record<string, unknown>): {
  apiStatus: string | null;
  message: string | null;
  responseKey: string | null;
  ok: boolean;
} {
  return {
    apiStatus: readString(body, DECENTRO_ENVELOPE_KEYS.apiStatus),
    message: readString(body, DECENTRO_ENVELOPE_KEYS.message),
    responseKey: readString(body, DECENTRO_ENVELOPE_KEYS.responseKey),
    ok: isProviderSuccess(body),
  };
}

/** A bounded, structural description of a thrown transport error. */
function errorText(err: unknown): string {
  if (err instanceof Error) return `${err.name}: ${err.message}`.slice(0, 300);
  return "unknown transport error";
}

/**
 * Retry only on ambiguity that a second GET can resolve. A `DecentroApiError`
 * with a 4xx status is deterministic and stays thrown.
 */
function isRetryable(err: unknown): boolean {
  if (err instanceof DecentroApiError) {
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
 * The vendor's correlation id, from whichever key it turns up under.
 *
 * This read used to be `readString(parsed, "decentroTxnId")` — CAMEL CASE, which
 * the v3 API never sends. The wire spells it `decentro_txn_id`, on the ENVELOPE,
 * in every response including the failures. So `provider_transaction_id` was null
 * in every `payment_provider_api_logs` row ever written, and `decentro_txn_id` was
 * null in every log line — the one field a Decentro support ticket is keyed on,
 * absent from exactly the records raised to open one.
 *
 * Reads the shared key list rather than a literal so the adapter and the transport
 * cannot drift on the spelling again.
 */
function providerTxnId(body: Record<string, unknown>): string | null {
  for (const key of DECENTRO_TXN_ID_KEYS) {
    const found = readString(body, key);
    if (found) return found;
  }
  return null;
}

/**
 * The vendor's error code, from the first key it turns up under.
 *
 * `response_key` IS the machine-readable key on a v3 autopay failure, and it is
 * probed FIRST. It was previously absent from this list entirely — the probe went
 * straight to `responseCode` / `errorCode` / nested `error.code`, none of which
 * Decentro sends — so every error classified as `null`, and the whole error-driven
 * flow downstream was unreachable: `NoSuchDebitError` could never be thrown, a
 * duplicate reference could not be told from a real failure, and a
 * too-early-in-the-window rejection was recorded as terminal.
 *
 * The rest of the list stays as a fallback rather than being deleted: it costs one
 * absent-key lookup, and a vendor that changes the spelling should degrade to a
 * wrong-but-present code rather than to silence.
 */
function extractDecentroCode(body: Record<string, unknown>): string | null {
  const responseKey = readString(body, DECENTRO_ENVELOPE_KEYS.responseKey);
  if (responseKey) return responseKey;
  for (const key of ["responseCode", "response_code", "errorCode", "error_code"]) {
    const found = readString(body, key);
    if (found) return found;
  }
  const nested = body.error;
  if (isJsonObject(nested)) return readString(nested, "code");
  return null;
}

/**
 * A short, bounded description for the thrown error's message.
 *
 * Takes ONLY the vendor's `message` field and caps it. The rest of the body is
 * excluded on purpose: an error payload can echo request fields back, and this
 * string ends up in an `AppError` that upstream code logs.
 */
function describe(status: number, body: Record<string, unknown> | null): string {
  const message = body ? readString(body, "message") : null;
  return message ? `${status} ${message.slice(0, 200)}` : `status ${status}`;
}

/**
 * Narrow an optional env value, naming the variable in the failure.
 *
 * Only reachable if `DecentroClient` is constructed while
 * `PAYMENT_PROVIDER !== "decentro"` — the env schema's `superRefine` makes the
 * configured path unreachable — so the message points at the real mistake
 * rather than at a downstream `undefined`.
 */
function required(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(
      `${name} is required to construct DecentroClient (set PAYMENT_PROVIDER=stub to run without Decentro credentials)`
    );
  }
  return value;
}
