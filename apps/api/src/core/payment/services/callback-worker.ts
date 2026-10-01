import { createModuleLogger } from "@api/shared/logs";
import type { PaymentProviderName } from "@api/shared/config/payment-providers";
import type {
  WebhookEventInboxRow,
  WebhookEventRepository,
} from "@api/core/payment/repositories/webhook-event.repository.js";
import { paymentTrace, PAYMENT_STAGE, safeFailureMessage } from "./payment-log.js";
import { storedCallbackFromRow, type CallbackService } from "./callback.service.js";

const log = createModuleLogger("payment:callback-worker");

/**
 * The slice of the inbox repository the worker uses. A `Pick` of the real
 * class rather than a hand-written copy, so a signature change in the
 * repository is a compile error here instead of a silent drift.
 */
export type CallbackInboxRepository = Pick<
  WebhookEventRepository,
  "claim" | "claimBatch" | "markFailed"
>;

/** The processing half of `CallbackService` (TAM-260 Task 4). */
export type CallbackProcessor = Pick<CallbackService, "process">;

/** Injected so the worker is testable without real time passing. */
export interface WorkerTimers {
  setInterval(fn: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface CallbackWorkerOptions {
  /** Rows processed at once in this process. Spec default 4. */
  concurrency: number;
  /** Claim lease. A `processing` row older than this is claimable again. */
  leaseMs: number;
  /** Re-driver period. */
  redriveIntervalMs: number;
  /**
   * Claims a row may take. The claim that would be number `maxAttempts + 1`
   * marks the row `failed` instead of processing it, and a `process` that
   * throws on the last allowed attempt marks it `failed` at once.
   */
  maxAttempts: number;
  /**
   * The re-driver only claims a `received` row once it is at least this old.
   * A fresh row belongs to its own kick. See `CALLBACK_WORKER_DEFAULTS` for why
   * the default is the lease and not "a few seconds".
   */
  redriveMinAgeMs: number;
  /**
   * The re-driver only claims a `received` row younger than this: each pass
   * hands `claimBatch` `receivedSince = now - redriveMaxAgeMs`. A ROLLING
   * window (spec, resolved 2026-09-25: 24 h), so it needs no startup read and
   * no coupling to a migration name, and is identical in every environment and
   * across restarts. Older `received` rows are left for a human (spec, "Legacy
   * `received` rows"). Never applied to lease-expired `processing` rows, which
   * are always drained.
   */
  redriveMaxAgeMs: number;
  /**
   * The DEFERRED providers: the re-driver only claims `received` rows of
   * these. A gateway still processed inline holds its row in `received`,
   * unclaimed, for the whole request, so re-driving it would process it twice.
   * Required (no default) so the filter cannot be forgotten. Lease-expired
   * `processing` rows are re-driven for ANY provider (only a worker sets
   * `processing`), so an empty list — the rollback — still drains rows left
   * in flight and claims no `received` row.
   */
  providers: readonly PaymentProviderName[];
  /** How long `stop()` waits for in-flight rows before giving up on them. */
  drainTimeoutMs: number;
}

/**
 * Spec defaults (Task 7 env knobs), plus the two knobs the spec leaves open.
 *
 * `redriveMinAgeMs` = the lease, deliberately. A row processed INLINE (every
 * gateway not in the deferred set) sits in `received`, unclaimed, for its whole
 * request, which can run tens of seconds on a slow provider read plus serial
 * analytics POSTs. A re-driver that took `received` rows after "a few seconds"
 * would process those a second time. `claimBatch` now also filters `received`
 * rows on `providers` (the deferred set), which closes that on its own; the
 * lease-long grace is kept as a second, independent guard (see the Task 5
 * report). It only ever applies to `received` rows, so it is unaffected by
 * the provider filter not applying to expired `processing` rows.
 *
 * `redriveMaxAgeMs` 24 h: the rolling legacy-row window (spec, resolved
 * 2026-09-25). No env knob by decision.
 *
 * `drainTimeoutMs` 20 s leaves ~10 s of ECS's default 30 s stop timeout for
 * `app.close()` and the pool disconnects.
 */
export const CALLBACK_WORKER_DEFAULTS = {
  concurrency: 4,
  leaseMs: 120_000,
  redriveIntervalMs: 15_000,
  maxAttempts: 5,
  redriveMinAgeMs: 120_000,
  redriveMaxAgeMs: 86_400_000,
  drainTimeoutMs: 20_000,
} as const satisfies Omit<CallbackWorkerOptions, "providers">;

export interface CallbackWorkerStopReport {
  /** True when every in-flight row finished inside the bound. */
  drained: boolean;
  /** Rows still running when the bound expired. They are re-driven after the lease. */
  abandonedInFlight: number;
  /** Kicks not yet claimed, dropped. Their rows stay `received` for a re-driver. */
  droppedKicks: number;
}

export type CallbackWorkerState = "idle" | "running" | "stopping" | "stopped";

type Job =
  | { source: "kick"; id: string; enqueuedAt: number }
  | { source: "redrive"; id: string; enqueuedAt: number; row: WebhookEventInboxRow };

const defaultTimers: WorkerTimers = {
  setInterval: (fn, ms) => {
    const h = setInterval(fn, ms);
    // Never the reason a process stays alive.
    h.unref();
    return h;
  },
  clearInterval: (h) => clearInterval(h as NodeJS.Timeout),
  setTimeout: (fn, ms) => {
    const h = setTimeout(fn, ms);
    h.unref();
    return h;
  },
  clearTimeout: (h) => clearTimeout(h as NodeJS.Timeout),
};

function assertPositiveInt(name: string, value: number): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive integer, got ${value}`);
  }
}

/**
 * Deferred processing of `webhook_events` rows (TAM-260 Task 5).
 *
 * The controller records the row and replies 200; the worker then does what
 * the request used to do, from the row: claim it under a lease, rebuild the
 * `StoredCallback`, and hand it to `CallbackService.process`, which is today's
 * post-dedupe body unchanged. Nothing here decides anything about money.
 *
 * Guarantees:
 *   - at most `concurrency` rows run at once in this process;
 *   - only a successful claim is processed, so two tasks, or a kick and a
 *     re-driver, never both process one row while its lease is live;
 *   - a `process` that throws is logged, frees its slot, and leaves the row
 *     `processing`, so it is claimable again once the lease expires;
 *   - after `maxAttempts` claims the row is `failed` via the existing
 *     `markFailed` and never claimed again;
 *   - every terminal write is fenced to the claim that made it (`attempts`),
 *     so a worker that outlived its lease cannot overwrite the new owner;
 *   - nothing here rejects into the void: every async path is caught and
 *     logged, so a failure can never crash the process or wedge a slot.
 *
 * Lifecycle: `idle` (kicks accepted, no re-driver) → `start()` → `running`
 * (kicks + re-driver) → `stop()` → `stopping` → `stopped` (no new work).
 * Construct it anywhere; START it only in the API process (`onListen` in the
 * payment composition root), never in `billing.ts`, the OpenAPI emitter or an
 * `inject`-based test, none of which listen.
 */
export class CallbackWorker {
  private readonly opts: CallbackWorkerOptions;
  private readonly now: () => Date;
  private readonly timers: WorkerTimers;

  private state: CallbackWorkerState = "idle";
  /** Claimed by the re-driver, waiting for a slot. Served before kicks: they hold a lease. */
  private readonly claimedQueue: Job[] = [];
  /** Unclaimed kicks, FIFO. */
  private readonly kickQueue: Job[] = [];
  /** Every id in either queue, for `kick` dedupe. */
  private readonly queuedIds = new Set<string>();
  private readonly inFlight = new Map<string, Promise<void>>();
  private redriveTimer: unknown = null;
  private redriving: Promise<number> | null = null;
  private stopPromise: Promise<CallbackWorkerStopReport> | null = null;
  private idleWaiters: Array<() => void> = [];

  constructor(
    private readonly repo: CallbackInboxRepository,
    private readonly processor: CallbackProcessor,
    options: Partial<Omit<CallbackWorkerOptions, "providers">> &
      Pick<CallbackWorkerOptions, "providers">,
    deps: { now?: () => Date; timers?: WorkerTimers } = {}
  ) {
    const opts: CallbackWorkerOptions = { ...CALLBACK_WORKER_DEFAULTS, ...options };
    assertPositiveInt("concurrency", opts.concurrency);
    assertPositiveInt("leaseMs", opts.leaseMs);
    assertPositiveInt("redriveIntervalMs", opts.redriveIntervalMs);
    assertPositiveInt("maxAttempts", opts.maxAttempts);
    assertPositiveInt("redriveMinAgeMs", opts.redriveMinAgeMs);
    assertPositiveInt("redriveMaxAgeMs", opts.redriveMaxAgeMs);
    assertPositiveInt("drainTimeoutMs", opts.drainTimeoutMs);
    this.opts = opts;
    this.now = deps.now ?? ((): Date => new Date());
    this.timers = deps.timers ?? defaultTimers;
  }

  /** Start the periodic re-driver. Idempotent; a no-op once stopping. */
  start(): void {
    if (this.state !== "idle") {
      if (this.state !== "running") {
        log.warn(
          { event: "callback_worker_start_ignored", state: this.state },
          "callback worker start ignored — already stopped"
        );
      }
      return;
    }
    this.state = "running";
    this.redriveTimer = this.timers.setInterval(() => {
      void this.redriveOnce();
    }, this.opts.redriveIntervalMs);
    log.info(
      {
        event: "callback_worker_started",
        concurrency: this.opts.concurrency,
        lease_ms: this.opts.leaseMs,
        redrive_interval_ms: this.opts.redriveIntervalMs,
        redrive_min_age_ms: this.opts.redriveMinAgeMs,
        redrive_max_age_ms: this.opts.redriveMaxAgeMs,
        providers: this.opts.providers,
        max_attempts: this.opts.maxAttempts,
      },
      "callback worker started"
    );
  }

  /**
   * Queue a freshly recorded row. Returns false when it was not queued:
   * already queued or in flight here (dedupe), or the worker is stopping.
   * A row not queued is not lost: it stays `received` for a re-driver.
   * The claim happens when a slot frees, so the lease starts with the work.
   */
  kick(rowId: string): boolean {
    if (this.state === "stopping" || this.state === "stopped") {
      log.warn(
        { event: "callback_kick_rejected", webhook_event_id: rowId, state: this.state },
        "callback kick rejected — worker is stopping; the row is left for a re-driver"
      );
      return false;
    }
    if (this.queuedIds.has(rowId) || this.inFlight.has(rowId)) {
      log.debug(
        { event: "callback_kick_deduped", webhook_event_id: rowId },
        "callback kick ignored — already queued or in flight here"
      );
      return false;
    }
    this.queuedIds.add(rowId);
    this.kickQueue.push({ source: "kick", id: rowId, enqueuedAt: this.now().getTime() });
    log.info(
      {
        event: "callback_enqueued",
        webhook_event_id: rowId,
        queued: this.queuedIds.size,
        in_flight: this.inFlight.size,
      },
      "callback enqueued for processing"
    );
    this.pump();
    return true;
  }

  /**
   * One re-driver pass: claim up to the free slots' worth of eligible rows and
   * queue them. Never claims more than it can start, so a claimed row does not
   * wait out its lease in a local queue. Returns the number claimed. Never
   * rejects. Exposed for ops and tests; `start()` runs it on the interval.
   */
  redriveOnce(): Promise<number> {
    if (this.state !== "running") return Promise.resolve(0);
    // One pass at a time: a slow claim must not stack ticks.
    if (this.redriving) return this.redriving;
    const pass = this.runRedrive().finally(() => {
      this.redriving = null;
      this.notifyIfIdle();
    });
    this.redriving = pass;
    return pass;
  }

  /**
   * Stop claiming, then wait up to `drainTimeoutMs` for in-flight rows (and a
   * re-driver pass already claiming). Unclaimed kicks are dropped: their rows
   * are `received` and another task's re-driver takes them. Rows still running
   * at the bound keep their lease and are re-driven after it expires.
   * Idempotent: every call gets the same report.
   */
  stop(): Promise<CallbackWorkerStopReport> {
    if (this.stopPromise) return this.stopPromise;
    this.stopPromise = this.runStop();
    return this.stopPromise;
  }

  /** Resolves when nothing is queued, in flight, or being re-driven. For tests. */
  whenIdle(): Promise<void> {
    if (this.isIdle()) return Promise.resolve();
    return new Promise((resolve) => this.idleWaiters.push(resolve));
  }

  stats(): { state: CallbackWorkerState; queued: number; inFlight: number } {
    return { state: this.state, queued: this.queuedIds.size, inFlight: this.inFlight.size };
  }

  // ── internals ────────────────────────────────────────────────────────────

  private async runStop(): Promise<CallbackWorkerStopReport> {
    const wasIdle = this.state === "idle";
    this.state = "stopping";
    if (this.redriveTimer !== null) {
      this.timers.clearInterval(this.redriveTimer);
      this.redriveTimer = null;
    }
    const droppedKicks = this.kickQueue.length;
    for (const job of this.kickQueue) this.queuedIds.delete(job.id);
    this.kickQueue.length = 0;

    let timer: unknown = null;
    const timedOut = new Promise<false>((resolve) => {
      timer = this.timers.setTimeout(() => resolve(false), this.opts.drainTimeoutMs);
    });
    const drained = await Promise.race([this.drain().then(() => true as const), timedOut]);
    if (timer !== null) this.timers.clearTimeout(timer);

    this.state = "stopped";
    const report: CallbackWorkerStopReport = {
      drained,
      abandonedInFlight: this.inFlight.size + this.claimedQueue.length,
      droppedKicks,
    };
    const fields = {
      event: "callback_worker_stopped",
      was_idle: wasIdle,
      drained,
      abandoned_in_flight: report.abandonedInFlight,
      dropped_kicks: droppedKicks,
      drain_timeout_ms: this.opts.drainTimeoutMs,
    };
    if (drained) {
      log.info(fields, "callback worker stopped — in-flight rows drained");
    } else {
      log.warn(
        fields,
        "callback worker stopped — drain bound hit; unfinished rows are re-driven after their lease"
      );
    }
    this.notifyIfIdle();
    return report;
  }

  /** In-flight rows, a claiming re-driver pass, and anything that pass queued. */
  private async drain(): Promise<void> {
    for (;;) {
      if (this.redriving) await this.redriving;
      if (this.inFlight.size === 0 && this.claimedQueue.length === 0) return;
      await Promise.allSettled([...this.inFlight.values()]);
    }
  }

  private async runRedrive(): Promise<number> {
    const free =
      this.opts.concurrency -
      this.inFlight.size -
      this.claimedQueue.length -
      this.kickQueue.length;
    if (free <= 0) return 0;
    const nowMs = this.now().getTime();
    let rows: WebhookEventInboxRow[];
    try {
      rows = await this.repo.claimBatch(
        free,
        new Date(nowMs - this.opts.redriveMinAgeMs),
        this.opts.leaseMs,
        // The rolling legacy-row window, recomputed every pass.
        new Date(nowMs - this.opts.redriveMaxAgeMs),
        this.opts.providers
      );
    } catch (err) {
      log.error(
        { event: "callback_redrive_failed", reason: safeFailureMessage(err), err },
        "callback re-driver could not claim rows — retrying next tick"
      );
      return 0;
    }
    if (rows.length === 0) return 0;

    log.info(
      {
        event: "callback_redriven",
        count: rows.length,
        webhook_event_ids: rows.map((r) => r.id),
      },
      "callback re-driver claimed rows"
    );
    const enqueuedAt = this.now().getTime();
    for (const row of rows) {
      if (this.inFlight.has(row.id)) {
        // Our own worker has run past the lease. Running it twice here is
        // exactly what the lease exists to stop. The running copy's terminal
        // write is fenced to its OLD claim, so it no longer lands: the row
        // stays `processing` under this new claim and is re-driven once this
        // lease expires too (processing re-reads the provider, so a second
        // pass is safe).
        log.warn(
          {
            event: "callback_lease_expired_in_flight",
            webhook_event_id: row.id,
            attempts: row.attempts,
            lease_ms: this.opts.leaseMs,
          },
          "re-driver claimed a row this process is still processing — not run twice"
        );
        continue;
      }
      // A pending kick for the same row would only claim null now; the
      // re-driver's claim replaces it.
      const kickAt = this.kickQueue.findIndex((j) => j.id === row.id);
      if (kickAt >= 0) this.kickQueue.splice(kickAt, 1);
      this.queuedIds.add(row.id);
      this.claimedQueue.push({ source: "redrive", id: row.id, enqueuedAt, row });
    }
    this.pump();
    return rows.length;
  }

  private pump(): void {
    while (this.inFlight.size < this.opts.concurrency) {
      // Claimed rows first, and even while stopping: they are already ours.
      const job =
        this.claimedQueue.shift() ??
        (this.state === "stopping" || this.state === "stopped"
          ? undefined
          : this.kickQueue.shift());
      if (!job) break;
      this.queuedIds.delete(job.id);
      const done = this.run(job).finally(() => {
        this.inFlight.delete(job.id);
        this.pump();
        this.notifyIfIdle();
      });
      this.inFlight.set(job.id, done);
    }
  }

  /** Never rejects: every failure is caught and logged here. */
  private async run(job: Job): Promise<void> {
    let row: WebhookEventInboxRow | null = null;
    try {
      row = job.source === "redrive" ? job.row : await this.repo.claim(job.id, this.opts.leaseMs);
      if (!row) {
        // Normal: another task's re-driver, or an earlier kick, got it first,
        // or it is already terminal.
        log.debug(
          { event: "callback_claim_skipped", webhook_event_id: job.id },
          "callback row not claimable — skipped"
        );
        return;
      }

      if (row.attempts > this.opts.maxAttempts) {
        await this.failTerminal(
          row,
          `callback processing gave up after ${row.attempts - 1} attempts (max ${this.opts.maxAttempts})`,
          "max_attempts_exhausted"
        );
        return;
      }

      const stored = storedCallbackFromRow(row);
      if (!stored) {
        await this.failTerminal(
          row,
          `callback row is not processable by this build (provider=${row.provider}, kind=${row.kind})`,
          "unprocessable_row"
        );
        return;
      }

      const startedAt = this.now();
      // D3: queue wait is a LOG field only. `bk_webhook_received.processing_ms`
      // is measured inside `process` and keeps excluding it.
      log.info(
        {
          ...paymentTrace({
            stage: PAYMENT_STAGE.callback,
            provider: row.provider,
            referenceId: row.referenceId,
          }),
          event: "callback_claimed",
          source: job.source,
          kind: row.kind,
          webhook_event_id: row.id,
          attempts: row.attempts,
          queue_wait_ms: Math.max(0, startedAt.getTime() - row.receivedAt.getTime()),
          local_wait_ms: Math.max(0, startedAt.getTime() - job.enqueuedAt),
        },
        "callback claimed for processing"
      );

      try {
        // `process` records its own processing failures (`failed`) and never
        // throws for them; a throw here means marking the row itself failed.
        await this.processor.process(stored, startedAt);
      } catch (err) {
        if (row.attempts >= this.opts.maxAttempts) {
          await this.failTerminal(
            row,
            `callback processing threw on its last attempt (${row.attempts} of ${this.opts.maxAttempts}): ${safeFailureMessage(err)}`,
            "max_attempts_exhausted"
          );
          return;
        }
        log.error(
          {
            ...paymentTrace({
              stage: PAYMENT_STAGE.callback,
              provider: row.provider,
              referenceId: row.referenceId,
            }),
            event: "callback_process_threw",
            kind: row.kind,
            webhook_event_id: row.id,
            attempts: row.attempts,
            max_attempts: this.opts.maxAttempts,
            lease_ms: this.opts.leaseMs,
            reason: safeFailureMessage(err),
            err,
          },
          "callback processing threw — the row is re-driven after its lease expires"
        );
      }
    } catch (err) {
      // A failed claim or a failed terminal mark (DB down). The row keeps
      // whatever state it had; a claimed one is re-driven after its lease.
      log.error(
        {
          event: "callback_worker_job_failed",
          source: job.source,
          webhook_event_id: job.id,
          attempts: row?.attempts ?? null,
          reason: safeFailureMessage(err),
          err,
        },
        "callback worker job failed — the row is left for a re-driver"
      );
    }
  }

  /**
   * Terminal failure via the existing `markFailed`, logged under the unchanged
   * `callback_processing_failed` name (spec, "Poison row"). The billing sweep
   * remains the backstop for whatever the row was about, exactly as for a
   * `failed` row today.
   *
   * Fenced to this claim (`attempts`): if the lease expired and another claim
   * owns the row, nothing is written and `callback_stale_claim` is logged
   * instead, so a stale worker never flips the owner's outcome.
   */
  private async failTerminal(
    row: WebhookEventInboxRow,
    message: string,
    terminalReason: "max_attempts_exhausted" | "unprocessable_row"
  ): Promise<void> {
    const owned = await this.repo.markFailed(row.id, message, this.now(), {
      attempt: row.attempts,
    });
    if (!owned) {
      log.warn(
        {
          ...paymentTrace({
            stage: PAYMENT_STAGE.callback,
            provider: row.provider,
            referenceId: row.referenceId,
          }),
          event: "callback_stale_claim",
          kind: row.kind,
          webhook_event_id: row.id,
          attempt: row.attempts,
          intended_status: "failed",
          terminal_reason: terminalReason,
        },
        "callback claim went stale before its terminal write — another claim owns the row; not marked failed"
      );
      return;
    }
    log.error(
      {
        ...paymentTrace({
          stage: PAYMENT_STAGE.callback,
          provider: row.provider,
          referenceId: row.referenceId,
        }),
        event: "callback_processing_failed",
        kind: row.kind,
        webhook_event_id: row.id,
        reason: message,
        terminal_reason: terminalReason,
        attempts: row.attempts,
        max_attempts: this.opts.maxAttempts,
      },
      "callback given up on — marked failed; will be reconciled by the billing cycle"
    );
  }

  private isIdle(): boolean {
    return this.queuedIds.size === 0 && this.inFlight.size === 0 && this.redriving === null;
  }

  private notifyIfIdle(): void {
    if (!this.isIdle() || this.idleWaiters.length === 0) return;
    const waiters = this.idleWaiters;
    this.idleWaiters = [];
    for (const resolve of waiters) resolve();
  }
}
