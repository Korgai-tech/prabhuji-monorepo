import type { Logger } from "../../../shared/logs/logger";
import type { OptimizerService } from "../services/optimizer.service";

/** The slice of an S3 event notification this handler reads. */
export interface S3EventRecord {
  readonly eventName?: string;
  readonly s3?: {
    readonly bucket?: { readonly name?: string };
    readonly object?: { readonly key?: string; readonly size?: number };
  };
}

export interface S3Event {
  readonly Records?: readonly S3EventRecord[];
}

/** The slice of the Lambda context this handler reads. */
export interface LambdaContext {
  getRemainingTimeInMillis(): number;
}

/**
 * Object keys in S3 event notifications are URL-encoded the way HTML forms
 * are: a space arrives as `+` and everything else as `%XX` (so a literal `+`
 * arrives as `%2B`). Order matters — `+` first, then percent-decode.
 */
export function decodeS3Key(raw: string): string {
  return decodeURIComponent(raw.replace(/\+/g, " "));
}

export interface HandlerDeps {
  readonly service: OptimizerService;
  /** The media bucket; records from any other bucket are ignored. */
  readonly bucket: string;
  readonly log: Logger;
}

/**
 * S3 `ObjectCreated:*` on `incoming/` → one optimize per record, one structured
 * log line per record. Records are processed one at a time: each can use most
 * of the function's CPU and /tmp, and S3 sends one record per event in practice.
 *
 * A record whose service call THROWS (only the fail-open copy itself failing —
 * everything else is handled inside the service) is logged as `failed`, and the
 * invocation then throws so Lambda's async retry re-runs it; records that
 * already finished are `duplicate` no-ops on the retry.
 */
export function createS3EventHandler(deps: HandlerDeps) {
  return async (event: S3Event, context: LambdaContext): Promise<void> => {
    const deadlineMs = Date.now() + context.getRemainingTimeInMillis();
    const failures: string[] = [];

    for (const record of event.Records ?? []) {
      const started = Date.now();
      const rawKey = record.s3?.object?.key ?? "";
      if (!record.eventName?.startsWith("ObjectCreated:") || record.s3?.bucket?.name !== deps.bucket) {
        deps.log.info({
          action: "skipped",
          reason: `ignored event ${record.eventName ?? "?"} on bucket ${record.s3?.bucket?.name ?? "?"}`,
          rawKey,
          ms: 0,
        });
        continue;
      }

      let incomingKey: string;
      try {
        incomingKey = decodeS3Key(rawKey);
      } catch {
        deps.log.warn({ action: "skipped", reason: "undecodable object key", rawKey, ms: 0 });
        continue;
      }

      try {
        const outcome = await deps.service.optimize(incomingKey, deadlineMs);
        deps.log.info({ incomingKey, ...outcome, ms: Date.now() - started });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        failures.push(`${incomingKey}: ${message}`);
        deps.log.error({ incomingKey, action: "failed", reason: message, ms: Date.now() - started });
      }
    }

    if (failures.length > 0) {
      throw new Error(`media-optimizer: ${failures.length} record(s) failed — ${failures.join("; ")}`);
    }
  };
}
