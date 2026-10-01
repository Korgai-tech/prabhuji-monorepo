import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createLogger, type LogFields } from "../../../shared/logs/logger";
import { createS3EventHandler, decodeS3Key, type S3Event } from "../handlers/s3-event.handler";
import { OptimizerService } from "../services/optimizer.service";
import { FAT_MP3, FakeStore, FakeTool, HEVC_4K, SMALL_H264 } from "./fakes";

const BUCKET = "app-test-media-123";
const FINAL = "status/status-item/0b1e8a52-6c1f-4e0b-9a51-2f7c3d7c1a11.mp4";
const INCOMING = `incoming/${FINAL}`;
const LOTS_OF_TIME = { getRemainingTimeInMillis: () => 900_000 };

let tmpRoot: string;
let store: FakeStore;
let tool: FakeTool;
let lines: LogFields[];

function handler(t: FakeTool = tool) {
  const service = new OptimizerService(store, t, { tmpRoot });
  return createS3EventHandler({
    service,
    bucket: BUCKET,
    log: createLogger("test", (line) => lines.push(JSON.parse(line) as LogFields)),
  });
}

function event(rawKey: string, overrides: { bucket?: string; eventName?: string } = {}): S3Event {
  return {
    Records: [
      {
        eventName: overrides.eventName ?? "ObjectCreated:Put",
        s3: { bucket: { name: overrides.bucket ?? BUCKET }, object: { key: rawKey } },
      },
    ],
  };
}

beforeEach(async () => {
  tmpRoot = await mkdtemp(join(tmpdir(), "media-optimizer-test-"));
  store = new FakeStore();
  tool = new FakeTool(HEVC_4K, HEVC_4K);
  lines = [];
});

afterEach(async () => {
  // Every path cleans its scratch dir, success or failure.
  expect(await readdir(tmpRoot)).toEqual([]);
  await rm(tmpRoot, { recursive: true, force: true });
});

describe("media-optimizer handler + service", () => {
  it("compresses an over-budget upload and writes the final key with pinned headers", async () => {
    store.seed(INCOMING, 10_000);
    tool.outputBytes = 1_500;

    await handler()(event(INCOMING), LOTS_OF_TIME);

    const final = store.objects.get(FINAL);
    expect(final?.body.length).toBe(1_500);
    expect(final?.contentType).toBe("video/mp4");
    expect(final?.cacheControl).toBe("public, max-age=31536000, immutable");
    expect(tool.encodeCalls).toHaveLength(1);
    // Encode budget = remaining time minus the post-encode reserve.
    expect(tool.encodeCalls[0]?.timeoutMs).toBeGreaterThan(800_000);
    expect(tool.encodeCalls[0]?.timeoutMs).toBeLessThanOrEqual(840_000);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      level: "info",
      finalKey: FINAL,
      incomingKey: INCOMING,
      action: "compressed",
      bytesIn: 10_000,
      bytesOut: 1_500,
    });
    expect(typeof lines[0]?.ms).toBe("number");
  });

  it("compresses a fat aarti mp3 with the music profile", async () => {
    const key = "aarti/audio-item/5d7e.mp3";
    store.seed(`incoming/${key}`, 10_000, "audio/mpeg");
    const mp3 = new FakeTool(FAT_MP3, FAT_MP3);

    await handler(mp3)(event(`incoming/${key}`), LOTS_OF_TIME);

    expect(store.objects.get(key)?.contentType).toBe("audio/mpeg");
    expect(mp3.encodeCalls[0]?.args).toContain("libmp3lame");
    expect(lines[0]).toMatchObject({ action: "compressed", reason: "audio re-encoded (music)" });
  });

  it("copies an in-budget upload byte for byte without running ffmpeg", async () => {
    store.seed(INCOMING, 4_000);
    tool.sourceProbe = SMALL_H264;

    await handler()(event(INCOMING), LOTS_OF_TIME);

    expect(store.objects.get(FINAL)?.body).toEqual(store.objects.get(INCOMING)?.body);
    expect(tool.encodeCalls).toHaveLength(0);
    expect(lines[0]).toMatchObject({ action: "copied", bytesIn: 4_000, bytesOut: 4_000 });
    expect(String(lines[0]?.reason)).toContain("within budget");
  });

  it("fails open to a copy when ffmpeg fails", async () => {
    store.seed(INCOMING, 10_000);
    tool.encodeError = new Error("ffmpeg exit 1: moov atom not found");

    await handler()(event(INCOMING), LOTS_OF_TIME);

    expect(store.objects.get(FINAL)?.body.length).toBe(10_000);
    expect(lines[0]).toMatchObject({ action: "copied" });
    expect(String(lines[0]?.reason)).toBe("compression failed: ffmpeg exit 1: moov atom not found");
  });

  it("fails open to a copy when acceptOutput rejects the encode (saves < 20%)", async () => {
    store.seed(INCOMING, 10_000);
    tool.outputBytes = 9_000;

    await handler()(event(INCOMING), LOTS_OF_TIME);

    expect(store.objects.get(FINAL)?.body.length).toBe(10_000);
    expect(String(lines[0]?.reason)).toMatch(/^output rejected: saves < 20%/);
  });

  it("fails open to a copy when the output drifts in duration", async () => {
    store.seed(INCOMING, 10_000);
    tool.outputProbe = { ...HEVC_4K, durationSec: 6 };

    await handler()(event(INCOMING), LOTS_OF_TIME);

    expect(lines[0]).toMatchObject({ action: "copied" });
    expect(String(lines[0]?.reason)).toMatch(/duration drift/);
  });

  it("copies without encoding when too little time is left", async () => {
    store.seed(INCOMING, 10_000);

    await handler()(event(INCOMING), { getRemainingTimeInMillis: () => 70_000 });

    expect(tool.encodeCalls).toHaveLength(0);
    expect(lines[0]).toMatchObject({ action: "copied", reason: "no time left to encode" });
  });

  it("copies a key no target owns (not optimisable)", async () => {
    const key = "wallpaper/wallpaper-item/abc.mp4";
    store.seed(`incoming/${key}`, 10_000);

    await handler()(event(`incoming/${key}`), LOTS_OF_TIME);

    expect(store.objects.has(key)).toBe(true);
    expect(tool.encodeCalls).toHaveLength(0);
    expect(lines[0]).toMatchObject({ action: "copied", reason: "not an optimisable target" });
  });

  it("is a no-op when the final key already exists (duplicate delivery)", async () => {
    store.seed(INCOMING, 10_000);
    store.seed(FINAL, 1_234);

    await handler()(event(INCOMING), LOTS_OF_TIME);

    expect(store.calls).toEqual([`exists ${FINAL}`]);
    expect(store.objects.get(FINAL)?.body.length).toBe(1_234);
    expect(lines[0]).toMatchObject({ action: "duplicate", finalKey: FINAL });
  });

  it("reports duplicate when another delivery wins the race to the final key", async () => {
    store.seed(INCOMING, 10_000);
    store.racePut = true;

    await handler()(event(INCOMING), LOTS_OF_TIME);

    expect(lines[0]).toMatchObject({ action: "duplicate", reason: "final key appeared while encoding" });
  });

  it("skips (writes nothing) when the source object is gone", async () => {
    await handler()(event(INCOMING), LOTS_OF_TIME);

    expect(store.objects.size).toBe(0);
    expect(lines[0]).toMatchObject({ action: "skipped", reason: "source object missing" });
  });

  it.each([
    ["not under incoming/", FINAL],
    ["missing the entity segment", "incoming/status/x.mp4"],
    ["upper-case module", "incoming/Status/status-item/x.mp4"],
  ])("skips a bad key (%s)", async (_label, key) => {
    store.seed(key, 10_000);

    await handler()(event(key), LOTS_OF_TIME);

    expect(store.calls).toEqual([]);
    expect(lines[0]).toMatchObject({ action: "skipped", finalKey: null });
  });

  it("ignores records from another bucket or a non-create event", async () => {
    store.seed(INCOMING, 10_000);

    await handler()(event(INCOMING, { bucket: "someone-else" }), LOTS_OF_TIME);
    await handler()(event(INCOMING, { eventName: "ObjectRemoved:Delete" }), LOTS_OF_TIME);

    expect(store.calls).toEqual([]);
    expect(lines.map((l) => l.action)).toEqual(["skipped", "skipped"]);
  });

  it("skips an undecodable key instead of throwing", async () => {
    await handler()(event("incoming/status/status-item/%E0%A4%A.mp4"), LOTS_OF_TIME);

    expect(lines[0]).toMatchObject({ level: "warn", action: "skipped", reason: "undecodable object key" });
  });

  it("URL-decodes the event key before deriving the final key", async () => {
    const decodedFinal = "status/status-item/my clip+v2.mp4";
    store.seed(`incoming/${decodedFinal}`, 4_000);
    tool.sourceProbe = SMALL_H264;

    await handler()(event("incoming/status/status-item/my+clip%2Bv2.mp4"), LOTS_OF_TIME);

    expect(store.objects.has(decodedFinal)).toBe(true);
    expect(lines[0]).toMatchObject({ action: "copied", finalKey: decodedFinal });
  });

  it("logs `failed` and throws (so Lambda retries) when even the copy fails", async () => {
    store.seed(INCOMING, 4_000);
    tool.sourceProbe = SMALL_H264;
    store.failCopy = true;

    await expect(handler()(event(INCOMING), LOTS_OF_TIME)).rejects.toThrow(/1 record\(s\) failed/);
    expect(lines[0]).toMatchObject({ level: "error", action: "failed", reason: "S3 503 SlowDown" });
  });
});

describe("decodeS3Key", () => {
  it.each([
    ["incoming/status/status-item/a.mp4", "incoming/status/status-item/a.mp4"],
    ["incoming/a+b.mp4", "incoming/a b.mp4"],
    ["incoming/a%2Bb.mp4", "incoming/a+b.mp4"],
    ["incoming/%E0%A4%86.mp3", "incoming/आ.mp3"],
    ["incoming/100%25.mp4", "incoming/100%.mp4"],
  ])("%s → %s", (raw, decoded) => {
    expect(decodeS3Key(raw)).toBe(decoded);
  });
});
