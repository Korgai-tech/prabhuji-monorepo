import { describe, expect, it } from "vitest";
import {
  PROFILES,
  acceptOutput,
  finalKeyFromIncoming,
  incomingKeyFor,
  optimizableTarget,
  decide,
  ffmpegArgs,
  keyFromUrl,
  mintKey,
  ownerOf,
  type Probe,
} from "../index.js";

// Real prod shapes, ffprobed 2026-09-25.
const status4k: Probe = { durationSec: 10, bitRate: 15_224_606, width: 2160, height: 3840, videoCodec: "h264", hasAudio: true };
const heroHevc: Probe = { durationSec: 45.1, bitRate: 9_226_820, width: 1080, height: 1920, videoCodec: "hevc", hasAudio: true };
const aarti192: Probe = { durationSec: 745, bitRate: 192_015, hasAudio: true };

describe("decide", () => {
  it("re-encodes a 4K status clip", () => {
    expect(decide(PROFILES.status, status4k)).toEqual({ action: "encode" });
  });

  it("re-encodes HEVC even when it would fit the box", () => {
    expect(decide(PROFILES.status, { ...heroHevc, bitRate: 2_000_000 })).toEqual({ action: "encode" });
  });

  it("leaves an in-budget 1080p H.264 clip alone", () => {
    const d = decide(PROFILES.status, { ...status4k, width: 1080, height: 1920, bitRate: 2_800_000 });
    expect(d.action).toBe("skip");
  });

  it("re-encodes a 1080p clip that is over the bitrate cap", () => {
    expect(decide(PROFILES.status, { ...status4k, width: 1080, height: 1920, bitRate: 8_000_000 })).toEqual({
      action: "encode",
    });
  });

  it("applies the hero box to landscape sources by their short side", () => {
    expect(decide(PROFILES.hero, { ...status4k, width: 1920, height: 1080, bitRate: 1_000_000 }).action).toBe(
      "encode"
    );
    expect(decide(PROFILES.hero, { ...status4k, width: 1280, height: 720, bitRate: 1_000_000 }).action).toBe(
      "skip"
    );
  });

  it("re-encodes 192 kbps music, leaves 96 kbps alone", () => {
    expect(decide(PROFILES.music, aarti192)).toEqual({ action: "encode" });
    expect(decide(PROFILES.music, { ...aarti192, bitRate: 96_000 }).action).toBe("skip");
  });

  it("skips an unreadable file rather than guessing", () => {
    expect(decide(PROFILES.music, { ...aarti192, durationSec: 0 }).action).toBe("skip");
    expect(decide(PROFILES.status, { ...status4k, width: undefined, height: undefined }).action).toBe("skip");
  });
});

describe("ffmpegArgs", () => {
  it("fits portrait video in the box without upscaling, H.264 + faststart", () => {
    const args = ffmpegArgs(PROFILES.status, "in.mp4", "out.mp4", status4k);
    const vf = args[args.indexOf("-vf") + 1];
    expect(vf).toContain("w='min(1080,iw)'");
    expect(vf).toContain("h='min(1920,ih)'");
    expect(vf).toContain("force_original_aspect_ratio=decrease");
    expect(args).toEqual(expect.arrayContaining(["libx264", "-maxrate", "3000k", "-bufsize", "6000k", "+faststart"]));
    expect(args.at(-1)).toBe("out.mp4");
  });

  it("swaps the box for landscape sources", () => {
    const args = ffmpegArgs(PROFILES.hero, "in.mp4", "out.mp4", { ...status4k, width: 3840, height: 2160 });
    expect(args[args.indexOf("-vf") + 1]).toContain("w='min(1280,iw)'");
  });

  it("drops the audio track only when the source has none", () => {
    expect(ffmpegArgs(PROFILES.hero, "i", "o", { ...status4k, hasAudio: false })).toContain("-an");
    expect(ffmpegArgs(PROFILES.hero, "i", "o", status4k)).toEqual(expect.arrayContaining(["-c:a", "aac", "-b:a", "96k"]));
  });

  it("keeps audio as MP3 at the profile bitrate, mono for speech", () => {
    expect(ffmpegArgs(PROFILES.music, "i", "o", aarti192)).toEqual(
      expect.arrayContaining(["libmp3lame", "-b:a", "96k"])
    );
    expect(ffmpegArgs(PROFILES.music, "i", "o", aarti192)).not.toContain("-ac");
    expect(ffmpegArgs(PROFILES.speech, "i", "o", aarti192)).toEqual(expect.arrayContaining(["-ac", "1"]));
  });
});

describe("acceptOutput", () => {
  const out: Probe = { ...status4k, width: 1080, height: 1920, bitRate: 3_000_000 };

  it("accepts a same-length, much smaller file", () => {
    expect(acceptOutput(PROFILES.status, status4k, 19_000_000, out, 3_800_000)).toEqual({ action: "encode" });
  });

  it("rejects a truncated encode", () => {
    expect(acceptOutput(PROFILES.status, status4k, 19_000_000, { ...out, durationSec: 8 }, 3_000_000).action).toBe("skip");
  });

  it("rejects an output that lost a stream", () => {
    expect(acceptOutput(PROFILES.status, status4k, 19_000_000, { ...out, hasAudio: false }, 3_000_000).action).toBe("skip");
    expect(acceptOutput(PROFILES.status, status4k, 19_000_000, { ...out, width: undefined }, 3_000_000).action).toBe("skip");
  });

  it("lets an audio profile drop embedded cover art", () => {
    const mp3WithArt: Probe = { durationSec: 745, bitRate: 192_000, width: 600, height: 600, videoCodec: "mjpeg", hasAudio: true };
    const out: Probe = { durationSec: 745, bitRate: 96_000, hasAudio: true };
    expect(acceptOutput(PROFILES.music, mp3WithArt, 18_000_000, out, 9_000_000)).toEqual({ action: "encode" });
    expect(acceptOutput(PROFILES.status, mp3WithArt, 18_000_000, out, 9_000_000).action).toBe("skip");
  });

  it("rejects a saving under 20%", () => {
    expect(acceptOutput(PROFILES.status, status4k, 4_000_000, out, 3_500_000).action).toBe("skip");
  });
});

describe("keys", () => {
  const base = "https://d2s7271a7luizw.cloudfront.net";

  it("extracts our key from a CDN URL", () => {
    expect(keyFromUrl(`${base}/status/status-item/ab12.mp4`, base)).toBe("status/status-item/ab12.mp4");
    expect(keyFromUrl(`${base}/status/status-item/ab12.mp4`, `${base}/`)).toBe("status/status-item/ab12.mp4");
  });

  it("refuses URLs that are not ours or not a media key", () => {
    expect(keyFromUrl("https://picsum.photos/200/300.jpg", base)).toBeNull();
    expect(keyFromUrl(`${base}/status/status-item/ab12.mp4?x=1`, base)).toBeNull();
    expect(keyFromUrl(`${base}/tutorial.mp4`, base)).toBeNull();
  });

  it("mints a fresh key beside the old one, same extension", () => {
    expect(mintKey("status/status-item/ab12.mp4", "00000000-0000-4000-8000-000000000001")).toBe(
      "status/status-item/00000000-0000-4000-8000-000000000001.mp4"
    );
    expect(mintKey("aarti/audio-item/x.mp3")).toMatch(/^aarti\/audio-item\/[0-9a-f-]{36}\.mp3$/);
  });
});

describe("ownerOf", () => {
  it("maps a key to the field owning its prefix, not the column that referenced it", () => {
    expect(ownerOf("paywall/paywall-hero-media/x.mp4")?.field).toBe("paywall.paywallHeroMedia.url");
    expect(ownerOf("status/status-item/x.mp4")?.field).toBe("status.statusItem.videoUrl");
    expect(ownerOf("horoscope/media-asset/x.mp4")?.field).toBe("horoscope.mediaAsset.resultBackgroundVideoUrl");
    expect(ownerOf("books/book-chapter/x.mp3")?.field).toBe("books.bookChapter.audioUrl");
    expect(ownerOf("wallpaper/wallpaper/x.mp4")).toBeNull();
  });
});

describe("upload optimizer contract", () => {
  it("round-trips a final key through the incoming prefix", () => {
    const k = "status/status-item/ab12.mp4";
    expect(incomingKeyFor(k)).toBe("incoming/status/status-item/ab12.mp4");
    expect(finalKeyFromIncoming(incomingKeyFor(k))).toBe(k);
  });

  it("rejects keys outside incoming/ or with a bad shape", () => {
    expect(finalKeyFromIncoming("status/status-item/ab12.mp4")).toBeNull();
    expect(finalKeyFromIncoming("incoming/../etc/passwd")).toBeNull();
    expect(finalKeyFromIncoming("incoming/tutorial.mp4")).toBeNull();
  });

  it("optimises video/audio fields by extension only", () => {
    expect(optimizableTarget("status.statusItem.videoUrl", "mp4")?.profile).toBe("status");
    expect(optimizableTarget("aarti.audioItem.audioStreamUrl", "MP3")?.profile).toBe("music");
    // A banner/hero field also accepts images — those upload directly.
    expect(optimizableTarget("home.homeBanner.mediaUrl", "webp")).toBeNull();
    expect(optimizableTarget("paywall.paywallHeroMedia.url", "mp4")?.profile).toBe("hero");
    expect(optimizableTarget("wallpaper.wallpaper.previewVideoUrl", "mp4")).toBeNull();
  });
});
