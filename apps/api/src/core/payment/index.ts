import type { FastifyInstance, FastifyRequest } from "fastify";
import {
  isPaymentProviderName,
  loadEnv,
  PAYMENT_PROVIDERS,
} from "@api/shared/config";
import { createModuleLogger } from "@api/shared/logs";
import { registerGlobalService } from "@api/shared/workspace";
import { DEFAULT_PAYWALL_ID } from "@api/core/paywall/services";
import { MandateRepository } from "./repositories/mandate.repository.js";
import { TransactionsRepository } from "./repositories/transactions.repository.js";
import { PdnRepository } from "./repositories/pdn.repository.js";
// The inbox is `webhook_events` now; `callback-event.repository.ts` remains only so
// the rows written before TAM-141 stay readable, and takes no new writes.
import { WebhookEventRepository } from "./repositories/webhook-event.repository.js";
import { MandateService } from "./services/mandate.service.js";
import { PdnService } from "./services/pdn.service.js";
import { BillingCycleService } from "./services/billing-cycle.service.js";
import { BillingLock } from "./services/billing-lock.js";
import { CallbackService } from "./services/callback.service.js";
import { CallbackWorker } from "./services/callback-worker.js";
import { PaymentController } from "./controllers/payment.controller.js";
import {
  PaymentCallbackController,
  type CallbackGateway,
} from "./controllers/payment.callback.controller.js";
import type {
  MandateProvider,
  ProviderResolver,
} from "./mandate.provider.js";
import { UnknownProviderError } from "./mandate.provider.js";
import {
  registerPaymentCallbackRoutes,
  registerPaymentRoutes,
} from "./routes/payment.routes.js";
import { PaymentApi } from "./api/payment.api.impl.js";
import { gatewayFor } from "./gateways.js";

const log = createModuleLogger("payment:module");

/**
 * Payment module composition root.
 *
 * MUST be initialised AFTER `initSubscriptionModule` and `initPaywallModule`:
 * it resolves both facades through `performServiceCall` — subscription for
 * every entitlement write, paywall for plan pricing — and that throws
 * SERVICE_UNAVAILABLE if the facade is not yet registered. See the ordering
 * note in `src/modules.ts`.
 *
 * `PAYMENT_PROVIDER` names the gateway NEW mandates register on, and ONLY that.
 * Everything touching an existing mandate resolves from the row's own
 * `provider` column, so switching gateways moves new registrations and nothing
 * else — which is what makes the switch safe and the rollback free.
 *
 * EVERY registered gateway is resolvable, always. There is deliberately no
 * "enabled gateways" list to maintain: a list you have to remember to update is
 * a list someone forgets, and forgetting the gateway you just switched AWAY
 * from is precisely the case that must never break. The registry already knows
 * every gateway that exists, and `mandates.provider` already knows which one
 * each subscriber is on. Neither needs a human to restate it in config.
 *
 * Adapters are built LAZILY for that reason. A gateway's client reads its
 * credentials when constructed, so building all of them eagerly would make an
 * unconfigured gateway fail the BOOT — turning "we have not set up Razorpay
 * yet" into a service that will not start. Built on first use instead, the cost
 * of a missing credential falls on the rows that actually need that gateway:
 * logged at error, that row skipped, every other gateway's billing untouched.
 */
export function initPaymentModule(app: FastifyInstance): void {
  const env = loadEnv();

  const mandateRepo = new MandateRepository();
  const transactionsRepo = new TransactionsRepository();
  const pdnRepo = new PdnRepository();
  const callbackRepo = new WebhookEventRepository();

  // Memoised, not eager: built on first use and then shared, so an adapter's
  // client (and its connection reuse) is created at most once per process
  // rather than per row during a sweep.
  const providers = new Map<string, MandateProvider>();

  /**
   * Resolve a row's gateway — ANY registered gateway, not a configured subset.
   *
   * Throws rather than falling back to the active gateway, and the distinction
   * is the whole point: a silent fallback would present an existing
   * subscriber's debit to a gateway that has never seen their mandate id.
   * Callers log the row and skip it, so one gateway's misconfiguration cannot
   * stop another gateway's billing.
   *
   * Two different failures both surface here, and both are loud:
   *   - an unknown name (a corrupt or hand-edited `provider` value) →
   *     `UnknownProviderError`;
   *   - a known gateway whose credentials are absent → the client's own
   *     `required()` throws on construction, at the first row that needs it.
   */
  const resolve: ProviderResolver = (name) => {
    const cached = providers.get(name);
    if (cached) return cached;
    if (!isPaymentProviderName(name)) throw new UnknownProviderError(name);
    const built = gatewayFor(name).createProvider();
    providers.set(name, built);
    return built;
  };

  // Every gateway can receive callbacks, for as long as it has live mandates —
  // which is a fact about the data, not about configuration. An unconfigured
  // gateway's authenticator has no secret to check against and rejects with
  // 401, which is the correct answer: better a signal the provider retries than
  // a 200 that drops a real settlement forever.
  const callbackGateways = new Map<string, CallbackGateway>(
    PAYMENT_PROVIDERS.map((name) => {
      const gw = gatewayFor(name);
      return [name, { gateway: gw, authenticator: gw.createCallbackAuthenticator(env) }];
    })
  );

  // Eager for the ACTIVE gateway only — its credentials are already required at
  // boot (`PROVIDER_REQUIRED_KEYS`), and failing here rather than on a user's
  // first Pay tap is the right place for that to surface.
  const provider = resolve(env.PAYMENT_PROVIDER);

  // Both annotated explicitly, and they have to be: the two now reference each
  // other (see the thunk below), and TypeScript cannot infer a type that appears
  // in its own initializer.
  const mandateService: MandateService = new MandateService(
    mandateRepo,
    transactionsRepo,
    provider,
    resolve,
    {
      expiryMinutes: env.PAYMENT_MANDATE_EXPIRY_MINUTES,
      mandateName: env.PAYMENT_MANDATE_NAME,
    },
    // A THUNK, because the two services point at each other: the billing engine
    // needs the mandate service to act on a cycle's outcome, and the mandate
    // service needs the billing engine to raise a freshly-activated mandate's
    // first notification (TAM-164). Deferring the read to call time is what lets
    // both be `const` and constructed in one order. Safe because nothing calls
    // it during construction — the first call is a user approving a mandate.
    () => billingService
  );
  const pdnService = new PdnService(pdnRepo, transactionsRepo, resolve);
  const billingService: BillingCycleService = new BillingCycleService(
    mandateRepo,
    transactionsRepo,
    resolve,
    mandateService,
    pdnService,
    pdnRepo,
    { managedByProvider: env.PAYMENT_MANDATE_MANAGED_BY_PROVIDER }
  );
  const callbackService = new CallbackService(
    callbackRepo,
    mandateRepo,
    transactionsRepo,
    mandateService,
    billingService,
    pdnService
  );

  const api = new PaymentApi(
    billingService,
    mandateService,
    // Just under the 30-minute schedule interval: long enough that a healthy
    // run never expires its own lock, short enough that a task killed mid-run
    // costs at most one skipped tick.
    new BillingLock(25 * 60_000),
    { schedulerEnabled: env.ENABLE_BILLING_SCHEDULER }
  );
  registerGlobalService("payment", api);

  const controller = new PaymentController(mandateService, {
    paywallId: DEFAULT_PAYWALL_ID,
    supportsInitialDeposit: provider.supportsInitialDeposit,
  });
  // ---- TAM-260: ack-first callbacks for the DEFERRED gateways -------------
  //
  // `deferredProviders` (default EMPTY, i.e. ships off; `razorpay` turns it
  // on) are acked once their `webhook_events` row commits and processed
  // afterwards by the ONE worker this process owns. Every other gateway — and
  // every gateway when the list is empty, which is the default — is processed
  // inline exactly as before: with an empty list the controller gets NO
  // deferral at all.
  //
  // Constructed here in every process: construction has no side effects (no
  // timer, no query), and an unstarted worker still processes the rows it is
  // kicked, which is what an `inject`-based test exercises. Only `start()`
  // turns on the periodic re-driver.
  const deferredProviders = env.PAYMENT_CALLBACK_DEFERRED_PROVIDERS;
  const callbackWorker = new CallbackWorker(callbackRepo, callbackService, {
    concurrency: env.PAYMENT_CALLBACK_WORKER_CONCURRENCY,
    leaseMs: env.PAYMENT_CALLBACK_LEASE_MS,
    // Tied to the lease on purpose (see CALLBACK_WORKER_DEFAULTS): a
    // `received` row younger than one lease may still be an INLINE row
    // mid-request on a task running the other mode (a rolling deploy, a
    // rollback), and taking it would process it twice.
    redriveMinAgeMs: env.PAYMENT_CALLBACK_LEASE_MS,
    redriveIntervalMs: env.PAYMENT_CALLBACK_REDRIVE_INTERVAL_MS,
    maxAttempts: env.PAYMENT_CALLBACK_MAX_ATTEMPTS,
    // `redriveMaxAgeMs` is left at its 24 h default: the rolling window for
    // legacy `received` rows (spec, resolved 2026-09-25), no env knob.
    providers: deferredProviders,
  });
  const callbackController = new PaymentCallbackController(
    callbackService,
    callbackGateways,
    deferredProviders.length > 0
      ? { providers: new Set(deferredProviders), worker: callbackWorker }
      : null
  );

  // START only in the process that serves HTTP. `onListen` fires from
  // `app.listen`, which only `src/index.ts` calls: `billing.ts` never listens
  // (and `process.exit`s after its sweep), the OpenAPI emitter and every
  // `inject`-based test never listen. `start()` is synchronous and never
  // throws (it only arms a timer and logs).
  //
  // Registered REGARDLESS of the deferred list, so a rollback (list emptied,
  // or a provider removed) still drains that provider's rows its workers left
  // in `processing`: `claimBatch` claims lease-expired `processing` rows for
  // any provider but `received` rows only for the listed ones, so with an
  // empty list the re-driver claims no `received` row at all. Nothing else
  // re-applies a Razorpay PDN's delivered-at correction to
  // `scheduled_debit_at`, so these rows cannot be left to the billing sweep.
  app.addHook("onListen", (done) => {
    callbackWorker.start();
    done();
  });
  // DRAIN on every close, before the database goes away. `preClose` runs
  // inside `app.close()` — after routes stop taking new requests, before the
  // HTTP server closes — and the shutdown in `bootstrap.ts` awaits
  // `app.close()` BEFORE it disconnects Prisma and Redis, so in-flight rows
  // finish against a live pool. On a worker that was never started and never
  // kicked (the billing task, the emitter) this resolves at once. Registered
  // regardless of the list so rows kicked before a config change are still
  // drained. `stop()` never rejects.
  app.addHook("preClose", async () => {
    await callbackWorker.stop();
  });

  void app.register(
    (scoped) => {
      registerPaymentRoutes(scoped, controller);
      // The callback route lives in its own child scope so the raw-body parser
      // (needed for HMAC signature verification) is encapsulated to it and does
      // not touch the JWT user routes.
      void scoped.register((cb) => {
        cb.addContentTypeParser(
          "application/json",
          { parseAs: "string" },
          (
            req: FastifyRequest,
            raw: string,
            done: (err: Error | null, body?: unknown) => void
          ) => {
            req.rawBody = raw;
            try {
              done(null, raw.length > 0 ? JSON.parse(raw) : {});
            } catch (err) {
              done(err as Error, undefined);
            }
          }
        );
        registerPaymentCallbackRoutes(cb, callbackController);
      });
    },
    { prefix: "/payment" }
  );

  log.info(
    {
      event: "payment_module_initialised",
      provider: provider.name,
      // Every gateway this process can resolve. Not configuration — the whole
      // registry — so "is the old gateway still reachable after the switch?"
      // is answered by construction rather than by remembering a list.
      resolvable_providers: PAYMENT_PROVIDERS,
      payment_env: env.PAYMENT_ENV,
      scheduler_enabled: env.ENABLE_BILLING_SCHEDULER,
      managed_by_provider: env.PAYMENT_MANDATE_MANAGED_BY_PROVIDER,
      // TAM-260: gateways acked first and processed by the callback worker.
      // Empty = every gateway inline.
      callback_deferred_providers: deferredProviders,
    },
    "payment module initialised"
  );
}
