/**
 * TAM-260, Task 6: ack-first (deferred) mode of the callback controller.
 *
 * Two harnesses, on purpose:
 *   - Fastify `inject` through the real route (`buildApp` + the same scoped
 *     raw-body parser `core/payment/index.ts` registers), for the status codes a
 *     provider actually sees — including the app error handler's 500 for the
 *     inline path, which a mocked reply cannot show.
 *   - A mocked reply for the ORDER of record → reply → kick, which inject cannot
 *     observe from outside the handler.
 *
 * The inline-mode suite (`payment.callback.controller.test.ts`) is untouched.
 */
import { afterEach, describe, expect, test, vi } from "vitest";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { buildApp } from "@api/app.js";
import {
  PaymentCallbackController,
  type CallbackDeferral,
  type CallbackGateway,
  type CallbackKicker,
} from "../payment.callback.controller.js";
import { registerPaymentCallbackRoutes } from "../../routes/payment.routes.js";
import type {
  CallbackService,
  RecordOutcome,
  StoredCallback,
} from "../../services/callback.service.js";
import { CALLBACK_KIND } from "@api/core/payment/constants.js";
import type { CallbackKind } from "@api/core/payment/constants.js";
import type { CallbackRef } from "@api/core/payment/types";
import type {
  CallbackAuthenticator,
  PaymentGateway,
} from "@api/core/payment/gateway.js";
import type { PaymentProviderName } from "@api/shared/config";

const acceptAll: CallbackAuthenticator = { authenticate: () => true };
const rejectAll: CallbackAuthenticator = { authenticate: () => false };

function fakeGateway(name: PaymentProviderName, classify = true): PaymentGateway {
  return {
    name,
    createProvider: vi.fn(),
    createCallbackAuthenticator: vi.fn(),
    callbackKindFor: () => (classify ? CALLBACK_KIND.PRESENTATION : null),
    extractRef: (kind: CallbackKind): CallbackRef => ({
      kind,
      referenceId: `ref_${name}`,
      providerMandateId: null,
      presentationSequenceId: null,
      callbackTxnId: `pay_${name}`,
      callbackAttempt: null,
      notificationDeliveredAt: null,
    }),
  };
}

function storedFor(provider: PaymentProviderName): StoredCallback {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    provider,
    kind: CALLBACK_KIND.PRESENTATION,
    dedupeKey: `presentation:x:pay_${provider}`,
    referenceId: `ref_${provider}`,
    providerMandateId: null,
    presentationSequenceId: null,
    callbackTxnId: `pay_${provider}`,
    callbackAttempt: null,
    notificationDeliveredAt: null,
    claimAttempt: null,
  };
}

interface ServiceDouble {
  ingest: ReturnType<typeof vi.fn>;
  record: ReturnType<typeof vi.fn>;
  process: ReturnType<typeof vi.fn>;
  recordUnroutable: ReturnType<typeof vi.fn>;
}

function serviceDouble(): ServiceDouble {
  return {
    ingest: vi.fn().mockResolvedValue("processed"),
    record: vi
      .fn()
      .mockResolvedValue({ kind: "accepted", event: storedFor("razorpay") } satisfies RecordOutcome),
    // Processing must never be reached from the request in deferred mode.
    process: vi.fn(() => {
      throw new Error("process() called on the request path");
    }),
    recordUnroutable: vi.fn(),
  };
}

function controllerFor(
  service: ServiceDouble,
  opts: {
    deferral?: CallbackDeferral | null;
    authenticator?: CallbackAuthenticator;
    classify?: boolean;
  } = {}
): PaymentCallbackController {
  const names: PaymentProviderName[] = ["razorpay", "decentro"];
  const gateways = new Map<string, CallbackGateway>(
    names.map((name) => [
      name,
      {
        gateway: fakeGateway(name, opts.classify ?? true),
        authenticator: opts.authenticator ?? acceptAll,
      },
    ])
  );
  return opts.deferral === undefined
    ? new PaymentCallbackController(service as unknown as CallbackService, gateways)
    : new PaymentCallbackController(
        service as unknown as CallbackService,
        gateways,
        opts.deferral
      );
}

function deferRazorpay(worker: CallbackKicker): CallbackDeferral {
  return { providers: new Set<PaymentProviderName>(["razorpay"]), worker };
}

// ---- Fastify inject harness ------------------------------------------------

let app: FastifyInstance | null = null;
afterEach(async () => {
  await app?.close();
  app = null;
});

/** The same child-scope wiring `core/payment/index.ts` does, on the real app. */
async function appFor(controller: PaymentCallbackController): Promise<FastifyInstance> {
  const built = await buildApp();
  await built.register(
    (scoped, _opts, done) => {
      scoped.addContentTypeParser(
        "application/json",
        { parseAs: "string" },
        (
          req: FastifyRequest,
          raw: string,
          parsed: (err: Error | null, body?: unknown) => void
        ) => {
          req.rawBody = raw;
          try {
            parsed(null, raw.length > 0 ? JSON.parse(raw) : {});
          } catch (err) {
            parsed(err as Error, undefined);
          }
        }
      );
      registerPaymentCallbackRoutes(scoped, controller);
      done();
    },
    { prefix: "/payment" }
  );
  await built.ready();
  app = built;
  return built;
}

async function post(target: FastifyInstance, provider: string) {
  const res = await target.inject({
    method: "POST",
    url: `/payment/callbacks/${provider}`,
    headers: { "content-type": "application/json" },
    payload: JSON.stringify({ event: "payment.failed", payload: {} }),
  });
  return { status: res.statusCode, body: res.json<Record<string, unknown>>() };
}

describe("deferred mode (razorpay in the deferred set)", () => {
  test("record → reply 200 `accepted` → kick, and processing is never awaited", async () => {
    const order: string[] = [];
    const service = serviceDouble();
    service.record.mockImplementation(() => {
      order.push("record");
      return Promise.resolve({
        kind: "accepted",
        event: storedFor("razorpay"),
      } satisfies RecordOutcome);
    });
    // A worker whose processing never finishes: if the request awaited it, the
    // handler below would never resolve and the test would time out.
    const kick = vi.fn((rowId: string) => {
      order.push(`kick:${rowId}`);
      void new Promise<never>(() => undefined);
    });
    const reply = {
      code: vi.fn().mockReturnThis(),
      send: vi.fn(function (this: unknown) {
        order.push("reply");
        return this;
      }),
    };

    await controllerFor(service, { deferral: deferRazorpay({ kick }) }).handle(
      { params: { provider: "razorpay" }, headers: {}, ip: "10.0.0.1", body: {} } as never,
      reply as never
    );

    expect(order).toEqual(["record", "reply", `kick:${storedFor("razorpay").id}`]);
    expect(reply.code).toHaveBeenCalledWith(200);
    expect(reply.send).toHaveBeenCalledWith({
      success: true,
      message: "accepted",
      data: { received: true },
    });
    expect(service.process).not.toHaveBeenCalled();
    expect(service.ingest).not.toHaveBeenCalled();
    // Recorded AS ITS OWN gateway, with the extracted ref — same input `ingest`
    // got before, minus `now` (processing time belongs to the worker).
    expect(service.record).toHaveBeenCalledTimes(1);
    expect(service.record.mock.calls[0]?.[0]).toMatchObject({
      provider: "razorpay",
      kind: CALLBACK_KIND.PRESENTATION,
      ref: { referenceId: "ref_razorpay", callbackTxnId: "pay_razorpay" },
      sourceIp: "10.0.0.1",
    });
    expect(service.record.mock.calls[0]?.[0]).not.toHaveProperty("now");
  });

  test("over HTTP: 200 {received:true} with message `accepted`", async () => {
    const service = serviceDouble();
    const kick = vi.fn();
    const res = await post(
      await appFor(controllerFor(service, { deferral: deferRazorpay({ kick }) })),
      "razorpay"
    );

    expect(res).toEqual({
      status: 200,
      body: { success: true, message: "accepted", data: { received: true } },
    });
    expect(kick).toHaveBeenCalledWith(storedFor("razorpay").id);
    expect(service.process).not.toHaveBeenCalled();
    expect(service.ingest).not.toHaveBeenCalled();
  });

  test("a duplicate gets today's duplicate ack and is NOT kicked", async () => {
    const service = serviceDouble();
    service.record.mockResolvedValue({ kind: "duplicate" } satisfies RecordOutcome);
    const kick = vi.fn();

    const res = await post(
      await appFor(controllerFor(service, { deferral: deferRazorpay({ kick }) })),
      "razorpay"
    );

    // Byte-identical to the inline duplicate: `ingest` returned "duplicate" and
    // the controller used it as the message.
    expect(res).toEqual({
      status: 200,
      body: { success: true, message: "duplicate", data: { received: true } },
    });
    expect(kick).not.toHaveBeenCalled();
    expect(service.process).not.toHaveBeenCalled();
  });

  test("a record failure (INSERT did not commit) is a 5xx, never a 200, and is not kicked", async () => {
    const service = serviceDouble();
    service.record.mockRejectedValue(new Error("connection refused"));
    const kick = vi.fn();

    const res = await post(
      await appFor(controllerFor(service, { deferral: deferRazorpay({ kick }) })),
      "razorpay"
    );

    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({ success: false, errorCode: "INTERNAL_ERROR" });
    expect(kick).not.toHaveBeenCalled();
  });

  test("the record-failure status equals the inline path's for the same failure", async () => {
    const inline = serviceDouble();
    inline.ingest.mockRejectedValue(new Error("connection refused"));
    const inlineRes = await post(await appFor(controllerFor(inline)), "razorpay");
    await app?.close();
    app = null;

    const deferred = serviceDouble();
    deferred.record.mockRejectedValue(new Error("connection refused"));
    const deferredRes = await post(
      await appFor(controllerFor(deferred, { deferral: deferRazorpay({ kick: vi.fn() }) })),
      "razorpay"
    );

    expect(inlineRes.status).toBe(500);
    expect(deferredRes.status).toBe(inlineRes.status);
    expect(deferredRes.body).toEqual(inlineRes.body);
  });

  test("a kick that throws still leaves the 200 (row is committed; the re-driver owns it)", async () => {
    const service = serviceDouble();
    const kick = vi.fn(() => {
      throw new Error("queue closed");
    });

    const res = await post(
      await appFor(controllerFor(service, { deferral: deferRazorpay({ kick }) })),
      "razorpay"
    );

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ message: "accepted" });
    expect(kick).toHaveBeenCalledTimes(1);
  });

  test("a bad signature is 401, as today, and nothing is recorded or kicked", async () => {
    const service = serviceDouble();
    const kick = vi.fn();

    const res = await post(
      await appFor(
        controllerFor(service, {
          deferral: deferRazorpay({ kick }),
          authenticator: rejectAll,
        })
      ),
      "razorpay"
    );

    expect(res).toEqual({
      status: 401,
      body: {
        success: false,
        message: "Unauthorized",
        data: null,
        errorCode: "UNAUTHORIZED",
      },
    });
    expect(service.record).not.toHaveBeenCalled();
    expect(service.ingest).not.toHaveBeenCalled();
    expect(kick).not.toHaveBeenCalled();
  });

  test("an unclassified event is acked `ignored`, as today, and nothing is recorded", async () => {
    const service = serviceDouble();
    const kick = vi.fn();

    const res = await post(
      await appFor(
        controllerFor(service, { deferral: deferRazorpay({ kick }), classify: false })
      ),
      "razorpay"
    );

    expect(res).toEqual({
      status: 200,
      body: { success: true, message: "ignored", data: { received: true } },
    });
    expect(service.record).not.toHaveBeenCalled();
    expect(kick).not.toHaveBeenCalled();
  });

  test("an unknown provider is acked `unknown_provider`, as today", async () => {
    const service = serviceDouble();
    const kick = vi.fn();

    const res = await post(
      await appFor(controllerFor(service, { deferral: deferRazorpay({ kick }) })),
      "nope"
    );

    expect(res).toEqual({
      status: 200,
      body: { success: true, message: "unknown_provider", data: { received: true } },
    });
    expect(service.record).not.toHaveBeenCalled();
    expect(kick).not.toHaveBeenCalled();
  });

  test("a provider NOT in the deferred set (decentro) takes the unchanged inline path", async () => {
    const service = serviceDouble();
    // The sibling-app case: inline `ingest` concludes unknown_reference.
    service.ingest.mockResolvedValue("unknown_reference");
    const kick = vi.fn();

    const res = await post(
      await appFor(controllerFor(service, { deferral: deferRazorpay({ kick }) })),
      "decentro"
    );

    expect(res).toEqual({
      status: 200,
      body: { success: true, message: "unknown_reference", data: { received: true } },
    });
    expect(service.ingest).toHaveBeenCalledTimes(1);
    expect(service.ingest.mock.calls[0]?.[0]).toMatchObject({ provider: "decentro" });
    expect(service.ingest.mock.calls[0]?.[0]).toHaveProperty("now");
    expect(service.record).not.toHaveBeenCalled();
    expect(kick).not.toHaveBeenCalled();
  });
});

describe("no deferral (the default) is today's behaviour for razorpay", () => {
  test.each([
    ["no deferral argument", undefined],
    ["null deferral", null],
    [
      "an EMPTY deferred set",
      { providers: new Set<PaymentProviderName>(), worker: { kick: vi.fn() } },
    ],
  ] as const)("%s → inline ingest, message = ingest's result", async (_label, deferral) => {
    for (const result of ["processed", "duplicate", "unknown_reference", "failed"] as const) {
      const service = serviceDouble();
      service.ingest.mockResolvedValue(result);

      const res = await post(
        await appFor(controllerFor(service, { deferral })),
        "razorpay"
      );
      await app?.close();
      app = null;

      expect(res).toEqual({
        status: 200,
        body: { success: true, message: result, data: { received: true } },
      });
      expect(service.ingest).toHaveBeenCalledTimes(1);
      expect(service.record).not.toHaveBeenCalled();
      expect(service.process).not.toHaveBeenCalled();
    }
    if (deferral) expect(deferral.worker.kick).not.toHaveBeenCalled();
  });
});
