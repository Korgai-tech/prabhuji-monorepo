/**
 * TAM-260 Task 7: how `initPaymentModule` wires the callback worker.
 *
 * The real composition root on a bare Fastify instance, with `CallbackWorker`
 * and the controller's constructor replaced by recorders. Pins:
 *   - ONE worker per init, built with exactly the env knobs and the deferred
 *     list as `providers` (the 24 h legacy-row window is the worker's own
 *     default, not configured here);
 *   - DEFAULTS ship OFF: the deferred list is empty, so the controller gets NO
 *     deferral (every gateway, Razorpay included, runs inline), and the
 *     re-driver started on listen has `providers: []`;
 *   - the re-driver is started ONLY by `listen` (the API process), whatever
 *     the deferred list (B1: an emptied list still drains in-flight rows).
 *     `ready()` + `close()` without `listen` is the shape of `billing.ts`, the
 *     OpenAPI emitter and every inject test, and never starts it;
 *   - `close()` stops (drains) it.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "@api/app.js";
import { resetEnvCache } from "@api/shared/config";
import { clearGlobalServices } from "@api/shared/workspace";
import type * as CallbackWorkerModule from "../services/callback-worker.js";
import type * as CallbackControllerModule from "../controllers/payment.callback.controller.js";

interface Recorded {
  options: Record<string, unknown>;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  kick: ReturnType<typeof vi.fn>;
}

const workers = vi.hoisted((): Recorded[] => []);
/** The third constructor argument of every `PaymentCallbackController` built. */
const deferrals = vi.hoisted((): unknown[] => []);

vi.mock("../controllers/payment.callback.controller.js", async (importOriginal) => {
  const actual = await importOriginal<typeof CallbackControllerModule>();
  class RecordingController extends actual.PaymentCallbackController {
    constructor(...args: ConstructorParameters<typeof actual.PaymentCallbackController>) {
      super(...args);
      deferrals.push(args[2]);
    }
  }
  return { ...actual, PaymentCallbackController: RecordingController };
});

vi.mock("../services/callback-worker.js", async (importOriginal) => {
  const actual = await importOriginal<typeof CallbackWorkerModule>();
  class RecordingWorker {
    readonly start = vi.fn();
    readonly stop = vi.fn(() =>
      Promise.resolve({ drained: true, abandonedInFlight: 0, droppedKicks: 0 })
    );
    readonly kick = vi.fn(() => true);
    constructor(_repo: unknown, _processor: unknown, options: Record<string, unknown>) {
      workers.push({ options, start: this.start, stop: this.stop, kick: this.kick });
    }
  }
  return { ...actual, CallbackWorker: RecordingWorker };
});

// Imported after the mocks are declared (vi.mock is hoisted regardless).
const { initPaymentModule } = await import("../index.js");

const ORIGINAL = { ...process.env };
let app: FastifyInstance | null = null;

beforeEach(() => {
  workers.length = 0;
  deferrals.length = 0;
  resetEnvCache();
  for (const key of Object.keys(process.env)) {
    if (key.startsWith("PAYMENT_CALLBACK_")) delete process.env[key];
  }
});

afterEach(async () => {
  await app?.close();
  app = null;
  vi.restoreAllMocks();
  clearGlobalServices();
  process.env = { ...ORIGINAL };
  resetEnvCache();
});

async function build(): Promise<FastifyInstance> {
  app = await buildApp();
  initPaymentModule(app);
  return app;
}

type Deferral = { providers: ReadonlySet<string>; worker: unknown } | null;

describe("the API process (listen)", () => {
  test("DEFAULTS (ships off): no deferral for any gateway; re-driver started with providers []", async () => {
    const a = await build();

    // Every gateway, Razorpay included, runs the unchanged inline path.
    expect(deferrals).toEqual([null]);
    expect(workers).toHaveLength(1);
    expect(workers[0]?.options).toEqual({
      concurrency: 4,
      leaseMs: 600_000,
      redriveMinAgeMs: 600_000,
      redriveIntervalMs: 15_000,
      maxAttempts: 5,
      providers: [],
    });
    // Built, but nothing runs until listen.
    expect(workers[0]?.start).not.toHaveBeenCalled();

    await a.listen({ port: 0, host: "127.0.0.1" });
    expect(workers[0]?.start).toHaveBeenCalledTimes(1);
    // …and the kicker is never used: nothing is deferred.
    expect(workers[0]?.kick).not.toHaveBeenCalled();

    await a.close();
    app = null;
    expect(workers[0]?.stop).toHaveBeenCalledTimes(1);
  });

  test("razorpay deferred: the controller defers exactly razorpay to the ONE worker, started on listen", async () => {
    process.env.PAYMENT_CALLBACK_DEFERRED_PROVIDERS = "razorpay";
    const a = await build();

    expect(deferrals).toHaveLength(1);
    const deferral = deferrals[0] as Deferral;
    expect(deferral).not.toBeNull();
    expect([...(deferral?.providers ?? [])]).toEqual(["razorpay"]);
    expect(workers).toHaveLength(1);
    expect(workers[0]?.options).toMatchObject({ providers: ["razorpay"] });
    // The controller kicks the very worker the listen hook starts.
    (deferral?.worker as { kick(id: string): void }).kick("row-1");
    expect(workers[0]?.kick).toHaveBeenCalledWith("row-1");

    await a.listen({ port: 0, host: "127.0.0.1" });
    expect(workers[0]?.start).toHaveBeenCalledTimes(1);

    await a.close();
    app = null;
    expect(workers[0]?.stop).toHaveBeenCalledTimes(1);
  });

  test("overridden knobs reach the worker; the min age follows the lease", async () => {
    process.env.PAYMENT_CALLBACK_WORKER_CONCURRENCY = "2";
    process.env.PAYMENT_CALLBACK_LEASE_MS = "90000";
    process.env.PAYMENT_CALLBACK_REDRIVE_INTERVAL_MS = "5000";
    process.env.PAYMENT_CALLBACK_MAX_ATTEMPTS = "3";
    const a = await build();
    await a.listen({ port: 0, host: "127.0.0.1" });

    expect(workers[0]?.options).toMatchObject({
      concurrency: 2,
      leaseMs: 90_000,
      redriveMinAgeMs: 90_000,
      redriveIntervalMs: 5_000,
      maxAttempts: 3,
    });
  });

  test("an explicitly EMPTY list (the rollback): no deferral, re-driver still started with providers []", async () => {
    process.env.PAYMENT_CALLBACK_DEFERRED_PROVIDERS = "";
    const a = await build();
    expect(deferrals).toEqual([null]);

    await a.listen({ port: 0, host: "127.0.0.1" });
    expect(workers).toHaveLength(1);
    expect(workers[0]?.options).toMatchObject({ providers: [] });
    expect(workers[0]?.start).toHaveBeenCalledTimes(1);
  });
});

describe("processes that never listen (billing.ts, the OpenAPI emitter, inject tests)", () => {
  test.each([
    ["the default list", undefined],
    ["razorpay deferred", "razorpay"],
    ["an EMPTY list", ""],
  ])("%s — ready() + close(): the re-driver is never started", async (_label, list) => {
    if (list !== undefined) process.env.PAYMENT_CALLBACK_DEFERRED_PROVIDERS = list;
    const a = await build();
    await a.ready();
    await a.close();
    app = null;

    expect(workers).toHaveLength(1);
    expect(workers[0]?.start).not.toHaveBeenCalled();
    // Drained on close all the same (a no-op for a worker that never ran).
    expect(workers[0]?.stop).toHaveBeenCalledTimes(1);
  });
});
