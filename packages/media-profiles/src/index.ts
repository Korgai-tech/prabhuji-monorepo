/**
 * The media quality ladder, shared by the re-encode backfill (TAM-265,
 * `apps/api/scripts/media-reencode`) and the upload optimizer (TAM-267): WHICH
 * columns hold heavy media, WHAT each is re-encoded to, WHEN a file is left
 * alone, and the exact ffmpeg arguments. No I/O here, so every rule is
 * unit-tested (`src/__tests__/media-profiles.test.ts`); callers do the
 * S3/DB/ffmpeg work.
 *
 * Why this exists: prod's media CDN served 1.7 TB/week, almost all of it video
 * and audio stored far above what a phone shows or plays (4K 8–15 Mbps status
 * clips, a 1080p HEVC 9.2 Mbps paywall hero, 192 kbps aarti mp3s). See
 * specs/TAM-265-media-reencode-backfill.md.
 */
import { randomUUID } from "node:crypto";

export type ProfileName = "status" | "hero" | "music" | "speech";

export interface VideoProfile {
  readonly kind: "video";
  /** Bounding box, portrait (w × h). Landscape sources are fitted by their long side. */
  readonly maxShort: number;
  readonly maxLong: number;
  readonly crf: number;
  /** Peak video bitrate, kbit/s (VBV cap on top of CRF). */
  readonly maxrateKbps: number;
  readonly audioKbps: number;
}

export interface AudioProfile {
  readonly kind: "audio";
  readonly kbps: number;
  readonly mono: boolean;
}

export type Profile = VideoProfile | AudioProfile;

/**
 * The quality ladder. Trialled on real prod objects (2026-09-25): a 19 MB 4K
 * status clip → 3.8 MB at `status`, the 52 MB paywall hero → 5.5 MB at `hero`,
 * with no visible difference at phone size.
 */
export const PROFILES: Readonly<Record<ProfileName, Profile>> = {
  // Status clips are SHARED (WhatsApp status re-encodes to ≤ 720p anyway), so
  // they keep 1080p and a higher cap than purely in-app loops.
  status: { kind: "video", maxShort: 1080, maxLong: 1920, crf: 23, maxrateKbps: 3000, audioKbps: 96 },
  // In-app background loops: paywall hero, home banner, horoscope background.
  hero: { kind: "video", maxShort: 720, maxLong: 1280, crf: 24, maxrateKbps: 1500, audioKbps: 96 },
  // Devotional music (aarti). Stays MP3: downloads hard-code audio/mpeg and the
  // allowlist only accepts it, so a codec change would ripple into the app.
  music: { kind: "audio", kbps: 96, mono: false },
  // Spoken word (book chapters).
  speech: { kind: "audio", kbps: 64, mono: true },
};

export interface Target {
  /** The `(module.entity.field)` allowlist triple the column is registered under. */
  readonly field: string;
  readonly table: string;
  readonly column: string;
  readonly profile: ProfileName;
  /** Extensions (lower-case, no dot) re-encoded from this column; anything else is left alone. */
  readonly exts: readonly string[];
  /** Columns on the SAME row describing the object, rewritten with it (e.g. download size). */
  readonly sizeBytesColumn?: string;
  readonly durationMsColumn?: string;
}

/**
 * Every column the backfill re-encodes. Deliberately NOT here:
 *  - wallpapers — already 720p, and `liveWallpaperAssetUrl` is set as the
 *    device wallpaper, where quality is the product;
 *  - mantra audio + ringtones — tiny files; the mantra cost is the repeat
 *    refetch, fixed client-side (TAM-264);
 *  - chat intro video — a constant in code, not a column.
 */
export const TARGETS: readonly Target[] = [
  { field: "status.statusItem.videoUrl", table: "status_items", column: "video_url", profile: "status", exts: ["mp4"] },
  { field: "paywall.paywallHeroMedia.url", table: "paywall_hero_media", column: "url", profile: "hero", exts: ["mp4"] },
  { field: "home.homeBanner.mediaUrl", table: "home_banners", column: "media_url", profile: "hero", exts: ["mp4"] },
  {
    field: "horoscope.mediaAsset.resultBackgroundVideoUrl",
    table: "media_assets",
    column: "result_background_video_url",
    profile: "hero",
    exts: ["mp4"],
  },
  {
    field: "aarti.audioItem.audioStreamUrl",
    table: "audio_items",
    column: "audio_stream_url",
    profile: "music",
    exts: ["mp3"],
    sizeBytesColumn: "size_bytes",
    durationMsColumn: "duration_ms",
  },
  { field: "books.bookChapter.audioUrl", table: "chapter", column: "audio_url", profile: "speech", exts: ["mp3"] },
];

/** What ffprobe told us about a source object. */
export interface Probe {
  readonly durationSec: number;
  /** Container bitrate, bit/s. */
  readonly bitRate: number;
  readonly width?: number;
  readonly height?: number;
  readonly videoCodec?: string;
  readonly hasAudio: boolean;
}

export type Decision = { readonly action: "encode" } | { readonly action: "skip"; readonly reason: string };

/** Headroom before a file counts as over-budget — re-encoding a file 5% over the cap gains nothing. */
const HEADROOM = 1.15;

/**
 * Leave a file alone unless it is over the profile's size or bitrate. A skip is
 * a no-op in every later step: nothing is uploaded, nothing repointed.
 */
export function decide(profile: Profile, probe: Probe): Decision {
  if (!(probe.durationSec > 0)) return { action: "skip", reason: "no duration (unreadable?)" };
  if (profile.kind === "audio") {
    const cap = profile.kbps * 1000 * HEADROOM;
    return probe.bitRate > cap
      ? { action: "encode" }
      : { action: "skip", reason: `${Math.round(probe.bitRate / 1000)} kbps ≤ ${profile.kbps} kbps budget` };
  }
  if (probe.width === undefined || probe.height === undefined) {
    return { action: "skip", reason: "no video stream" };
  }
  const short = Math.min(probe.width, probe.height);
  const tooBig = short > profile.maxShort;
  const budget = (profile.maxrateKbps + profile.audioKbps) * 1000 * HEADROOM;
  const tooFat = probe.bitRate > budget;
  // HEVC is re-encoded even when within budget: H.264 is what every device
  // decodes in hardware, and media_kit's HEVC path is the software fallback.
  const hevc = probe.videoCodec === "hevc";
  if (tooBig || tooFat || hevc) return { action: "encode" };
  return {
    action: "skip",
    reason: `${probe.width}×${probe.height} @ ${Math.round(probe.bitRate / 1000)} kbps within budget`,
  };
}

/** ffmpeg argv (without the binary) turning `input` into `output` under `profile`. */
export function ffmpegArgs(profile: Profile, input: string, output: string, probe: Probe): string[] {
  const common = ["-hide_banner", "-v", "error", "-y", "-i", input, "-map_metadata", "-1"];
  if (profile.kind === "audio") {
    return [
      ...common,
      "-vn",
      "-c:a",
      "libmp3lame",
      "-b:a",
      `${profile.kbps}k`,
      ...(profile.mono ? ["-ac", "1"] : []),
      output,
    ];
  }
  // Fit inside the box by orientation, never upscale, keep dimensions even
  // (yuv420p needs it).
  const portrait = (probe.height ?? 0) >= (probe.width ?? 0);
  const [boxW, boxH] = portrait ? [profile.maxShort, profile.maxLong] : [profile.maxLong, profile.maxShort];
  const scale =
    `scale=w='min(${boxW},iw)':h='min(${boxH},ih)'` + ":force_original_aspect_ratio=decrease:force_divisible_by=2";
  return [
    ...common,
    "-vf",
    scale,
    "-c:v",
    "libx264",
    "-preset",
    "slow",
    "-crf",
    String(profile.crf),
    "-maxrate",
    `${profile.maxrateKbps}k`,
    "-bufsize",
    `${profile.maxrateKbps * 2}k`,
    "-profile:v",
    "high",
    "-pix_fmt",
    "yuv420p",
    ...(probe.hasAudio ? ["-c:a", "aac", "-b:a", `${profile.audioKbps}k`] : ["-an"]),
    // moov atom first: playback can start before the whole file arrives.
    "-movflags",
    "+faststart",
    output,
  ];
}

/**
 * Does a re-encoded file stand in for the original? Same length (±0.5 s — a
 * truncated encode must never replace a full clip), no lost stream, and small
 * enough to be worth a new URL.
 *
 * "Lost its video stream" only applies to VIDEO profiles. An MP3 with embedded
 * cover art probes as having a video stream (an attached picture), and the
 * audio profiles drop it on purpose (`-vn`; the app shows `coverImageUrl`, not
 * embedded art) — found on prod aarti, where it rejected ~40 good encodes.
 */
export function acceptOutput(
  profile: Profile,
  source: Probe,
  sourceBytes: number,
  output: Probe,
  outputBytes: number
): Decision {
  if (Math.abs(output.durationSec - source.durationSec) > 0.5) {
    return { action: "skip", reason: `duration drift ${source.durationSec}s → ${output.durationSec}s` };
  }
  if (profile.kind === "video" && source.width !== undefined && output.width === undefined) {
    return { action: "skip", reason: "output lost its video stream" };
  }
  if (source.hasAudio && !output.hasAudio) return { action: "skip", reason: "output lost its audio stream" };
  if (outputBytes > sourceBytes * 0.8) {
    return { action: "skip", reason: `saves < 20% (${sourceBytes} → ${outputBytes} bytes)` };
  }
  return { action: "encode" };
}

/** `https://cdn/status/status-item/<uuid>.mp4` → `status/status-item/<uuid>.mp4`, or null when not ours. */
export function keyFromUrl(url: string, publicBaseUrl: string): string | null {
  const base = publicBaseUrl.replace(/\/+$/, "") + "/";
  if (!url.startsWith(base)) return null;
  const key = url.slice(base.length);
  return /^[a-z0-9-]+\/[a-z0-9-]+\/[^/]+\.[a-z0-9]+$/.test(key) ? key : null;
}

/**
 * A NEW immutable key beside the old one — same `<module>/<entity>/` prefix,
 * fresh uuid (ADR A3: a replacement is a new key and a new URL, never an
 * overwrite). The output extension equals the input's for every target.
 */
export function mintKey(oldKey: string, uuid: string = randomUUID()): string {
  const slash = oldKey.lastIndexOf("/");
  const ext = oldKey.slice(oldKey.lastIndexOf(".") + 1);
  return `${oldKey.slice(0, slash)}/${uuid}.${ext}`;
}

/**
 * The target whose `<module>/<kebab(entity)>/` prefix the key lives under —
 * the field that OWNS the object, which is what its media_objects ledger row
 * must record even when the URL was found through a copy in another column.
 */
export function ownerOf(key: string): Target | null {
  const kebab = (s: string): string => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
  return (
    TARGETS.find((t) => {
      const [module, entity] = t.field.split(".");
      return key.startsWith(`${module}/${kebab(entity ?? "")}/`);
    }) ?? null
  );
}

export function extOf(key: string): string {
  return key.slice(key.lastIndexOf(".") + 1).toLowerCase();
}

export const CONTENT_TYPE_BY_EXT: Readonly<Record<string, string>> = { mp4: "video/mp4", mp3: "audio/mpeg" };

/** Same header the CMS presign signs (core/media IMMUTABLE_CACHE_CONTROL). */
export const IMMUTABLE_CACHE_CONTROL = "public, max-age=31536000, immutable";

// --- Upload optimizer contract (TAM-267) --------------------------------------
//
// An upload to an optimisable field is PUT to `incoming/<final key>`. An S3
// event runs the optimizer, which writes the FINAL key (compressed, or a copy
// of the original when compression is skipped or fails) — so the CMS only
// ever saves the final URL, and the database never holds a heavy one.

/** Prefix every to-be-optimised upload lands under. Never referenced by a row. */
export const INCOMING_PREFIX = "incoming/";

export function incomingKeyFor(finalKey: string): string {
  return `${INCOMING_PREFIX}${finalKey}`;
}

/** `incoming/status/status-item/x.mp4` → `status/status-item/x.mp4`; null for any other key. */
export function finalKeyFromIncoming(key: string): string | null {
  if (!key.startsWith(INCOMING_PREFIX)) return null;
  const finalKey = key.slice(INCOMING_PREFIX.length);
  return /^[a-z0-9-]+\/[a-z0-9-]+\/[^/]+\.[a-z0-9]+$/.test(finalKey) ? finalKey : null;
}

/**
 * The target an upload for `field` (`module.entity.field`) with extension `ext`
 * is optimised under, or null when it uploads straight to its final key (images,
 * wallpapers, ringtones, mantras, and an image dropped into a banner/hero field
 * that also accepts video).
 */
export function optimizableTarget(field: string, ext: string): Target | null {
  const t = TARGETS.find((x) => x.field === field);
  return t && t.exts.includes(ext.toLowerCase()) ? t : null;
}
