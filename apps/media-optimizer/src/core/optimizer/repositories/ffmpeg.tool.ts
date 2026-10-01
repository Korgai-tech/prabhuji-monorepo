import { execFile } from "node:child_process";
import type { Probe } from "@prabhuji/media-profiles";
import type { MediaTool } from "../types";

const PROBE_TIMEOUT_MS = 60_000;

/**
 * ffmpeg + ffprobe as child processes. On Lambda the binaries come from the
 * ffmpeg layer (`/opt/bin`, built by scripts/build-ffmpeg-layer.sh); locally
 * pass `ffmpeg` / `ffprobe` to resolve them from PATH. Same ffprobe query and
 * parse as the TAM-265 backfill (apps/api/scripts/media-reencode/main.ts), so
 * the backfill and the optimizer make identical decisions on identical files.
 */
export class FfmpegTool implements MediaTool {
  constructor(
    private readonly ffmpegPath: string,
    private readonly ffprobePath: string
  ) {}

  async probe(path: string): Promise<Probe> {
    const stdout = await run(
      this.ffprobePath,
      ["-v", "error", "-show_entries", "format=duration,bit_rate:stream=codec_type,codec_name,width,height", "-of", "json", path],
      PROBE_TIMEOUT_MS
    );
    return parseProbe(stdout);
  }

  async encode(args: string[], timeoutMs: number): Promise<void> {
    await run(this.ffmpegPath, args, timeoutMs);
  }
}

export function parseProbe(stdout: string): Probe {
  const j = JSON.parse(stdout) as {
    format?: { duration?: string; bit_rate?: string };
    streams?: { codec_type?: string; codec_name?: string; width?: number; height?: number }[];
  };
  const video = j.streams?.find((s) => s.codec_type === "video" && (s.width ?? 0) > 0);
  return {
    durationSec: Number(j.format?.duration ?? 0),
    bitRate: Number(j.format?.bit_rate ?? 0),
    width: video?.width,
    height: video?.height,
    videoCodec: video?.codec_name,
    hasAudio: Boolean(j.streams?.some((s) => s.codec_type === "audio")),
  };
}

/** Run `bin args…`; resolve stdout, reject with the exit reason + stderr tail. */
function run(bin: string, args: string[], timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      bin,
      args,
      { timeout: timeoutMs, killSignal: "SIGKILL", maxBuffer: 16 << 20, encoding: "utf8" },
      (err, stdout, stderr) => {
        if (!err) {
          resolve(stdout);
          return;
        }
        const e = err as Error & { killed?: boolean; code?: number | string };
        const why = e.killed ? `killed after ${(timeoutMs / 1000).toFixed(1)}s` : `exit ${String(e.code ?? "?")}`;
        const tail = stderr.trim().slice(-300);
        reject(new Error(`${bin.split("/").pop() ?? bin} ${why}${tail ? `: ${tail}` : ""}`));
      }
    );
  });
}
