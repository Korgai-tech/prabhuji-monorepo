import { readFile, writeFile } from "node:fs/promises";
import type { Probe } from "@prabhuji/media-profiles";
import type { MediaStore, MediaTool, WriteResult } from "../types";

export interface StoredObject {
  body: Buffer;
  contentType: string;
  cacheControl: string;
}

/** In-memory bucket with S3's conditional-write semantics. */
export class FakeStore implements MediaStore {
  readonly objects = new Map<string, StoredObject>();
  readonly calls: string[] = [];
  /** Make the next copy() throw (a transient S3 failure). */
  failCopy = false;
  /** Make putFile() see an existing key (another delivery won the race). */
  racePut = false;

  seed(key: string, bytes: number, contentType = "video/mp4"): void {
    this.objects.set(key, {
      body: Buffer.alloc(bytes, 1),
      contentType,
      cacheControl: "public, max-age=31536000, immutable",
    });
  }

  exists(key: string): Promise<boolean> {
    this.calls.push(`exists ${key}`);
    return Promise.resolve(this.objects.has(key));
  }

  async download(key: string, destPath: string): Promise<number | null> {
    this.calls.push(`download ${key}`);
    const o = this.objects.get(key);
    if (!o) return null;
    await writeFile(destPath, o.body);
    return o.body.length;
  }

  async putFile(key: string, path: string, meta: { contentType: string; cacheControl: string }): Promise<WriteResult> {
    this.calls.push(`put ${key}`);
    if (this.racePut || this.objects.has(key)) return "exists";
    this.objects.set(key, { body: await readFile(path), ...meta });
    return "written";
  }

  copy(from: string, to: string): Promise<WriteResult | "source-missing"> {
    this.calls.push(`copy ${from} -> ${to}`);
    if (this.failCopy) return Promise.reject(new Error("S3 503 SlowDown"));
    const o = this.objects.get(from);
    if (!o) return Promise.resolve("source-missing");
    if (this.objects.has(to)) return Promise.resolve("exists");
    this.objects.set(to, { ...o, body: Buffer.from(o.body) });
    return Promise.resolve("written");
  }
}

/**
 * Scripted ffmpeg: `probe` answers by file name (source.* / output.*), and
 * `encode` writes `outputBytes` to the output path (ffmpegArgs' last argv).
 */
export class FakeTool implements MediaTool {
  encodeError: Error | null = null;
  outputBytes = 1000;
  encodeCalls: { args: string[]; timeoutMs: number }[] = [];

  constructor(
    public sourceProbe: Probe,
    public outputProbe: Probe = sourceProbe
  ) {}

  probe(path: string): Promise<Probe> {
    return Promise.resolve(path.includes("/output.") ? this.outputProbe : this.sourceProbe);
  }

  async encode(args: string[], timeoutMs: number): Promise<void> {
    this.encodeCalls.push({ args, timeoutMs });
    if (this.encodeError) throw this.encodeError;
    await writeFile(args[args.length - 1], Buffer.alloc(this.outputBytes, 2));
  }
}

export const HEVC_4K: Probe = {
  durationSec: 12,
  bitRate: 9_200_000,
  width: 2160,
  height: 3840,
  videoCodec: "hevc",
  hasAudio: true,
};

export const SMALL_H264: Probe = {
  durationSec: 12,
  bitRate: 1_200_000,
  width: 720,
  height: 1280,
  videoCodec: "h264",
  hasAudio: true,
};

export const FAT_MP3: Probe = { durationSec: 300, bitRate: 192_000, hasAudio: true };
