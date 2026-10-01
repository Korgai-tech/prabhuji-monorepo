import OpenAI from "openai";
import { loadEnv } from "@api/shared/config";
import { createModuleLogger } from "@api/shared/logs";

const log = createModuleLogger("horoscope:openai-client");

/**
 * The ONLY place the OpenAI SDK is touched.
 *
 * Mirrors `DecentroClient` (core/payment): the vendor client is constructed
 * here, confined to `repositories/`, and never reachable from `services/`. What
 * crosses the seam is [HoroscopeAiClient] — a two-method interface over "send a
 * prompt, get JSON matching this schema back" — so the generation service is
 * unit-testable against a fake with no network, no key and no token spend.
 *
 * Unlike Decentro this DOES use a vendor SDK rather than native `fetch`. The
 * deciding factor is Structured Outputs: `strict: true` schema enforcement plus
 * refusal handling is real protocol surface, and the SDK's typed refusal/finish
 * -reason handling is the part we would otherwise reimplement incorrectly.
 *
 * ## Logging discipline (deliberate, do not relax)
 *
 * We log model, latency, token counts and finish reason — and NOTHING else.
 * Never the prompt, never the completion. Logs ship to a hosted aggregator, and
 * the completion is unreviewed model output in four languages that has not yet
 * passed the safety validator; putting it in logs would route exactly the
 * content the guardrail exists to reject straight past it.
 */

/** A call that did not produce usable JSON. Carries WHY, so callers can branch. */
export class HoroscopeAiError extends Error {
  readonly kind: "refusal" | "truncated" | "malformed" | "transport";

  constructor(message: string, kind: HoroscopeAiError["kind"]) {
    super(message);
    this.name = "HoroscopeAiError";
    this.kind = kind;
  }
}

/** One structured-output request. `schema` is a JSON Schema object. */
export interface AiJsonRequest {
  /** System-role content — the persona and the rules. */
  system: string;
  /** User-role content — the concrete inputs for this generation. */
  user: string;
  /** Schema name sent to the provider (identifies the shape in their logs). */
  schemaName: string;
  /** JSON Schema the response is forced to satisfy (`strict: true`). */
  schema: Record<string, unknown>;
  /** 0.6 per the prompt spec; the judge overrides it to 0. */
  temperature?: number;
  /** Upper bound on output tokens. */
  maxOutputTokens?: number;
}

/**
 * The seam the generation service depends on. A fake implementation in
 * `__tests__` returns canned payloads, so every behaviour below the network —
 * validation, safety, the storage fan out, the lock — is tested offline.
 */
export interface HoroscopeAiClient {
  /** Send a structured-output request; resolve with the PARSED JSON value. */
  completeJson(req: AiJsonRequest): Promise<unknown>;
}

/**
 * Whether `model` is a reasoning model — the `gpt-5*` family or the `o1`/`o3`/
 * `o4` series. Two request parameters depend on the answer, and both were found
 * by calling the gateway rather than reasoned about (see `completeJson`).
 *
 * A LiteLLM-style `provider/model` prefix is stripped before matching.
 */
export function isReasoningModel(model: string): boolean {
  const bare = model.toLowerCase().split("/").pop() ?? "";
  return /^(gpt-5|o[134])(\W|$)/.test(bare);
}

export class OpenAiHoroscopeClient implements HoroscopeAiClient {
  private readonly client: OpenAI;
  private readonly model: string;

  constructor() {
    const env = loadEnv();
    // `optionalSecret` renders an unset var as undefined. The composition root
    // only constructs this client when OPENAI_API_KEY is present, so reaching
    // here without one is a wiring bug. Assert, so the failure names the actual
    // mistake rather than surfacing later as a 401 from the provider.
    if (!env.OPENAI_API_KEY) {
      throw new Error(
        "OPENAI_API_KEY is not set — OpenAiHoroscopeClient must only be constructed when a key is configured"
      );
    }
    this.model = env.OPENAI_MODEL;
    this.client = new OpenAI({
      apiKey: env.OPENAI_API_KEY,
      // Points at our LiteLLM gateway, not api.openai.com. The wire protocol is
      // identical, so the SDK (including Structured Outputs) is untouched; what
      // changes is that the gateway holds the upstream provider key and enforces
      // routing/spend, and OPENAI_API_KEY is a gateway key rather than an
      // OpenAI one. `OPENAI_MODEL` must name a model the gateway has configured.
      baseURL: env.OPENAI_BASE_URL,
      timeout: env.OPENAI_TIMEOUT_MS,
      // ONE retry. Generation is already wrapped in a regenerate-on-invalid
      // loop upstream, and the caller holds a lock while we wait — stacking the
      // SDK's default retries under that would let a single request hold the
      // lock for minutes.
      maxRetries: 1,
    });
  }

  async completeJson(req: AiJsonRequest): Promise<unknown> {
    const startedAt = Date.now();
    let completion: OpenAI.Chat.Completions.ChatCompletion;

    try {
      completion = await this.client.chat.completions.create({
        model: this.model,
        // Two deviations a reasoning model forces, both verified against the
        // gateway rather than assumed:
        //
        // 1. `temperature` — a `gpt-5*`/o-series model rejects ANY value but the
        //    default with a 400 for the whole request instead of clamping, so
        //    our 0.6 (and the judge's 0) has to be dropped, not adjusted.
        // 2. `reasoning_effort: "minimal"` — reasoning tokens are billed and
        //    counted against `max_completion_tokens`. Left at the default,
        //    gpt-5-nano spent all 4000 of this call's ceiling thinking and
        //    emitted ZERO content tokens: `finish_reason: "length"`, i.e. every
        //    generation failing as "truncated". At minimal it finishes in ~2k
        //    tokens with the full eight-section, four-locale payload intact.
        //    This is not a knob to tune for quality — the ceiling is the
        //    constraint, and a horoscope does not need deliberation.
        ...(isReasoningModel(this.model)
          ? { reasoning_effort: "minimal" as const }
          : { temperature: req.temperature ?? 0.6 }),
        ...(req.maxOutputTokens
          ? { max_completion_tokens: req.maxOutputTokens }
          : {}),
        response_format: {
          type: "json_schema",
          json_schema: {
            name: req.schemaName,
            // `strict` is what makes the schema a guarantee rather than a hint:
            // the provider constrains decoding, so a missing key or a quoted
            // integer becomes structurally impossible instead of a retry.
            strict: true,
            schema: req.schema,
          },
        },
        messages: [
          { role: "system", content: req.system },
          { role: "user", content: req.user },
        ],
      });
    } catch (err) {
      log.error(
        {
          event: "horoscope_ai_transport_error",
          model: this.model,
          latency_ms: Date.now() - startedAt,
          err_name: err instanceof Error ? err.name : "unknown",
        },
        "openai call failed"
      );
      throw new HoroscopeAiError(
        err instanceof Error ? err.message : "openai call failed",
        "transport"
      );
    }

    const choice = completion.choices[0];
    log.info(
      {
        event: "horoscope_ai_call",
        model: completion.model,
        latency_ms: Date.now() - startedAt,
        finish_reason: choice?.finish_reason,
        prompt_tokens: completion.usage?.prompt_tokens,
        completion_tokens: completion.usage?.completion_tokens,
      },
      "openai call complete"
    );

    // A refusal is the model declining on safety grounds. It is a STRING, not
    // JSON, so treating it as a parse failure would retry into the same refusal.
    if (choice?.message.refusal) {
      throw new HoroscopeAiError(
        "model refused the request",
        "refusal"
      );
    }
    // Truncation is the one failure that silently produces *parseable-looking*
    // partial output on non-strict modes; name it so the caller can raise the
    // token ceiling rather than blaming the schema.
    if (choice?.finish_reason === "length") {
      throw new HoroscopeAiError(
        "response hit the output-token ceiling before completing",
        "truncated"
      );
    }

    const content = choice?.message.content;
    if (typeof content !== "string" || content.trim() === "") {
      throw new HoroscopeAiError("empty response body", "malformed");
    }

    try {
      return JSON.parse(content) as unknown;
    } catch {
      throw new HoroscopeAiError("response was not valid JSON", "malformed");
    }
  }
}
