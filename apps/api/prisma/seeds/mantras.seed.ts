/**
 * TAM-65 seed — Mantras & Stutis navigational skeleton.
 *
 * Skeleton-only: seeds the category taxonomy and the homepage section
 * definitions the app navigates through, but NO mantra content — content is
 * populated by the content pipeline, not the seed. Idempotent (`upsert` on the
 * `slug` / `section_type` unique keys), transactional (via `runSeed`). Category
 * artwork uses REAL, publicly-reachable picsum images (deterministic per slug).
 *
 * Seeds: 6 categories and the 4 homepage sections.
 *
 * Run:  pnpm --filter api run seed:mantras
 */
import type { Prisma } from "@prisma/client";
import { SEED_MEDIA_URLS, type SeedCounts, isSeedCli, runSeed } from "./_shared.js";

interface CategorySeed {
  slug: string;
  displayName: string;
  sortOrder: number;
  backgroundColorToken: string;
  /** TAM-110: per-locale OVERRIDES for `displayName`; base column is the fallback. */
  translations?: Record<string, { displayName: string }>;
}

/** Phase-1 categories (spec AC) — seed data, not hardcoded logic. */
export const CATEGORIES: CategorySeed[] = [
  { slug: "peace", displayName: "Peace", sortOrder: 0, backgroundColorToken: "#0891b2", translations: { hi: { displayName: "शांति" }, mr: { displayName: "शांती" } } },
  { slug: "wealth", displayName: "Wealth", sortOrder: 1, backgroundColorToken: "#a16207", translations: { hi: { displayName: "धन" }, mr: { displayName: "संपत्ती" } } },
  { slug: "health", displayName: "Health", sortOrder: 2, backgroundColorToken: "#15803d", translations: { hi: { displayName: "स्वास्थ्य" }, mr: { displayName: "आरोग्य" } } },
  { slug: "success", displayName: "Success", sortOrder: 3, backgroundColorToken: "#6d28d9", translations: { hi: { displayName: "सफलता" }, mr: { displayName: "यश" } } },
  { slug: "love-relationship", displayName: "Love & Relationship", sortOrder: 4, backgroundColorToken: "#be185d", translations: { hi: { displayName: "प्रेम और रिश्ते" }, mr: { displayName: "प्रेम आणि नाती" } } },
  { slug: "protection", displayName: "Protection", sortOrder: 5, backgroundColorToken: "#b91c1c", translations: { hi: { displayName: "रक्षा" }, mr: { displayName: "संरक्षण" } } },
];

interface SectionSeed {
  sectionType: string;
  title: string;
  layoutType: string;
  showAllEnabled: boolean;
  sortOrder: number;
  /** TAM-110: per-locale OVERRIDES for `title`; base column is the fallback. */
  translations?: Record<string, { title: string }>;
}

export const SECTIONS: SectionSeed[] = [
  { sectionType: "recently_played", title: "Recently Played Mantras", layoutType: "horizontal_cards", showAllEnabled: true, sortOrder: 0, translations: { hi: { title: "हाल में सुने मंत्र" }, mr: { title: "अलीकडे ऐकलेले मंत्र" } } },
  { sectionType: "deities", title: "Mantras of Deities", layoutType: "deity_row", showAllEnabled: true, sortOrder: 1, translations: { hi: { title: "देवताओं के मंत्र" }, mr: { title: "देवतांचे मंत्र" } } },
  { sectionType: "categories", title: "Browse Categories", layoutType: "category_grid", showAllEnabled: true, sortOrder: 2, translations: { hi: { title: "श्रेणियाँ देखें" }, mr: { title: "श्रेणी पहा" } } },
  { sectionType: "newly_added", title: "Newly Added", layoutType: "horizontal_cards", showAllEnabled: true, sortOrder: 3, translations: { hi: { title: "नया जोड़ा गया" }, mr: { title: "नवीन जोडलेले" } } },
];

export async function seedMantras(
  tx: Prisma.TransactionClient
): Promise<SeedCounts> {
  const counts: SeedCounts = {
    categories: 0,
    categoryTranslations: 0,
    sections: 0,
    sectionTranslations: 0,
  };

  // 1. Categories (upsert by slug).
  for (const cat of CATEGORIES) {
    const row = await tx.mantraCategory.upsert({
      where: { slug: cat.slug },
      update: {
        displayName: cat.displayName,
        imageUrl: SEED_MEDIA_URLS.image(cat.slug, 400, 400),
        backgroundColorToken: cat.backgroundColorToken,
        sortOrder: cat.sortOrder,
        isActive: true,
      },
      create: {
        slug: cat.slug,
        displayName: cat.displayName,
        imageUrl: SEED_MEDIA_URLS.image(cat.slug, 400, 400),
        backgroundColorToken: cat.backgroundColorToken,
        sortOrder: cat.sortOrder,
        isActive: true,
      },
    });
    counts.categories += 1;

    // TAM-110: idempotent per-locale label overrides on `(mantraCategoryId, locale)`.
    for (const [locale, fields] of Object.entries(cat.translations ?? {})) {
      await tx.mantraCategoryTranslation.upsert({
        where: {
          mantra_category_translation_unique: { mantraCategoryId: row.id, locale },
        },
        update: { displayName: fields.displayName },
        create: { mantraCategoryId: row.id, locale, displayName: fields.displayName },
      });
      counts.categoryTranslations += 1;
    }
  }

  // 2. Homepage sections, keyed by sectionType.
  //
  // TAM-160 dropped the plain `@unique` on `section_type` so an editor can
  // create many `curated` sections, which cost this loop its `upsert`. The
  // BUILT-IN types seeded here are still one-row-each (partial unique index),
  // so find-then-write is exactly as idempotent as the upsert it replaces.
  // Seeds never emit `curated` rows — those are CMS-authored only.
  for (const section of SECTIONS) {
    const existing = await tx.mantraHomepageSection.findFirst({
      where: { sectionType: section.sectionType },
      select: { id: true },
    });
    const data = {
      title: section.title,
      layoutType: section.layoutType,
      showAllEnabled: section.showAllEnabled,
      sortOrder: section.sortOrder,
      isActive: true,
    };
    const row = existing
      ? await tx.mantraHomepageSection.update({ where: { id: existing.id }, data })
      : await tx.mantraHomepageSection.create({
          data: { sectionType: section.sectionType, ...data },
        });
    counts.sections += 1;

    // TAM-110: idempotent per-locale title overrides on
    // `(mantraHomepageSectionId, locale)`.
    for (const [locale, fields] of Object.entries(section.translations ?? {})) {
      await tx.mantraHomepageSectionTranslation.upsert({
        where: {
          mantra_homepage_section_translation_unique: {
            mantraHomepageSectionId: row.id,
            locale,
          },
        },
        update: { title: fields.title },
        create: { mantraHomepageSectionId: row.id, locale, title: fields.title },
      });
      counts.sectionTranslations += 1;
    }
  }

  return counts;
}

export async function runMantrasSeed(): Promise<SeedCounts> {
  return runSeed("mantras", seedMantras);
}

// CLI entrypoint — guarded so importing this file (e.g. from an integration
// test) has no side effect.
if (isSeedCli(import.meta.url)) {
  runMantrasSeed()
    .then(() => process.exit(0))
    .catch((err: unknown) => {
      process.stderr.write(
        `mantras seed failed: ${err instanceof Error ? err.message : String(err)}\n`
      );
      process.exit(1);
    });
}
