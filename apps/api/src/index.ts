import { bootstrap } from "@api/bootstrap";
import { runAdminBootstrap } from "@api/core/auth";
import { loadEnv } from "@api/shared/config";
import { createModuleLogger } from "@api/shared/logs";

// Setup is complete — see the commented-out `seedContent` below.
// import { runAllSeeds } from "../prisma/seeds/all.seed.js";

const log = createModuleLogger("index");

/**
 * Ensure the bootstrap admin exists (TAM-82). Imported here — not run from a
 * `.ts` CLI — so esbuild bundles it: the runtime image installs `--prod` and
 * has no `tsx`, so a CLI script cannot execute in a deployed task (TAM-80's
 * proven pattern).
 *
 * No-ops unless ADMIN_BOOTSTRAP_EMAIL + ADMIN_BOOTSTRAP_PASSWORD are both set.
 * Runs AFTER listen so it never delays readiness, and never throws: like
 * seeding, a failure logs and the app keeps serving. That is the right trade —
 * a failure here means "no admin panel access until it's fixed" (fail-closed,
 * since no admin is created), whereas crash-looping the task would take the
 * whole mobile API down with it.
 */
async function ensureBootstrapAdmin(): Promise<void> {
  try {
    await runAdminBootstrap();
  } catch (err) {
    log.error({ err }, "bootstrap admin failed — continuing to serve (admin access unavailable)");
  }
}

/**
 * Fill EMPTY content tables (TAM-80). Runs AFTER listen so it never delays
 * readiness, and never throws: seeding is best-effort — a failure logs and the
 * app keeps serving rather than crash-looping the task. Safe on every boot: the
 * seeder skips populated tables and takes an advisory lock so two containers
 * can't seed at once (see prisma/seeds/all.seed.ts).
 *
 * SKELETON-ONLY since cf803ff (2026-07-20): the seeds populate ONLY the
 * navigational skeleton — categories, homepage sections/rows, the deity + zodiac
 * taxonomies, the horoscope input flow, home shortcuts + settings, book section
 * headings, and paywall config. Every CONTENT table (`mantra_audio_items`,
 * `audio_items`, `wallpapers`, `home_banners`, `home_feed_items`,
 * `content`/`chapter`, …) seeds EMPTY; the only media emitted is picsum
 * category/deity/zodiac icons. Content comes from the content pipeline.
 *
 * That trim is why restoring this boot call is safe again. It was removed in
 * a6f3b25 because the seeds then carried DEMO content, so a table emptied for a
 * re-import was silently refilled with `(Sample)` rows on the next boot. cf803ff
 * eliminated that failure mode structurally — the seeder no longer writes to any
 * content table, so it cannot clobber an import.
 *
 * ⚠️ Still UNCONDITIONAL and NOT environment-aware — no flag gates this. Any env
 * running this image reseeds its empty SKELETON tables on boot (specs/TAM-80).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DISABLED (TAM-131) — setup is complete. Every environment is populated, so
 * the boot seeder has done its job; leaving it wired means a future edit to a
 * seed file silently rewrites a live database on the next deploy. Commented
 * rather than deleted so a fresh environment can turn it back on: uncomment
 * the `runAllSeeds` import above, this function, and the call in `main()`.
 *
 * Nothing else changes — `prisma/seeds/` stays intact and CLI-runnable. To
 * bootstrap an empty database now, run it explicitly:
 *
 *     pnpm --filter api run seed            # every skeleton seed
 *     pnpm --filter api run seed:paywall    # just the paywall config
 *
 * Note this turns off seeding for ALL modules, not just the paywall — a brand
 * new database gets no deity/aarti/mantras/wallpaper/home/horoscope/books
 * skeleton on boot either.
 */
// async function seedContent(databaseUrl: string): Promise<void> {
//   try {
//     const { seeded, skipped, lockBusy } = await runAllSeeds(databaseUrl);
//     if (lockBusy) {
//       log.info("seed skipped — another instance holds the seed lock");
//       return;
//     }
//     log.info({ seeded, skipped }, `seed done: ${seeded.length} seeded, ${skipped.length} already populated`);
//   } catch (err) {
//     log.error({ err }, "seed failed — continuing to serve (content may be missing)");
//   }
// }

async function main(): Promise<void> {
  const env = loadEnv();
  const { app, shutdown } = await bootstrap();
  await app.listen({ port: env.PORT, host: env.HOST });
  log.info(`listening on ${env.HOST}:${env.PORT}`);

  // TAM-256 condition 15. The admin status-performance page degrades silently
  // and BY DESIGN when the warehouse is unconfigured — which means a task
  // missing CLICKHOUSE_DATABASE serves a permanently blank report that nobody
  // notices. This line is the only signal that happens, so it is a log, never a
  // boot failure: the serving API must still boot with no warehouse config.
  log.info(
    {
      warehouseReadsConfigured: Boolean(
        env.CLICKHOUSE_URL && env.CLICKHOUSE_PASSWORD && env.CLICKHOUSE_DATABASE,
      ),
      clickhouseDatabase: env.CLICKHOUSE_DATABASE ?? "(unset)",
      // Unset is valid while there is one tenant — the query then counts every
      // row in the database. Logged so that is a visible choice, not a silent
      // assumption, the day a second tenant appears.
      clickhouseTenantFilter: env.CLICKHOUSE_TENANT ?? "(none — counting all tenants)",
    },
    "analytics warehouse reads",
  );

  await ensureBootstrapAdmin();
  // Disabled (TAM-131) — setup is complete; see `seedContent` above.
  // await seedContent(env.DATABASE_URL);

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => {
      void shutdown().then(() => process.exit(0));
    });
  }
}

void main().catch((err) => {
  log.error({ err }, "fatal boot error");
  process.exit(1);
});
