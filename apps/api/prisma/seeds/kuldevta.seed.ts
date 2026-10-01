/**
 * Kuldevta registry seed. Source of truth is the committed snapshot in
 * `packages/kuldevta-registry`, itself derived from Kuldevta-Registry-v0.2.xlsx.
 * Idempotent: upserts on `slug`, `regionCode`, and `(kuldevtaId, locale)`.
 *
 * Deliberate deviations from the source workbook (product decision, not a bug):
 *   - every row seeds `humanReviewed: true`, inverting the workbook's README
 *     (which says nothing should reach a user until a reviewer flips that flag).
 *   - `kuldevi_anaam` seeds `active: false` — the only inactive row — and
 *     `hanuman_ji` seeds `isFallback: true`; both come straight from the
 *     registry JSON, which already carries them.
 *
 * Run:  pnpm --filter api run seed:kuldevta
 */
import { loadRegistry } from "@prabhuji/kuldevta-registry";
import type { Prisma } from "@prisma/client";
import { type SeedCounts, isSeedCli, runSeed } from "./_shared.js";

export async function seedKuldevta(
  tx: Prisma.TransactionClient
): Promise<SeedCounts> {
  const registry = loadRegistry();

  for (const a of registry.archetypes) {
    await tx.kuldevtaArchetype.upsert({
      where: { id: a.id },
      create: {
        id: a.id,
        name: a.name,
        description: a.description,
        voiceDirection: a.voiceDirection,
      },
      update: {
        name: a.name,
        description: a.description,
        voiceDirection: a.voiceDirection,
      },
    });
  }

  for (const d of registry.deities) {
    const fields = {
      nameRoman: d.nameRoman,
      nameDevanagari: d.nameDevanagari,
      aliases: d.aliases,
      archetypeId: d.archetype,
      formOf: d.formOf,
      gender: d.gender,
      states: d.states,
      communities: d.communities,
      templeName: d.templeName,
      templeVillage: d.templeVillage,
      templeDistrict: d.templeDistrict,
      templeState: d.templeState,
      iconography: d.iconography,
      epithets: d.epithets,
      mantra: d.mantra,
      weeklyDay: d.weeklyDay,
      festivals: d.festivals,
      offerings: d.offerings,
      niyam: d.niyam,
      toneNotes: d.toneNotes,
      personaEnabled: d.personaEnabled,
      confidence: d.confidence,
      notes: d.notes,
      active: d.active,
      isFallback: d.isFallback,
      humanReviewed: d.humanReviewed,
    };
    const row = await tx.kuldevta.upsert({
      where: { slug: d.id },
      create: { slug: d.id, ...fields },
      update: fields,
    });

    const translations: Record<"en" | "hi", string> = {
      en: d.nameRoman,
      hi: d.nameDevanagari,
    };
    for (const [locale, displayName] of Object.entries(translations)) {
      await tx.kuldevtaTranslation.upsert({
        where: {
          kuldevta_translation_unique: { kuldevtaId: row.id, locale },
        },
        create: { kuldevtaId: row.id, locale, displayName },
        update: { displayName },
      });
    }
  }

  for (const r of registry.regionDefaults) {
    const fields = {
      region: r.region,
      defaultKuldevtaSlug: r.defaultDeityId,
      isNationalFallback: r.isNationalFallback,
      caveat: r.caveat,
    };
    await tx.kuldevtaRegionDefault.upsert({
      where: { regionCode: r.regionCode },
      create: { regionCode: r.regionCode, ...fields },
      update: fields,
    });
  }

  return {
    archetypes: registry.archetypes.length,
    kuldevtas: registry.deities.length,
    regionDefaults: registry.regionDefaults.length,
  };
}

export async function runKuldevtaSeed(): Promise<SeedCounts> {
  return runSeed("kuldevta", seedKuldevta);
}

// CLI entrypoint — guarded so importing this file (e.g. from an integration
// test) has no side effect.
if (isSeedCli(import.meta.url)) {
  runKuldevtaSeed()
    .then(() => process.exit(0))
    .catch((err: unknown) => {
      process.stderr.write(
        `kuldevta seed failed: ${err instanceof Error ? err.message : String(err)}\n`
      );
      process.exit(1);
    });
}
