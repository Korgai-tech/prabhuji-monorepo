import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createModuleLogger } from "@api/shared/logs";
import type {
  HeadResult,
  PresignGetParams,
  PresignPutParams,
} from "@api/core/media/types";

const log = createModuleLogger("media:s3-repository");

/**
 * The ONLY place `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` are
 * reached (TAM-84 AC (a)). `MediaService` is SDK-free — it hands this repo a key
 * + pinned headers and gets back a URL, exactly as it hands the ledger repo a
 * row and gets back nothing. Mirrors the `apps/events` precedent of confining
 * the AWS SDK to `repositories/`.
 *
 * Endpoint + credentials come from the standard AWS chain (`AWS_ENDPOINT_URL`,
 * `AWS_REGION`, `AWS_ACCESS_KEY_ID`, …), so locally it signs against the floci-aws
 * S3 emulator and in production against real S3 with the task role — no code
 * change between environments (again, the events-app pattern).
 *
 * #PRESIGN_HOST_TRAP (ADR / #PLAN_UNCERTAINTY): a presigned URL is signed for a
 * specific host. Locally we run `pnpm nx serve api` on the HOST, where
 * `AWS_ENDPOINT_URL=http://localhost:4566` — the same host the browser uses — so
 * the signature is valid for the browser. (In a compose deploy the api reaches
 * floci at `http://floci-aws:4566`, which the browser cannot use; that is
 * TAM-83's coordinated concern, not fixed here.)
 */
export class S3MediaRepository {
  private readonly client: S3Client;

  constructor(private readonly bucket: string) {
    const endpoint = process.env.AWS_ENDPOINT_URL;
    this.client = new S3Client({
      region: process.env.AWS_REGION ?? "ap-south-1",
      // Path-style so the presigned/public URLs are `<host>/<bucket>/<key>` —
      // required by floci and harmless on real S3 (matches MEDIA_PUBLIC_BASE_URL,
      // which is `…/app-local-media` locally).
      forcePathStyle: true,
      ...(endpoint ? { endpoint } : {}),
    });
  }

  /**
   * Mint a presigned PUT with `Content-Type`, `Content-Length` and
   * `Cache-Control` as SIGNED headers (AC (b), (d), (e)). S3 then rejects any
   * PUT whose body length or type differs from what the API asserted at presign
   * time — which is what makes the client-asserted size/type trustworthy.
   *
   * The returned URL is a 5-minute bearer write-capability and is NEVER logged.
   */
  async presignPut(params: PresignPutParams): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: params.key,
      ContentType: params.contentType,
      ContentLength: params.contentLength,
      CacheControl: params.cacheControl,
    });
    return getSignedUrl(this.client, command, {
      expiresIn: params.expiresInSeconds,
      // Pin these into the signature — without this the presigner may hoist
      // them to the query string (unsigned), and S3 would not enforce them.
      signableHeaders: new Set(["content-type", "content-length", "cache-control"]),
    });
  }

  /**
   * Mint a presigned GET for a Pro-only download (TAM-125). Mirrors
   * `presignPut`: same client, same signer, `GetObjectCommand` instead of a
   * PUT. No signable-headers — the client fetches the object as-is, so no
   * header pin is needed (the signature already binds the URL to a specific
   * key + verb + expiry).
   *
   * The returned URL is a short-lived (`PRESIGN_TTL_SECONDS` = 5 minutes)
   * bearer read-capability. Never log it.
   */
  async presignGet(params: PresignGetParams): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: params.key,
    });
    return getSignedUrl(this.client, command, {
      expiresIn: params.expiresInSeconds,
    });
  }

  /**
   * HEAD an object. Returns `{exists:false}` on a 404/NotFound (a normal
   * negative), and re-throws anything else (a real S3 error must NOT be read as
   * "does not exist" — the write-path gate fails closed on it).
   */
  async headObject(key: string): Promise<HeadResult> {
    try {
      const res = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key })
      );
      // S3 wraps ETag in double-quotes on the wire (`"abc123"`); strip them so
      // callers can pattern-match against a bare hex string. AWS SDK deserializes
      // `x-amz-meta-*` headers into `Metadata` with the prefix stripped and keys
      // lowercased — pass it through as-is.
      const rawEtag = res.ETag ?? null;
      const etag = rawEtag !== null ? rawEtag.replace(/^"(.*)"$/, "$1") : null;
      return {
        exists: true,
        contentType: res.ContentType ?? null,
        sizeBytes: res.ContentLength ?? null,
        etag,
        metadata: res.Metadata ?? null,
      };
    } catch (err) {
      if (isNotFound(err)) {
        return { exists: false, contentType: null, sizeBytes: null, etag: null, metadata: null };
      }
      log.warn({ err }, "HEAD object failed (non-404) — surfacing to caller");
      throw err;
    }
  }
}

function isNotFound(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
  return e.name === "NotFound" || e.$metadata?.httpStatusCode === 404;
}
