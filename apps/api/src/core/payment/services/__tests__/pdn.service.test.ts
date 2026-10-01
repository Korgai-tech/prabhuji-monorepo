import { beforeEach, describe, expect, test, vi } from "vitest";
import type { MandateRow } from "../../repositories/mandate.repository.js";
import type { PdnRepository, PdnRow } from "../../repositories/pdn.repository.js";
import type {
  RecurringDebitRow,
  TransactionsRepository,
} from "../../repositories/transactions.repository.js";
import type {
  MandateProvider,
  PreDebitInput,
  PreDebitStatusInput,
} from "../../mandate.provider.js";
import {
  DuplicateReferenceError,
  NoSuchDebitError,
  PreDebitTooSoonError,
} from "../../mandate.provider.js";
import {
  MAX_PDN_DISPATCH_ATTEMPTS,
  PRESENTATION_NOTICE_MARGIN_MS,
  PdnService,
} from "../pdn.service.js";
import { paymentLedgerAnalytics } from "../payment-ledger-analytics.service.js";

/**
 * The pre-debit notification state machine.
 *
 * What is worth testing here is the DECISION TABLE, because every cell of it was
 * previously collapsed into "success or throw" — and that collapse is the bug that
 * made every Decentro cycle fail. Decentro's notify is asynchronous: it accepts the
 * notification and issues the `presentation_sequence_id` later, so "accepted with no
 * id yet" is the normal answer and had to become a representable state rather than
 * an exception.
 *
 * Three cells matter most:
 *
 *   ACCEPTED + id   → the ledger row moves to `notified` and a debit can be presented.
 *   ACCEPTED, no id → the ledger row STAYS `pending`. It must not become `notified`,
 *                     because a row with no sequence id cannot be presented and
 *                     would sit in a state the presentation query believes is ready.
 *   TERMINAL        → re-arm if there is budget, otherwise write the cycle off — and
 *                     NEVER re-arm a row that already holds a sequence id.
 *
 * That last clause is what makes mapping an unrecognised provider status to `failed`
 * safe. Without it, one unfamiliar status string would clear a valid notification
 * and silently lose the cycle's money.
 */

const CYCLE = new Date(Date.UTC(2026, 7, 24));
const NOW = new Date(Date.UTC(2026, 7, 22, 9));

function pdnRow(overrides: Partial<PdnRow> = {}): PdnRow {
  return {
    id: "pdn-1",
    mandateId: "mnd-1",
    userId: "usr-1",
    cycleDate: CYCLE,
    referenceId: "pj_pdn_1",
    presentationSequenceId: null,
    amountPaise: 29900,
    // NULL, not the cycle date: the column stopped being seeded in TAM-164, so a
    // fixture carrying a seed would be testing a shape the database can no
    // longer produce.
    scheduledDebitAt: null,
    status: "pending",
    attempts: 0,
    failureReason: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function debitRow(): RecurringDebitRow {
  return {
    id: "txn-1",
    mandateId: "mnd-1",
    cycleDate: CYCLE,
    amountPaise: 29900,
    currency: "INR",
  } as unknown as RecurringDebitRow;
}

const mandate = {
  id: "mnd-1",
  userId: "usr-1",
  referenceId: "pj_mnd_1",
  providerMandateId: "dm_1",
} as unknown as MandateRow;

/** Repos and provider as spies, so each test asserts which write happened. */
function harness(opts: {
  pdn?: PdnRow;
  notify?: () => Promise<unknown>;
  status?: () => Promise<unknown>;
  rearmSucceeds?: boolean;
  /**
   * The gateway's declared turnaround. `null` is the Decentro shape (it reports
   * its own instant); a number is the Razorpay shape (it reports none, so one
   * is synthesised at dispatch).
   */
  presentationTatHours?: number | null;
}) {
  const row = opts.pdn ?? pdnRow();

  const findOrCreateForCycle = vi.fn().mockResolvedValue(row);
  const applyDispatchResult = vi.fn().mockResolvedValue(row);
  const applyStatus = vi.fn().mockResolvedValue(row);
  const rearm = vi.fn().mockResolvedValue(opts.rearmSucceeds ?? true);
  const markFailed = vi.fn().mockResolvedValue(undefined);
  // Echoes back whatever reference it is handed, as the real one does on a
  // successful rotation.
  const rotateReference = vi
    .fn()
    .mockImplementation((_id: string, referenceId: string) =>
      Promise.resolve(referenceId)
    );
  const pdns = {
    findOrCreateForCycle,
    applyDispatchResult,
    applyStatus,
    rearm,
    rotateReference,
    markFailed,
    findByReferenceId: vi.fn().mockResolvedValue(null),
    findByPresentationSequenceId: vi.fn().mockResolvedValue(null),
  } as unknown as PdnRepository;

  const linkPdn = vi.fn().mockResolvedValue(true);
  const markNotified = vi.fn().mockResolvedValue(true);
  const markNotifyAccepted = vi.fn().mockResolvedValue(true);
  const markNotifyFailed = vi.fn().mockResolvedValue(undefined);
  const findByPdnId = vi.fn().mockResolvedValue(debitRow());
  const transactions = {
    linkPdn,
    markNotified,
    markNotifyAccepted,
    markNotifyFailed,
    findByPdnId,
  } as unknown as TransactionsRepository;

  // Typed via the generic rather than left to inference: `vi.fn()` over a
  // zero-arg thunk infers `calls: []`, so every `mock.calls[0][0]` read below is
  // a type error even though the call really does carry an argument. Same shape
  // the Decentro adapter's `fakeClient` uses, and for the same reason.
  const notifyPreDebit = vi.fn<(input: PreDebitInput) => Promise<unknown>>(
    opts.notify ??
      (() => Promise.resolve({ presentationSequenceId: null, status: "sent", providerTxnId: null }))
  );
  const getPreDebitStatus = vi.fn<(input: PreDebitStatusInput) => Promise<unknown>>(
    opts.status ??
      (() =>
        Promise.resolve({
          status: "sent",
          presentationSequenceId: null,
          failureCode: null,
          failureMessage: null,
        }))
  );
  const provider = {
    notifyPreDebit,
    getPreDebitStatus,
    presentationTatHours:
      "presentationTatHours" in opts ? opts.presentationTatHours : null,
  } as unknown as MandateProvider;

  return {
    svc: new PdnService(pdns, transactions, () => provider),
    row,
    spies: {
      findOrCreateForCycle,
      applyDispatchResult,
      applyStatus,
      rearm,
      rotateReference,
      markFailed,
      linkPdn,
      markNotified,
      markNotifyAccepted,
      markNotifyFailed,
      notifyPreDebit,
      getPreDebitStatus,
    },
  };
}

describe("dispatch — the decision table", () => {
  test("accepted WITH a sequence id moves the ledger row to notified", async () => {
    const { svc, spies } = harness({
      notify: () =>
        Promise.resolve({
          presentationSequenceId: "seq_1",
          status: "accepted",
          providerTxnId: "dt_1",
        }),
    });

    const outcome = await svc.dispatch(mandate, debitRow(), NOW);

    expect(outcome.accepted).toBe(true);
    expect(spies.markNotified).toHaveBeenCalledWith("txn-1", {
      presentationSequenceId: "seq_1",
      gatewayPaymentId: "dt_1",
      at: NOW,
    });
    expect(spies.markNotifyAccepted).not.toHaveBeenCalled();
  });

  test("accepted with NO sequence id leaves the ledger row pending", async () => {
    // THE case the old code threw on. `markNotified` must NOT be called: a row with
    // no sequence id cannot be presented, and `findAwaitingSubmission` requires
    // both `notified` AND a non-null id, so marking it notified would put it in a
    // state the presentation query half-believes is ready.
    const { svc, spies } = harness({
      notify: () =>
        Promise.resolve({ presentationSequenceId: null, status: "sent", providerTxnId: null }),
    });

    const outcome = await svc.dispatch(mandate, debitRow(), NOW);

    expect(outcome.awaitingSequenceId).toBe(true);
    expect(outcome.failed).toBe(false);
    expect(spies.markNotifyAccepted).toHaveBeenCalledWith("txn-1", { at: NOW });
    expect(spies.markNotified).not.toHaveBeenCalled();
  });

  test("the notification row is created and linked BEFORE dispatch", async () => {
    // Persist-before-dispatch: a transport failure must still leave the reference
    // the recovery sweep asks the gateway about.
    const { svc, spies } = harness({});
    await svc.dispatch(mandate, debitRow(), NOW);

    expect(spies.findOrCreateForCycle).toHaveBeenCalledTimes(1);
    expect(spies.linkPdn).toHaveBeenCalledWith("txn-1", "pdn-1");
    const linkOrder = spies.linkPdn.mock.invocationCallOrder[0];
    const notifyOrder = spies.notifyPreDebit.mock.invocationCallOrder[0];
    expect(linkOrder).toBeLessThan(notifyOrder);
  });

  test("both references are passed, and they are not the same one", async () => {
    // TWO fields, because the gateways need different things and overloading one
    // breaks whichever gateway loses. `notificationRef` is what Decentro puts in the
    // wire `reference_id`, fresh per attempt — sending the mandate's there is what
    // made cycle 2 onward fail with `error_duplicate_reference_id`. But Cashfree
    // derives its base payment id from the MANDATE's reference and the stub looks
    // its registered mandates up by it, so that one has to survive too.
    const { svc, spies } = harness({});
    await svc.dispatch(mandate, debitRow(), NOW);

    const sent = spies.notifyPreDebit.mock.calls[0]?.[0] as {
      referenceId: string;
      notificationRef: string;
    };
    expect(sent.referenceId).toBe("pj_mnd_1");
    expect(sent.notificationRef).toMatch(/^pj_pdn_/);
    expect(sent.notificationRef).not.toBe(sent.referenceId);
  });

  test("the wire reference is rotated before EVERY send, not just on re-arm", async () => {
    // Decentro burns a `reference_id` on any request it sees, including one it
    // REJECTS. `rearm` rotated on the failure path, but the defer paths returned
    // without writing and re-sent the same value next tick — so a cycle rejected
    // once as premature came back `error_duplicate_reference_id` forever instead
    // of being retried. Rotating at the single dispatch point means no error
    // branch can forget.
    const { svc, spies } = harness({});
    await svc.dispatch(mandate, debitRow(), NOW);
    await svc.dispatch(mandate, debitRow(), NOW);

    expect(spies.rotateReference).toHaveBeenCalledTimes(2);
    const first = spies.notifyPreDebit.mock.calls[0]?.[0] as { notificationRef: string };
    const second = spies.notifyPreDebit.mock.calls[1]?.[0] as { notificationRef: string };
    expect(second.notificationRef).not.toBe(first.notificationRef);
    // And what went on the wire is what the row now holds — the rotation is
    // persisted BEFORE the send, so a timed-out call is still findable by it.
    expect(spies.rotateReference.mock.calls[1]?.[1]).toBe(second.notificationRef);
  });

  test("a duplicate-reference reconcile queries the ROTATED reference", async () => {
    // The trap the rotation introduced. `pdn` is read before the rotation, so
    // its `referenceId` is a value no longer on the row and no longer on the
    // wire. `handleDispatchError` hands that object to `refreshFromProvider`,
    // which looks a notification up BY reference when it holds no sequence id —
    // so reconciling against the stale value asks the gateway about the wrong
    // notification, gets "no such record", and defers a cycle that may have
    // landed.
    const { svc, spies } = harness({
      notify: () => Promise.reject(new DuplicateReferenceError("already have it")),
    });
    await svc.dispatch(mandate, debitRow(), NOW);

    const sent = spies.notifyPreDebit.mock.calls[0]?.[0] as { notificationRef: string };
    expect(spies.getPreDebitStatus).toHaveBeenCalledWith(
      expect.objectContaining({ referenceId: sent.notificationRef })
    );
    // And explicitly NOT the pre-rotation value the row was created with.
    expect(spies.getPreDebitStatus).not.toHaveBeenCalledWith(
      expect.objectContaining({ referenceId: "pj_pdn_1" })
    );
  });

  test("a refused rotation sends what the row actually holds", async () => {
    // `rotateReference` declines when the notification already has a sequence id
    // — it is addressable, and our stored reference is how a status read finds it
    // when the id is unavailable. Rotating then would orphan it. The caller must
    // send the returned value, not the one it offered.
    const { svc, spies } = harness({});
    spies.rotateReference.mockResolvedValueOnce("pj_pdn_already_held");
    await svc.dispatch(mandate, debitRow(), NOW);

    expect(spies.notifyPreDebit).toHaveBeenCalledWith(
      expect.objectContaining({ notificationRef: "pj_pdn_already_held" })
    );
  });
});

/**
 * The synthesised presentation instant (TAM-164).
 *
 * Two gateways answer "when may this be presented?" in two different ways, and
 * conflating them is what this suite pins:
 *
 *   Decentro reports its own `debit_date` on the status read. Nothing is
 *     synthesised — a guess must never displace a fact the vendor supplies, or
 *     the two diverge the day the vendor changes its turnaround.
 *
 *   Razorpay reports NOTHING. Without a synthesised instant the row keeps a
 *     null and `canPresentDebit` releases the debit at the cycle date's
 *     midnight — for a one-day trial only hours after the notification, under
 *     the gateway's TAT, so every presentation is rejected. The rejection is
 *     expensive: the order is spent, the retry budget burns, the cycle settles
 *     failed, and NPCI auto-revokes a mandate whose FIRST debit fails.
 *
 * It is written at DISPATCH because that is the last moment the notification
 * instant is knowable — the presentation sweep sees only the row.
 */
describe("dispatch — the presentation instant", () => {
  test("a gateway that reports no instant gets one synthesised from its TAT", async () => {
    const { svc, spies } = harness({
      presentationTatHours: 25,
      notify: () =>
        Promise.resolve({
          presentationSequenceId: "order_1",
          status: "accepted",
          providerTxnId: null,
        }),
    });

    await svc.dispatch(mandate, debitRow(), NOW);

    // notice period PLUS the boundary margin — the gateway's rule is
    // "25 hours AFTER", so exactly 25h is rejected.
    const expected = new Date(
      NOW.getTime() + 25 * 3_600_000 + PRESENTATION_NOTICE_MARGIN_MS
    );
    expect(spies.applyDispatchResult.mock.calls[0][1]).toMatchObject({
      scheduledDebitAt: expected,
    });
  });

  test("the SAME instant goes on the wire and onto the row", async () => {
    // Minted once and used twice, deliberately. Deriving it separately at each
    // site would put two clock readings a few milliseconds apart into a field
    // the presentation gate compares against — invisible until a debit landed on
    // the wrong side of an NPCI window boundary.
    const { svc, spies } = harness({
      presentationTatHours: 25,
      notify: () =>
        Promise.resolve({
          presentationSequenceId: "order_1",
          status: "accepted",
          providerTxnId: null,
        }),
    });

    await svc.dispatch(mandate, debitRow(), NOW);

    // Read off the TYPED spy, then asserted against the row through a matcher —
    // `applyDispatchResult` is an untyped `vi.fn()`, so binding its argument to a
    // local would be an unsafe `any` assignment and a lint failure.
    const onTheWire = spies.notifyPreDebit.mock.calls[0][0].notBefore;
    expect(onTheWire).not.toBeNull();
    expect(spies.applyDispatchResult).toHaveBeenCalledWith(
      "pdn-1",
      expect.objectContaining({ scheduledDebitAt: onTheWire })
    );
  });

  test("a gateway that reports its own instant has nothing synthesised for it", async () => {
    const { svc, spies } = harness({
      presentationTatHours: null,
      notify: () =>
        Promise.resolve({
          presentationSequenceId: "seq_1",
          status: "accepted",
          providerTxnId: null,
        }),
    });

    await svc.dispatch(mandate, debitRow(), NOW);

    // Null on both sides, and null through `applyDispatchResult` means "leave it
    // alone" — never "erase it" — so the value the status read later learns is
    // not at risk from this write.
    expect(spies.notifyPreDebit.mock.calls[0][0].notBefore).toBeNull();
    expect(spies.applyDispatchResult.mock.calls[0][1]).toMatchObject({
      scheduledDebitAt: null,
    });
  });

  test("an adapter that declares nothing at all synthesises nothing, never NaN", async () => {
    // Reachable only through a cast, which is how every fake here is built — but
    // `undefined * 3_600_000` is NaN, and an Invalid Date on `scheduled_debit_at`
    // compares false against everything, so the presentation gate would pass or
    // fail at random rather than fail loudly.
    const { svc, spies } = harness({
      presentationTatHours: undefined,
      notify: () =>
        Promise.resolve({
          presentationSequenceId: "seq_1",
          status: "accepted",
          providerTxnId: null,
        }),
    });

    await svc.dispatch(mandate, debitRow(), NOW);

    expect(spies.applyDispatchResult.mock.calls[0][1]).toMatchObject({
      scheduledDebitAt: null,
    });
  });
});

describe("dispatch — provider errors get three different answers", () => {
  test("too soon DEFERS, leaving both rows untouched", async () => {
    // Premature in the 24-48h window. The next tick is 30 minutes later and inside
    // it, so recording a failure would burn a re-arm from a finite budget and
    // eventually abandon a cycle nothing was ever wrong with.
    const { svc, spies } = harness({
      notify: () => Promise.reject(new PreDebitTooSoonError()),
    });

    const outcome = await svc.dispatch(mandate, debitRow(), NOW);

    expect(outcome.deferred).toBe(true);
    expect(outcome.failed).toBe(false);
    expect(spies.markNotifyFailed).not.toHaveBeenCalled();
    expect(spies.rearm).not.toHaveBeenCalled();
  });

  test("a duplicate reference RECONCILES by status rather than re-arming", async () => {
    // The gateway already has our reference, so the previous attempt landed.
    // Re-arming would mint a new one and abandon a notification it considers live.
    const { svc, spies } = harness({
      notify: () => Promise.reject(new DuplicateReferenceError()),
      status: () =>
        Promise.resolve({
          status: "accepted",
          presentationSequenceId: "seq_recovered",
          failureCode: null,
          failureMessage: null,
        }),
    });

    const outcome = await svc.dispatch(mandate, debitRow(), NOW);

    expect(spies.getPreDebitStatus).toHaveBeenCalledTimes(1);
    expect(spies.rearm).not.toHaveBeenCalled();
    expect(outcome.accepted).toBe(true);
  });

  test("any other error fails the cycle and re-arms while budget remains", async () => {
    const { svc, spies } = harness({
      notify: () => Promise.reject(new Error("socket hang up")),
    });

    const outcome = await svc.dispatch(mandate, debitRow(), NOW);

    expect(spies.rearm).toHaveBeenCalledTimes(1);
    expect(outcome.rearmed).toBe(true);
  });

  test("the re-arm budget is finite — the last attempt writes the cycle off", async () => {
    const { svc, spies } = harness({
      pdn: pdnRow({ attempts: MAX_PDN_DISPATCH_ATTEMPTS - 1 }),
      notify: () => Promise.reject(new Error("socket hang up")),
    });

    const outcome = await svc.dispatch(mandate, debitRow(), NOW);

    expect(spies.rearm).not.toHaveBeenCalled();
    expect(outcome.failed).toBe(true);
    expect(spies.markNotifyFailed).toHaveBeenCalledWith(
      "txn-1",
      expect.objectContaining({ failureCode: "PDN_ERROR" })
    );
  });
});

describe("refreshFromProvider", () => {
  test("a sequence id arriving later promotes the ledger row", async () => {
    const { svc, spies } = harness({
      pdn: pdnRow({ status: "sent" }),
      status: () =>
        Promise.resolve({
          status: "accepted",
          presentationSequenceId: "seq_late",
          failureCode: null,
          failureMessage: null,
        }),
    });

    const outcome = await svc.refreshFromProvider(pdnRow({ status: "sent" }), NOW);

    expect(outcome.accepted).toBe(true);
    expect(spies.markNotified).toHaveBeenCalledWith(
      "txn-1",
      expect.objectContaining({ presentationSequenceId: "seq_late" })
    );
  });

  test("a transport failure defers rather than advancing anything", async () => {
    const { svc, spies } = harness({
      status: () => Promise.reject(new Error("timeout")),
    });

    const outcome = await svc.refreshFromProvider(pdnRow(), NOW);

    expect(outcome.deferred).toBe(true);
    expect(spies.applyStatus).not.toHaveBeenCalled();
    expect(spies.markNotifyFailed).not.toHaveBeenCalled();
  });

  test("NoSuchDebitError propagates — only the caller may supersede", async () => {
    // It owns the money row, so it owns the decision to hand the cycle to a new
    // claim. Swallowing this here would strand the cycle forever.
    const { svc } = harness({
      status: () => Promise.reject(new NoSuchDebitError()),
    });

    await expect(svc.refreshFromProvider(pdnRow(), NOW)).rejects.toBeInstanceOf(
      NoSuchDebitError
    );
  });

  test("a terminal status re-arms rather than writing off, while budget remains", async () => {
    const { svc, spies } = harness({
      status: () =>
        Promise.resolve({
          status: "failed",
          presentationSequenceId: null,
          failureCode: "error_x",
          failureMessage: "provider said no",
        }),
    });

    const outcome = await svc.refreshFromProvider(pdnRow(), NOW);

    expect(outcome.rearmed).toBe(true);
    expect(spies.rearm).toHaveBeenCalledWith(
      "pdn-1",
      expect.objectContaining({ currentAttempts: 0 })
    );
  });

  test("a refused re-arm (a sequence id IS held) writes the cycle off instead", async () => {
    // THE guard that makes unknown-status → `failed` safe. The repository refuses to
    // re-arm a notification holding a sequence id, because clearing it would cancel
    // a live notification and lose the cycle's money. The service must then write
    // off rather than loop.
    const { svc, spies } = harness({
      rearmSucceeds: false,
      status: () =>
        Promise.resolve({
          status: "failed",
          presentationSequenceId: null,
          failureCode: null,
          failureMessage: null,
        }),
    });

    const outcome = await svc.refreshFromProvider(pdnRow(), NOW);

    expect(spies.rearm).toHaveBeenCalledTimes(1);
    expect(outcome.rearmed).toBe(false);
    expect(outcome.failed).toBe(true);
    expect(spies.markFailed).toHaveBeenCalled();
  });

  test("no live money row means nothing to advance, and no provider call", async () => {
    // The claim was superseded out from under this notification, so the replacement
    // carries its own dispatch. Asserting the provider is NOT called matters: a
    // status read here would be a wasted call on every sweep, forever.
    const getPreDebitStatus = vi.fn();
    const svc = new PdnService(
      {} as unknown as PdnRepository,
      { findByPdnId: vi.fn().mockResolvedValue(null) } as unknown as TransactionsRepository,
      () => ({ getPreDebitStatus }) as unknown as MandateProvider
    );

    const outcome = await svc.refreshFromProvider(pdnRow(), NOW);

    expect(outcome.accepted).toBe(false);
    expect(outcome.failed).toBe(false);
    expect(getPreDebitStatus).not.toHaveBeenCalled();
  });
});

describe("findForCallback", () => {
  let svc: PdnService;
  let findByReferenceId: ReturnType<typeof vi.fn>;
  let findByPresentationSequenceId: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    findByReferenceId = vi.fn().mockResolvedValue(null);
    findByPresentationSequenceId = vi.fn().mockResolvedValue(null);
    svc = new PdnService(
      { findByReferenceId, findByPresentationSequenceId } as unknown as PdnRepository,
      {} as unknown as TransactionsRepository,
      () => ({}) as unknown as MandateProvider
    );
  });

  test("OUR reference is tried first — it is unique and always present", async () => {
    findByReferenceId.mockResolvedValue(pdnRow());
    const found = await svc.findForCallback({
      referenceId: "pj_pdn_1",
      presentationSequenceId: "seq_1",
    });

    expect(found?.id).toBe("pdn-1");
    expect(findByPresentationSequenceId).not.toHaveBeenCalled();
  });

  test("their sequence id is the fallback when our reference does not match", async () => {
    findByPresentationSequenceId.mockResolvedValue(pdnRow({ id: "pdn-2" }));
    const found = await svc.findForCallback({
      referenceId: "unknown",
      presentationSequenceId: "seq_1",
    });

    expect(found?.id).toBe("pdn-2");
  });

  test("neither present resolves to null rather than throwing", async () => {
    const found = await svc.findForCallback({
      referenceId: null,
      presentationSequenceId: null,
    });
    expect(found).toBeNull();
  });
});

/**
 * A delivery confirmation corrects the presentation instant (TAM-164).
 *
 * The turnaround runs from when the notification reached the PAYER, and the best
 * figure available at dispatch is our own call instant — earlier by however long
 * delivery took. So the stored instant is optimistic, and optimistic is the
 * expensive direction: presenting before the gateway accepts it spends the
 * order, burns the retry budget, settles the cycle failed, and NPCI revokes a
 * mandate whose first debit fails.
 *
 * The correction is MONOTONIC. That is the whole safety argument: no webhook,
 * redelivered or out of order, can pull a debit forward.
 */
describe("recordNotificationDelivered", () => {
  const DELIVERED = new Date(NOW.getTime() + 20 * 60_000);

  test("pushes the instant out to delivery + TAT", async () => {
    const { svc, spies } = harness({ presentationTatHours: 25 });

    await svc.recordNotificationDelivered(
      pdnRow({ scheduledDebitAt: new Date(NOW.getTime() + 25 * 3_600_000) }),
      "razorpay",
      DELIVERED
    );

    expect(spies.applyStatus).toHaveBeenCalledWith(
      "pdn-1",
      expect.objectContaining({
        scheduledDebitAt: new Date(
          DELIVERED.getTime() + 25 * 3_600_000 + PRESENTATION_NOTICE_MARGIN_MS
        ),
      })
    );
  });

  test("NEVER pulls it forward — a late redelivery changes nothing", async () => {
    // The stored instant already reflects a later delivery. A duplicate webhook
    // carrying the ORIGINAL one must not undo that, or a redelivery would become
    // a mechanism for charging early.
    // Strictly later than `delivered + notice + margin`, so the monotonic
    // guard has something real to refuse.
    const alreadyLater = new Date(
      DELIVERED.getTime() + 27 * 3_600_000 + PRESENTATION_NOTICE_MARGIN_MS
    );
    const { svc, spies } = harness({ presentationTatHours: 25 });

    await svc.recordNotificationDelivered(
      pdnRow({ scheduledDebitAt: alreadyLater }),
      "razorpay",
      DELIVERED
    );

    expect(spies.applyStatus).not.toHaveBeenCalled();
  });

  test("a gateway that reports its own instant is left alone", async () => {
    // Its answer is a fact; ours is arithmetic. Overwriting the vendor's number
    // with a derived one is how the two silently diverge the day the vendor
    // changes its turnaround.
    const { svc, spies } = harness({ presentationTatHours: null });

    await svc.recordNotificationDelivered(pdnRow(), "decentro", DELIVERED);

    expect(spies.applyStatus).not.toHaveBeenCalled();
  });

  test("writes the instant when the row holds none yet", async () => {
    const { svc, spies } = harness({ presentationTatHours: 25 });

    await svc.recordNotificationDelivered(
      pdnRow({ scheduledDebitAt: null }),
      "razorpay",
      DELIVERED
    );

    expect(spies.applyStatus).toHaveBeenCalledWith(
      "pdn-1",
      expect.objectContaining({
        scheduledDebitAt: new Date(
          DELIVERED.getTime() + 25 * 3_600_000 + PRESENTATION_NOTICE_MARGIN_MS
        ),
      })
    );
  });
});

/**
 * THE BOUNDARY REGRESSION.
 *
 * Razorpay's rule is "debit can be attempted 25 hours AFTER sending the
 * pre-debit notification" — strictly after. Sending exactly 25h was not after,
 * and Razorpay rejected the entire notification order:
 *
 *   400 input_validation_failed
 *   "Debit can be attempted 25 hours after sending the pre-debit notification"
 *
 * No order meant no order id, so no `presentation_sequence_id`, so the cycle
 * could never be presented — it polled every thirty minutes until its cycle date
 * passed and it was written off. 162 notifications died that way in one day, and
 * silently, because a cycle nothing claims leaves no failed row behind.
 *
 * These tests pin the property, not the number: whatever the notice period and
 * whatever the margin, the instant we publish must be STRICTLY LATER than the
 * gateway's own boundary.
 */
describe("the synthesised instant clears the gateway's boundary", () => {
  const notified = NOW;

  test("is strictly LATER than notified + the declared notice period", async () => {
    const { svc, spies } = harness({
      presentationTatHours: 25,
      notify: () =>
        Promise.resolve({
          presentationSequenceId: "order_1",
          status: "accepted",
          providerTxnId: null,
        }),
    });

    await svc.dispatch(mandate, debitRow(), notified);

    const sent = spies.notifyPreDebit.mock.calls[0][0].notBefore;
    expect(sent).not.toBeNull();
    const boundary = new Date(notified.getTime() + 25 * 3_600_000);
    // STRICTLY greater. Equal is what Razorpay rejected.
    expect((sent as Date).getTime()).toBeGreaterThan(boundary.getTime());
  });

  test("the margin is minutes-or-more, not a rounding artefact", async () => {
    // Guards against someone "simplifying" the margin away to a few seconds:
    // the boundary needs clock skew and request latency covered too, not just
    // strict inequality.
    const { svc, spies } = harness({
      presentationTatHours: 25,
      notify: () =>
        Promise.resolve({
          presentationSequenceId: "order_1",
          status: "accepted",
          providerTxnId: null,
        }),
    });

    await svc.dispatch(mandate, debitRow(), notified);

    const sent = spies.notifyPreDebit.mock.calls[0][0].notBefore as Date;
    const overshoot = sent.getTime() - (notified.getTime() + 25 * 3_600_000);
    expect(overshoot).toBeGreaterThanOrEqual(60_000);
  });

  test("the wire and the row carry the SAME instant", async () => {
    // The margin must be applied where the instant is minted, not at the wire.
    // Applying it only on the wire would leave the ledger believing a debit is
    // presentable before the gateway does.
    const { svc, spies } = harness({
      presentationTatHours: 25,
      notify: () =>
        Promise.resolve({
          presentationSequenceId: "order_1",
          status: "accepted",
          providerTxnId: null,
        }),
    });

    await svc.dispatch(mandate, debitRow(), notified);

    const onWire = spies.notifyPreDebit.mock.calls[0][0].notBefore;
    expect(spies.applyDispatchResult).toHaveBeenCalledWith(
      "pdn-1",
      expect.objectContaining({ scheduledDebitAt: onWire })
    );
  });

  test("a gateway that reports its own instant gets no margin bolted on", async () => {
    const { svc, spies } = harness({ presentationTatHours: null });
    await svc.dispatch(mandate, debitRow(), notified);
    expect(spies.notifyPreDebit.mock.calls[0][0].notBefore).toBeNull();
  });
});

describe("debit-attempt ledger events (TAM-187)", () => {
  const pdnStatus = vi.spyOn(paymentLedgerAnalytics, "trackPdnStatus");
  const pdnSent = vi.spyOn(paymentLedgerAnalytics, "trackPdnSent");

  beforeEach(() => {
    pdnStatus.mockReset().mockResolvedValue(undefined);
    pdnSent.mockReset().mockResolvedValue(undefined);
  });

  test("a send the gateway answered reports the send, then what became of it", async () => {
    const { svc } = harness({
      notify: () =>
        Promise.resolve({ presentationSequenceId: "seq_1", status: "accepted", providerTxnId: null }),
    });

    await svc.dispatch(mandate, debitRow(), NOW);

    expect(pdnSent).toHaveBeenCalledTimes(1);
    expect(pdnSent.mock.calls[0]?.[0]).toMatchObject({ hasSequenceId: true, providerStatus: "accepted" });
    expect(pdnStatus).toHaveBeenCalledTimes(1);
    expect(pdnStatus.mock.calls[0]?.[0]).toMatchObject({ status: "accepted", source: "scheduler" });
  });

  test("a premature send is a deferral, not a send", async () => {
    const { svc } = harness({ notify: () => Promise.reject(new PreDebitTooSoonError()) });

    await svc.dispatch(mandate, debitRow(), NOW);

    expect(pdnSent).not.toHaveBeenCalled();
    expect(pdnStatus.mock.calls.map(([input]) => input.status)).toEqual(["deferred"]);
  });

  test("a refresh carries the caller's source onto what it reports", async () => {
    const { svc } = harness({
      status: () =>
        Promise.resolve({ status: "sent", presentationSequenceId: null, failureCode: null, failureMessage: null }),
    });

    await svc.refreshFromProvider(pdnRow({ status: "sent" }), NOW, "webhook");

    expect(pdnStatus.mock.calls[0]?.[0]).toMatchObject({ status: "awaiting_sequence_id", source: "webhook" });
  });

  test("a terminal answer with the budget spent reports the write-off once", async () => {
    const { svc } = harness({
      pdn: pdnRow({ attempts: MAX_PDN_DISPATCH_ATTEMPTS - 1 }),
      status: () =>
        Promise.resolve({ status: "failed", presentationSequenceId: null, failureCode: "x", failureMessage: "no" }),
    });

    await svc.refreshFromProvider(pdnRow({ attempts: MAX_PDN_DISPATCH_ATTEMPTS - 1 }), NOW);

    expect(pdnStatus.mock.calls.map(([input]) => input.status)).toEqual(["failed"]);
    expect(pdnStatus.mock.calls[0]?.[0]).toMatchObject({ source: "poll", failureReason: "no" });
  });
});
