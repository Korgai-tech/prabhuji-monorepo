import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { startTestDb, stopTestDb } from "@api/shared/testing";
import { disconnectPrisma, getPrisma } from "@api/shared/database";
import { DeityPreferenceRepository } from "@api/core/users/repositories";
import type { DeityPreferenceSyncRow } from "@api/core/users/types";

/**
 * TAM-175 — the Postgres half of the deity-preference mirror, against a real
 * Postgres (testcontainers).
 *
 * This suite exists because `upsertMany` is hand-written SQL: a batched
 * `unnest` upsert with a conflict guard. None of that is reachable by a unit
 * test with a mocked Prisma — the array parameter binding, the NULL handling
 * inside `text[]`, and the "never move a row backwards" WHERE clause are all
 * behaviours of Postgres, not of our code.
 */

const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";

function row(
  userId: string,
  overrides: Partial<DeityPreferenceSyncRow> = {}
): DeityPreferenceSyncRow {
  return {
    userId,
    primaryDeitySlug: "ganesha",
    secondaryDeitySlug: "shiva",
    adDeitySlug: null,
    source: "shared",
    warehouseUpdatedAt: new Date("2026-09-17T10:00:00.000Z"),
    ...overrides,
  };
}

describe("DeityPreferenceRepository (integration)", () => {
  const repo = new DeityPreferenceRepository();

  beforeAll(async () => {
    await startTestDb();
  }, 120_000);

  afterAll(async () => {
    await disconnectPrisma();
    await stopTestDb();
  });

  beforeEach(async () => {
    await getPrisma().userDeityPreference.deleteMany({});
  });

  it("returns null for a user with nothing synced — a normal state, not an error", async () => {
    await expect(repo.findByUserId(USER_A)).resolves.toBeNull();
  });

  it("inserts a batch and reads each row back", async () => {
    const written = await repo.upsertMany([
      row(USER_A),
      row(USER_B, { primaryDeitySlug: "hanuman", secondaryDeitySlug: null }),
    ]);
    expect(written).toBe(2);

    await expect(repo.findByUserId(USER_A)).resolves.toEqual({
      primaryDeitySlug: "ganesha",
      secondaryDeitySlug: "shiva",
      adDeitySlug: null,
      source: "shared",
    });
    await expect(repo.findByUserId(USER_B)).resolves.toEqual({
      primaryDeitySlug: "hanuman",
      secondaryDeitySlug: null,
      adDeitySlug: null,
      source: "shared",
    });
  });

  it("is idempotent — re-running the same batch changes nothing", async () => {
    await repo.upsertMany([row(USER_A)]);
    await repo.upsertMany([row(USER_A)]);

    const count = await getPrisma().userDeityPreference.count();
    expect(count).toBe(1);
    await expect(repo.findByUserId(USER_A)).resolves.toMatchObject({
      primaryDeitySlug: "ganesha",
    });
  });

  it("updates a row when the warehouse stamp is newer", async () => {
    await repo.upsertMany([row(USER_A)]);
    await repo.upsertMany([
      row(USER_A, {
        primaryDeitySlug: "durga",
        secondaryDeitySlug: "lakshmi",
        warehouseUpdatedAt: new Date("2026-09-17T12:00:00.000Z"),
      }),
    ]);

    await expect(repo.findByUserId(USER_A)).resolves.toMatchObject({
      primaryDeitySlug: "durga",
      secondaryDeitySlug: "lakshmi",
    });
  });

  it("REFUSES to move a row backwards when an older warehouse stamp arrives", async () => {
    await repo.upsertMany([
      row(USER_A, {
        primaryDeitySlug: "durga",
        warehouseUpdatedAt: new Date("2026-09-17T12:00:00.000Z"),
      }),
    ]);
    // A slow batch or an overlapping manual re-run delivering a STALE row.
    await repo.upsertMany([
      row(USER_A, {
        primaryDeitySlug: "ganesha",
        warehouseUpdatedAt: new Date("2026-09-17T08:00:00.000Z"),
      }),
    ]);

    await expect(repo.findByUserId(USER_A)).resolves.toMatchObject({
      primaryDeitySlug: "durga",
    });
  });

  it("round-trips NULLs inside the batched text[] parameters", async () => {
    await repo.upsertMany([
      row(USER_A, {
        primaryDeitySlug: null,
        secondaryDeitySlug: null,
        adDeitySlug: null,
        source: null,
      }),
      row(USER_B, { adDeitySlug: "krishna" }),
    ]);

    await expect(repo.findByUserId(USER_A)).resolves.toEqual({
      primaryDeitySlug: null,
      secondaryDeitySlug: null,
      adDeitySlug: null,
      source: null,
    });
    await expect(repo.findByUserId(USER_B)).resolves.toMatchObject({
      adDeitySlug: "krishna",
    });
  });

  it("no-ops on an empty batch without issuing a statement", async () => {
    await expect(repo.upsertMany([])).resolves.toBe(0);
    expect(await getPrisma().userDeityPreference.count()).toBe(0);
  });

  describe("watermark", () => {
    it("is null on a cold table, which makes the first run a full backfill", async () => {
      await expect(repo.findWatermark()).resolves.toBeNull();
    });

    it("is the newest warehouse stamp across all rows", async () => {
      await repo.upsertMany([
        row(USER_A, { warehouseUpdatedAt: new Date("2026-09-17T10:00:00.000Z") }),
        row(USER_B, { warehouseUpdatedAt: new Date("2026-09-17T14:30:00.000Z") }),
      ]);
      await expect(repo.findWatermark()).resolves.toEqual(
        new Date("2026-09-17T14:30:00.000Z")
      );
    });
  });
});
