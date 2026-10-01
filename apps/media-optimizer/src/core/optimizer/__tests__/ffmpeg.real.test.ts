/**
 * The REAL ffmpeg/ffprobe runner against the real quality ladder — the one
 * test that proves the argv `ffmpegArgs` builds actually encodes and that the
 * output passes `acceptOutput`. Skipped when ffmpeg is not on PATH (the
 * CodeBuild image does not ship it); the layer's own binaries are checked by
 * scripts/build-ffmpeg-layer.sh.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FfmpegTool } from "../repositories/ffmpeg.tool";
import { OptimizerService } from "../services/optimizer.service";
import { FakeStore } from "./fakes";

const hasFfmpeg =
  spawnSync("ffmpeg", ["-version"]).status === 0 && spawnSync("ffprobe", ["-version"]).status === 0;

describe.skipIf(!hasFfmpeg)("FfmpegTool (real ffmpeg on PATH)", () => {
  let dir: string;
  const tool = new FfmpegTool("ffmpeg", "ffprobe");

  /** A `seconds`-long lavfi test pattern + sine tone, encoded as given. */
  function clip(name: string, size: string, videoArgs: string[], seconds = 2): string {
    const out = join(dir, name);
    execFileSync("ffmpeg", [
      "-hide_banner", "-v", "error", "-y",
      "-f", "lavfi", "-i", `testsrc2=size=${size}:rate=30:duration=${seconds}`,
      "-f", "lavfi", "-i", `sine=frequency=440:duration=${seconds}`,
      ...videoArgs,
      "-c:a", "aac", "-b:a", "128k", "-shortest", out,
    ]);
    return out;
  }

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "media-optimizer-real-"));
  });

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("probes a clip", async () => {
    const path = clip("probe.mp4", "360x640", ["-c:v", "libx264", "-preset", "ultrafast"]);
    const probe = await tool.probe(path);
    expect(probe).toMatchObject({ width: 360, height: 640, videoCodec: "h264", hasAudio: true });
    expect(probe.durationSec).toBeGreaterThan(1.9);
  });

  it("compresses an oversized status clip end to end (1440p lossless → 1080p H.264)", async () => {
    // 1440×2560 is over the status profile's 1080 short side, and lossless
    // x264 is far over its bitrate cap — both make `decide` encode.
    const source = clip("big.mp4", "1440x2560", ["-c:v", "libx264", "-preset", "ultrafast", "-qp", "0"]);
    const store = new FakeStore();
    const body = await readFile(source);
    store.objects.set("incoming/status/status-item/real.mp4", {
      body,
      contentType: "video/mp4",
      cacheControl: "public, max-age=31536000, immutable",
    });

    const outcome = await new OptimizerService(store, tool, { tmpRoot: dir }).optimize(
      "incoming/status/status-item/real.mp4",
      Date.now() + 900_000
    );

    expect(outcome).toMatchObject({ action: "compressed", bytesIn: body.length });
    const final = store.objects.get("status/status-item/real.mp4");
    expect(final).toBeDefined();
    expect(final?.body.length).toBeLessThan(body.length * 0.8);
    const outPath = join(dir, "final.mp4");
    await writeFile(outPath, final?.body ?? Buffer.alloc(0));
    expect(await tool.probe(outPath)).toMatchObject({ width: 1080, height: 1920, videoCodec: "h264", hasAudio: true });
  });

  it("kills an encode that overruns its budget", async () => {
    const path = clip("slow.mp4", "360x640", ["-c:v", "libx264", "-preset", "ultrafast"]);
    // `-re` reads the input at native speed, so a 2 s clip takes ≥ 2 s — far over a 300 ms budget.
    await expect(tool.encode(["-v", "error", "-y", "-re", "-i", path, join(dir, "slow-out.mp4")], 300)).rejects.toThrow(
      /ffmpeg killed after 0\.3s/
    );
  });
});
