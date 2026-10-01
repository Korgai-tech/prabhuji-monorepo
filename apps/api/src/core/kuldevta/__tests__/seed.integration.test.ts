import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startTestDb, stopTestDb } from "@api/shared/testing";
import { disconnectPrisma, getPrisma } from "@api/shared/database";
import { seedKuldevta } from "../../../../prisma/seeds/kuldevta.seed.js";

/**
 * Seed correctness + idempotency (TAM-165) against a real Postgres
 * (testcontainers). Idempotency is proved by calling `seedKuldevta(tx)` TWICE
 * inside the test and asserting identical row counts after both runs — a
 * stronger check than a CLI re-run (§ task-3 override): it *asserts* rather
 * than prints, and catches any accidental non-upsert write immediately.
 */

beforeAll(async () => {
  await startTestDb();
}, 120_000);
afterAll(async () => {
  await disconnectPrisma();
  await stopTestDb();
});

describe("kuldevta seed", () => {
  it("is idempotent: two runs produce identical row counts", async () => {
    const prisma = getPrisma();

    const first = await prisma.$transaction((tx) => seedKuldevta(tx));
    const countsAfterFirst = {
      kuldevtas: await prisma.kuldevta.count(),
      archetypes: await prisma.kuldevtaArchetype.count(),
      regionDefaults: await prisma.kuldevtaRegionDefault.count(),
      translations: await prisma.kuldevtaTranslation.count(),
    };

    const second = await prisma.$transaction((tx) => seedKuldevta(tx));
    const countsAfterSecond = {
      kuldevtas: await prisma.kuldevta.count(),
      archetypes: await prisma.kuldevtaArchetype.count(),
      regionDefaults: await prisma.kuldevtaRegionDefault.count(),
      translations: await prisma.kuldevtaTranslation.count(),
    };

    expect(first).toEqual(second);
    expect(countsAfterSecond).toEqual(countsAfterFirst);
  });

  it("seeds 33 deities, 12 archetypes, 8 region defaults", async () => {
    const prisma = getPrisma();
    expect(await prisma.kuldevta.count()).toBe(33);
    expect(await prisma.kuldevtaArchetype.count()).toBe(12);
    expect(await prisma.kuldevtaRegionDefault.count()).toBe(8);
  });

  it("leaves kuldevi_anaam inactive and everything else active", async () => {
    const prisma = getPrisma();
    const inactive = await prisma.kuldevta.findMany({
      where: { active: false },
    });
    expect(inactive.map((k) => k.slug)).toEqual(["kuldevi_anaam"]);
  });

  it("makes hanuman_ji the national fallback", async () => {
    const prisma = getPrisma();
    const all = await prisma.kuldevtaRegionDefault.findUniqueOrThrow({
      where: { regionCode: "ALL" },
    });
    expect(all.defaultKuldevtaSlug).toBe("hanuman_ji");
    expect(all.isNationalFallback).toBe(true);

    const hanuman = await prisma.kuldevta.findUniqueOrThrow({
      where: { slug: "hanuman_ji" },
    });
    expect(hanuman.isFallback).toBe(true);
  });

  it("keeps Devanagari and semicolon-split communities intact", async () => {
    const prisma = getPrisma();
    const k = await prisma.kuldevta.findUniqueOrThrow({
      where: { slug: "khandoba" },
    });
    expect(k.nameDevanagari).toBe("खंडोबा");
    expect(k.communities).toContain("Dhangar");
  });

  it("seeds humanReviewed true for every row (D9b)", async () => {
    const prisma = getPrisma();
    expect(
      await prisma.kuldevta.count({ where: { humanReviewed: false } })
    ).toBe(0);
  });

  it("seeds en from nameRoman and hi from nameDevanagari translations", async () => {
    const prisma = getPrisma();
    const k = await prisma.kuldevta.findUniqueOrThrow({
      where: { slug: "khandoba" },
      include: { translations: true },
    });
    const en = k.translations.find((t) => t.locale === "en");
    const hi = k.translations.find((t) => t.locale === "hi");
    expect(en?.displayName).toBe(k.nameRoman);
    expect(hi?.displayName).toBe(k.nameDevanagari);
  });
});
