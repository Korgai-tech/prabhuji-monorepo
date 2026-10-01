/**
 * Shared seed conventions (TAM-57 AC (e)), building on `paywall-config.seed.ts`.
 *
 * Every module seed (TAM-61…76 + this ticket's `deity.seed.ts`) reuses:
 *   - `createSeedPrisma()`   — a `PrismaClient` factory (seeds live OUTSIDE the
 *                              app layering, so they touch Prisma directly);
 *   - `SEED_MEDIA_URLS`      — REAL, publicly-hosted, freely-usable sample media
 *                              (see "Media sources" below). No live Prabhuji-
 *                              controlled URL ever ships in a seed
 *                              (#EXPORT_CRITICAL, same rule as TAM-46) — every
 *                              URL here points at a third-party free/sample host;
 *   - `runSeed(name, fn)`    — wraps the seed body in ONE `$transaction` (so a
 *                              partial failure rolls back) + logs stable row
 *                              counts. Each `fn` upserts on the model's unique
 *                              key, making the whole seed idempotent (row counts
 *                              are stable across repeated runs — no duplication).
 *
 * ## Media sources (why these, and the rules)
 *
 * The product constraint is that EVERYTHING the app renders comes from the
 * database — so seeds must carry media that actually LOADS and PLAYS, otherwise
 * the app cannot be tested end-to-end. Earlier revisions used `placehold.co` /
 * `cdn.example.com`, which never resolve. Every builder below now returns a real
 * URL that responds 200:
 *
 *   - IMAGES → `picsum.photos/seed/<seed>/<w>/<h>` — free, and DETERMINISTIC per
 *     seed: the same seed always yields the same photo, so re-seeding is
 *     reproducible and a thumbnail/preview/apply-asset triple built from one
 *     item's slug are all crops of the SAME picture.
 *   - AUDIO → SoundHelix sample MP3s (16 tracks) — free, real playable music.
 *     Picked per item by a stable hash so the library has variety.
 *   - VIDEO → short Creative-Commons sample MP4s (Blender open movies via
 *     test-videos.co.uk / download.blender.org, W3C media samples, MDN CC0).
 *     Picked per item by a stable hash.
 *
 * NOTE (deviation, deliberate): Google's `gtv-videos-bucket` sample MP4s
 * (`commondatastorage.googleapis.com/gtv-videos-bucket/sample/*.mp4`) are the
 * classic choice here, but anonymous access to that bucket has been REVOKED —
 * every object now returns `403 AccessDenied`. They are therefore unusable for
 * end-to-end testing and are replaced by the CC pool below (all verified 200).
 *
 * NO copyrighted devotional music, scripture recordings, or devotional imagery
 * is referenced: this is generic stock/sample media standing in for content the
 * content team authors later. Text content stays synthetic placeholder copy.
 *
 * `runSeed` is safe to call from an integration test (it manages its own client
 * + disconnect); the module seed files add a CLI entrypoint guarded so importing
 * them has no side effect.
 */
import { fileURLToPath } from "node:url";

import { PrismaClient, type Prisma } from "@prisma/client";

export function createSeedPrisma(): PrismaClient {
  return new PrismaClient();
}

/** Deterministic image host — same seed ⇒ same photo, any size. */
const PICSUM_BASE = "https://picsum.photos/seed";

/** Free sample-music host; tracks are `SoundHelix-Song-1..16.mp3`. */
const SOUNDHELIX_BASE = "https://www.soundhelix.com/examples/mp3";
const SOUNDHELIX_TRACK_COUNT = 16;

/**
 * Short Creative-Commons sample MP4s — all verified publicly reachable (200/206)
 * and playable. Replaces the now-403 Google `gtv-videos-bucket` set.
 */
const SAMPLE_VIDEOS = [
  "https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/720/Big_Buck_Bunny_720_10s_1MB.mp4",
  "https://test-videos.co.uk/vids/jellyfish/mp4/h264/720/Jellyfish_720_10s_1MB.mp4",
  "https://test-videos.co.uk/vids/sintel/mp4/h264/720/Sintel_720_10s_1MB.mp4",
  "https://media.w3.org/2010/05/sintel/trailer.mp4",
  "https://media.w3.org/2010/05/bunny/trailer.mp4",
  "https://media.w3.org/2010/05/video/movie_300.mp4",
  "https://download.blender.org/peach/bigbuckbunny_movies/BigBuckBunny_320x180.mp4",
  "https://mdn.github.io/shared-assets/videos/flower.mp4",
] as const;

/**
 * FNV-1a — a small, stable, non-cryptographic hash. Used ONLY to spread items
 * deterministically across the fixed audio/video pools, so a given slug always
 * maps to the same track/clip (re-seeding is byte-reproducible).
 */
function fnv1a(value: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * Normalize any item key (usually a slug) into a URL-safe picsum seed. Non-ASCII
 * labels (e.g. Devanagari) would slugify to the empty string and collide onto one
 * image, so they fall back to a stable hash of the original value.
 */
function toPicsumSeed(value: string): string {
  const slug = value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug.length > 0 ? slug : `seed-${fnv1a(value).toString(16)}`;
}

/** Pick one of the 16 SoundHelix tracks deterministically for `key`. */
function sampleTrack(key: string): string {
  const track = (fnv1a(key) % SOUNDHELIX_TRACK_COUNT) + 1;
  return `${SOUNDHELIX_BASE}/SoundHelix-Song-${track}.mp3`;
}

/** Pick one of the CC sample clips deterministically for `key`. */
function sampleVideo(key: string): string {
  return SAMPLE_VIDEOS[fnv1a(key) % SAMPLE_VIDEOS.length];
}

/**
 * REAL sample-media URL builders (free/public hosts — never a live Prabhuji-
 * controlled URL, per the #EXPORT_CRITICAL seed-URL rule). Callers pass the
 * item's SLUG so every URL is stable and reproducible across re-seeds, and so
 * all surfaces of one item (thumbnail / preview / apply asset) share one photo.
 */
export const SEED_MEDIA_URLS = {
  /** Generic deterministic image at a given size, seeded by `seed` (a slug). */
  image(seed: string, width: number, height: number): string {
    return `${PICSUM_BASE}/${toPicsumSeed(seed)}/${width}/${height}`;
  },
  /** A deity icon for `slug` (https — passes the `mediaUrl` guard). */
  deityIcon(slug: string): string {
    return this.image(`deity-${slug}`, 256, 256);
  },
  /** Square cover art (~800x800) for `slug`. */
  coverArt(slug: string): string {
    return this.image(slug, 800, 800);
  },
  /** Real playable AUDIO for an aarti/bhajan `slug` (TAM-56 Decision 2). */
  audioStream(slug: string): string {
    return sampleTrack(`aarti:${slug}`);
  },
  /** Real playable AUDIO for a mantra/stuti `slug` (TAM-65). */
  mantraAudio(slug: string): string {
    return sampleTrack(`mantra:${slug}`);
  },
  /**
   * A placeholder DEEP-LINK URL for a mantra/stuti `slug` (TAM-65). NOT media —
   * an app deep link the content team wires to a real domain later, so it stays
   * an `example.com` placeholder.
   */
  mantraDeepLink(slug: string): string {
    return `https://example.com/prabhuji/app/mantras/${encodeURIComponent(slug)}`;
  },
  /** Real playable AUDIO for a ringtone `slug` (TAM-67). */
  ringtoneAudio(slug: string): string {
    return sampleTrack(`ringtone:${slug}`);
  },
  /** A placeholder DEEP-LINK URL for a ringtone `slug` (TAM-67). NOT media. */
  ringtoneDeepLink(slug: string): string {
    return `https://example.com/prabhuji/app/ringtones/${encodeURIComponent(slug)}`;
  },
  /** Real playable live-wallpaper PREVIEW video for a wallpaper `slug` (TAM-69). */
  wallpaperVideo(slug: string): string {
    return sampleVideo(`wallpaper:${slug}`);
  },
  /**
   * Real playable live-wallpaper ASSET video for a wallpaper `slug` (TAM-69) —
   * the android-compatible asset the device set action consumes. Intentionally
   * the SAME clip as `wallpaperVideo(slug)`: what you preview is what you set.
   */
  wallpaperLiveAsset(slug: string): string {
    return sampleVideo(`wallpaper:${slug}`);
  },
  /** Real playable STATUS video for a status `slug` (TAM-71). */
  statusVideo(slug: string): string {
    return sampleVideo(`status:${slug}`);
  },
  /** Real playable HOME hero-banner video for a banner `key` (TAM-61). */
  bannerVideo(key: string): string {
    return sampleVideo(`banner:${key}`);
  },
  /** A zodiac icon for `slug` (TAM-73). */
  zodiacIcon(slug: string): string {
    return this.image(`zodiac-${slug}`, 256, 256);
  },
  /** Real playable HOROSCOPE result-background video (TAM-73). */
  horoscopeBackgroundVideo(key: string): string {
    return sampleVideo(`horoscope:${key}`);
  },
  /** HOROSCOPE result-background STATIC fallback image, portrait (TAM-73). */
  horoscopeBackgroundStatic(key: string): string {
    return this.image(`horoscope-${key}`, 1080, 1920);
  },
  /** A BOOK/SCRIPTURE cover image for a `slug` (TAM-75) — portrait 2:3. */
  bookCover(slug: string): string {
    return this.image(`book-${slug}`, 800, 1200);
  },
  /**
   * Real playable BOOK-CHAPTER AUDIO for a `slug` (TAM-75). Audio is
   * major-book-chapter-only (r7).
   */
  bookChapterAudio(slug: string): string {
    return sampleTrack(`book:${slug}`);
  },
} as const;

export type SeedCounts = Record<string, number>;

/**
 * True only when THIS seed file is the process entrypoint (`pnpm seed:<module>`).
 *
 * Guards the CLI blocks at the bottom of every seed. A plain
 * `process.argv[1] === fileURLToPath(import.meta.url)` is NOT enough: the api
 * ships as an esbuild BUNDLE (project.json `bundle: true`), and since TAM-80
 * made src/index.ts import these seeds, they are compiled INTO dist/index.js.
 * Bundling collapses every module's `import.meta.url` to the bundle's own URL,
 * so that comparison is `/app/index.js === /app/index.js` — true for all eleven
 * seeds at once. Each CLI block then fired on boot and the first to finish
 * called process.exit(0), killing the server moments after it started listening.
 *
 * Requiring the entrypoint to BE a `.seed.ts`/`.seed.js` file keeps the blocks
 * inert inside the bundle while leaving the CLI scripts working unchanged.
 */
export function isSeedCli(moduleUrl: string): boolean {
  const entry = process.argv[1];
  if (entry === undefined) return false;
  return entry === fileURLToPath(moduleUrl) && /\.seed\.[tj]s$/.test(entry);
}

/**
 * Run a seed body inside one transaction and log its stable row counts.
 * Returns the counts so a test can assert idempotency across two runs.
 */
export async function runSeed(
  name: string,
  fn: (tx: Prisma.TransactionClient) => Promise<SeedCounts>
): Promise<SeedCounts> {
  const prisma = createSeedPrisma();
  try {
    const counts = await prisma.$transaction((tx) => fn(tx));
    // stdout is intentional — seeds are CLI scripts, not app runtime code.
    process.stdout.write(`${name} seed ok: ${JSON.stringify(counts)}\n`);
    return counts;
  } finally {
    await prisma.$disconnect();
  }
}
