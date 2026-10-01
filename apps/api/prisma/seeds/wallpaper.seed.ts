/**
 * TAM-69 seed — Wallpaper navigational skeleton.
 *
 * Skeleton-only: seeds the homepage row definitions the app navigates through,
 * but NO wallpaper content — content is populated by the content pipeline, not
 * the seed. Idempotent (`upsert` on the `row_key` unique key), transactional
 * (via `runSeed`). Row counts are stable across repeated runs (no duplication).
 *
 * Seeds the 4 initial rows (Top Live / New / Trending / Liked) + 1
 * custom row ("Festival Specials"). The rows serve no items until the
 * content team populates wallpapers (the trending/festival rows resolve to
 * empty in the meantime).
 *
 * Run:  pnpm --filter api run seed:wallpaper
 */
import type { Prisma } from "@prisma/client";
import { type SeedCounts, isSeedCli, runSeed } from "./_shared.js";

interface RowSeed {
  rowKey: string;
  title: string;
  rowType: "top_live" | "new" | "trending" | "liked" | "custom";
  iconKey: string | null;
  displayOrder: number;
  /** TAM-111: per-locale OVERRIDES for `title`; base column is the fallback. */
  translations?: Record<string, { title: string }>;
}

/** 4 initial rows + 1 custom-category row (Festival Specials). */
export const ROWS: RowSeed[] = [
  { rowKey: "top-live", title: "Top Live Wallpapers", rowType: "top_live", iconKey: "live", displayOrder: 0, translations: { hi: { title: "टॉप लाइव वॉलपेपर" }, mr: { title: "टॉप लाइव्ह वॉलपेपर" } } },
  { rowKey: "trending", title: "Trending", rowType: "trending", iconKey: "trending", displayOrder: 1, translations: { hi: { title: "ट्रेंडिंग" }, mr: { title: "ट्रेंडिंग" } } },
  { rowKey: "new", title: "New Additions", rowType: "new", iconKey: "new", displayOrder: 2, translations: { hi: { title: "नए वॉलपेपर" }, mr: { title: "नवीन वॉलपेपर" } } },
  { rowKey: "festival-specials", title: "Festival Specials", rowType: "custom", iconKey: "festival", displayOrder: 3, translations: { hi: { title: "त्योहार विशेष" }, mr: { title: "सण विशेष" } } },
  { rowKey: "liked", title: "Liked by You", rowType: "liked", iconKey: "heart", displayOrder: 4, translations: { hi: { title: "आपके पसंदीदा" }, mr: { title: "तुम्हाला आवडलेले" } } },
];

export async function seedWallpapers(
  tx: Prisma.TransactionClient
): Promise<SeedCounts> {
  const counts: SeedCounts = {
    rows: 0,
    rowTranslations: 0,
  };

  // Homepage rows (upsert by rowKey).
  for (const r of ROWS) {
    const data = {
      title: r.title,
      rowType: r.rowType,
      iconKey: r.iconKey,
      maxItems: 20,
      displayOrder: r.displayOrder,
      isActive: true,
    };
    const row = await tx.wallpaperHomepageRow.upsert({
      where: { rowKey: r.rowKey },
      update: data,
      create: { rowKey: r.rowKey, ...data },
    });
    counts.rows += 1;

    // TAM-111: idempotent per-locale title overrides on
    // `(wallpaperHomepageRowId, locale)`.
    for (const [locale, fields] of Object.entries(r.translations ?? {})) {
      await tx.wallpaperHomepageRowTranslation.upsert({
        where: {
          wallpaper_homepage_row_translation_unique: {
            wallpaperHomepageRowId: row.id,
            locale,
          },
        },
        update: { title: fields.title },
        create: { wallpaperHomepageRowId: row.id, locale, title: fields.title },
      });
      counts.rowTranslations += 1;
    }
  }

  return counts;
}

export async function runWallpaperSeed(): Promise<SeedCounts> {
  return runSeed("wallpaper", seedWallpapers);
}

// CLI entrypoint — guarded so importing this file (e.g. from an integration
// test) has no side effect.
if (isSeedCli(import.meta.url)) {
  runWallpaperSeed()
    .then(() => process.exit(0))
    .catch((err: unknown) => {
      process.stderr.write(
        `wallpaper seed failed: ${err instanceof Error ? err.message : String(err)}\n`
      );
      process.exit(1);
    });
}
