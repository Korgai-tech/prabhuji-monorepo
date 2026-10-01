import { loadEnv } from "@api/shared/config";
import { createModuleLogger } from "@api/shared/logs";
import type {
  DeityPreferenceRepository,
  DeityPreferenceWarehouseRepository,
} from "@api/core/users/repositories";
import type { DeityPreference } from "@api/core/users/types";

const log = createModuleLogger("users:deity-preference");

/**
 * How many users one warehouse round trip carries. Large enough that a full
 * backfill is a handful of queries, small enough that a batch's `unnest` upsert
 * stays a comfortably-sized statement.
 */
const SYNC_BATCH_SIZE = 5_000;

/**
 * Hard stop on batches per run. A runaway loop against a warehouse that keeps
 * returning full batches would otherwise never end; at the batch size above
 * this ceiling is ~1M users, far past any real backfill.
 */
const MAX_BATCHES = 200;

/** Cold-table start: mirror everything the warehouse has. */
const EPOCH = new Date(0);

export interface DeityPreferenceSyncResult {
  synced: number;
  batches: number;
  /** How many synced users actually have a main deity — the useful signal. */
  withPrimary: number;
  /** Primary-deity slug -> user count, for the run. See `sync` for why. */
  slugCounts: Record<string, number>;
}

/**
 * Deity preferences (TAM-175): the per-request READ, and the periodic SYNC that
 * fills what it reads.
 *
 * The two halves deliberately share nothing but the repository. The read is on
 * the home-feed path and must be a primary-key lookup; the sync is a batch job
 * that talks to ClickHouse and never runs inside a request.
 */
export class DeityPreferenceService {
  constructor(
    private readonly repo: DeityPreferenceRepository,
    /**
     * Absent on a serving task — only the sync entrypoint constructs one.
     * Keeping it optional is what lets the API boot with no warehouse
     * credentials at all while still exposing the read.
     */
    private readonly warehouse?: DeityPreferenceWarehouseRepository
  ) {}

  /**
   * One user's preference, or `null` when nothing is mirrored for them.
   *
   * NEVER THROWS for "no preference" — that is a normal state, and the caller
   * (the feed) turns it into "every pool falls through to any-god", which is
   * precisely the pre-personalisation behaviour.
   */
  async getPreference(userId: string): Promise<DeityPreference | null> {
    // TAM-175 — the master switch, checked HERE because this is the one call
    // every personalised surface makes. Off ⇒ every caller sees "no
    // preference", every pool is empty, and home, status and the deity chip row
    // all fall through to exactly the order they served before this feature.
    //
    // Deliberately gated at the READ rather than per surface: a per-surface flag
    // is one someone forgets, and this must be a single switch that cannot
    // leave the product half-personalised. The SYNC is not gated — the mirror
    // stays warm while the feature is off, so turning it on is instant rather
    // than waiting a cycle for data.
    if (!loadEnv().ENABLE_DEITY_SPLIT) return null;
    return this.repo.findByUserId(userId);
  }

  /**
   * Pull everything the warehouse has changed since our watermark into the
   * mirror.
   *
   * RESUMABLE AND IDEMPOTENT by construction: the watermark is `MAX(
   * warehouse_updated_at)` of the mirror itself, the warehouse read is `>=` it,
   * and the write is an upsert. A run that dies halfway simply resumes from
   * wherever it actually got to — there is no cursor that can advance past rows
   * which failed to land.
   */
  async sync(): Promise<DeityPreferenceSyncResult> {
    const warehouse = this.warehouse;
    if (!warehouse) {
      throw new Error("DeityPreferenceService was constructed without a warehouse repository");
    }

    let since = (await this.repo.findWatermark()) ?? EPOCH;
    // The second half of the keyset. Empty string sorts before every uuid, so a
    // run starting at the watermark re-reads EVERY user stamped at it rather
    // than skipping past them — which is the whole point, since production
    // stamps its entire table with one value.
    let sinceUserId = "";
    let synced = 0;
    let withPrimary = 0;
    let batches = 0;
    // WHY A HISTOGRAM AND NOT JUST A COUNT. A warehouse slug with no matching
    // `deities.slug` is not an error anywhere: the pool is empty, the user falls
    // through to the unpersonalised feed, and nothing logs. Production shipped
    // with `ganesh` (371 users), `ram` (8) and `narsingh` (16) in exactly that
    // state — 8% of users with a preference silently getting nothing. Emitting
    // the slugs each run makes a new or unmapped spelling visible in one line,
    // instead of waiting for someone to notice the feature is not working.
    const slugCounts: Record<string, number> = {};

    log.info(
      { event: "deity_preference_sync_start", since: since.toISOString() },
      "deity preference sync started"
    );

    // `batches` counts batches actually FETCHED AND WRITTEN, so it is incremented
    // before any of the `break`s below — a `for (…; batches += 1)` would skip
    // the increment on the iteration that terminates the loop, which is every
    // run, and under-report by one.
    while (batches < MAX_BATCHES) {
      const rows = await warehouse.findChangedSince(since, sinceUserId, SYNC_BATCH_SIZE);
      if (rows.length === 0) break;

      await this.repo.upsertMany(rows);
      batches += 1;
      synced += rows.length;
      withPrimary += rows.filter((r) => r.primaryDeitySlug !== null).length;
      for (const row of rows) {
        const slug = row.primaryDeitySlug;
        if (slug !== null) slugCounts[slug] = (slugCounts[slug] ?? 0) + 1;
      }

      if (rows.length < SYNC_BATCH_SIZE) break;

      // Rows come back ordered by `(stamp, userId)`, so the last one IS the
      // cursor. Advancing both halves is what makes the walk both terminating
      // and complete: the earlier version advanced only the stamp, and when a
      // whole batch shared one millisecond — which is production's normal
      // state, the warehouse rewrites everything in one job — it stepped past
      // that millisecond and silently abandoned every remaining user.
      const last = rows[rows.length - 1];
      if (last === undefined) break;
      since = last.warehouseUpdatedAt;
      sinceUserId = last.userId;
    }

    if (batches >= MAX_BATCHES) {
      log.warn(
        { event: "deity_preference_sync_truncated", batches, synced },
        "deity preference sync hit its batch ceiling — re-run to continue"
      );
    }
    log.info(
      {
        event: "deity_preference_sync_done",
        synced,
        batches,
        with_primary: withPrimary,
        // Sorted by frequency so the head of the list is what matters; cross
        // this against `deities.slug` to spot a spelling nothing will match.
        primary_slugs: Object.fromEntries(
          Object.entries(slugCounts).sort(([, a], [, b]) => b - a)
        ),
      },
      "deity preference sync finished"
    );
    return { synced, batches, withPrimary, slugCounts };
  }
}
