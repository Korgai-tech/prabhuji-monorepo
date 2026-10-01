/**
 * TAM-61 seed — Home navigational skeleton: the feature-shortcut grid + the
 * single-row store settings.
 *
 * Skeleton-only: seeds the 3×2 feature-shortcut grid (TAM-131/TAM-132 — six
 * tiles) and the `home_settings` row, but NO hero banners or feed content —
 * that is promotional/discovery content the content pipeline populates, not
 * the seed. Idempotent (`upsert` on `key`), transactional (via `runSeed`). Row
 * counts are stable across repeated runs (no duplication).
 *
 * Seeds the 6 REAL feature shortcuts (labels + order + module destinations) and
 * the single `home_settings` row (`feedTrendingFirst = false`, Phase-1 default).
 * The home banner carousel and feed resolve to empty until the content team
 * populates them.
 *
 * TAM-132: `iconUrl` is left NULL for every row on initial seed — ops populates
 * the six real URLs via the CMS post-deploy per the spec Blocker mitigation.
 * NULL cleanly triggers the mobile widget's bundled-`iconKey` fallback in the
 * meantime (an unreachable placeholder URL would flip every card into the error
 * path and mask real bugs). TAM-174's gradient ARM follows the same rule for
 * the same reason — it seeds the palette and copy and NO artwork; see
 * `SEED_ICON_BASE`. hi/mr translations for the two NEW cards (`set_status`,
 * `horoscope`) are empty until POPM supplies them; the resolver falls back to
 * the base `label` column.
 *
 * Run:  pnpm --filter api run seed:home
 */
import type { Prisma } from "@prisma/client";
import { type SeedCounts, isSeedCli, runSeed } from "./_shared.js";

/**
 * The first mobile release that can render the gradient arm.
 *
 * Below this the client has no themed card at all, so it is served the BASE
 * tile — byte-for-byte today's grid — instead of assets authored for a layout
 * it does not have. Bump it if the new grid slips to a later release; ops can
 * also edit it per arm in the CMS.
 */
const GRADIENT_ARM_MIN_APP_VERSION = "1.1.0";

/**
 * Where the seeded tile artwork lives — WHEN there is any.
 *
 * THE SEED DOES NOT PUBLISH ARTWORK BY DEFAULT, and that is the same call
 * TAM-132 already made for the base rows (`iconUrl: null` on every tile below):
 * the PNGs live in `scratchpad/tam174/gradient-3x`, are not in the repo, and
 * are uploaded to floci by `scripts/local-ab-setup.sh`. They therefore exist on
 * a dev box and NOWHERE else, so any URL this seed invents for them is a URL
 * with no file behind it on stage or prod.
 *
 * Worse than merely broken: `iconUrl` is published through the `mediaUrl`
 * schema, which Fastify validates on the way OUT. The previous hardcoded
 * `http://127.0.0.1:4566/...` default was refused anywhere the dev carve-out
 * (`MEDIA_ALLOW_INSECURE_URLS`) is off — CI and every deployed environment —
 * and a refused value is not a missing picture, it is a failed response
 * serialization that 500s `GET /home/shortcuts` for every user in the arm.
 *
 * So the seed publishes what it can actually author — the PALETTE and the COPY,
 * which are literal values transcribed from Figma — and leaves the arm's icon
 * absent (⇒ inherit the base row). Ops uploads the real artwork per environment
 * through the admin CMS, whose shortcut form has a `mediaField` upload bound to
 * the gradient arm's `iconUrl` (pick → presign → S3 PUT → the returned
 * `publicUrl` is saved), exactly as the base rows' icons are already published.
 *
 * `SEED_MEDIA_BASE_URL` is the one opt-in that turns artwork back on: it is the
 * FULL icon base (already carrying the `/seed/home/shortcuts` suffix), set by
 * `scripts/local-ab-setup.sh` to the laptop's LAN address after it uploads the
 * files there, so a physical device on the same network can load them. Unset —
 * which is CI, stage, prod, and a plain `pnpm seed:home` — means no arm icon.
 */
const SEED_ICON_BASE = process.env.SEED_MEDIA_BASE_URL ?? null;

/**
 * The gradient arm's icon for `key`, or `undefined` to inherit the base row's.
 *
 * `undefined`, not `null`: absent means INHERIT (the variant contract), whereas
 * an explicit null would be an override that blanks the tile's art.
 */
function gradientIcon(key: string): string | undefined {
  return SEED_ICON_BASE === null ? undefined : `${SEED_ICON_BASE}/gradient_v1/${key}.png`;
}


/**
 * A feature-shortcut tile of the 3×2 Home grid (TAM-131/TAM-132). The six rows
 * below are the REAL feature shortcuts (labels + paint order), previously
 * hardcoded in the client.
 *
 * #EXPORT_CRITICAL — `destinationValue` is a stable module KEY that the client's
 * hardcoded route allowlist already resolves, NOT a URL/path. `key` is the tile's
 * stable slug (also the client's bundled-icon lookup key); `iconKey` names the
 * bundled asset (BC fallback). TAM-132 introduces `iconUrl` — a CMS-owned
 * ABSOLUTE URL served live to the app (validated as `mediaUrl` on write). Left
 * NULL here on initial seed; ops populates via CMS post-deploy per the spec
 * Blocker mitigation.
 */
interface ShortcutSeed {
  key: string;
  label: string;
  destinationType: "linked_module" | "content_detail" | "pro_paywall" | "informational";
  destinationValue: string | null;
  iconKey: string | null;
  /** TAM-132: CMS-owned icon URL; NULL ⇒ client falls back to bundled `iconKey`. */
  iconUrl: string | null;
  /**
   * TAM-132 backwards-compat gate — minimum mobile `app_version` at which this
   * tile becomes visible on the public wire. NULL ⇒ no gate. Set on the two
   * NEW tiles (`set_status`, `horoscope`) whose icons only ship in the next
   * mobile release, so old builds see the 4-tile grid until they update.
   */
  minAppVersion: string | null;
  /**
   * TAM-174 — per-A/B-arm presentation (Figma node 3760:28482, "Colored Feature
   * Cards"). Keyed by arm id; every field inside is optional and absent means
   * INHERIT the base row above.
   *
   * ONLY `gradient_v1` is seeded, and only its PALETTE and COPY — never its
   * artwork, which has no file behind it outside a dev box (see
   * `SEED_ICON_BASE`). The control arm is DELIBERATELY absent: it is the design
   * already shipping, so it must render the artwork and copy ops has already
   * published on the base row. Seeding a control override would pin it
   * to whatever art this seed happens to carry and silently replace the live
   * icons — which is exactly the bug that produced white-boxed tiles on the
   * control grid. Ops can still author a control row in the CMS to make the
   * arms diverge; the seed just does not presume to.
   *
   * `minAppVersion` on the gradient arm is the backwards-compat gate: the arm
   * is authored for the new card — its palette, its copy, and the transparent
   * 104×68 band artwork ops uploads — and a build that predates TAM-174 would
   * paint all of it in the old layout. Gated out, such a build falls back to
   * the base row and renders exactly what it does today.
   *
   * Seeded on CREATE only — a re-run must not clobber an arm ops has retuned.
   */
  variants: Record<
    string,
    {
      label?: string;
      iconUrl?: string;
      minAppVersion?: string;
      theme?: {
        backgroundFrom: string;
        /** NOT clamped to 0..1 — `set_wallpaper` is authored 0.14734 → 1.4734. */
        backgroundFromStop: number;
        backgroundTo: string;
        backgroundToStop: number;
        labelColor: string;
      };
    }
  >;
  sortOrder: number;
  /** TAM-113: per-locale OVERRIDES for `label`; base column is the fallback. */
  translations?: Record<string, { label: string }>;
}

const SHORTCUTS: ShortcutSeed[] = [
  {
    key: "aarti_bhajans",
    label: "Aarti & Bhajans",
    destinationType: "linked_module",
    destinationValue: "aarti", // → the real TAM-63 module route
    iconKey: "aarti",
    iconUrl: null,
    minAppVersion: null,
    variants: {
      // The new coloured tile: its own copy and its own palette, transcribed
      // from Figma node 3760:28482. Artwork is NOT seeded (see
      // `SEED_ICON_BASE`) — ops uploads it per environment via the CMS.
      gradient_v1: {
        minAppVersion: GRADIENT_ARM_MIN_APP_VERSION,
        label: "आरती और भजन",
        iconUrl: gradientIcon("aarti_bhajans"),
        theme: {
          backgroundFrom: "#FFF0D9",
          backgroundFromStop: 0,
          backgroundTo: "#FFA742",
          backgroundToStop: 1,
          labelColor: "#C96800",
        },
      },
    },
    sortOrder: 0,
    translations: { hi: { label: "आरती और भजन" }, mr: { label: "आरती आणि भजन" } },
  },
  {
    key: "mantras_stutis",
    label: "Mantras & Stutis",
    destinationType: "linked_module",
    destinationValue: "mantras", // → the real TAM-65 module route
    iconKey: "mantras",
    iconUrl: null,
    minAppVersion: null,
    variants: {
      // The new coloured tile: its own copy and its own palette, transcribed
      // from Figma node 3760:28482. Artwork is NOT seeded (see
      // `SEED_ICON_BASE`) — ops uploads it per environment via the CMS.
      gradient_v1: {
        minAppVersion: GRADIENT_ARM_MIN_APP_VERSION,
        label: "मंत्र और स्तुति",
        iconUrl: gradientIcon("mantras_stutis"),
        theme: {
          backgroundFrom: "#FFEFFB",
          backgroundFromStop: 0.1,
          backgroundTo: "#FF90E3",
          backgroundToStop: 1,
          labelColor: "#951A77",
        },
      },
    },
    sortOrder: 1,
    translations: { hi: { label: "मंत्र और स्तुति" }, mr: { label: "मंत्र आणि स्तुती" } },
  },
  {
    key: "set_wallpaper",
    label: "Set Wallpaper",
    destinationType: "linked_module",
    destinationValue: "wallpaper", // → the real TAM-69 module route
    iconKey: "wallpaper",
    iconUrl: null,
    minAppVersion: null,
    variants: {
      // The new coloured tile: its own copy and its own palette, transcribed
      // from Figma node 3760:28482. Artwork is NOT seeded (see
      // `SEED_ICON_BASE`) — ops uploads it per environment via the CMS.
      gradient_v1: {
        minAppVersion: GRADIENT_ARM_MIN_APP_VERSION,
        label: "वॉलपेपर लगाएं",
        iconUrl: gradientIcon("set_wallpaper"),
        theme: {
          backgroundFrom: "#E8F8F5",
          backgroundFromStop: 0.14734,
          backgroundTo: "#1DC0AE",
          backgroundToStop: 1.4734,
          labelColor: "#08776D",
        },
      },
    },
    sortOrder: 2,
    translations: { hi: { label: "वॉलपेपर सेट करें" }, mr: { label: "वॉलपेपर सेट करा" } },
  },
  {
    // TAM-132 — new card. hi/mr translations pending POPM (blocker) — empty
    // for now; the resolver falls back to the base `label` column. TAM-132 BC
    // gate: any client on strictly > 1.0.4 (the live release) gets this tile;
    // older builds don't have the bundled icon PNG so we hide it from them.
    key: "set_status",
    label: "Set Status",
    destinationType: "linked_module",
    destinationValue: "status", // → shell branch (`/status`)
    iconKey: "status",
    iconUrl: null,
    minAppVersion: "1.0.5",
    variants: {
      // The new coloured tile: its own copy and its own palette, transcribed
      // from Figma node 3760:28482. Artwork is NOT seeded (see
      // `SEED_ICON_BASE`) — ops uploads it per environment via the CMS.
      gradient_v1: {
        minAppVersion: GRADIENT_ARM_MIN_APP_VERSION,
        label: "स्टेटस लगाएं",
        iconUrl: gradientIcon("set_status"),
        theme: {
          backgroundFrom: "#EAF4FF",
          backgroundFromStop: 0.1,
          backgroundTo: "#3896E9",
          backgroundToStop: 1,
          labelColor: "#1261A8",
        },
      },
    },
    sortOrder: 3,
    translations: {},
  },
  {
    // TAM-132 — new card. Same BC-gate rationale as `set_status`.
    key: "horoscope",
    label: "Horoscope",
    destinationType: "linked_module",
    destinationValue: "horoscope", // → shell branch (`/horoscope`)
    iconKey: "horoscope",
    iconUrl: null,
    minAppVersion: "1.0.5",
    variants: {
      // The new coloured tile: its own copy and its own palette, transcribed
      // from Figma node 3760:28482. Artwork is NOT seeded (see
      // `SEED_ICON_BASE`) — ops uploads it per environment via the CMS.
      gradient_v1: {
        minAppVersion: GRADIENT_ARM_MIN_APP_VERSION,
        label: "राशिफल",
        iconUrl: gradientIcon("horoscope"),
        theme: {
          backgroundFrom: "#EDE8FF",
          backgroundFromStop: 0.1,
          backgroundTo: "#6249DC",
          backgroundToStop: 1,
          labelColor: "#3E327F",
        },
      },
    },
    sortOrder: 4,
    translations: {},
  },
  {
    key: "set_ringtone",
    label: "Set Ringtone",
    destinationType: "linked_module",
    destinationValue: "ringtone", // → the real TAM-67 module route
    iconKey: "ringtone",
    iconUrl: null,
    minAppVersion: null,
    variants: {
      // The new coloured tile: its own copy and its own palette, transcribed
      // from Figma node 3760:28482. Artwork is NOT seeded (see
      // `SEED_ICON_BASE`) — ops uploads it per environment via the CMS.
      gradient_v1: {
        minAppVersion: GRADIENT_ARM_MIN_APP_VERSION,
        label: "रिंगटोन लगाएं",
        iconUrl: gradientIcon("set_ringtone"),
        theme: {
          backgroundFrom: "#FFE3E4",
          backgroundFromStop: 0.1,
          backgroundTo: "#FF8888",
          backgroundToStop: 1,
          labelColor: "#7C0303",
        },
      },
    },
    sortOrder: 5,
    translations: { hi: { label: "रिंगटोन सेट करें" }, mr: { label: "रिंगटोन सेट करा" } },
  },
];

const SETTINGS_KEY = "default";

export async function seedHome(tx: Prisma.TransactionClient): Promise<SeedCounts> {
  const counts: SeedCounts = {
    shortcuts: 0,
    shortcutVariants: 0,
    shortcutTranslations: 0,
    settings: 0,
  };

  // 1. Shortcuts (upsert by the stable `key` — a natural unique column).
  for (const s of SHORTCUTS) {
    // NOTE: `iconUrl` intentionally omitted from `update` — post-deploy the CMS
    // populates real S3 URLs and a re-run of the seed must not blank them. It
    // IS set on `create` (initial seed of a fresh DB is NULL by design).
    // Same treatment for `minAppVersion` (TAM-132 BC gate): ops may tweak the
    // gate via CMS/SQL if the upcoming release ships under a different semver,
    // and a re-run of the seed must not clobber that.
    const updateData = {
      label: s.label,
      destinationType: s.destinationType,
      destinationValue: s.destinationValue,
      iconKey: s.iconKey,
      sortOrder: s.sortOrder,
      isActive: true,
    };
    const shortcutRow = await tx.homeShortcut.upsert({
      where: { key: s.key },
      update: updateData,
      create: {
        key: s.key,
        ...updateData,
        iconUrl: s.iconUrl,
        minAppVersion: s.minAppVersion,
      },
    });
    counts.shortcuts += 1;

    // TAM-174 — the arm rows, CREATE-IF-MISSING.
    //
    // Not nested in the `create` above, because that branch only runs for a
    // shortcut this seed has never seen — and the six rows already exist in
    // every environment that ran TAM-61/132. Nesting it there silently seeded
    // nothing on exactly the databases that matter.
    //
    // `update: {}` is the other half: an arm ops has since retuned in the CMS
    // keeps its values, matching how `iconUrl` and `minAppVersion` are handled
    // above. The seed fills gaps; it never overwrites.
    for (const [variant, v] of Object.entries(s.variants)) {
      await tx.homeShortcutVariant.upsert({
        where: {
          home_shortcut_variant_unique: { homeShortcutId: shortcutRow.id, variant },
        },
        update: {},
        create: {
          homeShortcutId: shortcutRow.id,
          variant,
          label: v.label ?? null,
          iconUrl: v.iconUrl ?? null,
          minAppVersion: v.minAppVersion ?? null,
          themeBackgroundFrom: v.theme?.backgroundFrom ?? null,
          themeBackgroundFromStop: v.theme?.backgroundFromStop ?? null,
          themeBackgroundTo: v.theme?.backgroundTo ?? null,
          themeBackgroundToStop: v.theme?.backgroundToStop ?? null,
          themeLabelColor: v.theme?.labelColor ?? null,
        },
      });
      counts.shortcutVariants += 1;
    }

    // TAM-113: idempotent per-locale label overrides on `(homeShortcutId, locale)`.
    for (const [locale, fields] of Object.entries(s.translations ?? {})) {
      await tx.homeShortcutTranslation.upsert({
        where: {
          home_shortcut_translation_unique: {
            homeShortcutId: shortcutRow.id,
            locale,
          },
        },
        update: { label: fields.label },
        create: { homeShortcutId: shortcutRow.id, locale, label: fields.label },
      });
      counts.shortcutTranslations += 1;
    }
  }

  // 2. Store settings (single row; Phase-1 default feedTrendingFirst = false).
  await tx.homeSettings.upsert({
    where: { key: SETTINGS_KEY },
    update: {},
    // TAM-174 — the gradient experiment starts OFF. Seeding a palette must not
    // start an experiment; that is a deliberate ops action in Home settings.
    create: { key: SETTINGS_KEY, feedTrendingFirst: false, shortcutGridGradientEnabled: false },
  });
  counts.settings += 1;

  return counts;
}

export async function runHomeSeed(): Promise<SeedCounts> {
  return runSeed("home", seedHome);
}

// CLI entrypoint — guarded so importing this file (e.g. from an integration
// test) has no side effect.
if (isSeedCli(import.meta.url)) {
  runHomeSeed()
    .then(() => process.exit(0))
    .catch((err: unknown) => {
      process.stderr.write(
        `home seed failed: ${err instanceof Error ? err.message : String(err)}\n`
      );
      process.exit(1);
    });
}
