import { expect, test, vi } from "vitest";
import {
  PaymentCallbackController,
  type CallbackGateway,
} from "../payment.callback.controller.js";
import type { CallbackService } from "../../services/callback.service.js";
import { CALLBACK_KIND } from "@api/core/payment/constants.js";
import type { CallbackKind } from "@api/core/payment/constants.js";
import type { CallbackRef } from "@api/core/payment/types";
import type {
  CallbackAuthenticator,
  PaymentGateway,
} from "@api/core/payment/gateway.js";

const acceptAll: CallbackAuthenticator = { authenticate: () => true };

/** A gateway that classifies everything as a mandate callback. */
function fakeGateway(name: string): PaymentGateway {
  const gateway: PaymentGateway = {
    name: name as PaymentGateway["name"],
    createProvider: vi.fn(),
    createCallbackAuthenticator: vi.fn(),
    callbackKindFor: () => CALLBACK_KIND.MANDATE,
    extractRef: (kind: CallbackKind): CallbackRef => ({
      kind,
      referenceId: `ref_${name}`,
      providerMandateId: null,
      presentationSequenceId: null,
      callbackTxnId: `txn_${name}`,
      callbackAttempt: null,
      notificationDeliveredAt: null,
    }),
  };
  return gateway;
}

function newReply() {
  return { code: vi.fn().mockReturnThis(), send: vi.fn().mockReturnThis() };
}

function controllerFor(
  ingest: ReturnType<typeof vi.fn>,
  names: string[],
  authenticator: CallbackAuthenticator = acceptAll,
  recordUnroutable: ReturnType<typeof vi.fn> = vi.fn()
) {
  const gateways = new Map<string, CallbackGateway>(
    names.map((name) => [name, { gateway: fakeGateway(name), authenticator }])
  );
  return new PaymentCallbackController(
    { ingest, recordUnroutable } as unknown as CallbackService,
    gateways
  );
}

/**
 * The 200 is a control signal, not a report: it tells the gateway to stop
 * redelivering. Acking a callback we cannot authenticate is only defensible
 * while nothing downstream runs — so this asserts both halves at once.
 */
test("a callback for a gateway that is not enabled is acked 200 and never reaches ingest", async () => {
  const ingest = vi.fn();
  const reply = newReply();

  await controllerFor(ingest, ["cashfree"]).handle(
    { params: { provider: "decentro" }, headers: {}, ip: "10.0.0.1" } as never,
    reply as never
  );

  expect(reply.code).toHaveBeenCalledWith(200);
  expect(ingest).not.toHaveBeenCalled();
});

/**
 * A webhook is the one input this system cannot ask for again: we answer 200 to
 * stop the provider retrying, and an acked callback is never redelivered. So an
 * unroutable body must be PERSISTED before that ack, or the evidence of what a
 * gateway told us — and the only thing that could replay it once the config is
 * fixed — is gone permanently.
 */
test("an unroutable callback for a KNOWN gateway is persisted before the ack", async () => {
  const ingest = vi.fn();
  const recordUnroutable = vi.fn();
  const reply = newReply();

  await controllerFor(ingest, ["cashfree"], acceptAll, recordUnroutable).handle(
    {
      params: { provider: "decentro" },
      headers: {},
      ip: "10.0.0.1",
      body: { event: "payment.captured", id: "evt_1" },
    } as never,
    reply as never
  );

  expect(recordUnroutable).toHaveBeenCalledTimes(1);
  expect(recordUnroutable.mock.calls[0]?.[0]).toMatchObject({
    provider: "decentro",
    body: { event: "payment.captured", id: "evt_1" },
  });
  expect(reply.code).toHaveBeenCalledWith(200);
});

/**
 * An UNRECOGNISED path segment is not persisted, and that asymmetry is the
 * point.
 *
 * This route is public and unauthenticated. Storing a body for any path segment
 * would let an unauthenticated caller write an unbounded number of rows to the
 * money database simply by varying the payload — the dedupe key is a hash of
 * the body, so every distinct body is a new row. Bounding persistence to
 * gateways we actually know keeps the evidence where a real misconfiguration
 * produces it, and gives scanner traffic nothing but a log line.
 */
test("an unroutable callback for an UNKNOWN gateway is logged but never persisted", async () => {
  const ingest = vi.fn();
  const recordUnroutable = vi.fn();
  const reply = newReply();

  await controllerFor(ingest, ["cashfree"], acceptAll, recordUnroutable).handle(
    {
      params: { provider: "../../etc/passwd" },
      headers: {},
      ip: "10.0.0.1",
      body: { anything: "x" },
    } as never,
    reply as never
  );

  expect(recordUnroutable).not.toHaveBeenCalled();
  expect(reply.code).toHaveBeenCalledWith(200);
});

/**
 * Persistence is best-effort: it must never turn into a 5xx. A non-2xx makes
 * the provider retry an event we cannot route anyway, which on a burst is an
 * amplification loop against our own endpoint.
 */
test("a failure to persist an unroutable callback still acks 200", async () => {
  const ingest = vi.fn();
  const recordUnroutable = vi.fn().mockRejectedValue(new Error("db down"));
  const reply = newReply();

  await controllerFor(ingest, ["cashfree"], acceptAll, recordUnroutable).handle(
    { params: { provider: "decentro" }, headers: {}, ip: "10.0.0.1", body: {} } as never,
    reply as never
  );

  expect(reply.code).toHaveBeenCalledWith(200);
});

/**
 * THE regression this whole refactor exists for.
 *
 * Selection used to be a single boot-time `PAYMENT_PROVIDER`, and a callback
 * addressed to any other gateway was acked 200 without acting. So the moment a
 * second gateway went active, every settlement webhook for the first one was
 * swallowed — and because an acked webhook is never redelivered, those debits
 * could never be settled. The money moved at the bank and nothing here heard.
 *
 * Both directions are asserted, because "the active one still works" is the
 * half that would keep passing while the other silently broke.
 */
test.each([
  ["razorpay", "the active gateway"],
  ["decentro", "a non-active gateway that still has live mandates"],
])("a callback for %s (%s) is ingested", async (provider) => {
  const ingest = vi.fn().mockResolvedValue("ok");
  const reply = newReply();

  await controllerFor(ingest, ["razorpay", "decentro"]).handle(
    {
      params: { provider },
      headers: {},
      ip: "10.0.0.1",
      body: { some: "payload" },
    } as never,
    reply as never
  );

  expect(reply.code).toHaveBeenCalledWith(200);
  expect(ingest).toHaveBeenCalledTimes(1);
  // Ingested AS ITS OWN gateway. Passing the active gateway's name here would
  // file the event under the wrong provider and defeat the mismatch guard in
  // CallbackService.
  expect(ingest.mock.calls[0]?.[0]).toMatchObject({ provider });
});

/**
 * Each gateway authenticates with its own scheme and its own secret. Sharing
 * one authenticator across the registry would mean a gateway's webhook is
 * verified against another gateway's key — which fails closed, but silently,
 * and looks exactly like the provider having stopped sending callbacks.
 */
test("each gateway authenticates with its own authenticator", async () => {
  const ingest = vi.fn().mockResolvedValue("ok");
  const reply = newReply();
  const rejectAll: CallbackAuthenticator = { authenticate: () => false };

  const gateways = new Map<string, CallbackGateway>([
    ["razorpay", { gateway: fakeGateway("razorpay"), authenticator: rejectAll }],
    ["decentro", { gateway: fakeGateway("decentro"), authenticator: acceptAll }],
  ]);
  const controller = new PaymentCallbackController(
    { ingest } as unknown as CallbackService,
    gateways
  );

  await controller.handle(
    { params: { provider: "razorpay" }, headers: {}, ip: "10.0.0.1", body: {} } as never,
    reply as never
  );
  expect(reply.code).toHaveBeenCalledWith(401);
  expect(ingest).not.toHaveBeenCalled();

  const ok = newReply();
  await controller.handle(
    { params: { provider: "decentro" }, headers: {}, ip: "10.0.0.1", body: {} } as never,
    ok as never
  );
  expect(ok.code).toHaveBeenCalledWith(200);
  expect(ingest).toHaveBeenCalledTimes(1);
});
