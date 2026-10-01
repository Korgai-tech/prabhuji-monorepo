import { bootstrap } from "@api/bootstrap";
import { PAYMENT_PROVIDERS, isPaymentProviderName } from "@api/shared/config";
import { createModuleLogger } from "@api/shared/logs";
import { performServiceCall } from "@api/shared/workspace";

const log = createModuleLogger("billing");

/**
 * One billing-cycle tick, as a one-off ECS task.
 *
 * The scheduler's entrypoint. EventBridge Scheduler fires `ecs:RunTask` against
 * the api task definition with this file as the command override, so billing
 * runs on the same image and the same task role as the API without a second
 * service, a second Dockerfile, or a duplicated set of secrets. Emitted as a
 * separate bundle via `additionalEntryPoints` in `project.json` — the same
 * mechanism `telemetry.ts` already uses.
 *
 * ## Why it reuses `bootstrap()` rather than wiring a narrower root
 *
 * `initPaymentModule` resolves the `subscription` and `paywall` facades through
 * `performServiceCall`, which throws SERVICE_UNAVAILABLE unless those modules
 * registered first — an ordering `src/modules.ts` owns and this file must not
 * re-derive. A bespoke composition root here would work on the day it was
 * written and silently drift the first time a module gained a dependency, and
 * the failure would surface as a skipped billing run rather than a crash.
 *
 * What it does NOT inherit: `runAllSeeds` and `runAdminBootstrap` live in
 * `index.ts`'s `main()`, not in `bootstrap()`, so a billing task never seeds
 * content or touches the admin user. It also never calls `app.listen` — the
 * routes are built but nothing binds a port.
 *
 * ## Exit codes
 *
 * 0 on a completed run, INCLUDING a run that did nothing because the scheduler
 * is disabled or another task held the lock — neither is a failure, and making
 * them non-zero would page someone for a working kill switch. 1 only when the
 * cycle threw, which is what EventBridge's own failure metric keys on.
 */
async function main(): Promise<void> {
  // Reads only. `--dry-run` reports what the cycle WOULD do without calling a
  // provider write endpoint or moving money — the sequence to run against an
  // environment before arming the schedule against it.
  const dryRun = process.argv.includes("--dry-run");
  // `--provider=<name>` restricts the sweep to one gateway's rows. Absent (the
  // normal case, and what the EventBridge schedule passes) sweeps them all:
  // the NPCI windows that decide when money actually moves are regulatory and
  // identical across gateways, so one tick covering every gateway is correct
  // and costs one Fargate invocation instead of one per gateway.
  //
  // It exists for the two cases where that is not enough — halting one
  // gateway's debits during an incident without stopping the other's revenue,
  // and giving a gateway its own schedule later without an app change (the
  // schedule already passes a command override, so that is terraform-only).
  // VALIDATED, and the run dies rather than proceeding on a bad value. An
  // unrecognised name would otherwise skip every row in every stage and exit 0
  // with an all-zero report — indistinguishable from a healthy quiet tick, so
  // `--provider=cashfre` would silently bill nobody for as long as nobody
  // noticed. A bare `--provider` or `--provider=` is the same mistake and gets
  // the same treatment, rather than falling through to a FULL sweep, which is
  // the opposite of what the operator asked for.
  const providerArg = process.argv.find((a) => a.startsWith("--provider"));
  let provider: string | null = null;
  if (providerArg !== undefined) {
    const value = providerArg.startsWith("--provider=")
      ? providerArg.slice("--provider=".length)
      : "";
    if (!isPaymentProviderName(value)) {
      log.error(
        {
          event: "billing_invalid_provider_filter",
          requested: value,
          known: PAYMENT_PROVIDERS,
        },
        "--provider must name a known gateway — refusing to run a sweep that would silently match nothing"
      );
      process.exit(1);
    }
    provider = value;
  }
  const { shutdown } = await bootstrap();

  try {
    const report = await performServiceCall(
      "payment",
      (api) => api.runBillingCycle({ now: new Date(), dryRun, provider }),
      "billing:entrypoint",
      "billing cycle failed"
    );
    log.info(
      { event: "billing_cycle_report", provider, ...report },
      report.lockBusy
        ? "billing cycle skipped — disabled or already running"
        : "billing cycle complete"
    );
  } finally {
    // Always: a leaked Prisma pool or Redis socket keeps the Fargate task alive
    // past its work, and a task that never stops is one EventBridge will
    // happily stack another run on top of.
    await shutdown();
  }
}

void main()
  .then(() => process.exit(0))
  .catch((err) => {
    log.error({ err }, "billing cycle failed");
    process.exit(1);
  });
