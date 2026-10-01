/**
 * TAM-80 — the seeder. Two callers, two behaviours:
 *
 *   - `src/index.ts` (every boot, unconditional) → `runAllSeeds(url)`. SKIPS any
 *     seed whose table already has rows, so it is a no-op once populated and
 *     content edited directly in the DB survives restarts.
 *   - `pnpm seed` (CLI, bottom of this file)     → `runAllSeeds(url, {force:true})`.
 *     Runs every seed regardless, i.e. the same force-upsert semantics as the ten
 *     `pnpm seed:<module>` scripts, in one command and in dependency order.
 *
 * The per-module `pnpm seed:<module>` scripts are unchanged and still force-upsert
 * a single module.
 *
 * SKELETON-ONLY: seeds populate the navigational skeleton (categories, homepage
 * sections/rows, the deity + zodiac taxonomies, the horoscope input flow, home
 * shortcuts, book sections, paywall config) and NO content — content comes from
 * the content pipeline, not the seed. The only media seeded is picsum category/
 * icon images. It is a deliberate stage-bootstrap measure and is meant to be
 * removed before prod exists — see specs/TAM-80.
 *
 * Two things make it safe to run on every container boot:
 *
 *   1. **Advisory lock.** stage is min=1/max=2 tasks, so two containers can boot
 *      together. Every kept skeleton seed upserts on a unique key (slug / key /
 *      sectionType / rowKey / zodiacId / (modeId,stepId) / assetKey), so a
 *      re-run is a stable no-op rather than a duplicating one. The lock is kept
 *      as defense-in-depth: the per-table empty check is itself the race (two
 *      tasks both read 0 and both seed), and the advisory lock serialises it —
 *      the loser skips entirely rather than waiting, because by the time the
 *      winner is done there is nothing left to do.
 *   2. **Empty checks.** Re-running is a no-op once the sentinel table is
 *      populated. Every sentinel is a STRUCTURAL table the seed always writes
 *      (e.g. wallpaper → `wallpaperHomepageRow`, home → `homeShortcut`), never a
 *      content table that would stay empty and re-run the seed each boot.
 *
 * `deity` stays first even though no kept skeleton seed tags deities anymore
 * (deity tags were content) — cheap, and keeps the taxonomy present up front.
 */

import { PrismaClient } from "@prisma/client";

import { runAartiSeed } from "./aarti.seed.js";
import { runBooksSeed } from "./books.seed.js";
import { runDeitySeed } from "./deity.seed.js";
import { runHomeSeed } from "./home.seed.js";
import { runHoroscopeSeed } from "./horoscope.seed.js";
import { runKuldevtaSeed } from "./kuldevta.seed.js";
import { runMantrasSeed } from "./mantras.seed.js";
import { runPaywallSeed } from "./paywall-config.seed.js";
import { runWallpaperSeed } from "./wallpaper.seed.js";
import { isSeedCli } from "./_shared.js";

/** Arbitrary but STABLE key — every task must pick the same one for the lock to mean anything. */
const SEED_LOCK_KEY = 79_0080;

interface SeedStep {
  name: string;
  /** Table consulted for emptiness. Non-zero rows ⇒ this seed is skipped. */
  isEmpty: (db: PrismaClient) => Promise<boolean>;
  run: () => Promise<unknown>;
}

/**
 * `paywall` + `deity` first, then the rest. Each entry's sentinel is a
 * STRUCTURAL table that seed always populates (so the empty-check is meaningful
 * once seeded — never a content table that stays empty and re-runs every boot).
 */
const STEPS: SeedStep[] = [
  { name: "paywall", isEmpty: async (db) => (await db.paywallConfig.count()) === 0, run: runPaywallSeed },
  { name: "deity", isEmpty: async (db) => (await db.deity.count()) === 0, run: runDeitySeed },
  { name: "kuldevta", isEmpty: async (db) => (await db.kuldevta.count()) === 0, run: runKuldevtaSeed },
  { name: "aarti", isEmpty: async (db) => (await db.audioCategory.count()) === 0, run: runAartiSeed },
  { name: "mantras", isEmpty: async (db) => (await db.mantraCategory.count()) === 0, run: runMantrasSeed },
  { name: "wallpaper", isEmpty: async (db) => (await db.wallpaperHomepageRow.count()) === 0, run: runWallpaperSeed },
  { name: "home", isEmpty: async (db) => (await db.homeShortcut.count()) === 0, run: runHomeSeed },
  { name: "horoscope", isEmpty: async (db) => (await db.zodiacSign.count()) === 0, run: runHoroscopeSeed },
  { name: "books", isEmpty: async (db) => (await db.bookSection.count()) === 0, run: runBooksSeed },
];

export interface SeedRunSummary {
  seeded: string[];
  skipped: string[];
  /** True when another container held the lock — this task did nothing. */
  lockBusy: boolean;
}

/**
 * `connection_limit=1` is load-bearing: `pg_advisory_lock` is SESSION-scoped, so
 * the unlock must land on the same connection that took it. Prisma pools, so
 * without this the unlock can be routed elsewhere and the lock leaks until the
 * client disconnects.
 */
function createLockClient(databaseUrl: string): PrismaClient {
  const url = new URL(databaseUrl);
  url.searchParams.set("connection_limit", "1");
  return new PrismaClient({ datasources: { db: { url: url.toString() } } });
}

export interface RunAllSeedsOptions {
  /** Run every seed even if its table is populated — the `pnpm seed` (CLI) behaviour. */
  force?: boolean;
}

export async function runAllSeeds(
  databaseUrl: string,
  { force = false }: RunAllSeedsOptions = {}
): Promise<SeedRunSummary> {
  const db = createLockClient(databaseUrl);
  const summary: SeedRunSummary = { seeded: [], skipped: [], lockBusy: false };

  try {
    const [{ locked }] = await db.$queryRaw<
      { locked: boolean }[]
    >`SELECT pg_try_advisory_lock(${SEED_LOCK_KEY}) AS locked`;

    if (!locked) {
      // Another task is seeding right now. Skipping (not waiting) is correct:
      // whatever it seeds, our empty checks would then find non-empty anyway.
      summary.lockBusy = true;
      return summary;
    }

    try {
      for (const step of STEPS) {
        if (force || (await step.isEmpty(db))) {
          await step.run();
          summary.seeded.push(step.name);
        } else {
          summary.skipped.push(step.name);
        }
      }
    } finally {
      await db.$queryRaw`SELECT pg_advisory_unlock(${SEED_LOCK_KEY})`;
    }
  } finally {
    await db.$disconnect();
  }

  return summary;
}

// CLI entrypoint (`pnpm seed`) — force-runs every seed in dependency order, the
// one-command equivalent of running all ten `pnpm seed:<module>` scripts. Guarded
// so importing this file from src/index.ts has no side effect.
if (isSeedCli(import.meta.url)) {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    process.stderr.write("seed failed: DATABASE_URL is not set\n");
    process.exit(1);
  }
  runAllSeeds(databaseUrl, { force: true })
    .then(({ seeded }) => {
      process.stdout.write(`seed ok: ${seeded.length} seeds run (${seeded.join(", ")})\n`);
      process.exit(0);
    })
    .catch((err: unknown) => {
      process.stderr.write(
        `seed failed: ${err instanceof Error ? err.message : String(err)}\n`
      );
      process.exit(1);
    });
}
