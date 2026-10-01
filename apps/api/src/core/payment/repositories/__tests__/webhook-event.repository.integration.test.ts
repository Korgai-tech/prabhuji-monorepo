import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "vitest";
import { randomUUID } from "node:crypto";
import { getPrisma } from "@api/shared/database";
import { startTestDb, stopTestDb } from "@api/shared/testing";
import { WebhookEventRepository } from "../webhook-event.repository.js";

/**
 * The `webhook_events` inbox CLAIM predicates (TAM-260), against real Postgres.
 *
 * The whole guarantee here is a row lock and a conditional UPDATE: "two tasks
 * never process one webhook" is decided by Postgres, not by TypeScript, so a
 * mocked Prisma would agree with a claim query that double-hands rows out. The
 * properties under test:
 *
 *   - concurrent `claimBatch` callers never receive the same row (SKIP LOCKED);
 *   - a live lease cannot be claimed; an expired one can, and bumps `attempts`;
 *   - terminal rows are never claimed;
 *   - the rolling 24 h window (`receivedSince = now - 24 h`, computed by the
 *     worker) keeps legacy `received` orphans out of the re-driver;
 *   - the re-driver only takes DEFERRED providers' `received` rows (an inline
 *     row sits in `received` for its whole request), but drains lease-expired
 *     `processing` rows of ANY provider (only a worker sets `processing`), so
 *     a rollback still drains in-flight rows; never `unroutable` evidence rows;
 *   - terminal marks fenced to a claim (`attempts`) cannot be overwritten by a
 *     stale claim; unfenced marks are the unconditional writes they were.
 */

const LEASE_MS = 60_000;
/** Far enough back that no test row falls before it unless it means to. */
const SINCE_EPOCH = new Date(Date.UTC(2020, 0, 1));
/** Every row inserted during the test is older than this. */
const future = (): Date => new Date(Date.now() + 60_000);
/** The deferred-provider set the re-driver is handed (spec D2: Razorpay only). */
const DEFERRED = ["razorpay"] as const;

let repo: WebhookEventRepository;

beforeAll(async () => {
  await startTestDb();
}, 120_000);

afterAll(async () => {
  await stopTestDb();
});

beforeEach(async () => {
  await getPrisma().paymentWebhookEvent.deleteMany({});
  repo = new WebhookEventRepository();
});

async function seed(
  overrides: { status?: string; receivedAt?: Date; provider?: string; kind?: string } = {},
): Promise<string> {
  const outcome = await repo.ingest({
    provider: overrides.provider ?? "razorpay",
    kind: overrides.kind ?? "presentation",
    eventType: "payment.failed",
    dedupeKey: `presentation:payment.failed:${randomUUID()}`,
    referenceId: `pj_mnd_${randomUUID()}`,
    providerMandateId: null,
    presentationSequenceId: null,
    callbackAttempt: null,
    payload: { event: "payment.failed" },
    sourceIp: null,
  });
  if (outcome.kind !== "accepted") throw new Error("seed was deduped");
  const id = outcome.row.id;
  if (overrides.status !== undefined || overrides.receivedAt !== undefined) {
    await getPrisma().paymentWebhookEvent.update({
      where: { id },
      data: { status: overrides.status, receivedAt: overrides.receivedAt },
    });
  }
  return id;
}

/** Push a claim's lease start back so it is `ms` past expiry. */
async function expireLease(id: string, ms = 1_000): Promise<void> {
  await getPrisma().paymentWebhookEvent.update({
    where: { id },
    data: { claimedAt: new Date(Date.now() - LEASE_MS - ms) },
  });
}

describe("claim(id, leaseMs)", () => {
  test("claims a received row: processing, claimed_at stamped, attempts 1", async () => {
    const id = await seed();
    const before = await repo.findById(id);
    expect(before).toMatchObject({ status: "received", claimedAt: null, attempts: 0 });

    const row = await repo.claim(id, LEASE_MS);

    expect(row).not.toBeNull();
    expect(row).toMatchObject({ id, status: "processing", attempts: 1 });
    expect(row?.claimedAt).toBeInstanceOf(Date);
    expect(row?.receivedAt).toBeInstanceOf(Date);
    expect(row?.notificationDeliveredAt).toBeNull();
    // The raw RETURNING maps to the same shape Prisma's select produces.
    expect(await repo.findById(id)).toEqual(row);
  });

  test("an already-leased row returns null and is left untouched", async () => {
    const id = await seed();
    const first = await repo.claim(id, LEASE_MS);
    expect(first).not.toBeNull();

    expect(await repo.claim(id, LEASE_MS)).toBeNull();

    const after = await repo.findById(id);
    expect(after?.attempts).toBe(1);
    expect(after?.claimedAt).toEqual(first?.claimedAt);
  });

  test("two concurrent claims of one row: exactly one wins", async () => {
    const id = await seed();
    const results = await Promise.all(
      Array.from({ length: 8 }, () => repo.claim(id, LEASE_MS)),
    );
    expect(results.filter((r) => r !== null)).toHaveLength(1);
    expect((await repo.findById(id))?.attempts).toBe(1);
  });

  test("an expired lease is re-claimable, and attempts increments", async () => {
    const id = await seed();
    const first = await repo.claim(id, LEASE_MS);
    await expireLease(id);

    const second = await repo.claim(id, LEASE_MS);

    expect(second).toMatchObject({ id, status: "processing", attempts: 2 });
    expect(second?.claimedAt?.getTime()).toBeGreaterThan(
      first?.claimedAt?.getTime() ?? Infinity,
    );
    // ... and the fresh lease holds again.
    expect(await repo.claim(id, LEASE_MS)).toBeNull();
  });

  test.each(["processed", "ignored_unknown", "ignored_duplicate", "failed"])(
    "a %s row is never claimed",
    async (status) => {
      const id = await seed({ status });
      expect(await repo.claim(id, LEASE_MS)).toBeNull();
      expect(await repo.findById(id)).toMatchObject({ status, attempts: 0, claimedAt: null });
    },
  );

  test("an unroutable evidence row is never claimed", async () => {
    const id = await seed({ kind: "unroutable" });
    expect(await repo.claim(id, LEASE_MS)).toBeNull();
    expect(await repo.findById(id)).toMatchObject({ status: "received", attempts: 0, claimedAt: null });
  });

  test("unknown id → null", async () => {
    expect(await repo.claim(randomUUID(), LEASE_MS)).toBeNull();
  });

  test("a non-positive lease is refused before any SQL runs", async () => {
    const id = await seed();
    await expect(repo.claim(id, 0)).rejects.toThrow(RangeError);
    await expect(repo.claim(id, 1.5)).rejects.toThrow(RangeError);
    expect((await repo.findById(id))?.status).toBe("received");
  });
});

describe("claimBatch(limit, olderThan, leaseMs, receivedSince, providers)", () => {
  test("concurrent batches never return the same row, and together claim all", async () => {
    const ids = new Set<string>();
    for (let i = 0; i < 60; i++) ids.add(await seed());

    const batches = await Promise.all(
      Array.from({ length: 6 }, () =>
        repo.claimBatch(15, future(), LEASE_MS, SINCE_EPOCH, DEFERRED),
      ),
    );

    const claimed = batches.flat().map((r) => r.id);
    // No row handed to two callers.
    expect(new Set(claimed).size).toBe(claimed.length);
    // SKIP LOCKED may leave a caller short (it skips rows a racer holds), so
    // the total can be under 60; it can never be over, or contain a stranger.
    expect(claimed.length).toBeLessThanOrEqual(60);
    for (const id of claimed) expect(ids.has(id)).toBe(true);

    const rows = await getPrisma().paymentWebhookEvent.findMany({
      select: { id: true, status: true, attempts: true },
    });
    const claimedSet = new Set(claimed);
    for (const r of rows) {
      if (claimedSet.has(r.id)) {
        expect(r).toMatchObject({ status: "processing", attempts: 1 });
      } else {
        expect(r).toMatchObject({ status: "received", attempts: 0 });
      }
    }

    // A follow-up sweep picks up whatever the race left, still without dupes.
    const rest = await repo.claimBatch(100, future(), LEASE_MS, SINCE_EPOCH, DEFERRED);
    const all = [...claimed, ...rest.map((r) => r.id)];
    expect(new Set(all).size).toBe(60);
    expect(all).toHaveLength(60);
  });

  test("respects limit and returns oldest first", async () => {
    const base = Date.now() - 10 * 60_000;
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) {
      ids.push(await seed({ receivedAt: new Date(base + i * 1_000) }));
    }

    const batch = await repo.claimBatch(3, future(), LEASE_MS, SINCE_EPOCH, DEFERRED);

    expect(batch.map((r) => r.id)).toEqual(ids.slice(0, 3));
    expect(batch.every((r) => r.status === "processing" && r.attempts === 1)).toBe(true);
  });

  test("a row younger than olderThan is left to its own kick", async () => {
    const old = await seed({ receivedAt: new Date(Date.now() - 60_000) });
    await seed(); // received just now

    const batch = await repo.claimBatch(
      10,
      new Date(Date.now() - 10_000),
      LEASE_MS,
      SINCE_EPOCH,
      DEFERRED,
    );

    expect(batch.map((r) => r.id)).toEqual([old]);
  });

  test("window lower bound: received rows before receivedSince are never claimed", async () => {
    const since = new Date(Date.now() - 60 * 60_000);
    const legacy = await seed({ receivedAt: new Date(since.getTime() - 1) });
    const atCutoff = await seed({ receivedAt: since });
    const after = await seed({ receivedAt: new Date(since.getTime() + 1_000) });

    const batch = await repo.claimBatch(10, future(), LEASE_MS, since, DEFERRED);

    expect(batch.map((r) => r.id).sort()).toEqual([atCutoff, after].sort());
    expect(await repo.findById(legacy)).toMatchObject({
      status: "received",
      attempts: 0,
      claimedAt: null,
    });
    // ... and stays out on every later sweep.
    expect(await repo.claimBatch(10, future(), LEASE_MS, since, DEFERRED)).toEqual([]);
  });

  test("the 24 h window as the worker passes it: older than 24 h is never claimed, just inside is", async () => {
    const DAY = 86_400_000;
    const now = Date.now();
    // Exactly what `CallbackWorker.runRedrive` computes with its defaults.
    const receivedSince = new Date(now - DAY);
    const olderThan = new Date(now - LEASE_MS);
    const tooOld = await seed({ receivedAt: new Date(now - DAY - 60_000) });
    const justInside = await seed({ receivedAt: new Date(now - DAY + 60_000) });
    // An expired `processing` row older than the window is still drained.
    const staleOld = await seed({ status: "processing", receivedAt: new Date(now - 3 * DAY) });
    await expireLease(staleOld);

    const batch = await repo.claimBatch(10, olderThan, LEASE_MS, receivedSince, DEFERRED);

    expect(batch.map((r) => r.id).sort()).toEqual([justInside, staleOld].sort());
    expect(await repo.findById(tooOld)).toMatchObject({
      status: "received",
      attempts: 0,
      claimedAt: null,
    });
  });

  test("an expired processing row is re-driven with attempts + 1; a live one is not", async () => {
    const stale = await seed();
    const live = await seed();
    await repo.claim(stale, LEASE_MS);
    await repo.claim(live, LEASE_MS);
    await expireLease(stale);

    const batch = await repo.claimBatch(10, future(), LEASE_MS, SINCE_EPOCH, DEFERRED);

    expect(batch.map((r) => r.id)).toEqual([stale]);
    expect(batch[0]).toMatchObject({ status: "processing", attempts: 2 });
    expect((await repo.findById(live))?.attempts).toBe(1);
  });

  test("an expired processing row is re-driven even if received before receivedSince", async () => {
    // `processing` only exists since TAM-260, so the legacy bound must not
    // strand a row a dead worker had claimed.
    const id = await seed({ receivedAt: new Date(Date.now() - 2 * 60 * 60_000) });
    await repo.claim(id, LEASE_MS);
    await expireLease(id);

    const batch = await repo.claimBatch(10, future(), LEASE_MS, new Date(), DEFERRED);

    expect(batch.map((r) => r.id)).toEqual([id]);
  });

  test("non-received, non-processing rows are never claimed", async () => {
    for (const status of ["processed", "ignored_unknown", "ignored_duplicate", "failed"]) {
      const id = await seed({ status, receivedAt: new Date(Date.now() - 60_000) });
      // A stale claim stamp must not make a terminal row claimable.
      await expireLease(id);
    }

    expect(await repo.claimBatch(10, future(), LEASE_MS, SINCE_EPOCH, DEFERRED)).toEqual([]);
  });

  test("only deferred providers' RECEIVED rows are claimed; an inline provider's are left alone", async () => {
    const old = new Date(Date.now() - 60_000);
    const razorpay = await seed({ receivedAt: old });
    const decentro = await seed({ provider: "decentro", receivedAt: old });
    const cashfree = await seed({ provider: "cashfree", receivedAt: old });
    // An expired `processing` row is drained whatever its provider: only a
    // worker ever sets `processing`, so it cannot be an inline row.
    const decentroStale = await seed({ provider: "decentro", status: "processing" });
    await expireLease(decentroStale);

    const batch = await repo.claimBatch(10, future(), LEASE_MS, SINCE_EPOCH, DEFERRED);

    expect(batch.map((r) => r.id).sort()).toEqual([razorpay, decentroStale].sort());
    for (const id of [decentro, cashfree]) {
      expect(await repo.findById(id)).toMatchObject({ status: "received", attempts: 0 });
    }
    expect(await repo.findById(decentroStale)).toMatchObject({
      status: "processing",
      attempts: 1,
    });

    // Listing it opts its `received` rows in.
    const both = await repo.claimBatch(10, future(), LEASE_MS, SINCE_EPOCH, [
      "decentro",
      "cashfree",
    ]);
    expect(both.map((r) => r.id).sort()).toEqual([decentro, cashfree].sort());
  });

  test("= ANY of an empty text[] is false in Postgres (the empty-list guard relies on it)", async () => {
    const empty: string[] = [];
    const rows = await getPrisma().$queryRaw<Array<{ hit: boolean }>>`
      SELECT 'razorpay' = ANY(${empty}::text[]) AS "hit"
    `;
    expect(rows).toEqual([{ hit: false }]);
  });

  test("an EMPTY provider list (the rollback): no received row, but every provider's expired processing row", async () => {
    const old = new Date(Date.now() - 60_000);
    const received = await seed({ receivedAt: old });
    const receivedDec = await seed({ provider: "decentro", receivedAt: old });
    const staleRzp = await seed({ status: "processing", receivedAt: old });
    const staleDec = await seed({ provider: "decentro", status: "processing", receivedAt: old });
    await expireLease(staleRzp);
    await expireLease(staleDec);
    // A LIVE lease and `unroutable` evidence (even with a stale stamp) stay put.
    const live = await seed();
    await repo.claim(live, LEASE_MS);
    const unroutableStale = await seed({ kind: "unroutable", status: "processing" });
    await expireLease(unroutableStale);
    const unroutableReceived = await seed({ kind: "unroutable", receivedAt: old });

    const batch = await repo.claimBatch(10, future(), LEASE_MS, SINCE_EPOCH, []);

    expect(batch.map((r) => r.id).sort()).toEqual([staleRzp, staleDec].sort());
    for (const r of batch) expect(r).toMatchObject({ status: "processing", attempts: 1 });
    for (const id of [received, receivedDec, unroutableReceived]) {
      expect(await repo.findById(id)).toMatchObject({ status: "received", attempts: 0 });
    }
    expect(await repo.findById(live)).toMatchObject({ status: "processing", attempts: 1 });
    expect(await repo.findById(unroutableStale)).toMatchObject({
      status: "processing",
      attempts: 0,
    });
    // Drained: a second pass finds nothing (both leases are live again).
    expect(await repo.claimBatch(10, future(), LEASE_MS, SINCE_EPOCH, [])).toEqual([]);
  });

  test("unroutable evidence rows are never claimed, received or with a stale lease", async () => {
    const old = new Date(Date.now() - 60_000);
    const unroutable = await seed({ kind: "unroutable", receivedAt: old });
    const unroutableStale = await seed({ kind: "unroutable", status: "processing" });
    await expireLease(unroutableStale);

    expect(await repo.claimBatch(10, future(), LEASE_MS, SINCE_EPOCH, DEFERRED)).toEqual([]);
    expect(await repo.findById(unroutable)).toMatchObject({
      status: "received",
      attempts: 0,
      claimedAt: null,
    });
    expect((await repo.findById(unroutableStale))?.attempts).toBe(0);
  });

  test("a non-positive limit or lease is refused", async () => {
    await expect(repo.claimBatch(0, future(), LEASE_MS, SINCE_EPOCH, DEFERRED)).rejects.toThrow(RangeError);
    await expect(repo.claimBatch(10, future(), -1, SINCE_EPOCH, DEFERRED)).rejects.toThrow(RangeError);
  });
});

describe("terminal marks: fencing to the owning claim (TAM-260 B2)", () => {
  /** Claim (attempts 1), let the lease expire, re-claim (attempts 2). */
  async function reclaimed(): Promise<string> {
    const id = await seed();
    expect((await repo.claim(id, LEASE_MS))?.attempts).toBe(1);
    await expireLease(id);
    expect((await repo.claim(id, LEASE_MS))?.attempts).toBe(2);
    return id;
  }
  const AT = new Date(Date.UTC(2026, 8, 25, 9, 30));
  const MANDATE = randomUUID();

  test("markProcessed fenced to the STALE claim changes nothing; fenced to the owner it lands", async () => {
    const id = await reclaimed();
    const before = await repo.findById(id);

    expect(await repo.markProcessed(id, AT, { mandateId: MANDATE }, { attempt: 1 })).toBe(false);
    expect(await repo.findById(id)).toEqual(before);

    expect(await repo.markProcessed(id, AT, { mandateId: MANDATE }, { attempt: 2 })).toBe(true);
    expect(await repo.findById(id)).toMatchObject({
      status: "processed",
      processedAt: AT,
      relatedMandateId: MANDATE,
      attempts: 2,
    });
  });

  test("a stale claim cannot flip a terminal outcome (processed ↔ failed)", async () => {
    const id = await reclaimed();
    expect(await repo.markProcessed(id, AT, {}, { attempt: 2 })).toBe(true);

    // The stale worker (claim 1) finishes late and tries to write its failure.
    expect(await repo.markFailed(id, "stale boom", AT, { attempt: 1 })).toBe(false);
    // Even the owner's own fence no longer matches once the row is terminal.
    expect(await repo.markFailed(id, "late boom", AT, { attempt: 2 })).toBe(false);
    expect(await repo.findById(id)).toMatchObject({ status: "processed", errorMessage: null });

    const other = await reclaimed();
    expect(await repo.markFailed(other, "real boom", AT, { attempt: 2 })).toBe(true);
    expect(await repo.markProcessed(other, AT, {}, { attempt: 1 })).toBe(false);
    expect(await repo.findById(other)).toMatchObject({
      status: "failed",
      errorMessage: "real boom",
    });
  });

  test("markIgnoredUnknown is fenced the same way", async () => {
    const id = await reclaimed();
    expect(await repo.markIgnoredUnknown(id, AT, { attempt: 1 })).toBe(false);
    expect((await repo.findById(id))?.status).toBe("processing");
    expect(await repo.markIgnoredUnknown(id, AT, { attempt: 2 })).toBe(true);
    expect(await repo.findById(id)).toMatchObject({ status: "ignored_unknown", processedAt: AT });
  });

  test("a fence never matches an unclaimed (inline) row", async () => {
    const id = await seed();
    expect(await repo.markProcessed(id, AT, {}, { attempt: 0 })).toBe(false);
    expect((await repo.findById(id))?.status).toBe("received");
  });

  test("UNFENCED marks on a received (inline) row write unconditionally, exactly as before", async () => {
    const p = await seed();
    const i = await seed();
    const f = await seed();

    expect(await repo.markProcessed(p, AT, { mandateId: MANDATE })).toBe(true);
    expect(await repo.markIgnoredUnknown(i, AT)).toBe(true);
    expect(await repo.markFailed(f, "boom", AT)).toBe(true);

    expect(await repo.findById(p)).toMatchObject({
      status: "processed",
      processedAt: AT,
      relatedMandateId: MANDATE,
      attempts: 0,
      claimedAt: null,
    });
    expect(await repo.findById(i)).toMatchObject({ status: "ignored_unknown", processedAt: AT });
    expect(await repo.findById(f)).toMatchObject({
      status: "failed",
      processedAt: AT,
      errorMessage: "boom",
    });
    // Unconditional, as it always was: a later unfenced write still overwrites.
    expect(await repo.markFailed(p, "later", AT, null)).toBe(true);
    expect((await repo.findById(p))?.status).toBe("failed");
  });

  test("an unfenced mark of a missing id still throws (Prisma P2025), as before", async () => {
    await expect(repo.markProcessed(randomUUID(), AT)).rejects.toThrow();
  });
});

describe("ingest: notificationDeliveredAt (TAM-260)", () => {
  function input(notificationDeliveredAt?: Date | null) {
    return {
      provider: "razorpay",
      kind: "pdn",
      eventType: "order.notification.delivered",
      dedupeKey: `pdn:order.notification.delivered:${randomUUID()}`,
      referenceId: null,
      providerMandateId: null,
      presentationSequenceId: `order_${randomUUID()}`,
      callbackAttempt: null,
      payload: { event: "order.notification.delivered" },
      sourceIp: null,
      ...(notificationDeliveredAt === undefined ? {} : { notificationDeliveredAt }),
    };
  }

  test("persists the delivered-at column when given", async () => {
    const deliveredAt = new Date(Date.UTC(2026, 8, 24, 8, 15, 30));
    const outcome = await repo.ingest(input(deliveredAt));
    if (outcome.kind !== "accepted") throw new Error("deduped");

    expect((await repo.findById(outcome.row.id))?.notificationDeliveredAt).toEqual(deliveredAt);
    // ... and a claim hands it to the worker.
    expect((await repo.claim(outcome.row.id, LEASE_MS))?.notificationDeliveredAt).toEqual(
      deliveredAt,
    );
  });

  test("omitted or null → NULL, exactly as before the field existed", async () => {
    for (const value of [undefined, null]) {
      const outcome = await repo.ingest(input(value));
      if (outcome.kind !== "accepted") throw new Error("deduped");
      expect((await repo.findById(outcome.row.id))?.notificationDeliveredAt).toBeNull();
    }
  });

  test("the accepted row shape is unchanged (no inbox columns leak into ingest)", async () => {
    const outcome = await repo.ingest(input(new Date()));
    if (outcome.kind !== "accepted") throw new Error("deduped");
    expect(outcome.row).not.toHaveProperty("notificationDeliveredAt");
    expect(outcome.row).not.toHaveProperty("attempts");
    expect(outcome.row).not.toHaveProperty("claimedAt");
  });
});

describe("findById", () => {
  test("returns the inbox projection without the payload, or null", async () => {
    const id = await seed();
    await getPrisma().paymentWebhookEvent.update({
      where: { id },
      data: { notificationDeliveredAt: new Date(Date.UTC(2026, 8, 24, 9)) },
    });

    const row = await repo.findById(id);

    expect(row).toMatchObject({
      id,
      provider: "razorpay",
      status: "received",
      attempts: 0,
      claimedAt: null,
      notificationDeliveredAt: new Date(Date.UTC(2026, 8, 24, 9)),
    });
    expect(row).not.toHaveProperty("payload");
    expect(row).not.toHaveProperty("sourceIp");
    expect(await repo.findById(randomUUID())).toBeNull();
  });
});
