import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetEnvCache } from "@api/shared/config";
import { DeityPreferenceService } from "@api/core/users/services";
import type {
  DeityPreferenceRepository,
  DeityPreferenceWarehouseRepository,
} from "@api/core/users/repositories";
import type { DeityPreferenceSyncRow } from "@api/core/users/types";

/**
 * TAM-175 — the sync LOOP, with both repositories faked.
 *
 * What is worth testing here is entirely control flow: where the run starts,
 * when it stops, and how the watermark advances. The SQL those repositories
 * issue is covered by `deity-preference.repository.integration.test.ts` against
 * a real Postgres; duplicating it with mocks would only assert that the mocks
 * were called.
 */

const BATCH = 5_000;

function syncRow(userId: string, atMs: number, primary: string | null = "ganesha"): DeityPreferenceSyncRow {
  return {
    userId,
    primaryDeitySlug: primary,
    secondaryDeitySlug: null,
    adDeitySlug: null,
    source: "shared",
    warehouseUpdatedAt: new Date(atMs),
  };
}

/** A warehouse that serves pre-canned batches and records what it was asked. */
function fakeWarehouse(batches: DeityPreferenceSyncRow[][]) {
  const asked: Date[] = [];
  const askedUser: string[] = [];
  let call = 0;
  const repo = {
    findChangedSince: (since: Date, sinceUserId: string): Promise<DeityPreferenceSyncRow[]> => {
      asked.push(since);
      askedUser.push(sinceUserId);
      return Promise.resolve(batches[call++] ?? []);
    },
    close: (): Promise<void> => Promise.resolve(),
  };
  return { repo: repo as unknown as DeityPreferenceWarehouseRepository, asked, askedUser };
}

/**
 * A warehouse holding `total` users who ALL share one `updated_at` — production's
 * normal shape, because the derivation job rewrites the whole table at once.
 * Serves them in `(stamp, userId)` order, honouring the tuple cursor.
 */
function fakeSingleStampWarehouse(total: number, stampMs: number) {
  const all = Array.from({ length: total }, (_, i) =>
    syncRow(`u${String(i).padStart(6, "0")}`, stampMs)
  );
  const repo = {
    findChangedSince: (
      _since: Date,
      sinceUserId: string,
      limit: number
    ): Promise<DeityPreferenceSyncRow[]> =>
      Promise.resolve(all.filter((r) => r.userId > sinceUserId).slice(0, limit)),
    close: (): Promise<void> => Promise.resolve(),
  };
  return repo as unknown as DeityPreferenceWarehouseRepository;
}

function fakeMirror(watermark: Date | null) {
  const written: DeityPreferenceSyncRow[][] = [];
  const repo = {
    findWatermark: (): Promise<Date | null> => Promise.resolve(watermark),
    upsertMany: (rows: readonly DeityPreferenceSyncRow[]): Promise<number> => {
      written.push([...rows]);
      return Promise.resolve(rows.length);
    },
    findByUserId: (): Promise<null> => Promise.resolve(null),
  };
  return { repo: repo as unknown as DeityPreferenceRepository, written };
}

/**
 * TAM-175 — the master switch. Gated at the READ so one flag covers home,
 * status and the deity chip row; the sync is deliberately NOT gated, so the
 * mirror stays warm and enabling the feature is instant.
 */
describe("DeityPreferenceService.getPreference — ENABLE_DEITY_SPLIT", () => {
  const PREF = {
    primaryDeitySlug: "ganesha",
    secondaryDeitySlug: "shiva",
    adDeitySlug: null,
    source: "shared",
  };

  function repoReturning() {
    return {
      findByUserId: () => Promise.resolve(PREF),
      findWatermark: () => Promise.resolve(null),
      upsertMany: () => Promise.resolve(0),
    } as unknown as DeityPreferenceRepository;
  }

  beforeEach(() => {
    process.env.JWT_SECRET = "a-sufficiently-long-secret-for-flag-tests-000";
    process.env.AUTH_OTP_PEPPER = "integration-test-pepper-not-secret-32chars";
  });

  afterEach(() => {
    delete process.env.ENABLE_DEITY_SPLIT;
    resetEnvCache();
  });

  it("serves the preference when the switch is ON", async () => {
    process.env.ENABLE_DEITY_SPLIT = "true";
    resetEnvCache();
    const service = new DeityPreferenceService(repoReturning());
    await expect(service.getPreference("u1")).resolves.toEqual(PREF);
  });

  it("reports NO preference when the switch is OFF, even though one is stored", async () => {
    process.env.ENABLE_DEITY_SPLIT = "false";
    resetEnvCache();
    const service = new DeityPreferenceService(repoReturning());
    await expect(service.getPreference("u1")).resolves.toBeNull();
  });

  it("defaults to OFF, so deploying the code alone changes nothing", async () => {
    delete process.env.ENABLE_DEITY_SPLIT;
    resetEnvCache();
    const service = new DeityPreferenceService(repoReturning());
    await expect(service.getPreference("u1")).resolves.toBeNull();
  });

  it("does NOT gate the sync — the mirror stays warm while the feature is off", async () => {
    process.env.ENABLE_DEITY_SPLIT = "false";
    resetEnvCache();
    const mirror = fakeMirror(null);
    const warehouse = fakeWarehouse([[syncRow("u1", 1_000)]]);
    const result = await new DeityPreferenceService(mirror.repo, warehouse.repo).sync();
    expect(result.synced).toBe(1);
    expect(mirror.written).toHaveLength(1);
  });
});

describe("DeityPreferenceService.sync", () => {
  it("starts from the epoch on a cold mirror, so the first run is a full backfill", async () => {
    const mirror = fakeMirror(null);
    const warehouse = fakeWarehouse([[]]);
    const result = await new DeityPreferenceService(mirror.repo, warehouse.repo).sync();

    expect(warehouse.asked[0]).toEqual(new Date(0));
    expect(result).toEqual({ synced: 0, batches: 0, withPrimary: 0, slugCounts: {} });
    expect(mirror.written).toHaveLength(0);
  });

  it("resumes from the mirror's own watermark", async () => {
    const watermark = new Date("2026-09-17T10:00:00.000Z");
    const warehouse = fakeWarehouse([[]]);
    await new DeityPreferenceService(fakeMirror(watermark).repo, warehouse.repo).sync();

    expect(warehouse.asked[0]).toEqual(watermark);
  });

  it("writes a short batch and stops without asking again", async () => {
    const mirror = fakeMirror(null);
    const warehouse = fakeWarehouse([[syncRow("u1", 1_000), syncRow("u2", 2_000, null)]]);
    const result = await new DeityPreferenceService(mirror.repo, warehouse.repo).sync();

    expect(result.synced).toBe(2);
    expect(result.batches).toBe(1);
    // Only one of the two has a main deity — the signal ops actually watches.
    expect(result.withPrimary).toBe(1);
    expect(warehouse.asked).toHaveLength(1);
    expect(mirror.written).toEqual([[syncRow("u1", 1_000), syncRow("u2", 2_000, null)]]);
  });

  it("reports a primary-slug histogram — the signal that a spelling matches nothing", async () => {
    const warehouse = fakeWarehouse([[
      syncRow("u1", 1_000, "ganesha"),
      syncRow("u2", 1_100, "ganesha"),
      syncRow("u3", 1_200, "hanuman"),
      syncRow("u4", 1_300, null),
    ]]);
    const result = await new DeityPreferenceService(fakeMirror(null).repo, warehouse.repo).sync();
    expect(result.slugCounts).toEqual({ ganesha: 2, hanuman: 1 });
    expect(result.withPrimary).toBe(3);
  });

  it("keeps paging while batches come back full, advancing to the newest stamp", async () => {
    const full = Array.from({ length: BATCH }, (_, i) => syncRow(`a${i}`, 1_000 + i));
    const mirror = fakeMirror(null);
    const warehouse = fakeWarehouse([full, [syncRow("tail", 9_000)]]);

    const result = await new DeityPreferenceService(mirror.repo, warehouse.repo).sync();

    expect(result.synced).toBe(BATCH + 1);
    expect(result.batches).toBe(2);
    // Second ask resumes at the LAST row's stamp of the first batch.
    expect(warehouse.asked[1]).toEqual(new Date(1_000 + BATCH - 1));
  });

  it("mirrors EVERY user when they all share one timestamp — production's actual shape", async () => {
    // REGRESSION. The warehouse rewrites its whole table in one job, so all
    // ~8,600 production users carry the same `updated_at` to the millisecond.
    // Keyed on the timestamp alone the walk could only loop forever or step
    // past it; the first version stepped past, mirrored the first 5,000 users
    // and silently abandoned the other 3,598 — 42% of them, with nothing
    // anywhere reporting a problem. The `(stamp, userId)` tuple both terminates
    // and covers everyone.
    const TOTAL = 12_345;
    const mirror = fakeMirror(null);
    const service = new DeityPreferenceService(
      mirror.repo,
      fakeSingleStampWarehouse(TOTAL, 7_000)
    );

    const result = await service.sync();

    expect(result.synced).toBe(TOTAL);
    const written = mirror.written.flat().map((r) => r.userId);
    expect(new Set(written).size).toBe(TOTAL);
  });

  it("advances BOTH halves of the cursor, so a batch cannot repeat", async () => {
    const full = Array.from({ length: BATCH }, (_, i) => syncRow(`a${i}`, 7_000));
    const warehouse = fakeWarehouse([full, []]);
    await new DeityPreferenceService(fakeMirror(new Date(7_000)).repo, warehouse.repo).sync();
    // Second ask keeps the SAME stamp and moves the user id forward — it must
    // never step the timestamp past users still waiting at it.
    expect(warehouse.asked[1]).toEqual(new Date(7_000));
    expect(warehouse.askedUser[0]).toBe("");
    expect(warehouse.askedUser[1]).toBe(`a${BATCH - 1}`);
  });

  it("stops at the batch ceiling rather than running unbounded", async () => {
    const full = Array.from({ length: BATCH }, (_, i) => syncRow(`x${i}`, 1_000 + i));
    // Always full — a warehouse that never drains.
    const warehouse = {
      repo: {
        findChangedSince: (since: Date): Promise<DeityPreferenceSyncRow[]> =>
          Promise.resolve(full.map((r, i) => syncRow(`x${i}`, since.getTime() + i + 1))),
        close: (): Promise<void> => Promise.resolve(),
      } as unknown as DeityPreferenceWarehouseRepository,
    };
    const result = await new DeityPreferenceService(fakeMirror(null).repo, warehouse.repo).sync();

    expect(result.batches).toBe(200);
    expect(result.synced).toBe(200 * BATCH);
  });

  it("refuses to sync when constructed without a warehouse (a serving task)", async () => {
    const service = new DeityPreferenceService(fakeMirror(null).repo);
    await expect(service.sync()).rejects.toThrow(/without a warehouse/);
  });

  it("still serves reads when constructed without a warehouse", async () => {
    const service = new DeityPreferenceService(fakeMirror(null).repo);
    await expect(service.getPreference("u1")).resolves.toBeNull();
  });
});
