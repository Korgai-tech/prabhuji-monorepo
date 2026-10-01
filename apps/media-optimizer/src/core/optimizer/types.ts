/**
 * Ports between the optimizer service and its repositories. The service is
 * SDK-free and process-free: it talks to S3 and to ffmpeg only through these,
 * which is what lets the unit tests drive every branch with in-memory fakes.
 */
import type { Probe } from "@prabhuji/media-profiles";

/** Result of a conditional (`If-None-Match: *`) write to a final key. */
export type WriteResult = "written" | "exists";

export interface MediaStore {
  /** Does `key` exist? (HEAD) */
  exists(key: string): Promise<boolean>;
  /** Stream `key` to `destPath`; its byte size, or null when the object is gone. */
  download(key: string, destPath: string): Promise<number | null>;
  /** PUT a local file to `key` — never overwriting (`If-None-Match: *`). */
  putFile(key: string, path: string, meta: { contentType: string; cacheControl: string }): Promise<WriteResult>;
  /**
   * Server-side copy `from` → `to`, preserving Content-Type + Cache-Control,
   * never overwriting. "source-missing" when `from` does not exist.
   */
  copy(from: string, to: string): Promise<WriteResult | "source-missing">;
}

export interface MediaTool {
  probe(path: string): Promise<Probe>;
  /** Run ffmpeg with `args` (argv without the binary); rejects on a non-zero exit or after `timeoutMs`. */
  encode(args: string[], timeoutMs: number): Promise<void>;
}

/**
 * What happened to one upload — the `action` of its log line.
 *  - compressed — a re-encoded file was written to the final key
 *  - copied     — the original was copied to the final key (in budget, not a
 *                 target, or compression failed/was rejected: fail-open)
 *  - duplicate  — the final key already existed (a redelivered S3 event)
 *  - skipped    — nothing written: the key is not an incoming upload, or the
 *                 source object is gone
 */
export type OptimizeAction = "compressed" | "copied" | "duplicate" | "skipped";

export interface OptimizeOutcome {
  readonly finalKey: string | null;
  readonly action: OptimizeAction;
  readonly reason: string;
  readonly bytesIn?: number;
  readonly bytesOut?: number;
}
