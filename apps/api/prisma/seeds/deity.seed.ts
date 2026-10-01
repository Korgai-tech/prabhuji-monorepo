/**
 * TAM-57 seed — Phase-1 deity taxonomy.
 *
 * Idempotent (`upsert` on the `slug` / `(deityId, locale)` unique keys),
 * transactional (via `runSeed`), and uses REAL, publicly-reachable `https` icon
 * URLs (`SEED_MEDIA_URLS.deityIcon` → picsum, deterministic per slug) so the
 * grid actually renders end-to-end. Figma-sourced icons are wired on mobile per
 * TAM-60; the API stores only URLs. Row counts are stable across repeated runs
 * (no duplication).
 *
 * Product provides the final deity list + `hi`/`en` display names; the values
 * below are reasonable Phase-1 placeholders (≥ 6 deities, `hi` + `en`).
 *
 * Run:  pnpm --filter api run seed:deity
 */
import type { Prisma } from "@prisma/client";
import { SEED_MEDIA_URLS, type SeedCounts, isSeedCli, runSeed } from "./_shared.js";

interface DeitySeed {
  slug: string;
  sortOrder: number;
  translations: Record<"en" | "hi", string>;
}

export const DEITIES: DeitySeed[] = [
  { slug: "ganesha", sortOrder: 0, translations: { en: "Ganesha", hi: "गणेश" } },
  { slug: "shiva", sortOrder: 1, translations: { en: "Shiva", hi: "शिव" } },
  {
    slug: "hanuman",
    sortOrder: 2,
    translations: { en: "Hanuman", hi: "हनुमान" },
  },
  { slug: "krishna", sortOrder: 3, translations: { en: "Krishna", hi: "कृष्ण" } },
  { slug: "rama", sortOrder: 4, translations: { en: "Rama", hi: "राम" } },
  { slug: "durga", sortOrder: 5, translations: { en: "Durga", hi: "दुर्गा" } },
  {
    slug: "lakshmi",
    sortOrder: 6,
    translations: { en: "Lakshmi", hi: "लक्ष्मी" },
  },
  {
    slug: "saraswati",
    sortOrder: 7,
    translations: { en: "Saraswati", hi: "सरस्वती" },
  },
];

/** Transactional, idempotent upsert of the deity set + translations. */
export async function seedDeities(
  tx: Prisma.TransactionClient
): Promise<SeedCounts> {
  const counts: SeedCounts = { deities: 0, translations: 0 };

  for (const deity of DEITIES) {
    const iconUrl = SEED_MEDIA_URLS.deityIcon(deity.slug);
    const upserted = await tx.deity.upsert({
      where: { slug: deity.slug },
      update: { iconUrl, sortOrder: deity.sortOrder, active: true },
      create: {
        slug: deity.slug,
        iconUrl,
        sortOrder: deity.sortOrder,
        active: true,
      },
    });
    counts.deities += 1;

    for (const [locale, displayName] of Object.entries(deity.translations)) {
      await tx.deityTranslation.upsert({
        where: {
          deity_translation_unique: { deityId: upserted.id, locale },
        },
        update: { displayName },
        create: { deityId: upserted.id, locale, displayName },
      });
      counts.translations += 1;
    }
  }

  return counts;
}

export async function runDeitySeed(): Promise<SeedCounts> {
  return runSeed("deity", seedDeities);
}

// CLI entrypoint — guarded so importing this file (e.g. from an integration
// test) has no side effect.
if (isSeedCli(import.meta.url)) {
  runDeitySeed()
    .then(() => process.exit(0))
    .catch((err: unknown) => {
      process.stderr.write(
        `deity seed failed: ${err instanceof Error ? err.message : String(err)}\n`
      );
      process.exit(1);
    });
}
