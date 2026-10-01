/**
 * TAM-75 seed — Books & Scriptures navigational skeleton.
 *
 * Skeleton-only: seeds the 4 CMS-owned SECTION HEADINGS the app navigates
 * through, but NO book/scripture content — books, sub-books, chapters, and
 * scriptures are populated by the content pipeline, not the seed. Idempotent
 * (`upsert` on the stable `key`), transactional (via `runSeed`). Row counts are
 * stable across repeated runs.
 *
 * Seeds the 4 section headings ("Books" / "Browse Categories" / "Newly Added
 * Books" for `GET /books/home`, plus "All Books" for the `GET /books` listing
 * screen) — the titles the client used to hardcode. The carousel / newly-added /
 * category lists resolve to empty until the content team populates books.
 *
 * Run:  pnpm --filter api run seed:books
 */
import type { Prisma } from "@prisma/client";
import { type SeedCounts, isSeedCli, runSeed } from "./_shared.js";

/**
 * CMS-owned section headings for the Books surfaces (mirrors the aarti
 * `homepage_sections` seed). These are the REAL Phase-1 titles the app used to
 * hardcode; ops can now rename/reorder/deactivate a section without a release.
 *
 * `all_books` is NOT a home section — it is the heading `GET /books` serves for
 * the all-books listing SCREEN (its `sortOrder` is unused).
 */
interface SectionSeed {
  key: string;
  title: string;
  sortOrder: number;
  /** TAM-112: per-locale OVERRIDES for `title`; base column is the fallback. */
  translations?: Record<string, { title: string }>;
}

export const BOOK_SECTIONS: SectionSeed[] = [
  { key: "carousel", title: "Books", sortOrder: 0, translations: { hi: { title: "पुस्तकें" }, mr: { title: "पुस्तके" } } },
  { key: "categories", title: "Browse Categories", sortOrder: 1, translations: { hi: { title: "श्रेणियाँ देखें" }, mr: { title: "श्रेणी पहा" } } },
  { key: "newly_added", title: "Newly Added Books", sortOrder: 2, translations: { hi: { title: "नई पुस्तकें" }, mr: { title: "नवीन पुस्तके" } } },
  { key: "all_books", title: "All Books", sortOrder: 3, translations: { hi: { title: "सभी पुस्तकें" }, mr: { title: "सर्व पुस्तके" } } },
];

export async function seedBooks(
  tx: Prisma.TransactionClient
): Promise<SeedCounts> {
  const counts: SeedCounts = {
    sections: 0,
    sectionTranslations: 0,
  };

  // ---- section headings (upsert by the stable `key`) ----------------------
  for (const s of BOOK_SECTIONS) {
    const data = { title: s.title, sortOrder: s.sortOrder, isActive: true };
    const row = await tx.bookSection.upsert({
      where: { key: s.key },
      update: data,
      create: { key: s.key, ...data },
    });
    counts.sections += 1;

    // TAM-112: idempotent per-locale title overrides on `(bookSectionId, locale)`.
    for (const [locale, fields] of Object.entries(s.translations ?? {})) {
      await tx.bookSectionTranslation.upsert({
        where: {
          book_section_translation_unique: { bookSectionId: row.id, locale },
        },
        update: { title: fields.title },
        create: { bookSectionId: row.id, locale, title: fields.title },
      });
      counts.sectionTranslations += 1;
    }
  }

  return counts;
}

export async function runBooksSeed(): Promise<SeedCounts> {
  return runSeed("books", seedBooks);
}

// CLI entrypoint — guarded so importing this file (e.g. from an integration
// test) has no side effect.
if (isSeedCli(import.meta.url)) {
  runBooksSeed()
    .then(() => process.exit(0))
    .catch((err: unknown) => {
      process.stderr.write(
        `books seed failed: ${err instanceof Error ? err.message : String(err)}\n`
      );
      process.exit(1);
    });
}
