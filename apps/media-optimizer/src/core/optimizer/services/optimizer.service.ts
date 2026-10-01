import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  CONTENT_TYPE_BY_EXT,
  IMMUTABLE_CACHE_CONTROL,
  PROFILES,
  acceptOutput,
  decide,
  extOf,
  ffmpegArgs,
  finalKeyFromIncoming,
  ownerOf,
  type ProfileName,
} from "@prabhuji/media-profiles";
import type { MediaStore, MediaTool, OptimizeOutcome } from "../types";

/**
 * Time kept back from the Lambda deadline for everything AFTER the encode:
 * probing the output, the PUT, and — if any of that fails — the fail-open copy.
 * The encode is killed when its budget runs out, so a clip too long to encode
 * in time still ends up copied instead of timing the invocation out (a timed-out
 * invocation writes nothing, and the editor would wait forever).
 */
export const POST_ENCODE_RESERVE_MS = 60_000;
/** Below this there is no point starting ffmpeg — copy straight away. */
export const MIN_ENCODE_MS = 30_000;

export interface OptimizerServiceOptions {
  /** Scratch root for the source + output files (Lambda: /tmp, ephemeral storage). */
  readonly tmpRoot?: string;
}

/**
 * One upload in, one final object out (TAM-267). The CMS PUTs to
 * `incoming/<final key>`; this writes `<final key>` — compressed when the
 * TAM-265 quality ladder says the file is over budget and the output passes
 * `acceptOutput`, otherwise a byte copy of the original.
 *
 * FAIL-OPEN: every path that has a source ends with the final key existing. A
 * probe error, an ffmpeg crash or timeout, a rejected output or a failed PUT
 * all fall back to the copy; only the copy itself failing is thrown (and the
 * Lambda retries the event). The worst case is today's behaviour — the
 * original, uncompressed.
 *
 * IDEMPOTENT: an existing final key short-circuits to "duplicate" (S3 delivers
 * events at least once), and every write is `If-None-Match: *`, so a race
 * between two deliveries also ends in "duplicate", never an overwrite (ADR A3).
 */
export class OptimizerService {
  private readonly tmpRoot: string;

  constructor(
    private readonly store: MediaStore,
    private readonly tool: MediaTool,
    options: OptimizerServiceOptions = {}
  ) {
    this.tmpRoot = options.tmpRoot ?? tmpdir();
  }

  /** `incomingKey` is the DECODED object key; `deadlineMs` is the epoch ms the invocation ends. */
  async optimize(incomingKey: string, deadlineMs: number): Promise<OptimizeOutcome> {
    const finalKey = finalKeyFromIncoming(incomingKey);
    if (!finalKey) {
      return { finalKey: null, action: "skipped", reason: "not an incoming/<module>/<entity>/<file>.<ext> key" };
    }
    if (await this.store.exists(finalKey)) {
      return { finalKey, action: "duplicate", reason: "final key already exists" };
    }

    const ext = extOf(finalKey);
    const target = ownerOf(finalKey);
    const contentType = CONTENT_TYPE_BY_EXT[ext];
    if (!target || !target.exts.includes(ext) || !contentType) {
      return this.copyOriginal(incomingKey, finalKey, "not an optimisable target");
    }

    const dir = await mkdtemp(join(this.tmpRoot, "media-optimizer-"));
    try {
      const source = join(dir, `source.${ext}`);
      const bytesIn = await this.store.download(incomingKey, source);
      if (bytesIn === null) {
        return { finalKey, action: "skipped", reason: "source object missing" };
      }
      const compressed = await this.tryCompress({
        finalKey,
        source,
        output: join(dir, `output.${ext}`),
        bytesIn,
        profileName: target.profile,
        contentType,
        deadlineMs,
      });
      if (typeof compressed !== "string") return compressed;
      // `return await`, not `return`: the copy must settle before `finally`
      // removes the scratch dir, or its rejection escapes unhandled.
      return await this.copyOriginal(incomingKey, finalKey, compressed, bytesIn);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  /**
   * Probe → decide → encode → verify → PUT. Returns the outcome when the final
   * key was written (or already there), otherwise the REASON to copy the
   * original instead. Never throws: every failure here is a reason to copy.
   */
  private async tryCompress(job: {
    finalKey: string;
    source: string;
    output: string;
    bytesIn: number;
    profileName: ProfileName;
    contentType: string;
    deadlineMs: number;
  }): Promise<OptimizeOutcome | string> {
    const profile = PROFILES[job.profileName];
    try {
      const probe = await this.tool.probe(job.source);
      const decision = decide(profile, probe);
      if (decision.action === "skip") return decision.reason;
      const budgetMs = job.deadlineMs - Date.now() - POST_ENCODE_RESERVE_MS;
      if (budgetMs < MIN_ENCODE_MS) return "no time left to encode";

      await this.tool.encode(ffmpegArgs(profile, job.source, job.output, probe), budgetMs);
      const outProbe = await this.tool.probe(job.output);
      const bytesOut = (await stat(job.output)).size;
      const verdict = acceptOutput(profile, probe, job.bytesIn, outProbe, bytesOut);
      if (verdict.action === "skip") return `output rejected: ${verdict.reason}`;

      const written = await this.store.putFile(job.finalKey, job.output, {
        contentType: job.contentType,
        cacheControl: IMMUTABLE_CACHE_CONTROL,
      });
      return written === "exists"
        ? { finalKey: job.finalKey, action: "duplicate", reason: "final key appeared while encoding" }
        : {
            finalKey: job.finalKey,
            action: "compressed",
            reason: `${profile.kind} re-encoded (${job.profileName})`,
            bytesIn: job.bytesIn,
            bytesOut,
          };
    } catch (err) {
      return `compression failed: ${errorText(err)}`;
    }
  }

  private async copyOriginal(
    incomingKey: string,
    finalKey: string,
    reason: string,
    bytesIn?: number
  ): Promise<OptimizeOutcome> {
    const result = await this.store.copy(incomingKey, finalKey);
    if (result === "source-missing") return { finalKey, action: "skipped", reason: "source object missing" };
    if (result === "exists") return { finalKey, action: "duplicate", reason: "final key already exists" };
    return { finalKey, action: "copied", reason, bytesIn, bytesOut: bytesIn };
  }
}

function errorText(err: unknown): string {
  return (err instanceof Error ? err.message : String(err)).slice(0, 300);
}
