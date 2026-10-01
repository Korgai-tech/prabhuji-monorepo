import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type * as LogsModule from "@api/shared/logs";
import type { WebhookEventInboxRow } from "../../repositories/webhook-event.repository.js";
import type { ProcessResult, StoredCallback } from "../callback.service.js";
import {
  CallbackWorker,
  type CallbackInboxRepository,
  type CallbackProcessor,
  type CallbackWorkerOptions,
  type WorkerTimers,
} from "../callback-worker.js";

/**
 * TAM-260 Task 5: the deferred callback worker, against an in-memory inbox
 * that implements the same claim predicate as `WebhookEventRepository`
 * (`received`, or `processing` with an expired lease), on fake timers.
 */

const emitted = vi.hoisted((): Array<{ level: string; obj: Record<string, unknown> }> => []);
vi.mock("@api/shared/logs", async (importOriginal) => {
  const actual = await importOriginal<typeof LogsModule>();
  const record =
    (level: string) =>
    (obj: unknown): void => {
      emitted.push({
        level,
        obj: typeof obj === "object" && obj !== null ? (obj as Record<string, unknown>) : {},
      });
    };
  const logger = {
    info: record("info"),
    warn: record("warn"),
    error: record("error"),
    debug: record("debug"),
    child: () => logger,
  };
  return { ...actual, createModuleLogger: () => logger };
});

const eventsNamed = (name: string): Array<{ level: string; obj: Record<string, unknown> }> =>
  emitted.filter((e) => e.obj.event === name);

const T0 = new Date("2026-09-25T08:00:00.000Z");
/** The rolling legacy-row window's default (spec, resolved 2026-09-25). */
const DAY = 86_400_000;
const LEASE = 120_000;

function inboxRow(id: string, over: Partial<WebhookEventInboxRow> = {}): WebhookEventInboxRow {
  return {
    id,
    provider: "razorpay",
    kind: "presentation",
    eventType: "payment.failed",
    dedupeKey: `presentation:payment.failed:pay_${id}`,
    referenceId: `ref_${id}`,
    providerMandateId: null,
    presentationSequenceId: null,
    callbackAttempt: null,
    status: "received",
    relatedMandateId: null,
    relatedPdnId: null,
    relatedTransactionId: null,
    receivedAt: new Date(Date.now()),
    processedAt: null,
    errorMessage: null,
    claimedAt: null,
    attempts: 0,
    notificationDeliveredAt: null,
    ...over,
  };
}

/** In-memory `webhook_events` with the repository's claim semantics. */
class FakeInbox implements CallbackInboxRepository {
  readonly rows = new Map<string, WebhookEventInboxRow>();
  readonly claimBatchCalls: Array<{
    limit: number;
    olderThan: Date;
    leaseMs: number;
    receivedSince: Date;
    providers: readonly string[];
  }> = [];
  claimError: Error | null = null;

  add(row: WebhookEventInboxRow): void {
    this.rows.set(row.id, row);
  }

  private claimable(r: WebhookEventInboxRow, leaseMs: number): boolean {
    const now = Date.now();
    return (
      r.status === "received" ||
      (r.status === "processing" && r.claimedAt !== null && r.claimedAt.getTime() < now - leaseMs)
    );
  }

  private take(r: WebhookEventInboxRow): WebhookEventInboxRow {
    r.status = "processing";
    r.claimedAt = new Date(Date.now());
    r.attempts += 1;
    return { ...r };
  }

  claim = vi.fn(async (id: string, leaseMs: number): Promise<WebhookEventInboxRow | null> => {
    await Promise.resolve();
    if (this.claimError) throw this.claimError;
    const r = this.rows.get(id);
    if (!r || !this.claimable(r, leaseMs)) return null;
    return this.take(r);
  });

  claimBatch = vi.fn(
    async (
      limit: number,
      olderThan: Date,
      leaseMs: number,
      receivedSince: Date,
      providers: readonly string[]
    ): Promise<WebhookEventInboxRow[]> => {
      this.claimBatchCalls.push({ limit, olderThan, leaseMs, receivedSince, providers });
      await Promise.resolve();
      const now = Date.now();
      return [...this.rows.values()]
        .filter((r) => r.kind !== "unroutable")
        .filter(
          (r) =>
            // The provider filter applies to `received` rows ONLY (B1).
            (r.status === "received" &&
              providers.includes(r.provider) &&
              r.receivedAt < olderThan &&
              r.receivedAt >= receivedSince) ||
            (r.status === "processing" &&
              r.claimedAt !== null &&
              r.claimedAt.getTime() < now - leaseMs)
        )
        .sort((a, b) => a.receivedAt.getTime() - b.receivedAt.getTime())
        .slice(0, limit)
        .map((r) => this.take(r));
    }
  );

  /** Same fence semantics as the repository: no fence = unconditional. */
  markFailed = vi.fn(
    async (
      id: string,
      message: string,
      at: Date,
      fence?: { attempt: number } | null
    ): Promise<boolean> => {
      await Promise.resolve();
      const r = this.rows.get(id);
      if (!r) return !fence;
      if (fence && (r.status !== "processing" || r.attempts !== fence.attempt)) return false;
      r.status = "failed";
      r.errorMessage = message;
      r.processedAt = at;
      return true;
    }
  );
}

interface Deferred {
  resolve: (v: ProcessResult) => void;
  reject: (e: Error) => void;
}

/** A processor whose calls stay open until the test settles them. */
class FakeProcessor implements CallbackProcessor {
  running = 0;
  maxRunning = 0;
  readonly calls: StoredCallback[] = [];
  readonly nows: Date[] = [];
  readonly open = new Map<string, Deferred>();
  /** When set, settles immediately instead of waiting. */
  auto: ((event: StoredCallback) => ProcessResult | Error) | null = null;

  constructor(private readonly inbox: FakeInbox) {}

  process = vi.fn((event: StoredCallback, now: Date): Promise<ProcessResult> => {
    this.calls.push(event);
    this.nows.push(now);
    this.running += 1;
    this.maxRunning = Math.max(this.maxRunning, this.running);
    const finish = (): void => {
      this.running -= 1;
    };
    if (this.auto) {
      const out = this.auto(event);
      finish();
      if (out instanceof Error) return Promise.reject(out);
      this.markTerminal(event.id);
      return Promise.resolve(out);
    }
    return new Promise<ProcessResult>((resolve, reject) => {
      this.open.set(event.id, {
        resolve: (v) => {
          finish();
          this.open.delete(event.id);
          this.markTerminal(event.id);
          resolve(v);
        },
        reject: (e) => {
          finish();
          this.open.delete(event.id);
          reject(e);
        },
      });
    });
  });

  private markTerminal(id: string): void {
    const r = this.inbox.rows.get(id);
    if (r) r.status = "processed";
  }

  finish(id: string): void {
    const d = this.open.get(id);
    if (!d) throw new Error(`no open call for ${id}`);
    d.resolve("processed");
  }

  fail(id: string, err: Error): void {
    const d = this.open.get(id);
    if (!d) throw new Error(`no open call for ${id}`);
    d.reject(err);
  }
}

/** Timers resolved at call time, so they are vitest's fakes. */
const fakeTimers: WorkerTimers = {
  setInterval: (fn, ms) => setInterval(fn, ms),
  clearInterval: (h) => clearInterval(h as NodeJS.Timeout),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (h) => clearTimeout(h as NodeJS.Timeout),
};

let inbox: FakeInbox;
let processor: FakeProcessor;

function makeWorker(
  over: Partial<CallbackWorkerOptions> = {}
): CallbackWorker {
  return new CallbackWorker(
    inbox,
    processor,
    { providers: ["razorpay"], ...over },
    { now: () => new Date(Date.now()), timers: fakeTimers }
  );
}

/** Let the worker's promise chains run without moving the clock. */
const flush = async (): Promise<void> => {
  await vi.advanceTimersByTimeAsync(0);
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
  emitted.length = 0;
  inbox = new FakeInbox();
  processor = new FakeProcessor(inbox);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("CallbackWorker — options", () => {
  test("uses the spec defaults", () => {
    const w = makeWorker();
    w.start();
    const started = eventsNamed("callback_worker_started")[0]?.obj;
    expect(started).toMatchObject({
      concurrency: 4,
      lease_ms: 120_000,
      redrive_interval_ms: 15_000,
      max_attempts: 5,
      redrive_max_age_ms: DAY,
    });
  });

  test.each([
    ["concurrency", 0],
    ["leaseMs", -1],
    ["redriveIntervalMs", 1.5],
    ["maxAttempts", Number.NaN],
    ["drainTimeoutMs", 0],
    ["redriveMaxAgeMs", 0],
    ["redriveMaxAgeMs", Number.POSITIVE_INFINITY],
  ] as const)("rejects %s = %s", (key, value) => {
    expect(() => makeWorker({ [key]: value })).toThrow(RangeError);
  });
});

describe("CallbackWorker — kick and concurrency", () => {
  test("never runs more than `concurrency` rows at once, and runs them all", async () => {
    const w = makeWorker({ concurrency: 4 });
    const ids = Array.from({ length: 10 }, (_, i) => `row-${i}`);
    for (const id of ids) inbox.add(inboxRow(id));
    for (const id of ids) expect(w.kick(id)).toBe(true);
    await flush();

    expect(processor.running).toBe(4);
    expect(w.stats()).toMatchObject({ inFlight: 4, queued: 6 });

    // Release them one by one; the cap holds throughout.
    while (processor.open.size > 0) {
      const [next] = [...processor.open.keys()];
      if (next !== undefined) processor.finish(next);
      await flush();
      expect(processor.running).toBeLessThanOrEqual(4);
    }

    expect(processor.maxRunning).toBe(4);
    expect(processor.calls.map((c) => c.id).sort()).toEqual([...ids].sort());
    expect(inbox.claim).toHaveBeenCalledTimes(10);
    expect(w.stats()).toMatchObject({ inFlight: 0, queued: 0 });
  });

  test("processes from the claimed row, with the processing instant as `now`", async () => {
    const w = makeWorker();
    inbox.add(inboxRow("a", { receivedAt: new Date(T0.getTime() - 3_000) }));
    w.kick("a");
    await flush();

    expect(inbox.claim).toHaveBeenCalledWith("a", LEASE);
    expect(processor.process).toHaveBeenCalledTimes(1);
    expect(processor.calls[0]).toMatchObject({
      id: "a",
      provider: "razorpay",
      kind: "presentation",
      referenceId: "ref_a",
      callbackTxnId: "payment.failed:pay_a",
    });
    expect(processor.nows[0]?.getTime()).toBe(T0.getTime());

    // D3: queue wait is a log field on the new, additive `callback_claimed` line.
    const claimed = eventsNamed("callback_claimed")[0]?.obj;
    expect(claimed).toMatchObject({
      source: "kick",
      webhook_event_id: "a",
      attempts: 1,
      queue_wait_ms: 3_000,
    });
    expect(eventsNamed("callback_enqueued")).toHaveLength(1);
  });

  test("kick dedupes a row already queued or in flight here", async () => {
    const w = makeWorker({ concurrency: 1 });
    inbox.add(inboxRow("a"));
    inbox.add(inboxRow("b"));

    expect(w.kick("a")).toBe(true);
    expect(w.kick("b")).toBe(true);
    expect(w.kick("b")).toBe(false); // queued
    await flush();
    expect(w.kick("a")).toBe(false); // in flight
    expect(eventsNamed("callback_kick_deduped")).toHaveLength(2);

    processor.finish("a");
    await flush();
    processor.finish("b");
    await flush();

    expect(inbox.claim).toHaveBeenCalledTimes(2);
    expect(processor.process).toHaveBeenCalledTimes(2);

    // Once finished it is no longer tracked; a late kick claims null and no-ops.
    expect(w.kick("a")).toBe(true);
    await flush();
    expect(processor.process).toHaveBeenCalledTimes(2);
  });

  test("a failed claim (null) is a no-op and frees the slot", async () => {
    const w = makeWorker({ concurrency: 1 });
    inbox.add(inboxRow("taken", { status: "processing", claimedAt: new Date(T0), attempts: 1 }));
    inbox.add(inboxRow("b"));

    w.kick("taken");
    w.kick("missing");
    w.kick("b");
    await flush();

    expect(processor.calls.map((c) => c.id)).toEqual(["b"]);
    expect(inbox.markFailed).not.toHaveBeenCalled();
    expect(inbox.rows.get("taken")).toMatchObject({ status: "processing", attempts: 1 });
    expect(eventsNamed("callback_claim_skipped")).toHaveLength(2);
    expect(emitted.filter((e) => e.level === "error")).toHaveLength(0);
  });

  test("a throwing `process` is logged, frees its slot, and leaves the row for its lease", async () => {
    const w = makeWorker({ concurrency: 1 });
    inbox.add(inboxRow("boom"));
    inbox.add(inboxRow("next"));
    w.kick("boom");
    w.kick("next");
    await flush();

    processor.fail("boom", new Error("markProcessed: connection reset"));
    await flush();

    const threw = eventsNamed("callback_process_threw");
    expect(threw).toHaveLength(1);
    expect(threw[0]).toMatchObject({
      level: "error",
      obj: { webhook_event_id: "boom", attempts: 1, reason: "markProcessed: connection reset" },
    });
    // The slot moved on; the row was NOT marked failed (attempt 1 of 5).
    expect(processor.open.has("next")).toBe(true);
    expect(inbox.markFailed).not.toHaveBeenCalled();
    expect(inbox.rows.get("boom")?.status).toBe("processing");
    processor.finish("next");
    await flush();
    expect(w.stats()).toMatchObject({ inFlight: 0, queued: 0 });
  });

  test("a throwing claim (DB down) is logged and frees the slot", async () => {
    const w = makeWorker({ concurrency: 1 });
    inbox.add(inboxRow("a"));
    inbox.claimError = new Error("db down");
    w.kick("a");
    await flush();

    expect(eventsNamed("callback_worker_job_failed")[0]).toMatchObject({
      level: "error",
      obj: { webhook_event_id: "a", reason: "db down" },
    });
    expect(w.stats()).toMatchObject({ inFlight: 0, queued: 0 });
    expect(inbox.rows.get("a")?.status).toBe("received");
  });

  test("a row this build cannot route is failed, not processed", async () => {
    const w = makeWorker();
    inbox.add(inboxRow("u", { kind: "unroutable", provider: "paytm" }));
    w.kick("u");
    await flush();

    expect(processor.process).not.toHaveBeenCalled();
    expect(inbox.rows.get("u")?.status).toBe("failed");
    expect(eventsNamed("callback_processing_failed")[0]?.obj).toMatchObject({
      webhook_event_id: "u",
      terminal_reason: "unprocessable_row",
    });
  });
});

describe("CallbackWorker — re-driver", () => {
  test("claims expired and unclaimed rows inside the 24 h window, and nothing else", async () => {
    const w = makeWorker();
    const ago = (ms: number): Date => new Date(T0.getTime() - ms);
    // Eligible
    inbox.add(inboxRow("orphan-in-window", { receivedAt: ago(10 * 60_000) }));
    inbox.add(
      inboxRow("expired-lease", {
        receivedAt: ago(20 * 60_000),
        status: "processing",
        claimedAt: ago(LEASE + 1),
        attempts: 1,
      })
    );
    // Not eligible (the first tick runs at T0 + 15 s, so this is 24 h + 1 ms old)
    inbox.add(inboxRow("legacy", { receivedAt: new Date(T0.getTime() + 15_000 - DAY - 1) }));
    inbox.add(inboxRow("fresh", { receivedAt: ago(5_000) }));
    inbox.add(
      inboxRow("live-lease", {
        receivedAt: ago(30 * 60_000),
        status: "processing",
        claimedAt: ago(1_000),
        attempts: 1,
      })
    );
    inbox.add(inboxRow("done", { receivedAt: ago(15 * 60_000), status: "processed" }));

    processor.auto = () => "processed";
    w.start();
    expect(inbox.claimBatch).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(15_000);

    // The tick's query carries the knobs; the time runs with the fake clock.
    const call = inbox.claimBatchCalls[0];
    expect(call).toBeDefined();
    expect(call?.limit).toBe(4);
    expect(call?.leaseMs).toBe(LEASE);
    // Rolling: now − 24 h, computed at the tick.
    expect(call?.receivedSince.getTime()).toBe(T0.getTime() + 15_000 - DAY);
    expect(call?.olderThan.getTime()).toBe(T0.getTime() + 15_000 - 120_000);

    expect(processor.calls.map((c) => c.id).sort()).toEqual(
      ["expired-lease", "orphan-in-window"].sort()
    );
    expect(inbox.rows.get("legacy")?.status).toBe("received");
    expect(inbox.rows.get("fresh")?.status).toBe("received");
    expect(inbox.rows.get("live-lease")).toMatchObject({ status: "processing", attempts: 1 });
    expect(inbox.rows.get("expired-lease")?.attempts).toBe(2);
    expect(eventsNamed("callback_redriven")[0]?.obj).toMatchObject({ count: 2 });
    expect(
      eventsNamed("callback_claimed").every((e) => e.obj.source === "redrive")
    ).toBe(true);
    await w.stop();
  });

  test("the window rolls: each pass recomputes now − redriveMaxAgeMs; a row ages out of it", async () => {
    const hour = 3_600_000;
    const w = makeWorker({ redriveMaxAgeMs: hour, redriveIntervalMs: 15_000 });
    // Just inside the window at the first tick (T0 + 15 s) …
    inbox.add(inboxRow("edge", { receivedAt: new Date(T0.getTime() + 15_000 - hour) }));
    // … and one that has just left it.
    inbox.add(inboxRow("aged", { receivedAt: new Date(T0.getTime() + 15_000 - hour - 1) }));
    processor.auto = () => "processed";
    w.start();
    await vi.advanceTimersByTimeAsync(15_000);
    expect(processor.calls.map((c) => c.id)).toEqual(["edge"]);

    await vi.advanceTimersByTimeAsync(15_000);
    const [first, second] = inbox.claimBatchCalls;
    expect(second.receivedSince.getTime() - first.receivedSince.getTime()).toBe(15_000);
    expect(inbox.rows.get("aged")).toMatchObject({ status: "received", attempts: 0 });
    await w.stop();
  });

  test("re-drives a row whose worker threw, once its lease expires", async () => {
    const w = makeWorker();
    inbox.add(inboxRow("crash"));
    w.start();
    w.kick("crash");
    await flush();
    processor.fail("crash", new Error("boom"));
    await flush();
    expect(inbox.rows.get("crash")).toMatchObject({ status: "processing", attempts: 1 });

    processor.auto = () => "processed";
    // Ticks inside the lease leave it alone.
    await vi.advanceTimersByTimeAsync(LEASE - 1_000);
    expect(processor.process).toHaveBeenCalledTimes(1);
    // The tick at exactly the lease (t=120 s) is not past it; the next one is.
    await vi.advanceTimersByTimeAsync(1_000);
    expect(processor.process).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(processor.process).toHaveBeenCalledTimes(2);
    expect(inbox.rows.get("crash")).toMatchObject({ status: "processed", attempts: 2 });
    await w.stop();
  });

  test("claims only free slots, and nothing while every slot is busy", async () => {
    const w = makeWorker({ concurrency: 2 });
    inbox.add(inboxRow("k1"));
    inbox.add(inboxRow("old-1", { receivedAt: new Date(T0.getTime() - 10 * 60_000) }));
    inbox.add(inboxRow("old-2", { receivedAt: new Date(T0.getTime() - 9 * 60_000) }));
    w.start();
    w.kick("k1");
    await flush();

    await vi.advanceTimersByTimeAsync(15_000);
    expect(inbox.claimBatchCalls[0]?.limit).toBe(1);
    expect(processor.running).toBe(2);

    await vi.advanceTimersByTimeAsync(15_000);
    expect(inbox.claimBatchCalls).toHaveLength(1); // full: no query at all
    expect(inbox.rows.get("old-2")?.status).toBe("received");
    for (const id of [...processor.open.keys()]) processor.finish(id);
    await flush();
    await w.stop();
  });

  test("a failing re-drive query is logged and retried next tick", async () => {
    const w = makeWorker();
    inbox.claimBatch.mockRejectedValueOnce(new Error("pool exhausted"));
    w.start();
    await vi.advanceTimersByTimeAsync(15_000);
    expect(eventsNamed("callback_redrive_failed")[0]?.obj).toMatchObject({
      reason: "pool exhausted",
    });
    await vi.advanceTimersByTimeAsync(15_000);
    expect(inbox.claimBatch).toHaveBeenCalledTimes(2);
    await w.stop();
  });

  test("passes the deferred providers through; an inline provider's rows are never re-driven", async () => {
    const w = makeWorker({ providers: ["razorpay"] });
    const old = new Date(T0.getTime() - 10 * 60_000);
    inbox.add(inboxRow("rzp", { receivedAt: old }));
    inbox.add(inboxRow("dec", { receivedAt: old, provider: "decentro" }));
    processor.auto = () => "processed";
    w.start();
    await vi.advanceTimersByTimeAsync(15_000);

    expect(inbox.claimBatchCalls[0]?.providers).toEqual(["razorpay"]);
    expect(processor.calls.map((c) => c.id)).toEqual(["rzp"]);
    expect(inbox.rows.get("dec")).toMatchObject({ status: "received", attempts: 0 });
    await w.stop();
  });

  test("an empty provider list (the rollback) claims no received row but drains expired processing rows", async () => {
    const w = makeWorker({ providers: [] });
    const ago = (ms: number): Date => new Date(T0.getTime() - ms);
    inbox.add(inboxRow("orphan", { receivedAt: ago(10 * 60_000) }));
    inbox.add(
      inboxRow("expired", {
        receivedAt: ago(20 * 60_000),
        status: "processing",
        claimedAt: ago(LEASE + 1),
        attempts: 1,
      })
    );
    inbox.add(
      inboxRow("expired-dec", {
        provider: "decentro",
        receivedAt: ago(19 * 60_000),
        status: "processing",
        claimedAt: ago(LEASE + 1),
        attempts: 1,
      })
    );
    inbox.add(
      inboxRow("live", {
        receivedAt: ago(18 * 60_000),
        status: "processing",
        claimedAt: ago(1_000),
        attempts: 1,
      })
    );
    inbox.add(
      inboxRow("evidence", {
        kind: "unroutable",
        receivedAt: ago(17 * 60_000),
        status: "processing",
        claimedAt: ago(LEASE + 1),
        attempts: 1,
      })
    );
    processor.auto = () => "processed";
    w.start();
    await vi.advanceTimersByTimeAsync(15_000);

    expect(inbox.claimBatchCalls[0]?.providers).toEqual([]);
    expect(processor.calls.map((c) => c.id)).toEqual(["expired", "expired-dec"]);
    expect(processor.calls.map((c) => c.claimAttempt)).toEqual([2, 2]);
    expect(inbox.rows.get("orphan")).toMatchObject({ status: "received", attempts: 0 });
    expect(inbox.rows.get("expired")).toMatchObject({ status: "processed", attempts: 2 });
    expect(inbox.rows.get("expired-dec")).toMatchObject({ status: "processed", attempts: 2 });
    expect(inbox.rows.get("live")).toMatchObject({ status: "processing", attempts: 1 });
    expect(inbox.rows.get("evidence")).toMatchObject({ status: "processing", attempts: 1 });
    expect(eventsNamed("callback_redriven")).toHaveLength(1);
    await w.stop();
  });

  test("does not re-drive before start()", async () => {
    makeWorker();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(inbox.claimBatch).not.toHaveBeenCalled();
  });
});

describe("CallbackWorker — maxAttempts", () => {
  test("the claim past maxAttempts marks the row failed without processing it", async () => {
    const w = makeWorker({ maxAttempts: 5 });
    inbox.add(
      inboxRow("poison", {
        receivedAt: new Date(T0.getTime() - 60 * 60_000),
        status: "processing",
        claimedAt: new Date(T0.getTime() - LEASE - 1),
        attempts: 5,
      })
    );
    w.start();
    await vi.advanceTimersByTimeAsync(15_000);

    expect(processor.process).not.toHaveBeenCalled();
    expect(inbox.markFailed).toHaveBeenCalledTimes(1);
    expect(inbox.rows.get("poison")).toMatchObject({ status: "failed", attempts: 6 });
    expect(inbox.rows.get("poison")?.errorMessage).toContain("gave up after 5 attempts");
    const failed = eventsNamed("callback_processing_failed");
    expect(failed).toHaveLength(1);
    expect(failed[0]).toMatchObject({
      level: "error",
      obj: { webhook_event_id: "poison", terminal_reason: "max_attempts_exhausted", attempts: 6 },
    });

    // Terminal: never claimed again.
    await vi.advanceTimersByTimeAsync(10 * LEASE);
    expect(inbox.markFailed).toHaveBeenCalledTimes(1);
    await w.stop();
  });

  test("the terminal markFailed is fenced to the claim's attempt", async () => {
    const w = makeWorker({ maxAttempts: 5 });
    inbox.add(
      inboxRow("poison", {
        receivedAt: new Date(T0.getTime() - 60 * 60_000),
        status: "processing",
        claimedAt: new Date(T0.getTime() - LEASE - 1),
        attempts: 5,
      })
    );
    w.start();
    await vi.advanceTimersByTimeAsync(15_000);
    expect(inbox.markFailed).toHaveBeenCalledWith(
      "poison",
      expect.stringContaining("gave up after 5 attempts"),
      expect.any(Date),
      { attempt: 6 }
    );
    await w.stop();
  });

  test("a STALE claim's terminal failure logs callback_stale_claim and does not flip the row", async () => {
    // maxAttempts 1: a throw on the first claim goes straight to failTerminal.
    const w = makeWorker({ maxAttempts: 1 });
    inbox.add(inboxRow("p"));
    processor.auto = () => {
      // While claim #1 runs, its lease "expires" and another task re-claims
      // (#2) and finishes the row: it is now `processed` under claim #2.
      const r = inbox.rows.get("p");
      if (r) {
        r.attempts = 2;
        r.status = "processed";
      }
      return new Error("still broken");
    };
    w.start();
    w.kick("p");
    await flush();

    expect(inbox.markFailed).toHaveBeenCalledWith("p", expect.any(String), expect.any(Date), {
      attempt: 1,
    });
    expect(inbox.rows.get("p")).toMatchObject({ status: "processed", attempts: 2 });
    expect(eventsNamed("callback_processing_failed")).toHaveLength(0);
    expect(eventsNamed("callback_stale_claim")).toHaveLength(1);
    expect(eventsNamed("callback_stale_claim")[0]).toMatchObject({
      level: "warn",
      obj: { webhook_event_id: "p", attempt: 1, intended_status: "failed" },
    });
    await w.stop();
  });

  test("a throw on the last allowed attempt fails the row at once", async () => {
    const w = makeWorker({ maxAttempts: 2 });
    inbox.add(inboxRow("p"));
    processor.auto = () => new Error("still broken");
    w.start();
    w.kick("p");
    await flush();
    expect(inbox.rows.get("p")).toMatchObject({ status: "processing", attempts: 1 });
    expect(eventsNamed("callback_process_threw")).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(LEASE + 15_000);
    expect(processor.process).toHaveBeenCalledTimes(2);
    expect(inbox.rows.get("p")).toMatchObject({ status: "failed", attempts: 2 });
    expect(inbox.rows.get("p")?.errorMessage).toContain("still broken");
    expect(eventsNamed("callback_processing_failed")).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(10 * LEASE);
    expect(processor.process).toHaveBeenCalledTimes(2);
    await w.stop();
  });
});

describe("CallbackWorker — stop()", () => {
  test("drains in-flight rows within the bound and accepts no new work", async () => {
    const w = makeWorker({ concurrency: 2, drainTimeoutMs: 20_000 });
    for (const id of ["a", "b", "c"]) inbox.add(inboxRow(id));
    w.start();
    w.kick("a");
    w.kick("b");
    w.kick("c"); // queued, never claimed
    await flush();

    const stopping = w.stop();
    expect(w.stop()).toBe(stopping); // idempotent
    expect(w.kick("d")).toBe(false);
    expect(eventsNamed("callback_kick_rejected")).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(5_000);
    processor.finish("a");
    await vi.advanceTimersByTimeAsync(5_000);
    processor.finish("b");
    const report = await stopping;

    expect(report).toEqual({ drained: true, abandonedInFlight: 0, droppedKicks: 1 });
    // The dropped kick was never claimed: its row stays `received` for a re-driver.
    expect(processor.calls.map((c) => c.id)).toEqual(["a", "b"]);
    expect(inbox.rows.get("c")?.status).toBe("received");
    expect(w.stats().state).toBe("stopped");

    // The re-driver timer is gone.
    await vi.advanceTimersByTimeAsync(10 * 15_000);
    expect(inbox.claimBatch).not.toHaveBeenCalled();
  });

  test("gives up at the bound; unfinished rows keep their lease for a re-driver", async () => {
    const w = makeWorker({ concurrency: 2, drainTimeoutMs: 20_000 });
    inbox.add(inboxRow("slow"));
    w.start();
    w.kick("slow");
    await flush();

    let settled = false;
    const stopping = w.stop().then((r) => {
      settled = true;
      return r;
    });
    await vi.advanceTimersByTimeAsync(19_999);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await stopping).toEqual({ drained: false, abandonedInFlight: 1, droppedKicks: 0 });
    expect(eventsNamed("callback_worker_stopped")[0]?.level).toBe("warn");
    expect(inbox.rows.get("slow")).toMatchObject({ status: "processing", attempts: 1 });
  });

  test("stop on an idle worker resolves immediately", async () => {
    const w = makeWorker();
    expect(await w.stop()).toEqual({ drained: true, abandonedInFlight: 0, droppedKicks: 0 });
    w.start(); // ignored once stopped
    await vi.advanceTimersByTimeAsync(60_000);
    expect(inbox.claimBatch).not.toHaveBeenCalled();
  });
});
