import { loadEnv } from "@api/shared/config";
import { AppError } from "@api/shared/errors";
import { createModuleLogger } from "@api/shared/logs";
import type { ChatProvider, ProviderAnswer } from "@api/core/chat/types";

const log = createModuleLogger("chat:ragflow");

/**
 * The ONLY place an HTTP call to RAGFlow is made.
 *
 * Native `fetch`, no HTTP-client dependency — same reasoning as
 * `CashfreeClient`: everything a wrapper would give us (timeout, JSON, a retry
 * policy) is a few lines here. Confined to `repositories/`; what crosses the
 * seam is the `ChatProvider` interface, which speaks our domain types.
 *
 * RETRY: unlike the payment clients, this POST **is** retried. It is not a
 * mutation of money — the worst case of a duplicated request is a wasted agent
 * turn, and the endpoint is a Render instance that cold-starts, so a first
 * attempt timing out is an expected event rather than an ambiguous write.
 *
 * SESSIONS: RAGFlow mints its own `session_id` on the first answer and refuses
 * any id it did not mint (`code: 102, "Session not found!"`). We send back the
 * one we hold, and on a 102 we retry ONCE with no session id — the provider has
 * forgotten the conversation, and the service has already replayed our own
 * transcript into `query`, so that retry still answers in context rather than
 * failing the request. The new handle comes back for the service to persist.
 *
 * RESPONSE SHAPE (verified against the live agent): a 200 always, with the real
 * status in `code` — `0` is success. The answer is buried at
 * `data.data.outputs.content`. The content is returned VERBATIM: this agent
 * replies with a JSON document plus a trailer, and deciding what that means is
 * the client's business, not ours. Parsing it here would put the agent's prompt
 * format into our schema.
 */
const ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 2_000;

/** The provider rejected our credentials — terminal, never retried. */
class AuthRejected extends Error {}

/** The provider has no record of the session we sent (`code: 102`). */
class SessionNotFound extends Error {}

/** RAGFlow's code for "Session not found!". */
const CODE_SESSION_NOT_FOUND = 102;

interface RagflowResponse {
  code?: number;
  message?: string;
  data?: {
    session_id?: string;
    message_id?: string;
    data?: { outputs?: { content?: string } };
  };
}

/**
 * Whether this deployment has a RAGFlow provider at all.
 *
 * Both halves or neither: a half-configured deploy is a configuration bug, not
 * a reason to serve half a feature. Exported so `getChatConfig` can report chat
 * as OFF on an environment that cannot answer a message — see the fail-closed
 * note there.
 */
export function isChatProviderConfigured(): boolean {
  const env = loadEnv();
  return Boolean(env.RAGFLOW_BASE_URL) && Boolean(env.RAGFLOW_API_KEY);
}

/** Narrow an optional env value, naming the variable in the failure. */
function required(value: string | undefined, name: string): string {
  if (!value) {
    throw new AppError(
      `${name} is not configured`,
      503,
      "CHAT_PROVIDER_UNCONFIGURED"
    );
  }
  return value;
}

export class RagflowClient implements ChatProvider {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;

  constructor() {
    const env = loadEnv();
    this.baseUrl = required(env.RAGFLOW_BASE_URL, "RAGFLOW_BASE_URL").replace(
      /\/+$/,
      ""
    );
    this.apiKey = required(env.RAGFLOW_API_KEY, "RAGFLOW_API_KEY");
    this.timeoutMs = env.RAGFLOW_TIMEOUT_MS;
  }

  async ask(params: {
    agentId: string;
    query: string;
    sessionId?: string;
    inputs?: Record<string, { type: string; value: string }>;
  }): Promise<ProviderAnswer> {
    // Begin variables go with EVERY request that carries them, including one
    // that also carries a session_id.
    //
    // This used to send them only on the request that OPENS the session, on
    // the belief that RAGFlow binds them once and holds them against it. That
    // belief was wrong, and it was expensive. RAGFlow does persist them on the
    // session record — you can read them back from
    // `GET /api/v1/agents/{id}/sessions` — but it only substitutes them into
    // the prompt on the turn they arrive. From the second turn onward every
    // `{begin@...}` renders EMPTY.
    //
    // For the kuldevta persona that meant the deity forgot its own temple,
    // mantra and niyam after one message, hit the prompt's "if the field is
    // empty, say you do not carry it" branch, and eventually told the family
    // "Main aapka kuldevta nahi hoon" — the single worst thing this feature
    // can say. Verified on stage, and verified fixed by resending:
    //
    //   turn 2, inputs omitted -> "Mujhe aapke liye mantra nahi diya gaya hai"
    //   turn 2, inputs resent  -> "OM SHRI MARTAND BHAIRAVAYA NAMAH."
    //
    // Cost of resending is a few hundred bytes per turn. Do not "optimise"
    // this back to first-turn-only.
    const body = {
      agent_id: params.agentId,
      query: params.query,
      stream: false,
      ...(params.sessionId ? { session_id: params.sessionId } : {}),
      ...(params.inputs ? { inputs: params.inputs } : {}),
    };

    let lastErr: unknown;
    for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
      try {
        return await this.post(body, attempt);
      } catch (err) {
        lastErr = err;
        // The provider forgot this conversation. Drop the handle and go again
        // with a fresh session — `query` already carries our own transcript, so
        // the answer stays in context. Costs one attempt, not the request.
        if (err instanceof SessionNotFound && "session_id" in body) {
          delete (body as { session_id?: string }).session_id;
          // The retry opens a NEW session, so any Begin variables have to go
          // with it. Without this an agent whose prompt reads {begin@name}
          // fails on the retry with `code: 0` and an error string in the body
          // — a "successful" call carrying no answer.
          if (params.inputs) {
            (body as { inputs?: typeof params.inputs }).inputs = params.inputs;
          }
          log.warn(
            {
              event: "ragflow_session_not_found",
              agent_id: params.agentId,
              attempt,
            },
            "provider session expired — retrying with a new session"
          );
          continue;
        }
        log.warn(
          {
            event: "ragflow_attempt_failed",
            agent_id: params.agentId,
            attempt,
            error: err instanceof Error ? err.message : String(err),
          },
          "ragflow request failed"
        );
        // A rejected credential is not a transient fault. Retrying it would add
        // 6s of latency to every request of a deploy with a bad key, and turn a
        // legible "unauthorized" into a timeout-shaped mystery.
        if (err instanceof AuthRejected) break;
        if (attempt < ATTEMPTS) {
          await new Promise((resolve) =>
            setTimeout(resolve, RETRY_BASE_DELAY_MS * attempt)
          );
        }
      }
    }
    throw new AppError(
      `Chat provider unavailable: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`,
      502,
      "CHAT_PROVIDER_ERROR"
    );
  }

  /**
   * One HTTP round trip, with both halves of it logged verbatim.
   *
   * The request and response bodies are logged as STRINGS, exactly as they went
   * out and came back, because the value of these lines is being able to replay
   * a turn against the provider and compare byte for byte. Re-serializing a
   * parsed object would silently normalize key order and drop anything we do
   * not model.
   *
   * HEADERS ARE NOT LOGGED. They carry `Authorization: Bearer <api key>`, and a
   * log pipeline is the wrong place for a credential — the URL and the body are
   * the whole of what varies per request anyway.
   *
   * The response is read as TEXT and parsed after, rather than `response.json()`:
   * the provider is a Render instance that answers a cold start with an HTML
   * error page, and reading text first means that page is logged as itself
   * instead of vanishing into a `SyntaxError` about an unexpected `<`.
   */
  private async post(
    body: Record<string, unknown>,
    attempt: number
  ): Promise<ProviderAnswer> {
    const url = `${this.baseUrl}/api/v1/agents/chat/completions`;
    const request = JSON.stringify(body);

    log.info(
      { event: "ragflow_request", attempt, url, request },
      "ragflow request"
    );

    const startedAt = Date.now();
    let response: Response;
    let text: string;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: request,
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      text = await response.text();
    } catch (err) {
      // A timeout or a dropped connection produces no response to log, so the
      // pair is closed with the failure instead — otherwise a request line with
      // nothing after it is indistinguishable from a log that was cut off.
      log.warn(
        {
          event: "ragflow_response",
          attempt,
          url,
          duration_ms: Date.now() - startedAt,
          error: err instanceof Error ? err.message : String(err),
        },
        "ragflow request did not complete"
      );
      throw err;
    }

    log.info(
      {
        event: "ragflow_response",
        attempt,
        url,
        status: response.status,
        duration_ms: Date.now() - startedAt,
        response: text,
      },
      "ragflow response"
    );

    if (response.status === 401 || response.status === 403) {
      throw new AuthRejected(`provider rejected credentials (${response.status})`);
    }

    // Parsed after that, and before any other status check, on purpose: RAGFlow
    // reports its own failures as `code != 0` inside a 200, so for everything
    // other than auth the body — not the status — is the real verdict.
    let json: RagflowResponse;
    try {
      json = JSON.parse(text) as RagflowResponse;
    } catch {
      throw new Error(
        `non-JSON response (status ${String(response.status)})`
      );
    }
    if (json.code === CODE_SESSION_NOT_FOUND) {
      throw new SessionNotFound(json.message ?? "Session not found!");
    }
    if (json.code !== 0) {
      throw new Error(
        `api code ${String(json.code)}: ${json.message ?? "unknown error"}`
      );
    }

    const content = json.data?.data?.outputs?.content;
    if (typeof content !== "string" || content.length === 0) {
      // A `code: 0` with no answer is still a failure — retrying is the right
      // move, and returning "" would persist an empty bot turn forever.
      throw new Error("api returned code 0 with no content");
    }

    // `json` is archived WHOLE — the parsed body exactly as it arrived, not a
    // reshaping of it. Anything we forgot to model today is still recoverable.
    return {
      content,
      sessionId: json.data?.session_id ?? null,
      messageId: json.data?.message_id ?? null,
      raw: json,
    };
  }
}
