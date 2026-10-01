import type { FastifyReply, FastifyRequest } from "fastify";
import { paymentTrace, PAYMENT_STAGE } from "@api/core/payment/services/payment-log.js";
import { createModuleLogger } from "@api/shared/logs";
import { sendError, sendSuccess } from "@api/shared/response";
import type { CallbackService } from "@api/core/payment/services/callback.service.js";
import { clientIpFromForwardedFor } from "@api/core/payment/services/callback-auth.js";
import { CALLBACK_HEADER } from "@api/core/payment/constants.js";
import { isPaymentProviderName, type PaymentProviderName } from "@api/shared/config";
import type {
  CallbackAuthenticator,
  PaymentGateway,
} from "@api/core/payment/gateway.js";

const log = createModuleLogger("payment:callback-controller");

// The raw request bytes, retained by the scoped content-type parser on the
// callback route so an HMAC authenticator can verify the signature over the
// exact payload. Undefined on any route without that parser.
declare module "fastify" {
  interface FastifyRequest {
    rawBody?: string;
  }
}

/** One enabled gateway and the authenticator built for it. */
export interface CallbackGateway {
  gateway: PaymentGateway;
  authenticator: CallbackAuthenticator;
}

/**
 * The one thing the controller needs from the TAM-260 callback worker: "a row
 * was just recorded, pick it up". Narrow on purpose — the controller must not
 * be able to await processing, only request it.
 *
 * `kick` is fire-and-forget and must not block on the work: it enqueues and
 * returns (`CallbackWorker.kick` returns whether it queued; the controller
 * ignores that — a row not queued stays `received` for the re-driver). If it
 * throws anyway, the row is still committed and the re-driver claims it, so
 * the controller only logs.
 */
export interface CallbackKicker {
  kick(rowId: string): void;
}

/**
 * Which gateways are acknowledged first and processed afterwards (TAM-260),
 * and the worker that processes them. Absent, or an empty `providers` set, is
 * inline mode for every gateway: byte-identical to before TAM-260.
 */
export interface CallbackDeferral {
  providers: ReadonlySet<PaymentProviderName>;
  worker: CallbackKicker;
}

/**
 * The single provider-callback endpoint: `POST /payment/callbacks/:provider`.
 *
 * Fully generic — it resolves `:provider` against EVERY ENABLED gateway and
 * delegates the provider-specific parts (authentication, body parsing, event
 * classification) to whichever one the path names, so there are no per-provider
 * branches here and a new gateway needs no controller change.
 *
 * WHY THE ENABLED SET AND NOT THE ACTIVE GATEWAY. This used to compare
 * `:provider` against the single boot-time `PAYMENT_PROVIDER` and ack anything
 * else with a 200. The moment a second gateway takes new registrations, every
 * webhook for the first one — settlements, mandate revocations, notification
 * deliveries — hits that branch and is acked. An acked webhook is never
 * redelivered, so those events are lost permanently and silently: the money
 * moved at the bank and nothing here ever hears about it.
 *
 * EVERY registered gateway can therefore receive callbacks, always — that is a
 * fact about which gateways exist, not about configuration, so there is no list
 * to keep in step with reality. A gateway with no credentials configured has no
 * secret to verify against and its authenticator rejects with 401, which is the
 * right answer: a signal the provider retries beats a 200 that drops a real
 * settlement forever.
 *
 * TWO MODES, CHOSEN PER GATEWAY (TAM-260).
 *
 *   - INLINE (every gateway not in `deferral.providers` — the default): the
 *     whole of `CallbackService.ingest` runs before the reply — record the
 *     `webhook_events` row, resolve the mandate, re-read the provider, settle
 *     or dun, stamp the row terminal — exactly as before TAM-260.
 *   - DEFERRED (ACK-FIRST): only `CallbackService.record` runs before the
 *     reply. That is signature verification (above), classification and the
 *     `webhook_events` INSERT with its dedupe. The 200 goes out once the INSERT
 *     has committed, and only then is the row handed to the callback worker
 *     (`kick`), which runs `process` from the stored row. No provider call and
 *     no settlement work is on the request path, so a burst of settlements (a
 *     renewal cycle's NPCI window) cannot push the ack past the forwarder's
 *     timeout. Durability is the committed row: a task that dies after the ack
 *     leaves it `received`/`processing`, and the worker's re-driver claims it.
 *
 * Response policy: 200, fast, for duplicates, unknown references, and
 * unclassifiable events alike. Providers retry any non-2xx, so a 500 on an
 * event we already stored is an infinite retry loop. The non-200s are 401
 * (authentication failed) and a 5xx when the `webhook_events` INSERT itself
 * fails (nothing was stored, so the provider SHOULD retry — in inline mode that
 * throw reaches the app error handler as a 500, in deferred mode it is caught
 * here and answered 500 explicitly). A deferred event is never acked without a
 * committed row. Processing failures are recorded on the callback-event row
 * and reconciled later by the billing sweep, in either mode.
 */
export class PaymentCallbackController {
  constructor(
    private readonly service: CallbackService,
    private readonly gateways: ReadonlyMap<string, CallbackGateway>,
    // Optional so that nothing changes until it is wired: no deferral = every
    // gateway inline, as before TAM-260.
    private readonly deferral: CallbackDeferral | null = null
  ) {}

  handle = async (
    req: FastifyRequest<{ Params: { provider: string } }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    // Behind the ALB, `req.ip` is the load balancer. The real client is the
    // LAST X-Forwarded-For hop — the left-most entry is client-controlled and
    // trivially spoofed.
    const sourceIp =
      clientIpFromForwardedFor(
        req.headers[CALLBACK_HEADER.FORWARDED_FOR] as string | undefined
      ) ?? req.ip;

    const body = (req.body ?? {}) as Record<string, unknown>;

    // ARRIVAL, logged before anything else — but WITHOUT the body.
    //
    // This route is public and unauthenticated by necessity, so anything logged
    // here is logged on behalf of an unauthenticated caller. An earlier version
    // put the full raw body on this line, which turned a public endpoint into
    // an unauthenticated log-injection and log-cost vector: every scanner POST
    // shipped its payload to ClickHouse at INFO. The raw body is still logged
    // in full — after authentication, exactly as before.
    //
    // What is safe to record pre-auth is metadata: who addressed what, from
    // where, and how big it was. That is also what you actually want when
    // diagnosing "the gateway says it is delivering and we see nothing".
    log.info(
      {
        event: "callback_arrived",
        requested_provider: req.params.provider,
        source_ip: sourceIp,
        body_bytes: req.rawBody?.length ?? 0,
      },
      "payment callback arrived"
    );

    // Resolve which gateway this callback belongs to. Only an ENABLED gateway
    // has an authenticator and a secret configured, so one we cannot resolve
    // cannot be authenticated either.
    const resolved = this.gateways.get(req.params.provider);
    if (!resolved) {
      // A gateway we KNOW but have not enabled is a misconfiguration with live
      // consequences — it is delivering real payment events we are acking into
      // the void. Anything else is noise: a scanner, a typo, a stale URL.
      //
      // The distinction decides whether we persist the body, and that is a
      // deliberate trade rather than fastidiousness. Storing bodies for
      // arbitrary path segments would let an unauthenticated caller write an
      // unbounded number of rows by varying the payload — a write-amplification
      // vector on the money database. Storing them for a KNOWN gateway is
      // bounded by the number of gateways that exist and is the only way the
      // lost events can be replayed once the config is fixed.
      const isKnownGateway = isPaymentProviderName(req.params.provider);
      log.error(
        {
          event: "callback_unknown_provider",
          requested_provider: req.params.provider,
          enabled_providers: [...this.gateways.keys()],
          known_gateway: isKnownGateway,
          source_ip: sourceIp,
        },
        isKnownGateway
          ? "callback for a known gateway that is not enabled — its events are being dropped"
          : "callback addressed to an unrecognised gateway — ignored"
      );
      if (isKnownGateway) {
        // Guarded here as well as inside the service, and the redundancy is
        // deliberate: this controller's contract is "the only non-200 is 401".
        // A 5xx makes the provider retry an event we cannot route anyway, which
        // under a burst is an amplification loop against our own endpoint. The
        // invariant belongs at the boundary that has to hold it, not only in
        // whatever that boundary happens to call today.
        //
        // try/catch rather than `.catch()`: it also contains a SYNCHRONOUS
        // throw, which `.catch()` would let escape.
        try {
          await this.service.recordUnroutable({
            provider: req.params.provider,
            body,
            sourceIp,
          });
        } catch (err) {
          log.error(
            {
              ...paymentTrace({ stage: PAYMENT_STAGE.callback, provider: req.params.provider }),
              err,
              event: "callback_unroutable_persist_failed",
              source_ip: sourceIp,
            },
            "could not persist an unroutable callback — acking anyway"
          );
        }
      }
      return sendSuccess(reply, { received: true }, "unknown_provider");
    }
    const { gateway, authenticator } = resolved;

    const authed = authenticator.authenticate({
      headers: req.headers,
      rawBody: req.rawBody,
      sourceIp,
    });
    if (!authed) {
      return sendError(reply, "Unauthorized", 401, "UNAUTHORIZED");
    }

    const kind = gateway.callbackKindFor(body);
    // Extracted before the classification check so an UNCLASSIFIED callback is
    // still logged with whatever ids it carried — that is exactly the case where
    // you need them, because nothing downstream will record it.
    const ref = kind ? gateway.extractRef(kind, body) : null;

    // THE authenticated record of this callback — same event name, same message
    // and same fields as before the multi-gateway change, deliberately: this is
    // what dashboards and incident queries are keyed on, and quietly moving
    // fields to a new event name would make every one of them silently return
    // nothing rather than fail.
    //
    // AFTER authentication, which is what makes logging the raw body defensible.
    // Only a caller who satisfied this gateway's authenticator gets its payload
    // written to our log store.
    //
    // LOGGED RAW, DELIBERATELY, AND UNLIKE EVERY OTHER PAYLOAD IN THIS MODULE.
    // The outbound gateway request/response logs are redacted (`shared/logs/
    // redact.ts`); this one is not. An explicit product decision taken knowing
    // the consequence: a callback carries the payer's UPI handle, phone and
    // email, and these logs leave the building via OpenTelemetry to ClickHouse
    // Cloud. Swapping it for `redactedJson(body)` is a one-line change.
    //
    // `req.rawBody` is preferred over re-stringifying the parsed body: it is the
    // exact bytes the gateway sent, so key order, unknown fields and any
    // formatting quirk survive intact.
    log.info(
      {
        event: "callback_received",
        provider: gateway.name,
        kind: kind ?? "unclassified",
        source_ip: sourceIp,
        // Routing fields lifted out so a callback can be found by id without
        // parsing the body string.
        reference_id: ref?.referenceId ?? null,
        provider_mandate_id: ref?.providerMandateId ?? null,
        callback_txn_id: ref?.callbackTxnId ?? null,
        callback_attempt: ref?.callbackAttempt ?? null,
        // The exact bytes received, untouched.
        body: req.rawBody ?? JSON.stringify(body),
      },
      "payment callback received"
    );
    // `ref` is non-null whenever `kind` is, so this narrows both at once — the
    // second half is defensive and free.
    if (!kind || !ref) {
      // An event the gateway can't (or needn't) route — a Cashfree event type we
      // don't act on, say. Ack it 200 so the provider stops retrying. The body
      // was already logged above, which is the only record it ever gets.
      log.info(
        {
          ...paymentTrace({ stage: PAYMENT_STAGE.callback, provider: gateway.name }),
          event: "callback_unclassified",
          source_ip: sourceIp,
        },
        "callback could not be classified — acknowledged without acting"
      );
      return sendSuccess(reply, { received: true as const }, "ignored");
    }

    if (this.deferral?.providers.has(gateway.name)) {
      return this.acknowledgeFirst(reply, this.deferral.worker, {
        provider: gateway.name,
        kind,
        ref,
        body,
        sourceIp,
      });
    }

    const result = await this.service.ingest({
      provider: gateway.name,
      kind,
      ref,
      body,
      sourceIp,
      now: new Date(),
    });

    // 200 regardless of outcome — see the class comment. The result is reported
    // in the body for our own observability, not for the provider.
    return sendSuccess(reply, { received: true as const }, result);
  };

  /**
   * Deferred mode (TAM-260): record → reply → kick. See the class comment.
   *
   * The order is the contract. The 200 is sent only after `record` resolved,
   * i.e. after the INSERT committed; the kick comes after the reply, so the
   * processing it triggers is never awaited by this request.
   */
  private async acknowledgeFirst(
    reply: FastifyReply,
    worker: CallbackKicker,
    input: Parameters<CallbackService["record"]>[0]
  ): Promise<FastifyReply> {
    let recorded: Awaited<ReturnType<CallbackService["record"]>>;
    try {
      recorded = await this.service.record(input);
    } catch (err) {
      // Nothing was stored. A 200 here would lose the event for good (an acked
      // webhook is never redelivered), so answer 5xx and let the provider
      // retry. Same status the inline path produces for the same failure.
      log.error(
        {
          ...paymentTrace({
            stage: PAYMENT_STAGE.callback,
            provider: input.provider,
            referenceId: input.ref.referenceId,
          }),
          err,
          event: "callback_record_failed",
          kind: input.kind,
        },
        "could not record a deferred callback — not acknowledged, provider will retry"
      );
      return sendError(reply, "Internal Server Error", 500, "INTERNAL_ERROR");
    }

    if (recorded.kind === "duplicate") {
      // `record` already logged `callback_duplicate`. The first delivery's row
      // is the one the worker processes; this one triggers nothing.
      return sendSuccess(reply, { received: true as const }, "duplicate");
    }

    const sent = sendSuccess(reply, { received: true as const }, "accepted");

    try {
      // The worker logs `callback_enqueued` (or why it did not queue) itself.
      worker.kick(recorded.event.id);
    } catch (err) {
      // The reply is already sent and the row is committed `received`, so this
      // loses nothing: the worker's re-driver claims it. Never rethrown — the
      // response is gone and a throw here would only be noise in the error
      // handler.
      log.error(
        {
          ...paymentTrace({
            stage: PAYMENT_STAGE.callback,
            provider: input.provider,
            referenceId: input.ref.referenceId,
          }),
          err,
          event: "callback_kick_failed",
          kind: input.kind,
          webhook_event_id: recorded.event.id,
        },
        "could not queue an acknowledged callback — the re-driver will pick it up"
      );
    }

    return sent;
  }
}
