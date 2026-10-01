/**
 * TAM-63 seed — Aarti & Bhajans navigational skeleton.
 *
 * Skeleton-only: seeds the category taxonomy and the homepage section
 * definitions the app navigates through, but NO audio content — content is
 * populated by the content pipeline, not the seed. Idempotent (`upsert` on the
 * `slug` / `section_type` unique keys), transactional (via `runSeed`). Category
 * artwork uses REAL, publicly-reachable picsum images (deterministic per slug)
 * so the grid renders end-to-end.
 *
 * Seeds: 6 categories and the 5 homepage sections.
 *
 * Run:  pnpm --filter api run seed:aarti
 */
import type { Prisma } from "@prisma/client";
import { SEED_MEDIA_URLS, type SeedCounts, isSeedCli, runSeed } from "./_shared.js";

interface CategorySeed {
  slug: string;
  name: string;
  sortOrder: number;
  displayColor: string;
  // TAM-108 label-localization round-trip proof: optional per-locale OVERRIDES
  // for the framing `name` (+ `description`). ADDITIVE — the base `name` column
  // above is the fallback, so most categories carry no row. Empty-fill/
  // idempotent; NOT a backfill of every string (design §6).
  translations?: Record<string, { name: string; description?: string }>;
}

/** Phase-1 categories (PRD §6.5) — seed data, not hardcoded logic. */
export const CATEGORIES: CategorySeed[] = [
  { slug: "prabhuji-originals", name: "Prabhuji Originals", sortOrder: 0, displayColor: "#6d28d9" },
  { slug: "stotram", name: "Stotram", sortOrder: 1, displayColor: "#b91c1c" },
  { slug: "aarti", name: "Aarti", sortOrder: 2, displayColor: "#f97316", translations: { hi: { name: "आरती" }, mr: { name: "आरती" } } },
  { slug: "chalisa", name: "Chalisa", sortOrder: 3, displayColor: "#0891b2" },
  { slug: "mantra-jaap", name: "Mantra Jaap", sortOrder: 4, displayColor: "#15803d" },
  { slug: "katha", name: "Katha", sortOrder: 5, displayColor: "#a16207" },
];

interface SectionSeed {
  sectionType: string;
  title: string;
  sortOrder: number;
  /** TAM-108: per-locale OVERRIDES for `title`; base column is the fallback. */
  translations?: Record<string, { title: string }>;
}

export const SECTIONS: SectionSeed[] = [
  {
    sectionType: "recently_played",
    title: "Recently Played",
    sortOrder: 0,
    translations: { hi: { title: "हाल में सुने गए" }, mr: { title: "अलीकडे ऐकलेले" } },
  },
  {
    sectionType: "deities",
    title: "Deities",
    sortOrder: 1,
    translations: { hi: { title: "देवता" }, mr: { title: "देवता" } },
  },
  {
    sectionType: "browse_categories",
    title: "Browse Categories",
    sortOrder: 2,
    translations: { hi: { title: "श्रेणियाँ देखें" }, mr: { title: "श्रेणी पहा" } },
  },
  {
    sectionType: "newly_added",
    title: "Newly Added",
    sortOrder: 3,
    translations: { hi: { title: "नया जोड़ा गया" }, mr: { title: "नवीन जोडलेले" } },
  },
  {
    sectionType: "most_played",
    title: "Most Played",
    sortOrder: 4,
    translations: { hi: { title: "सर्वाधिक सुने गए" }, mr: { title: "सर्वाधिक ऐकलेले" } },
  },
];

export async function seedAarti(
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
    const row = await tx.audioCategory.upsert({
      where: { slug: cat.slug },
      update: {
        name: cat.name,
        imageUrl: SEED_MEDIA_URLS.image(cat.slug, 400, 400),
        displayColor: cat.displayColor,
        sortOrder: cat.sortOrder,
        isActive: true,
      },
      create: {
        slug: cat.slug,
        name: cat.name,
        imageUrl: SEED_MEDIA_URLS.image(cat.slug, 400, 400),
        displayColor: cat.displayColor,
        sortOrder: cat.sortOrder,
        isActive: true,
      },
    });
    counts.categories += 1;

    // TAM-108: idempotent per-locale label OVERRIDES (upsert on
    // `(audioCategoryId, locale)`) — proves the translation round-trip without
    // backfilling fake rows for untranslated categories.
    for (const [locale, fields] of Object.entries(cat.translations ?? {})) {
      await tx.audioCategoryTranslation.upsert({
        where: {
          audio_category_translation_unique: {
            audioCategoryId: row.id,
            locale,
          },
        },
        update: { name: fields.name, description: fields.description ?? null },
        create: {
          audioCategoryId: row.id,
          locale,
          name: fields.name,
          description: fields.description ?? null,
        },
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
    const existing = await tx.homepageSection.findFirst({
      where: { sectionType: section.sectionType },
      select: { id: true },
    });
    const row = existing
      ? await tx.homepageSection.update({
          where: { id: existing.id },
          data: { title: section.title, sortOrder: section.sortOrder, isActive: true },
        })
      : await tx.homepageSection.create({
          data: {
            sectionType: section.sectionType,
            title: section.title,
            sortOrder: section.sortOrder,
            isActive: true,
          },
        });
    counts.sections += 1;

    // TAM-113: idempotent per-locale title overrides on `(homepageSectionId, locale)`.
    for (const [locale, fields] of Object.entries(section.translations ?? {})) {
      await tx.homepageSectionTranslation.upsert({
        where: {
          homepage_section_translation_unique: {
            homepageSectionId: row.id,
            locale,
          },
        },
        update: { title: fields.title },
        create: { homepageSectionId: row.id, locale, title: fields.title },
      });
      counts.sectionTranslations += 1;
    }
  }

  return counts;
}

export async function runAartiSeed(): Promise<SeedCounts> {
  return runSeed("aarti", seedAarti);
}

// CLI entrypoint — guarded so importing this file (e.g. from an integration
// test) has no side effect.
if (isSeedCli(import.meta.url)) {
  runAartiSeed()
    .then(() => process.exit(0))
    .catch((err: unknown) => {
      process.stderr.write(
        `aarti seed failed: ${err instanceof Error ? err.message : String(err)}\n`
      );
      process.exit(1);
    });
}
